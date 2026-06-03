import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";

export const getProgressSubmissions = baseProcedure
  .input(
    z.object({
      milestoneId: z.number(),
    })
  )
  .query(async ({ input }) => {
    // Verify milestone exists
    const milestone = await db.milestone.findUnique({
      where: { id: input.milestoneId },
    });

    if (!milestone) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Milestone not found",
      });
    }

    // Get progress submissions
    const submissions = await db.progressSubmission.findMany({
      where: {
        milestoneId: input.milestoneId,
      },
      include: {
        submittedBy: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
      orderBy: {
        submittedAt: "desc",
      },
    });

    return {
      submissions,
    };
  });
