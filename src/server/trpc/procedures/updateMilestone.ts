import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { requireAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { createNotification } from "./notifications";

export const updateMilestone = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      milestoneId: z.number(),
      name: z.string().min(1).optional(),
      description: z.string().min(1).optional(),
      status: z.enum(["PLANNED", "IN_PROGRESS", "COMPLETED", "DELAYED", "CANCELLED"]).optional(),
      estimatedStartDate: z.string().optional(), // ISO date string
      estimatedCompletionDate: z.string().optional(), // ISO date string
      actualStartDate: z.string().optional(), // ISO date string
      actualCompletionDate: z.string().optional(), // ISO date string
      budgetAllocated: z.number().min(0).optional(),
      order: z.number().int().min(0).optional(),
    })
  )
  .mutation(async ({ input }) => {
    // Authenticate and verify role using helper
    await requireAuthenticatedUser(
      input.authToken,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "PROPERTY_OWNER"],
      "Only managers and property owners can update milestones"
    );

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

    // Build update data
    const updateData: any = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.estimatedStartDate !== undefined)
      updateData.estimatedStartDate = new Date(input.estimatedStartDate);
    if (input.estimatedCompletionDate !== undefined)
      updateData.estimatedCompletionDate = new Date(input.estimatedCompletionDate);
    if (input.actualStartDate !== undefined)
      updateData.actualStartDate = new Date(input.actualStartDate);
    if (input.actualCompletionDate !== undefined)
      updateData.actualCompletionDate = new Date(input.actualCompletionDate);
    if (input.budgetAllocated !== undefined)
      updateData.budgetAllocated = input.budgetAllocated;
    if (input.order !== undefined) updateData.order = input.order;

    // Auto-detect delays: if estimated completion date has passed and status is not COMPLETED or CANCELLED
    const estimatedCompletionDate = input.estimatedCompletionDate
      ? new Date(input.estimatedCompletionDate)
      : milestone.estimatedCompletionDate;

    const currentStatus = input.status || milestone.status;
    const now = new Date();

    if (
      estimatedCompletionDate < now &&
      currentStatus !== "COMPLETED" &&
      currentStatus !== "CANCELLED" &&
      currentStatus !== "DELAYED" &&
      !input.status // Only auto-set if status wasn't explicitly provided
    ) {
      updateData.status = "DELAYED";
    }

    // Update milestone
    const updatedMilestone = await db.milestone.update({
      where: { id: input.milestoneId },
      data: updateData,
    });

    // Notify property investors if milestone is COMPLETED or DELAYED
    const finalStatus = updatedMilestone.status;
    if (finalStatus === "COMPLETED" || finalStatus === "DELAYED") {
      const propertyInvestors = await db.investorContribution.findMany({
        where: { propertyId: milestone.propertyId },
        select: { investorId: true },
        distinct: ["investorId"],
      });
      const property = await db.property.findUnique({
        where: { id: milestone.propertyId },
        select: { title: true },
      });

      for (const inv of propertyInvestors) {
        createNotification(
          inv.investorId,
          finalStatus === "COMPLETED" ? "Milestone Completed" : "Milestone Delayed",
          finalStatus === "COMPLETED"
            ? `Milestone "${updatedMilestone.name}" for "${property?.title ?? "Property"}" has been completed`
            : `Milestone "${updatedMilestone.name}" for "${property?.title ?? "Property"}" has been delayed`,
          finalStatus === "COMPLETED" ? "SUCCESS" : "WARNING",
          "MILESTONE",
          milestone.propertyId
        );
      }
    }

    return {
      success: true,
      milestone: updatedMilestone,
      autoDetectedDelay: updateData.status === "DELAYED" && !input.status,
    };
  });
