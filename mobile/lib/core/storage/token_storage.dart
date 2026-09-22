import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Persists JWT tokens. The refresh token (long-lived) is kept in the platform
/// keystore/keychain; the access token is cached in memory and mirrored to
/// secure storage so a warm start can attempt an authenticated call immediately.
class TokenStorage {
  TokenStorage([FlutterSecureStorage? storage])
    : _storage =
          storage ??
          const FlutterSecureStorage(
            aOptions: AndroidOptions(encryptedSharedPreferences: true),
          );

  static const _kAccess = 'ip_access_token';
  static const _kRefresh = 'ip_refresh_token';

  final FlutterSecureStorage _storage;
  String? _accessCache;

  Future<String?> get accessToken async =>
      _accessCache ??= await _storage.read(key: _kAccess);

  Future<String?> get refreshToken => _storage.read(key: _kRefresh);

  Future<void> saveAccessToken(String token) async {
    _accessCache = token;
    await _storage.write(key: _kAccess, value: token);
  }

  Future<void> saveTokens({
    required String accessToken,
    required String refreshToken,
  }) async {
    _accessCache = accessToken;
    await _storage.write(key: _kAccess, value: accessToken);
    await _storage.write(key: _kRefresh, value: refreshToken);
  }

  Future<void> clear() async {
    _accessCache = null;
    await _storage.delete(key: _kAccess);
    await _storage.delete(key: _kRefresh);
  }
}
