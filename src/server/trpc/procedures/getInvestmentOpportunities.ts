import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";

export const getInvestmentOpportunities = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
    })
  )
  .query(async ({ input }) => {
    // Verify authentication
    await getAuthenticatedUser(input.authToken);

    // Fetch properties that are raising funds and published
    const opportunities = await db.property.findMany({
      where: {
        investmentStatus: "RAISING_FUNDS",
        isPublished: true,
      },
      include: {
        propertyFlip: true,
        rentalBond: true,
        propertyDevelopment: true,
        spv: {
          select: {
            id: true,
            name: true,
            registrationNumber: true,
            status: true,
            bankName: true,
            bankAccountNumber: true,
            bankBranchCode: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
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

    // Calculate actual funding raised from PAID contributions only
    return opportunities.map((opp) => {
      const paidRaised = opp.investorContributions
        .filter((c) => c.paymentStatus === "PAID")
        .reduce((sum, c) => sum + c.contributionAmount, 0);

      // Get the correct funding goal from the property sub-type
      const subTypeGoal =
        opp.propertyFlip?.fundingGoal ??
        opp.rentalBond?.fundingGoal ??
        opp.propertyDevelopment?.fundingGoal ??
        0;
      const fundingGoal = subTypeGoal > 0 ? subTypeGoal : opp.fundingGoal;

      // Get expected returns from the property sub-type
      const expectedROI =
        opp.propertyFlip?.expectedROI ??
        opp.rentalBond?.capRate ??
        opp.propertyDevelopment?.expectedROI ??
        0;

      return {
        ...opp,
        // Override with calculated values so frontend shows accurate data
        fundingRaised: paidRaised,
        fundingGoal,
        expectedReturns: expectedROI || opp.expectedReturns || 0,
        // Remove raw contributions from response (not needed by frontend)
        investorContributions: undefined,
      };
    });
  });
