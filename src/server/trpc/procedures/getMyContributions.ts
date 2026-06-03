import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";

export const getMyContributions = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
    })
  )
  .query(async ({ input }) => {
    // Verify authentication and get user
    const user = await getAuthenticatedUser(input.authToken);

    // Fetch contributions for this investor across all properties
    const contributions = await db.investorContribution.findMany({
      where: {
        investorId: user.id,
      },
      include: {
        property: {
          select: {
            id: true,
            title: true,
            description: true,
            imageUrl: true,
            city: true,
            state: true,
            status: true,
            investmentStatus: true,
            price: true,
            bedrooms: true,
            bathrooms: true,
            squareMeters: true,
            propertyFlip: true,
            rentalBond: true,
            propertyDevelopment: true,
          },
        },
      },
      orderBy: {
        contributionDate: "desc",
      },
    });

    // Calculate summary statistics
    const totalContributions = contributions.reduce(
      (sum, c) => sum + c.contributionAmount,
      0
    );
    const totalExpectedReturns = contributions.reduce(
      (sum, c) => sum + c.expectedReturnAmount,
      0
    );
    const totalExpectedPayout = totalContributions + totalExpectedReturns;
    const averageReturnRate =
      contributions.length > 0
        ? contributions.reduce((sum, c) => sum + c.expectedReturnRate, 0) /
          contributions.length
        : 0;

    // Count properties by status
    const propertiesByStatus = contributions.reduce(
      (acc, c) => {
        const status = c.property.status;
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Count properties by investment status
    const propertiesByInvestmentStatus = contributions.reduce(
      (acc, c) => {
        const status = c.property.investmentStatus;
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    // Enhance contributions with real-time financial metrics
    const contributionsWithMetrics = contributions.map((contribution) => {
      const property = contribution.property;
      let totalBudget = 0;
      let spentBudget = 0;
      let expectedRevenue = 0;
      let currentROI = 0;
      let propertyType = "";

      if (property.propertyFlip) {
        propertyType = "flip";
        totalBudget = property.propertyFlip.totalInvestmentBudget || 
          (property.propertyFlip.purchasePrice + property.propertyFlip.renovationBudget + 
           property.propertyFlip.holdingCosts + property.propertyFlip.closingCostsPurchase);
        spentBudget = property.propertyFlip.spentInvestmentBudget;
        expectedRevenue = property.propertyFlip.estimatedValue;
        currentROI = property.propertyFlip.expectedROI;
      } else if (property.rentalBond) {
        propertyType = "rental";
        totalBudget = property.rentalBond.totalInvestmentBudget || property.rentalBond.purchasePrice;
        spentBudget = property.rentalBond.spentInvestmentBudget;
        expectedRevenue = property.rentalBond.monthlyRent * 12;
        currentROI = property.rentalBond.capRate;
      } else if (property.propertyDevelopment) {
        propertyType = "development";
        totalBudget = property.propertyDevelopment.totalBudget;
        spentBudget = property.propertyDevelopment.spentBudget;
        
        if (property.propertyDevelopment.developmentType === "AFFORDABLE_RESALE") {
          expectedRevenue = property.propertyDevelopment.totalExpectedRevenue;
        } else {
          expectedRevenue = property.propertyDevelopment.expectedMonthlyRentPerUnit * 
            property.propertyDevelopment.numberOfUnits * 12;
        }
        currentROI = property.propertyDevelopment.expectedROI;
      }

      // Calculate investor-specific metrics
      const investorSharePercentage = totalBudget > 0 
        ? (contribution.contributionAmount / totalBudget) * 100 
        : 0;
      
      const estimatedCurrentValue = spentBudget > 0 && totalBudget > 0
        ? contribution.contributionAmount * (expectedRevenue / totalBudget)
        : contribution.contributionAmount + contribution.expectedReturnAmount;

      return {
        ...contribution,
        propertyType,
        realTimeMetrics: {
          totalBudget,
          spentBudget,
          remainingBudget: totalBudget - spentBudget,
          percentageComplete: totalBudget > 0 ? (spentBudget / totalBudget) * 100 : 0,
          expectedRevenue,
          currentROI,
          investorSharePercentage,
          estimatedCurrentValue,
          unrealizedGain: estimatedCurrentValue - contribution.contributionAmount,
        },
      };
    });

    return {
      contributions: contributionsWithMetrics,
      summary: {
        totalProperties: contributions.length,
        totalContributions,
        totalExpectedReturns,
        totalExpectedPayout,
        averageReturnRate,
        propertiesByStatus,
        propertiesByInvestmentStatus,
      },
    };
  });
