import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";
import { createNotification } from "./notifications";

/** Grace period in days — investor can edit/cancel within this window */
const EDIT_GRACE_PERIOD_DAYS = 5;

export const updateInvestmentProposal = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      contributionId: z.number(),
      contributionAmount: z.number().positive().optional(),
      notes: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["INVESTOR"], "Only investors can edit their investment proposals");

    // Find the contribution
    const contribution = await db.investorContribution.findUnique({
      where: { id: input.contributionId },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            fundingGoal: true,
            fundingRaised: true,
          },
        },
      },
    });

    if (!contribution) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Investment proposal not found",
      });
    }

    // Ensure investor owns this contribution
    if (contribution.investorId !== user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You can only edit your own investment proposals",
      });
    }

    // Only PENDING proposals can be edited
    if (contribution.status !== "PENDING") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `This investment has already been ${contribution.status.toLowerCase()}. Only pending proposals can be edited.`,
      });
    }

    // Check grace period
    const submittedDate = new Date(contribution.contributionDate);
    const graceDeadline = new Date(submittedDate);
    graceDeadline.setDate(graceDeadline.getDate() + EDIT_GRACE_PERIOD_DAYS);

    if (new Date() > graceDeadline) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `The ${EDIT_GRACE_PERIOD_DAYS}-day edit grace period expired on ${graceDeadline.toLocaleDateString("en-ZA")}. Please contact management to make changes.`,
      });
    }

    // If changing amount, check funding limits
    if (input.contributionAmount !== undefined) {
      const amountDifference = input.contributionAmount - contribution.contributionAmount;
      if (amountDifference > 0) {
        const newTotal = contribution.property.fundingRaised + amountDifference;
        if (newTotal > contribution.property.fundingGoal) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Increased amount exceeds remaining funding needed. Remaining: R${(contribution.property.fundingGoal - contribution.property.fundingRaised).toLocaleString()}`,
          });
        }
      }
    }

    const newAmount = input.contributionAmount ?? contribution.contributionAmount;
    const expectedReturnAmount = newAmount * (contribution.expectedReturnRate / 100);

    const updated = await db.investorContribution.update({
      where: { id: input.contributionId },
      data: {
        ...(input.contributionAmount !== undefined && {
          contributionAmount: input.contributionAmount,
          expectedReturnAmount,
        }),
        ...(input.notes !== undefined && { notes: input.notes }),
      },
      include: {
        property: { select: { title: true } },
        investor: { select: { name: true, email: true } },
      },
    });

    // Notify managers about the edited proposal
    const managers = await db.user.findMany({
      where: { role: { in: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"] } },
      select: { id: true },
    });
    for (const mgr of managers) {
      createNotification(
        mgr.id,
        "Investment Proposal Updated",
        `${user.name} edited their investment in "${updated.property.title}" — new amount: R${(input.contributionAmount ?? contribution.contributionAmount).toLocaleString("en-ZA")}`,
        "INFO",
        "INVESTMENT",
        updated.id
      );
    }

    return {
      success: true,
      contribution: updated,
      graceDeadline: graceDeadline.toISOString(),
    };
  });

/** Cancel an investment proposal within the grace period */
export const cancelInvestmentProposal = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      contributionId: z.number(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["INVESTOR"], "Only investors can cancel their investment proposals");

    const contribution = await db.investorContribution.findUnique({
      where: { id: input.contributionId },
      include: {
        property: { select: { title: true } },
      },
    });

    if (!contribution) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Investment proposal not found",
      });
    }

    if (contribution.investorId !== user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You can only cancel your own investment proposals",
      });
    }

    if (contribution.status !== "PENDING") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `This investment has already been ${contribution.status.toLowerCase()}. Only pending proposals can be cancelled.`,
      });
    }

    // Check grace period
    const submittedDate = new Date(contribution.contributionDate);
    const graceDeadline = new Date(submittedDate);
    graceDeadline.setDate(graceDeadline.getDate() + EDIT_GRACE_PERIOD_DAYS);

    if (new Date() > graceDeadline) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `The ${EDIT_GRACE_PERIOD_DAYS}-day cancellation period has expired. Please contact management.`,
      });
    }

    await db.investorContribution.delete({
      where: { id: input.contributionId },
    });

    // Notify managers about the cancelled proposal
    const managers = await db.user.findMany({
      where: { role: { in: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"] } },
      select: { id: true },
    });
    for (const mgr of managers) {
      createNotification(
        mgr.id,
        "Investment Proposal Cancelled",
        `${user.name} cancelled their investment proposal for "${contribution.property.title}"`,
        "WARNING",
        "INVESTMENT",
        contribution.propertyId
      );
    }

    return {
      success: true,
      message: `Investment proposal for "${contribution.property.title}" has been cancelled.`,
    };
  });

/** Get investor's investments for a specific property */
export const getMyPropertyInvestments = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
    })
  )
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    const investments = await db.investorContribution.findMany({
      where: {
        propertyId: input.propertyId,
        investorId: user.id,
      },
      orderBy: { createdAt: "desc" },
      include: {
        property: {
          select: {
            title: true,
            fundingGoal: true,
            fundingRaised: true,
          },
        },
      },
    });

    // Add grace period info to each investment
    return investments.map((inv) => {
      const submittedDate = new Date(inv.contributionDate);
      const graceDeadline = new Date(submittedDate);
      graceDeadline.setDate(graceDeadline.getDate() + EDIT_GRACE_PERIOD_DAYS);
      const isWithinGracePeriod = new Date() <= graceDeadline && inv.status === "PENDING";
      const graceDaysRemaining = Math.max(
        0,
        Math.ceil((graceDeadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      );

      return {
        ...inv,
        graceDeadline: graceDeadline.toISOString(),
        isWithinGracePeriod,
        graceDaysRemaining,
      };
    });
  });
