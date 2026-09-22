import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/providers.dart';
import '../domain/holding.dart';

class PortfolioRepository {
  PortfolioRepository(this._client);

  final TrpcClient _client;

  Future<PortfolioSummary> fetch() async {
    final data = await _client.query('getInvestorPortfolio');
    final holdings = data is List
        ? data
              .whereType<Map>()
              .map((e) => Holding.fromJson(Map<String, dynamic>.from(e)))
              .toList()
        : <Holding>[];
    return PortfolioSummary.fromHoldings(holdings);
  }

  Future<DistributionsSummary> distributions() async {
    final data = await _client.query('getMyDistributions');
    return DistributionsSummary.fromJson(
      data is Map ? Map<String, dynamic>.from(data) : const {},
    );
  }

  /// Exercise the 7-day cooling-off right. Returns the confirmation message.
  Future<String> requestCoolingOff({
    required int shareHoldingId,
    String? reason,
  }) async {
    final data = await _client.mutation(
      'requestCoolingOffWithdrawal',
      input: {
        'shareHoldingId': shareHoldingId,
        if (reason != null && reason.isNotEmpty) 'reason': reason,
      },
    );
    final map = data is Map ? Map<String, dynamic>.from(data) : const {};
    return (map['message'] as String?) ??
        'Cooling-off withdrawal processed.';
  }
}

final portfolioRepositoryProvider = Provider<PortfolioRepository>((ref) {
  return PortfolioRepository(ref.watch(trpcClientProvider));
});

final portfolioProvider = FutureProvider.autoDispose<PortfolioSummary>((
  ref,
) async {
  return ref.watch(portfolioRepositoryProvider).fetch();
});

final distributionsProvider =
    FutureProvider.autoDispose<DistributionsSummary>((ref) async {
  return ref.watch(portfolioRepositoryProvider).distributions();
});
