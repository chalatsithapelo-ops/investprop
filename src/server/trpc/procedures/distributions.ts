import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";
import { TRPCError } from "@trpc/server";
import { createNotification } from "./notifications";
import { ensureShareHoldingForContribution } from "./share-certificates";
import { getFeeConfig, recordPlatformFee } from "~/server/fees/platform-fees";

// ─── Create Distribution ──────────────────────────────────────

export const createDistribution = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      type: z.enum(["RENTAL_INCOME", "SALE_PROCEEDS", "DIVIDEND", "INTEREST", "CAPITAL_RETURN"]),
      taxClassification: z.enum(["DIVIDEND", "RENTAL_INCOME", "INTEREST", "CAPITAL_GAIN"]).optional(),
      grossAmount: z.number().min(0),
      managementFeePercent: z.number().min(0).max(100).default(2),
      period: z.string().optional(),
      description: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(
      user,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only managers can create distributions",
    );

    const managementFee = input.grossAmount * (input.managementFeePercent / 100);
    const netAmount = input.grossAmount - managementFee;

    // Get property with SPV details for audit trail
    const property = await db.property.findUnique({
      where: { id: input.propertyId },
      select: {
        id: true,
        title: true,
        platformCarryPct: true,
        spv: {
          select: {
            id: true,
            name: true,
            registrationNumber: true,
            bankName: true,
            bankAccountNumber: true,
            bankBranchCode: true,
          },
        },
      },
    });

    if (!property) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });
    }

    // Reconcile: materialise ShareHoldings for any PAID contributions that
    // don't yet have one (e.g. paid before holdings were auto-created), so
    // distributions reflect every investor who has actually funded.
    const paidContributions = await db.investorContribution.findMany({
      where: { propertyId: input.propertyId, paymentStatus: "PAID" },
      select: { id: true },
    });
    for (const c of paidContributions) {
      try {
        await ensureShareHoldingForContribution(c.id);
      } catch (err) {
        console.error("Failed to reconcile share holding:", err);
      }
    }

    // Get all share holdings for this property
    const holdings = await db.shareHolding.findMany({
      where: { propertyId: input.propertyId },
      include: {
        shareClass: { select: { totalShares: true } },
        investor: { select: { id: true, name: true } },
      },
    });

    if (holdings.length === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No shareholders exist for this property. Cannot create distribution.",
      });
    }

    // Calculate total shares across all classes for this property
    const totalSharesOutstanding = holdings.reduce((s, h) => s + h.sharesOwned, 0);

    // ── Platform carry (equity waterfall) ──────────────────────────────
    // The platform keeps `platformCarryPct` of the equity as free carry. Carry
    // participates in PROFIT distributions only — investors always get their
    // capital back first, so a CAPITAL_RETURN pays investors 100% and the
    // platform nothing. For profit types, we gross up a notional carry share
    // block so the platform receives exactly carryPct of the net and the rest
    // is split among investors pro-rata by their holdings.
    const carryPct = Math.min(99, Math.max(0, property.platformCarryPct ?? 0));
    const isReturnOfCapital = input.type === "CAPITAL_RETURN";
    const carryShares =
      !isReturnOfCapital && carryPct > 0 && totalSharesOutstanding > 0
        ? (totalSharesOutstanding * carryPct) / (100 - carryPct)
        : 0;
    const denomShares = totalSharesOutstanding + carryShares;
    const platformCarryAmount =
      denomShares > 0 ? netAmount * (carryShares / denomShares) : 0;
    const investorPool = netAmount - platformCarryAmount;

    const result = await db.$transaction(async (tx) => {
      // Resolve tax classification. Caller may override (e.g. SALE_PROCEEDS
      // typically reclassified as CAPITAL_GAIN). Otherwise derive from `type`.
      const derivedTax =
        input.taxClassification ??
        (input.type === "DIVIDEND"
          ? "DIVIDEND"
          : input.type === "RENTAL_INCOME"
          ? "RENTAL_INCOME"
          : input.type === "INTEREST"
          ? "INTEREST"
          : input.type === "SALE_PROCEEDS"
          ? "CAPITAL_GAIN"
          : "DIVIDEND");
      // SARS withholding rates
      const TAX_RATES: Record<string, number> = {
        DIVIDEND: 0.20,
        RENTAL_INCOME: 0,
        INTEREST: 0,
        CAPITAL_GAIN: 0,
      };
      const taxRate = TAX_RATES[derivedTax] ?? 0;

      // Create distribution record
      const distribution = await tx.distribution.create({
        data: {
          propertyId: input.propertyId,
          type: input.type,
          taxClassification: derivedTax as any,
          grossAmount: input.grossAmount,
          managementFee,
          netAmount,
          period: input.period,
          description: input.description,
          status: "CALCULATING",
        },
      });

      // Create payouts for each holder. Investors split the investor pool
      // (net minus platform carry) pro-rata by their holdings; percentageShare
      // reflects their slice of TOTAL equity including the platform's carry.
      const payouts = holdings.map((h) => {
        const percentageShare =
          denomShares > 0 ? (h.sharesOwned / denomShares) * 100 : 0;
        const grossPayout =
          totalSharesOutstanding > 0
            ? investorPool * (h.sharesOwned / totalSharesOutstanding)
            : 0;
        // SARS withholding based on tax classification (DIVIDEND → 20% per s64E Income Tax Act)
        const taxWithheld = grossPayout * taxRate;
        const netPayout = grossPayout - taxWithheld;

        return {
          distributionId: distribution.id,
          investorId: h.investorId,
          sharesAtTime: h.sharesOwned,
          percentageShare,
          grossAmount: grossPayout,
          taxWithheld,
          netAmount: netPayout,
          status: "PENDING" as const,
        };
      });

      await tx.distributionPayout.createMany({ data: payouts });

      // Book the platform's carry (its share of profit) into the revenue ledger.
      // Idempotent per distribution; joins this transaction for atomicity.
      if (platformCarryAmount > 0) {
        await recordPlatformFee({
          tx,
          feeType: "JV_PROMOTE",
          sourceType: "Distribution",
          sourceId: distribution.id,
          propertyId: input.propertyId,
          baseAmount: netAmount,
          feeBps: Math.round(carryPct * 100),
          feeAmount: platformCarryAmount,
          description: `Platform carry (${carryPct}%) on ${input.type.replace("_", " ").toLowerCase()} distribution`,
        });
      }

      // Mark as approved (ready for payment)
      await tx.distribution.update({
        where: { id: distribution.id },
        data: { status: "APPROVED" },
      });

      return {
        distributionId: distribution.id,
        totalInvestors: holdings.length,
        netAmount,
        managementFee,
        platformCarryPct: carryPct,
        platformCarryAmount,
        investorPool,
        spv: property.spv
          ? {
              name: property.spv.name,
              registrationNumber: property.spv.registrationNumber,
              bankName: property.spv.bankName,
              bankAccountNumber: property.spv.bankAccountNumber,
            }
          : null,
        payouts: payouts.map((p) => ({
          investorId: p.investorId,
          percentageShare: p.percentageShare,
          netAmount: p.netAmount,
        })),
      };
    });

    // Notify all shareholders about the new distribution (outside transaction)
    for (const h of holdings) {
      createNotification(
        h.investorId,
        "New Distribution Created",
        `A ${input.type.replace("_", " ").toLowerCase()} distribution of R${input.grossAmount.toLocaleString()} has been created for your property investment. Your estimated payout: R${((investorPool * (h.sharesOwned / (totalSharesOutstanding || 1)))).toFixed(2)}.`,
        "INFO",
        "INVESTMENT",
        input.propertyId
      ).catch(() => {});
    }

    return result;
  });

// ─── Get Distributions for a Property ─────────────────────────

export const getDistributions = baseProcedure
  .input(
    z.object({
      propertyId: z.number().optional(),
      authToken: z.string().optional(),
    })
  )
  .query(async ({ input }) => {
    const where: any = {};
    if (input.propertyId) where.propertyId = input.propertyId;

    return db.distribution.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            spv: {
              select: {
                id: true,
                name: true,
                registrationNumber: true,
                bankName: true,
                bankAccountNumber: true,
              },
            },
          },
        },
        payouts: {
          orderBy: { netAmount: "desc" },
        },
        _count: { select: { payouts: true } },
      },
    });
  });

// ─── Execute Distribution (mark as paid) ──────────────────────

export const executeDistribution = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      distributionId: z.number(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(
      user,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only managers can execute distributions",
    );

    const distribution = await db.distribution.findUnique({
      where: { id: input.distributionId },
      include: {
        payouts: true,
        property: {
          select: {
            spv: {
              select: {
                name: true,
                registrationNumber: true,
                bankName: true,
                bankAccountNumber: true,
              },
            },
          },
        },
      },
    });

    if (!distribution) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Distribution not found" });
    }
    if (distribution.status !== "APPROVED") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Distribution is in ${distribution.status} status, must be APPROVED`,
      });
    }

    const result = await db.$transaction(async (tx) => {
      const now = new Date();

      // Mark all payouts as paid
      await tx.distributionPayout.updateMany({
        where: { distributionId: input.distributionId },
        data: {
          status: "PAID",
          paidAt: now,
          paymentRef: distribution.property?.spv
            ? `SPV-${distribution.property.spv.registrationNumber ?? ""}-DIST-${input.distributionId}-${now.toISOString().slice(0, 10)}`
            : `DIST-${input.distributionId}-${now.toISOString().slice(0, 10)}`,
        },
      });

      // Mark distribution as distributed
      await tx.distribution.update({
        where: { id: input.distributionId },
        data: {
          status: "DISTRIBUTED",
          distributedAt: now,
        },
      });

      // ── Platform monetization: book the distribution/management fee ──
      // The managementFee was already withheld from gross when the
      // distribution was created, so this only records existing revenue in
      // the ledger — it does not change any payout amount. Idempotent per
      // distribution and joins this transaction for atomicity.
      try {
        const feeConfig = await getFeeConfig(tx);
        if (feeConfig.enabled && distribution.managementFee > 0) {
          await recordPlatformFee({
            tx,
            feeType: "DISTRIBUTION",
            sourceType: "Distribution",
            sourceId: distribution.id,
            propertyId: distribution.propertyId,
            baseAmount: distribution.grossAmount,
            feeBps: feeConfig.distributionFeeBps,
            feeAmount: distribution.managementFee,
            description: `Management fee on ${distribution.type} distribution`,
          });
        }
      } catch (err) {
        console.error("[platform-fees] distribution fee capture failed:", err);
      }

      return {
        success: true,
        totalPaid: distribution.payouts.reduce(
          (sum, p) => sum + p.netAmount,
          0,
        ),
        investorsPaid: distribution.payouts.length,
      };
    });

    // Notify all investors that their payout has been executed
    for (const payout of distribution.payouts) {
      createNotification(
        payout.investorId,
        "Distribution Paid Out",
        `Your distribution payout of R${payout.netAmount.toLocaleString()} has been processed. Payment ref: DIST-${input.distributionId}-${new Date().toISOString().slice(0, 10)}.`,
        "SUCCESS",
        "INVESTMENT",
        distribution.propertyId
      ).catch(() => {});
    }

    return result;
  });

// ─── Get Investor's Distribution History ──────────────────────

export const getMyDistributions = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    const payouts = await db.distributionPayout.findMany({
      where: { investorId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        distribution: {
          include: {
            property: { select: { id: true, title: true } },
          },
        },
      },
    });

    const totalReceived = payouts
      .filter((p) => p.status === "PAID")
      .reduce((sum, p) => sum + p.netAmount, 0);

    const totalPending = payouts
      .filter((p) => p.status === "PENDING")
      .reduce((sum, p) => sum + p.netAmount, 0);

    return { payouts, totalReceived, totalPending };
  });
