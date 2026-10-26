import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";
import {
  checkSupplyConservation,
  reconcileHoldingsAgainstLedger,
  resolveValuationPerShare,
} from "~/share-conservation";

// ═══════════════════════════════════════════════════════════════
//  Share integrity & provenance
//  - auditShareConservation: proves no duplicate/phantom shares exist and that
//    every share ledger reconciles to its holding, per share class.
//  - getShareProvenance: traces an investor's holdings back to the property/SPV,
//    shows how the shares were acquired, and their current valuation.
// ═══════════════════════════════════════════════════════════════

const AUDIT_ROLES = ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"] as const;

// ─── Conservation audit (manager/admin) ────────────────────────

export const auditShareConservation = baseProcedure
  .input(z.object({ authToken: z.string(), shareClassId: z.number().optional() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, [...AUDIT_ROLES], "Only managers can run the share conservation audit");

    const shareClasses = await db.shareClass.findMany({
      where: input.shareClassId ? { id: input.shareClassId } : {},
      include: {
        property: {
          select: {
            id: true,
            title: true,
            spv: { select: { id: true, name: true, registrationNumber: true } },
          },
        },
      },
    });

    const classes = [];
    for (const sc of shareClasses) {
      const holdings = await db.shareHolding.findMany({
        where: { shareClassId: sc.id },
        select: { investorId: true, sharesOwned: true },
      });
      const ledger = await db.shareLedgerEntry.findMany({
        where: { shareClassId: sc.id },
        select: { investorId: true, shares: true },
      });
      const openSettlements = await db.shareTradeSettlement.aggregate({
        where: { shareClassId: sc.id, status: { in: ["PENDING_PAYMENT", "POP_SUBMITTED"] } },
        _sum: { quantity: true },
      });
      const lastTrade = await db.shareTrade.findFirst({
        where: { shareClassId: sc.id },
        orderBy: { executedAt: "desc" },
        select: { pricePerShare: true },
      });

      const supply = checkSupplyConservation(sc.totalShares, holdings);
      const recon = reconcileHoldingsAgainstLedger(ledger, holdings);
      const valuation = resolveValuationPerShare({
        navPerShare: sc.navPerShare,
        lastTradePrice: lastTrade?.pricePerShare ?? null,
        basePrice: sc.pricePerShare,
      });

      classes.push({
        shareClassId: sc.id,
        shareClassName: sc.name,
        property: { id: sc.property.id, title: sc.property.title },
        spv: sc.property.spv,
        totalShares: supply.totalShares,
        issued: supply.issued,
        available: supply.available,
        reservedInSettlements: openSettlements._sum.quantity ?? 0,
        holders: holdings.filter((h) => h.sharesOwned > 0).length,
        valuationPerShare: valuation.valuePerShare,
        valuationSource: valuation.source,
        marketCap: supply.issued * valuation.valuePerShare,
        overIssued: supply.overIssued,
        ledgerBalanced: recon.balanced,
        ledgerDiscrepancies: recon.discrepancies,
        balanced: supply.balanced && recon.balanced,
      });
    }

    return {
      generatedAt: new Date().toISOString(),
      overallBalanced: classes.every((c) => c.balanced),
      classCount: classes.length,
      classes,
    };
  });

// ─── Share provenance for an investor ──────────────────────────

export const getShareProvenance = baseProcedure
  .input(z.object({ authToken: z.string(), investorId: z.number().optional() }))
  .query(async ({ input }) => {
    const caller = await getAuthenticatedUser(input.authToken);
    const targetId = input.investorId ?? caller.id;
    if (
      targetId !== caller.id &&
      !([...AUDIT_ROLES] as string[]).includes(caller.role)
    ) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Cannot view another investor's provenance" });
    }

    const holdings = await db.shareHolding.findMany({
      where: { investorId: targetId, sharesOwned: { gt: 0 } },
      include: {
        shareClass: {
          include: {
            property: {
              select: {
                id: true,
                title: true,
                address: true,
                city: true,
                spv: { select: { id: true, name: true, registrationNumber: true, status: true } },
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const results = [];
    for (const h of holdings) {
      const sc = h.shareClass;
      const lastTrade = await db.shareTrade.findFirst({
        where: { shareClassId: sc.id },
        orderBy: { executedAt: "desc" },
        select: { pricePerShare: true },
      });
      const valuation = resolveValuationPerShare({
        navPerShare: sc.navPerShare,
        lastTradePrice: lastTrade?.pricePerShare ?? null,
        basePrice: sc.pricePerShare,
      });

      // How the shares were acquired: group this investor's ledger by type.
      const ledger = await db.shareLedgerEntry.findMany({
        where: { shareClassId: sc.id, investorId: targetId },
        select: { transactionType: true, shares: true, reference: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      });
      const acquiredBySource: Record<string, number> = {};
      for (const e of ledger) {
        acquiredBySource[e.transactionType] =
          (acquiredBySource[e.transactionType] ?? 0) + e.shares;
      }

      const currentValue = h.sharesOwned * valuation.valuePerShare;
      const investedAmount = h.sharesOwned * h.averageCostPerShare;
      results.push({
        holdingId: h.id,
        property: { id: sc.property.id, title: sc.property.title, address: sc.property.address, city: sc.property.city },
        spv: sc.property.spv,
        shareClass: { id: sc.id, name: sc.name },
        sharesOwned: h.sharesOwned,
        totalShares: sc.totalShares,
        ownershipPercentage: sc.totalShares > 0 ? (h.sharesOwned / sc.totalShares) * 100 : 0,
        averageCostPerShare: h.averageCostPerShare,
        valuationPerShare: valuation.valuePerShare,
        valuationSource: valuation.source,
        investedAmount,
        currentValue,
        unrealizedGain: currentValue - investedAmount,
        acquiredBySource,
        ledgerEntryCount: ledger.length,
      });
    }

    return {
      investorId: targetId,
      generatedAt: new Date().toISOString(),
      holdingCount: results.length,
      totalInvested: results.reduce((s, r) => s + r.investedAmount, 0),
      totalCurrentValue: results.reduce((s, r) => s + r.currentValue, 0),
      holdings: results,
    };
  });
