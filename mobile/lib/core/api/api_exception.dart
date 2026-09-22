import 'package:dio/dio.dart';

/// Normalised error thrown by [TrpcClient] so the UI can show a friendly
/// message and (optionally) branch on the tRPC error code / HTTP status.
class ApiException implements Exception {
  ApiException(this.message, {this.status, this.code});

  final String message;
  final int? status;
  final String? code;

  bool get isUnauthorized => status == 401 || code == 'UNAUTHORIZED';

  factory ApiException.fromDio(DioException e) {
    // Network-level failures (no response).
    switch (e.type) {
      case DioExceptionType.connectionError:
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return ApiException(
          'Could not reach the server. Check your internet connection and try again.',
        );
      default:
        break;
    }

    final data = e.response?.data;
    String message = 'Something went wrong. Please try again.';
    String? code;

    // tRPC error envelope: { "error": { "json": { message, code, data: {...} } } }
    if (data is Map) {
      final error = data['error'];
      final envelope = error is Map ? (error['json'] ?? error) : null;
      if (envelope is Map) {
        message = (envelope['message'] ?? message).toString();
        final inner = envelope['data'];
        if (inner is Map && inner['code'] != null) {
          code = inner['code'].toString();
        }
      }
    }

    return ApiException(message, status: e.response?.statusCode, code: code);
  }

  @override
  String toString() => message;
}
