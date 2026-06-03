import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";

export const getPendingInvestmentProposals = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number().optional(),
    })
  )
  .query(async ({ input }) => {
    // Verify authentication and ensure user is a development manager
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(
      user,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only development managers can view investment proposals"
    );

    // Build query — dev managers see ALL pending proposals
    const where: any = {
      status: "PENDING",
    };

    if (input.propertyId) {
      where.propertyId = input.propertyId;
    }

    // Fetch pending contributions
    const proposals = await db.investorContribution.findMany({
      where,
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
            fundingGoal: true,
            fundingRaised: true,
            imageUrl: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return proposals;
  });
