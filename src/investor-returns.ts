// ============================================================================
// Per-investor return projection
// ----------------------------------------------------------------------------
// Scales a deal's WHOLE-PROJECT economics down to a single investor's stake and
// answers the only question an investor really has: "for my R X, what do I get
// back, when, and what if it goes wrong?".
//
// It is strategy-aware (the investor picks their OWN exit plan, which may differ
// from the sponsor's), models optional personal gearing (using a bank loan to
// co-invest), applies the capital-first / preferred-return / promote waterfall,
// nets off platform fees and estimated tax, and produces downside / base /
// upside scenarios with money multiple (MOIC), annualised return and IRR.
//
// Pure + deterministic so it is unit-testable and importable on the client.
// All figures are ESTIMATES, never guarantees, and never financial advice.
// ============================================================================

import {
  calculateAnnualisedReturn,
  calculateAnnualIRRFromMonthly,
  calculateMonthlyDebtService,
} from "./financial-calculations";

/** The investor's chosen exit strategy for their stake in a deal. */
export type InvestorStrategy =
  | "FLIP" // ride the sponsor's buy-renovate-sell to completion
  | "DEVELOPMENT_EXIT" // hold until the development completes and sells
  | "RENTAL_INCOME" // hold and collect rental distributions
  | "BUY_AND_HOLD" // long hold for income + capital growth
  | "EARLY_RESALE"; // sell shares on the secondary market before project exit

export const INVESTOR_STRATEGIES: InvestorStrategy[] = [
  "FLIP",
  "DEVELOPMENT_EXIT",
  "RENTAL_INCOME",
  "BUY_AND_HOLD",
  "EARLY_RESALE",
];

/** Human labels + one-liners for each strategy (shared by web + mobile UI). */
export const STRATEGY_META: Record<
  InvestorStrategy,
  { label: string; blurb: string }
> = {
  FLIP: {
    label: "Flip to completion",
    blurb:
      "Ride the buy-renovate-sell through to the sale. Your return is a one-off capital gain when the property sells.",
  },
  DEVELOPMENT_EXIT: {
    label: "Hold to development exit",
    blurb:
      "Stay in until the development is built and sold. Your return is realised when units are sold at the end.",
  },
  RENTAL_INCOME: {
    label: "Rental income",
    blurb:
      "Hold and collect your share of the rental distributions, plus any capital growth when you eventually exit.",
  },
  BUY_AND_HOLD: {
    label: "Long buy & hold",
    blurb:
      "Hold for the long term for rental income plus compounding capital growth. Best for patient capital.",
  },
  EARLY_RESALE: {
    label: "Early resale (sell my shares)",
    blurb:
      "Exit before the project's natural end by selling your shares on the secondary market. You capture the growth accrued so far.",
  },
};

/** Whether a strategy earns interim rental distributions during the hold. */
export function strategyEarnsIncome(strategy: InvestorStrategy): boolean {
  return (
    strategy === "RENTAL_INCOME" ||
    strategy === "BUY_AND_HOLD" ||
    strategy === "EARLY_RESALE"
  );
}

/** Optional personal gearing — using a bank loan to fund part of the stake. */
export interface InvestorFinancing {
  /** Loan principal drawn to co-invest, in Rand. */
  amount: number;
  /** Annual interest rate, as a percentage (e.g. 11.75). */
  annualRate: number;
  /** Amortisation term in months. */
  termMonths: number;
}

/** How the investor holds the stake — drives which tax rates are assumed. */
export type HoldingType = "INDIVIDUAL" | "COMPANY";

/** Whole-deal figures for a single scenario band (downside / base / upside). */
export interface ScenarioEconomics {
  /** Whole-project profit over the project's life, in Rand. */
  projectProfit: number;
  /** Whole-project annual net income (NOI / net rent), in Rand. Optional. */
  projectAnnualIncome?: number;
}

export interface InvestorReturnInput {
  /** Total the investor commits to the deal, in Rand. */
  contributionAmount: number;
  /** The investor's share of the whole deal, 0..1. */
  ownershipFraction: number;
  /** The investor's chosen exit strategy. */
  strategy: InvestorStrategy;
  /** The investor's chosen hold period, in months. */
  holdMonths: number;
  /** The sponsor's planned project timeline, in months (for early-resale proration). */
  projectHoldMonths: number;
  /** Whole-deal economics per scenario band. */
  scenarios: {
    downside: ScenarioEconomics;
    base: ScenarioEconomics;
    upside: ScenarioEconomics;
  };
  /** Annual preferred return paid to investors before any promote, as a %. */
  preferredReturnRate?: number;
  /** Share of residual profit (after pref) kept by investors, 0..100. */
  investorProfitShare?: number;
  /** Platform fee charged on the investor's profit, as a %. */
  platformFeeRate?: number;
  /** Estimated tax rate applied to the investor's taxable gain, as a %. Used as
   *  the fallback for both the income and capital-gains rates below. */
  taxRate?: number;
  /** Estimated tax rate on the rental-income portion of profit, as a %.
   *  Defaults to `taxRate` when omitted. */
  incomeTaxRate?: number;
  /** Estimated effective CGT rate on the capital-gain portion, as a %.
   *  Defaults to `taxRate` when omitted. */
  capitalGainsTaxRate?: number;
  /** Investor's pro-rata share of estimated SA transaction costs (transfer
   *  duty, conveyancing, STT), in Rand. Defaults to 0. */
  estimatedTransactionCosts?: number;
  /** How the investor holds the stake (drives the tax-assumption label). */
  holdingType?: HoldingType;
  /** Optional personal gearing. */
  financing?: InvestorFinancing;
}

export interface InvestorScenario {
  label: "downside" | "base" | "upside";
  /** Capital returned to the investor (impaired below contribution in a loss). */
  capitalReturned: number;
  /** Preferred return paid before promote. */
  preferredReturnPaid: number;
  /** Investor's share of residual profit after pref + promote. */
  profitShare: number;
  /** capitalReturned + preferredReturnPaid + profitShare, before fees/tax/loan. */
  grossPayout: number;
  /** Platform fee charged on profit. */
  platformFee: number;
  /** Estimated tax on the taxable gain (income tax + CGT). */
  taxEstimate: number;
  /** Estimated income tax on the rental-income portion of profit. */
  incomeTaxEstimate: number;
  /** Estimated CGT on the capital-gain portion of profit. */
  capitalGainsTaxEstimate: number;
  /** Investor's pro-rata share of estimated SA transaction costs. */
  transactionCosts: number;
  /** Total loan interest paid over the hold (0 when ungeared). */
  loanInterestPaid: number;
  /** Outstanding loan principal repaid from the exit proceeds (0 when ungeared). */
  loanPrincipalRepaid: number;
  /** Cash the investor nets after fees, tax and settling the loan. */
  netProceeds: number;
  /** The investor's OWN cash at risk (contribution − loan). */
  ownCashInvested: number;
  /** Net profit on the investor's own cash. */
  netProfit: number;
  /** Money multiple on own cash (netProceeds ÷ own cash). */
  moic: number;
  /** Annualised return on own cash, as a %. */
  annualisedReturn: number;
  /** IRR on own cash (accounts for loan interest timing), as a %. */
  irr: number;
}

export interface InvestorReturnProjection {
  strategy: InvestorStrategy;
  holdMonths: number;
  usesFinancing: boolean;
  ownCashInvested: number;
  loanAmount: number;
  scenarios: {
    downside: InvestorScenario;
    base: InvestorScenario;
    upside: InvestorScenario;
  };
  /** How the investor holds the stake (echoed back for the UI toggle). */
  holdingType: HoldingType;
  /** Short disclosure lines the UI should surface (tax/pref/cost assumptions). */
  notes: string[];
  /** Plain-English, base-case one-liner for the UI. */
  summary: string;
  disclaimer: string;
}

const DISCLAIMER =
  "These are estimates, not guarantees, and not financial advice. Actual returns " +
  "depend on how the deal performs and may be lower — you could lose some or all " +
  "of your capital. Figures use your chosen strategy and assumptions.";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Loan interest paid over `holdMonths` and the balance still outstanding at exit,
 * on an amortising loan. Returns zeros when there is no effective loan.
 */
function amortisingLoanCost(
  principal: number,
  annualRate: number,
  termMonths: number,
  holdMonths: number,
): { interestPaid: number; balanceAtExit: number; monthlyPayment: number } {
  if (principal <= 0 || annualRate <= 0 || termMonths <= 0) {
    return { interestPaid: 0, balanceAtExit: principal > 0 ? principal : 0, monthlyPayment: 0 };
  }
  const monthlyPayment = calculateMonthlyDebtService(principal, annualRate, termMonths / 12);
  const monthlyRate = annualRate / 100 / 12;
  let balance = principal;
  let interestPaid = 0;
  const months = Math.min(holdMonths, termMonths);
  for (let m = 0; m < months; m++) {
    const interest = balance * monthlyRate;
    const principalPortion = Math.min(balance, monthlyPayment - interest);
    interestPaid += interest;
    balance = Math.max(0, balance - principalPortion);
  }
  return { interestPaid, balanceAtExit: balance, monthlyPayment };
}

/** Compute one scenario band for the investor. */
function computeScenario(
  label: "downside" | "base" | "upside",
  econ: ScenarioEconomics,
  input: InvestorReturnInput,
): InvestorScenario {
  const {
    contributionAmount,
    ownershipFraction,
    strategy,
    holdMonths,
    projectHoldMonths,
    preferredReturnRate = 0,
    investorProfitShare = 100,
    platformFeeRate = 0,
    taxRate = 0,
    incomeTaxRate,
    capitalGainsTaxRate,
    estimatedTransactionCosts = 0,
    financing,
  } = input;

  const incomeRate = incomeTaxRate ?? taxRate;
  const capitalRate = capitalGainsTaxRate ?? taxRate;

  const years = holdMonths > 0 ? holdMonths / 12 : 0;

  // How much of the project's capital gain this investor realises. A flip or
  // development is only realised at completion (full share); an early resale
  // captures the growth accrued pro-rata to how long they held vs the project.
  const capitalGainFraction =
    strategy === "FLIP" || strategy === "DEVELOPMENT_EXIT"
      ? 1
      : projectHoldMonths > 0
        ? clamp(holdMonths / projectHoldMonths, 0, 1)
        : 1;

  const capitalGain = econ.projectProfit * ownershipFraction * capitalGainFraction;

  const incomeMonths = strategyEarnsIncome(strategy) ? holdMonths : 0;
  const income =
    (econ.projectAnnualIncome ?? 0) * ownershipFraction * (incomeMonths / 12);

  // Gross profit to the investor before the waterfall, fees and tax.
  const grossProfit = capitalGain + income;

  // ── Waterfall ──────────────────────────────────────────────────────────
  // Capital back first, then a preferred return, then the residual is split
  // between the investor and the sponsor's promote. In a loss the waterfall
  // collapses: the investor simply bears their pro-rata share of the loss.
  let capitalReturned: number;
  let preferredReturnPaid: number;
  let profitShare: number;

  if (grossProfit >= 0) {
    capitalReturned = contributionAmount;
    const preferredTarget = contributionAmount * (preferredReturnRate / 100) * years;
    preferredReturnPaid = Math.min(preferredTarget, grossProfit);
    const residual = Math.max(0, grossProfit - preferredReturnPaid);
    profitShare = residual * (investorProfitShare / 100);
  } else {
    // Loss: capital is impaired, no pref, no promote.
    capitalReturned = Math.max(0, contributionAmount + grossProfit);
    preferredReturnPaid = 0;
    profitShare = 0;
  }

  const grossPayout = capitalReturned + preferredReturnPaid + profitShare;

  // ── Fees & tax (only on positive profit) ───────────────────────────────
  const profitForFees = Math.max(0, preferredReturnPaid + profitShare);
  const platformFee = profitForFees * (platformFeeRate / 100);
  const netTaxable = Math.max(0, profitForFees - platformFee);
  // Split the realised profit into income vs capital gain in the same ratio as
  // the gross profit was composed, so rental income is taxed as income and
  // capital growth is taxed at CGT (recommendation: don't blend the two).
  const incomeShare = grossProfit > 0 ? clamp(income / grossProfit, 0, 1) : 0;
  const incomeTaxable = netTaxable * incomeShare;
  const capitalTaxable = netTaxable - incomeTaxable;
  const incomeTaxEstimate = incomeTaxable * (incomeRate / 100);
  const capitalGainsTaxEstimate = capitalTaxable * (capitalRate / 100);
  const taxEstimate = incomeTaxEstimate + capitalGainsTaxEstimate;

  // Estimated SA transaction costs (transfer duty / conveyancing / STT),
  // already pro-rated to this investor's stake by the caller.
  const transactionCosts = Math.max(0, estimatedTransactionCosts);

  // ── Personal gearing ───────────────────────────────────────────────────
  const loanAmount = financing?.amount ?? 0;
  const ownCashInvested = Math.max(0, contributionAmount - loanAmount);
  let loanInterestPaid = 0;
  let loanPrincipalRepaid = 0;
  let monthlyLoanPayment = 0;
  if (loanAmount > 0 && financing) {
    const { interestPaid, balanceAtExit, monthlyPayment } = amortisingLoanCost(
      loanAmount,
      financing.annualRate,
      financing.termMonths,
      holdMonths,
    );
    loanInterestPaid = interestPaid;
    loanPrincipalRepaid = balanceAtExit;
    monthlyLoanPayment = monthlyPayment;
  }

  const netProceeds =
    grossPayout - platformFee - taxEstimate - transactionCosts - loanInterestPaid - loanPrincipalRepaid;

  const denominator = ownCashInvested > 0 ? ownCashInvested : contributionAmount;
  const netProfit = netProceeds - denominator;
  const moic = denominator > 0 ? netProceeds / denominator : 0;

  // ── Annualised + IRR on OWN cash ───────────────────────────────────────
  const annualisedReturn = calculateAnnualisedReturn(netProfit, denominator, holdMonths);

  let irr = annualisedReturn;
  if (holdMonths > 0) {
    // Monthly cash-flow series: own cash out today, loan interest each month
    // (amortising payment less what principal repayment the exit covers),
    // exit proceeds at the end.
    const n = Math.max(1, Math.round(holdMonths));
    const flows: number[] = new Array(n + 1).fill(0);
    flows[0] = -denominator;
    if (loanAmount > 0) {
      for (let m = 1; m <= n; m++) flows[m] -= monthlyLoanPayment;
    }
    // Exit proceeds: gross payout less fees/tax, less the loan balance settled
    // at exit (monthly payments already deducted above cover the rest).
    flows[n] += grossPayout - platformFee - taxEstimate - transactionCosts - loanPrincipalRepaid;
    const solved = calculateAnnualIRRFromMonthly(flows);
    if (!Number.isNaN(solved)) irr = solved;
  }

  return {
    label,
    capitalReturned,
    preferredReturnPaid,
    profitShare,
    grossPayout,
    platformFee,
    taxEstimate,
    incomeTaxEstimate,
    capitalGainsTaxEstimate,
    transactionCosts,
    loanInterestPaid,
    loanPrincipalRepaid,
    netProceeds,
    ownCashInvested: denominator,
    netProfit,
    moic,
    annualisedReturn,
    irr,
  };
}

/**
 * Project a single investor's return for their chosen strategy across
 * downside / base / upside scenarios, with optional personal gearing.
 */
export function projectInvestorReturn(
  input: InvestorReturnInput,
): InvestorReturnProjection {
  const downside = computeScenario("downside", input.scenarios.downside, input);
  const base = computeScenario("base", input.scenarios.base, input);
  const upside = computeScenario("upside", input.scenarios.upside, input);

  const loanAmount = input.financing?.amount ?? 0;
  const ownCash = Math.max(0, input.contributionAmount - loanAmount);
  const usesFinancing = loanAmount > 0;

  const rand = (n: number) =>
    "R" +
    Math.round(n).toLocaleString("en-ZA", { maximumFractionDigits: 0 });
  const monthsLabel =
    input.holdMonths >= 12 && input.holdMonths % 12 === 0
      ? `${input.holdMonths / 12} year${input.holdMonths === 12 ? "" : "s"}`
      : `${input.holdMonths} month${input.holdMonths === 1 ? "" : "s"}`;

  const summary =
    `You invest ${rand(input.contributionAmount)}` +
    (usesFinancing ? ` (${rand(ownCash)} of your own cash + ${rand(loanAmount)} loan)` : "") +
    `. In the base case you receive about ${rand(base.netProceeds)} after ~${monthsLabel} — ` +
    `your capital back plus ${rand(base.netProfit)} profit, net of fees` +
    (base.taxEstimate > 0 ? " and estimated tax" : "") +
    (usesFinancing ? " and after settling the loan" : "") +
    ` (≈${base.annualisedReturn.toFixed(1)}% a year).`;

  const holdingType: HoldingType = input.holdingType ?? "COMPANY";
  const notes: string[] = [];
  if (input.preferredReturnRate && input.preferredReturnRate > 0) {
    notes.push(
      "Preferred return is simple (non-compounded) and is paid only to the extent profit allows — any unpaid preferred does not accrue to later periods.",
    );
  }
  notes.push(
    holdingType === "COMPANY"
      ? "Estimated tax assumes a company/SPV holding (27% on trading income, ~21.6% effective CGT). Switch to ‘Individual’ to model personal marginal rates."
      : "Estimated tax assumes an individual holding at the top marginal rate (45% on trading/rental income, ~18% effective CGT). Your actual rate may be lower.",
  );
  if (base.transactionCosts > 0) {
    notes.push(
      "Estimated transaction costs include your pro-rata share of transfer duty, conveyancing and securities transfer tax (STT). Actual costs vary by deal and province.",
    );
  }

  return {
    strategy: input.strategy,
    holdMonths: input.holdMonths,
    usesFinancing,
    ownCashInvested: ownCash > 0 ? ownCash : input.contributionAmount,
    loanAmount,
    scenarios: { downside, base, upside },
    holdingType,
    notes,
    summary,
    disclaimer: DISCLAIMER,
  };
}
