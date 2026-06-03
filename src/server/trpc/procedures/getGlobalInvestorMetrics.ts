import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { requireAuthenticatedUser } from "~/server/trpc/auth-helpers";

export const getGlobalInvestorMetrics = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
    })
  )
  .query(async ({ input }) => {
    // Verify authentication and authorization
    await requireAuthenticatedUser(
      input.authToken,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only managers can view global investor metrics"
    );

    // Fetch all contributions across all properties
    const contributions = await db.investorContribution.findMany({
      include: {
        investor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        property: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: {
        contributionDate: "desc",
      },
    });

    // Calculate aggregate metrics
    const totalContributions = contributions.reduce(
      (sum, c) => sum + c.contributionAmount,
      0
    );
    const totalExpectedReturns = contributions.reduce(
      (sum, c) => sum + c.expectedReturnAmount,
      0
    );
    const totalExpectedPayout = totalContributions + totalExpectedReturns;

    // Get unique investor count
    const uniqueInvestorIds = new Set(contributions.map((c) => c.investorId));
    const totalInvestors = uniqueInvestorIds.size;

    // Calculate average return rate
    const averageReturnRate =
      contributions.length > 0
        ? contributions.reduce((sum, c) => sum + c.expectedReturnRate, 0) /
          contributions.length
        : 0;

    // Get top investors by contribution amount
    const investorTotals = new Map<
      number,
      {
        investorId: number;
        investorName: string;
        investorEmail: string;
        totalContribution: number;
        totalExpectedReturn: number;
        contributionCount: number;
      }
    >();

    contributions.forEach((c) => {
      const existing = investorTotals.get(c.investorId);
      if (existing) {
        existing.totalContribution += c.contributionAmount;
        existing.totalExpectedReturn += c.expectedReturnAmount;
        existing.contributionCount += 1;
      } else {
        investorTotals.set(c.investorId, {
          investorId: c.investorId,
          investorName: c.investor.name,
          investorEmail: c.investor.email,
          totalContribution: c.contributionAmount,
          totalExpectedReturn: c.expectedReturnAmount,
          contributionCount: 1,
        });
      }
    });

    const topInvestors = Array.from(investorTotals.values())
      .sort((a, b) => b.totalContribution - a.totalContribution)
      .slice(0, 5);

    // Get properties with most funding
    const propertyTotals = new Map<
      number,
      {
        propertyId: number;
        propertyTitle: string;
        totalContribution: number;
        investorCount: number;
      }
    >();

    contributions.forEach((c) => {
      const existing = propertyTotals.get(c.propertyId);
      if (existing) {
        existing.totalContribution += c.contributionAmount;
        existing.investorCount += 1;
      } else {
        propertyTotals.set(c.propertyId, {
          propertyId: c.propertyId,
          propertyTitle: c.property.title,
          totalContribution: c.contributionAmount,
          investorCount: 1,
        });
      }
    });

    const topProperties = Array.from(propertyTotals.values())
      .sort((a, b) => b.totalContribution - a.totalContribution)
      .slice(0, 5);

    return {
      summary: {
        totalInvestors,
        totalContributions,
        totalExpectedReturns,
        totalExpectedPayout,
        averageReturnRate,
        totalContributionCount: contributions.length,
      },
      topInvestors,
      topProperties,
    };
  });
