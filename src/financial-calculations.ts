/**
 * Financial calculation utilities for real estate investment analysis.
 * Provides pure functions for calculating metrics for flips, rentals, and developments.
 */

// ============================================================================
// INPUT TYPES - Data Required for Calculations
// ============================================================================

/**
 * Input data for property flip financial calculations.
 * These are the base values that must be provided to calculate flip metrics.
 * Based on the PropertyFlip Prisma model.
 * 
 * @remarks
 * This type represents INPUT data only. For calculated outputs, see {@link FlipCalculations}.
 */
export type PropertyFlipInput = {
  purchasePrice: number;
  renovationBudget: number;
  estimatedValue: number;
  holdingCosts: number;
  closingCostsPurchase: number;
  closingCostsSale: number;
  estimatedRepairCosts: number;
  afterRepairValue: number;
  maxOfferPrice: number;
  expectedROI: number;
  expectedProfitMargin: number;
  daysToComplete: number;
  totalInvestmentBudget: number;
  spentInvestmentBudget: number;
};

/**
 * Input data for rental property financial calculations.
 * These are the base values that must be provided to calculate rental metrics.
 * Based on the RentalBond Prisma model.
 * 
 * @remarks
 * This type represents INPUT data only. For calculated outputs, see {@link RentalCalculations}.
 */
export type RentalPropertyInput = {
  purchasePrice: number;
  monthlyRent: number;
  annualPropertyTax: number;
  annualInsurance: number;
  monthlyHOAFees: number;
  monthlyMaintenanceReserve: number;
  monthlyUtilities: number;
  monthlyManagementFee: number;
  vacancyRate: number;
  appreciationRate: number;
  capRate: number;
  cashOnCashReturn: number;
  grossRentMultiplier: number;
  debtServiceCoverageRatio: number;
  grossYield: number;
  netYield: number;
  // Financing fields
  downPaymentAmount: number;
  loanAmount: number;
  interestRate: number;
  loanTermYears: number;
  monthlyDebtService: number;
  totalInvestmentBudget: number;
  spentInvestmentBudget: number;
  /** Upfront acquisition costs (transfer duty, bond & conveyancing fees). Optional; defaults to 0. */
  closingCosts?: number;
};

/**
 * Input data for property development financial calculations.
 * These are the base values that must be provided to calculate development metrics.
 * Based on the PropertyDevelopment Prisma model.
 * 
 * @remarks
 * This type represents INPUT data only. For calculated outputs, see {@link DevelopmentCalculations}.
 */
export type PropertyDevelopmentInput = {
  developmentType: "AFFORDABLE_RESALE" | "AFFORDABLE_RENTAL" | "COMMERCIAL_RENTAL";
  landAcquisitionCost: number;
  hardCosts: number;
  softCosts: number;
  financingCosts: number;
  contingencyPercent: number;
  contingencyAmount: number;
  // Sale-focused fields (for AFFORDABLE_RESALE)
  expectedSalePricePerUnit: number;
  totalExpectedRevenue: number;
  expectedProfit: number;
  // Rental-focused fields (for AFFORDABLE_RENTAL and COMMERCIAL_RENTAL)
  expectedMonthlyRentPerUnit: number;
  annualOperatingExpenses: number;
  stabilizedCapRate: number;
  expectedGrossYield: number;
  expectedNetYield: number;
  // Common fields
  expectedROI: number;
  expectedIRR: number;
  developmentTimelineMonths: number;
  preSaleUnits: number;
  costPerSquareMeter: number;
  totalSquareMeters: number;
  numberOfUnits: number;
  totalBudget: number;
};

// ============================================================================
// OUTPUT TYPES - Calculated Financial Metrics
// ============================================================================

/**
 * Calculated financial metrics for a property flip.
 * These values are computed based on {@link PropertyFlipInput} data.
 * 
 * @remarks
 * This type represents OUTPUT data only - the results of financial calculations.
 * Do not confuse with {@link PropertyFlipInput} which contains the input data.
 */
export type FlipCalculations = {
  totalInvestment: number;
  expectedProfit: number;
  calculatedROI: number;
  displayROI: number;
  breakEvenPrice: number;
  /** Resale value used for the profit calc (afterRepairValue, falling back to estimatedValue). */
  resaleValue: number;
  /** Annualised return (IRR-equivalent for a single buy→sell). 0 when timeline is unknown. */
  annualisedROI: number;
  /** Holding period in months derived from daysToComplete. */
  holdingMonths: number;
  /** Estimated SARS transfer duty on the purchase price (reference — should sit inside closing costs). */
  estimatedTransferDuty: number;
  /** Cushion between resale value and break-even, as a % of break-even. Negative = loss. */
  marginOfSafety: number;
  /** Indicative tax on the gross profit (flips are taxed as trading income, not CGT). */
  estimatedIncomeTax: number;
  /** Profit after the 2% platform fee and estimated income tax. */
  netProfitAfterFeesAndTax: number;
};

/**
 * Calculated financial metrics for a rental property.
 * These values are computed based on {@link RentalPropertyInput} data.
 * 
 * @remarks
 * This type represents OUTPUT data only - the results of financial calculations.
 * Do not confuse with {@link RentalPropertyInput} which contains the input data.
 */
export type RentalCalculations = {
  annualGrossRent: number;
  annualOperatingExpenses: number;
  vacancyLoss: number;
  effectiveGrossIncome: number;
  noi: number;
  calculatedCapRate: number;
  displayCapRate: number;
  monthlyCashFlow: number;
  annualCashFlow: number;
  grossYield: number;
  netYield: number;
  cashOnCashReturn: number;
  /** Cash actually invested (deposit + acquisition costs, or full all-in cost if unleveraged). */
  cashInvested: number;
  /** Estimated SARS transfer duty on the purchase price. */
  estimatedTransferDuty: number;
  /** Purchase price + transfer duty + closing costs. */
  allInCost: number;
  /** Cap rate measured against all-in cost rather than purchase price (more conservative). */
  capRateOnCost: number;
  /** Debt Service Coverage Ratio (NOI ÷ annual debt service). 0 when unleveraged. */
  dscr: number;
  /** Gross Rent Multiplier (price ÷ annual gross rent). */
  grossRentMultiplier: number;
};

/**
 * Calculated financial metrics for a property development.
 * These values are computed based on {@link PropertyDevelopmentInput} data.
 * 
 * @remarks
 * This type represents OUTPUT data only - the results of financial calculations.
 * Do not confuse with {@link PropertyDevelopmentInput} which contains the input data.
 * 
 * The optional fields (annualGrossRentalIncome, noi, etc.) are only populated
 * for rental-focused developments (AFFORDABLE_RENTAL, COMMERCIAL_RENTAL).
 */
export type DevelopmentCalculations = {
  totalCosts: number;
  profitMargin: number;
  costPerUnit: number;
  preSalePercentage: number;
  /** Contingency recomputed from contingencyPercent × base costs (never trusts a stale stored amount). */
  contingencyAmount: number;
  // Sale-focused derived figures (AFFORDABLE_RESALE)
  /** Gross development value — totalExpectedRevenue, falling back to salePrice × units. */
  grossDevelopmentValue?: number;
  /** Profit derived as revenue − total cost (NOT the manager's typed expectedProfit). */
  derivedProfit?: number;
  /** ROI derived from derivedProfit ÷ total cost. */
  derivedROI?: number;
  /** Annualised return over the development timeline (IRR-equivalent for a single in→out). */
  annualisedROI?: number;
  // Rental-specific calculations (only for AFFORDABLE_RENTAL and COMMERCIAL_RENTAL)
  annualGrossRentalIncome?: number;
  noi?: number;
  calculatedCapRate?: number;
  calculatedGrossYield?: number;
  calculatedNetYield?: number;
};

// ============================================================================
// South African Tax & Time-Value Helpers
// ============================================================================

/**
 * SARS transfer-duty brackets effective 1 March 2025.
 * Each bracket: properties up to `upTo` pay `base` + `rate` of the value above `from`.
 */
const TRANSFER_DUTY_BRACKETS: { from: number; upTo: number; base: number; rate: number }[] = [
  { from: 0, upTo: 1_210_000, base: 0, rate: 0 },
  { from: 1_210_000, upTo: 1_663_800, base: 0, rate: 0.03 },
  { from: 1_663_800, upTo: 2_329_300, base: 13_614, rate: 0.06 },
  { from: 2_329_300, upTo: 2_994_800, base: 53_544, rate: 0.08 },
  { from: 2_994_800, upTo: 13_310_000, base: 106_784, rate: 0.11 },
  { from: 13_310_000, upTo: Infinity, base: 1_241_456, rate: 0.13 },
];

/**
 * Calculate SARS transfer duty for a given property value (2025/26 sliding scale).
 * Note: transfer duty does NOT apply where the sale is a VAT-able supply (e.g. a new
 * development sold by a VAT vendor) — in that case VAT is payable instead.
 *
 * @param value - Purchase / property value in ZAR
 * @returns Transfer duty payable in ZAR
 */
export function calculateTransferDuty(value: number): number {
  if (value <= 0) return 0;
  for (const b of TRANSFER_DUTY_BRACKETS) {
    if (value <= b.upTo) {
      return b.base + (value - b.from) * b.rate;
    }
  }
  return 0;
}

/** Standard South African VAT rate. */
export const VAT_RATE = 0.15;

/**
 * Extract the VAT portion contained in a VAT-inclusive price.
 *
 * @param vatInclusivePrice - Price that already includes VAT
 * @returns The VAT amount embedded in the price
 */
export function extractVat(vatInclusivePrice: number): number {
  if (vatInclusivePrice <= 0) return 0;
  return vatInclusivePrice - vatInclusivePrice / (1 + VAT_RATE);
}

/**
 * Indicative tax on a flip's gross profit. SARS treats property bought to resell
 * at a profit as trading stock, so the gain is ordinary income, not a capital gain.
 * We apply a flat indicative rate (companies pay 27%); investors should confirm with
 * their own tax position. Returns 0 for a loss.
 *
 * @param grossProfit - Profit before tax
 * @param rate - Effective tax rate as a decimal (default 0.27, the SA company rate)
 * @returns Indicative tax payable
 */
export function estimateFlipIncomeTax(grossProfit: number, rate = 0.27): number {
  return grossProfit > 0 ? grossProfit * rate : 0;
}

/**
 * Annualise a simple total return so deals of different durations are comparable.
 * For a single capital-out / capital-back investment this equals the IRR.
 *
 * @param profit - Total profit over the holding period
 * @param invested - Capital invested
 * @param months - Holding period in months
 * @returns Annualised return as a percentage. Falls back to the simple period
 *          return when the timeline is unknown (months <= 0).
 */
export function calculateAnnualisedReturn(
  profit: number,
  invested: number,
  months: number
): number {
  if (invested <= 0) return 0;
  const periodReturn = profit / invested;
  if (months <= 0) return periodReturn * 100;
  // A 100%+ loss cannot be annualised meaningfully — clamp to -100%.
  if (periodReturn <= -1) return -100;
  const years = months / 12;
  return (Math.pow(1 + periodReturn, 1 / years) - 1) * 100;
}

/**
 * Solve the internal rate of return for a series of equally-spaced cash flows
 * (index 0 = today). Uses bisection so it always converges without a derivative.
 *
 * @param cashFlows - Periodic cash flows; the first is normally negative (capital out)
 * @returns The per-period rate as a decimal, or NaN if no sign change / no root
 */
export function calculateIRRPerPeriod(cashFlows: number[]): number {
  if (cashFlows.length < 2) return NaN;
  const hasPositive = cashFlows.some((c) => c > 0);
  const hasNegative = cashFlows.some((c) => c < 0);
  if (!hasPositive || !hasNegative) return NaN;

  const npv = (rate: number) =>
    cashFlows.reduce((acc, cf, t) => acc + cf / Math.pow(1 + rate, t), 0);

  let low = -0.9999;
  let high = 1; // 100% per period upper bound
  let fLow = npv(low);
  let fHigh = npv(high);

  // Expand the upper bound until we bracket a root (or give up).
  let expand = 0;
  while (fLow * fHigh > 0 && expand < 60) {
    high *= 1.5;
    fHigh = npv(high);
    expand += 1;
  }
  if (fLow * fHigh > 0) return NaN;

  let mid = 0;
  for (let i = 0; i < 200; i++) {
    mid = (low + high) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-6) return mid;
    if (fLow * fMid < 0) {
      high = mid;
      fHigh = fMid;
    } else {
      low = mid;
      fLow = fMid;
    }
  }
  return mid;
}

/**
 * Annual IRR from a series of MONTHLY cash flows.
 *
 * @param monthlyCashFlows - Monthly cash flows (index 0 = today)
 * @returns Annual IRR as a percentage, or NaN if it cannot be solved
 */
export function calculateAnnualIRRFromMonthly(monthlyCashFlows: number[]): number {
  const monthly = calculateIRRPerPeriod(monthlyCashFlows);
  if (Number.isNaN(monthly)) return NaN;
  return (Math.pow(1 + monthly, 12) - 1) * 100;
}

// ============================================================================
// Property Flip Calculations
// ============================================================================

/**
 * Calculate comprehensive financial metrics for a property flip investment.
 * 
 * @param data - Input data for the flip property
 * @returns Calculated financial metrics
 */
export function calculateFlipMetrics(data: PropertyFlipInput): FlipCalculations {
  // Calculate total investment
  const totalInvestment = 
    data.purchasePrice + 
    data.renovationBudget + 
    data.holdingCosts + 
    data.closingCostsPurchase;

  // Resale value: prefer the explicit After-Repair Value; fall back to estimatedValue.
  // This keeps the profit, the displayed sale price and the break-even cushion all
  // referencing the SAME number (previously profit used estimatedValue while the UI
  // showed afterRepairValue — they could silently disagree).
  const resaleValue = data.afterRepairValue || data.estimatedValue;

  // Calculate expected profit (gross, before platform fee and tax)
  const expectedProfit = resaleValue - totalInvestment - data.closingCostsSale;
  
  // Calculate actual ROI (always derived; never trusts a typed figure)
  const calculatedROI = totalInvestment > 0 
    ? (expectedProfit / totalInvestment) * 100 
    : 0;

  // Headline ROI shown to investors is the DERIVED figure. A manager-entered
  // expectedROI is treated only as a target, surfaced separately by the UI.
  const displayROI = calculatedROI;
  
  // Calculate break-even price
  const breakEvenPrice = totalInvestment + data.closingCostsSale;

  // Time-value: annualise the return over the project timeline.
  const holdingMonths = data.daysToComplete > 0 ? data.daysToComplete / 30 : 0;
  const annualisedROI = calculateAnnualisedReturn(expectedProfit, totalInvestment, holdingMonths);

  // SA-specific reference figures.
  const estimatedTransferDuty = calculateTransferDuty(data.purchasePrice);
  const marginOfSafety = breakEvenPrice > 0 ? ((resaleValue - breakEvenPrice) / breakEvenPrice) * 100 : 0;

  // Net profit after the 2% platform fee and indicative income tax (flips are
  // taxed as trading income in SA, not capital gains).
  const platformFee = totalInvestment * 0.02;
  const estimatedIncomeTax = estimateFlipIncomeTax(expectedProfit - platformFee);
  const netProfitAfterFeesAndTax = expectedProfit - platformFee - estimatedIncomeTax;

  return {
    totalInvestment,
    expectedProfit,
    calculatedROI,
    displayROI,
    breakEvenPrice,
    resaleValue,
    annualisedROI,
    holdingMonths,
    estimatedTransferDuty,
    marginOfSafety,
    estimatedIncomeTax,
    netProfitAfterFeesAndTax,
  };
}

/**
 * Calculate the total investment required for a flip property.
 * 
 * @param purchasePrice - Purchase price of the property
 * @param renovationBudget - Budget allocated for renovations
 * @param holdingCosts - Costs to hold the property (utilities, insurance, taxes, interest)
 * @param closingCostsPurchase - Closing costs for purchasing the property
 * @returns Total investment amount
 */
export function calculateFlipTotalInvestment(
  purchasePrice: number,
  renovationBudget: number,
  holdingCosts: number,
  closingCostsPurchase: number
): number {
  return purchasePrice + renovationBudget + holdingCosts + closingCostsPurchase;
}

/**
 * Calculate the expected profit from a flip property.
 * 
 * @param estimatedValue - Estimated sale value of the property
 * @param totalInvestment - Total investment in the property
 * @param closingCostsSale - Closing costs for selling the property
 * @returns Expected profit amount
 */
export function calculateFlipProfit(
  estimatedValue: number,
  totalInvestment: number,
  closingCostsSale: number
): number {
  return estimatedValue - totalInvestment - closingCostsSale;
}

/**
 * Calculate the return on investment (ROI) for a flip property.
 * 
 * @param profit - Expected or actual profit
 * @param totalInvestment - Total investment in the property
 * @returns ROI as a percentage
 */
export function calculateFlipROI(profit: number, totalInvestment: number): number {
  return totalInvestment > 0 ? (profit / totalInvestment) * 100 : 0;
}

/**
 * Calculate the break-even sale price for a flip property.
 * 
 * @param totalInvestment - Total investment in the property
 * @param closingCostsSale - Closing costs for selling the property
 * @returns Break-even price
 */
export function calculateFlipBreakEven(
  totalInvestment: number,
  closingCostsSale: number
): number {
  return totalInvestment + closingCostsSale;
}

// ============================================================================
// Rental Property Calculations
// ============================================================================

/**
 * Calculate monthly debt service (P&I payment) using standard amortization formula.
 * 
 * @param loanAmount - Principal loan amount
 * @param annualInterestRate - Annual interest rate as a percentage (e.g., 5.5 for 5.5%)
 * @param loanTermYears - Loan term in years
 * @returns Monthly payment amount (Principal + Interest)
 */
export function calculateMonthlyDebtService(
  loanAmount: number,
  annualInterestRate: number,
  loanTermYears: number
): number {
  // If no loan or no interest rate, return 0
  if (loanAmount <= 0 || annualInterestRate <= 0 || loanTermYears <= 0) {
    return 0;
  }

  // Convert annual rate to monthly rate (divide by 100 to get decimal, then by 12)
  const monthlyRate = (annualInterestRate / 100) / 12;
  
  // Total number of payments
  const numberOfPayments = loanTermYears * 12;
  
  // Amortization formula: M = P * [r(1+r)^n] / [(1+r)^n - 1]
  const monthlyPayment = loanAmount * 
    (monthlyRate * Math.pow(1 + monthlyRate, numberOfPayments)) / 
    (Math.pow(1 + monthlyRate, numberOfPayments) - 1);
  
  return monthlyPayment;
}

/**
 * Calculate comprehensive financial metrics for a rental property investment.
 * 
 * @param data - Input data for the rental property
 * @returns Calculated financial metrics
 */
export function calculateRentalMetrics(data: RentalPropertyInput): RentalCalculations {
  // Calculate annual figures
  const annualGrossRent = data.monthlyRent * 12;
  
  const annualOperatingExpenses = 
    data.annualPropertyTax + 
    data.annualInsurance + 
    (data.monthlyHOAFees * 12) + 
    (data.monthlyMaintenanceReserve * 12) + 
    (data.monthlyUtilities * 12) + 
    (data.monthlyManagementFee * 12);
  
  // Calculate NOI (Net Operating Income)
  const vacancyLoss = annualGrossRent * (data.vacancyRate / 100);
  const effectiveGrossIncome = annualGrossRent - vacancyLoss;
  const noi = effectiveGrossIncome - annualOperatingExpenses;
  
  // Calculate Cap Rate if not provided
  const calculatedCapRate = data.purchasePrice > 0 
    ? (noi / data.purchasePrice) * 100 
    : 0;
  
  const displayCapRate = data.capRate || calculatedCapRate;
  
  // Calculate debt service metrics
  const annualDebtService = data.monthlyDebtService * 12;
  
  // Annual Cash Flow = NOI - Annual Debt Service
  const annualCashFlow = noi - annualDebtService;
  const monthlyCashFlow = annualCashFlow / 12;

  // Calculate Gross Yield: (Annual Gross Rent / Purchase Price) * 100
  const grossYield = data.purchasePrice > 0
    ? (annualGrossRent / data.purchasePrice) * 100
    : 0;

  // Calculate Net Yield: (NOI / Purchase Price) * 100
  const netYield = data.purchasePrice > 0
    ? (noi / data.purchasePrice) * 100
    : 0;

  // All-in acquisition cost: purchase price + transfer duty + closing/bond costs.
  const estimatedTransferDuty = calculateTransferDuty(data.purchasePrice);
  const closingCosts = data.closingCosts ?? 0;
  const allInCost = data.purchasePrice + estimatedTransferDuty + closingCosts;
  const capRateOnCost = allInCost > 0 ? (noi / allInCost) * 100 : 0;

  // Cash-on-Cash Return: annual cash flow ÷ cash actually invested.
  // Cash invested ALWAYS includes acquisition costs (deposit + transfer duty +
  // closing), so leveraged and all-cash deals are measured consistently. The old
  // engine excluded these costs (overstating the return) and disagreed with the
  // input form which included them.
  const acquisitionCosts = estimatedTransferDuty + closingCosts;
  const cashInvested = data.downPaymentAmount > 0
    ? data.downPaymentAmount + acquisitionCosts
    : data.purchasePrice + acquisitionCosts;
  const cashOnCashReturn = cashInvested > 0
    ? (annualCashFlow / cashInvested) * 100
    : 0;

  // Risk / quality ratios.
  const dscr = annualDebtService > 0 ? noi / annualDebtService : 0;
  const grossRentMultiplier = annualGrossRent > 0 ? data.purchasePrice / annualGrossRent : 0;

  return {
    annualGrossRent,
    annualOperatingExpenses,
    vacancyLoss,
    effectiveGrossIncome,
    noi,
    calculatedCapRate,
    displayCapRate,
    monthlyCashFlow,
    annualCashFlow,
    grossYield,
    netYield,
    cashOnCashReturn,
    cashInvested,
    estimatedTransferDuty,
    allInCost,
    capRateOnCost,
    dscr,
    grossRentMultiplier,
  };
}

/**
 * Calculate the annual gross rent for a rental property.
 * 
 * @param monthlyRent - Monthly rent amount
 * @returns Annual gross rent
 */
export function calculateAnnualGrossRent(monthlyRent: number): number {
  return monthlyRent * 12;
}

/**
 * Calculate the annual operating expenses for a rental property.
 * 
 * @param expenses - Object containing all expense components
 * @returns Total annual operating expenses
 */
export function calculateAnnualOperatingExpenses(expenses: {
  annualPropertyTax: number;
  annualInsurance: number;
  monthlyHOAFees: number;
  monthlyMaintenanceReserve: number;
  monthlyUtilities: number;
  monthlyManagementFee: number;
}): number {
  return (
    expenses.annualPropertyTax +
    expenses.annualInsurance +
    (expenses.monthlyHOAFees * 12) +
    (expenses.monthlyMaintenanceReserve * 12) +
    (expenses.monthlyUtilities * 12) +
    (expenses.monthlyManagementFee * 12)
  );
}

/**
 * Calculate the Net Operating Income (NOI) for a rental property.
 * 
 * @param annualGrossRent - Annual gross rental income
 * @param vacancyRate - Expected vacancy rate as a percentage
 * @param annualOperatingExpenses - Total annual operating expenses
 * @returns Net Operating Income
 */
export function calculateNOI(
  annualGrossRent: number,
  vacancyRate: number,
  annualOperatingExpenses: number
): number {
  const vacancyLoss = annualGrossRent * (vacancyRate / 100);
  const effectiveGrossIncome = annualGrossRent - vacancyLoss;
  return effectiveGrossIncome - annualOperatingExpenses;
}

/**
 * Calculate the capitalization rate (cap rate) for a rental property.
 * 
 * @param noi - Net Operating Income
 * @param purchasePrice - Purchase price of the property
 * @returns Cap rate as a percentage
 */
export function calculateCapRate(noi: number, purchasePrice: number): number {
  return purchasePrice > 0 ? (noi / purchasePrice) * 100 : 0;
}

/**
 * Calculate the monthly cash flow for a rental property AFTER debt service.
 *
 * Previously this returned `noi / 12`, which silently ignored the bond
 * repayment and overstated the cash an investor actually pockets. Pass the
 * annual debt service so leveraged and unleveraged deals are both correct.
 *
 * @param noi - Net Operating Income (annual)
 * @param annualDebtService - Annual bond/loan repayment (monthly payment × 12). Defaults to 0.
 * @returns Monthly cash flow after debt service
 */
export function calculateMonthlyCashFlow(noi: number, annualDebtService = 0): number {
  return (noi - annualDebtService) / 12;
}

/**
 * Calculate the cash-on-cash return for a rental property.
 * 
 * @param annualCashFlow - Annual cash flow after all expenses
 * @param cashInvested - Total cash invested in the property
 * @returns Cash-on-cash return as a percentage
 */
export function calculateCashOnCashReturn(
  annualCashFlow: number,
  cashInvested: number
): number {
  return cashInvested > 0 ? (annualCashFlow / cashInvested) * 100 : 0;
}

/**
 * Calculate the cash-on-cash return for a rental property with financing.
 * 
 * @param noi - Net Operating Income
 * @param annualDebtService - Annual debt service (monthly payment × 12)
 * @param cashInvested - Total cash invested (typically down payment + closing costs)
 * @returns Cash-on-cash return as a percentage
 */
export function calculateCashOnCashReturnWithFinancing(
  noi: number,
  annualDebtService: number,
  cashInvested: number
): number {
  const annualCashFlow = noi - annualDebtService;
  return cashInvested > 0 ? (annualCashFlow / cashInvested) * 100 : 0;
}

/**
 * Calculate the debt service coverage ratio (DSCR) for a rental property.
 * 
 * @param noi - Net Operating Income
 * @param annualDebtService - Annual debt service (monthly payment × 12)
 * @returns DSCR value (NOI / Annual Debt Service)
 */
export function calculateDebtServiceCoverageRatio(
  noi: number,
  annualDebtService: number
): number {
  return annualDebtService > 0 ? noi / annualDebtService : 0;
}

/**
 * Calculate the gross rent multiplier (GRM) for a rental property.
 * 
 * @param purchasePrice - Purchase price of the property
 * @param annualGrossRent - Annual gross rental income
 * @returns Gross rent multiplier
 */
export function calculateGrossRentMultiplier(
  purchasePrice: number,
  annualGrossRent: number
): number {
  return annualGrossRent > 0 ? purchasePrice / annualGrossRent : 0;
}

// ============================================================================
// Property Development Calculations
// ============================================================================

/**
 * Calculate comprehensive financial metrics for a property development project.
 * Handles both sale-focused (AFFORDABLE_RESALE) and rental-focused (AFFORDABLE_RENTAL, COMMERCIAL_RENTAL) developments.
 * 
 * @param data - Input data for the development project
 * @returns Calculated financial metrics
 */
export function calculateDevelopmentMetrics(
  data: PropertyDevelopmentInput
): DevelopmentCalculations {
  // Recompute contingency from the percentage on the base costs so a stale stored
  // contingencyAmount can never silently misstate the total. Fall back to the
  // stored amount only when no percentage is supplied.
  const baseCosts =
    data.landAcquisitionCost +
    data.hardCosts +
    data.softCosts +
    data.financingCosts;
  const contingencyAmount = data.contingencyPercent > 0
    ? baseCosts * (data.contingencyPercent / 100)
    : data.contingencyAmount;

  // Calculate total costs
  const totalCosts = baseCosts + contingencyAmount;
  
  // Calculate cost per unit
  const costPerUnit = data.numberOfUnits > 0 
    ? totalCosts / data.numberOfUnits 
    : 0;
  
  // Calculate pre-sale percentage (only relevant for sale-focused developments)
  const preSalePercentage = data.numberOfUnits > 0 
    ? (data.preSaleUnits / data.numberOfUnits) * 100 
    : 0;

  const timelineMonths = data.developmentTimelineMonths;

  // Branch based on development type
  if (data.developmentType === "AFFORDABLE_RESALE") {
    // Gross Development Value: prefer the explicit revenue, fall back to unit price × units.
    const grossDevelopmentValue = data.totalExpectedRevenue > 0
      ? data.totalExpectedRevenue
      : data.expectedSalePricePerUnit * data.numberOfUnits;

    // Profit is DERIVED (revenue − cost), not the manager's typed expectedProfit,
    // so the headline figure can never contradict the cost/revenue breakdown.
    const derivedProfit = grossDevelopmentValue - totalCosts;
    const derivedROI = totalCosts > 0 ? (derivedProfit / totalCosts) * 100 : 0;
    const annualisedROI = calculateAnnualisedReturn(derivedProfit, totalCosts, timelineMonths);

    const profitMargin = grossDevelopmentValue > 0 
      ? (derivedProfit / grossDevelopmentValue) * 100 
      : 0;

    return {
      totalCosts,
      profitMargin,
      costPerUnit,
      preSalePercentage,
      contingencyAmount,
      grossDevelopmentValue,
      derivedProfit,
      derivedROI,
      annualisedROI,
    };
  } else {
    // Rental-focused development calculations (AFFORDABLE_RENTAL or COMMERCIAL_RENTAL)
    
    // Calculate annual gross rental income
    const annualGrossRentalIncome = data.numberOfUnits > 0 && data.expectedMonthlyRentPerUnit > 0
      ? data.numberOfUnits * data.expectedMonthlyRentPerUnit * 12
      : 0;
    
    // Calculate NOI (Net Operating Income)
    const noi = annualGrossRentalIncome - data.annualOperatingExpenses;
    
    // Calculate Cap Rate: NOI / Total Development Cost
    const calculatedCapRate = totalCosts > 0
      ? (noi / totalCosts) * 100
      : 0;
    
    // Calculate Gross Yield: Annual Gross Rental Income / Total Development Cost
    const calculatedGrossYield = totalCosts > 0
      ? (annualGrossRentalIncome / totalCosts) * 100
      : 0;
    
    // Calculate Net Yield: NOI / Total Development Cost (same as cap rate for developments)
    const calculatedNetYield = totalCosts > 0
      ? (noi / totalCosts) * 100
      : 0;
    
    // For rental developments, profit margin is based on NOI as a percentage of gross rental income
    const profitMargin = annualGrossRentalIncome > 0
      ? (noi / annualGrossRentalIncome) * 100
      : 0;

    return {
      totalCosts,
      profitMargin,
      costPerUnit,
      preSalePercentage: 0, // Not applicable for rental developments
      contingencyAmount,
      annualGrossRentalIncome,
      noi,
      calculatedCapRate,
      calculatedGrossYield,
      calculatedNetYield,
    };
  }
}

/**
 * Calculate the total project costs for a development.
 * 
 * @param costs - Object containing all cost components
 * @returns Total project costs
 */
export function calculateDevelopmentTotalCosts(costs: {
  landAcquisitionCost: number;
  hardCosts: number;
  softCosts: number;
  financingCosts: number;
  contingencyAmount: number;
}): number {
  return (
    costs.landAcquisitionCost +
    costs.hardCosts +
    costs.softCosts +
    costs.financingCosts +
    costs.contingencyAmount
  );
}

/**
 * Calculate the contingency amount based on a percentage of base costs.
 * 
 * @param baseCosts - Sum of land, hard, soft, and financing costs
 * @param contingencyPercent - Contingency percentage
 * @returns Contingency amount
 */
export function calculateContingencyAmount(
  baseCosts: number,
  contingencyPercent: number
): number {
  return baseCosts * (contingencyPercent / 100);
}

/**
 * Calculate the profit margin for a development project.
 * 
 * @param profit - Expected profit
 * @param totalRevenue - Total expected revenue
 * @returns Profit margin as a percentage
 */
export function calculateDevelopmentProfitMargin(
  profit: number,
  totalRevenue: number
): number {
  return totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0;
}

/**
 * Calculate the cost per unit for a development project.
 * 
 * @param totalCosts - Total project costs
 * @param numberOfUnits - Number of units in the development
 * @returns Cost per unit
 */
export function calculateCostPerUnit(
  totalCosts: number,
  numberOfUnits: number
): number {
  return numberOfUnits > 0 ? totalCosts / numberOfUnits : 0;
}

/**
 * Calculate the expected profit for a development project.
 * 
 * @param totalRevenue - Total expected revenue
 * @param totalCosts - Total project costs
 * @returns Expected profit
 */
export function calculateDevelopmentProfit(
  totalRevenue: number,
  totalCosts: number
): number {
  return totalRevenue - totalCosts;
}

/**
 * Calculate the return on investment (ROI) for a development project.
 * 
 * @param profit - Expected profit
 * @param totalCosts - Total project costs
 * @returns ROI as a percentage
 */
export function calculateDevelopmentROI(
  profit: number,
  totalCosts: number
): number {
  return totalCosts > 0 ? (profit / totalCosts) * 100 : 0;
}

/**
 * Calculate the pre-sale percentage for a development project.
 * 
 * @param preSaleUnits - Number of units pre-sold
 * @param totalUnits - Total number of units
 * @returns Pre-sale percentage
 */
export function calculatePreSalePercentage(
  preSaleUnits: number,
  totalUnits: number
): number {
  return totalUnits > 0 ? (preSaleUnits / totalUnits) * 100 : 0;
}

/**
 * Calculate the cost per square meter for a development project.
 * 
 * @param totalCosts - Total project costs
 * @param totalSquareMeters - Total square meters
 * @returns Cost per square meter
 */
export function calculateCostPerSquareMeter(
  totalCosts: number,
  totalSquareMeters: number
): number {
  return totalSquareMeters > 0 ? totalCosts / totalSquareMeters : 0;
}
