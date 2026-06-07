import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { sendProgressSubmissionNotification } from "~/server/utils/investor-notifications";
import { createNotification } from "./notifications";

export const createProgressSubmission = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      milestoneId: z.number(),
      description: z.string().min(1),
      imageUrls: z.array(z.string()).optional(),
    })
  )
  .mutation(async ({ input }) => {
    // Verify authentication token
    const user = await getAuthenticatedUser(input.authToken);

    // Verify milestone exists and get property info
    const milestone = await db.milestone.findUnique({
      where: { id: input.milestoneId },
      include: {
        property: {
          include: {
            investorContributions: {
              include: {
                investor: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!milestone) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Milestone not found",
      });
    }

    // Create progress submission
    const submission = await db.progressSubmission.create({
      data: {
        milestoneId: input.milestoneId,
        submittedById: user.id,
        description: input.description,
        imageUrls: input.imageUrls ?? [],
        updatedAt: new Date(),
      },
    });

    // Send in-app notifications to investors
    const uniqueInvestorIds = [...new Set(milestone.property.investorContributions.map((c) => c.investor.id))];
    for (const investorId of uniqueInvestorIds) {
      createNotification(
        investorId,
        "Progress Update",
        `New progress submitted for milestone "${milestone.name}" on "${milestone.property.title}" by ${user.name}`,
        "INFO",
        "MILESTONE",
        milestone.propertyId
      );
    }

    // Notify investors about the progress update via email (non-blocking)
    const notificationPromises = milestone.property.investorContributions.map(
      (contribution) =>
        sendProgressSubmissionNotification(
          {
            email: contribution.investor.email,
            name: contribution.investor.name,
          },
          {
            propertyTitle: milestone.property.title,
            milestoneName: milestone.name,
            submitterName: user.name,
            propertyId: milestone.propertyId,
            milestoneId: milestone.id,
          }
        ).catch((error) => {
          console.error(
            `Failed to send progress notification to ${contribution.investor.email}:`,
            error
          );
        })
    );

    // Send notifications in background
    Promise.all(notificationPromises).catch((error) => {
      console.error("Error sending progress notifications:", error);
    });

    return {
      success: true,
      submission,
    };
  });
