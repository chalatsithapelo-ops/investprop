import { describe, it, expect } from "vitest";
import {
  projectInvestorReturn,
  strategyEarnsIncome,
  INVESTOR_STRATEGIES,
  type InvestorReturnInput,
} from "../investor-returns";

// A R100k stake taking 10% of a deal whose whole-project base profit is R1m.
function baseInput(overrides: Partial<InvestorReturnInput> = {}): InvestorReturnInput {
  return {
    contributionAmount: 100_000,
    ownershipFraction: 0.1,
    strategy: "FLIP",
    holdMonths: 12,
    projectHoldMonths: 12,
    scenarios: {
      downside: { projectProfit: 400_000, projectAnnualIncome: 0 },
      base: { projectProfit: 1_000_000, projectAnnualIncome: 0 },
      upside: { projectProfit: 1_400_000, projectAnnualIncome: 0 },
    },
    preferredReturnRate: 0,
    investorProfitShare: 100,
    platformFeeRate: 0,
    taxRate: 0,
    ...overrides,
  };
}

describe("projectInvestorReturn — basics", () => {
  it("scales whole-deal profit by ownership fraction (flip, no fees)", () => {
    const p = projectInvestorReturn(baseInput());
    // 10% of R1m base profit = R100k profit on a R100k stake → 2x MOIC.
    expect(p.scenarios.base.profitShare).toBeCloseTo(100_000, 0);
    expect(p.scenarios.base.netProceeds).toBeCloseTo(200_000, 0);
    expect(p.scenarios.base.netProfit).toBeCloseTo(100_000, 0);
    expect(p.scenarios.base.moic).toBeCloseTo(2, 2);
  });

  it("returns all three scenario bands in order", () => {
    const p = projectInvestorReturn(baseInput());
    expect(p.scenarios.downside.netProfit).toBeLessThan(p.scenarios.base.netProfit);
    expect(p.scenarios.upside.netProfit).toBeGreaterThan(p.scenarios.base.netProfit);
  });

  it("annualised return equals period return for a 12-month hold", () => {
    const p = projectInvestorReturn(baseInput());
    // 100% profit over 12 months → ~100% annualised.
    expect(p.scenarios.base.annualisedReturn).toBeCloseTo(100, 0);
  });
});

describe("waterfall — preferred return + promote", () => {
  it("applies a promote split to residual profit after the preferred return", () => {
    const p = projectInvestorReturn(
      baseInput({ preferredReturnRate: 10, investorProfitShare: 50 }),
    );
    // Pref = 100k * 10% * 1yr = 10k. Residual = 100k - 10k = 90k, investor keeps 50% = 45k.
    expect(p.scenarios.base.preferredReturnPaid).toBeCloseTo(10_000, 0);
    expect(p.scenarios.base.profitShare).toBeCloseTo(45_000, 0);
    // Total investor profit = 10k + 45k = 55k.
    expect(p.scenarios.base.netProfit).toBeCloseTo(55_000, 0);
  });
});

describe("loss handling", () => {
  it("impairs capital in a loss scenario and never returns negative payout", () => {
    const p = projectInvestorReturn(
      baseInput({
        scenarios: {
          downside: { projectProfit: -500_000 }, // 10% = -50k loss
          base: { projectProfit: 0 },
          upside: { projectProfit: 200_000 },
        },
      }),
    );
    expect(p.scenarios.downside.capitalReturned).toBeCloseTo(50_000, 0);
    expect(p.scenarios.downside.netProceeds).toBeGreaterThanOrEqual(0);
    expect(p.scenarios.downside.netProfit).toBeCloseTo(-50_000, 0);
  });
});

describe("fees and tax", () => {
  it("nets platform fee and tax out of profit only", () => {
    const p = projectInvestorReturn(
      baseInput({ platformFeeRate: 10, taxRate: 20 }),
    );
    // Profit 100k → fee 10k → taxable 90k → tax 18k → net profit 72k.
    expect(p.scenarios.base.platformFee).toBeCloseTo(10_000, 0);
    expect(p.scenarios.base.taxEstimate).toBeCloseTo(18_000, 0);
    expect(p.scenarios.base.netProfit).toBeCloseTo(72_000, 0);
  });
});

describe("personal gearing (bank loan to co-invest)", () => {
  it("measures return on own cash, not the geared total", () => {
    const geared = projectInvestorReturn(
      baseInput({
        financing: { amount: 70_000, annualRate: 11.5, termMonths: 60 },
      }),
    );
    // Own cash = 30k. MOIC is measured against own cash, so it is higher than ungeared.
    expect(geared.scenarios.base.ownCashInvested).toBeCloseTo(30_000, 0);
    expect(geared.usesFinancing).toBe(true);
    expect(geared.scenarios.base.loanInterestPaid).toBeGreaterThan(0);
    expect(geared.scenarios.base.loanPrincipalRepaid).toBeGreaterThan(0);
    const ungeared = projectInvestorReturn(baseInput());
    expect(geared.scenarios.base.moic).toBeGreaterThan(ungeared.scenarios.base.moic);
  });

  it("gearing amplifies losses on own cash in the downside", () => {
    const geared = projectInvestorReturn(
      baseInput({
        financing: { amount: 70_000, annualRate: 11.5, termMonths: 60 },
        scenarios: {
          downside: { projectProfit: -300_000 },
          base: { projectProfit: 0 },
          upside: { projectProfit: 200_000 },
        },
      }),
    );
    // 10% of -300k = -30k loss on 30k own cash → wipes out own cash (plus loan drag).
    expect(geared.scenarios.downside.netProfit).toBeLessThan(0);
  });
});

describe("strategy proration", () => {
  it("early resale realises only part of the capital gain pro-rata to the hold", () => {
    const early = projectInvestorReturn(
      baseInput({ strategy: "EARLY_RESALE", holdMonths: 18, projectHoldMonths: 60 }),
    );
    const full = projectInvestorReturn(
      baseInput({ strategy: "DEVELOPMENT_EXIT", holdMonths: 60, projectHoldMonths: 60 }),
    );
    expect(early.scenarios.base.profitShare).toBeLessThan(full.scenarios.base.profitShare);
  });

  it("rental income accrues distributions over the hold", () => {
    const rental = projectInvestorReturn(
      baseInput({
        strategy: "RENTAL_INCOME",
        holdMonths: 24,
        projectHoldMonths: 60,
        scenarios: {
          downside: { projectProfit: 0, projectAnnualIncome: 80_000 },
          base: { projectProfit: 0, projectAnnualIncome: 120_000 },
          upside: { projectProfit: 0, projectAnnualIncome: 150_000 },
        },
      }),
    );
    // 10% of R120k/yr over 2yr = R24k income profit.
    expect(rental.scenarios.base.netProfit).toBeCloseTo(24_000, -2);
  });

  it("strategyEarnsIncome matches the income-earning strategies", () => {
    expect(strategyEarnsIncome("FLIP")).toBe(false);
    expect(strategyEarnsIncome("DEVELOPMENT_EXIT")).toBe(false);
    expect(strategyEarnsIncome("RENTAL_INCOME")).toBe(true);
    expect(strategyEarnsIncome("BUY_AND_HOLD")).toBe(true);
    expect(strategyEarnsIncome("EARLY_RESALE")).toBe(true);
  });
});

describe("robustness", () => {
  it("produces a projection for every strategy without throwing", () => {
    for (const strategy of INVESTOR_STRATEGIES) {
      const p = projectInvestorReturn(baseInput({ strategy }));
      expect(p.summary).toContain("You invest");
      expect(p.disclaimer).toContain("not financial advice");
      expect(Number.isFinite(p.scenarios.base.irr)).toBe(true);
    }
  });

  it("handles a zero contribution gracefully", () => {
    const p = projectInvestorReturn(baseInput({ contributionAmount: 0, ownershipFraction: 0 }));
    expect(p.scenarios.base.netProceeds).toBe(0);
    expect(Number.isFinite(p.scenarios.base.moic)).toBe(true);
  });
});
