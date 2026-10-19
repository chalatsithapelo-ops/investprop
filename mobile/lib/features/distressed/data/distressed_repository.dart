import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/providers.dart';
import '../domain/distressed_deal.dart';

/// Outcome of an on-demand AI grade request.
class DistressedGradeResult {
  DistressedGradeResult({
    required this.grade,
    required this.riskScore,
    required this.summary,
    required this.breakdown,
    required this.cached,
  });

  final String? grade;
  final double? riskScore;
  final String? summary;
  final DistressedAIBreakdown? breakdown;
  final bool cached;

  factory DistressedGradeResult.fromJson(Map<String, dynamic> json) {
    // screenListingCore returns either the fresh shape
    // { grade, riskScore, summary, pros, cons, redFlags, recommendations }
    // or the cached shape { grade, riskScore, summary, underwriting: {...} }.
    DistressedAIBreakdown? breakdown;
    final uw = json['underwriting'];
    if (uw is Map) {
      breakdown = DistressedAIBreakdown.fromJson(Map<String, dynamic>.from(uw));
    } else if (json.containsKey('pros') ||
        json.containsKey('cons') ||
        json.containsKey('redFlags') ||
        json.containsKey('recommendations')) {
      breakdown = DistressedAIBreakdown.fromJson(json);
    }
    return DistressedGradeResult(
      grade: json['grade'] as String?,
      riskScore: json['riskScore'] == null
          ? null
          : (json['riskScore'] as num).toDouble(),
      summary: json['summary'] as String?,
      breakdown: breakdown,
      cached: json['cached'] == true,
    );
  }
}

class DistressedRepository {
  DistressedRepository(this._client);

  final TrpcClient _client;

  Future<DistressedDealsResult> fetchDeals(
    DistressedFilter filter, {
    required int page,
  }) async {
    final data = await _client.query(
      'getSubscriberDistressedDeals',
      input: filter.toInput(page: page),
    );
    if (data is Map) {
      return DistressedDealsResult.fromJson(Map<String, dynamic>.from(data));
    }
    return DistressedDealsResult(
      entitled: false,
      listings: const [],
      totalCount: 0,
      totalPages: 0,
      currentPage: 1,
      newThisWeek: 0,
    );
  }

  Future<DistressedDealDetail> fetchDetail(int listingId) async {
    final data = await _client.query(
      'getSubscriberDistressedDetail',
      input: {'listingId': listingId},
    );
    if (data is Map) {
      return DistressedDealDetail.fromJson(Map<String, dynamic>.from(data));
    }
    throw StateError('Listing $listingId not found');
  }

  Future<DistressedGradeResult> gradeDeal(int listingId) async {
    final data = await _client.mutation(
      'screenSubscriberDistressedDeal',
      input: {'listingId': listingId},
    );
    if (data is Map) {
      return DistressedGradeResult.fromJson(Map<String, dynamic>.from(data));
    }
    throw StateError('Grading failed');
  }
}

final distressedRepositoryProvider = Provider<DistressedRepository>((ref) {
  return DistressedRepository(ref.watch(trpcClientProvider));
});

final distressedDetailProvider = FutureProvider.autoDispose
    .family<DistressedDealDetail, int>((ref, id) async {
  return ref.watch(distressedRepositoryProvider).fetchDetail(id);
});
