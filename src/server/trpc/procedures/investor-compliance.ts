import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { createAuditLog } from "./audit-log";

/**
 * Investor cancels their own contribution during the 5-day cooling-off period.
 * Sets status=CANCELLED, records timestamp + reason, writes an audit log entry.
 */
export const cancelContributionDuringCoolingOff = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      contributionId: z.number(),
      reason: z.string().min(3).max(500).optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const c = await db.investorContribution.findUnique({
      where: { id: input.contributionId },
      select: {
        id: true,
        investorId: true,
        status: true,
        coolingOffExpiresAt: true,
        cancelledAt: true,
        deletedAt: true,
        contributionAmount: true,
        propertyId: true,
      },
    });
    if (!c || c.deletedAt) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Contribution not found" });
    }
    if (c.investorId !== user.id && user.role !== "ADMIN") {
      throw new TRPCError({ code: "FORBIDDEN", message: "You can only cancel your own contributions" });
    }
    if (c.cancelledAt || c.status === "CANCELLED" || c.status === "REJECTED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Contribution is already cancelled" });
    }
    if (c.status === "APPROVED" || c.status === "PAID") {
      // Already processed past cooling-off
      if (!c.coolingOffExpiresAt || c.coolingOffExpiresAt < new Date()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The 5-day cooling-off window has expired. Please contact support.",
        });
      }
    }
    if (c.coolingOffExpiresAt && c.coolingOffExpiresAt < new Date()) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "The 5-day cooling-off window has expired. Please contact support.",
      });
    }

    await db.investorContribution.update({
      where: { id: input.contributionId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledReason: input.reason ?? "Investor cancelled within cooling-off window",
      },
    });
    await createAuditLog(user.id, "CANCEL_CONTRIBUTION", "InvestorContribution", c.id, {
      reason: input.reason,
      amount: c.contributionAmount,
      propertyId: c.propertyId,
    });
    return { success: true, message: "Contribution cancelled" };
  });

/**
 * Sanctions / PEP screening hook. Stub returns PASS. Wire to a vendor
 * (Refinitiv World-Check, ComplyAdvantage, Sanctions.io) for production.
 * Always returns a structured result so the calling code is vendor-agnostic.
 */
export const screenSanctions = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      userId: z.number().optional(),
      fullName: z.string().min(2),
      idNumber: z.string().optional(),
      dateOfBirth: z.string().optional(),
      country: z.string().default("ZA"),
    })
  )
  .mutation(async ({ input }) => {
    const caller = await getAuthenticatedUser(input.authToken);
    if (caller.role !== "ADMIN" && caller.role !== "DEVELOPMENT_MANAGER") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Compliance staff only" });
    }
    // TODO: integrate vendor API. For now we always pass.
    const result = {
      status: "PASS" as const,
      provider: "stub",
      checkedAt: new Date().toISOString(),
      query: { fullName: input.fullName, country: input.country },
      hits: [] as Array<{ list: string; matchScore: number; details: string }>,
      reviewedBy: caller.id,
    };
    await createAuditLog(
      caller.id,
      "SCREEN_SANCTIONS",
      "User",
      input.userId ?? caller.id,
      { result: result.status, provider: result.provider }
    );
    return result;
  });

/**
 * Generate an IT3(b)/IT3(c) tax-summary payload for an investor for a given tax year.
 * Aggregates distribution payouts and groups by tax classification.
 * Returns JSON — PDF rendering is a separate concern.
 */
export const generateTaxCertificate = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      investorId: z.number().optional(), // admin can request for any investor
      taxYear: z.number().int().min(2020).max(2099), // SA tax year ending Feb
    })
  )
  .query(async ({ input }) => {
    const caller = await getAuthenticatedUser(input.authToken);
    const targetId = input.investorId ?? caller.id;
    if (targetId !== caller.id && caller.role !== "ADMIN" && caller.role !== "DEVELOPMENT_MANAGER") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Cannot view another investor's tax certificate" });
    }

    // SA tax year: 1 Mar (year-1) → 28/29 Feb (year)
    const yearStart = new Date(Date.UTC(input.taxYear - 1, 2, 1)); // March 1
    const yearEnd = new Date(Date.UTC(input.taxYear, 1, 28, 23, 59, 59)); // Feb 28

    const payouts = await db.distributionPayout.findMany({
      where: {
        investorId: targetId,
        status: "PAID",
        paidAt: { gte: yearStart, lte: yearEnd },
      },
      include: {
        distribution: {
          select: {
            id: true,
            taxClassification: true,
            type: true,
            period: true,
            property: { select: { id: true, title: true } },
          },
        },
      },
      orderBy: { paidAt: "asc" },
    });

    // Group by classification
    const buckets: Record<string, { count: number; gross: number; taxWithheld: number; net: number }> = {};
    for (const p of payouts) {
      const cls = (p.distribution as any).taxClassification ?? "DIVIDEND";
      if (!buckets[cls]) buckets[cls] = { count: 0, gross: 0, taxWithheld: 0, net: 0 };
      buckets[cls].count += 1;
      buckets[cls].gross += p.grossAmount;
      buckets[cls].taxWithheld += p.taxWithheld;
      buckets[cls].net += p.netAmount;
    }

    const investor = await db.user.findUnique({
      where: { id: targetId },
      select: { id: true, name: true, email: true, investorCode: true },
    });

    return {
      certificateType: "IT3 Summary",
      taxYear: input.taxYear,
      periodStart: yearStart.toISOString(),
      periodEnd: yearEnd.toISOString(),
      investor,
      generatedAt: new Date().toISOString(),
      summary: buckets,
      totalGross: payouts.reduce((s, p) => s + p.grossAmount, 0),
      totalTaxWithheld: payouts.reduce((s, p) => s + p.taxWithheld, 0),
      totalNet: payouts.reduce((s, p) => s + p.netAmount, 0),
      payoutCount: payouts.length,
      disclaimer:
        "This document is a summary for your records. Investprop is not a registered tax practitioner. " +
        "Please consult a registered tax practitioner before filing. Final tax liability is determined by SARS.",
    };
  });

/**
 * Generate a receipt summary for a single investor contribution.
 * Returns JSON; PDF rendering deferred.
 */
export const generateInvestmentReceipt = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      contributionId: z.number(),
    })
  )
  .query(async ({ input }) => {
    const caller = await getAuthenticatedUser(input.authToken);
    const c = await db.investorContribution.findUnique({
      where: { id: input.contributionId },
      include: {
        property: { select: { id: true, title: true, address: true, spv: { select: { name: true, registrationNumber: true } } } },
        investor: { select: { id: true, name: true, email: true, investorCode: true } },
      },
    });
    if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Contribution not found" });
    if (c.investorId !== caller.id && caller.role !== "ADMIN" && caller.role !== "DEVELOPMENT_MANAGER") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Cannot view another investor's receipt" });
    }
    return {
      receiptNumber: `R-${String(c.id).padStart(8, "0")}`,
      issuedAt: new Date().toISOString(),
      investor: c.investor,
      property: c.property,
      amount: c.contributionAmount,
      shares: c.numberOfShares,
      sharePrice: c.sharePrice,
      ownershipPercentage: c.ownershipPercentage,
      contributionDate: c.contributionDate,
      paymentMethod: c.paymentMethod,
      paymentReference: c.paymentReference,
      paymentStatus: c.paymentStatus,
      status: c.status,
      coolingOffExpiresAt: c.coolingOffExpiresAt,
      notes: c.notes,
      disclaimer:
        "This receipt confirms the recording of your investment commitment. " +
        "It is not a share certificate. A share certificate will be issued once payment is confirmed.",
    };
  });
