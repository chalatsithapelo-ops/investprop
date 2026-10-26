import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/providers.dart';
import '../domain/development_due_diligence.dart';
import '../domain/opportunity.dart';

class OpportunitiesRepository {
  OpportunitiesRepository(this._client);

  final TrpcClient _client;

  Future<List<Opportunity>> fetchAll() async {
    final data = await _client.query('getInvestmentOpportunities');
    if (data is! List) return [];
    return data
        .whereType<Map>()
        .map((e) => Opportunity.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<Opportunity> fetchById(int id) async {
    final data = await _client.query(
      'getPropertyById',
      input: {'id': id, 'propertyId': id},
    );
    if (data is Map) {
      return Opportunity.fromJson(Map<String, dynamic>.from(data));
    }
    throw StateError('Opportunity $id not found');
  }

  /// Investor due-diligence pack for a greenfield development. Returns null when
  /// the opportunity is not a development (the server returns null).
  Future<DevelopmentDueDiligence?> fetchDueDiligence(int propertyId) async {
    final data = await _client.query(
      'getDevelopmentDueDiligence',
      input: {'propertyId': propertyId},
    );
    if (data is Map) {
      return DevelopmentDueDiligence.fromJson(Map<String, dynamic>.from(data));
    }
    return null;
  }
}

final opportunitiesRepositoryProvider = Provider<OpportunitiesRepository>((ref) {
  return OpportunitiesRepository(ref.watch(trpcClientProvider));
});

final opportunitiesProvider = FutureProvider.autoDispose<List<Opportunity>>((
  ref,
) async {
  return ref.watch(opportunitiesRepositoryProvider).fetchAll();
});

final opportunityByIdProvider = FutureProvider.autoDispose
    .family<Opportunity, int>((ref, id) async {
      final cached = ref.watch(opportunitiesProvider).valueOrNull;
      if (cached != null) {
        for (final o in cached) {
          // Only reuse the cached record when it already carries the strategy
          // sub-records needed for the investment-analysis panel; otherwise
          // fetch the full property by id.
          if (o.id == id && o.hasAnalysis) return o;
        }
      }
      return ref.watch(opportunitiesRepositoryProvider).fetchById(id);
    });

final developmentDueDiligenceProvider = FutureProvider.autoDispose
    .family<DevelopmentDueDiligence?, int>((ref, id) async {
      return ref.watch(opportunitiesRepositoryProvider).fetchDueDiligence(id);
    });
