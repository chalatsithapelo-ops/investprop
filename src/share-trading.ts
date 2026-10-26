/**
 * Pure secondary-market matching logic for fractional property shares.
 *
 * This module is intentionally free of Prisma / DB access so the order-matching
 * rules can be unit-tested in isolation. The DB-bound settlement (holdings,
 * ledger, price history, fees) lives in
 * src/server/trpc/procedures/share-marketplace.ts and consumes {@link planFills}.
 *
 * Matching rules:
 *  - Price crossing: a BUY taker fills against SELL makers priced <= its bid; a
 *    SELL taker fills against BUY makers priced >= its ask.
 *  - Price-time priority: makers must be supplied best-price-first, then oldest
 *    first (FIFO). The taker always transacts at the maker's resting price.
 *  - Deliverable caps: a seller can only ever trade shares it actually holds.
 *    For a BUY taker the seller is each maker; for a SELL taker the seller is the
 *    taker itself. Fills are capped by the relevant live share balance so the
 *    engine can never create shares out of nothing.
 */

export interface MakerOrderInput {
  /** The resting order's id. */
  id: number;
  /** The resting order's price per share. */
  price: number;
  /** Shares still open on the resting order (quantity - filledQuantity). */
  remaining: number;
  /**
   * When the maker is the seller (i.e. the taker is buying), the shares the
   * maker's owner can actually deliver. Omit (or Infinity) when the maker is the
   * buyer (i.e. the taker is selling).
   */
  makerDeliverable?: number;
}

export interface PlanFillsInput {
  takerSide: "BUY" | "SELL";
  takerPrice: number;
  /** Shares still open on the taker order. */
  takerRemaining: number;
  /**
   * When the taker is the seller (i.e. selling), the shares the taker can
   * actually deliver. Omit (or Infinity) when the taker is buying.
   */
  takerDeliverable?: number;
  /** Candidate resting orders, pre-sorted best-price-first then FIFO. */
  makers: MakerOrderInput[];
}

export interface PlannedFill {
  makerOrderId: number;
  quantity: number;
  /** Execution price — always the maker's resting price. */
  price: number;
}

/**
 * Computes the sequence of fills for an incoming (taker) order against the
 * supplied resting (maker) orders. Pure: no side effects, no DB.
 */
export function planFills(input: PlanFillsInput): PlannedFill[] {
  const { takerSide, takerPrice, makers } = input;

  let takerRemaining = Math.max(0, Math.floor(input.takerRemaining));
  let takerDeliverable = input.takerDeliverable == null
    ? Number.POSITIVE_INFINITY
    : Math.max(0, Math.floor(input.takerDeliverable));

  const fills: PlannedFill[] = [];

  for (const maker of makers) {
    if (takerRemaining <= 0 || takerDeliverable <= 0) break;

    // Price crossing. Makers are best-first, so the first non-crossing maker
    // means every subsequent maker is also non-crossing — stop scanning.
    const crosses =
      takerSide === "BUY" ? maker.price <= takerPrice : maker.price >= takerPrice;
    if (!crosses) break;

    const makerRemaining = Math.max(0, Math.floor(maker.remaining));
    const makerDeliverable = maker.makerDeliverable == null
      ? Number.POSITIVE_INFINITY
      : Math.max(0, Math.floor(maker.makerDeliverable));

    const qty = Math.min(takerRemaining, makerRemaining, takerDeliverable, makerDeliverable);
    if (qty <= 0) continue; // maker has nothing to give (e.g. seller can't deliver)

    fills.push({ makerOrderId: maker.id, quantity: qty, price: maker.price });
    takerRemaining -= qty;
    takerDeliverable -= qty;
  }

  return fills;
}

export interface OrderLevel {
  price: number;
  quantity: number;
  orders: number;
}

/**
 * Aggregates resting orders into price levels for an order-book view. Each level
 * sums the *remaining* (unfilled) quantity and counts the contributing orders.
 */
export function aggregateOrderLevels(
  orders: { pricePerShare: number; quantity: number; filledQuantity: number }[]
): OrderLevel[] {
  const levels = new Map<number, OrderLevel>();
  for (const o of orders) {
    const remaining = o.quantity - o.filledQuantity;
    if (remaining <= 0) continue;
    const level = levels.get(o.pricePerShare) ?? {
      price: o.pricePerShare,
      quantity: 0,
      orders: 0,
    };
    level.quantity += remaining;
    level.orders += 1;
    levels.set(o.pricePerShare, level);
  }
  return [...levels.values()];
}

/**
 * Weighted-average cost after acquiring `addQty` shares at `addPrice`, given an
 * existing position of `heldQty` at `heldAvg`. Returns `addPrice` for a new
 * position. Mirrors the holding-upsert maths used on purchase/trade settlement.
 */
export function weightedAverageCost(
  heldQty: number,
  heldAvg: number,
  addQty: number,
  addPrice: number
): number {
  const newQty = heldQty + addQty;
  if (newQty <= 0) return 0;
  if (heldQty <= 0) return addPrice;
  return (heldAvg * heldQty + addQty * addPrice) / newQty;
}
