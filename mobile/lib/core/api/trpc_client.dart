import 'dart:convert';

import 'package:dio/dio.dart';

import '../../config/env.dart';
import '../storage/token_storage.dart';
import 'api_exception.dart';

/// Thin client for the platform's tRPC HTTP endpoint.
///
/// Wire format (superjson transformer, non-batched):
///   * Query    -> `GET  /trpc/<proc>?input={"json": <input>}`
///   * Mutation -> `POST /trpc/<proc>`  body: `{"json": <input>}`
///   * Success  -> `{ "result": { "data": { "json": <value> } } }`
///
/// Auth: a valid access token is sent both as an `Authorization: Bearer`
/// header (for `protectedProcedure`s that read `ctx.user`) and injected into
/// the request body as `authToken` (for `baseProcedure`s that validate the
/// token from their input). On a 401 the client transparently refreshes the
/// access token using the stored refresh token and retries once.
class TrpcClient {
  TrpcClient(this._storage, {Dio? dio})
    : _dio =
          dio ??
          Dio(
            BaseOptions(
              baseUrl: Env.trpcBaseUrl,
              connectTimeout: const Duration(seconds: 20),
              receiveTimeout: const Duration(seconds: 30),
              headers: {'Content-Type': 'application/json'},
              // We inspect status codes ourselves rather than throwing on 4xx.
              validateStatus: (status) => status != null && status < 500,
            ),
          );

  final Dio _dio;
  final TokenStorage _storage;

  /// Invoked when the session can no longer be refreshed (forces sign-out).
  Future<void> Function()? onSessionExpired;

  Future<dynamic> query(
    String procedure, {
    Map<String, dynamic>? input,
    bool authenticated = true,
  }) => _send(procedure, input, isQuery: true, authenticated: authenticated);

  Future<dynamic> mutation(
    String procedure, {
    Map<String, dynamic>? input,
    bool authenticated = true,
  }) => _send(procedure, input, isQuery: false, authenticated: authenticated);

  Future<dynamic> _send(
    String procedure,
    Map<String, dynamic>? input, {
    required bool isQuery,
    required bool authenticated,
    bool allowRetry = true,
  }) async {
    final token = authenticated ? await _storage.accessToken : null;
    final body = <String, dynamic>{...?input};
    final headers = <String, dynamic>{};
    if (token != null) {
      headers['Authorization'] = 'Bearer $token';
      body['authToken'] = token;
    }

    try {
      final Response response;
      if (isQuery) {
        response = await _dio.get(
          '/$procedure',
          queryParameters: {
            'input': jsonEncode({'json': body}),
          },
          options: Options(headers: headers),
        );
      } else {
        response = await _dio.post(
          '/$procedure',
          data: {'json': body},
          options: Options(headers: headers),
        );
      }

      final status = response.statusCode ?? 0;
      if (status == 401 && authenticated && allowRetry) {
        if (await _refresh()) {
          return _send(
            procedure,
            input,
            isQuery: isQuery,
            authenticated: authenticated,
            allowRetry: false,
          );
        }
        await _storage.clear();
        await onSessionExpired?.call();
        throw ApiException('Your session has expired. Please sign in again.',
            status: 401, code: 'UNAUTHORIZED');
      }

      if (status >= 400) {
        throw _errorFromBody(response);
      }

      return _unwrap(response.data);
    } on DioException catch (e) {
      throw ApiException.fromDio(e);
    }
  }

  dynamic _unwrap(dynamic body) {
    if (body is Map && body['result'] is Map) {
      final result = body['result'] as Map;
      if (result['data'] is Map) {
        return (result['data'] as Map)['json'];
      }
    }
    return null;
  }

  ApiException _errorFromBody(Response response) {
    final data = response.data;
    String message = 'Request failed. Please try again.';
    String? code;
    if (data is Map && data['error'] is Map) {
      final envelope = (data['error'] as Map)['json'] ?? data['error'];
      if (envelope is Map) {
        message = (envelope['message'] ?? message).toString();
        final inner = envelope['data'];
        if (inner is Map && inner['code'] != null) {
          code = inner['code'].toString();
        }
      }
    }
    return ApiException(message, status: response.statusCode, code: code);
  }

  Future<bool> _refresh() async {
    final refreshToken = await _storage.refreshToken;
    if (refreshToken == null) return false;
    try {
      final response = await _dio.post(
        '/refreshToken',
        data: {
          'json': {'refreshToken': refreshToken},
        },
      );
      if ((response.statusCode ?? 0) >= 400) return false;
      final data = _unwrap(response.data);
      if (data is! Map || data['accessToken'] == null) return false;
      final newAccess = data['accessToken'] as String;
      if (data['refreshToken'] != null) {
        await _storage.saveTokens(
          accessToken: newAccess,
          refreshToken: data['refreshToken'] as String,
        );
      } else {
        await _storage.saveAccessToken(newAccess);
      }
      return true;
    } on DioException {
      return false;
    }
  }
}
