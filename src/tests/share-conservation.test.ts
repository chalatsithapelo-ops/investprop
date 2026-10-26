import { describe, it, expect } from "vitest";
import {
  checkSupplyConservation,
  reconcileHoldingsAgainstLedger,
  resolveValuationPerShare,
} from "~/share-conservation";

describe("checkSupplyConservation", () => {
  it("is balanced when holdings sum to ≤ totalShares", () => {
    const r = checkSupplyConservation(1000, [{ sharesOwned: 400 }, { sharesOwned: 600 }]);
    expect(r.issued).toBe(1000);
    expect(r.available).toBe(0);
    expect(r.overIssued).toBe(false);
    expect(r.balanced).toBe(true);
  });

  it("reports available supply", () => {
    const r = checkSupplyConservation(1000, [{ sharesOwned: 250 }]);
    expect(r.available).toBe(750);
    expect(r.balanced).toBe(true);
  });

  it("flags over-issuance (duplicate/phantom shares)", () => {
    const r = checkSupplyConservation(1000, [{ sharesOwned: 700 }, { sharesOwned: 500 }]);
    expect(r.issued).toBe(1200);
    expect(r.overIssued).toBe(true);
    expect(r.balanced).toBe(false);
  });
});

describe("reconcileHoldingsAgainstLedger", () => {
  it("reconciles when each investor's ledger net equals their holding", () => {
    const r = reconcileHoldingsAgainstLedger(
      [
        { investorId: 1, shares: 100 },
        { investorId: 1, shares: -40 },
        { investorId: 2, shares: 40 },
      ],
      [
        { investorId: 1, sharesOwned: 60 },
        { investorId: 2, sharesOwned: 40 },
      ],
    );
    expect(r.balanced).toBe(true);
    expect(r.discrepancies).toHaveLength(0);
  });

  it("reports an investor whose ledger drifts from their holding", () => {
    const r = reconcileHoldingsAgainstLedger(
      [{ investorId: 1, shares: 100 }],
      [{ investorId: 1, sharesOwned: 90 }],
    );
    expect(r.balanced).toBe(false);
    expect(r.discrepancies[0]).toEqual({
      investorId: 1,
      ledgerNet: 100,
      holdingShares: 90,
      delta: 10,
    });
  });

  it("catches a holding with no backing ledger entries", () => {
    const r = reconcileHoldingsAgainstLedger([], [{ investorId: 5, sharesOwned: 30 }]);
    expect(r.balanced).toBe(false);
    expect(r.discrepancies[0]).toMatchObject({ investorId: 5, ledgerNet: 0, holdingShares: 30, delta: -30 });
  });
});

describe("resolveValuationPerShare", () => {
  it("prefers NAV when set", () => {
    expect(
      resolveValuationPerShare({ navPerShare: 12.5, lastTradePrice: 11, basePrice: 10 }),
    ).toEqual({ valuePerShare: 12.5, source: "NAV" });
  });

  it("falls back to last trade when NAV absent", () => {
    expect(
      resolveValuationPerShare({ navPerShare: null, lastTradePrice: 11, basePrice: 10 }),
    ).toEqual({ valuePerShare: 11, source: "LAST_TRADE" });
  });

  it("falls back to the issue price when nothing else is available", () => {
    expect(
      resolveValuationPerShare({ navPerShare: 0, lastTradePrice: 0, basePrice: 10 }),
    ).toEqual({ valuePerShare: 10, source: "ISSUE_PRICE" });
  });
});
