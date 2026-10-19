import { describe, it, expect } from "vitest";
import {
  PLAN_CATALOG,
  ALL_TIERS,
  getPlan,
  getPrice,
  tierHasFeature,
  tiersWithFeature,
} from "../plans";

describe("subscription plan catalog", () => {
  it("defines every tier", () => {
    expect(ALL_TIERS).toEqual(["FREE", "INVESTOR_PLUS", "PRO", "ENTERPRISE", "DISTRESSED", "SELLER_PRO"]);
    for (const tier of ALL_TIERS) {
      expect(PLAN_CATALOG[tier]).toBeDefined();
      expect(PLAN_CATALOG[tier].tier).toBe(tier);
    }
  });

  it("FREE plan costs nothing and unlocks no premium features", () => {
    const free = getPlan("FREE");
    expect(free.monthlyPrice).toBe(0);
    expect(free.annualPrice).toBe(0);
    expect(free.capabilities).toHaveLength(0);
  });

  it("annual price is cheaper than 12 monthly payments (incentive)", () => {
    for (const tier of ALL_TIERS) {
      const plan = PLAN_CATALOG[tier];
      if (plan.monthlyPrice > 0) {
        expect(plan.annualPrice).toBeLessThanOrEqual(plan.monthlyPrice * 12);
      }
    }
  });

  it("getPrice returns the right amount per cycle", () => {
    expect(getPrice("INVESTOR_PLUS", "MONTHLY")).toBe(PLAN_CATALOG.INVESTOR_PLUS.monthlyPrice);
    expect(getPrice("INVESTOR_PLUS", "ANNUAL")).toBe(PLAN_CATALOG.INVESTOR_PLUS.annualPrice);
  });
});

describe("feature gating", () => {
  it("Investor Plus unlocks AI co-pilot + portfolio advisor only", () => {
    expect(tierHasFeature("INVESTOR_PLUS", "AI_COPILOT")).toBe(true);
    expect(tierHasFeature("INVESTOR_PLUS", "AI_PORTFOLIO_ADVISOR")).toBe(true);
    expect(tierHasFeature("INVESTOR_PLUS", "DISTRESSED_ALERTS")).toBe(false);
    expect(tierHasFeature("INVESTOR_PLUS", "MARKET_DATA_EXPORT")).toBe(false);
  });

  it("FREE unlocks nothing", () => {
    expect(tierHasFeature("FREE", "AI_COPILOT")).toBe(false);
    expect(tierHasFeature("FREE", "DISTRESSED_ALERTS")).toBe(false);
  });

  it("Pro and Distressed both grant distressed alerts", () => {
    expect(tierHasFeature("PRO", "DISTRESSED_ALERTS")).toBe(true);
    expect(tierHasFeature("DISTRESSED", "DISTRESSED_ALERTS")).toBe(true);
  });

  it("only Enterprise grants market-data export", () => {
    const tiers = tiersWithFeature("MARKET_DATA_EXPORT");
    expect(tiers).toContain("ENTERPRISE");
    expect(tiers).not.toContain("PRO");
    expect(tiers).not.toContain("INVESTOR_PLUS");
  });

  it("tiersWithFeature returns tiers sorted cheapest-first", () => {
    const tiers = tiersWithFeature("AI_COPILOT");
    // INVESTOR_PLUS (rank 1) must come before PRO (rank 2) / ENTERPRISE (rank 3)
    expect(tiers[0]).toBe("INVESTOR_PLUS");
    const ranks = tiers.map((t) => PLAN_CATALOG[t].rank);
    const sorted = [...ranks].sort((a, b) => a - b);
    expect(ranks).toEqual(sorted);
  });
});
