/**
 * Pure, dependency-free money helpers for the in-app wallet.
 *
 * All wallet balances and transaction amounts are held as integer CENTS (ZAR)
 * to eliminate floating-point drift. Trade amounts elsewhere in the system are
 * Rand floats, so these helpers convert at the wallet boundary.
 *
 * Cash-leg model for a settled secondary trade (Delivery-versus-Payment):
 *   buyer pays   = tradeValue + buyerFee + STT   (debited from buyer wallet)
 *   seller gets  = tradeValue − sellerFee         (credited to seller wallet)
 *   platform keeps = sellerFee + buyerFee + STT
 * These satisfy conservation: buyerDebit === sellerCredit + platformRetains.
 */

/** Convert a Rand amount to integer cents (half-up rounding). */
export function randsToCents(rands: number): number {
  if (!Number.isFinite(rands)) return 0;
  return Math.round(rands * 100);
}

/** Convert integer cents back to a Rand amount (2 decimals). */
export function centsToRands(cents: number): number {
  if (!Number.isFinite(cents)) return 0;
  return Math.round(cents) / 100;
}

export interface SettlementCashLegs {
  /** Cents debited from the buyer (trade value + buyer fee + STT). */
  buyerDebitCents: number;
  /** Cents credited to the seller (trade value − seller fee). */
  sellerCreditCents: number;
  /** Cents retained by the platform (seller fee + buyer fee + STT). */
  platformRetainsCents: number;
}

/**
 * Compute the three cash legs of a settled trade from its Rand amounts.
 * Guarantees integer-cents conservation: buyerDebit === sellerCredit + platformRetains.
 */
export function computeSettlementCashLegs(args: {
  totalAmount: number; // trade value in Rands (quantity × price)
  platformFee: number; // secondary-trade fee charged to the SELLER, in Rands
  stt: number; // securities transfer tax in Rands
  buyerFee?: number; // secondary-trade fee charged to the BUYER, in Rands
}): SettlementCashLegs {
  const valueCents = randsToCents(args.totalAmount);
  const feeCents = Math.max(0, randsToCents(args.platformFee));
  const buyerFeeCents = Math.max(0, randsToCents(args.buyerFee ?? 0));
  const sttCents = Math.max(0, randsToCents(args.stt));

  const buyerDebitCents = valueCents + buyerFeeCents + sttCents;
  const sellerCreditCents = valueCents - feeCents;
  const platformRetainsCents = feeCents + buyerFeeCents + sttCents;

  return { buyerDebitCents, sellerCreditCents, platformRetainsCents };
}

/**
 * Compute the fee (in cents) the platform keeps on a wallet withdrawal to a
 * bank account: a flat component plus a percentage of the gross amount. The
 * fee is clamped so it can never exceed the gross (the bank would receive 0).
 */
export function computeWithdrawalFeeCents(
  grossCents: number,
  cfg: { withdrawalFeeBps: number; withdrawalFlatFee: number },
): number {
  if (!Number.isFinite(grossCents) || grossCents <= 0) return 0;
  const flatCents = Math.max(0, randsToCents(cfg.withdrawalFlatFee ?? 0));
  const bps = Math.max(0, cfg.withdrawalFeeBps ?? 0);
  const pctCents = Math.round((grossCents * bps) / 10_000);
  return Math.min(grossCents, flatCents + pctCents);
}

/**
 * The spendable balance of a wallet: the live balance minus amounts already
 * reserved by in-flight withdrawal requests (which hold funds until the manager
 * approves or rejects them).
 */
export function availableBalanceCents(
  balanceCents: number,
  reservedCents: number,
): number {
  return Math.max(0, balanceCents - Math.max(0, reservedCents));
}
