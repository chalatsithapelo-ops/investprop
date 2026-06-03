import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { requireAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { createNotification } from "./notifications";

export const reviewProgressSubmission = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      submissionId: z.number(),
      approvalStatus: z.enum(["APPROVED", "REJECTED", "NEEDS_REVISION"]),
      rating: z.number().int().min(1).max(5).optional(),
      reviewNotes: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    // Verify authentication and authorization
    const user = await requireAuthenticatedUser(
      input.authToken,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only managers can review progress submissions"
    );

    // Verify submission exists
    const submission = await db.progressSubmission.findUnique({
      where: { id: input.submissionId },
      include: {
        milestone: true,
      },
    });

    if (!submission) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Progress submission not found",
      });
    }

    // Update submission with review
    const updatedSubmission = await db.progressSubmission.update({
      where: { id: input.submissionId },
      data: {
        approvalStatus: input.approvalStatus,
        rating: input.rating,
        reviewNotes: input.reviewNotes,
        reviewedById: user.id,
        reviewedAt: new Date(),
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
    });

    // Notify the submitter about the review result
    const statusMessages: Record<string, string> = {
      APPROVED: "approved",
      REJECTED: "rejected",
      NEEDS_REVISION: "marked as needing revision",
    };
    createNotification(
      submission.submittedById,
      `Submission ${statusMessages[input.approvalStatus] ?? input.approvalStatus}`,
      `Your progress submission for milestone "${submission.milestone.name}" was ${statusMessages[input.approvalStatus]}${input.reviewNotes ? ` — Note: ${input.reviewNotes}` : ""}`,
      input.approvalStatus === "APPROVED" ? "SUCCESS" : input.approvalStatus === "REJECTED" ? "ERROR" : "WARNING",
      "MILESTONE",
      submission.milestone.propertyId
    );

    // If approved, potentially update milestone status
    if (input.approvalStatus === "APPROVED") {
      // Count approved submissions for this milestone
      const approvedCount = await db.progressSubmission.count({
        where: {
          milestoneId: submission.milestoneId,
          approvalStatus: "APPROVED",
        },
      });

      // If this is the first approved submission and milestone is still PLANNED, mark as IN_PROGRESS
      if (approvedCount === 1 && submission.milestone.status === "PLANNED") {
        await db.milestone.update({
          where: { id: submission.milestoneId },
          data: {
            status: "IN_PROGRESS",
            actualStartDate: new Date(),
          },
        });
      }
    }

    return {
      success: true,
      submission: updatedSubmission,
    };
  });
