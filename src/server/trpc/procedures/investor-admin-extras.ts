import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";
import { createAuditLog } from "./audit-log";
import { createNotification } from "./notifications";

/* ────────────────────────────────────────────────────────────────────
   Phase 10 — Investor P1: payment proof resubmit, refund path,
                            appropriateness questionnaire,
                            cap-table preview, distribution forecast.
   Phase 13 — Admin: system health, POPIA SAR export, bulk operations.
   Phase 14 — Document vault + notifications.
   ──────────────────────────────────────────────────────────────────── */

/* ─── Phase 10: Resubmit payment proof after rejection ───────────── */
export const resubmitPaymentProof = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      contributionId: z.number(),
      proofOfPaymentUrl: z.string().url(),
      paymentReference: z.string().min(1),
      notes: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const c = await db.investorContribution.findUnique({ where: { id: input.contributionId } });
    if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Contribution not found" });
    if (c.investorId !== user.id)
      throw new TRPCError({ code: "FORBIDDEN", message: "Not your contribution" });

    const updated = await db.investorContribution.update({
      where: { id: input.contributionId },
      data: {
        proofOfPaymentUrl: input.proofOfPaymentUrl,
        paymentReference: input.paymentReference,
        paymentStatus: "PAYMENT_PENDING",
        paymentSubmittedAt: new Date(),
        paymentReviewedAt: null,
        paymentReviewedBy: null,
        paymentReviewNotes: input.notes ?? null,
      },
    });
    await createAuditLog(user.id, "PAYMENT_PROOF_RESUBMIT", "InvestorContribution", c.id, {
      reference: input.paymentReference,
    });
    return { success: true, contribution: updated };
  });

/* ─── Phase 10: Investor-initiated refund request ────────────────── */
export const requestRefund = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      contributionId: z.number(),
      reason: z.string().min(10),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const c = await db.investorContribution.findUnique({
      where: { id: input.contributionId },
      include: { property: true },
    });
    if (!c) throw new TRPCError({ code: "NOT_FOUND" });
    if (c.investorId !== user.id)
      throw new TRPCError({ code: "FORBIDDEN", message: "Not your contribution" });
    if (c.status === "CANCELLED")
      throw new TRPCError({ code: "BAD_REQUEST", message: "Already cancelled" });

    const updated = await db.investorContribution.update({
      where: { id: input.contributionId },
      data: {
        status: "REFUND_REQUESTED",
        cancelledReason: input.reason,
      },
    });
    await createAuditLog(user.id, "REFUND_REQUESTED", "InvestorContribution", c.id, {
      reason: input.reason,
    });
    // notify admins
    const admins = await db.user.findMany({ where: { role: "ADMIN" } });
    for (const a of admins) {
      await createNotification(
        a.id,
        "Refund requested",
        `${user.name} requested a refund of R${c.contributionAmount.toLocaleString()} for ${c.property?.title ?? "investment"}: "${input.reason.substring(0, 80)}"`,
        "WARNING",
        "INVESTMENT",
        c.id
      );
    }
    return { success: true, contribution: updated };
  });

/* ─── Phase 10: Appropriateness questionnaire submit ─────────────── */
export const submitAppropriatenessQuestionnaire = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      investmentExperience: z.enum(["NONE", "BASIC", "EXPERIENCED", "PROFESSIONAL"]),
      annualIncome: z.enum(["UNDER_350K", "350_750K", "750K_1_5M", "OVER_1_5M"]),
      netWorth: z.enum(["UNDER_500K", "500K_2M", "2M_10M", "OVER_10M"]),
      understandsIlliquid: z.boolean(),
      understandsLossOfCapital: z.boolean(),
      understandsCoolingOff: z.boolean(),
      maxLossTolerance: z.number().min(0).max(100),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    if (!input.understandsIlliquid || !input.understandsLossOfCapital || !input.understandsCoolingOff) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "You must acknowledge all key risks before investing.",
      });
    }
    // store as JSON on user record via existing investorProfile or User notes
    await db.user.update({
      where: { id: user.id },
      data: {
        appropriatenessAssessment: {
          ...input,
          authToken: undefined,
          completedAt: new Date().toISOString(),
        },
        appropriatenessCompletedAt: new Date(),
      } as any,
    });
    await createAuditLog(user.id, "APPROPRIATENESS_COMPLETED", "User", user.id, {
      experience: input.investmentExperience,
      tolerance: input.maxLossTolerance,
    });
    return { success: true };
  });

export const getAppropriatenessStatus = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const u = (await db.user.findUnique({
      where: { id: user.id },
      select: { appropriatenessCompletedAt: true, appropriatenessAssessment: true } as any,
    })) as any;
    return {
      completed: !!u?.appropriatenessCompletedAt,
      completedAt: u?.appropriatenessCompletedAt ?? null,
      assessment: u?.appropriatenessAssessment ?? null,
    };
  });

/* ─── Phase 10: Cap-table preview for a property ─────────────────── */
export const getCapTablePreview = baseProcedure
  .input(z.object({ authToken: z.string(), propertyId: z.number() }))
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    const property = await db.property.findUnique({ where: { id: input.propertyId } });
    if (!property) throw new TRPCError({ code: "NOT_FOUND" });

    const contributions = await db.investorContribution.findMany({
      where: { propertyId: input.propertyId, status: { not: "CANCELLED" }, deletedAt: null },
      include: { investor: { select: { id: true, name: true } } },
    });

    const totalCommitted = contributions.reduce((s, c) => s + c.contributionAmount, 0);
    const goal = property.fundingGoal || 1;
    const rows = contributions.map((c) => ({
      investorId: c.investor.id,
      investorName: c.investor.name,
      amount: c.contributionAmount,
      shares: c.numberOfShares ?? 0,
      pctOfRaised: totalCommitted > 0 ? (c.contributionAmount / totalCommitted) * 100 : 0,
      pctOfGoal: (c.contributionAmount / goal) * 100,
      status: c.status,
    }));
    return {
      property: { id: property.id, title: property.title, fundingGoal: goal },
      totalCommitted,
      totalInvestors: contributions.length,
      rows: rows.sort((a, b) => b.amount - a.amount),
    };
  });

/* ─── Phase 10: Distribution forecast based on expectedReturns ─── */
export const getDistributionForecast = baseProcedure
  .input(z.object({ authToken: z.string(), contributionId: z.number() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const c = await db.investorContribution.findUnique({
      where: { id: input.contributionId },
      include: { property: true },
    });
    if (!c) throw new TRPCError({ code: "NOT_FOUND" });
    if (c.investorId !== user.id && user.role !== "ADMIN")
      throw new TRPCError({ code: "FORBIDDEN" });

    const annualRate = c.expectedReturnRate || (c.property?.expectedReturns ?? 0);
    const principal = c.contributionAmount;
    const years = 5;
    const projections = Array.from({ length: years }, (_, i) => {
      const year = i + 1;
      const cumulativeDistribution = principal * (annualRate / 100) * year;
      const totalValue = principal + cumulativeDistribution;
      return {
        year,
        annualDistribution: principal * (annualRate / 100),
        cumulativeDistribution,
        totalValue,
      };
    });
    return {
      contributionId: c.id,
      principal,
      annualRate,
      projections,
      disclaimer:
        "Projections are illustrative only based on expected returns at investment time. Actual returns may vary.",
    };
  });

/* ─── Phase 13: System health / runtime stats ────────────────────── */
export const getSystemHealth = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["ADMIN"], "Admin only");

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const since1h = new Date(Date.now() - 60 * 60 * 1000);
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      newUsers24h,
      activeProperties,
      pendingContributions,
      pendingPayments,
      pendingFica,
      auditEvents24h,
      errorAuditEvents24h,
      logins1h,
      registrations7d,
    ] = await Promise.all([
      db.user.count(),
      db.user.count({ where: { createdAt: { gte: since24h } } }),
      db.property.count({ where: { investmentStatus: "IN_MARKET", deletedAt: null } }),
      db.investorContribution.count({ where: { status: "PENDING", deletedAt: null } }),
      db.investorContribution.count({ where: { paymentStatus: "PAYMENT_PENDING" } }),
      db.user.count({ where: { kycSubmittedAt: { not: null }, ficaVerified: false } }),
      db.auditLog.count({ where: { createdAt: { gte: since24h } } }),
      db.auditLog.count({
        where: { createdAt: { gte: since24h }, action: { contains: "ERROR" } },
      }),
      db.auditLog.count({ where: { createdAt: { gte: since1h }, action: "LOGIN" } }),
      db.user.count({ where: { createdAt: { gte: since7d } } }),
    ]);

    return {
      timestamp: new Date(),
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
      users: { total: totalUsers, new24h: newUsers24h, new7d: registrations7d },
      properties: { active: activeProperties },
      workload: {
        pendingContributions,
        pendingPayments,
        pendingFica,
      },
      activity: {
        auditEvents24h,
        errorAuditEvents24h,
        logins1h,
      },
    };
  });

/* ─── Phase 13: Bulk approve users ───────────────────────────────── */
export const bulkApproveUsers = baseProcedure
  .input(z.object({ authToken: z.string(), userIds: z.array(z.number()).min(1).max(100) }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["ADMIN"], "Admin only");
    const res = await db.user.updateMany({
      where: { id: { in: input.userIds }, status: "PENDING_APPROVAL" },
      data: { status: "ACTIVE" },
    });
    await createAuditLog(user.id, "BULK_APPROVE_USERS", "User", null, {
      count: res.count,
      ids: input.userIds,
    });
    for (const id of input.userIds) {
      await createNotification(
        id,
        "Account approved",
        "Your InvestProp account has been approved. You can now log in.",
        "SUCCESS",
        "ACCOUNT",
        id
      );
    }
    return { approved: res.count };
  });

export const bulkSuspendUsers = baseProcedure
  .input(z.object({ authToken: z.string(), userIds: z.array(z.number()).min(1).max(100), reason: z.string().min(5) }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["ADMIN"], "Admin only");
    const res = await db.user.updateMany({
      where: { id: { in: input.userIds }, role: { not: "ADMIN" } },
      data: { status: "SUSPENDED" },
    });
    await createAuditLog(user.id, "BULK_SUSPEND_USERS", "User", null, {
      count: res.count,
      reason: input.reason,
    });
    return { suspended: res.count };
  });

/* ─── Phase 13: POPIA Subject Access Request export ──────────────── */
export const popiaSubjectAccessExport = baseProcedure
  .input(z.object({ authToken: z.string(), userId: z.number().optional() }))
  .query(async ({ input }) => {
    const requestor = await getAuthenticatedUser(input.authToken);
    const targetId = input.userId ?? requestor.id;
    if (targetId !== requestor.id) {
      requireRole(requestor, ["ADMIN"], "Only admins can export other users' data");
    }
    const [user, contributions, properties, documents, auditTrail, notifications] = await Promise.all([
      db.user.findUnique({ where: { id: targetId } }),
      db.investorContribution.findMany({ where: { investorId: targetId } }),
      db.property.findMany({ where: { userId: targetId } }),
      db.legalDocument.findMany({ where: { generatedFor: targetId } }).catch(() => []),
      db.auditLog.findMany({ where: { userId: targetId }, orderBy: { createdAt: "desc" }, take: 500 }),
      db.notification.findMany({ where: { userId: targetId } }).catch(() => []),
    ]);
    await createAuditLog(requestor.id, "POPIA_SAR_EXPORT", "User", targetId);
    if (!user) throw new TRPCError({ code: "NOT_FOUND" });
    // strip secrets
    const { passwordHash, ...safeUser } = user as any;
    return {
      generatedAt: new Date(),
      requestedBy: { id: requestor.id, email: requestor.email },
      subject: safeUser,
      contributions,
      propertiesOwned: properties,
      documents,
      auditTrail,
      notifications,
      meta: {
        legalBasis: "POPIA s23 Subject Access Right",
        retentionPolicy: "Personal data retained 7 years post-account closure (FICA s42).",
      },
    };
  });

/* ─── Phase 14: Document vault listing for the current user ─────── */
export const listMyDocuments = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const legal = await db.legalDocument
      .findMany({
        where: { OR: [{ generatedFor: user.id }, { userId: user.id }] },
        orderBy: { createdAt: "desc" },
      })
      .catch(() => [] as any[]);
    const contributions = await db.investorContribution.findMany({
      where: { investorId: user.id, proofOfPaymentUrl: { not: null } },
      select: {
        id: true,
        proofOfPaymentUrl: true,
        paymentReference: true,
        paymentSubmittedAt: true,
        property: { select: { title: true } },
      },
    });
    const certificates = await db.shareCertificate
      .findMany({
        where: { contribution: { investorId: user.id } },
        include: { contribution: { include: { property: true } } },
      })
      .catch(() => [] as any[]);
    return {
      legalDocuments: legal,
      paymentProofs: contributions,
      shareCertificates: certificates,
      totalCount: legal.length + contributions.length + certificates.length,
    };
  });
