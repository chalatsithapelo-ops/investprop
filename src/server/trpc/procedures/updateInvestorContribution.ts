import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { requireAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { createNotification } from "./notifications";

export const updateInvestorContribution = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      contributionId: z.number(),
      contributionAmount: z.number().positive().optional(),
      expectedReturnRate: z.number().min(0).max(100).optional(),
      notes: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    // Verify authentication and authorization
    await requireAuthenticatedUser(
      input.authToken,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only development managers and project managers can update investor contributions"
    );

    // Verify contribution exists
    const existingContribution = await db.investorContribution.findUnique({
      where: { id: input.contributionId },
    });

    if (!existingContribution) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Contribution not found",
      });
    }

    // Prepare update data
    const updateData: any = {};

    if (input.contributionAmount !== undefined) {
      updateData.contributionAmount = input.contributionAmount;
    }

    if (input.expectedReturnRate !== undefined) {
      updateData.expectedReturnRate = input.expectedReturnRate;
    }

    if (input.notes !== undefined) {
      updateData.notes = input.notes;
    }

    // Recalculate expected return amount if either value changed
    const finalAmount = input.contributionAmount ?? existingContribution.contributionAmount;
    const finalRate = input.expectedReturnRate ?? existingContribution.expectedReturnRate;
    updateData.expectedReturnAmount = finalAmount * (finalRate / 100);

    // Update the contribution
    const contribution = await db.investorContribution.update({
      where: { id: input.contributionId },
      data: updateData,
      include: {
        investor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Notify the investor about the update
    const property = await db.property.findUnique({
      where: { id: existingContribution.propertyId },
      select: { title: true },
    });
    createNotification(
      existingContribution.investorId,
      "Contribution Updated",
      `Your contribution for "${property?.title ?? "a property"}" has been updated to R${(input.contributionAmount ?? existingContribution.contributionAmount).toLocaleString("en-ZA")}`,
      "INFO",
      "INVESTMENT",
      existingContribution.propertyId
    );

    return {
      success: true,
      contribution,
    };
  });
