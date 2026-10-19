import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";
import { createNotification } from "./notifications";
import { createAuditLog } from "./audit-log";
import {
  getFeeConfig,
  recordPlatformFee,
  computeFeeFromBps,
} from "~/server/fees/platform-fees";

// ═══════════════════════════════════════════════════════════════
//  Owner (seller-side) fee booking helpers.
//  All bookings are idempotent per (feeType, sourceType, sourceId) and are
//  wrapped in try/catch so revenue bookkeeping never breaks the workflow.
// ═══════════════════════════════════════════════════════════════

/** Flat due-diligence / valuation pack fee — booked once per proposal. */
export async function bookAssessmentPackFee(proposalId: number): Promise<void> {
  try {
    const cfg = await getFeeConfig();
    if (!cfg.enabled || cfg.assessmentPackFee <= 0) return;
    await recordPlatformFee({
      feeType: "ASSESSMENT_PACK",
      sourceType: "OwnerSaleProposal",
      sourceId: proposalId,
      baseAmount: cfg.assessmentPackFee,
      feeBps: 0,
      feeAmount: cfg.assessmentPackFee,
      description: `Assessment / due-diligence pack — proposal #${proposalId}`,
    });
  } catch (err) {
    console.error("[owner-fees] assessment pack booking failed:", err);
  }
}

/**
 * Fees due when an owner sale proposal is ACCEPTED:
 *   • seller facilitation fee (% of the agreed price)
 *   • lease-back setup fee (flat) when the engagement is a lease-back
 *   • bond / conveyancing referral commission (flat) when a bond exists
 * Each fee type is idempotent per proposal.
 */
export async function bookOwnerAcceptanceFees(proposal: {
  id: number;
  askingPrice: number;
  counterOfferAmount: number | null;
  engagementType: string;
  bondStatus: string;
}): Promise<void> {
  try {
    const cfg = await getFeeConfig();
    if (!cfg.enabled) return;
    const agreedPrice = proposal.counterOfferAmount ?? proposal.askingPrice;

    if (cfg.sellerFacilitationFeeBps > 0 && agreedPrice > 0) {
      await recordPlatformFee({
        feeType: "SELLER_FACILITATION",
        sourceType: "OwnerSaleProposal",
        sourceId: proposal.id,
        baseAmount: agreedPrice,
        feeBps: cfg.sellerFacilitationFeeBps,
        description: `Seller facilitation fee — proposal #${proposal.id}`,
      });
    }

    if (proposal.engagementType === "LEASE_BACK" && cfg.leaseBackSetupFee > 0) {
      await recordPlatformFee({
        feeType: "LEASE_BACK_SETUP",
        sourceType: "OwnerSaleProposal",
        sourceId: proposal.id,
        baseAmount: cfg.leaseBackSetupFee,
        feeBps: 0,
        feeAmount: cfg.leaseBackSetupFee,
        description: `Lease-back setup fee — proposal #${proposal.id}`,
      });
    }

    if (proposal.bondStatus === "EXISTING" && cfg.bondReferralFee > 0) {
      await recordPlatformFee({
        feeType: "BOND_REFERRAL",
        sourceType: "OwnerSaleProposal",
        sourceId: proposal.id,
        baseAmount: cfg.bondReferralFee,
        feeBps: 0,
        feeAmount: cfg.bondReferralFee,
        description: `Bond / conveyancing referral — proposal #${proposal.id}`,
      });
    }
  } catch (err) {
    console.error("[owner-fees] acceptance fee booking failed:", err);
  }
}

// ─── Submit a sale proposal (Property Owner) ─────────────────────────

export const submitSaleProposal = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      title: z.string().min(3, "Title must be at least 3 characters"),
      description: z.string().min(10, "Description must be at least 10 characters"),
      address: z.string().min(3, "Address is required"),
      city: z.string().min(2, "City is required"),
      province: z.string().default("Gauteng"),
      propertyType: z.string(),
      askingPrice: z.number().positive("Asking price must be positive"),
      marketValue: z.number().positive().optional(),
      urgencyLevel: z.enum(["URGENT", "HIGH", "STANDARD"]).default("STANDARD"),
      saleType: z.enum(["CASH", "BOND", "INSTALLMENT"]),
      reason: z.string().optional(),
      bedrooms: z.number().int().min(0).optional(),
      bathrooms: z.number().int().min(0).optional(),
      squareMeters: z.number().int().min(0).optional(),
      erfSize: z.number().min(0).optional(),
      imageUrls: z.array(z.string()).optional(),
      documentUrls: z.array(z.object({
        kind: z.enum(["TITLE_DEED", "ID", "RATES_ACCOUNT", "BOND_STATEMENT", "LEASE", "OTHER"]),
        url: z.string(),
        name: z.string(),
      })).optional(),
      engagementType: z.enum(["OUTRIGHT_SALE", "JOINT_VENTURE", "LEASE_BACK", "DEVELOPMENT_PARTNERSHIP"]).default("OUTRIGHT_SALE"),
      titleDeedNumber: z.string().optional(),
      erfNumber: z.string().optional(),
      bondStatus: z.enum(["NONE", "EXISTING"]).default("NONE"),
      bondOutstanding: z.number().min(0).optional(),
      bondBank: z.string().optional(),
      ratesStatus: z.enum(["CURRENT", "ARREARS"]).default("CURRENT"),
      ratesArrears: z.number().min(0).optional(),
      tenancyStatus: z.enum(["OWNER_OCCUPIED", "TENANTED", "VACANT"]).default("OWNER_OCCUPIED"),
      monthlyRent: z.number().min(0).optional(),
      leaseEndDate: z.string().optional(),
      conditionRating: z.enum(["EXCELLENT", "GOOD", "FAIR", "NEEDS_RENOVATION", "DISTRESSED"]).default("GOOD"),
      estimatedRenoCost: z.number().min(0).optional(),
      coOwners: z.string().optional(),
      popiaConsent: z.literal(true, {
        errorMap: () => ({ message: "You must consent to POPIA processing of your information" }),
      }),
      contactPhone: z.string().optional(),
      contactEmail: z.string().email().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["PROPERTY_OWNER"], "Only property owners can submit sale proposals");

    // Cross-field validation
    if (input.bondStatus === "EXISTING" && (!input.bondOutstanding || input.bondOutstanding <= 0)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Please provide the outstanding bond balance" });
    }
    if (input.ratesStatus === "ARREARS" && (!input.ratesArrears || input.ratesArrears <= 0)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Please provide the rates arrears amount" });
    }
    if (input.tenancyStatus === "TENANTED" && !input.monthlyRent) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Please provide the monthly rent for the tenanted property" });
    }

    const proposal = await db.ownerSaleProposal.create({
      data: {
        ownerId: user.id,
        title: input.title,
        description: input.description,
        address: input.address,
        city: input.city,
        province: input.province,
        propertyType: input.propertyType,
        askingPrice: input.askingPrice,
        marketValue: input.marketValue,
        urgencyLevel: input.urgencyLevel,
        saleType: input.saleType,
        reason: input.reason,
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
        squareMeters: input.squareMeters,
        erfSize: input.erfSize,
        imageUrls: input.imageUrls ?? [],
        documentUrls: (input.documentUrls ?? []) as any,
        engagementType: input.engagementType,
        titleDeedNumber: input.titleDeedNumber,
        erfNumber: input.erfNumber,
        bondStatus: input.bondStatus,
        bondOutstanding: input.bondOutstanding,
        bondBank: input.bondBank,
        ratesStatus: input.ratesStatus,
        ratesArrears: input.ratesArrears,
        tenancyStatus: input.tenancyStatus,
        monthlyRent: input.monthlyRent,
        leaseEndDate: input.leaseEndDate ? new Date(input.leaseEndDate) : null,
        conditionRating: input.conditionRating,
        estimatedRenoCost: input.estimatedRenoCost,
        coOwners: input.coOwners,
        popiaConsent: input.popiaConsent,
        contactPhone: input.contactPhone ?? user.email,
        contactEmail: input.contactEmail ?? user.email,
      },
    });

    // Notify all DEV managers & project managers
    const managers = await db.user.findMany({
      where: { role: { in: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"] } },
      select: { id: true },
    });

    const urgencyLabel =
      input.urgencyLevel === "URGENT"
        ? "🚨 URGENT"
        : input.urgencyLevel === "HIGH"
          ? "⚡ HIGH PRIORITY"
          : "New";

    await Promise.all(
      managers.map((mgr) =>
        createNotification(
          mgr.id,
          `${urgencyLabel} Sale Proposal — R${input.askingPrice.toLocaleString()}`,
          `${user.name} has submitted a ${input.saleType.toLowerCase()} sale proposal for "${input.title}" in ${input.city}. Asking price: R${input.askingPrice.toLocaleString()}. Please review in your dashboard.`,
          input.urgencyLevel === "URGENT" ? "WARNING" : "INFO",
          "PROPERTY",
          proposal.id
        )
      )
    );

    // Confirm to the owner
    await createNotification(
      user.id,
      "Sale Proposal Submitted",
      `Your sale proposal for "${input.title}" has been submitted and is pending review by the development team.`,
      "SUCCESS",
      "PROPERTY",
      proposal.id
    );

    return { success: true, proposal };
  });

// ─── Get my sale proposals (Property Owner) ─────────────────────────

export const getMySaleProposals = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
    })
  )
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["PROPERTY_OWNER"], "Only property owners can view their sale proposals");

    const proposals = await db.ownerSaleProposal.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        reviewedBy: {
          select: { name: true },
        },
      },
    });

    return proposals;
  });

// ─── Get all sale proposals (Dev Manager view) ──────────────────────

export const getSaleProposals = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      status: z.enum(["PENDING", "UNDER_REVIEW", "ACCEPTED", "REJECTED", "WITHDRAWN"]).optional(),
    })
  )
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(
      user,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only development managers can view all sale proposals"
    );

    const where: any = {};
    if (input.status) {
      where.status = input.status;
    }

    const proposals = await db.ownerSaleProposal.findMany({
      where,
      orderBy: [{ urgencyLevel: "asc" }, { createdAt: "desc" }],
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
        reviewedBy: {
          select: { name: true },
        },
      },
    });

    // Also get counts per status
    const counts = await db.ownerSaleProposal.groupBy({
      by: ["status"],
      _count: true,
    });

    const statusCounts: Record<string, number> = {};
    counts.forEach((c) => {
      statusCounts[c.status] = c._count;
    });

    return { proposals, statusCounts };
  });

// ─── Review a sale proposal (Dev Manager) ───────────────────────────

export const reviewSaleProposal = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      proposalId: z.number(),
      action: z.enum(["UNDER_REVIEW", "ACCEPTED", "REJECTED"]),
      reviewNotes: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(
      user,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only development managers can review sale proposals"
    );

    const proposal = await db.ownerSaleProposal.findUnique({
      where: { id: input.proposalId },
    });

    if (!proposal) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Sale proposal not found" });
    }

    const updated = await db.ownerSaleProposal.update({
      where: { id: input.proposalId },
      data: {
        status: input.action,
        reviewedById: user.id,
        reviewNotes: input.reviewNotes,
        reviewedAt: new Date(),
      },
    });

    // ── Platform monetization (owner / seller side) ──
    // Assessment pack is booked once the proposal enters active review;
    // facilitation / lease-back / bond-referral fees book on acceptance.
    if (input.action === "UNDER_REVIEW") {
      await bookAssessmentPackFee(proposal.id);
    } else if (input.action === "ACCEPTED") {
      await bookAssessmentPackFee(proposal.id);
      await bookOwnerAcceptanceFees(proposal);
    }

    // Notify the property owner
    const statusLabel =
      input.action === "UNDER_REVIEW"
        ? "is now under review"
        : input.action === "ACCEPTED"
          ? "has been accepted"
          : "has been declined";

    await createNotification(
      proposal.ownerId,
      `Sale Proposal ${input.action.replace(/_/g, " ")}`,
      `Your sale proposal for "${proposal.title}" ${statusLabel}.${input.reviewNotes ? ` Notes: ${input.reviewNotes}` : ""}`,
      input.action === "ACCEPTED" ? "SUCCESS" : input.action === "REJECTED" ? "WARNING" : "INFO",
      "PROPERTY",
      proposal.id
    );

    return updated;
  });

// ─── Withdraw own proposal (Property Owner) ────────────────────────

export const withdrawSaleProposal = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      proposalId: z.number(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["PROPERTY_OWNER"], "Only property owners can withdraw their proposals");

    const proposal = await db.ownerSaleProposal.findUnique({
      where: { id: input.proposalId },
    });

    if (!proposal || proposal.ownerId !== user.id) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
    }

    if (proposal.status === "ACCEPTED") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cannot withdraw an accepted proposal",
      });
    }

    const updated = await db.ownerSaleProposal.update({
      where: { id: input.proposalId },
      data: { status: "WITHDRAWN" },
    });

    return updated;
  });

// ─── Book a recurring owner fee (Dev Manager) ──────────────────────
// JV promote (% of an owner JV / partnership payout) and lease-back
// management margin (% of rental income) are recurring, so each booking is
// recorded against an occurrence-unique ledger key to avoid collisions on
// the (feeType, sourceType, sourceId) unique index.
export const bookOwnerRecurringFee = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      proposalId: z.number(),
      feeType: z.enum(["JV_PROMOTE", "LEASE_BACK_MGMT"]),
      baseAmount: z.number().positive(),
      period: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(
      user,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "ADMIN"],
      "Only managers can book owner fees"
    );

    const proposal = await db.ownerSaleProposal.findUnique({
      where: { id: input.proposalId },
    });
    if (!proposal) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Sale proposal not found" });
    }
    if (proposal.status !== "ACCEPTED") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Recurring fees can only be booked on an accepted proposal",
      });
    }

    const cfg = await getFeeConfig();
    if (!cfg.enabled) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Fee capture is currently disabled" });
    }
    const bps =
      input.feeType === "JV_PROMOTE" ? cfg.jvPromoteFeeBps : cfg.leaseBackMgmtFeeBps;
    if (bps <= 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "This fee is disabled (rate is 0). Set a rate in the revenue settings first.",
      });
    }

    const feeAmount = computeFeeFromBps(input.baseAmount, bps);
    const label = input.feeType === "JV_PROMOTE" ? "JV promote" : "Lease-back management";
    const period = input.period ?? new Date().toISOString().slice(0, 7);

    // Occurrence-unique sourceId keeps each recurring booking distinct.
    const occurrence = await db.platformRevenue.count({
      where: {
        feeType: input.feeType,
        sourceType: "OwnerSaleProposal",
        description: { contains: `proposal #${input.proposalId}/` },
      },
    });
    const sourceId = input.proposalId * 100000 + occurrence;

    const booked = await recordPlatformFee({
      feeType: input.feeType,
      sourceType: "OwnerSaleProposal",
      sourceId,
      baseAmount: input.baseAmount,
      feeBps: bps,
      feeAmount,
      description: `${label} fee — proposal #${input.proposalId}/${period}`,
    });

    await createAuditLog(user.id, "BOOK_OWNER_FEE", "OwnerSaleProposal", input.proposalId, {
      feeType: input.feeType,
      baseAmount: input.baseAmount,
      feeAmount: booked,
      period,
    });

    return { success: true, feeType: input.feeType, feeAmount: booked, period };
  });
