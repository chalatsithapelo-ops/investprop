import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";

export const getMilestones = baseProcedure
  .input(
    z.object({
      propertyId: z.number(),
    })
  )
  .query(async ({ input }) => {
    // Verify property exists
    const property = await db.property.findUnique({
      where: { id: input.propertyId },
    });

    if (!property) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Property not found",
      });
    }

    // Get milestones with progress submissions count
    const milestones = await db.milestone.findMany({
      where: {
        propertyId: input.propertyId,
      },
      include: {
        progressSubmissions: {
          select: {
            id: true,
            approvalStatus: true,
          },
        },
        budgetEntries: {
          select: {
            amount: true,
          },
        },
      },
      orderBy: {
        order: "asc",
      },
    });

    // Calculate statistics for each milestone
    const milestonesWithStats = milestones.map((milestone) => {
      const budgetSpent = milestone.budgetEntries.reduce(
        (sum, entry) => sum + entry.amount,
        0
      );
      const submissionsCount = milestone.progressSubmissions.length;
      const pendingSubmissions = milestone.progressSubmissions.filter(
        (s) => s.approvalStatus === "PENDING"
      ).length;
      const approvedSubmissions = milestone.progressSubmissions.filter(
        (s) => s.approvalStatus === "APPROVED"
      ).length;

      return {
        ...milestone,
        budgetSpent,
        submissionsCount,
        pendingSubmissions,
        approvedSubmissions,
        progressSubmissions: undefined, // Remove detailed submissions from response
        budgetEntries: undefined, // Remove detailed entries from response
      };
    });

    return {
      milestones: milestonesWithStats,
    };
  });
