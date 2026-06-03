import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { requireAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { createNotification } from "./notifications";

export const deleteInvestorContribution = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      contributionId: z.number(),
    })
  )
  .mutation(async ({ input }) => {
    // Verify authentication and authorization
    await requireAuthenticatedUser(
      input.authToken,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only development managers and project managers can delete investor contributions"
    );

    // Verify contribution exists
    const contribution = await db.investorContribution.findUnique({
      where: { id: input.contributionId },
    });

    if (!contribution) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Contribution not found",
      });
    }

    // Notify the investor about the deletion
    const property = await db.property.findUnique({
      where: { id: contribution.propertyId },
      select: { title: true },
    });
    createNotification(
      contribution.investorId,
      "Contribution Removed",
      `Your contribution of R${contribution.contributionAmount.toLocaleString("en-ZA")} for "${property?.title ?? "a property"}" has been removed by management`,
      "WARNING",
      "INVESTMENT",
      contribution.propertyId
    );

    // Delete the contribution
    await db.investorContribution.delete({
      where: { id: input.contributionId },
    });

    return {
      success: true,
    };
  });
