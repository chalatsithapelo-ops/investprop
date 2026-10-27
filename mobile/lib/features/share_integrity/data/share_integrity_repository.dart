import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/providers.dart';
import '../domain/share_integrity_models.dart';

class ShareIntegrityRepository {
  ShareIntegrityRepository(this._client);

  final TrpcClient _client;

  Future<ShareProvenance> myProvenance() async {
    final data = await _client.query('getShareProvenance', input: {});
    return ShareProvenance.fromJson(
      data is Map ? Map<String, dynamic>.from(data) : const {},
    );
  }

  Future<ShareAudit> conservationAudit() async {
    final data = await _client.query('auditShareConservation', input: {});
    return ShareAudit.fromJson(
      data is Map ? Map<String, dynamic>.from(data) : const {},
    );
  }
}

final shareIntegrityRepositoryProvider = Provider<ShareIntegrityRepository>((
  ref,
) {
  return ShareIntegrityRepository(ref.watch(trpcClientProvider));
});

final myProvenanceProvider = FutureProvider.autoDispose<ShareProvenance>((
  ref,
) async {
  return ref.watch(shareIntegrityRepositoryProvider).myProvenance();
});

final conservationAuditProvider = FutureProvider.autoDispose<ShareAudit>((
  ref,
) async {
  return ref.watch(shareIntegrityRepositoryProvider).conservationAudit();
});
