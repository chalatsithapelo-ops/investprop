import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { requireAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { sendReturnDistributionNotification } from "~/server/utils/email";
import { createNotification } from "./notifications";

export const distributeReturns = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      notes: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    // Verify authentication and authorization
    await requireAuthenticatedUser(
      input.authToken,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only development managers and project managers can distribute returns"
    );

    // Verify property exists
    const property = await db.property.findUnique({
      where: { id: input.propertyId },
      select: { id: true, title: true },
    });

    if (!property) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Property not found",
      });
    }

    // Fetch all investor contributions for this property
    const investorContributions = await db.investorContribution.findMany({
      where: { propertyId: input.propertyId },
      include: {
        investor: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (investorContributions.length === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No investor contributions found for this property",
      });
    }

    // Send return distribution notifications to all investors
    const emailPromises = investorContributions.map((contribution) =>
      sendReturnDistributionNotification(
        {
          email: contribution.investor.email,
          name: contribution.investor.name,
        },
        {
          propertyTitle: property.title,
          propertyId: input.propertyId,
          returnAmount: contribution.expectedReturnAmount,
          contributionAmount: contribution.contributionAmount,
          returnRate: contribution.expectedReturnRate,
        }
      ).catch((error) => {
        console.error(`Failed to send return distribution notification to ${contribution.investor.email}:`, error);
      })
    );

    // Wait for all emails to be sent
    await Promise.all(emailPromises);

    // Send in-app notifications to each investor
    for (const contribution of investorContributions) {
      createNotification(
        contribution.investorId,
        "Returns Distributed",
        `R${contribution.expectedReturnAmount.toLocaleString("en-ZA")} has been distributed from "${property.title}" (${contribution.expectedReturnRate}% return on your R${contribution.contributionAmount.toLocaleString("en-ZA")} contribution)`,
        "SUCCESS",
        "INVESTMENT",
        property.id
      );
    }

    // Calculate totals for the response
    const totalDistributed = investorContributions.reduce(
      (sum, c) => sum + c.expectedReturnAmount,
      0
    );
    const totalInvestors = investorContributions.length;

    return {
      success: true,
      totalInvestors,
      totalDistributed,
      distributions: investorContributions.map((c) => ({
        investorId: c.investorId,
        investorName: c.investor.name,
        contributionAmount: c.contributionAmount,
        returnAmount: c.expectedReturnAmount,
        returnRate: c.expectedReturnRate,
      })),
    };
  });
