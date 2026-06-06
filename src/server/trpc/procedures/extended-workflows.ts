import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";
import { createNotification } from "./notifications";
import { createAuditLog } from "./audit-log";
import jwt from "jsonwebtoken";
import { env } from "~/server/env";

/* ─── Phase 8: Sale-proposal counter-offer ─────────────────────────── */

export const counterOfferSaleProposal = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      proposalId: z.number(),
      counterOfferAmount: z.number().positive(),
      counterOfferTerms: z.string().min(10, "Counter-offer terms must be at least 10 characters"),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"], "Only managers can issue counter-offers");

    const proposal = await db.ownerSaleProposal.findUnique({ where: { id: input.proposalId } });
    if (!proposal) throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });

    const updated = await db.ownerSaleProposal.update({
      where: { id: input.proposalId },
      data: {
        status: "UNDER_REVIEW",
        counterOfferAmount: input.counterOfferAmount,
        counterOfferTerms: input.counterOfferTerms,
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
    });

    await createNotification(
      proposal.ownerId,
      "Counter-Offer Received",
      `Investprop has issued a counter-offer of R${input.counterOfferAmount.toLocaleString()} for "${proposal.title}". Review it in your Owner Portal.`,
      "INFO",
      "PROPERTY",
      proposal.id
    );

    await createAuditLog(user.id, "COUNTER_OFFER_PROPOSAL", "OwnerSaleProposal", input.proposalId, {
      amount: input.counterOfferAmount,
      terms: input.counterOfferTerms,
    });

    return { success: true, proposal: updated };
  });

export const respondToCounterOffer = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      proposalId: z.number(),
      action: z.enum(["ACCEPT", "REJECT"]),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const proposal = await db.ownerSaleProposal.findUnique({ where: { id: input.proposalId } });
    if (!proposal) throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
    if (proposal.ownerId !== user.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You can only respond to your own proposals" });
    }
    if (!proposal.counterOfferAmount) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "No counter-offer to respond to" });
    }

    const newStatus = input.action === "ACCEPT" ? "ACCEPTED" : "REJECTED";
    const updated = await db.ownerSaleProposal.update({
      where: { id: input.proposalId },
      data: { status: newStatus },
    });

    if (proposal.reviewedById) {
      await createNotification(
        proposal.reviewedById,
        `Counter-offer ${input.action === "ACCEPT" ? "accepted" : "rejected"}`,
        `${user.name} has ${input.action === "ACCEPT" ? "accepted" : "rejected"} the counter-offer for "${proposal.title}".`,
        input.action === "ACCEPT" ? "SUCCESS" : "WARNING",
        "PROPERTY",
        proposal.id
      );
    }

    await createAuditLog(user.id, `COUNTER_OFFER_${input.action}`, "OwnerSaleProposal", input.proposalId);

    return { success: true, proposal: updated };
  });

/* ─── Phase 8: Letter of Intent generator ───────────────────────────── */

export const generateLetterOfIntent = baseProcedure
  .input(z.object({ authToken: z.string(), proposalId: z.number() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const proposal = await db.ownerSaleProposal.findUnique({
      where: { id: input.proposalId },
      include: { owner: { select: { name: true, email: true } } },
    });
    if (!proposal) throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
    if (
      proposal.ownerId !== user.id &&
      !["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "ADMIN"].includes(user.role)
    ) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not authorised" });
    }

    const amount = proposal.counterOfferAmount ?? proposal.askingPrice;
    const today = new Date().toLocaleDateString("en-ZA", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const loi = {
      reference: `LOI-${proposal.id.toString().padStart(6, "0")}`,
      date: today,
      to: proposal.owner.name,
      ownerEmail: proposal.owner.email,
      propertyAddress: `${proposal.address}, ${proposal.city}, ${proposal.province}`,
      titleDeed: proposal.titleDeedNumber ?? "TBC",
      erfNumber: proposal.erfNumber ?? "TBC",
      engagementType: proposal.engagementType,
      offerAmount: amount,
      saleType: proposal.saleType,
      terms: proposal.counterOfferTerms ?? "Standard Investprop terms apply (cash offer, transfer within 60 days, all costs as per Alienation of Land Act).",
      conditions: [
        "Subject to satisfactory due diligence on title deed, rates, levies and bond status",
        "Subject to FICA verification of all signatories",
        "Subject to internal credit approval",
        "Subject to formal Offer-to-Purchase signed within 14 days of acceptance",
        proposal.bondStatus === "EXISTING"
          ? "Conditional on simultaneous bond settlement with the bondholder"
          : null,
        proposal.tenancyStatus === "TENANTED"
          ? "Subject to written confirmation of all existing leases (huur gaat voor koop applies)"
          : null,
      ].filter(Boolean) as string[],
      validUntil: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString("en-ZA"),
      disclaimer:
        "This Letter of Intent is non-binding and is intended only as a basis for further negotiation. No contract of sale arises until a formal written Offer-to-Purchase has been signed by both parties in compliance with section 2(1) of the Alienation of Land Act 68 of 1981.",
    };

    return loi;
  });

/* ─── Phase 11: Contractor self-onboarding ──────────────────────────── */
// NOTE: The canonical contractor self-onboarding procedure is
// `submitContractorSelfProfile` in `./contractor-management.ts`. The duplicate
// `onboardContractorProfile` that previously lived here was removed (2026-06-04)
// after E2E testing surfaced the overlap.

/* ─── Phase 12: Work-order acceptance + variation ───────────────────── */

export const acceptWorkOrder = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      workOrderId: z.number(),
      signatureFullName: z.string().min(3, "Type your full legal name to accept"),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["CONTRACTOR"], "Only contractors can accept work orders");

    const wo = await db.workOrder.findUnique({
      where: { id: input.workOrderId },
      include: { contractorProfile: true },
    });
    if (!wo) throw new TRPCError({ code: "NOT_FOUND", message: "Work order not found" });
    if (wo.contractorProfile.userId !== user.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not your work order" });
    }
    if (wo.acceptedAt) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Work order already accepted" });
    }

    const retentionAmount = (wo.agreedAmount * wo.retentionPercent) / 100;
    const updated = await db.workOrder.update({
      where: { id: input.workOrderId },
      data: {
        status: "ACCEPTED",
        acceptedAt: new Date(),
        acceptedSignature: input.signatureFullName.trim(),
        retentionAmount,
      },
    });

    await createNotification(
      wo.issuedById,
      "Work order accepted",
      `${input.signatureFullName} has accepted work order #${wo.id}: ${wo.title}.`,
      "SUCCESS",
      "SYSTEM",
      wo.id
    );

    await createAuditLog(user.id, "WORK_ORDER_ACCEPT", "WorkOrder", wo.id, {
      signature: input.signatureFullName,
      retentionAmount,
    });

    return { success: true, workOrder: updated };
  });

export const proposeVariation = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      workOrderId: z.number(),
      number: z.string().min(1),
      description: z.string().min(10),
      costImpact: z.number(),
      timeImpactDays: z.number().int().default(0),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const wo = await db.workOrder.findUnique({
      where: { id: input.workOrderId },
      include: { contractorProfile: true },
    });
    if (!wo) throw new TRPCError({ code: "NOT_FOUND", message: "Work order not found" });

    const isContractor = wo.contractorProfile.userId === user.id;
    const isManager = ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "ADMIN"].includes(user.role);
    if (!isContractor && !isManager) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not authorised" });
    }

    const vo = await db.variationOrder.create({
      data: {
        workOrderId: input.workOrderId,
        number: input.number,
        description: input.description,
        costImpact: input.costImpact,
        timeImpactDays: input.timeImpactDays,
        proposedById: user.id,
      },
    });

    // Notify the other side
    const notifyUserId = isContractor ? wo.issuedById : wo.contractorProfile.userId;
    await createNotification(
      notifyUserId,
      "New variation order proposed",
      `${user.name} has proposed VO ${input.number} on work order #${wo.id} (cost impact R${input.costImpact.toLocaleString()}).`,
      "INFO",
      "SYSTEM",
      wo.id
    );

    return { success: true, variation: vo };
  });

export const respondToVariation = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      variationId: z.number(),
      action: z.enum(["APPROVE", "REJECT"]),
      reason: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "ADMIN"], "Manager-only action");

    const vo = await db.variationOrder.findUnique({
      where: { id: input.variationId },
      include: { workOrder: { include: { contractorProfile: true } } },
    });
    if (!vo) throw new TRPCError({ code: "NOT_FOUND", message: "Variation not found" });

    const updated = await db.variationOrder.update({
      where: { id: input.variationId },
      data: {
        status: input.action === "APPROVE" ? "APPROVED" : "REJECTED",
        approvedById: user.id,
        approvedAt: new Date(),
        rejectionReason: input.action === "REJECT" ? input.reason : null,
      },
    });

    // If approved, update the work order amount + end date
    if (input.action === "APPROVE") {
      const newAmount = vo.workOrder.agreedAmount + vo.costImpact;
      const newEndDate = new Date(vo.workOrder.expectedEndDate);
      newEndDate.setDate(newEndDate.getDate() + vo.timeImpactDays);
      await db.workOrder.update({
        where: { id: vo.workOrderId },
        data: { agreedAmount: newAmount, expectedEndDate: newEndDate },
      });
    }

    await createNotification(
      vo.workOrder.contractorProfile.userId,
      `Variation ${input.action.toLowerCase()}d`,
      `Your variation ${vo.number} on work order #${vo.workOrderId} has been ${input.action.toLowerCase()}d.`,
      input.action === "APPROVE" ? "SUCCESS" : "WARNING",
      "SYSTEM",
      vo.workOrderId
    );

    return { success: true, variation: updated };
  });

/* ─── Phase 12: List variations (manager dashboard) ─────────────────── */

export const listVariations = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      status: z.enum(["ALL", "PROPOSED", "APPROVED", "REJECTED"]).default("PROPOSED"),
    })
  )
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "ADMIN"], "Manager-only");

    const where: any = {};
    if (input.status !== "ALL") where.status = input.status;

    const variations = await db.variationOrder.findMany({
      where,
      include: {
        workOrder: {
          select: {
            id: true,
            title: true,
            agreedAmount: true,
            expectedEndDate: true,
            property: { select: { id: true, title: true, city: true } },
            contractorProfile: {
              select: { companyName: true, user: { select: { name: true, email: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return { variations };
  });

/* ─── Phase 13: Audit-log viewer ────────────────────────────────────── */

export const listAuditLog = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      action: z.string().optional(),
      userId: z.number().optional(),
      entityType: z.string().optional(),
      limit: z.number().int().min(1).max(500).default(100),
      cursor: z.number().optional(),
    })
  )
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["ADMIN", "DEVELOPMENT_MANAGER"], "Admin only");

    const where: any = {};
    if (input.action) where.action = { contains: input.action, mode: "insensitive" };
    if (input.userId) where.userId = input.userId;
    if (input.entityType) where.entity = input.entityType;
    if (input.cursor) where.id = { lt: input.cursor };

    const rows = await db.auditLog.findMany({
      where,
      orderBy: { id: "desc" },
      take: input.limit,
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });

    return { rows, nextCursor: rows.length === input.limit ? rows[rows.length - 1]!.id : null };
  });

/* ─── Phase 13: Admin impersonation (issues short-lived token as user) */

export const impersonateUser = baseProcedure
  .input(z.object({ authToken: z.string(), targetUserId: z.number(), reason: z.string().min(5) }))
  .mutation(async ({ input }) => {
    const admin = await getAuthenticatedUser(input.authToken);
    requireRole(admin, ["ADMIN"], "Admin only");

    const target = await db.user.findUnique({ where: { id: input.targetUserId } });
    if (!target) throw new TRPCError({ code: "NOT_FOUND", message: "Target user not found" });
    if (target.role === "ADMIN") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Cannot impersonate other admins" });
    }

    // 15-minute access token signed as the target user
    const accessToken = jwt.sign(
      { userId: target.id, type: "access", impersonatedBy: admin.id },
      env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    await createAuditLog(admin.id, "IMPERSONATE_USER", "User", target.id, { reason: input.reason });

    return {
      accessToken,
      user: { id: target.id, email: target.email, name: target.name, role: target.role },
      impersonatedBy: admin.email,
    };
  });

/* ─── Phase 9: Investor — list contributions in cooling-off window ──── */

export const listCoolingOffContributions = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const now = new Date();
    const rows = await db.investorContribution.findMany({
      where: {
        investorId: user.id,
        coolingOffExpiresAt: { gt: now },
        status: { notIn: ["CANCELLED", "REJECTED"] },
      },
      include: { property: { select: { id: true, title: true } } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      id: r.id,
      propertyId: r.propertyId,
      propertyTitle: r.property?.title ?? "—",
      amount: r.amount,
      status: r.status,
      createdAt: r.createdAt,
      coolingOffExpiresAt: r.coolingOffExpiresAt,
      hoursRemaining: Math.max(
        0,
        Math.floor(
          (new Date(r.coolingOffExpiresAt!).getTime() - now.getTime()) / (1000 * 60 * 60)
        )
      ),
    }));
  });

/* ─── Phase 3c: PM Today inbox (single panel pulling what needs doing now) ── */

export const getPmTodayInbox = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(
      user,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "ADMIN"],
      "Manager-only",
    );

    const now = new Date();
    const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [
      pendingVariations,
      overdueMilestones,
      upcomingMilestones,
      pendingSignoffs,
      overBudgetMilestones,
    ] = await Promise.all([
      db.variationOrder.findMany({
        where: { status: "PROPOSED" },
        include: {
          workOrder: {
            select: { id: true, title: true, property: { select: { id: true, title: true } } },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      db.milestone.findMany({
        where: {
          status: { notIn: ["COMPLETED" as any, "CANCELLED" as any] },
          estimatedCompletionDate: { lt: now },
        },
        include: { property: { select: { id: true, title: true } } },
        orderBy: { estimatedCompletionDate: "asc" },
        take: 10,
      }),
      db.milestone.findMany({
        where: {
          status: { notIn: ["COMPLETED" as any, "CANCELLED" as any] },
          estimatedCompletionDate: { gte: now, lte: sevenDays },
        },
        include: { property: { select: { id: true, title: true } } },
        orderBy: { estimatedCompletionDate: "asc" },
        take: 10,
      }),
      db.progressSubmission.findMany({
        where: { approvalStatus: "PENDING" },
        include: {
          milestone: {
            select: { id: true, name: true, property: { select: { id: true, title: true } } },
          },
          submittedBy: { select: { id: true, name: true } },
        },
        orderBy: { submittedAt: "desc" },
        take: 10,
      }),
      db.milestone.findMany({
        where: {
          status: { notIn: ["COMPLETED" as any, "CANCELLED" as any] },
        },
        include: { property: { select: { id: true, title: true } } },
        take: 100,
      }).then((rows) =>
        rows
          .filter((m: any) => m.budgetAllocated > 0 && m.budgetSpent / m.budgetAllocated > 0.9)
          .slice(0, 10),
      ),
    ]);

    return {
      generatedAt: now,
      counts: {
        pendingVariations: pendingVariations.length,
        overdueMilestones: overdueMilestones.length,
        upcomingMilestones: upcomingMilestones.length,
        pendingSignoffs: pendingSignoffs.length,
        overBudgetMilestones: overBudgetMilestones.length,
      },
      pendingVariations: pendingVariations.map((v: any) => ({
        id: v.id,
        number: v.number,
        description: v.description,
        costImpact: v.costImpact,
        workOrderTitle: v.workOrder.title,
        propertyId: v.workOrder.property?.id ?? null,
        propertyTitle: v.workOrder.property?.title ?? "—",
        createdAt: v.createdAt,
      })),
      overdueMilestones: overdueMilestones.map((m: any) => ({
        id: m.id,
        name: m.name,
        propertyId: m.propertyId,
        propertyTitle: m.property?.title ?? "—",
        dueDate: m.estimatedCompletionDate,
        daysLate: Math.floor((now.getTime() - new Date(m.estimatedCompletionDate).getTime()) / (24 * 60 * 60 * 1000)),
      })),
      upcomingMilestones: upcomingMilestones.map((m: any) => ({
        id: m.id,
        name: m.name,
        propertyId: m.propertyId,
        propertyTitle: m.property?.title ?? "—",
        dueDate: m.estimatedCompletionDate,
      })),
      pendingSignoffs: pendingSignoffs.map((s: any) => ({
        id: s.id,
        milestoneId: s.milestoneId,
        milestoneName: s.milestone?.name ?? "—",
        propertyId: s.milestone?.property?.id ?? null,
        propertyTitle: s.milestone?.property?.title ?? "—",
        submittedBy: s.submittedBy?.name ?? "—",
        submittedAt: s.submittedAt,
        photoCount: Array.isArray(s.imageUrls) ? s.imageUrls.length : 0,
      })),
      overBudgetMilestones: overBudgetMilestones.map((m: any) => ({
        id: m.id,
        name: m.name,
        propertyId: m.propertyId,
        propertyTitle: m.property?.title ?? "—",
        budgetAllocated: m.budgetAllocated,
        budgetSpent: m.budgetSpent,
        utilizationPct: m.budgetAllocated > 0 ? (m.budgetSpent / m.budgetAllocated) * 100 : 0,
      })),
    };
  });

/* ─── Phase 3c: Admin global Action-Required inbox ────────────────── */

export const getAdminActionInbox = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["ADMIN", "DEVELOPMENT_MANAGER"], "Admin only");

    const now = new Date();
    const [
      pendingKyc,
      pendingPaymentProofs,
      openProposals,
      coolingOff,
      pendingVariations,
      pendingDistributions,
    ] = await Promise.all([
      db.kYCDocument.findMany({
        where: { status: "PENDING" },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { uploadedAt: "asc" },
        take: 25,
      }),
      db.investorContribution.findMany({
        where: {
          paymentStatus: "POP_SUBMITTED",
          status: { notIn: ["CANCELLED", "REJECTED"] },
        },
        include: {
          investor: { select: { id: true, name: true, email: true } },
          property: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: "asc" },
        take: 25,
      }),
      db.ownerSaleProposal.findMany({
        where: { status: { in: ["PENDING", "UNDER_REVIEW"] } },
        include: { owner: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
        take: 25,
      }),
      db.investorContribution.findMany({
        where: {
          coolingOffExpiresAt: { gt: now },
          status: { notIn: ["CANCELLED", "REJECTED"] },
        },
        include: {
          investor: { select: { id: true, name: true } },
          property: { select: { id: true, title: true } },
        },
        orderBy: { coolingOffExpiresAt: "asc" },
        take: 25,
      }),
      db.variationOrder.findMany({
        where: { status: "PROPOSED" },
        include: {
          workOrder: {
            select: { id: true, title: true, property: { select: { id: true, title: true } } },
          },
        },
        orderBy: { createdAt: "asc" },
        take: 25,
      }),
      db.distribution.findMany({
        where: { status: { in: ["PENDING", "APPROVED"] as any } },
        include: { property: { select: { id: true, title: true } } },
        orderBy: { createdAt: "asc" },
        take: 25,
      }),
    ]);

    return {
      generatedAt: now,
      counts: {
        pendingKyc: pendingKyc.length,
        pendingPaymentProofs: pendingPaymentProofs.length,
        openProposals: openProposals.length,
        coolingOff: coolingOff.length,
        pendingVariations: pendingVariations.length,
        pendingDistributions: pendingDistributions.length,
        total:
          pendingKyc.length +
          pendingPaymentProofs.length +
          openProposals.length +
          pendingVariations.length +
          pendingDistributions.length,
      },
      pendingKyc: pendingKyc.map((d: any) => ({
        id: d.id,
        userId: d.userId,
        userName: d.user?.name,
        userEmail: d.user?.email,
        documentType: d.documentType,
        uploadedAt: d.uploadedAt,
        daysWaiting: Math.floor((now.getTime() - new Date(d.uploadedAt).getTime()) / (24 * 60 * 60 * 1000)),
      })),
      pendingPaymentProofs: pendingPaymentProofs.map((c: any) => ({
        id: c.id,
        amount: c.amount,
        propertyTitle: c.property?.title ?? "—",
        propertyId: c.propertyId,
        investorName: c.investor?.name ?? "—",
        investorEmail: c.investor?.email ?? "",
        createdAt: c.createdAt,
        paymentStatus: c.paymentStatus,
      })),
      openProposals: openProposals.map((p: any) => ({
        id: p.id,
        title: p.title,
        askingPrice: p.askingPrice,
        ownerName: p.owner?.name ?? "—",
        status: p.status,
        createdAt: p.createdAt,
        daysWaiting: Math.floor((now.getTime() - new Date(p.createdAt).getTime()) / (24 * 60 * 60 * 1000)),
      })),
      coolingOff: coolingOff.map((c: any) => ({
        id: c.id,
        amount: c.amount,
        propertyTitle: c.property?.title ?? "—",
        investorName: c.investor?.name ?? "—",
        coolingOffExpiresAt: c.coolingOffExpiresAt,
        hoursRemaining: Math.max(
          0,
          Math.floor((new Date(c.coolingOffExpiresAt!).getTime() - now.getTime()) / (1000 * 60 * 60)),
        ),
      })),
      pendingVariations: pendingVariations.map((v: any) => ({
        id: v.id,
        number: v.number,
        costImpact: v.costImpact,
        workOrderTitle: v.workOrder?.title ?? "—",
        propertyId: v.workOrder?.property?.id ?? null,
        propertyTitle: v.workOrder?.property?.title ?? "—",
        createdAt: v.createdAt,
      })),
      pendingDistributions: pendingDistributions.map((d: any) => ({
        id: d.id,
        amount: d.totalAmount ?? d.amount ?? 0,
        propertyTitle: d.property?.title ?? "—",
        propertyId: d.propertyId,
        type: d.type,
        status: d.status,
        createdAt: d.createdAt,
      })),
    };
  });
