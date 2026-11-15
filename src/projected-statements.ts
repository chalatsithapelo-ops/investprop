/**
 * Projected financial statements engine.
 *
 * Produces period-by-period PROJECTED (forward-looking) financial statements —
 * an Income Statement, a Cash Flow Statement and a Balance Sheet — for every
 * property type on the platform (flip, rental and all development types:
 * affordable resale, affordable rental and commercial rental).
 *
 * The statements are built from a single stream of per-period "primitives"
 * (revenue, cost of sales, opex, depreciation, interest, capex, debt and equity
 * movements). The balance sheet is guaranteed to balance by construction: for
 * every period the accounting identity
 *
 *     Δ(Property + Cash) = Δ(Debt) + Δ(Contributed equity) + Δ(Retained earnings)
 *
 * holds exactly, because each primitive is reflected consistently in the income
 * statement, the cash-flow statement and the balance-sheet roll-forward.
 *
 * All figures are indicative planning numbers in ZAR and ignore VAT timing,
 * working-capital movements and receivables/payables (cash is assumed to equal
 * accrual within each period). They exist to show investors how a project is
 * projected to perform over time — not as audited accounts.
 */

import {
  calculateMonthlyDebtService,
  buildRentalInput,
  type PropertyFlipInput,
  type RentalPropertyInput,
} from "~/financial-calculations";

// ── Company income-tax rate (SA) used for projected tax. ───────────────────
const DEFAULT_TAX_RATE = 0.27;

export type StatementPeriod = {
  label: string;
  // ── Income statement ──
  revenue: number;
  costOfSales: number;
  grossProfit: number;
  operatingExpenses: number;
  depreciation: number;
  operatingProfit: number; // EBIT
  interest: number;
  profitBeforeTax: number;
  tax: number;
  netProfit: number;
  // ── Cash flow statement ──
  cashFromOperations: number;
  cashFromInvesting: number;
  cashFromFinancing: number;
  netCashFlow: number;
  openingCash: number;
  closingCash: number;
  // ── Balance sheet (period end) ──
  propertyAsset: number;
  cash: number;
  totalAssets: number;
  debt: number;
  totalLiabilities: number;
  contributedEquity: number;
  retainedEarnings: number;
  totalEquity: number;
  // ── Memo (not part of the primary statements) ──
  marketValue?: number;
  cashAvailableForDistribution?: number;
  balanceCheck: number; // should be ~0
};

export type ProjectedStatements = {
  type: "flip" | "rental" | "development";
  developmentType?: "AFFORDABLE_RESALE" | "AFFORDABLE_RENTAL" | "COMMERCIAL_RENTAL";
  currency: "ZAR";
  periodicity: "phase" | "annual";
  propertyAssetLabel: string;
  periods: StatementPeriod[];
  assumptions: { label: string; value: string }[];
  totals: {
    revenue: number;
    netProfit: number;
    peakFundingDrawn: number;
    closingCash: number;
    closingEquity: number;
  };
};

type PeriodInput = {
  label: string;
  revenue?: number;
  costOfSales?: number;
  operatingExpenses?: number;
  depreciation?: number;
  interest?: number;
  /** Cash capex capitalised to the property/inventory asset. */
  capex?: number;
  debtDrawn?: number;
  debtRepaid?: number;
  equityIn?: number;
  distributions?: number;
  marketValue?: number;
};

type OpeningState = {
  cash?: number;
  propertyAsset?: number;
  debt?: number;
  contributedEquity?: number;
  retainedEarnings?: number;
};

function buildStatements(
  opening: OpeningState,
  periods: PeriodInput[],
  opts: {
    type: ProjectedStatements["type"];
    developmentType?: ProjectedStatements["developmentType"];
    periodicity: ProjectedStatements["periodicity"];
    propertyAssetLabel: string;
    taxRate?: number;
    assumptions?: { label: string; value: string }[];
  },
): ProjectedStatements {
  const taxRate = opts.taxRate ?? DEFAULT_TAX_RATE;
  let cash = opening.cash ?? 0;
  let property = opening.propertyAsset ?? 0;
  let debt = opening.debt ?? 0;
  let contributed = opening.contributedEquity ?? 0;
  let retained = opening.retainedEarnings ?? 0;
  let taxLossCarry = 0;
  let peakFundingDrawn = debt;

  const out: StatementPeriod[] = [];

  for (const p of periods) {
    const revenue = p.revenue ?? 0;
    const cogs = p.costOfSales ?? 0;
    const opex = p.operatingExpenses ?? 0;
    const depr = p.depreciation ?? 0;
    const interest = p.interest ?? 0;

    const grossProfit = revenue - cogs;
    const operatingProfit = grossProfit - opex - depr;
    const pbt = operatingProfit - interest;

    // Tax on positive profit, offsetting assessed losses carried forward.
    let tax = 0;
    if (pbt > 0) {
      const taxable = Math.max(0, pbt - taxLossCarry);
      taxLossCarry = Math.max(0, taxLossCarry - pbt);
      tax = taxable * taxRate;
    } else {
      taxLossCarry += -pbt;
    }
    const netProfit = pbt - tax;

    const capex = p.capex ?? 0;
    const debtDrawn = p.debtDrawn ?? 0;
    const debtRepaid = p.debtRepaid ?? 0;
    const equityIn = p.equityIn ?? 0;
    const distributions = p.distributions ?? 0;

    // Cost of sales and depreciation are non-cash (they release a previously
    // capitalised asset), so they are excluded from operating cash.
    const cashFromOperations = revenue - opex - interest - tax;
    const cashFromInvesting = -capex;
    const cashFromFinancing = equityIn + debtDrawn - debtRepaid - distributions;
    const netCashFlow = cashFromOperations + cashFromInvesting + cashFromFinancing;

    const openingCash = cash;
    cash = openingCash + netCashFlow;
    property = property + capex - cogs - depr;
    debt = debt + debtDrawn - debtRepaid;
    contributed = contributed + equityIn;
    retained = retained + netProfit - distributions;

    peakFundingDrawn = Math.max(peakFundingDrawn, debt);

    const totalAssets = property + cash;
    const totalLiabilities = debt;
    const totalEquity = contributed + retained;

    out.push({
      label: p.label,
      revenue,
      costOfSales: cogs,
      grossProfit,
      operatingExpenses: opex,
      depreciation: depr,
      operatingProfit,
      interest,
      profitBeforeTax: pbt,
      tax,
      netProfit,
      cashFromOperations,
      cashFromInvesting,
      cashFromFinancing,
      netCashFlow,
      openingCash,
      closingCash: cash,
      propertyAsset: property,
      cash,
      totalAssets,
      debt,
      totalLiabilities,
      contributedEquity: contributed,
      retainedEarnings: retained,
      totalEquity,
      marketValue: p.marketValue,
      cashAvailableForDistribution: cash > 0 ? cash : 0,
      balanceCheck: totalAssets - (totalLiabilities + totalEquity),
    });
  }

  return {
    type: opts.type,
    developmentType: opts.developmentType,
    currency: "ZAR",
    periodicity: opts.periodicity,
    propertyAssetLabel: opts.propertyAssetLabel,
    periods: out,
    assumptions: opts.assumptions ?? [],
    totals: {
      revenue: out.reduce((a, s) => a + s.revenue, 0),
      netProfit: out.reduce((a, s) => a + s.netProfit, 0),
      peakFundingDrawn,
      closingCash: out.length ? out[out.length - 1]!.closingCash : 0,
      closingEquity: out.length ? out[out.length - 1]!.totalEquity : 0,
    },
  };
}

// ============================================================================
// FLIP — a short buy / renovate / sell project shown in two phases.
// ============================================================================

export function projectFlipStatements(
  f: PropertyFlipInput,
  opts?: { taxRate?: number },
): ProjectedStatements {
  const salePrice = f.afterRepairValue || f.estimatedValue || 0;
  const purchase = f.purchasePrice || 0;
  const reno = f.renovationBudget || f.estimatedRepairCosts || 0;
  const buyCosts = f.closingCostsPurchase || 0;
  const sellCosts = f.closingCostsSale || 0;
  const holding = f.holdingCosts || 0;
  const capitalised = purchase + buyCosts + reno;
  const months = Math.max(1, Math.round((f.daysToComplete || 0) / 30) || 6);

  const periods: PeriodInput[] = [
    {
      label: `Acquisition & Renovation (~${months} mo)`,
      capex: capitalised,
      operatingExpenses: holding,
      equityIn: capitalised + holding,
    },
    {
      label: "Disposal (Sale)",
      revenue: salePrice,
      costOfSales: capitalised,
      operatingExpenses: sellCosts,
    },
  ];

  return buildStatements({}, periods, {
    type: "flip",
    periodicity: "phase",
    propertyAssetLabel: "Property inventory (held for resale)",
    taxRate: opts?.taxRate,
    assumptions: [
      { label: "Purchase price", value: zar(purchase) },
      { label: "Renovation budget", value: zar(reno) },
      { label: "Expected resale (ARV)", value: zar(salePrice) },
      { label: "Holding period", value: `~${months} months` },
      { label: "Funding", value: "100% equity (indicative)" },
    ],
  });
}

// ============================================================================
// RENTAL — a buy-to-let held over a multi-year horizon.
// ============================================================================

export function projectRentalStatements(
  r: RentalPropertyInput,
  opts?: { years?: number; rentEscalation?: number; inflation?: number; taxRate?: number },
): ProjectedStatements {
  const years = Math.max(1, Math.min(30, opts?.years ?? 5));
  const rentEsc = (opts?.rentEscalation ?? 6) / 100;
  const inflation = (opts?.inflation ?? 5) / 100;
  const appreciation = (r.appreciationRate ?? 3) / 100;
  const price = r.purchasePrice || 0;
  const closing = r.closingCosts ?? 0;
  const propertyCost = price + closing;

  const rate = (r.interestRate || 0) / 100;
  let debt = r.loanAmount || 0;
  const monthlyDS =
    r.monthlyDebtService ||
    (debt > 0 && r.loanTermYears > 0
      ? calculateMonthlyDebtService(debt, r.interestRate || 0, r.loanTermYears)
      : 0);
  const annualDebtService = monthlyDS * 12;

  const opexBase =
    (r.annualPropertyTax || 0) +
    (r.annualInsurance || 0) +
    ((r.monthlyHOAFees || 0) +
      (r.monthlyMaintenanceReserve || 0) +
      (r.monthlyUtilities || 0) +
      (r.monthlyManagementFee || 0)) *
      12;

  const periods: PeriodInput[] = [];
  let runningDebt = debt;
  for (let y = 1; y <= years; y++) {
    const grossRent = (r.monthlyRent || 0) * 12 * Math.pow(1 + rentEsc, y - 1);
    const vacancy = grossRent * ((r.vacancyRate || 0) / 100);
    const revenue = grossRent - vacancy;
    const opex = opexBase * Math.pow(1 + inflation, y - 1);
    const interest = runningDebt * rate;
    let principal = 0;
    if (annualDebtService > 0 && runningDebt > 0) {
      principal = Math.min(runningDebt, Math.max(0, annualDebtService - interest));
    }
    runningDebt -= principal;
    periods.push({
      label: `Year ${y}`,
      revenue,
      operatingExpenses: opex,
      interest,
      debtRepaid: principal,
      marketValue: price * Math.pow(1 + appreciation, y),
    });
  }

  return buildStatements(
    {
      propertyAsset: propertyCost,
      debt,
      contributedEquity: Math.max(0, propertyCost - debt),
    },
    periods,
    {
      type: "rental",
      periodicity: "annual",
      propertyAssetLabel: "Investment property (at cost)",
      taxRate: opts?.taxRate,
      assumptions: [
        { label: "Property cost (incl. acquisition)", value: zar(propertyCost) },
        { label: "Bond / loan", value: zar(debt) },
        { label: "Starting monthly rent", value: zar(r.monthlyRent || 0) },
        { label: "Rent escalation", value: `${(rentEsc * 100).toFixed(1)}% p.a.` },
        { label: "Vacancy allowance", value: `${(r.vacancyRate || 0).toFixed(1)}%` },
        { label: "Cost inflation", value: `${(inflation * 100).toFixed(1)}% p.a.` },
        { label: "Capital growth (memo)", value: `${(appreciation * 100).toFixed(1)}% p.a.` },
      ],
    },
  );
}

// ============================================================================
// DEVELOPMENT — greenfield build, then sale (resale) or hold (rental).
// ============================================================================

export type DevelopmentStatementsInput = {
  developmentType: "AFFORDABLE_RESALE" | "AFFORDABLE_RENTAL" | "COMMERCIAL_RENTAL";
  landCost: number;
  hardCosts: number;
  softCosts: number;
  contingencyAmount: number;
  financingCosts: number;
  timelineMonths: number;
  /** Total sales revenue for a resale development. */
  grossDevelopmentValue: number;
  equityAmount: number;
  seniorDebtAmount: number;
  debtAnnualRate: number;
  /** Rental developments: stabilised annual gross rent and operating expenses. */
  annualGrossRent?: number;
  annualOperatingExpenses?: number;
  stabilizedCapRate?: number;
  /** Operating years to project after completion for rental developments. */
  operatingYears?: number;
};

export function projectDevelopmentStatements(
  d: DevelopmentStatementsInput,
  opts?: { taxRate?: number },
): ProjectedStatements {
  const isResale = d.developmentType === "AFFORDABLE_RESALE";
  const rate = (d.debtAnnualRate || 0) / 100;
  const land = d.landCost || 0;
  const buildCost = (d.hardCosts || 0) + (d.softCosts || 0) + (d.contingencyAmount || 0);
  const financing = d.financingCosts || 0;
  const totalCapitalised = land + buildCost + financing;
  const months = Math.max(1, Math.round(d.timelineMonths || 12));
  const buildYears = Math.max(1, Math.ceil(months / 12));

  let equityRemaining = d.equityAmount || 0;
  let runningDebt = 0;
  const periods: PeriodInput[] = [];

  // Spread the build cost (hard + soft + contingency + financing) evenly across
  // the build years; land settles entirely in year one.
  const spreadable = buildCost + financing;
  for (let y = 1; y <= buildYears; y++) {
    const capex = (y === 1 ? land : 0) + spreadable / buildYears;
    const interest = runningDebt * rate;
    const need = capex + interest;
    const fromEquity = Math.min(equityRemaining, need);
    equityRemaining -= fromEquity;
    const fromDebt = Math.max(0, need - fromEquity);
    runningDebt += fromDebt; // interest funded by drawing more debt
    periods.push({
      label: buildYears === 1 ? "Construction" : `Construction — Year ${y}`,
      capex,
      interest,
      equityIn: fromEquity,
      debtDrawn: fromDebt,
    });
  }

  if (isResale) {
    // Completion & sale: recognise the full GDV against the capitalised cost,
    // settle the outstanding debt from the proceeds.
    periods.push({
      label: "Completion & Sales",
      revenue: d.grossDevelopmentValue || 0,
      costOfSales: totalCapitalised,
      debtRepaid: runningDebt,
    });
    return buildStatements({}, periods, {
      type: "development",
      developmentType: d.developmentType,
      periodicity: "annual",
      propertyAssetLabel: "Development in progress (inventory)",
      taxRate: opts?.taxRate,
      assumptions: developmentAssumptions(d, totalCapitalised),
    });
  }

  // Rental development — hold and let after completion.
  const operatingYears = Math.max(1, Math.min(20, d.operatingYears ?? 5));
  const grossRent = d.annualGrossRent || 0;
  const opex = d.annualOperatingExpenses || 0;
  // Commercial buildings are depreciated over 20 years; land is not depreciated.
  const annualDepreciation =
    d.developmentType === "COMMERCIAL_RENTAL" ? (d.hardCosts || 0) / 20 : 0;
  const stabilisedValue =
    d.stabilizedCapRate && d.stabilizedCapRate > 0
      ? (grossRent - opex) / (d.stabilizedCapRate / 100)
      : totalCapitalised;

  for (let y = 1; y <= operatingYears; y++) {
    const escalated = Math.pow(1.06, y - 1);
    periods.push({
      label: `Operations — Year ${y}`,
      revenue: grossRent * escalated,
      operatingExpenses: opex * Math.pow(1.05, y - 1),
      depreciation: annualDepreciation,
      interest: runningDebt * rate,
      marketValue: stabilisedValue,
    });
  }

  return buildStatements({}, periods, {
    type: "development",
    developmentType: d.developmentType,
    periodicity: "annual",
    propertyAssetLabel: "Investment property under development",
    taxRate: opts?.taxRate,
    assumptions: developmentAssumptions(d, totalCapitalised),
  });
}

function developmentAssumptions(
  d: DevelopmentStatementsInput,
  totalCapitalised: number,
): { label: string; value: string }[] {
  const base = [
    { label: "Land cost", value: zar(d.landCost || 0) },
    { label: "Build cost (hard + soft + contingency)", value: zar((d.hardCosts || 0) + (d.softCosts || 0) + (d.contingencyAmount || 0)) },
    { label: "Total development cost", value: zar(totalCapitalised) },
    { label: "Equity", value: zar(d.equityAmount || 0) },
    { label: "Senior debt", value: zar(d.seniorDebtAmount || 0) },
    { label: "Debt rate", value: `${(d.debtAnnualRate || 0).toFixed(1)}% p.a.` },
    { label: "Programme", value: `${Math.max(1, Math.round(d.timelineMonths || 12))} months` },
  ];
  if (d.developmentType === "AFFORDABLE_RESALE") {
    base.push({ label: "Gross development value", value: zar(d.grossDevelopmentValue || 0) });
  } else {
    base.push({ label: "Stabilised annual rent", value: zar(d.annualGrossRent || 0) });
    if (d.stabilizedCapRate) {
      base.push({ label: "Exit cap rate", value: `${d.stabilizedCapRate.toFixed(2)}%` });
    }
  }
  return base;
}

function zar(n: number): string {
  return "R" + Math.round(n || 0).toLocaleString("en-ZA");
}

// ============================================================================
// Dispatcher — build the right statements straight from a property record.
// ============================================================================

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

/**
 * Detects the property type from the attached sub-type record and returns the
 * projected statements, or `null` when there are not enough inputs to project.
 * Accepts a loosely-typed Prisma-shaped property (flip / rental / development).
 */
export function buildStatementsForProperty(
  property: any,
  opts?: { rentalYears?: number; developmentOperatingYears?: number; taxRate?: number },
): ProjectedStatements | null {
  if (!property) return null;

  // ── Development ──────────────────────────────────────────────────────────
  const dev = property.propertyDevelopment;
  if (dev) {
    const developmentType = (dev.developmentType ?? "AFFORDABLE_RESALE") as DevelopmentStatementsInput["developmentType"];
    const hardCosts = num(dev.hardCosts);
    const softCosts = num(dev.softCosts);
    const contingencyAmount =
      num(dev.contingencyAmount) || ((hardCosts + softCosts) * num(dev.contingencyPercent)) / 100;
    const numberOfUnits = num(dev.numberOfUnits);
    const gdv =
      num(dev.totalExpectedRevenue) || numberOfUnits * num(dev.expectedSalePricePerUnit);
    const annualGrossRent =
      num(dev.annualGrossRentalIncome) ||
      numberOfUnits * num(dev.expectedMonthlyRentPerUnit) * 12;

    const input: DevelopmentStatementsInput = {
      developmentType,
      landCost: num(dev.landAcquisitionCost),
      hardCosts,
      softCosts,
      contingencyAmount,
      financingCosts: num(dev.financingCosts),
      timelineMonths: num(dev.developmentTimelineMonths) || 12,
      grossDevelopmentValue: gdv,
      equityAmount: num(dev.equityAmount),
      seniorDebtAmount: num(dev.seniorDebtAmount),
      debtAnnualRate: num(dev.seniorDebtRate),
      annualGrossRent,
      annualOperatingExpenses: num(dev.annualOperatingExpenses),
      stabilizedCapRate: num(dev.stabilizedCapRate) || undefined,
      operatingYears: opts?.developmentOperatingYears,
    };
    // Need at least some cost to project anything meaningful.
    if (input.landCost + input.hardCosts + input.softCosts <= 0) return null;
    return projectDevelopmentStatements(input, { taxRate: opts?.taxRate });
  }

  // ── Rental ───────────────────────────────────────────────────────────────
  const rental = property.rentalBond;
  if (rental) {
    const input = buildRentalInput(rental, property.price);
    if (input.purchasePrice <= 0 && input.monthlyRent <= 0) return null;
    return projectRentalStatements(input, {
      years: opts?.rentalYears ?? 5,
      taxRate: opts?.taxRate,
    });
  }

  // ── Flip ─────────────────────────────────────────────────────────────────
  const flip = property.propertyFlip;
  if (flip) {
    const input: PropertyFlipInput = {
      purchasePrice: num(flip.purchasePrice) || num(property.price),
      renovationBudget: num(flip.renovationBudget),
      estimatedValue: num(flip.estimatedValue),
      holdingCosts: num(flip.holdingCosts),
      closingCostsPurchase: num(flip.closingCostsPurchase),
      closingCostsSale: num(flip.closingCostsSale),
      estimatedRepairCosts: num(flip.estimatedRepairCosts),
      afterRepairValue: num(flip.afterRepairValue),
      maxOfferPrice: num(flip.maxOfferPrice),
      expectedROI: num(flip.expectedROI),
      expectedProfitMargin: num(flip.expectedProfitMargin),
      daysToComplete: num(flip.daysToComplete),
      totalInvestmentBudget: num(flip.totalInvestmentBudget),
      spentInvestmentBudget: num(flip.spentInvestmentBudget),
    };
    const sale = input.afterRepairValue || input.estimatedValue;
    if (input.purchasePrice <= 0 && sale <= 0) return null;
    return projectFlipStatements(input, { taxRate: opts?.taxRate });
  }

  return null;
}
