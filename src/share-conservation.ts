/**
 * Pure share-conservation + valuation helpers.
 *
 * These prove the integrity invariants the fractional-ownership ledger must
 * always satisfy, independent of the database, so they can be unit-tested and
 * reused by the audit procedure:
 *
 *  1. Supply conservation — the sum of all holdings in a share class may never
 *     exceed the class's issued totalShares (no duplicate / phantom shares).
 *  2. Ledger reconciliation — each investor's running share ledger must net to
 *     exactly the shares recorded on their holding (no silent drift).
 *  3. Valuation — a single deterministic price-per-share anchor derived from
 *     NAV, else the last traded price, else the issue price.
 */

export interface SupplyConservation {
  totalShares: number;
  issued: number; // sum of all holdings
  available: number; // totalShares − issued
  overIssued: boolean; // issued > totalShares (INVALID — duplicate shares)
  balanced: boolean; // issued ≤ totalShares
}

/** Check that holdings never exceed the issued supply of a share class. */
export function checkSupplyConservation(
  totalShares: number,
  holdings: ReadonlyArray<{ sharesOwned: number }>,
): SupplyConservation {
  const issued = holdings.reduce((s, h) => s + (h.sharesOwned || 0), 0);
  return {
    totalShares,
    issued,
    available: totalShares - issued,
    overIssued: issued > totalShares,
    balanced: issued <= totalShares,
  };
}

export interface LedgerDiscrepancy {
  investorId: number;
  ledgerNet: number; // sum of signed ledger shares
  holdingShares: number; // shares recorded on the holding
  delta: number; // ledgerNet − holdingShares (0 = reconciled)
}

export interface LedgerReconciliation {
  balanced: boolean;
  discrepancies: LedgerDiscrepancy[];
}

/**
 * Reconcile each investor's signed ledger entries against their holding.
 * Any investor whose ledger net differs from their holding is reported.
 */
export function reconcileHoldingsAgainstLedger(
  ledgerEntries: ReadonlyArray<{ investorId: number; shares: number }>,
  holdings: ReadonlyArray<{ investorId: number; sharesOwned: number }>,
): LedgerReconciliation {
  const ledgerByInvestor = new Map<number, number>();
  for (const e of ledgerEntries) {
    ledgerByInvestor.set(
      e.investorId,
      (ledgerByInvestor.get(e.investorId) ?? 0) + (e.shares || 0),
    );
  }
  const holdingByInvestor = new Map<number, number>();
  for (const h of holdings) {
    holdingByInvestor.set(
      h.investorId,
      (holdingByInvestor.get(h.investorId) ?? 0) + (h.sharesOwned || 0),
    );
  }

  const investorIds = new Set<number>([
    ...ledgerByInvestor.keys(),
    ...holdingByInvestor.keys(),
  ]);

  const discrepancies: LedgerDiscrepancy[] = [];
  for (const id of investorIds) {
    const ledgerNet = ledgerByInvestor.get(id) ?? 0;
    const holdingShares = holdingByInvestor.get(id) ?? 0;
    const delta = ledgerNet - holdingShares;
    if (delta !== 0) {
      discrepancies.push({ investorId: id, ledgerNet, holdingShares, delta });
    }
  }
  discrepancies.sort((a, b) => a.investorId - b.investorId);
  return { balanced: discrepancies.length === 0, discrepancies };
}

/**
 * Deterministic valuation anchor for a share class:
 *   NAV per share (if set & > 0) → last traded price (if > 0) → issue price.
 */
export function resolveValuationPerShare(args: {
  navPerShare?: number | null;
  lastTradePrice?: number | null;
  basePrice: number;
}): { valuePerShare: number; source: "NAV" | "LAST_TRADE" | "ISSUE_PRICE" } {
  if (args.navPerShare != null && args.navPerShare > 0) {
    return { valuePerShare: args.navPerShare, source: "NAV" };
  }
  if (args.lastTradePrice != null && args.lastTradePrice > 0) {
    return { valuePerShare: args.lastTradePrice, source: "LAST_TRADE" };
  }
  return { valuePerShare: args.basePrice, source: "ISSUE_PRICE" };
}
