import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/providers.dart';
import '../data/auth_repository.dart';
import '../domain/app_user.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthState {
  const AuthState({required this.status, this.user});

  const AuthState.unknown() : this(status: AuthStatus.unknown);

  final AuthStatus status;
  final AppUser? user;

  bool get isAuthenticated => status == AuthStatus.authenticated;
  bool get isResolved => status != AuthStatus.unknown;

  AuthState copyWith({AuthStatus? status, AppUser? user}) =>
      AuthState(status: status ?? this.status, user: user ?? this.user);
}

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._ref) : super(const AuthState.unknown()) {
    // Force a full sign-out if the client can no longer refresh the session.
    _ref.read(trpcClientProvider).onSessionExpired = () async {
      state = const AuthState(status: AuthStatus.unauthenticated);
    };
    _bootstrap();
  }

  final Ref _ref;

  AuthRepository get _repo => _ref.read(authRepositoryProvider);

  Future<void> _bootstrap() async {
    final user = await _repo.restoreSession();
    state = user == null
        ? const AuthState(status: AuthStatus.unauthenticated)
        : AuthState(status: AuthStatus.authenticated, user: user);
  }

  Future<void> login({required String email, required String password}) async {
    final user = await _repo.login(email: email, password: password);
    state = AuthState(status: AuthStatus.authenticated, user: user);
  }

  Future<void> register({
    required String name,
    required String email,
    required String password,
    String? phone,
  }) async {
    final user = await _repo.register(
      name: name,
      email: email,
      password: password,
      phone: phone,
    );
    state = AuthState(status: AuthStatus.authenticated, user: user);
  }

  Future<void> logout() async {
    await _repo.logout();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  Future<void> updateProfile({
    required String name,
    String? phoneNumber,
  }) async {
    final user = await _repo.updateProfile(name: name, phoneNumber: phoneNumber);
    state = state.copyWith(user: user);
  }
}

final authControllerProvider =
    StateNotifierProvider<AuthController, AuthState>((ref) {
      return AuthController(ref);
    });
