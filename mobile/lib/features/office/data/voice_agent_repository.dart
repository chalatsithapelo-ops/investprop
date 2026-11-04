import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/providers.dart';
import '../../auth/application/auth_controller.dart';

/// A short-lived realtime voice session: a LiveKit room token plus the URL of
/// the LiveKit server. The server also dispatches the office agent worker into
/// the same room with the member's own JWT (privately), so the agent can act on
/// their behalf through the authenticated action bridge.
class VoiceAgentSession {
  const VoiceAgentSession({
    required this.url,
    required this.token,
    required this.roomName,
    required this.identity,
    required this.expiresInSeconds,
  });

  final String url;
  final String token;
  final String roomName;
  final String identity;
  final int expiresInSeconds;

  factory VoiceAgentSession.fromJson(Map<String, dynamic> json) =>
      VoiceAgentSession(
        url: json['url'] as String,
        token: json['token'] as String,
        roomName: json['roomName'] as String,
        identity: json['identity'] as String,
        expiresInSeconds: (json['expiresInSeconds'] as num).toInt(),
      );
}

class VoiceAgentRepository {
  VoiceAgentRepository(this._client);
  final TrpcClient _client;

  /// Whether the realtime voice agent is configured + permitted for this user.
  Future<bool> available() async {
    final data = await _client.query('officeVoiceAgentStatus');
    return data is Map && data['available'] == true;
  }

  /// Start a session: mint a room token and dispatch the office agent.
  Future<VoiceAgentSession> startSession() async {
    final data = await _client.mutation('officeVoiceAgentSession');
    return VoiceAgentSession.fromJson(Map<String, dynamic>.from(data as Map));
  }
}

final voiceAgentRepositoryProvider =
    Provider.autoDispose<VoiceAgentRepository>((ref) {
  ref.watch(authControllerProvider.select((state) => state.user?.id));
  return VoiceAgentRepository(ref.watch(trpcClientProvider));
});

/// Lazily reports whether the floating voice button should be shown.
final voiceAgentAvailableProvider = FutureProvider.autoDispose<bool>((ref) async {
  final auth = ref.watch(authControllerProvider);
  if (auth.status != AuthStatus.authenticated) return false;
  try {
    return await ref.watch(voiceAgentRepositoryProvider).available();
  } catch (_) {
    return false;
  }
});
