import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/providers.dart';
import '../domain/investor_statement.dart';

class StatementRepository {
  StatementRepository(this._client);

  final TrpcClient _client;

  Future<InvestorStatement> fetch({String? fromDate, String? toDate}) async {
    final data = await _client.query(
      'getInvestorStatement',
      input: {
        if (fromDate != null) 'fromDate': fromDate,
        if (toDate != null) 'toDate': toDate,
      },
    );
    return InvestorStatement.fromJson(
      data is Map ? Map<String, dynamic>.from(data) : const {},
    );
  }
}

final statementRepositoryProvider = Provider<StatementRepository>((ref) {
  return StatementRepository(ref.watch(trpcClientProvider));
});

final statementProvider =
    FutureProvider.autoDispose<InvestorStatement>((ref) async {
  return ref.watch(statementRepositoryProvider).fetch();
});
