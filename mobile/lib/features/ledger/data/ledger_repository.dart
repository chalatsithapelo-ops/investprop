import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/providers.dart';
import '../../auth/application/auth_controller.dart';
import '../domain/share_ledger_entry.dart';

class LedgerRepository {
  LedgerRepository(this._client);

  final TrpcClient _client;

  Future<List<ShareLedgerEntry>> myLedger(int investorId) async {
    final data = await _client.query(
      'getShareLedger',
      input: {'investorId': investorId, 'limit': 200},
    );
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((e) => ShareLedgerEntry.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }
}

final ledgerRepositoryProvider = Provider<LedgerRepository>((ref) {
  return LedgerRepository(ref.watch(trpcClientProvider));
});

final myLedgerProvider =
    FutureProvider.autoDispose<List<ShareLedgerEntry>>((ref) async {
  final userId = ref.watch(authControllerProvider).user?.id;
  if (userId == null) return const [];
  return ref.watch(ledgerRepositoryProvider).myLedger(userId);
});
