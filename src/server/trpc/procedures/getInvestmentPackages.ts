import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";

export const getInvestmentPackages = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      status: z.enum(["PLANNING", "RAISING_FUNDS", "FUNDED", "PROJECT_STARTED", "COMPLETED"]).optional(),
    })
  )
  .query(async ({ input }) => {
    // Verify authentication
    await getAuthenticatedUser(input.authToken);

    // Build where clause
    const whereClause: any = {};

    // Filter by investment status if provided
    if (input.status) {
      whereClause.investmentStatus = input.status;
    } else {
      // By default, show properties that are not yet completed
      whereClause.investmentStatus = {
        in: ["PLANNING", "RAISING_FUNDS", "FUNDED", "PROJECT_STARTED"],
      };
    }

    // Get properties with their related data
    const properties = await db.property.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        propertyFlip: true,
        rentalBond: true,
        propertyDevelopment: true,
        investorContributions: {
          select: {
            contributionAmount: true,
            paymentStatus: true,
            status: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Calculate investment package metrics for each property
    const packagesWithMetrics = properties.map((property) => {
      let totalBudget = 0;
      let spentBudget = 0;
      let expectedRevenue = 0;
      let expectedROI = 0;
      let propertyType = "";
      let fundingGoal = 0;

      if (property.propertyFlip) {
        propertyType = "flip";
        totalBudget = property.propertyFlip.totalInvestmentBudget ||
          (property.propertyFlip.purchasePrice + property.propertyFlip.renovationBudget +
           property.propertyFlip.holdingCosts + property.propertyFlip.closingCostsPurchase);
        spentBudget = property.propertyFlip.spentInvestmentBudget;
        expectedRevenue = property.propertyFlip.estimatedValue;
        expectedROI = property.propertyFlip.expectedROI;
        fundingGoal = property.propertyFlip.fundingGoal;
      } else if (property.rentalBond) {
        propertyType = "rental";
        totalBudget = property.rentalBond.totalInvestmentBudget || property.rentalBond.purchasePrice;
        spentBudget = property.rentalBond.spentInvestmentBudget;
        expectedRevenue = property.rentalBond.monthlyRent * 12;
        expectedROI = property.rentalBond.capRate;
        fundingGoal = property.rentalBond.fundingGoal;
      } else if (property.propertyDevelopment) {
        propertyType = "development";
        totalBudget = property.propertyDevelopment.totalBudget;
        spentBudget = property.propertyDevelopment.spentBudget;
        fundingGoal = property.propertyDevelopment.fundingGoal;

        if (property.propertyDevelopment.developmentType === "AFFORDABLE_RESALE") {
          expectedRevenue = property.propertyDevelopment.totalExpectedRevenue;
        } else {
          expectedRevenue = property.propertyDevelopment.expectedMonthlyRentPerUnit *
            property.propertyDevelopment.numberOfUnits * 12;
        }
        expectedROI = property.propertyDevelopment.expectedROI;
      }

      // Calculate total raised from investors - only count PAID contributions
      const totalRaised = property.investorContributions
        .filter((c) => c.paymentStatus === "PAID")
        .reduce((sum, contrib) => sum + contrib.contributionAmount, 0);

      // Count pending contributions (approved but not yet paid)
      const totalPending = property.investorContributions
        .filter((c) => c.status === "APPROVED" && c.paymentStatus !== "PAID")
        .reduce((sum, contrib) => sum + contrib.contributionAmount, 0);

      // Total investor count
      const investorCount = property.investorContributions
        .filter((c) => c.paymentStatus === "PAID")
        .length;

      // Always use the calculated PAID-only total — the stored property.fundingRaised
      // may be stale or incorrectly incremented before payment confirmation
      const actualRaised = totalRaised;

      return {
        ...property,
        propertyType,
        // Flatten key metrics to top level for easy frontend access
        currentFunding: actualRaised,
        totalRaised: actualRaised,
        investorCount,
        expectedReturnRate: expectedROI || property.expectedReturns || 0,
        investmentMetrics: {
          totalBudget,
          spentBudget,
          remainingBudget: totalBudget - spentBudget,
          percentageUsed: totalBudget > 0 ? (spentBudget / totalBudget) * 100 : 0,
          expectedRevenue,
          expectedROI,
          fundingGoal,
          totalRaised: actualRaised,
          totalPending,
          fundingRemaining: Math.max(0, (fundingGoal || property.fundingGoal) - actualRaised),
          fundingPercentage: (fundingGoal || property.fundingGoal) > 0
            ? (actualRaised / (fundingGoal || property.fundingGoal)) * 100
            : 0,
        },
      };
    });

    return packagesWithMetrics;
  });
