import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/providers.dart';
import '../../../core/storage/token_storage.dart';
import '../domain/app_user.dart';

class AuthRepository {
  AuthRepository(this._client, this._storage);

  final TrpcClient _client;
  final TokenStorage _storage;

  Future<AppUser> login({
    required String email,
    required String password,
  }) async {
    final data = await _client.mutation(
      'login',
      input: {'email': email, 'password': password},
      authenticated: false,
    );
    await _persistTokens(data);
    return AppUser.fromJson(Map<String, dynamic>.from(data['user'] as Map));
  }

  Future<AppUser> register({
    required String name,
    required String email,
    required String password,
    String? phone,
  }) async {
    final data = await _client.mutation(
      'register',
      input: {
        'name': name,
        'email': email,
        'password': password,
        'role': 'INVESTOR',
        if (phone != null && phone.isNotEmpty) 'phone': phone,
      },
      authenticated: false,
    );
    await _persistTokens(data);
    return AppUser.fromJson(Map<String, dynamic>.from(data['user'] as Map));
  }

  /// Validates the current session and returns the signed-in user, or null if
  /// there is no usable session.
  Future<AppUser?> restoreSession() async {
    final refreshToken = await _storage.refreshToken;
    if (refreshToken == null) return null;
    try {
      final data = await _client.query('getMe');
      if (data is Map) {
        return AppUser.fromJson(Map<String, dynamic>.from(data));
      }
      return null;
    } catch (_) {
      await _storage.clear();
      return null;
    }
  }

  Future<void> logout() async {
    try {
      await _client.mutation('logout');
    } catch (_) {
      // Even if the server call fails, clear local tokens below.
    } finally {
      await _storage.clear();
    }
  }

  Future<void> requestPasswordReset(String email) async {
    await _client.mutation(
      'requestPasswordReset',
      input: {'email': email},
      authenticated: false,
    );
  }

  Future<void> resetPassword({
    required String token,
    required String newPassword,
  }) async {
    await _client.mutation(
      'resetPassword',
      input: {'token': token, 'newPassword': newPassword},
      authenticated: false,
    );
  }

  Future<AppUser> updateProfile({
    required String name,
    String? phoneNumber,
  }) async {
    final data = await _client.mutation(
      'updateProfile',
      input: {
        'name': name,
        if (phoneNumber != null) 'phoneNumber': phoneNumber,
      },
    );
    return AppUser.fromJson(Map<String, dynamic>.from(data as Map));
  }

  Future<void> _persistTokens(dynamic data) async {
    await _storage.saveTokens(
      accessToken: data['accessToken'] as String,
      refreshToken: data['refreshToken'] as String,
    );
  }
}

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(
    ref.watch(trpcClientProvider),
    ref.watch(tokenStorageProvider),
  );
});
