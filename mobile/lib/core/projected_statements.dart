import 'dart:math' as math;

import 'financial_calculations.dart';
import 'format.dart';

/// Projected financial statements engine (Dart port of the web
/// `src/projected-statements.ts`). Produces period-by-period PROJECTED
/// Income Statement, Cash Flow Statement and Balance Sheet for flip, rental
/// and development properties. The balance sheet balances by construction.
///
/// All figures are indicative planning numbers in ZAR; they ignore VAT timing,
/// working-capital movements and receivables/payables (cash == accrual within
/// each period). They exist to show investors how a project is projected to
/// perform over time — not as audited accounts.

const double _defaultTaxRate = 0.27;

enum StatementType { flip, rental, development }

class StatementPeriod {
  const StatementPeriod({
    required this.label,
    required this.revenue,
    required this.costOfSales,
    required this.grossProfit,
    required this.operatingExpenses,
    required this.depreciation,
    required this.operatingProfit,
    required this.interest,
    required this.profitBeforeTax,
    required this.tax,
    required this.netProfit,
    required this.cashFromOperations,
    required this.cashFromInvesting,
    required this.cashFromFinancing,
    required this.netCashFlow,
    required this.openingCash,
    required this.closingCash,
    required this.propertyAsset,
    required this.cash,
    required this.totalAssets,
    required this.debt,
    required this.totalLiabilities,
    required this.contributedEquity,
    required this.retainedEarnings,
    required this.totalEquity,
    required this.balanceCheck,
    this.marketValue,
  });

  final String label;
  // Income statement
  final double revenue;
  final double costOfSales;
  final double grossProfit;
  final double operatingExpenses;
  final double depreciation;
  final double operatingProfit;
  final double interest;
  final double profitBeforeTax;
  final double tax;
  final double netProfit;
  // Cash flow statement
  final double cashFromOperations;
  final double cashFromInvesting;
  final double cashFromFinancing;
  final double netCashFlow;
  final double openingCash;
  final double closingCash;
  // Balance sheet (period end)
  final double propertyAsset;
  final double cash;
  final double totalAssets;
  final double debt;
  final double totalLiabilities;
  final double contributedEquity;
  final double retainedEarnings;
  final double totalEquity;
  final double balanceCheck;
  final double? marketValue;
}

class StatementAssumption {
  const StatementAssumption(this.label, this.value);
  final String label;
  final String value;
}

class StatementTotals {
  const StatementTotals({
    required this.revenue,
    required this.netProfit,
    required this.peakFundingDrawn,
    required this.closingCash,
    required this.closingEquity,
  });

  final double revenue;
  final double netProfit;
  final double peakFundingDrawn;
  final double closingCash;
  final double closingEquity;
}

class ProjectedStatements {
  const ProjectedStatements({
    required this.type,
    required this.periodicity,
    required this.propertyAssetLabel,
    required this.periods,
    required this.assumptions,
    required this.totals,
    this.developmentType,
  });

  final StatementType type;
  final DevelopmentType? developmentType;
  final String periodicity; // 'phase' | 'annual'
  final String propertyAssetLabel;
  final List<StatementPeriod> periods;
  final List<StatementAssumption> assumptions;
  final StatementTotals totals;
}

class _PeriodInput {
  _PeriodInput({
    required this.label,
    this.revenue = 0,
    this.costOfSales = 0,
    this.operatingExpenses = 0,
    this.depreciation = 0,
    this.interest = 0,
    this.capex = 0,
    this.debtDrawn = 0,
    this.debtRepaid = 0,
    this.equityIn = 0,
    this.marketValue,
  });

  final String label;
  final double revenue;
  final double costOfSales;
  final double operatingExpenses;
  final double depreciation;
  final double interest;
  final double capex;
  final double debtDrawn;
  final double debtRepaid;
  final double equityIn;
  final double distributions = 0;
  final double? marketValue;
}

ProjectedStatements _buildStatements(
  List<_PeriodInput> periods, {
  required StatementType type,
  required String periodicity,
  required String propertyAssetLabel,
  DevelopmentType? developmentType,
  double? taxRate,
  List<StatementAssumption> assumptions = const [],
  double openingCash = 0,
  double openingPropertyAsset = 0,
  double openingDebt = 0,
  double openingContributedEquity = 0,
  double openingRetainedEarnings = 0,
}) {
  final rate = taxRate ?? _defaultTaxRate;
  double cash = openingCash;
  double property = openingPropertyAsset;
  double debt = openingDebt;
  double contributed = openingContributedEquity;
  double retained = openingRetainedEarnings;
  double taxLossCarry = 0;
  double peakFundingDrawn = debt;

  final out = <StatementPeriod>[];

  for (final p in periods) {
    final revenue = p.revenue;
    final cogs = p.costOfSales;
    final opex = p.operatingExpenses;
    final depr = p.depreciation;
    final interest = p.interest;

    final grossProfit = revenue - cogs;
    final operatingProfit = grossProfit - opex - depr;
    final pbt = operatingProfit - interest;

    double tax = 0;
    if (pbt > 0) {
      final taxable = math.max(0, pbt - taxLossCarry).toDouble();
      taxLossCarry = math.max(0, taxLossCarry - pbt).toDouble();
      tax = taxable * rate;
    } else {
      taxLossCarry += -pbt;
    }
    final netProfit = pbt - tax;

    final capex = p.capex;
    final debtDrawn = p.debtDrawn;
    final debtRepaid = p.debtRepaid;
    final equityIn = p.equityIn;
    final distributions = p.distributions;

    final cashFromOperations = revenue - opex - interest - tax;
    final cashFromInvesting = -capex;
    final cashFromFinancing = equityIn + debtDrawn - debtRepaid - distributions;
    final netCashFlow =
        cashFromOperations + cashFromInvesting + cashFromFinancing;

    final openingCashP = cash;
    cash = openingCashP + netCashFlow;
    property = property + capex - cogs - depr;
    debt = debt + debtDrawn - debtRepaid;
    contributed = contributed + equityIn;
    retained = retained + netProfit - distributions;

    peakFundingDrawn = math.max(peakFundingDrawn, debt).toDouble();

    final totalAssets = property + cash;
    final totalLiabilities = debt;
    final totalEquity = contributed + retained;

    out.add(
      StatementPeriod(
        label: p.label,
        revenue: revenue,
        costOfSales: cogs,
        grossProfit: grossProfit,
        operatingExpenses: opex,
        depreciation: depr,
        operatingProfit: operatingProfit,
        interest: interest,
        profitBeforeTax: pbt,
        tax: tax,
        netProfit: netProfit,
        cashFromOperations: cashFromOperations,
        cashFromInvesting: cashFromInvesting,
        cashFromFinancing: cashFromFinancing,
        netCashFlow: netCashFlow,
        openingCash: openingCashP,
        closingCash: cash,
        propertyAsset: property,
        cash: cash,
        totalAssets: totalAssets,
        debt: debt,
        totalLiabilities: totalLiabilities,
        contributedEquity: contributed,
        retainedEarnings: retained,
        totalEquity: totalEquity,
        marketValue: p.marketValue,
        balanceCheck: totalAssets - (totalLiabilities + totalEquity),
      ),
    );
  }

  return ProjectedStatements(
    type: type,
    developmentType: developmentType,
    periodicity: periodicity,
    propertyAssetLabel: propertyAssetLabel,
    periods: out,
    assumptions: assumptions,
    totals: StatementTotals(
      revenue: out.fold(0, (a, s) => a + s.revenue),
      netProfit: out.fold(0, (a, s) => a + s.netProfit),
      peakFundingDrawn: peakFundingDrawn,
      closingCash: out.isNotEmpty ? out.last.closingCash : 0,
      closingEquity: out.isNotEmpty ? out.last.totalEquity : 0,
    ),
  );
}

String _zar(double n) => Fmt.money(n.isFinite ? n : 0);

// ── FLIP — buy / renovate / sell shown in two phases. ──────────────────────
ProjectedStatements projectFlipStatements(PropertyFlipInput f, {double? taxRate}) {
  final salePrice = f.afterRepairValue != 0 ? f.afterRepairValue : f.estimatedValue;
  final purchase = f.purchasePrice;
  final reno = f.renovationBudget != 0 ? f.renovationBudget : f.estimatedRepairCosts;
  final buyCosts = f.closingCostsPurchase;
  final sellCosts = f.closingCostsSale;
  final holding = f.holdingCosts;
  final capitalised = purchase + buyCosts + reno;
  final monthsRaw = (f.daysToComplete / 30).round();
  final months = math.max(1, monthsRaw == 0 ? 6 : monthsRaw);

  final periods = <_PeriodInput>[
    _PeriodInput(
      label: 'Acquisition & Renovation (~$months mo)',
      capex: capitalised,
      operatingExpenses: holding,
      equityIn: capitalised + holding,
    ),
    _PeriodInput(
      label: 'Disposal (Sale)',
      revenue: salePrice,
      costOfSales: capitalised,
      operatingExpenses: sellCosts,
    ),
  ];

  return _buildStatements(
    periods,
    type: StatementType.flip,
    periodicity: 'phase',
    propertyAssetLabel: 'Property inventory (held for resale)',
    taxRate: taxRate,
    assumptions: [
      StatementAssumption('Purchase price', _zar(purchase)),
      StatementAssumption('Renovation budget', _zar(reno)),
      StatementAssumption('Expected resale (ARV)', _zar(salePrice)),
      StatementAssumption('Holding period', '~$months months'),
      StatementAssumption('Funding', '100% equity (indicative)'),
    ],
  );
}

// ── RENTAL — buy-to-let held over a multi-year horizon. ────────────────────
ProjectedStatements projectRentalStatements(
  RentalPropertyInput r, {
  int years = 5,
  double rentEscalation = 6,
  double inflation = 5,
  double? taxRate,
}) {
  final yrs = years.clamp(1, 30);
  final rentEsc = rentEscalation / 100;
  final infl = inflation / 100;
  final appreciation = (r.appreciationRate != 0 ? r.appreciationRate : 3) / 100;
  final price = r.purchasePrice;
  final closing = r.closingCosts;
  final propertyCost = price + closing;

  final rate = r.interestRate / 100;
  final debt = r.loanAmount;
  final monthlyDS = r.monthlyDebtService != 0
      ? r.monthlyDebtService
      : (debt > 0 && r.loanTermYears > 0
            ? calculateMonthlyDebtService(debt, r.interestRate, r.loanTermYears)
            : 0.0);
  final annualDebtService = monthlyDS * 12;

  final opexBase = r.annualPropertyTax +
      r.annualInsurance +
      (r.monthlyHOAFees +
              r.monthlyMaintenanceReserve +
              r.monthlyUtilities +
              r.monthlyManagementFee) *
          12;

  final periods = <_PeriodInput>[];
  double runningDebt = debt;
  for (var y = 1; y <= yrs; y++) {
    final grossRent = r.monthlyRent * 12 * math.pow(1 + rentEsc, y - 1);
    final vacancy = grossRent * (r.vacancyRate / 100);
    final revenue = (grossRent - vacancy).toDouble();
    final opex = opexBase * math.pow(1 + infl, y - 1);
    final interest = runningDebt * rate;
    double principal = 0;
    if (annualDebtService > 0 && runningDebt > 0) {
      principal =
          math.min(runningDebt, math.max(0, annualDebtService - interest)).toDouble();
    }
    runningDebt -= principal;
    periods.add(
      _PeriodInput(
        label: 'Year $y',
        revenue: revenue,
        operatingExpenses: opex.toDouble(),
        interest: interest,
        debtRepaid: principal,
        marketValue: (price * math.pow(1 + appreciation, y)).toDouble(),
      ),
    );
  }

  return _buildStatements(
    periods,
    type: StatementType.rental,
    periodicity: 'annual',
    propertyAssetLabel: 'Investment property (at cost)',
    taxRate: taxRate,
    openingPropertyAsset: propertyCost,
    openingDebt: debt,
    openingContributedEquity: math.max(0, propertyCost - debt).toDouble(),
    assumptions: [
      StatementAssumption('Property cost (incl. acquisition)', _zar(propertyCost)),
      StatementAssumption('Bond / loan', _zar(debt)),
      StatementAssumption('Starting monthly rent', _zar(r.monthlyRent)),
      StatementAssumption('Rent escalation', '${(rentEsc * 100).toStringAsFixed(1)}% p.a.'),
      StatementAssumption('Vacancy allowance', '${r.vacancyRate.toStringAsFixed(1)}%'),
      StatementAssumption('Cost inflation', '${(infl * 100).toStringAsFixed(1)}% p.a.'),
      StatementAssumption('Capital growth (memo)', '${(appreciation * 100).toStringAsFixed(1)}% p.a.'),
    ],
  );
}

// ── DEVELOPMENT — greenfield build, then sale or hold. ─────────────────────
class DevelopmentStatementsInput {
  const DevelopmentStatementsInput({
    required this.developmentType,
    required this.landCost,
    required this.hardCosts,
    required this.softCosts,
    required this.contingencyAmount,
    required this.financingCosts,
    required this.timelineMonths,
    required this.grossDevelopmentValue,
    required this.equityAmount,
    required this.seniorDebtAmount,
    required this.debtAnnualRate,
    this.annualGrossRent = 0,
    this.annualOperatingExpenses = 0,
    this.stabilizedCapRate = 0,
    this.operatingYears = 5,
  });

  final DevelopmentType developmentType;
  final double landCost;
  final double hardCosts;
  final double softCosts;
  final double contingencyAmount;
  final double financingCosts;
  final double timelineMonths;
  final double grossDevelopmentValue;
  final double equityAmount;
  final double seniorDebtAmount;
  final double debtAnnualRate;
  final double annualGrossRent;
  final double annualOperatingExpenses;
  final double stabilizedCapRate;
  final int operatingYears;
}

ProjectedStatements projectDevelopmentStatements(
  DevelopmentStatementsInput d, {
  double? taxRate,
}) {
  final isResale = d.developmentType == DevelopmentType.affordableResale;
  final rate = d.debtAnnualRate / 100;
  final land = d.landCost;
  final buildCost = d.hardCosts + d.softCosts + d.contingencyAmount;
  final financing = d.financingCosts;
  final totalCapitalised = land + buildCost + financing;
  final months = math.max(1, d.timelineMonths.round());
  final buildYears = math.max(1, (months / 12).ceil());

  double equityRemaining = d.equityAmount;
  double runningDebt = 0;
  final periods = <_PeriodInput>[];

  final spreadable = buildCost + financing;
  for (var y = 1; y <= buildYears; y++) {
    final capex = (y == 1 ? land : 0) + spreadable / buildYears;
    final interest = runningDebt * rate;
    final need = capex + interest;
    final fromEquity = math.min(equityRemaining, need).toDouble();
    equityRemaining -= fromEquity;
    final fromDebt = math.max(0, need - fromEquity).toDouble();
    runningDebt += fromDebt;
    periods.add(
      _PeriodInput(
        label: buildYears == 1 ? 'Construction' : 'Construction — Year $y',
        capex: capex.toDouble(),
        interest: interest,
        equityIn: fromEquity,
        debtDrawn: fromDebt,
      ),
    );
  }

  if (isResale) {
    periods.add(
      _PeriodInput(
        label: 'Completion & Sales',
        revenue: d.grossDevelopmentValue,
        costOfSales: totalCapitalised,
        debtRepaid: runningDebt,
      ),
    );
    return _buildStatements(
      periods,
      type: StatementType.development,
      developmentType: d.developmentType,
      periodicity: 'annual',
      propertyAssetLabel: 'Development in progress (inventory)',
      taxRate: taxRate,
      assumptions: _developmentAssumptions(d, totalCapitalised),
    );
  }

  final operatingYears = d.operatingYears.clamp(1, 20);
  final grossRent = d.annualGrossRent;
  final opex = d.annualOperatingExpenses;
  final annualDepreciation =
      d.developmentType == DevelopmentType.commercialRental ? d.hardCosts / 20 : 0.0;
  final stabilisedValue = d.stabilizedCapRate > 0
      ? (grossRent - opex) / (d.stabilizedCapRate / 100)
      : totalCapitalised;

  for (var y = 1; y <= operatingYears; y++) {
    final escalated = math.pow(1.06, y - 1);
    periods.add(
      _PeriodInput(
        label: 'Operations — Year $y',
        revenue: (grossRent * escalated).toDouble(),
        operatingExpenses: (opex * math.pow(1.05, y - 1)).toDouble(),
        depreciation: annualDepreciation,
        interest: runningDebt * rate,
        marketValue: stabilisedValue.toDouble(),
      ),
    );
  }

  return _buildStatements(
    periods,
    type: StatementType.development,
    developmentType: d.developmentType,
    periodicity: 'annual',
    propertyAssetLabel: 'Investment property under development',
    taxRate: taxRate,
    assumptions: _developmentAssumptions(d, totalCapitalised),
  );
}

List<StatementAssumption> _developmentAssumptions(
  DevelopmentStatementsInput d,
  double totalCapitalised,
) {
  final base = <StatementAssumption>[
    StatementAssumption('Land cost', _zar(d.landCost)),
    StatementAssumption('Build cost (hard + soft + contingency)',
        _zar(d.hardCosts + d.softCosts + d.contingencyAmount)),
    StatementAssumption('Total development cost', _zar(totalCapitalised)),
    StatementAssumption('Equity', _zar(d.equityAmount)),
    StatementAssumption('Senior debt', _zar(d.seniorDebtAmount)),
    StatementAssumption('Debt rate', '${d.debtAnnualRate.toStringAsFixed(1)}% p.a.'),
    StatementAssumption('Programme', '${math.max(1, d.timelineMonths.round())} months'),
  ];
  if (d.developmentType == DevelopmentType.affordableResale) {
    base.add(StatementAssumption(
        'Gross development value', _zar(d.grossDevelopmentValue)));
  } else {
    base.add(
        StatementAssumption('Stabilised annual rent', _zar(d.annualGrossRent)));
    if (d.stabilizedCapRate != 0) {
      base.add(StatementAssumption(
          'Exit cap rate', '${d.stabilizedCapRate.toStringAsFixed(2)}%'));
    }
  }
  return base;
}

// ── Dispatcher — build the right statements from typed opportunity inputs. ──
ProjectedStatements? buildStatementsFromInputs({
  PropertyFlipInput? flip,
  RentalPropertyInput? rental,
  PropertyDevelopmentInput? development,
  int rentalYears = 5,
  int? developmentOperatingYears,
  double? taxRate,
}) {
  if (development != null) {
    final hardCosts = development.hardCosts;
    final softCosts = development.softCosts;
    final contingencyAmount = development.contingencyAmount != 0
        ? development.contingencyAmount
        : (hardCosts + softCosts) * development.contingencyPercent / 100;
    final units = development.numberOfUnits;
    final gdv = development.totalExpectedRevenue != 0
        ? development.totalExpectedRevenue
        : units * development.expectedSalePricePerUnit;
    final annualGrossRent = units * development.expectedMonthlyRentPerUnit * 12;

    final input = DevelopmentStatementsInput(
      developmentType: development.developmentType,
      landCost: development.landAcquisitionCost,
      hardCosts: hardCosts,
      softCosts: softCosts,
      contingencyAmount: contingencyAmount,
      financingCosts: development.financingCosts,
      timelineMonths: development.developmentTimelineMonths != 0
          ? development.developmentTimelineMonths
          : 12,
      grossDevelopmentValue: gdv,
      // The mobile PropertyDevelopmentInput does not carry the equity/debt
      // split or debt rate, so capital is treated as fully equity-funded
      // (indicative) — mirrors the web engine when those fields are absent.
      equityAmount: _devEquity(development),
      seniorDebtAmount: 0,
      debtAnnualRate: 0,
      annualGrossRent: annualGrossRent,
      annualOperatingExpenses: development.annualOperatingExpenses,
      stabilizedCapRate: development.stabilizedCapRate,
      operatingYears: developmentOperatingYears ?? 5,
    );
    if (input.landCost + input.hardCosts + input.softCosts <= 0) return null;
    return projectDevelopmentStatements(input, taxRate: taxRate);
  }

  if (rental != null) {
    if (rental.purchasePrice <= 0 && rental.monthlyRent <= 0) return null;
    return projectRentalStatements(rental, years: rentalYears, taxRate: taxRate);
  }

  if (flip != null) {
    final sale = flip.afterRepairValue != 0 ? flip.afterRepairValue : flip.estimatedValue;
    if (flip.purchasePrice <= 0 && sale <= 0) return null;
    return projectFlipStatements(flip, taxRate: taxRate);
  }

  return null;
}

// The mobile PropertyDevelopmentInput does not carry the equity/debt split or
// debt rate, so capital is treated as fully equity-funded (indicative) — this
// mirrors the web engine when those fields are absent.
double _devEquity(PropertyDevelopmentInput d) =>
    d.totalBudget != 0 ? d.totalBudget : (d.landAcquisitionCost + d.hardCosts + d.softCosts + d.financingCosts);
