import '../../../core/format.dart';

/// Parsed response of `getInvestorStatement`.
class InvestorStatement {
  InvestorStatement({
    required this.investorName,
    required this.investorEmail,
    required this.summary,
    required this.investments,
    required this.recentPayouts,
    required this.generatedAt,
  });

  final String investorName;
  final String investorEmail;
  final StatementSummary summary;
  final List<StatementInvestment> investments;
  final List<StatementPayout> recentPayouts;
  final DateTime? generatedAt;

  factory InvestorStatement.fromJson(Map<String, dynamic> json) {
    final investor = json['investor'] as Map? ?? const {};
    final investmentsRaw = json['investments'] as List? ?? const [];
    final payoutsRaw = json['recentPayouts'] as List? ?? const [];
    return InvestorStatement(
      investorName: asString(investor['name'], 'Investor'),
      investorEmail: asString(investor['email']),
      summary: StatementSummary.fromJson(
        json['summary'] is Map
            ? Map<String, dynamic>.from(json['summary'] as Map)
            : const {},
      ),
      investments: investmentsRaw
          .whereType<Map>()
          .map((e) => StatementInvestment.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      recentPayouts: payoutsRaw
          .whereType<Map>()
          .map((e) => StatementPayout.fromJson(Map<String, dynamic>.from(e)))
          .toList(),
      generatedAt: asDate(json['generatedAt']),
    );
  }
}

class StatementSummary {
  StatementSummary({
    required this.totalInvested,
    required this.totalCurrentValue,
    required this.totalDividendsReceived,
    required this.totalTaxWithheld,
    required this.unrealisedGainLoss,
    required this.totalReturn,
    required this.propertiesInvested,
  });

  final double totalInvested;
  final double totalCurrentValue;
  final double totalDividendsReceived;
  final double totalTaxWithheld;
  final double unrealisedGainLoss;
  final double totalReturn;
  final int propertiesInvested;

  factory StatementSummary.fromJson(Map<String, dynamic> json) {
    return StatementSummary(
      totalInvested: asDouble(json['totalInvested']),
      totalCurrentValue: asDouble(json['totalCurrentValue']),
      totalDividendsReceived: asDouble(json['totalDividendsReceived']),
      totalTaxWithheld: asDouble(json['totalTaxWithheld']),
      unrealisedGainLoss: asDouble(json['unrealisedGainLoss']),
      totalReturn: asDouble(json['totalReturn']),
      propertiesInvested: asInt(json['propertiesInvested']),
    );
  }
}

class StatementInvestment {
  StatementInvestment({
    required this.title,
    required this.spvName,
    required this.totalInvested,
    required this.ownershipPct,
    required this.totalDividendsReceived,
    required this.totalTaxWithheld,
    required this.currentValue,
  });

  final String title;
  final String? spvName;
  final double totalInvested;
  final double ownershipPct;
  final double totalDividendsReceived;
  final double totalTaxWithheld;
  final double currentValue;

  factory StatementInvestment.fromJson(Map<String, dynamic> json) {
    return StatementInvestment(
      title: asString(json['title'], 'Property'),
      spvName: (json['spvName'] as String?)?.isNotEmpty == true
          ? json['spvName'] as String
          : null,
      totalInvested: asDouble(json['totalInvested']),
      ownershipPct: asDouble(json['ownershipPct']),
      totalDividendsReceived: asDouble(json['totalDividendsReceived']),
      totalTaxWithheld: asDouble(json['totalTaxWithheld']),
      currentValue: asDouble(json['currentValue']),
    );
  }
}

class StatementPayout {
  StatementPayout({
    required this.date,
    required this.type,
    required this.gross,
    required this.taxWithheld,
    required this.net,
    required this.status,
  });

  final DateTime? date;
  final String type;
  final double gross;
  final double taxWithheld;
  final double net;
  final String status;

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

  factory StatementPayout.fromJson(Map<String, dynamic> json) {
    return StatementPayout(
      date: asDate(json['date']),
      type: asString(json['type']),
      gross: asDouble(json['gross']),
      taxWithheld: asDouble(json['taxWithheld']),
      net: asDouble(json['net']),
      status: asString(json['status'], 'PENDING'),
    );
  }
}
