import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { createNotification } from "./notifications";

// ─── Contractor Profiles ────────────────────────────────────────

export const getContractors = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    await requireAuthenticatedUser(input.authToken, ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"]);
    return db.contractorProfile.findMany({
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "desc" },
    });
  });

export const createContractorProfile = baseProcedure
  .input(z.object({
    authToken: z.string(),
    userId: z.number(),
    companyName: z.string().min(1),
    tradingAs: z.string().optional(),
    registrationNumber: z.string().optional(),
    vatNumber: z.string().optional(),
    beeLevel: z.string().optional(),
    specialty: z.string().min(1),
    phone: z.string().min(1),
    address: z.string().optional(),
    city: z.string().optional(),
    province: z.string().optional(),
    bankName: z.string().optional(),
    bankAccountNumber: z.string().optional(),
    bankBranchCode: z.string().optional(),
    cidbGrade: z.string().optional(),
    notes: z.string().optional(),
  }))
  .mutation(async ({ input }) => {
    await requireAuthenticatedUser(input.authToken, ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"]);
    const targetUser = await db.user.findUnique({ where: { id: input.userId } });
    if (!targetUser || targetUser.role !== "CONTRACTOR") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "User must have CONTRACTOR role" });
    }
    const { authToken, ...data } = input;
    return db.contractorProfile.create({ data: { ...data, profileStatus: "APPROVED" }, include: { user: { select: { id: true, name: true, email: true } } } });
  });

export const updateContractorProfile = baseProcedure
  .input(z.object({
    authToken: z.string(),
    id: z.number(),
    companyName: z.string().optional(),
    tradingAs: z.string().optional(),
    registrationNumber: z.string().optional(),
    vatNumber: z.string().optional(),
    beeLevel: z.string().optional(),
    specialty: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    province: z.string().optional(),
    bankName: z.string().optional(),
    bankAccountNumber: z.string().optional(),
    bankBranchCode: z.string().optional(),
    cidbGrade: z.string().optional(),
    notes: z.string().optional(),
    isActive: z.boolean().optional(),
  }))
  .mutation(async ({ input }) => {
    await requireAuthenticatedUser(input.authToken, ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"]);
    const { authToken, id, ...data } = input;
    return db.contractorProfile.update({ where: { id }, data });
  });

// ─── RFQ (Request for Quotation) ────────────────────────────────

export const createRFQ = baseProcedure
  .input(z.object({
    authToken: z.string(),
    propertyId: z.number(),
    milestoneId: z.number().optional(),
    title: z.string().min(1),
    scopeOfWork: z.string().min(1),
    estimatedBudget: z.number().optional(),
    deadline: z.string(), // ISO date string
    imageUrls: z.array(z.string()).optional(),
    attachmentUrls: z.array(z.string()).optional(),
  }))
  .mutation(async ({ input }) => {
    const user = await requireAuthenticatedUser(input.authToken, ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"]);
    const { authToken, deadline, ...rest } = input;
    return db.rFQ.create({
      data: {
        ...rest,
        deadline: new Date(deadline),
        createdById: user.id,
        imageUrls: rest.imageUrls ?? [],
        attachmentUrls: rest.attachmentUrls ?? [],
      },
    });
  });

export const getRFQs = baseProcedure
  .input(z.object({
    authToken: z.string(),
    propertyId: z.number().optional(),
    status: z.enum(["OPEN", "UNDER_REVIEW", "AWARDED", "CLOSED", "CANCELLED"]).optional(),
  }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const where: any = {};
    if (input.propertyId) where.propertyId = input.propertyId;
    if (input.status) where.status = input.status;

    // Contractors only see OPEN RFQs or ones they responded to
    if (user.role === "CONTRACTOR") {
      const profile = await db.contractorProfile.findUnique({ where: { userId: user.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Contractor profile not found" });
      where.OR = [
        { status: "OPEN" },
        { responses: { some: { contractorProfileId: profile.id } } },
      ];
    }

    return db.rFQ.findMany({
      where,
      include: {
        property: { select: { id: true, title: true, city: true, imageUrl: true } },
        milestone: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        responses: {
          include: {
            contractorProfile: { include: { user: { select: { id: true, name: true } } } },
          },
        },
        _count: { select: { responses: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  });

export const updateRFQStatus = baseProcedure
  .input(z.object({
    authToken: z.string(),
    rfqId: z.number(),
    status: z.enum(["OPEN", "UNDER_REVIEW", "AWARDED", "CLOSED", "CANCELLED"]),
  }))
  .mutation(async ({ input }) => {
    await requireAuthenticatedUser(input.authToken, ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"]);
    return db.rFQ.update({ where: { id: input.rfqId }, data: { status: input.status } });
  });

// ─── RFQ Responses (Quotations from Contractors) ────────────────

export const submitQuotation = baseProcedure
  .input(z.object({
    authToken: z.string(),
    rfqId: z.number(),
    quotedAmount: z.number().positive(),
    proposedTimeline: z.string().optional(),
    notes: z.string().optional(),
    attachmentUrls: z.array(z.string()).optional(),
  }))
  .mutation(async ({ input }) => {
    const user = await requireAuthenticatedUser(input.authToken, ["CONTRACTOR"]);
    const profile = await db.contractorProfile.findUnique({ where: { userId: user.id } });
    if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Complete your contractor profile first" });

    const rfq = await db.rFQ.findUnique({ where: { id: input.rfqId } });
    if (!rfq || rfq.status !== "OPEN") throw new TRPCError({ code: "BAD_REQUEST", message: "RFQ is not open for quotations" });

    return db.rFQResponse.create({
      data: {
        rfqId: input.rfqId,
        contractorProfileId: profile.id,
        quotedAmount: input.quotedAmount,
        proposedTimeline: input.proposedTimeline,
        notes: input.notes,
        attachmentUrls: input.attachmentUrls ?? [],
      },
    });
  });

export const reviewQuotation = baseProcedure
  .input(z.object({
    authToken: z.string(),
    responseId: z.number(),
    status: z.enum(["UNDER_REVIEW", "ACCEPTED", "REJECTED"]),
    reviewNotes: z.string().optional(),
  }))
  .mutation(async ({ input }) => {
    const user = await requireAuthenticatedUser(input.authToken, ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"]);
    const response = await db.rFQResponse.update({
      where: { id: input.responseId },
      data: { status: input.status, reviewNotes: input.reviewNotes, reviewedById: user.id, reviewedAt: new Date() },
    });

    // If accepting, award the RFQ
    if (input.status === "ACCEPTED") {
      await db.rFQ.update({ where: { id: response.rfqId }, data: { status: "AWARDED" } });
      // Reject other responses
      await db.rFQResponse.updateMany({
        where: { rfqId: response.rfqId, id: { not: input.responseId } },
        data: { status: "REJECTED" },
      });
    }
    return response;
  });

// ─── Work Orders ────────────────────────────────────────────────

export const createWorkOrder = baseProcedure
  .input(z.object({
    authToken: z.string(),
    rfqId: z.number().optional(),
    propertyId: z.number(),
    contractorProfileId: z.number(),
    title: z.string().min(1),
    description: z.string().min(1),
    agreedAmount: z.number().positive(),
    startDate: z.string(),
    expectedEndDate: z.string(),
    notes: z.string().optional(),
  }))
  .mutation(async ({ input }) => {
    const user = await requireAuthenticatedUser(input.authToken, ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"]);
    const { authToken, startDate, expectedEndDate, ...rest } = input;
    return db.workOrder.create({
      data: {
        ...rest,
        startDate: new Date(startDate),
        expectedEndDate: new Date(expectedEndDate),
        issuedById: user.id,
      },
    });
  });

export const getWorkOrders = baseProcedure
  .input(z.object({
    authToken: z.string(),
    propertyId: z.number().optional(),
    contractorProfileId: z.number().optional(),
    status: z.enum(["ISSUED", "ACCEPTED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"]).optional(),
  }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const where: any = {};
    if (input.propertyId) where.propertyId = input.propertyId;
    if (input.status) where.status = input.status;

    if (user.role === "CONTRACTOR") {
      const profile = await db.contractorProfile.findUnique({ where: { userId: user.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Contractor profile not found" });
      where.contractorProfileId = profile.id;
    } else if (input.contractorProfileId) {
      where.contractorProfileId = input.contractorProfileId;
    }

    return db.workOrder.findMany({
      where,
      include: {
        property: { select: { id: true, title: true, city: true, imageUrl: true } },
        contractorProfile: { include: { user: { select: { id: true, name: true, email: true } } } },
        issuedBy: { select: { id: true, name: true } },
        rfq: { select: { id: true, title: true } },
        _count: { select: { invoices: true, updates: true } },
        updates: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { submittedBy: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  });

export const updateWorkOrderStatus = baseProcedure
  .input(z.object({
    authToken: z.string(),
    workOrderId: z.number(),
    status: z.enum(["ACCEPTED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"]),
  }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const wo = await db.workOrder.findUnique({ where: { id: input.workOrderId }, include: { contractorProfile: { include: { user: true } }, property: true } });
    if (!wo) throw new TRPCError({ code: "NOT_FOUND", message: "Work order not found" });

    // Contractors can accept, start, or complete their own work orders
    if (user.role === "CONTRACTOR") {
      if (wo.contractorProfile.userId !== user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not your work order" });
      if (!["ACCEPTED", "IN_PROGRESS", "COMPLETED"].includes(input.status)) throw new TRPCError({ code: "FORBIDDEN", message: "Contractors can only accept, start, or complete work orders" });
    }

    const updated = await db.workOrder.update({
      where: { id: input.workOrderId },
      data: {
        status: input.status,
        ...(input.status === "COMPLETED" ? { actualEndDate: new Date() } : {}),
      },
    });

    // Notify the issuer (dev manager) about status changes
    const statusLabels: Record<string, string> = { ACCEPTED: "accepted", IN_PROGRESS: "started work on", COMPLETED: "completed", ON_HOLD: "put on hold", CANCELLED: "cancelled" };
    createNotification(
      wo.issuedById,
      "Work Order Update",
      `${user.name} has ${statusLabels[input.status] ?? input.status.toLowerCase()} work order "${wo.title}" for ${wo.property.title}`,
      input.status === "COMPLETED" ? "SUCCESS" : "INFO",
      "PROPERTY",
      wo.propertyId,
    );

    return updated;
  });

// ─── Contractor Invoices ────────────────────────────────────────

export const submitContractorInvoice = baseProcedure
  .input(z.object({
    authToken: z.string(),
    workOrderId: z.number(),
    invoiceNumber: z.string().min(1),
    amount: z.number().positive(),
    taxAmount: z.number().min(0).default(0),
    description: z.string().min(1),
    attachmentUrl: z.string().optional(),
  }))
  .mutation(async ({ input }) => {
    const user = await requireAuthenticatedUser(input.authToken, ["CONTRACTOR"]);
    const profile = await db.contractorProfile.findUnique({ where: { userId: user.id } });
    if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Contractor profile not found" });

    const wo = await db.workOrder.findUnique({ where: { id: input.workOrderId } });
    if (!wo || wo.contractorProfileId !== profile.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Not your work order" });
    }

    return db.contractorInvoice.create({
      data: {
        workOrderId: input.workOrderId,
        contractorProfileId: profile.id,
        invoiceNumber: input.invoiceNumber,
        amount: input.amount,
        taxAmount: input.taxAmount,
        totalAmount: input.amount + input.taxAmount,
        description: input.description,
        attachmentUrl: input.attachmentUrl,
      },
    });
  });

export const getContractorInvoices = baseProcedure
  .input(z.object({
    authToken: z.string(),
    workOrderId: z.number().optional(),
    status: z.enum(["SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "PAID"]).optional(),
  }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const where: any = {};
    if (input.workOrderId) where.workOrderId = input.workOrderId;
    if (input.status) where.status = input.status;

    if (user.role === "CONTRACTOR") {
      const profile = await db.contractorProfile.findUnique({ where: { userId: user.id } });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Contractor profile not found" });
      where.contractorProfileId = profile.id;
    }

    return db.contractorInvoice.findMany({
      where,
      include: {
        workOrder: {
          include: { property: { select: { id: true, title: true } } },
        },
        contractorProfile: { include: { user: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: "desc" },
    });
  });

export const reviewContractorInvoice = baseProcedure
  .input(z.object({
    authToken: z.string(),
    invoiceId: z.number(),
    status: z.enum(["UNDER_REVIEW", "APPROVED", "REJECTED", "PAID"]),
    reviewNotes: z.string().optional(),
    paymentReference: z.string().optional(),
  }))
  .mutation(async ({ input }) => {
    const user = await requireAuthenticatedUser(input.authToken, ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"]);
    return db.contractorInvoice.update({
      where: { id: input.invoiceId },
      data: {
        status: input.status,
        reviewNotes: input.reviewNotes,
        reviewedById: user.id,
        reviewedAt: new Date(),
        ...(input.status === "PAID" ? { paidAt: new Date(), paymentReference: input.paymentReference } : {}),
      },
    });
  });

// ─── Contractor's Own Profile ───────────────────────────────────

export const getMyContractorProfile = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await requireAuthenticatedUser(input.authToken, ["CONTRACTOR"]);
    return db.contractorProfile.findUnique({
      where: { userId: user.id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        documents: { orderBy: { createdAt: "desc" } },
      },
    });
  });

export const updateMyContractorProfile = baseProcedure
  .input(z.object({
    authToken: z.string(),
    companyName: z.string().optional(),
    tradingAs: z.string().optional(),
    registrationNumber: z.string().optional(),
    vatNumber: z.string().optional(),
    beeLevel: z.string().optional(),
    specialty: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    province: z.string().optional(),
    bankName: z.string().optional(),
    bankAccountNumber: z.string().optional(),
    bankBranchCode: z.string().optional(),
    cidbGrade: z.string().optional(),
  }))
  .mutation(async ({ input }) => {
    const user = await requireAuthenticatedUser(input.authToken, ["CONTRACTOR"]);
    const { authToken, ...data } = input;
    return db.contractorProfile.update({
      where: { userId: user.id },
      data: { ...data, profileStatus: "PENDING" },
    });
  });

// ─── Contractor Self-Registration ───────────────────────────────

export const submitContractorSelfProfile = baseProcedure
  .input(z.object({
    authToken: z.string(),
    companyName: z.string().min(1),
    tradingAs: z.string().optional(),
    registrationNumber: z.string().optional(),
    vatNumber: z.string().optional(),
    beeLevel: z.string().optional(),
    specialty: z.string().min(1),
    phone: z.string().min(1),
    address: z.string().optional(),
    city: z.string().optional(),
    province: z.string().optional(),
    bankName: z.string().optional(),
    bankAccountNumber: z.string().optional(),
    bankBranchCode: z.string().optional(),
    cidbGrade: z.string().optional(),
    documentUrls: z.array(z.object({
      documentType: z.string(),
      documentName: z.string(),
      documentUrl: z.string(),
    })).optional(),
  }))
  .mutation(async ({ input }) => {
    const user = await requireAuthenticatedUser(input.authToken, ["CONTRACTOR"]);
    const existing = await db.contractorProfile.findUnique({ where: { userId: user.id } });
    if (existing) {
      throw new TRPCError({ code: "CONFLICT", message: "Profile already exists. Use the update endpoint instead." });
    }
    const { authToken, documentUrls, ...profileData } = input;
    return db.contractorProfile.create({
      data: {
        ...profileData,
        userId: user.id,
        profileStatus: "PENDING",
        documents: documentUrls?.length ? {
          create: documentUrls.map(d => ({
            documentType: d.documentType,
            documentName: d.documentName,
            documentUrl: d.documentUrl,
          })),
        } : undefined,
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        documents: true,
      },
    });
  });

export const uploadContractorDocument = baseProcedure
  .input(z.object({
    authToken: z.string(),
    documentType: z.string(),
    documentName: z.string(),
    documentUrl: z.string(),
  }))
  .mutation(async ({ input }) => {
    const user = await requireAuthenticatedUser(input.authToken, ["CONTRACTOR"]);
    const profile = await db.contractorProfile.findUnique({ where: { userId: user.id } });
    if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Contractor profile not found" });
    return db.contractorDocument.create({
      data: {
        contractorProfileId: profile.id,
        documentType: input.documentType,
        documentName: input.documentName,
        documentUrl: input.documentUrl,
      },
    });
  });

export const deleteContractorDocument = baseProcedure
  .input(z.object({
    authToken: z.string(),
    documentId: z.number(),
  }))
  .mutation(async ({ input }) => {
    const user = await requireAuthenticatedUser(input.authToken, ["CONTRACTOR"]);
    const profile = await db.contractorProfile.findUnique({ where: { userId: user.id } });
    if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "Contractor profile not found" });
    const doc = await db.contractorDocument.findUnique({ where: { id: input.documentId } });
    if (!doc || doc.contractorProfileId !== profile.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Document not found or not yours" });
    }
    return db.contractorDocument.delete({ where: { id: input.documentId } });
  });

// ─── Manager: Approve / Reject Contractor Profiles ──────────────

export const getPendingContractorProfiles = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    await requireAuthenticatedUser(input.authToken, ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"]);
    return db.contractorProfile.findMany({
      where: { profileStatus: "PENDING" },
      include: {
        user: { select: { id: true, name: true, email: true } },
        documents: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });
  });

export const approveContractorProfile = baseProcedure
  .input(z.object({
    authToken: z.string(),
    profileId: z.number(),
  }))
  .mutation(async ({ input }) => {
    await requireAuthenticatedUser(input.authToken, ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"]);
    return db.contractorProfile.update({
      where: { id: input.profileId },
      data: { profileStatus: "APPROVED", isActive: true, rejectionReason: null },
    });
  });

export const rejectContractorProfile = baseProcedure
  .input(z.object({
    authToken: z.string(),
    profileId: z.number(),
    reason: z.string().min(1),
  }))
  .mutation(async ({ input }) => {
    await requireAuthenticatedUser(input.authToken, ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"]);
    return db.contractorProfile.update({
      where: { id: input.profileId },
      data: { profileStatus: "REJECTED", rejectionReason: input.reason, isActive: false },
    });
  });

// ─── Contractor Dashboard Stats ─────────────────────────────────

export const getContractorDashboard = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await requireAuthenticatedUser(input.authToken, ["CONTRACTOR"]);
    const profile = await db.contractorProfile.findUnique({
      where: { userId: user.id },
      include: { documents: { orderBy: { createdAt: "desc" } } },
    });
    if (!profile) return { hasProfile: false as const };

    const [workOrders, openRFQs, allInvoices, recentSubmissions, rfqResponses] = await Promise.all([
      db.workOrder.findMany({
        where: { contractorProfileId: profile.id },
        include: { property: { select: { id: true, title: true, city: true, imageUrl: true } } },
        orderBy: { createdAt: "desc" },
      }),
      db.rFQ.count({ where: { status: "OPEN" } }),
      db.contractorInvoice.findMany({
        where: { contractorProfileId: profile.id },
        include: { workOrder: { select: { title: true, property: { select: { title: true } } } } },
        orderBy: { createdAt: "desc" },
      }),
      db.progressSubmission.findMany({
        where: { submittedById: user.id },
        include: { milestone: { select: { id: true, name: true, propertyId: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      }),
      db.rFQResponse.findMany({
        where: { contractorProfileId: profile.id },
        select: { id: true, status: true, quotedAmount: true, submittedAt: true },
      }),
    ]);

    // Financial calculations from ALL invoices
    const paidInvoices = allInvoices.filter(i => i.status === "PAID");
    const totalEarnings = paidInvoices.reduce((s, i) => s + i.totalAmount, 0);
    const pendingInvoices = allInvoices.filter(i => ["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(i.status));
    const pendingInvoiceAmount = pendingInvoices.reduce((s, i) => s + i.totalAmount, 0);
    const rejectedInvoices = allInvoices.filter(i => i.status === "REJECTED");

    // Total agreed value of all work orders
    const totalWorkValue = workOrders.reduce((s, o) => s + o.agreedAmount, 0);
    const activeWorkValue = workOrders
      .filter(o => ["ACCEPTED", "IN_PROGRESS"].includes(o.status))
      .reduce((s, o) => s + o.agreedAmount, 0);

    // Monthly earnings for the last 6 months
    const now = new Date();
    const monthlyEarnings: { month: string; amount: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
      const monthLabel = d.toLocaleDateString("en-ZA", { month: "short", year: "2-digit" });
      const monthTotal = paidInvoices
        .filter(inv => inv.paidAt && new Date(inv.paidAt) >= d && new Date(inv.paidAt) <= monthEnd)
        .reduce((s, inv) => s + inv.totalAmount, 0);
      monthlyEarnings.push({ month: monthLabel, amount: monthTotal });
    }

    // Unique properties worked on
    const uniqueProperties = [...new Set(workOrders.map(o => o.propertyId))];

    const activeOrders = workOrders.filter(o => ["ISSUED", "ACCEPTED", "IN_PROGRESS"].includes(o.status));

    return {
      hasProfile: true as const,
      profile,
      stats: {
        activeOrders: activeOrders.length,
        totalOrders: workOrders.length,
        openRFQs,
        totalEarnings,
        pendingInvoiceAmount,
        completedOrders: workOrders.filter(o => o.status === "COMPLETED").length,
        cancelledOrders: workOrders.filter(o => o.status === "CANCELLED").length,
        totalWorkValue,
        activeWorkValue,
        totalInvoices: allInvoices.length,
        paidInvoiceCount: paidInvoices.length,
        pendingInvoiceCount: pendingInvoices.length,
        rejectedInvoiceCount: rejectedInvoices.length,
        quotationsSubmitted: rfqResponses.length,
        quotationsAccepted: rfqResponses.filter(r => r.status === "ACCEPTED").length,
        propertiesWorkedOn: uniqueProperties.length,
        progressReportsCount: recentSubmissions.length,
      },
      financials: {
        monthlyEarnings,
        avgInvoiceValue: paidInvoices.length > 0 ? totalEarnings / paidInvoices.length : 0,
        invoiceSuccessRate: allInvoices.length > 0 ? ((paidInvoices.length / allInvoices.length) * 100) : 0,
        winRate: rfqResponses.length > 0 ? ((rfqResponses.filter(r => r.status === "ACCEPTED").length / rfqResponses.length) * 100) : 0,
      },
      workOrders,
      recentInvoices: allInvoices.slice(0, 10),
      recentSubmissions,
    };
  });

// ─── Work Order Progress Updates ────────────────────────────────

export const submitWorkOrderUpdate = baseProcedure
  .input(z.object({
    authToken: z.string(),
    workOrderId: z.number(),
    description: z.string().min(1),
    imageUrls: z.array(z.string()).optional(),
  }))
  .mutation(async ({ input }) => {
    const user = await requireAuthenticatedUser(input.authToken, ["CONTRACTOR"]);
    const wo = await db.workOrder.findUnique({
      where: { id: input.workOrderId },
      include: { contractorProfile: true, property: true },
    });
    if (!wo) throw new TRPCError({ code: "NOT_FOUND", message: "Work order not found" });
    if (wo.contractorProfile.userId !== user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not your work order" });

    const update = await db.workOrderUpdate.create({
      data: {
        workOrderId: input.workOrderId,
        submittedById: user.id,
        description: input.description,
        imageUrls: input.imageUrls ?? [],
      },
      include: { submittedBy: { select: { id: true, name: true } } },
    });

    // Notify the dev manager
    createNotification(
      wo.issuedById,
      "Progress Update",
      `${user.name} posted a progress update on "${wo.title}" for ${wo.property.title}`,
      "INFO",
      "PROPERTY",
      wo.propertyId,
    );

    return { success: true, update };
  });

export const getWorkOrderUpdates = baseProcedure
  .input(z.object({
    authToken: z.string(),
    workOrderId: z.number(),
  }))
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    return db.workOrderUpdate.findMany({
      where: { workOrderId: input.workOrderId },
      include: { submittedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    });
  });

// ─── Work Order Rating ──────────────────────────────────────────

export const rateWorkOrder = baseProcedure
  .input(z.object({
    authToken: z.string(),
    workOrderId: z.number(),
    rating: z.number().int().min(1).max(5),
    notes: z.string().optional(),
  }))
  .mutation(async ({ input }) => {
    const user = await requireAuthenticatedUser(input.authToken, ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"]);
    const wo = await db.workOrder.findUnique({
      where: { id: input.workOrderId },
      include: { contractorProfile: { include: { user: true } } },
    });
    if (!wo) throw new TRPCError({ code: "NOT_FOUND", message: "Work order not found" });
    if (wo.status !== "COMPLETED") throw new TRPCError({ code: "BAD_REQUEST", message: "Can only rate completed work orders" });

    const updated = await db.workOrder.update({
      where: { id: input.workOrderId },
      data: {
        completionRating: input.rating,
        completionNotes: input.notes,
        ratedById: user.id,
        ratedAt: new Date(),
      },
    });

    // Notify the contractor
    createNotification(
      wo.contractorProfile.userId,
      "Work Order Rated",
      `Your work on "${wo.title}" has been rated ${input.rating}/5 by ${user.name}`,
      "INFO",
      "PROPERTY",
      wo.propertyId,
    );

    return updated;
  });
