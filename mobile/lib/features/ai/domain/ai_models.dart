import '../../../core/format.dart';

/// A single message in a per-property AI chat thread.
class AiChatMessage {
  const AiChatMessage({
    required this.id,
    required this.role,
    required this.content,
    required this.createdAt,
  });

  final String id;
  final String role; // 'user' | 'assistant'
  final String content;
  final DateTime? createdAt;

  bool get isUser => role == 'user';

  factory AiChatMessage.fromJson(Map<String, dynamic> json) {
    return AiChatMessage(
      id: asString(json['id']),
      role: asString(json['role'], 'assistant'),
      content: asString(json['content']),
      createdAt: asDate(json['createdAt']),
    );
  }
}

/// A personalised risk-match score for an investor × deal.
class MatchScore {
  const MatchScore({
    required this.propertyId,
    required this.score,
    required this.band,
    required this.justification,
    required this.factors,
  });

  final int propertyId;
  final int score;
  final String band;
  final String justification;
  final List<MatchFactor> factors;

  String get bandLabel {
    switch (band) {
      case 'STRONG_MATCH':
        return 'Strong match';
      case 'GOOD_MATCH':
        return 'Good match';
      case 'FAIR_MATCH':
        return 'Fair match';
      case 'POOR_MATCH':
        return 'Poor match';
      case 'MISMATCH':
        return 'Mismatch';
      default:
        return band;
    }
  }

  factory MatchScore.fromJson(Map<String, dynamic> json, {int? propertyId}) {
    final factorsList = json['factors'] as List? ?? const [];
    return MatchScore(
      propertyId: propertyId ?? asInt(json['propertyId']),
      score: asInt(json['score']),
      band: asString(json['band']),
      justification: asString(json['justification']),
      factors: factorsList
          .whereType<Map>()
          .map((e) => MatchFactor.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
    );
  }
}

class MatchFactor {
  const MatchFactor({
    required this.label,
    required this.weight,
    required this.positive,
  });

  final String label;
  final double weight;
  final bool positive;

  factory MatchFactor.fromJson(Map<String, dynamic> json) {
    return MatchFactor(
      label: asString(json['label']),
      weight: asDouble(json['weight']),
      positive: json['positive'] == true,
    );
  }
}

/// A single actionable insight within the portfolio brief.
class PortfolioInsightItem {
  const PortfolioInsightItem({
    required this.type,
    required this.severity,
    required this.message,
    required this.action,
  });

  final String type;
  final String severity; // INFO | ATTENTION | WARNING
  final String message;
  final String? action;

  factory PortfolioInsightItem.fromJson(Map<String, dynamic> json) {
    return PortfolioInsightItem(
      type: asString(json['type'], 'info'),
      severity: asString(json['severity'], 'INFO'),
      message: asString(json['message']),
      action: json['action'] == null ? null : asString(json['action']),
    );
  }
}

/// The monthly AI portfolio brief.
class PortfolioInsight {
  const PortfolioInsight({
    required this.summary,
    required this.insights,
    required this.period,
    required this.generatedAt,
    required this.dismissedAt,
  });

  final String summary;
  final List<PortfolioInsightItem> insights;
  final String period;
  final DateTime? generatedAt;
  final DateTime? dismissedAt;

  factory PortfolioInsight.fromJson(Map<String, dynamic> json) {
    final list = json['insights'] as List? ?? const [];
    return PortfolioInsight(
      summary: asString(json['summary']),
      insights: list
          .whereType<Map>()
          .map((e) => PortfolioInsightItem.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      period: asString(json['period']),
      generatedAt: asDate(json['generatedAt']),
      dismissedAt: asDate(json['dismissedAt']),
    );
  }
}

/// Platform-wide delivery track record.
class PlatformTrackRecord {
  const PlatformTrackRecord({
    required this.totalDeals,
    required this.completed,
    required this.inProgress,
    required this.raising,
    required this.onTimePct,
    required this.onBudgetPct,
    required this.milestonesTracked,
    required this.totalDistributed,
    required this.totalInvestors,
    required this.capitalRaised,
    required this.since,
  });

  final int totalDeals;
  final int completed;
  final int inProgress;
  final int raising;
  final double? onTimePct;
  final double? onBudgetPct;
  final int milestonesTracked;
  final double totalDistributed;
  final int totalInvestors;
  final double capitalRaised;
  final DateTime? since;

  factory PlatformTrackRecord.fromJson(Map<String, dynamic> json) {
    return PlatformTrackRecord(
      totalDeals: asInt(json['totalDeals']),
      completed: asInt(json['completed']),
      inProgress: asInt(json['inProgress']),
      raising: asInt(json['raising']),
      onTimePct: json['onTimePct'] == null ? null : asDouble(json['onTimePct']),
      onBudgetPct:
          json['onBudgetPct'] == null ? null : asDouble(json['onBudgetPct']),
      milestonesTracked: asInt(json['milestonesTracked']),
      totalDistributed: asDouble(json['totalDistributed']),
      totalInvestors: asInt(json['totalInvestors']),
      capitalRaised: asDouble(json['capitalRaised']),
      since: asDate(json['since']),
    );
  }
}
