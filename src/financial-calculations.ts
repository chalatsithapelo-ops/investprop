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
  grossYield: number;
  netYield: number;
  cashOnCashReturn: number;
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
  // Rental-specific calculations (only for AFFORDABLE_RENTAL and COMMERCIAL_RENTAL)
  annualGrossRentalIncome?: number;
  noi?: number;
  calculatedCapRate?: number;
  calculatedGrossYield?: number;
  calculatedNetYield?: number;
};

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
  
  // Calculate expected profit
  const expectedProfit = 
    data.estimatedValue - 
    totalInvestment - 
    data.closingCostsSale;
  
  // Calculate actual ROI if not provided
  const calculatedROI = totalInvestment > 0 
    ? (expectedProfit / totalInvestment) * 100 
    : 0;
  
  const displayROI = data.expectedROI || calculatedROI;
  
  // Calculate break-even price
  const breakEvenPrice = totalInvestment + data.closingCostsSale;

  return {
    totalInvestment,
    expectedProfit,
    calculatedROI,
    displayROI,
    breakEvenPrice,
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

  // Calculate Cash-on-Cash Return: (Annual Cash Flow / Cash Invested) * 100
  // Cash Invested is the down payment (if financing) or purchase price (if all cash)
  const cashInvested = data.downPaymentAmount > 0 ? data.downPaymentAmount : data.purchasePrice;
  const cashOnCashReturn = cashInvested > 0
    ? (annualCashFlow / cashInvested) * 100
    : 0;

  return {
    annualGrossRent,
    annualOperatingExpenses,
    vacancyLoss,
    effectiveGrossIncome,
    noi,
    calculatedCapRate,
    displayCapRate,
    monthlyCashFlow,
    grossYield,
    netYield,
    cashOnCashReturn,
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
 * Calculate the monthly cash flow for a rental property.
 * 
 * @param noi - Net Operating Income
 * @returns Monthly cash flow
 */
export function calculateMonthlyCashFlow(noi: number): number {
  return noi / 12;
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
  // Calculate total costs
  const totalCosts = 
    data.landAcquisitionCost + 
    data.hardCosts + 
    data.softCosts + 
    data.financingCosts + 
    data.contingencyAmount;
  
  // Calculate cost per unit
  const costPerUnit = data.numberOfUnits > 0 
    ? totalCosts / data.numberOfUnits 
    : 0;
  
  // Calculate pre-sale percentage (only relevant for sale-focused developments)
  const preSalePercentage = data.numberOfUnits > 0 
    ? (data.preSaleUnits / data.numberOfUnits) * 100 
    : 0;

  // Branch based on development type
  if (data.developmentType === "AFFORDABLE_RESALE") {
    // Sale-focused development calculations
    const profitMargin = data.totalExpectedRevenue > 0 
      ? (data.expectedProfit / data.totalExpectedRevenue) * 100 
      : 0;

    return {
      totalCosts,
      profitMargin,
      costPerUnit,
      preSalePercentage,
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
