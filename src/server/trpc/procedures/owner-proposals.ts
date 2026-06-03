import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";
import { createNotification } from "./notifications";

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
      contactPhone: z.string().optional(),
      contactEmail: z.string().email().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["PROPERTY_OWNER"], "Only property owners can submit sale proposals");

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
