/// Owner rental financial performance + renovation projections.
/// Pure Dart mirror of `src/financial-calculations.ts` (computeRentalProjections)
/// so the mobile submission forms show the same due-diligence projections as web.
library;

/// Owner-supplied financial performance for an income-producing property.
/// All monetary values are ZAR; monthly unless the name says annual.
class RentalFinancials {
  const RentalFinancials({
    this.isIncomeProducing = false,
    this.numberOfUnits,
    this.occupancyRate,
    this.currentMonthlyRent,
    this.ratesMonthly,
    this.leviesMonthly,
    this.insuranceMonthly,
    this.managementMonthly,
    this.maintenanceMonthly,
    this.utilitiesMonthly,
    this.otherOpexMonthly,
    this.renovationBudget,
    this.renovationMonths,
    this.projectedMonthlyRent,
    this.projectedOccupancyRate,
    this.leaseTermMonths,
    this.leaseEscalationPct,
    this.leaseExpiry,
  });

  final bool isIncomeProducing;
  final int? numberOfUnits;
  final double? occupancyRate;
  final double? currentMonthlyRent;
  final double? ratesMonthly;
  final double? leviesMonthly;
  final double? insuranceMonthly;
  final double? managementMonthly;
  final double? maintenanceMonthly;
  final double? utilitiesMonthly;
  final double? otherOpexMonthly;
  final double? renovationBudget;
  final int? renovationMonths;
  final double? projectedMonthlyRent;
  final double? projectedOccupancyRate;
  final int? leaseTermMonths;
  final double? leaseEscalationPct;
  final String? leaseExpiry;

  /// True when the owner supplied enough to render a meaningful projection.
  bool get hasData =>
      isIncomeProducing ||
      (currentMonthlyRent ?? 0) > 0 ||
      (projectedMonthlyRent ?? 0) > 0;

  /// API payload — null when not income-producing so the field is omitted.
  Map<String, dynamic>? toInput() {
    if (!isIncomeProducing) return null;
    final m = <String, dynamic>{'isIncomeProducing': true};
    void put(String k, Object? v) {
      if (v != null) m[k] = v;
    }

    put('numberOfUnits', numberOfUnits);
    put('occupancyRate', occupancyRate);
    put('currentMonthlyRent', currentMonthlyRent);
    put('ratesMonthly', ratesMonthly);
    put('leviesMonthly', leviesMonthly);
    put('insuranceMonthly', insuranceMonthly);
    put('managementMonthly', managementMonthly);
    put('maintenanceMonthly', maintenanceMonthly);
    put('utilitiesMonthly', utilitiesMonthly);
    put('otherOpexMonthly', otherOpexMonthly);
    put('renovationBudget', renovationBudget);
    put('renovationMonths', renovationMonths);
    put('projectedMonthlyRent', projectedMonthlyRent);
    put('projectedOccupancyRate', projectedOccupancyRate);
    put('leaseTermMonths', leaseTermMonths);
    put('leaseEscalationPct', leaseEscalationPct);
    if (leaseExpiry != null && leaseExpiry!.isNotEmpty) {
      m['leaseExpiry'] = leaseExpiry;
    }
    return m;
  }

  /// Parse the server `financials` JSON (used by detail views).
  static RentalFinancials? fromJson(dynamic json) {
    if (json is! Map) return null;
    double? d(dynamic v) => v is num ? v.toDouble() : null;
    int? i(dynamic v) => v is num ? v.toInt() : null;
    return RentalFinancials(
      isIncomeProducing: json['isIncomeProducing'] == true,
      numberOfUnits: i(json['numberOfUnits']),
      occupancyRate: d(json['occupancyRate']),
      currentMonthlyRent: d(json['currentMonthlyRent']),
      ratesMonthly: d(json['ratesMonthly']),
      leviesMonthly: d(json['leviesMonthly']),
      insuranceMonthly: d(json['insuranceMonthly']),
      managementMonthly: d(json['managementMonthly']),
      maintenanceMonthly: d(json['maintenanceMonthly']),
      utilitiesMonthly: d(json['utilitiesMonthly']),
      otherOpexMonthly: d(json['otherOpexMonthly']),
      renovationBudget: d(json['renovationBudget']),
      renovationMonths: i(json['renovationMonths']),
      projectedMonthlyRent: d(json['projectedMonthlyRent']),
      projectedOccupancyRate: d(json['projectedOccupancyRate']),
      leaseTermMonths: i(json['leaseTermMonths']),
      leaseEscalationPct: d(json['leaseEscalationPct']),
      leaseExpiry: json['leaseExpiry']?.toString(),
    );
  }
}

/// One income scenario (current or post-renovation).
class RentalScenario {
  const RentalScenario({
    required this.grossAnnualRent,
    required this.annualOperatingExpenses,
    required this.noi,
    required this.grossYield,
    required this.netYield,
  });

  final double grossAnnualRent;
  final double annualOperatingExpenses;
  final double noi;
  final double grossYield;
  final double netYield;
}

/// Computed current vs post-renovation projections.
class RentalProjections {
  const RentalProjections({
    required this.baseValue,
    required this.stabilisedValue,
    required this.current,
    required this.projected,
    required this.renovationBudget,
    required this.renovationMonths,
    required this.noiUpliftAnnual,
    required this.yieldOnCostProjected,
    required this.returnOnRenovation,
  });

  final double baseValue;
  final double stabilisedValue;
  final RentalScenario current;
  final RentalScenario projected;
  final double renovationBudget;
  final int renovationMonths;
  final double noiUpliftAnnual;
  final double yieldOnCostProjected;
  final double returnOnRenovation;
}

/// Compute current and post-renovation rental projections. Mirrors the web
/// `computeRentalProjections`. Defensive — missing fields default to 0.
RentalProjections computeRentalProjections(
  RentalFinancials f,
  double baseValue,
) {
  final monthlyOpex = (f.ratesMonthly ?? 0) +
      (f.leviesMonthly ?? 0) +
      (f.insuranceMonthly ?? 0) +
      (f.managementMonthly ?? 0) +
      (f.maintenanceMonthly ?? 0) +
      (f.utilitiesMonthly ?? 0) +
      (f.otherOpexMonthly ?? 0);
  final annualOpex = monthlyOpex * 12;

  RentalScenario scenario(double monthlyRent, double occupancyRate, double value) {
    final grossAnnualRent = (monthlyRent < 0 ? 0 : monthlyRent) * 12;
    final occ = occupancyRate > 0
        ? (occupancyRate > 100 ? 100 : occupancyRate)
        : (monthlyRent > 0 ? 100 : 0);
    final vacancyRate = 100 - occ;
    final vacancyLoss = grossAnnualRent * (vacancyRate / 100);
    final effectiveGrossIncome = grossAnnualRent - vacancyLoss;
    final noi = effectiveGrossIncome - annualOpex;
    final grossYield = value > 0 ? (grossAnnualRent / value) * 100 : 0.0;
    final netYield = value > 0 ? (noi / value) * 100 : 0.0;
    return RentalScenario(
      grossAnnualRent: grossAnnualRent.toDouble(),
      annualOperatingExpenses: annualOpex,
      noi: noi,
      grossYield: grossYield,
      netYield: netYield,
    );
  }

  final base = baseValue < 0 ? 0.0 : baseValue;
  final reno = (f.renovationBudget ?? 0) < 0 ? 0.0 : (f.renovationBudget ?? 0);
  final stabilisedValue = base + reno;

  final current = scenario(f.currentMonthlyRent ?? 0, f.occupancyRate ?? 0, base);
  final projected = scenario(
    f.projectedMonthlyRent ?? f.currentMonthlyRent ?? 0,
    f.projectedOccupancyRate ?? f.occupancyRate ?? 0,
    stabilisedValue,
  );

  final noiUpliftAnnual = projected.noi - current.noi;
  final yieldOnCostProjected =
      stabilisedValue > 0 ? (projected.noi / stabilisedValue) * 100 : 0.0;
  final returnOnRenovation = reno > 0 ? (noiUpliftAnnual / reno) * 100 : 0.0;

  return RentalProjections(
    baseValue: base,
    stabilisedValue: stabilisedValue,
    current: current,
    projected: projected,
    renovationBudget: reno,
    renovationMonths: f.renovationMonths ?? 0,
    noiUpliftAnnual: noiUpliftAnnual,
    yieldOnCostProjected: yieldOnCostProjected,
    returnOnRenovation: returnOnRenovation,
  );
}
