import { describe, it, expect } from "vitest";
import {
  planFills,
  aggregateOrderLevels,
  weightedAverageCost,
  computeStt,
  reservedShares,
  priceWithinCollar,
  exceedsConcentration,
  STT_BPS,
} from "~/share-trading";

describe("planFills — price crossing", () => {
  it("fills a BUY taker against the cheapest crossing SELL makers first", () => {
    const fills = planFills({
      takerSide: "BUY",
      takerPrice: 10,
      takerRemaining: 100,
      makers: [
        { id: 1, price: 9, remaining: 40 },
        { id: 2, price: 10, remaining: 40 },
        { id: 3, price: 11, remaining: 40 }, // above bid — must not fill
      ],
    });
    expect(fills).toEqual([
      { makerOrderId: 1, quantity: 40, price: 9 },
      { makerOrderId: 2, quantity: 40, price: 10 },
    ]);
  });

  it("fills a SELL taker against the highest crossing BUY makers first", () => {
    const fills = planFills({
      takerSide: "SELL",
      takerPrice: 10,
      takerRemaining: 100,
      takerDeliverable: 1000,
      makers: [
        { id: 7, price: 11, remaining: 30 },
        { id: 8, price: 10, remaining: 30 },
        { id: 9, price: 9, remaining: 30 }, // below ask — must not fill
      ],
    });
    expect(fills).toEqual([
      { makerOrderId: 7, quantity: 30, price: 11 },
      { makerOrderId: 8, quantity: 30, price: 10 },
    ]);
  });

  it("stops at the first non-crossing maker (makers are best-first)", () => {
    const fills = planFills({
      takerSide: "BUY",
      takerPrice: 5,
      takerRemaining: 50,
      makers: [
        { id: 1, price: 6, remaining: 50 }, // above bid — stop immediately
        { id: 2, price: 4, remaining: 50 },
      ],
    });
    expect(fills).toEqual([]);
  });
});

describe("planFills — quantity capping", () => {
  it("never fills more than the taker's remaining quantity", () => {
    const fills = planFills({
      takerSide: "BUY",
      takerPrice: 10,
      takerRemaining: 25,
      makers: [{ id: 1, price: 10, remaining: 1000 }],
    });
    expect(fills).toEqual([{ makerOrderId: 1, quantity: 25, price: 10 }]);
  });

  it("never fills more than a maker's remaining quantity", () => {
    const fills = planFills({
      takerSide: "BUY",
      takerPrice: 10,
      takerRemaining: 1000,
      makers: [
        { id: 1, price: 10, remaining: 15 },
        { id: 2, price: 10, remaining: 15 },
      ],
    });
    expect(fills).toEqual([
      { makerOrderId: 1, quantity: 15, price: 10 },
      { makerOrderId: 2, quantity: 15, price: 10 },
    ]);
  });
});

describe("planFills — deliverable guard (no share minting)", () => {
  it("caps a BUY fill by the maker-seller's deliverable balance", () => {
    // Maker offers 100 shares but only actually holds 10 — only 10 can settle.
    const fills = planFills({
      takerSide: "BUY",
      takerPrice: 10,
      takerRemaining: 100,
      makers: [{ id: 1, price: 10, remaining: 100, makerDeliverable: 10 }],
    });
    expect(fills).toEqual([{ makerOrderId: 1, quantity: 10, price: 10 }]);
  });

  it("skips a maker-seller that can deliver nothing", () => {
    const fills = planFills({
      takerSide: "BUY",
      takerPrice: 10,
      takerRemaining: 100,
      makers: [
        { id: 1, price: 10, remaining: 50, makerDeliverable: 0 }, // can't deliver
        { id: 2, price: 10, remaining: 50, makerDeliverable: 50 },
      ],
    });
    expect(fills).toEqual([{ makerOrderId: 2, quantity: 50, price: 10 }]);
  });

  it("caps total SELL fills by the taker-seller's deliverable balance", () => {
    // Taker tries to sell 100 but only holds 30 across the whole match.
    const fills = planFills({
      takerSide: "SELL",
      takerPrice: 10,
      takerRemaining: 100,
      takerDeliverable: 30,
      makers: [
        { id: 1, price: 10, remaining: 50 },
        { id: 2, price: 10, remaining: 50 },
      ],
    });
    expect(fills).toEqual([{ makerOrderId: 1, quantity: 30, price: 10 }]);
    expect(fills.reduce((s, f) => s + f.quantity, 0)).toBe(30);
  });

  it("decrements a shared seller's deliverable across multiple maker orders", () => {
    // One seller rests two SELL orders (60 total offered) but only holds 40.
    const fills = planFills({
      takerSide: "BUY",
      takerPrice: 10,
      takerRemaining: 100,
      makers: [
        { id: 1, price: 10, remaining: 30, makerDeliverable: 40 },
        { id: 2, price: 10, remaining: 30, makerDeliverable: 10 },
      ],
    });
    // id1 takes 30 (within 40 deliverable); id2 capped at its own 10 deliverable.
    expect(fills).toEqual([
      { makerOrderId: 1, quantity: 30, price: 10 },
      { makerOrderId: 2, quantity: 10, price: 10 },
    ]);
  });
});

describe("aggregateOrderLevels", () => {
  it("sums remaining quantity and counts orders per price level", () => {
    const levels = aggregateOrderLevels([
      { pricePerShare: 10, quantity: 50, filledQuantity: 10 }, // 40 remaining
      { pricePerShare: 10, quantity: 20, filledQuantity: 0 }, // 20 remaining
      { pricePerShare: 11, quantity: 30, filledQuantity: 0 }, // 30 remaining
      { pricePerShare: 12, quantity: 5, filledQuantity: 5 }, // fully filled — excluded
    ]);
    expect(levels).toContainEqual({ price: 10, quantity: 60, orders: 2 });
    expect(levels).toContainEqual({ price: 11, quantity: 30, orders: 1 });
    expect(levels.find((l) => l.price === 12)).toBeUndefined();
  });
});

describe("weightedAverageCost", () => {
  it("returns the trade price for a brand-new position", () => {
    expect(weightedAverageCost(0, 0, 100, 12.5)).toBe(12.5);
  });

  it("blends the cost basis on a top-up", () => {
    // 100 @ R10 then 100 @ R20 => R15 average.
    expect(weightedAverageCost(100, 10, 100, 20)).toBe(15);
  });

  it("returns 0 when the resulting position is empty", () => {
    expect(weightedAverageCost(0, 0, 0, 10)).toBe(0);
  });
});

describe("computeStt", () => {
  it("applies the default 0.25% STT rate (cents-rounded)", () => {
    // 1000 shares @ R10 = R10,000 -> 0.25% = R25.00
    expect(computeStt(10_000)).toBe(25);
    expect(STT_BPS).toBe(25);
  });

  it("returns 0 for non-positive values", () => {
    expect(computeStt(0)).toBe(0);
    expect(computeStt(-100)).toBe(0);
  });

  it("rounds to two decimals", () => {
    expect(computeStt(333.33, 25)).toBeCloseTo(0.83, 2);
  });
});

describe("reservedShares", () => {
  it("sums remaining open sell-order quantity and pending settlement quantity", () => {
    const reserved = reservedShares(
      [
        { quantity: 100, filledQuantity: 40 }, // 60 remaining
        { quantity: 50, filledQuantity: 0 }, // 50 remaining
      ],
      [{ quantity: 30 }, { quantity: 20 }] // 50 locked in settlements
    );
    expect(reserved).toBe(160);
  });

  it("is 0 with nothing reserved", () => {
    expect(reservedShares([], [])).toBe(0);
  });
});

describe("priceWithinCollar", () => {
  it("accepts prices within the symmetric band", () => {
    expect(priceWithinCollar(110, 100, 20)).toBe(true); // +10%
    expect(priceWithinCollar(85, 100, 20)).toBe(true); // -15%
  });

  it("rejects prices outside the band", () => {
    expect(priceWithinCollar(130, 100, 20)).toBe(false); // +30%
    expect(priceWithinCollar(70, 100, 20)).toBe(false); // -30%
  });

  it("disables the check when the anchor is missing or non-positive", () => {
    expect(priceWithinCollar(9999, null, 20)).toBe(true);
    expect(priceWithinCollar(9999, 0, 20)).toBe(true);
    expect(priceWithinCollar(9999, 100, 0)).toBe(true);
  });
});

describe("exceedsConcentration", () => {
  it("flags positions that would breach the cap", () => {
    // 4000 held + 1000 add = 5000 of 10000 = 50% > 40% cap
    expect(exceedsConcentration(4000, 1000, 10_000, 40)).toBe(true);
  });

  it("allows a position exactly at the cap", () => {
    expect(exceedsConcentration(3000, 1000, 10_000, 40)).toBe(false); // 40%
  });

  it("disables the check when no cap is set", () => {
    expect(exceedsConcentration(9000, 1000, 10_000, null)).toBe(false);
    expect(exceedsConcentration(9000, 1000, 10_000, 0)).toBe(false);
  });
});
