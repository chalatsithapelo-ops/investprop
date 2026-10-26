import { describe, it, expect } from "vitest";
import {
  randsToCents,
  centsToRands,
  computeSettlementCashLegs,
  availableBalanceCents,
} from "~/wallet-calculations";

describe("randsToCents / centsToRands", () => {
  it("converts Rands to integer cents (half-up)", () => {
    expect(randsToCents(10)).toBe(1000);
    expect(randsToCents(10.005)).toBe(1001); // 1000.5 → 1001
    expect(randsToCents(0.1)).toBe(10);
  });

  it("round-trips without drift for typical amounts", () => {
    for (const r of [0, 1, 25.25, 1234.56, 99999.99]) {
      expect(centsToRands(randsToCents(r))).toBeCloseTo(r, 2);
    }
  });

  it("is resilient to non-finite input", () => {
    expect(randsToCents(NaN)).toBe(0);
    expect(centsToRands(Infinity)).toBe(0);
  });
});

describe("computeSettlementCashLegs", () => {
  it("buyer pays value + STT, seller gets value − fee, platform keeps fee + STT", () => {
    // 1000 shares @ R10 = R10,000; STT 0.25% = R25; fee 1% = R100
    const legs = computeSettlementCashLegs({ totalAmount: 10_000, platformFee: 100, stt: 25 });
    expect(legs.buyerDebitCents).toBe(1_002_500); // R10,025
    expect(legs.sellerCreditCents).toBe(990_000); // R9,900
    expect(legs.platformRetainsCents).toBe(12_500); // R125
  });

  it("conserves cents exactly: buyerDebit === sellerCredit + platformRetains", () => {
    const cases = [
      { totalAmount: 10_000, platformFee: 100, stt: 25 },
      { totalAmount: 333.33, platformFee: 3.33, stt: 0.83 },
      { totalAmount: 1, platformFee: 0, stt: 0 },
      { totalAmount: 54_321.99, platformFee: 543.22, stt: 135.8 },
    ];
    for (const c of cases) {
      const legs = computeSettlementCashLegs(c);
      expect(legs.buyerDebitCents).toBe(legs.sellerCreditCents + legs.platformRetainsCents);
    }
  });

  it("treats negative fee/STT as zero", () => {
    const legs = computeSettlementCashLegs({ totalAmount: 100, platformFee: -5, stt: -1 });
    expect(legs.buyerDebitCents).toBe(10_000);
    expect(legs.sellerCreditCents).toBe(10_000);
    expect(legs.platformRetainsCents).toBe(0);
  });
});

describe("availableBalanceCents", () => {
  it("subtracts reserved funds and never goes negative", () => {
    expect(availableBalanceCents(10_000, 3_000)).toBe(7_000);
    expect(availableBalanceCents(1_000, 5_000)).toBe(0);
    expect(availableBalanceCents(5_000, 0)).toBe(5_000);
  });
});
