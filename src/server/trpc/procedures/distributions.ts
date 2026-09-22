import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { TRPCError } from "@trpc/server";
import { createNotification } from "./notifications";
import { ensureShareHoldingForContribution } from "./share-certificates";

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
    await getAuthenticatedUser(input.authToken);

    const managementFee = input.grossAmount * (input.managementFeePercent / 100);
    const netAmount = input.grossAmount - managementFee;

    // Get property with SPV details for audit trail
    const property = await db.property.findUnique({
      where: { id: input.propertyId },
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

      // Create payouts for each holder
      const payouts = holdings.map((h) => {
        const percentageShare = (h.sharesOwned / totalSharesOutstanding) * 100;
        const grossPayout = netAmount * (percentageShare / 100);
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
        `A ${input.type.replace("_", " ").toLowerCase()} distribution of R${input.grossAmount.toLocaleString()} has been created for your property investment. Your estimated payout: R${((netAmount * (h.sharesOwned / holdings.reduce((s, hh) => s + hh.sharesOwned, 0))) ).toFixed(2)}.`,
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
    await getAuthenticatedUser(input.authToken);

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

      return {
        success: true,
        totalPaid: distribution.netAmount,
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
