import '../../../core/format.dart';

/// Real-time budget/return metrics attached to a contribution.
class ContributionMetrics {
  const ContributionMetrics({
    required this.expectedRevenue,
    required this.currentROI,
    required this.investorSharePercentage,
    required this.estimatedCurrentValue,
    required this.unrealizedGain,
    required this.percentageComplete,
  });

  final double expectedRevenue;
  final double currentROI;
  final double investorSharePercentage;
  final double estimatedCurrentValue;
  final double unrealizedGain;
  final double percentageComplete;

  factory ContributionMetrics.fromJson(Map<String, dynamic> json) {
    return ContributionMetrics(
      expectedRevenue: asDouble(json['expectedRevenue']),
      currentROI: asDouble(json['currentROI']),
      investorSharePercentage: asDouble(json['investorSharePercentage']),
      estimatedCurrentValue: asDouble(json['estimatedCurrentValue']),
      unrealizedGain: asDouble(json['unrealizedGain']),
      percentageComplete: asDouble(json['percentageComplete']),
    );
  }
}

class Contribution {
  const Contribution({
    required this.id,
    required this.propertyId,
    required this.propertyTitle,
    required this.propertyImageUrl,
    required this.propertyType,
    required this.contributionAmount,
    required this.numberOfShares,
    required this.sharePrice,
    required this.ownershipPercentage,
    required this.expectedReturnAmount,
    required this.expectedReturnRate,
    required this.contributionDate,
    required this.paymentMethod,
    required this.paymentReference,
    required this.paymentStatus,
    required this.status,
    required this.coolingOffExpiresAt,
    required this.metrics,
  });

  final int id;
  final int propertyId;
  final String propertyTitle;
  final String propertyImageUrl;
  final String propertyType;
  final double contributionAmount;
  final int numberOfShares;
  final double sharePrice;
  final double ownershipPercentage;
  final double expectedReturnAmount;
  final double expectedReturnRate;
  final DateTime? contributionDate;
  final String paymentMethod;
  final String paymentReference;
  final String paymentStatus;
  final String status;
  final DateTime? coolingOffExpiresAt;
  final ContributionMetrics? metrics;

  bool get isInCoolingOff =>
      coolingOffExpiresAt != null &&
      coolingOffExpiresAt!.isAfter(DateTime.now()) &&
      status != 'CANCELLED' &&
      status != 'REJECTED';

  /// Cancellation is only allowed inside the cooling-off window for
  /// contributions that aren't already terminated.
  bool get canCancel =>
      isInCoolingOff &&
      status != 'CANCELLED' &&
      status != 'REJECTED' &&
      status != 'REFUND_REQUESTED';

  /// A refund can be requested once cooling-off has passed for an
  /// active (paid/approved) contribution.
  bool get canRequestRefund =>
      !isInCoolingOff &&
      (status == 'PAID' || status == 'APPROVED') &&
      status != 'REFUND_REQUESTED';

  Duration? get coolingOffRemaining =>
      isInCoolingOff ? coolingOffExpiresAt!.difference(DateTime.now()) : null;

  /// Proof of payment can be submitted once the contribution is APPROVED and
  /// payment has not yet been submitted or confirmed.
  bool get canSubmitPop =>
      status == 'APPROVED' &&
      paymentStatus != 'PAID' &&
      paymentStatus != 'POP_SUBMITTED';

  String get statusLabel {
    switch (status) {
      case 'PENDING':
        return 'Pending';
      case 'APPROVED':
        return 'Approved';
      case 'PAID':
        return 'Paid';
      case 'CANCELLED':
        return 'Cancelled';
      case 'REJECTED':
        return 'Rejected';
      case 'REFUND_REQUESTED':
        return 'Refund requested';
      default:
        return status;
    }
  }

  factory Contribution.fromJson(Map<String, dynamic> json) {
    final property = json['property'] is Map
        ? Map<String, dynamic>.from(json['property'] as Map)
        : const <String, dynamic>{};
    final metrics = json['realTimeMetrics'] is Map
        ? ContributionMetrics.fromJson(
            Map<String, dynamic>.from(json['realTimeMetrics'] as Map))
        : null;
    return Contribution(
      id: asInt(json['id']),
      propertyId: asInt(property['id']),
      propertyTitle: asString(property['title'], 'Property'),
      propertyImageUrl: asString(property['imageUrl']),
      propertyType: asString(json['propertyType']),
      contributionAmount: asDouble(json['contributionAmount']),
      numberOfShares: asInt(json['numberOfShares']),
      sharePrice: asDouble(json['sharePrice']),
      ownershipPercentage: asDouble(json['ownershipPercentage']),
      expectedReturnAmount: asDouble(json['expectedReturnAmount']),
      expectedReturnRate: asDouble(json['expectedReturnRate']),
      contributionDate: asDate(json['contributionDate']),
      paymentMethod: asString(json['paymentMethod']),
      paymentReference: asString(json['paymentReference']),
      paymentStatus: asString(json['paymentStatus']),
      status: asString(json['status'], 'PENDING'),
      coolingOffExpiresAt: asDate(json['coolingOffExpiresAt']),
      metrics: metrics,
    );
  }
}

class ContributionsSummary {
  const ContributionsSummary({
    required this.totalProperties,
    required this.totalContributions,
    required this.totalExpectedReturns,
    required this.totalExpectedPayout,
    required this.averageReturnRate,
  });

  final int totalProperties;
  final double totalContributions;
  final double totalExpectedReturns;
  final double totalExpectedPayout;
  final double averageReturnRate;

  factory ContributionsSummary.fromJson(Map<String, dynamic> json) {
    return ContributionsSummary(
      totalProperties: asInt(json['totalProperties']),
      totalContributions: asDouble(json['totalContributions']),
      totalExpectedReturns: asDouble(json['totalExpectedReturns']),
      totalExpectedPayout: asDouble(json['totalExpectedPayout']),
      averageReturnRate: asDouble(json['averageReturnRate']),
    );
  }
}

class ContributionsResult {
  const ContributionsResult({required this.contributions, required this.summary});

  final List<Contribution> contributions;
  final ContributionsSummary summary;

  factory ContributionsResult.fromJson(Map<String, dynamic> json) {
    final list = json['contributions'] as List? ?? const [];
    final summary = json['summary'] is Map
        ? ContributionsSummary.fromJson(
            Map<String, dynamic>.from(json['summary'] as Map))
        : const ContributionsSummary(
            totalProperties: 0,
            totalContributions: 0,
            totalExpectedReturns: 0,
            totalExpectedPayout: 0,
            averageReturnRate: 0,
          );
    return ContributionsResult(
      contributions: list
          .whereType<Map>()
          .map((e) => Contribution.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      summary: summary,
    );
  }
}
