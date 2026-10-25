import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";

export const getInvestorContributions = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
    })
  )
  .query(async ({ input }) => {
    // Verify authentication — this exposes co-investor PII, so restrict to managers.
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(
      user,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only managers can view the investor contribution ledger"
    );

    // Fetch contributions for the property
    const contributions = await db.investorContribution.findMany({
      where: {
        propertyId: input.propertyId,
      },
      include: {
        investor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        contributionDate: "desc",
      },
    });

    // Calculate totals
    const totalContributions = contributions.reduce(
      (sum, c) => sum + c.contributionAmount,
      0
    );
    const totalExpectedReturns = contributions.reduce(
      (sum, c) => sum + c.expectedReturnAmount,
      0
    );

    return {
      contributions,
      summary: {
        totalInvestors: contributions.length,
        totalContributions,
        totalExpectedReturns,
        averageReturnRate:
          contributions.length > 0
            ? contributions.reduce((sum, c) => sum + c.expectedReturnRate, 0) /
              contributions.length
            : 0,
      },
    };
  });
