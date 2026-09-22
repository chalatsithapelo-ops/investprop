import '../../../core/format.dart';

class Holding {
  Holding({
    required this.id,
    required this.propertyId,
    required this.propertyTitle,
    required this.imageUrl,
    required this.location,
    required this.sharesOwned,
    required this.shareClassName,
    required this.currentValue,
    required this.investedAmount,
    required this.ownershipPercentage,
    required this.unrealizedGain,
    required this.projectedAnnualYield,
    required this.projectedAnnualIncome,
    required this.totalDistributed,
    required this.projected5YearReturn,
    required this.createdAt,
  });

  final int id;
  final int propertyId;
  final String propertyTitle;
  final String? imageUrl;
  final String location;
  final double sharesOwned;
  final String shareClassName;
  final double currentValue;
  final double investedAmount;
  final double ownershipPercentage;
  final double unrealizedGain;
  final double projectedAnnualYield;
  final double projectedAnnualIncome;
  final double totalDistributed;
  final double projected5YearReturn;
  final DateTime? createdAt;

  double get gainPercent =>
      investedAmount > 0 ? (unrealizedGain / investedAmount) * 100 : 0;

  /// Cooling-off window is 7 days from purchase (matches the backend).
  static const int coolingOffDays = 7;

  DateTime? get coolingOffDeadline =>
      createdAt?.add(const Duration(days: coolingOffDays));

  bool get isWithinCoolingOff {
    final deadline = coolingOffDeadline;
    return deadline != null && DateTime.now().isBefore(deadline);
  }

  int get coolingOffDaysRemaining {
    final deadline = coolingOffDeadline;
    if (deadline == null) return 0;
    final remaining = deadline.difference(DateTime.now()).inDays;
    return remaining < 0 ? 0 : remaining + 1;
  }

  factory Holding.fromJson(Map<String, dynamic> json) {
    final property = json['property'] as Map? ?? const {};
    final shareClass = json['shareClass'] as Map? ?? const {};
    final city = asString(property['city']);
    final province = asString(property['state']);

    return Holding(
      id: asInt(json['id']),
      propertyId: asInt(json['propertyId']),
      propertyTitle: asString(property['title'], 'Property'),
      imageUrl: (property['imageUrl'] as String?)?.isNotEmpty == true
          ? property['imageUrl'] as String
          : null,
      location: [city, province].where((s) => s.isNotEmpty).join(', '),
      sharesOwned: asDouble(json['sharesOwned']),
      shareClassName: asString(shareClass['name'], 'Shares'),
      currentValue: asDouble(json['currentValue']),
      investedAmount: asDouble(json['investedAmount']),
      ownershipPercentage: asDouble(json['ownershipPercentage']),
      unrealizedGain: asDouble(json['unrealizedGain']),
      projectedAnnualYield: asDouble(json['projectedAnnualYield']),
      projectedAnnualIncome: asDouble(json['projectedAnnualIncome']),
      totalDistributed: asDouble(json['totalDistributed']),
      projected5YearReturn: asDouble(json['projected5YearReturn']),
      createdAt: asDate(json['createdAt']),
    );
  }
}

/// A single distribution payout received (or pending) by the investor.
class DistributionPayout {
  DistributionPayout({
    required this.id,
    required this.propertyId,
    required this.propertyTitle,
    required this.type,
    required this.grossAmount,
    required this.taxWithheld,
    required this.netAmount,
    required this.status,
    required this.date,
  });

  final int id;
  final int propertyId;
  final String propertyTitle;
  final String type; // RENTAL_INCOME | SALE_PROCEEDS | DIVIDEND | INTEREST
  final double grossAmount;
  final double taxWithheld;
  final double netAmount;
  final String status; // PAID | PENDING
  final DateTime? date;

  bool get isPaid => status == 'PAID';

  String get typeLabel {
    switch (type) {
      case 'RENTAL_INCOME':
        return 'Rental income';
      case 'SALE_PROCEEDS':
        return 'Sale proceeds';
      case 'DIVIDEND':
        return 'Dividend';
      case 'INTEREST':
        return 'Interest';
      default:
        return 'Distribution';
    }
  }

  factory DistributionPayout.fromJson(Map<String, dynamic> json) {
    final distribution = json['distribution'] as Map? ?? const {};
    final property = distribution['property'] as Map? ?? const {};
    return DistributionPayout(
      id: asInt(json['id']),
      propertyId: asInt(property['id']),
      propertyTitle: asString(property['title'], 'Property'),
      type: asString(distribution['type']),
      grossAmount: asDouble(json['grossAmount']),
      taxWithheld: asDouble(json['taxWithheld']),
      netAmount: asDouble(json['netAmount']),
      status: asString(json['status'], 'PENDING'),
      date: asDate(json['paidAt']) ?? asDate(json['createdAt']),
    );
  }
}

/// Aggregated distributions response from `getMyDistributions`.
class DistributionsSummary {
  DistributionsSummary({
    required this.payouts,
    required this.totalReceived,
    required this.totalPending,
  });

  final List<DistributionPayout> payouts;
  final double totalReceived;
  final double totalPending;

  List<DistributionPayout> forProperty(int propertyId) =>
      payouts.where((p) => p.propertyId == propertyId).toList();

  factory DistributionsSummary.fromJson(Map<String, dynamic> json) {
    final list = json['payouts'] as List? ?? const [];
    return DistributionsSummary(
      payouts: list
          .whereType<Map>()
          .map((e) => DistributionPayout.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      totalReceived: asDouble(json['totalReceived']),
      totalPending: asDouble(json['totalPending']),
    );
  }
}

class PortfolioSummary {
  PortfolioSummary({
    required this.holdings,
    required this.totalInvested,
    required this.totalValue,
    required this.totalDistributed,
    required this.totalUnrealizedGain,
  });

  final List<Holding> holdings;
  final double totalInvested;
  final double totalValue;
  final double totalDistributed;
  final double totalUnrealizedGain;

  double get totalReturnPercent =>
      totalInvested > 0 ? (totalUnrealizedGain / totalInvested) * 100 : 0;

  factory PortfolioSummary.fromHoldings(List<Holding> holdings) {
    double invested = 0, value = 0, distributed = 0, gain = 0;
    for (final h in holdings) {
      invested += h.investedAmount;
      value += h.currentValue;
      distributed += h.totalDistributed;
      gain += h.unrealizedGain;
    }
    return PortfolioSummary(
      holdings: holdings,
      totalInvested: invested,
      totalValue: value,
      totalDistributed: distributed,
      totalUnrealizedGain: gain,
    );
  }
}
