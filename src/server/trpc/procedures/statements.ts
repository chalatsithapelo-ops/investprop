import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { TRPCError } from "@trpc/server";

/**
 * Investprop — Periodic Investor Statement
 *
 * Aggregates, for a requested period:
 *  - current share holdings (positions snapshot at generation time)
 *  - distribution income received during the period
 *  - share transactions (ledger) that occurred during the period
 *
 * This is an informational statement for the investor's records. It is not a
 * tax certificate and not a financial statement audited under the Companies Act.
 */
export const generateInvestorStatement = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      investorId: z.number().optional(), // admin / manager may request for an investor
      periodStart: z.string(), // ISO date
      periodEnd: z.string(), // ISO date
      periodLabel: z.string().optional(), // e.g. "Q1 2026", "FY2026"
    }),
  )
  .query(async ({ input }) => {
    const caller = await getAuthenticatedUser(input.authToken);
    const targetId = input.investorId ?? caller.id;
    if (
      targetId !== caller.id &&
      caller.role !== "ADMIN" &&
      caller.role !== "DEVELOPMENT_MANAGER"
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Cannot view another investor's statement",
      });
    }

    const start = new Date(input.periodStart);
    const end = new Date(input.periodEnd);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid statement period" });
    }

    const investor = await db.user.findUnique({
      where: { id: targetId },
      select: { id: true, name: true, email: true, investorCode: true },
    });
    if (!investor) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Investor not found" });
    }

    // ── Current holdings snapshot ──
    const holdingRows = await db.shareHolding.findMany({
      where: { investorId: targetId, sharesOwned: { gt: 0 } },
      include: {
        shareClass: { select: { name: true, pricePerShare: true, totalShares: true } },
        property: { select: { id: true, title: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    const holdings = holdingRows.map((h) => {
      const currentValue = h.sharesOwned * h.shareClass.pricePerShare;
      const investedAmount = h.sharesOwned * h.averageCostPerShare;
      return {
        propertyTitle: h.property.title,
        shareClassName: h.shareClass.name,
        sharesOwned: h.sharesOwned,
        pricePerShare: h.shareClass.pricePerShare,
        averageCostPerShare: h.averageCostPerShare,
        ownershipPercentage:
          h.shareClass.totalShares > 0
            ? (h.sharesOwned / h.shareClass.totalShares) * 100
            : 0,
        currentValue,
        investedAmount,
        unrealizedGain: currentValue - investedAmount,
      };
    });

    const totalInvested = holdings.reduce((s, h) => s + h.investedAmount, 0);
    const totalCurrentValue = holdings.reduce((s, h) => s + h.currentValue, 0);
    const totalUnrealizedGain = totalCurrentValue - totalInvested;

    // ── Distributions received during the period (PAID only) ──
    const payouts = await db.distributionPayout.findMany({
      where: {
        investorId: targetId,
        status: "PAID",
        paidAt: { gte: start, lte: end },
      },
      include: {
        distribution: {
          select: {
            type: true,
            taxClassification: true,
            period: true,
            property: { select: { title: true } },
          },
        },
      },
      orderBy: { paidAt: "asc" },
    });

    const distributions = payouts.map((p) => ({
      date: (p.paidAt ?? p.createdAt).toISOString(),
      propertyTitle: p.distribution.property.title,
      type: p.distribution.type,
      taxClassification: p.distribution.taxClassification,
      grossAmount: p.grossAmount,
      taxWithheld: p.taxWithheld,
      netAmount: p.netAmount,
    }));

    const totalDistributionsGross = distributions.reduce((s, d) => s + d.grossAmount, 0);
    const totalDistributionsTax = distributions.reduce((s, d) => s + d.taxWithheld, 0);
    const totalDistributionsNet = distributions.reduce((s, d) => s + d.netAmount, 0);

    // ── Share transactions during the period ──
    const ledger = await db.shareLedgerEntry.findMany({
      where: {
        investorId: targetId,
        createdAt: { gte: start, lte: end },
      },
      include: { property: { select: { title: true } } },
      orderBy: { createdAt: "asc" },
    });

    const transactions = ledger.map((l) => ({
      date: l.createdAt.toISOString(),
      propertyTitle: l.property.title,
      transactionType: l.transactionType,
      shares: l.shares,
      pricePerShare: l.pricePerShare,
      totalAmount: l.totalAmount,
      reference: l.reference ?? "",
      balanceAfter: l.balanceAfter,
    }));

    return {
      statementType: "Investor Statement",
      periodLabel: input.periodLabel ?? "",
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      generatedAt: new Date().toISOString(),
      investor,
      holdings,
      totalInvested,
      totalCurrentValue,
      totalUnrealizedGain,
      distributions,
      totalDistributionsGross,
      totalDistributionsTax,
      totalDistributionsNet,
      transactions,
      disclaimer:
        "This statement is provided for your records. It is not a tax certificate and not an audited financial statement. " +
        "Current values reflect the latest reference price per share and may differ from realisable market value. " +
        "Investprop is not a registered tax practitioner or financial adviser.",
    };
  });
