import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/providers.dart';
import '../domain/subscription_models.dart';

class SubscriptionRepository {
  SubscriptionRepository(this._client);

  final TrpcClient _client;

  Future<MySubscription> mySubscription() async {
    final data = await _client.query('getMySubscription');
    return MySubscription.fromJson(
      data is Map ? Map<String, dynamic>.from(data) : const {},
    );
  }

  Future<List<SubscriptionPlan>> plans() async {
    final data = await _client.query('getSubscriptionPlans', authenticated: false);
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((e) => SubscriptionPlan.fromJson(Map<String, dynamic>.from(e)))
        .toList()
      ..sort((a, b) => a.rank.compareTo(b.rank));
  }
}

final subscriptionRepositoryProvider = Provider<SubscriptionRepository>((ref) {
  return SubscriptionRepository(ref.watch(trpcClientProvider));
});

final mySubscriptionProvider =
    FutureProvider.autoDispose<MySubscription>((ref) async {
  return ref.watch(subscriptionRepositoryProvider).mySubscription();
});

final subscriptionPlansProvider =
    FutureProvider.autoDispose<List<SubscriptionPlan>>((ref) async {
  return ref.watch(subscriptionRepositoryProvider).plans();
});
