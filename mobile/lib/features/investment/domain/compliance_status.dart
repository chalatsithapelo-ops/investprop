import '../../../core/format.dart';

/// FAIS appropriateness assessment status (`getAppropriatenessStatus`).
class AppropriatenessStatus {
  const AppropriatenessStatus({required this.completed, this.completedAt});

  final bool completed;
  final DateTime? completedAt;

  factory AppropriatenessStatus.fromJson(dynamic json) {
    if (json is! Map) return const AppropriatenessStatus(completed: false);
    return AppropriatenessStatus(
      completed: json['completed'] == true,
      completedAt: asDate(json['completedAt']),
    );
  }
}

/// FICA / KYC verification status (`getMyFicaStatus`).
class FicaStatus {
  const FicaStatus({
    required this.ficaVerified,
    required this.ficaExempt,
    required this.ficaRequired,
    required this.totalInvested,
    required this.threshold,
    required this.missingDocuments,
    required this.pendingDocuments,
    this.rejectedReason,
  });

  final bool ficaVerified;
  final bool ficaExempt;
  final bool ficaRequired;
  final double totalInvested;
  final double threshold;
  final List<String> missingDocuments;
  final List<String> pendingDocuments;
  final String? rejectedReason;

  /// The investor may proceed past the FICA gate when verified or exempt.
  bool get isClear => ficaVerified || ficaExempt;

  /// Whether a new contribution of [amount] would trip the FICA threshold.
  bool blocksAmount(double amount) {
    if (isClear) return false;
    return (totalInvested + amount) >= threshold;
  }

  factory FicaStatus.fromJson(dynamic json) {
    if (json is! Map) {
      return const FicaStatus(
        ficaVerified: false,
        ficaExempt: false,
        ficaRequired: false,
        totalInvested: 0,
        threshold: 20000,
        missingDocuments: [],
        pendingDocuments: [],
      );
    }
    List<String> strList(dynamic v) =>
        v is List ? v.map((e) => e.toString()).toList() : const [];
    return FicaStatus(
      ficaVerified: json['ficaVerified'] == true,
      ficaExempt: json['ficaExempt'] == true,
      ficaRequired: json['ficaRequired'] == true,
      totalInvested: asDouble(json['totalInvested']),
      threshold: asDouble(json['threshold']) == 0
          ? 20000
          : asDouble(json['threshold']),
      missingDocuments: strList(json['missingDocuments']),
      pendingDocuments: strList(json['pendingDocuments']),
      rejectedReason: json['ficaRejectedReason']?.toString(),
    );
  }
}
