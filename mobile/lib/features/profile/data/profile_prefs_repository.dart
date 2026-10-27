import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/format.dart';
import '../../../core/providers.dart';

/// The investor's AI weekly-digest email/notification preference.
class AiDigestPrefs {
  const AiDigestPrefs({required this.optedOut, required this.lastSentAt});

  final bool optedOut;
  final DateTime? lastSentAt;

  factory AiDigestPrefs.fromJson(Map<String, dynamic> json) => AiDigestPrefs(
    optedOut: json['optedOut'] == true,
    lastSentAt: asDate(json['lastSentAt']),
  );
}

class ProfilePrefsRepository {
  ProfilePrefsRepository(this._client);

  final TrpcClient _client;

  Future<AiDigestPrefs> aiDigestPrefs() async {
    final data = await _client.query('getAiDigestPrefs');
    return AiDigestPrefs.fromJson(
      data is Map ? Map<String, dynamic>.from(data) : const {},
    );
  }

  Future<void> setAiDigestOptOut(bool optOut) async {
    await _client.mutation('setAiDigestOptOut', input: {'optOut': optOut});
  }
}

final profilePrefsRepositoryProvider = Provider<ProfilePrefsRepository>((ref) {
  return ProfilePrefsRepository(ref.watch(trpcClientProvider));
});

final aiDigestPrefsProvider = FutureProvider.autoDispose<AiDigestPrefs>((
  ref,
) async {
  return ref.watch(profilePrefsRepositoryProvider).aiDigestPrefs();
});
