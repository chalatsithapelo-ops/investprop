import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/api/trpc_client.dart';
import '../../../core/providers.dart';
import '../domain/ai_models.dart';

class AiRepository {
  AiRepository(this._client);

  final TrpcClient _client;

  // ── Property chat co-pilot ──
  Future<List<AiChatMessage>> chatHistory(int propertyId) async {
    final data = await _client.query(
      'propertyChatHistory',
      input: {'propertyId': propertyId},
    );
    if (data is! List) return const [];
    return data
        .whereType<Map>()
        .map((e) => AiChatMessage.fromJson(Map<String, dynamic>.from(e)))
        .toList();
  }

  Future<AiChatMessage> sendChat({
    required int propertyId,
    required String message,
  }) async {
    final data = await _client.mutation(
      'chatAboutProperty',
      input: {'propertyId': propertyId, 'message': message},
    );
    return AiChatMessage.fromJson(
      data is Map ? Map<String, dynamic>.from(data) : const {},
    );
  }

  Future<void> clearChat(int propertyId) async {
    await _client.mutation(
      'clearPropertyChat',
      input: {'propertyId': propertyId},
    );
  }

  // ── Personalised match score ──
  Future<MatchScore?> matchScore(int propertyId) async {
    final data = await _client.query(
      'getMatchScore',
      input: {'propertyId': propertyId},
    );
    if (data is! Map) return null;
    return MatchScore.fromJson(
      Map<String, dynamic>.from(data),
      propertyId: propertyId,
    );
  }

  // ── Portfolio advisor ──
  Future<PortfolioInsight?> portfolioInsight() async {
    final data = await _client.query('getPortfolioInsight');
    if (data is! Map) return null;
    return PortfolioInsight.fromJson(Map<String, dynamic>.from(data));
  }

  Future<PortfolioInsight> generatePortfolioInsight({bool force = false}) async {
    final data = await _client.mutation(
      'generatePortfolioInsight',
      input: {'force': force},
    );
    return PortfolioInsight.fromJson(
      data is Map ? Map<String, dynamic>.from(data) : const {},
    );
  }

  Future<void> dismissPortfolioInsight(String period) async {
    await _client.mutation(
      'dismissPortfolioInsight',
      input: {'period': period},
    );
  }

  // ── Platform track record ──
  Future<PlatformTrackRecord> platformTrackRecord() async {
    final data = await _client.query('getPlatformTrackRecord');
    return PlatformTrackRecord.fromJson(
      data is Map ? Map<String, dynamic>.from(data) : const {},
    );
  }
}

final aiRepositoryProvider = Provider<AiRepository>((ref) {
  return AiRepository(ref.watch(trpcClientProvider));
});

final propertyChatHistoryProvider = FutureProvider.autoDispose
    .family<List<AiChatMessage>, int>((ref, propertyId) async {
  return ref.watch(aiRepositoryProvider).chatHistory(propertyId);
});

final matchScoreProvider =
    FutureProvider.autoDispose.family<MatchScore?, int>((ref, propertyId) async {
  return ref.watch(aiRepositoryProvider).matchScore(propertyId);
});

final portfolioInsightProvider =
    FutureProvider.autoDispose<PortfolioInsight?>((ref) async {
  return ref.watch(aiRepositoryProvider).portfolioInsight();
});

final platformTrackRecordProvider =
    FutureProvider.autoDispose<PlatformTrackRecord>((ref) async {
  return ref.watch(aiRepositoryProvider).platformTrackRecord();
});
