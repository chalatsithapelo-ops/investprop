import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { createAuditLog } from "~/server/trpc/procedures/audit-log";
import { recordPlatformFee, getFeeConfig } from "~/server/fees/platform-fees";

// ═══════════════════════════════════════════════════════════════
//  Home-loan application (Phase 2).
//  "Apply to all major banks with one button" — in South Africa this is
//  the BOND-ORIGINATOR AGGREGATOR model: we hand one application to an
//  originator (ooba / BetterBond / MortgageMax) who submits it to every
//  major bank simultaneously. We stay a REFERRER — the originator holds
//  the NCA/FSP licence. POPIA: explicit data-sharing consent is required
//  before we forward an applicant's financial data to a partner.
// ═══════════════════════════════════════════════════════════════

function requireAdmin(role: string) {
  if (!["ADMIN", "DEVELOPMENT_MANAGER"].includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required." });
  }
}

/** Shared projection for an application + its bank offers. */
function serialiseApplication(app: {
  id: number;
  userId: number;
  prequalificationId: number | null;
  propertyId: number | null;
  requestedBondAmount: number;
  propertyPrice: number;
  depositAmount: number;
  grossMonthlyIncome: number;
  estimatedInstalment: number;
  annualInterestRate: number;
  loanTermYears: number;
  originatorName: string | null;
  status: string;
  applicantPhone: string | null;
  notes: string | null;
  statusNote: string | null;
  submittedAt: Date;
  createdAt: Date;
  offers?: {
    id: number;
    bankName: string;
    approvedAmount: number;
    annualInterestRate: number;
    monthlyInstalment: number;
    loanTermYears: number;
    status: string;
    notes: string | null;
    createdAt: Date;
  }[];
}) {
  return {
    id: app.id,
    prequalificationId: app.prequalificationId,
    propertyId: app.propertyId,
    requestedBondAmount: app.requestedBondAmount,
    propertyPrice: app.propertyPrice,
    depositAmount: app.depositAmount,
    grossMonthlyIncome: app.grossMonthlyIncome,
    estimatedInstalment: app.estimatedInstalment,
    annualInterestRate: app.annualInterestRate,
    loanTermYears: app.loanTermYears,
    originatorName: app.originatorName,
    status: app.status,
    applicantPhone: app.applicantPhone,
    notes: app.notes,
    statusNote: app.statusNote,
    submittedAt: app.submittedAt,
    createdAt: app.createdAt,
    offers: (app.offers ?? []).map((o) => ({
      id: o.id,
      bankName: o.bankName,
      approvedAmount: o.approvedAmount,
      annualInterestRate: o.annualInterestRate,
      monthlyInstalment: o.monthlyInstalment,
      loanTermYears: o.loanTermYears,
      status: o.status,
      notes: o.notes,
      createdAt: o.createdAt,
    })),
  };
}

// ─── Investor: submit a one-button multi-bank application ──────
export const submitHomeLoanApplication = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      prequalificationId: z.number().int().positive().optional(),
      propertyId: z.number().int().positive().optional(),
      requestedBondAmount: z.number().min(0).max(1_000_000_000),
      propertyPrice: z.number().min(0).max(1_000_000_000).optional(),
      depositAmount: z.number().min(0).max(1_000_000_000).optional(),
      grossMonthlyIncome: z.number().min(0).max(100_000_000).optional(),
      estimatedInstalment: z.number().min(0).max(100_000_000).optional(),
      annualInterestRate: z.number().min(0).max(100).optional(),
      loanTermYears: z.number().int().min(1).max(40).optional(),
      applicantPhone: z.string().max(40).optional(),
      notes: z.string().max(1000).optional(),
      consentShareData: z.boolean(),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    // POPIA: explicit consent is required before we share financial data
    // with a third-party bond originator.
    if (!input.consentShareData) {
      return {
        success: false as const,
        error:
          "You must consent to us sharing your application with a bond originator before we can submit it.",
      };
    }

    // Find the active bond-originator partner (if one is configured). The
    // application is still created without one so admin can assign later.
    const partner = await db.referralPartner.findFirst({
      where: { type: "BOND_ORIGINATOR", active: true },
      orderBy: { createdAt: "asc" },
    });

    let referralLeadId: number | null = null;
    if (partner) {
      const lead = await db.referralLead.create({
        data: {
          partnerId: partner.id,
          userId: user.id,
          listingId: input.propertyId ?? null,
          contactName: user.name,
          contactEmail: user.email,
          contactPhone: input.applicantPhone ?? null,
          status: "NEW",
          estimatedValue: input.requestedBondAmount,
          notes: `Home-loan application (bond ~${Math.round(input.requestedBondAmount)})`,
        },
      });
      referralLeadId = lead.id;
    }

    const app = await db.homeLoanApplication.create({
      data: {
        userId: user.id,
        prequalificationId: input.prequalificationId ?? null,
        propertyId: input.propertyId ?? null,
        referralLeadId,
        requestedBondAmount: input.requestedBondAmount,
        propertyPrice: input.propertyPrice ?? 0,
        depositAmount: input.depositAmount ?? 0,
        grossMonthlyIncome: input.grossMonthlyIncome ?? 0,
        estimatedInstalment: input.estimatedInstalment ?? 0,
        annualInterestRate: input.annualInterestRate ?? 11.75,
        loanTermYears: input.loanTermYears ?? 20,
        originatorName: partner?.name ?? null,
        status: "SUBMITTED",
        consentShareData: true,
        applicantPhone: input.applicantPhone ?? null,
        notes: input.notes ?? null,
      },
    });

    await createAuditLog(user.id, "SUBMIT_HOME_LOAN_APPLICATION", "HomeLoanApplication", app.id, {
      requestedBondAmount: input.requestedBondAmount,
      propertyId: input.propertyId ?? null,
      originatorAssigned: Boolean(partner),
    });

    return {
      success: true as const,
      id: app.id,
      status: app.status,
      originatorName: partner?.name ?? null,
    };
  });

// ─── Investor: list my applications (with offers) ──────────────
export const getMyHomeLoanApplications = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const apps = await db.homeLoanApplication.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { offers: { orderBy: { annualInterestRate: "asc" } } },
    });
    return { applications: apps.map(serialiseApplication) };
  });

// ─── Investor: withdraw an application ─────────────────────────
export const withdrawHomeLoanApplication = baseProcedure
  .input(z.object({ authToken: z.string(), id: z.number().int().positive() }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const app = await db.homeLoanApplication.findUnique({ where: { id: input.id } });
    if (!app || app.userId !== user.id) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Application not found." });
    }
    if (app.status === "ACCEPTED") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "You cannot withdraw an application you have already accepted an offer on.",
      });
    }

    await db.homeLoanApplication.update({
      where: { id: input.id },
      data: { status: "WITHDRAWN", statusNote: "Withdrawn by applicant." },
    });
    // Mark any linked referral lead as lost.
    if (app.referralLeadId) {
      await db.referralLead
        .update({ where: { id: app.referralLeadId }, data: { status: "LOST" } })
        .catch(() => undefined);
    }

    await createAuditLog(user.id, "WITHDRAW_HOME_LOAN_APPLICATION", "HomeLoanApplication", app.id);
    return { success: true as const };
  });

// ─── Investor: accept a specific bank offer ────────────────────
export const acceptHomeLoanOffer = baseProcedure
  .input(z.object({ authToken: z.string(), offerId: z.number().int().positive() }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const offer = await db.homeLoanOffer.findUnique({
      where: { id: input.offerId },
      include: { application: true },
    });
    if (!offer || offer.application.userId !== user.id) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Offer not found." });
    }
    const app = offer.application;

    await db.$transaction([
      db.homeLoanOffer.update({ where: { id: offer.id }, data: { status: "ACCEPTED" } }),
      db.homeLoanOffer.updateMany({
        where: { applicationId: app.id, id: { not: offer.id }, status: "OFFERED" },
        data: { status: "DECLINED" },
      }),
      db.homeLoanApplication.update({
        where: { id: app.id },
        data: {
          status: "ACCEPTED",
          statusNote: `Accepted ${offer.bankName} offer at ${offer.annualInterestRate}%.`,
        },
      }),
    ]);

    // Realise the bond-referral commission and convert the referral lead.
    await convertReferralAndBookFee(app.id, app.referralLeadId, offer.approvedAmount || app.requestedBondAmount);

    await createAuditLog(user.id, "ACCEPT_HOME_LOAN_OFFER", "HomeLoanOffer", offer.id, {
      applicationId: app.id,
      bankName: offer.bankName,
    });
    return { success: true as const, applicationId: app.id };
  });

// ─── Admin / originator-ops: list all applications ─────────────
export const getHomeLoanApplicationsAdmin = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      status: z
        .enum(["SUBMITTED", "BANKS_REVIEWING", "OFFERS_IN", "ACCEPTED", "DECLINED", "WITHDRAWN"])
        .optional(),
    }),
  )
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireAdmin(user.role);
    const apps = await db.homeLoanApplication.findMany({
      where: { ...(input.status ? { status: input.status } : {}) },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        offers: { orderBy: { annualInterestRate: "asc" } },
        user: { select: { name: true, email: true } },
      },
    });
    return {
      applications: apps.map((a) => ({
        ...serialiseApplication(a),
        applicantName: a.user?.name ?? null,
        applicantEmail: a.user?.email ?? null,
      })),
    };
  });

// ─── Admin: advance status + record originator's returned bank offers ──
export const updateHomeLoanApplicationAdmin = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      id: z.number().int().positive(),
      status: z
        .enum(["SUBMITTED", "BANKS_REVIEWING", "OFFERS_IN", "ACCEPTED", "DECLINED", "WITHDRAWN"])
        .optional(),
      statusNote: z.string().max(1000).optional(),
      offers: z
        .array(
          z.object({
            bankName: z.string().min(1).max(120),
            approvedAmount: z.number().min(0).max(1_000_000_000),
            annualInterestRate: z.number().min(0).max(100),
            monthlyInstalment: z.number().min(0).max(100_000_000),
            loanTermYears: z.number().int().min(1).max(40),
            notes: z.string().max(500).optional(),
          }),
        )
        .max(10)
        .optional(),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireAdmin(user.role);

    const app = await db.homeLoanApplication.findUnique({ where: { id: input.id } });
    if (!app) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Application not found." });
    }

    if (input.offers?.length) {
      await db.homeLoanOffer.createMany({
        data: input.offers.map((o) => ({
          applicationId: app.id,
          bankName: o.bankName,
          approvedAmount: o.approvedAmount,
          annualInterestRate: o.annualInterestRate,
          monthlyInstalment: o.monthlyInstalment,
          loanTermYears: o.loanTermYears,
          notes: o.notes ?? null,
        })),
      });
    }

    // Default status to OFFERS_IN when offers were added and no explicit status given.
    const nextStatus = input.status ?? (input.offers?.length ? "OFFERS_IN" : app.status);
    await db.homeLoanApplication.update({
      where: { id: app.id },
      data: {
        status: nextStatus,
        statusNote: input.statusNote ?? app.statusNote,
      },
    });

    // If an admin marks the application ACCEPTED, realise the referral fee.
    if (nextStatus === "ACCEPTED") {
      await convertReferralAndBookFee(app.id, app.referralLeadId, app.requestedBondAmount);
    }

    await createAuditLog(user.id, "UPDATE_HOME_LOAN_APPLICATION", "HomeLoanApplication", app.id, {
      status: nextStatus,
      offersAdded: input.offers?.length ?? 0,
    });
    return { success: true as const, status: nextStatus };
  });

/**
 * Convert the linked referral lead to CONVERTED and book the flat bond
 * referral fee into the platform revenue ledger. Idempotent and best-effort —
 * never throws, so it can't break the applicant-facing flow.
 */
async function convertReferralAndBookFee(
  applicationId: number,
  referralLeadId: number | null,
  estimatedValue: number,
) {
  try {
    if (referralLeadId) {
      const lead = await db.referralLead.findUnique({
        where: { id: referralLeadId },
        include: { partner: true },
      });
      if (lead && lead.status !== "CONVERTED") {
        const variable = estimatedValue
          ? (estimatedValue * lead.partner.commissionBps) / 10000
          : 0;
        const commissionAmount =
          Math.round((lead.partner.commissionFlat + variable) * 100) / 100;
        await db.referralLead.update({
          where: { id: lead.id },
          data: {
            status: "CONVERTED",
            estimatedValue,
            commissionAmount,
            convertedAt: new Date(),
          },
        });
      }
    }

    // Also book the configurable flat bond-referral platform fee.
    const cfg = await getFeeConfig();
    if (cfg.bondReferralFee > 0) {
      await recordPlatformFee({
        feeType: "BOND_REFERRAL",
        sourceType: "Acquisition",
        sourceId: applicationId,
        baseAmount: estimatedValue,
        feeBps: 0,
        feeAmount: cfg.bondReferralFee,
        description: `Bond referral fee — home-loan application #${applicationId}`,
      });
    }
  } catch (err) {
    console.error("[home-loan] convertReferralAndBookFee failed:", err);
  }
}
