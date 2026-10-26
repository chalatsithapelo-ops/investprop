import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { requireAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { sendMilestoneNotification } from "~/server/utils/email";
import { createNotification } from "./notifications";

export const createBudgetEntry = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      amount: z.number().positive(),
      category: z.string().min(1),
      costCode: z
        .enum([
          "LAND",
          "PROFESSIONAL_FEES",
          "STATUTORY_APPROVALS",
          "BULK_SERVICES",
          "CONSTRUCTION",
          "FINANCE",
          "MARKETING_SALES",
          "CONTINGENCY",
          "OTHER",
        ])
        .optional(),
      entryType: z.enum(["COMMITMENT", "ACTUAL"]).default("ACTUAL"),
      description: z.string().min(1),
      quotationUrl: z.string().optional(),
      milestoneId: z.number().optional(),
      dateRecorded: z.string().optional(), // ISO date string, defaults to now
    })
  )
  .mutation(async ({ input }) => {
    // Authenticate and verify role using helper
    const user = await requireAuthenticatedUser(
      input.authToken,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only development managers and project managers can log budget entries"
    );

    // Verify property exists
    const property = await db.property.findUnique({
      where: { id: input.propertyId },
      include: {
        propertyFlip: true,
        rentalBond: true,
        propertyDevelopment: true,
      },
    });

    if (!property) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Property not found",
      });
    }

    // Maker-checker: a budget posting is created PENDING and has NO effect on
    // spend/commitment until a DIFFERENT manager approves it (segregation of
    // duties). This prevents one person creating and actioning expenditure.
    const budgetEntry = await db.budgetEntry.create({
      data: {
        propertyId: input.propertyId,
        amount: input.amount,
        category: input.category,
        costCode: input.costCode,
        entryType: input.entryType,
        description: input.description,
        quotationUrl: input.quotationUrl,
        milestoneId: input.milestoneId,
        dateRecorded: input.dateRecorded ? new Date(input.dateRecorded) : new Date(),
        recordedById: user.id,
        approvalStatus: "PENDING",
      },
    });

    // Notify the OTHER managers/admins so a second person can approve it.
    const approvers = await db.user.findMany({
      where: {
        role: { in: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "ADMIN"] },
        id: { not: user.id },
      },
      select: { id: true },
    });
    for (const a of approvers) {
      createNotification(
        a.id,
        "Budget entry awaiting approval",
        `${user.name} logged a R${input.amount.toLocaleString("en-ZA")} ${input.entryType.toLowerCase()} on "${property.title}" (${input.category}). Please review and approve.`,
        "INFO",
        "PROPERTY",
        input.propertyId
      );
    }

    return {
      success: true,
      budgetEntry,
      pendingApproval: true,
    };
  });

// ─── Approve a budget entry (second person applies the spend) ────────────────

export const approveBudgetEntry = baseProcedure
  .input(z.object({ authToken: z.string(), budgetEntryId: z.number() }))
  .mutation(async ({ input }) => {
    const user = await requireAuthenticatedUser(
      input.authToken,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "ADMIN"],
      "Only managers can approve budget entries"
    );

    const entry = await db.budgetEntry.findUnique({
      where: { id: input.budgetEntryId },
      include: {
        property: {
          include: { propertyFlip: true, rentalBond: true, propertyDevelopment: true },
        },
      },
    });
    if (!entry) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Budget entry not found" });
    }
    if (entry.approvalStatus !== "PENDING") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Entry already ${entry.approvalStatus.toLowerCase()}`,
      });
    }
    // Segregation of duties — the approver must not be the person who logged it.
    if (entry.recordedById === user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You cannot approve your own budget entry — a second person must approve it.",
      });
    }

    const property = entry.property;
    const isActual = entry.entryType === "ACTUAL";

    const result = await db.$transaction(async (tx) => {
      await tx.budgetEntry.update({
        where: { id: entry.id },
        data: { approvalStatus: "APPROVED", approvedById: user.id, approvedAt: new Date() },
      });

      // Only APPROVED ACTUAL entries move the spent budget. COMMITMENTS are
      // tracked separately and never count as spend.
      let newSpentBudget = 0;
      if (isActual) {
        if (property.propertyFlip) {
          newSpentBudget = property.propertyFlip.spentInvestmentBudget + entry.amount;
          await tx.propertyFlip.update({
            where: { propertyId: property.id },
            data: { spentInvestmentBudget: newSpentBudget },
          });
        } else if (property.rentalBond) {
          newSpentBudget = property.rentalBond.spentInvestmentBudget + entry.amount;
          await tx.rentalBond.update({
            where: { propertyId: property.id },
            data: { spentInvestmentBudget: newSpentBudget },
          });
        } else if (property.propertyDevelopment) {
          newSpentBudget = property.propertyDevelopment.spentBudget + entry.amount;
          await tx.propertyDevelopment.update({
            where: { propertyId: property.id },
            data: { spentBudget: newSpentBudget },
          });
        }
      }

      // Milestone cost tracking (spend/commitment never auto-completes it).
      let milestone = null;
      if (entry.milestoneId) {
        milestone = await tx.milestone.update({
          where: { id: entry.milestoneId },
          data: isActual
            ? { budgetSpent: { increment: entry.amount } }
            : { budgetCommitted: { increment: entry.amount } },
        });
      }

      return { newSpentBudget, milestone };
    });

    // Investor notifications + emails only fire once the spend is real.
    if (isActual) {
      const investorContributions = await db.investorContribution.findMany({
        where: { propertyId: property.id },
        include: { investor: { select: { id: true, name: true, email: true } } },
      });

      if (entry.milestoneId && result.milestone) {
        const emailPromises = investorContributions.map((contribution) =>
          sendMilestoneNotification(
            { email: contribution.investor.email, name: contribution.investor.name },
            {
              propertyTitle: property.title,
              milestone: result.milestone!.name,
              propertyId: property.id,
              amount: entry.amount,
              category: entry.category,
            }
          ).catch((error) => {
            console.error(`Failed to send milestone notification to ${contribution.investor.email}:`, error);
          })
        );
        Promise.all(emailPromises).catch((error) => {
          console.error("Error sending milestone notifications:", error);
        });
      }

      const budgetMsg = entry.milestoneId && result.milestone
        ? `R${entry.amount.toLocaleString("en-ZA")} spent on "${result.milestone.name}" for "${property.title}" (${entry.category})`
        : `R${entry.amount.toLocaleString("en-ZA")} budget entry approved for "${property.title}" (${entry.category})`;
      const seen = new Set<number>();
      for (const c of investorContributions) {
        if (seen.has(c.investorId)) continue;
        seen.add(c.investorId);
        createNotification(c.investorId, "Budget Expenditure", budgetMsg, "INFO", "PROPERTY", property.id);
      }
    }

    createNotification(
      entry.recordedById,
      "Budget entry approved",
      `Your R${entry.amount.toLocaleString("en-ZA")} entry on "${property.title}" was approved by ${user.name}.`,
      "SUCCESS",
      "PROPERTY",
      property.id
    );

    return { success: true, newSpentBudget: result.newSpentBudget, approvalStatus: "APPROVED" as const };
  });

// ─── Reject a budget entry ───────────────────────────────────────────────────

export const rejectBudgetEntry = baseProcedure
  .input(z.object({ authToken: z.string(), budgetEntryId: z.number(), reason: z.string().min(1) }))
  .mutation(async ({ input }) => {
    const user = await requireAuthenticatedUser(
      input.authToken,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "ADMIN"],
      "Only managers can reject budget entries"
    );
    const entry = await db.budgetEntry.findUnique({ where: { id: input.budgetEntryId } });
    if (!entry) throw new TRPCError({ code: "NOT_FOUND", message: "Budget entry not found" });
    if (entry.approvalStatus !== "PENDING") {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Entry already ${entry.approvalStatus.toLowerCase()}` });
    }
    if (entry.recordedById === user.id) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You cannot reject your own budget entry." });
    }
    await db.budgetEntry.update({
      where: { id: entry.id },
      data: {
        approvalStatus: "REJECTED",
        approvedById: user.id,
        approvedAt: new Date(),
        rejectionReason: input.reason,
      },
    });
    createNotification(
      entry.recordedById,
      "Budget entry rejected",
      `Your R${entry.amount.toLocaleString("en-ZA")} entry on property #${entry.propertyId} was rejected: ${input.reason}`,
      "WARNING",
      "PROPERTY",
      entry.propertyId
    );
    return { success: true, approvalStatus: "REJECTED" as const };
  });

