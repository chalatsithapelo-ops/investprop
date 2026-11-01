import '../../../core/format.dart';

/// The investor's chosen exit strategy for their stake in a deal.
enum InvestorStrategy {
  flip,
  developmentExit,
  rentalIncome,
  buyAndHold,
  earlyResale;

  /// Wire value expected by the backend.
  String get wire => switch (this) {
    InvestorStrategy.flip => 'FLIP',
    InvestorStrategy.developmentExit => 'DEVELOPMENT_EXIT',
    InvestorStrategy.rentalIncome => 'RENTAL_INCOME',
    InvestorStrategy.buyAndHold => 'BUY_AND_HOLD',
    InvestorStrategy.earlyResale => 'EARLY_RESALE',
  };

  String get label => switch (this) {
    InvestorStrategy.flip => 'Flip to completion',
    InvestorStrategy.developmentExit => 'Hold to development exit',
    InvestorStrategy.rentalIncome => 'Rental income',
    InvestorStrategy.buyAndHold => 'Long buy & hold',
    InvestorStrategy.earlyResale => 'Early resale',
  };

  String get blurb => switch (this) {
    InvestorStrategy.flip =>
      'Ride the buy-renovate-sell to the sale — a one-off capital gain.',
    InvestorStrategy.developmentExit =>
      'Stay in until the development is built and sold.',
    InvestorStrategy.rentalIncome =>
      'Collect your share of rental distributions, plus growth on exit.',
    InvestorStrategy.buyAndHold =>
      'Hold long term for income plus compounding capital growth.',
    InvestorStrategy.earlyResale =>
      'Exit early by selling your shares on the marketplace.',
  };

  static InvestorStrategy? fromWire(String? v) {
    switch (v) {
      case 'FLIP':
        return InvestorStrategy.flip;
      case 'DEVELOPMENT_EXIT':
        return InvestorStrategy.developmentExit;
      case 'RENTAL_INCOME':
        return InvestorStrategy.rentalIncome;
      case 'BUY_AND_HOLD':
        return InvestorStrategy.buyAndHold;
      case 'EARLY_RESALE':
        return InvestorStrategy.earlyResale;
      default:
        return null;
    }
  }
}

/// One scenario band of a per-investor projection.
class InvestorScenario {
  const InvestorScenario({
    required this.capitalReturned,
    required this.preferredReturnPaid,
    required this.profitShare,
    required this.grossPayout,
    required this.platformFee,
    required this.taxEstimate,
    required this.loanInterestPaid,
    required this.loanPrincipalRepaid,
    required this.netProceeds,
    required this.ownCashInvested,
    required this.netProfit,
    required this.moic,
    required this.annualisedReturn,
    required this.irr,
  });

  final double capitalReturned;
  final double preferredReturnPaid;
  final double profitShare;
  final double grossPayout;
  final double platformFee;
  final double taxEstimate;
  final double loanInterestPaid;
  final double loanPrincipalRepaid;
  final double netProceeds;
  final double ownCashInvested;
  final double netProfit;
  final double moic;
  final double annualisedReturn;
  final double irr;

  static InvestorScenario fromJson(Map j) => InvestorScenario(
    capitalReturned: asDouble(j['capitalReturned']),
    preferredReturnPaid: asDouble(j['preferredReturnPaid']),
    profitShare: asDouble(j['profitShare']),
    grossPayout: asDouble(j['grossPayout']),
    platformFee: asDouble(j['platformFee']),
    taxEstimate: asDouble(j['taxEstimate']),
    loanInterestPaid: asDouble(j['loanInterestPaid']),
    loanPrincipalRepaid: asDouble(j['loanPrincipalRepaid']),
    netProceeds: asDouble(j['netProceeds']),
    ownCashInvested: asDouble(j['ownCashInvested']),
    netProfit: asDouble(j['netProfit']),
    moic: asDouble(j['moic']),
    annualisedReturn: asDouble(j['annualisedReturn']),
    irr: asDouble(j['irr']),
  );
}

/// Full per-investor projection returned by `calculateInvestmentProjection`.
class InvestmentProjection {
  const InvestmentProjection({
    required this.numberOfShares,
    required this.sharePrice,
    required this.ownershipPercentage,
    required this.shareClassName,
    required this.downside,
    required this.base,
    required this.upside,
    required this.summary,
    required this.disclaimer,
    required this.usesFinancing,
    required this.ownCashInvested,
    required this.loanAmount,
    required this.defaultStrategy,
    required this.availableStrategies,
    required this.projectHoldMonths,
    required this.preferredReturnRate,
  });

  final double numberOfShares;
  final double sharePrice;
  final double ownershipPercentage;
  final String shareClassName;
  final InvestorScenario downside;
  final InvestorScenario base;
  final InvestorScenario upside;
  final String summary;
  final String disclaimer;
  final bool usesFinancing;
  final double ownCashInvested;
  final double loanAmount;
  final InvestorStrategy? defaultStrategy;
  final List<InvestorStrategy> availableStrategies;
  final int projectHoldMonths;
  final double preferredReturnRate;

  static InvestmentProjection? fromJson(dynamic json) {
    if (json is! Map) return null;
    final share = json['share'];
    final proj = json['projection'];
    if (share is! Map || proj is! Map) return null;
    final scenarios = proj['scenarios'];
    if (scenarios is! Map) return null;
    final strategies =
        (json['availableStrategies'] as List?)
            ?.map((e) => InvestorStrategy.fromWire(e?.toString()))
            .whereType<InvestorStrategy>()
            .toList() ??
        <InvestorStrategy>[];
    return InvestmentProjection(
      numberOfShares: asDouble(share['numberOfShares']),
      sharePrice: asDouble(share['sharePrice']),
      ownershipPercentage: asDouble(share['ownershipPercentage']),
      shareClassName: asString(share['shareClassName'], 'Ordinary'),
      downside: InvestorScenario.fromJson(scenarios['downside'] as Map),
      base: InvestorScenario.fromJson(scenarios['base'] as Map),
      upside: InvestorScenario.fromJson(scenarios['upside'] as Map),
      summary: asString(proj['summary']),
      disclaimer: asString(proj['disclaimer']),
      usesFinancing: proj['usesFinancing'] == true,
      ownCashInvested: asDouble(proj['ownCashInvested']),
      loanAmount: asDouble(proj['loanAmount']),
      defaultStrategy: InvestorStrategy.fromWire(
        json['defaultStrategy']?.toString(),
      ),
      availableStrategies: strategies,
      projectHoldMonths: asInt(json['projectHoldMonths']),
      preferredReturnRate: asDouble(json['preferredReturnRate']),
    );
  }
}

/// The investor's current strategy selection in the invest form.
class StrategyConfig {
  const StrategyConfig({
    this.strategy,
    this.holdMonths,
    this.usesFinancing = false,
    this.financingAmount = 0,
    this.financingRate = 11.75,
    this.financingTermMonths = 60,
    this.stressDownPct = 10,
    this.stressUpPct = 10,
  });

  final InvestorStrategy? strategy;
  final int? holdMonths;
  final bool usesFinancing;
  final double financingAmount;
  final double financingRate;
  final int financingTermMonths;
  final int stressDownPct;
  final int stressUpPct;

  StrategyConfig copyWith({
    InvestorStrategy? strategy,
    int? holdMonths,
    bool? usesFinancing,
    double? financingAmount,
    double? financingRate,
    int? financingTermMonths,
    int? stressDownPct,
    int? stressUpPct,
  }) => StrategyConfig(
    strategy: strategy ?? this.strategy,
    holdMonths: holdMonths ?? this.holdMonths,
    usesFinancing: usesFinancing ?? this.usesFinancing,
    financingAmount: financingAmount ?? this.financingAmount,
    financingRate: financingRate ?? this.financingRate,
    financingTermMonths: financingTermMonths ?? this.financingTermMonths,
    stressDownPct: stressDownPct ?? this.stressDownPct,
    stressUpPct: stressUpPct ?? this.stressUpPct,
  );
}
