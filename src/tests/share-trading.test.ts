import { describe, it, expect } from "vitest";
import {
  planFills,
  aggregateOrderLevels,
  weightedAverageCost,
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
