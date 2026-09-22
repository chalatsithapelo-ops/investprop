import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/providers.dart';
import '../domain/marketplace_models.dart';

class MarketplaceRepository {
  MarketplaceRepository(this._client);

  final TrpcClient _client;

  Future<List<MarketShareClass>> overview() async {
    final data = await _client.query('getMarketplaceOverview', input: {});
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((e) => MarketShareClass.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<OrderBook> orderBook(int shareClassId) async {
    final data = await _client
        .query('getOrderBook', input: {'shareClassId': shareClassId});
    return OrderBook.fromJson(
      data is Map ? Map<String, dynamic>.from(data) : const {},
    );
  }

  Future<List<MyOrder>> myOrders() async {
    final data = await _client.query('getMyOrders');
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((e) => MyOrder.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<int> placeOrder({
    required int shareClassId,
    required String side,
    required int quantity,
    required double pricePerShare,
    int? expiresInDays,
  }) async {
    final result = await _client.mutation('placeShareOrder', input: {
      'shareClassId': shareClassId,
      'side': side,
      'quantity': quantity,
      'pricePerShare': pricePerShare,
      if (expiresInDays != null) 'expiresInDays': expiresInDays,
    });
    if (result is Map && result['tradesExecuted'] != null) {
      final v = result['tradesExecuted'];
      return v is int ? v : int.tryParse('$v') ?? 0;
    }
    return 0;
  }

  Future<void> cancelOrder(int orderId) async {
    await _client.mutation('cancelShareOrder', input: {'orderId': orderId});
  }

  Future<Map<String, dynamic>> lookupInvestor(String investorCode) async {
    final data = await _client
        .query('lookupInvestorByCode', input: {'investorCode': investorCode});
    return data is Map ? Map<String, dynamic>.from(data) : const {};
  }

  Future<void> transferShares({
    required int shareClassId,
    required int toInvestorId,
    required int shares,
    required double pricePerShare,
  }) async {
    await _client.mutation('transferShares', input: {
      'shareClassId': shareClassId,
      'toInvestorId': toInvestorId,
      'shares': shares,
      'pricePerShare': pricePerShare,
    });
  }
}

final marketplaceRepositoryProvider = Provider<MarketplaceRepository>((ref) {
  return MarketplaceRepository(ref.watch(trpcClientProvider));
});

final marketplaceOverviewProvider =
    FutureProvider.autoDispose<List<MarketShareClass>>((ref) async {
  return ref.watch(marketplaceRepositoryProvider).overview();
});

final orderBookProvider =
    FutureProvider.autoDispose.family<OrderBook, int>((ref, shareClassId) async {
  return ref.watch(marketplaceRepositoryProvider).orderBook(shareClassId);
});

final myOrdersProvider =
    FutureProvider.autoDispose<List<MyOrder>>((ref) async {
  return ref.watch(marketplaceRepositoryProvider).myOrders();
});
