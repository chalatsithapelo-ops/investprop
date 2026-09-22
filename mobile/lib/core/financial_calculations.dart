import 'dart:math' as math;

/// Financial calculation utilities for real estate investment analysis.
///
/// Direct Dart port of the web app's `src/financial-calculations.ts` pure
/// functions so the Flutter app shows the SAME investment analysis and
/// financing-deal numbers as the web platform. All functions are pure (no I/O).

// ============================================================================
// INPUT TYPES
// ============================================================================

class PropertyFlipInput {
  const PropertyFlipInput({
    this.purchasePrice = 0,
    this.renovationBudget = 0,
    this.estimatedValue = 0,
    this.holdingCosts = 0,
    this.closingCostsPurchase = 0,
    this.closingCostsSale = 0,
    this.estimatedRepairCosts = 0,
    this.afterRepairValue = 0,
    this.maxOfferPrice = 0,
    this.expectedROI = 0,
    this.expectedProfitMargin = 0,
    this.daysToComplete = 0,
    this.totalInvestmentBudget = 0,
    this.spentInvestmentBudget = 0,
  });

  final double purchasePrice;
  final double renovationBudget;
  final double estimatedValue;
  final double holdingCosts;
  final double closingCostsPurchase;
  final double closingCostsSale;
  final double estimatedRepairCosts;
  final double afterRepairValue;
  final double maxOfferPrice;
  final double expectedROI;
  final double expectedProfitMargin;
  final double daysToComplete;
  final double totalInvestmentBudget;
  final double spentInvestmentBudget;
}

class RentalPropertyInput {
  const RentalPropertyInput({
    this.purchasePrice = 0,
    this.monthlyRent = 0,
    this.annualPropertyTax = 0,
    this.annualInsurance = 0,
    this.monthlyHOAFees = 0,
    this.monthlyMaintenanceReserve = 0,
    this.monthlyUtilities = 0,
    this.monthlyManagementFee = 0,
    this.vacancyRate = 5,
    this.appreciationRate = 3,
    this.capRate = 0,
    this.downPaymentAmount = 0,
    this.loanAmount = 0,
    this.interestRate = 0,
    this.loanTermYears = 0,
    this.monthlyDebtService = 0,
    this.totalInvestmentBudget = 0,
    this.spentInvestmentBudget = 0,
    this.closingCosts = 0,
  });

  final double purchasePrice;
  final double monthlyRent;
  final double annualPropertyTax;
  final double annualInsurance;
  final double monthlyHOAFees;
  final double monthlyMaintenanceReserve;
  final double monthlyUtilities;
  final double monthlyManagementFee;
  final double vacancyRate;
  final double appreciationRate;
  final double capRate;
  final double downPaymentAmount;
  final double loanAmount;
  final double interestRate;
  final double loanTermYears;
  final double monthlyDebtService;
  final double totalInvestmentBudget;
  final double spentInvestmentBudget;
  final double closingCosts;
}

enum DevelopmentType { affordableResale, affordableRental, commercialRental }

DevelopmentType developmentTypeFromString(String? value) {
  switch (value) {
    case 'AFFORDABLE_RENTAL':
      return DevelopmentType.affordableRental;
    case 'COMMERCIAL_RENTAL':
      return DevelopmentType.commercialRental;
    case 'AFFORDABLE_RESALE':
    default:
      return DevelopmentType.affordableResale;
  }
}

class PropertyDevelopmentInput {
  const PropertyDevelopmentInput({
    this.developmentType = DevelopmentType.affordableResale,
    this.landAcquisitionCost = 0,
    this.hardCosts = 0,
    this.softCosts = 0,
    this.financingCosts = 0,
    this.contingencyPercent = 0,
    this.contingencyAmount = 0,
    this.expectedSalePricePerUnit = 0,
    this.totalExpectedRevenue = 0,
    this.expectedProfit = 0,
    this.expectedMonthlyRentPerUnit = 0,
    this.annualOperatingExpenses = 0,
    this.stabilizedCapRate = 0,
    this.expectedROI = 0,
    this.expectedIRR = 0,
    this.developmentTimelineMonths = 0,
    this.preSaleUnits = 0,
    this.numberOfUnits = 0,
    this.totalBudget = 0,
  });

  final DevelopmentType developmentType;
  final double landAcquisitionCost;
  final double hardCosts;
  final double softCosts;
  final double financingCosts;
  final double contingencyPercent;
  final double contingencyAmount;
  final double expectedSalePricePerUnit;
  final double totalExpectedRevenue;
  final double expectedProfit;
  final double expectedMonthlyRentPerUnit;
  final double annualOperatingExpenses;
  final double stabilizedCapRate;
  final double expectedROI;
  final double expectedIRR;
  final double developmentTimelineMonths;
  final double preSaleUnits;
  final double numberOfUnits;
  final double totalBudget;
}

// ============================================================================
// OUTPUT TYPES
// ============================================================================

class FlipCalculations {
  const FlipCalculations({
    required this.totalInvestment,
    required this.expectedProfit,
    required this.calculatedROI,
    required this.displayROI,
    required this.breakEvenPrice,
    required this.resaleValue,
    required this.annualisedROI,
    required this.holdingMonths,
    required this.estimatedTransferDuty,
    required this.marginOfSafety,
    required this.estimatedIncomeTax,
    required this.netProfitAfterFeesAndTax,
  });

  final double totalInvestment;
  final double expectedProfit;
  final double calculatedROI;
  final double displayROI;
  final double breakEvenPrice;
  final double resaleValue;
  final double annualisedROI;
  final double holdingMonths;
  final double estimatedTransferDuty;
  final double marginOfSafety;
  final double estimatedIncomeTax;
  final double netProfitAfterFeesAndTax;
}

class RentalCalculations {
  const RentalCalculations({
    required this.annualGrossRent,
    required this.annualOperatingExpenses,
    required this.vacancyLoss,
    required this.effectiveGrossIncome,
    required this.noi,
    required this.calculatedCapRate,
    required this.displayCapRate,
    required this.monthlyCashFlow,
    required this.annualCashFlow,
    required this.grossYield,
    required this.netYield,
    required this.cashOnCashReturn,
    required this.cashInvested,
    required this.estimatedTransferDuty,
    required this.allInCost,
    required this.capRateOnCost,
    required this.dscr,
    required this.grossRentMultiplier,
  });

  final double annualGrossRent;
  final double annualOperatingExpenses;
  final double vacancyLoss;
  final double effectiveGrossIncome;
  final double noi;
  final double calculatedCapRate;
  final double displayCapRate;
  final double monthlyCashFlow;
  final double annualCashFlow;
  final double grossYield;
  final double netYield;
  final double cashOnCashReturn;
  final double cashInvested;
  final double estimatedTransferDuty;
  final double allInCost;
  final double capRateOnCost;
  final double dscr;
  final double grossRentMultiplier;
}

class DevelopmentCalculations {
  const DevelopmentCalculations({
    required this.totalCosts,
    required this.profitMargin,
    required this.costPerUnit,
    required this.preSalePercentage,
    required this.contingencyAmount,
    this.grossDevelopmentValue,
    this.derivedProfit,
    this.derivedROI,
    this.annualisedROI,
    this.annualGrossRentalIncome,
    this.noi,
    this.calculatedCapRate,
    this.calculatedGrossYield,
    this.calculatedNetYield,
  });

  final double totalCosts;
  final double profitMargin;
  final double costPerUnit;
  final double preSalePercentage;
  final double contingencyAmount;
  final double? grossDevelopmentValue;
  final double? derivedProfit;
  final double? derivedROI;
  final double? annualisedROI;
  final double? annualGrossRentalIncome;
  final double? noi;
  final double? calculatedCapRate;
  final double? calculatedGrossYield;
  final double? calculatedNetYield;
}

// ============================================================================
// South African Tax & Time-Value Helpers
// ============================================================================

class _DutyBracket {
  const _DutyBracket(this.from, this.upTo, this.base, this.rate);
  final double from;
  final double upTo;
  final double base;
  final double rate;
}

/// SARS transfer-duty brackets effective 1 March 2025.
const List<_DutyBracket> _transferDutyBrackets = [
  _DutyBracket(0, 1210000, 0, 0),
  _DutyBracket(1210000, 1663800, 0, 0.03),
  _DutyBracket(1663800, 2329300, 13614, 0.06),
  _DutyBracket(2329300, 2994800, 53544, 0.08),
  _DutyBracket(2994800, 13310000, 106784, 0.11),
  _DutyBracket(13310000, double.infinity, 1241456, 0.13),
];

/// Calculate SARS transfer duty for a given property value (2025/26 scale).
double calculateTransferDuty(double value) {
  if (value <= 0) return 0;
  for (final b in _transferDutyBrackets) {
    if (value <= b.upTo) {
      return b.base + (value - b.from) * b.rate;
    }
  }
  return 0;
}

/// Standard South African VAT rate.
const double vatRate = 0.15;

double extractVat(double vatInclusivePrice) {
  if (vatInclusivePrice <= 0) return 0;
  return vatInclusivePrice - vatInclusivePrice / (1 + vatRate);
}

/// Indicative tax on a flip's gross profit (SARS trades property to resell as
/// ordinary income). Flat indicative rate (companies pay 27%). 0 for a loss.
double estimateFlipIncomeTax(double grossProfit, [double rate = 0.27]) {
  return grossProfit > 0 ? grossProfit * rate : 0;
}

/// Annualise a simple total return so deals of different durations compare.
double calculateAnnualisedReturn(double profit, double invested, double months) {
  if (invested <= 0) return 0;
  final periodReturn = profit / invested;
  if (months <= 0) return periodReturn * 100;
  if (periodReturn <= -1) return -100;
  final years = months / 12;
  return (math.pow(1 + periodReturn, 1 / years) - 1) * 100;
}

/// Solve the internal rate of return for equally-spaced cash flows (bisection).
double calculateIRRPerPeriod(List<double> cashFlows) {
  if (cashFlows.length < 2) return double.nan;
  final hasPositive = cashFlows.any((c) => c > 0);
  final hasNegative = cashFlows.any((c) => c < 0);
  if (!hasPositive || !hasNegative) return double.nan;

  double npv(double rate) {
    double acc = 0;
    for (var t = 0; t < cashFlows.length; t++) {
      acc += cashFlows[t] / math.pow(1 + rate, t);
    }
    return acc;
  }

  double low = -0.9999;
  double high = 1;
  final fLow = npv(low);
  double fHigh = npv(high);

  var expand = 0;
  while (fLow * fHigh > 0 && expand < 60) {
    high *= 1.5;
    fHigh = npv(high);
    expand += 1;
  }
  if (fLow * fHigh > 0) return double.nan;

  double mid = 0;
  double curFLow = fLow;
  for (var i = 0; i < 200; i++) {
    mid = (low + high) / 2;
    final fMid = npv(mid);
    if (fMid.abs() < 1e-6) return mid;
    if (curFLow * fMid < 0) {
      high = mid;
    } else {
      low = mid;
      curFLow = fMid;
    }
  }
  return mid;
}

/// Annual IRR from a series of MONTHLY cash flows. Returns a percentage.
double calculateAnnualIRRFromMonthly(List<double> monthlyCashFlows) {
  final monthly = calculateIRRPerPeriod(monthlyCashFlows);
  if (monthly.isNaN) return double.nan;
  return (math.pow(1 + monthly, 12) - 1) * 100;
}

// ============================================================================
// Property Flip Calculations
// ============================================================================

FlipCalculations calculateFlipMetrics(PropertyFlipInput data) {
  final totalInvestment = data.purchasePrice +
      data.renovationBudget +
      data.holdingCosts +
      data.closingCostsPurchase;

  final resaleValue =
      data.afterRepairValue != 0 ? data.afterRepairValue : data.estimatedValue;

  final expectedProfit = resaleValue - totalInvestment - data.closingCostsSale;

  final calculatedROI =
      totalInvestment > 0 ? (expectedProfit / totalInvestment) * 100 : 0.0;
  final displayROI = calculatedROI;

  final breakEvenPrice = totalInvestment + data.closingCostsSale;

  final holdingMonths = data.daysToComplete > 0 ? data.daysToComplete / 30 : 0.0;
  final annualisedROI =
      calculateAnnualisedReturn(expectedProfit, totalInvestment, holdingMonths);

  final estimatedTransferDuty = calculateTransferDuty(data.purchasePrice);
  final marginOfSafety = breakEvenPrice > 0
      ? ((resaleValue - breakEvenPrice) / breakEvenPrice) * 100
      : 0.0;

  final platformFee = totalInvestment * 0.02;
  final estimatedIncomeTax = estimateFlipIncomeTax(expectedProfit - platformFee);
  final netProfitAfterFeesAndTax =
      expectedProfit - platformFee - estimatedIncomeTax;

  return FlipCalculations(
    totalInvestment: totalInvestment,
    expectedProfit: expectedProfit,
    calculatedROI: calculatedROI.toDouble(),
    displayROI: displayROI.toDouble(),
    breakEvenPrice: breakEvenPrice,
    resaleValue: resaleValue,
    annualisedROI: annualisedROI,
    holdingMonths: holdingMonths,
    estimatedTransferDuty: estimatedTransferDuty,
    marginOfSafety: marginOfSafety,
    estimatedIncomeTax: estimatedIncomeTax,
    netProfitAfterFeesAndTax: netProfitAfterFeesAndTax,
  );
}

// ============================================================================
// Rental Property Calculations
// ============================================================================

/// Monthly debt service (P&I) using the standard amortization formula.
double calculateMonthlyDebtService(
  double loanAmount,
  double annualInterestRate,
  double loanTermYears,
) {
  if (loanAmount <= 0 || annualInterestRate <= 0 || loanTermYears <= 0) {
    return 0;
  }
  final monthlyRate = (annualInterestRate / 100) / 12;
  final numberOfPayments = loanTermYears * 12;
  final factor = math.pow(1 + monthlyRate, numberOfPayments);
  return loanAmount * (monthlyRate * factor) / (factor - 1);
}

RentalCalculations calculateRentalMetrics(RentalPropertyInput data) {
  final annualGrossRent = data.monthlyRent * 12;

  final annualOperatingExpenses = data.annualPropertyTax +
      data.annualInsurance +
      (data.monthlyHOAFees * 12) +
      (data.monthlyMaintenanceReserve * 12) +
      (data.monthlyUtilities * 12) +
      (data.monthlyManagementFee * 12);

  final vacancyLoss = annualGrossRent * (data.vacancyRate / 100);
  final effectiveGrossIncome = annualGrossRent - vacancyLoss;
  final noi = effectiveGrossIncome - annualOperatingExpenses;

  final calculatedCapRate =
      data.purchasePrice > 0 ? (noi / data.purchasePrice) * 100 : 0.0;
  final displayCapRate = data.capRate != 0 ? data.capRate : calculatedCapRate;

  final annualDebtService = data.monthlyDebtService * 12;
  final annualCashFlow = noi - annualDebtService;
  final monthlyCashFlow = annualCashFlow / 12;

  final grossYield =
      data.purchasePrice > 0 ? (annualGrossRent / data.purchasePrice) * 100 : 0.0;
  final netYield =
      data.purchasePrice > 0 ? (noi / data.purchasePrice) * 100 : 0.0;

  final estimatedTransferDuty = calculateTransferDuty(data.purchasePrice);
  final closingCosts = data.closingCosts;
  final allInCost = data.purchasePrice + estimatedTransferDuty + closingCosts;
  final capRateOnCost = allInCost > 0 ? (noi / allInCost) * 100 : 0.0;

  final acquisitionCosts = estimatedTransferDuty + closingCosts;
  final cashInvested = data.downPaymentAmount > 0
      ? data.downPaymentAmount + acquisitionCosts
      : data.purchasePrice + acquisitionCosts;
  final cashOnCashReturn =
      cashInvested > 0 ? (annualCashFlow / cashInvested) * 100 : 0.0;

  final dscr = annualDebtService > 0 ? noi / annualDebtService : 0.0;
  final grossRentMultiplier =
      annualGrossRent > 0 ? data.purchasePrice / annualGrossRent : 0.0;

  return RentalCalculations(
    annualGrossRent: annualGrossRent,
    annualOperatingExpenses: annualOperatingExpenses,
    vacancyLoss: vacancyLoss,
    effectiveGrossIncome: effectiveGrossIncome,
    noi: noi,
    calculatedCapRate: calculatedCapRate,
    displayCapRate: displayCapRate,
    monthlyCashFlow: monthlyCashFlow,
    annualCashFlow: annualCashFlow,
    grossYield: grossYield,
    netYield: netYield,
    cashOnCashReturn: cashOnCashReturn,
    cashInvested: cashInvested,
    estimatedTransferDuty: estimatedTransferDuty,
    allInCost: allInCost,
    capRateOnCost: capRateOnCost,
    dscr: dscr,
    grossRentMultiplier: grossRentMultiplier,
  );
}

/// NOI = (annualGrossRent × (1 − vacancyRate/100)) − annualOperatingExpenses
double calculateNOI(
  double annualGrossRent,
  double vacancyRate,
  double annualOperatingExpenses,
) {
  final vacancyLoss = annualGrossRent * (vacancyRate / 100);
  final effectiveGrossIncome = annualGrossRent - vacancyLoss;
  return effectiveGrossIncome - annualOperatingExpenses;
}

// ============================================================================
// Property Development Calculations
// ============================================================================

DevelopmentCalculations calculateDevelopmentMetrics(
  PropertyDevelopmentInput data,
) {
  final baseCosts = data.landAcquisitionCost +
      data.hardCosts +
      data.softCosts +
      data.financingCosts;
  final contingencyAmount = data.contingencyPercent > 0
      ? baseCosts * (data.contingencyPercent / 100)
      : data.contingencyAmount;

  final totalCosts = baseCosts + contingencyAmount;

  final costPerUnit =
      data.numberOfUnits > 0 ? totalCosts / data.numberOfUnits : 0.0;
  final preSalePercentage =
      data.numberOfUnits > 0 ? (data.preSaleUnits / data.numberOfUnits) * 100 : 0.0;
  final timelineMonths = data.developmentTimelineMonths;

  if (data.developmentType == DevelopmentType.affordableResale) {
    final grossDevelopmentValue = data.totalExpectedRevenue > 0
        ? data.totalExpectedRevenue
        : data.expectedSalePricePerUnit * data.numberOfUnits;

    final derivedProfit = grossDevelopmentValue - totalCosts;
    final derivedROI = totalCosts > 0 ? (derivedProfit / totalCosts) * 100 : 0.0;
    final annualisedROI =
        calculateAnnualisedReturn(derivedProfit, totalCosts, timelineMonths);
    final profitMargin = grossDevelopmentValue > 0
        ? (derivedProfit / grossDevelopmentValue) * 100
        : 0.0;

    return DevelopmentCalculations(
      totalCosts: totalCosts,
      profitMargin: profitMargin,
      costPerUnit: costPerUnit,
      preSalePercentage: preSalePercentage,
      contingencyAmount: contingencyAmount,
      grossDevelopmentValue: grossDevelopmentValue,
      derivedProfit: derivedProfit,
      derivedROI: derivedROI,
      annualisedROI: annualisedROI,
    );
  }

  final annualGrossRentalIncome =
      data.numberOfUnits > 0 && data.expectedMonthlyRentPerUnit > 0
          ? data.numberOfUnits * data.expectedMonthlyRentPerUnit * 12
          : 0.0;
  final noi = annualGrossRentalIncome - data.annualOperatingExpenses;
  final calculatedCapRate = totalCosts > 0 ? (noi / totalCosts) * 100 : 0.0;
  final calculatedGrossYield =
      totalCosts > 0 ? (annualGrossRentalIncome / totalCosts) * 100 : 0.0;
  final calculatedNetYield = totalCosts > 0 ? (noi / totalCosts) * 100 : 0.0;
  final profitMargin = annualGrossRentalIncome > 0
      ? (noi / annualGrossRentalIncome) * 100
      : 0.0;

  return DevelopmentCalculations(
    totalCosts: totalCosts,
    profitMargin: profitMargin,
    costPerUnit: costPerUnit,
    preSalePercentage: preSalePercentage,
    contingencyAmount: contingencyAmount,
    annualGrossRentalIncome: annualGrossRentalIncome,
    noi: noi,
    calculatedCapRate: calculatedCapRate,
    calculatedGrossYield: calculatedGrossYield,
    calculatedNetYield: calculatedNetYield,
  );
}
