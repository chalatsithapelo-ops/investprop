import { describe, it, expect } from "vitest";
import { computeFeeFromBps, DEFAULT_FEE_CONFIG } from "../platform-fees";

describe("computeFeeFromBps", () => {
  it("computes 2.5% (250 bps) of a capital raise correctly", () => {
    // 250 bps = 2.5% of R100,000 = R2,500
    expect(computeFeeFromBps(100_000, 250)).toBe(2_500);
  });

  it("computes 1% (100 bps) correctly", () => {
    expect(computeFeeFromBps(50_000, 100)).toBe(500);
  });

  it("computes 20% (2000 bps) correctly", () => {
    expect(computeFeeFromBps(10_000, 2000)).toBe(2_000);
  });

  it("rounds to 2 decimal places (ZAR cents)", () => {
    // 100 bps of 33.337 = 0.33337 → 0.33
    expect(computeFeeFromBps(33.337, 100)).toBe(0.33);
  });

  it("returns 0 for non-positive base amounts", () => {
    expect(computeFeeFromBps(0, 250)).toBe(0);
    expect(computeFeeFromBps(-1000, 250)).toBe(0);
  });

  it("returns 0 for non-positive bps", () => {
    expect(computeFeeFromBps(100_000, 0)).toBe(0);
    expect(computeFeeFromBps(100_000, -50)).toBe(0);
  });

  it("returns 0 for non-finite inputs", () => {
    expect(computeFeeFromBps(NaN, 250)).toBe(0);
    expect(computeFeeFromBps(100_000, Infinity)).toBe(0);
  });
});

describe("DEFAULT_FEE_CONFIG", () => {
  it("mirrors the Prisma schema defaults", () => {
    expect(DEFAULT_FEE_CONFIG).toEqual({
      capitalRaiseFeeBps: 250,
      distributionFeeBps: 200,
      secondaryTradeFeeBps: 100,
      secondaryTradeBuyerFeeBps: 100,
      sourcingFeeBps: 100,
      sourcingFlatFee: 0,
      sellerFacilitationFeeBps: 200,
      assessmentPackFee: 2500,
      jvPromoteFeeBps: 1000,
      leaseBackSetupFee: 5000,
      leaseBackMgmtFeeBps: 800,
      bondReferralFee: 0,
      withdrawalFeeBps: 0,
      withdrawalFlatFee: 10,
      enabled: true,
    });
  });
});
