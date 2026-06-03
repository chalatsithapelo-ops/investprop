import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { requireAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { createNotification } from "./notifications";

export const createMilestone = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      name: z.string().min(1),
      description: z.string().min(1),
      estimatedStartDate: z.string(), // ISO date string
      estimatedCompletionDate: z.string(), // ISO date string
      budgetAllocated: z.number().min(0).default(0),
      order: z.number().int().min(0).default(0),
    })
  )
  .mutation(async ({ input }) => {
    // Verify authentication and authorization
    const user = await requireAuthenticatedUser(
      input.authToken,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "PROPERTY_OWNER", "CONTRACTOR"],
      "Only managers, property owners and contractors can create milestones"
    );

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

    // Create milestone
    const milestone = await db.milestone.create({
      data: {
        propertyId: input.propertyId,
        name: input.name,
        description: input.description,
        estimatedStartDate: new Date(input.estimatedStartDate),
        estimatedCompletionDate: new Date(input.estimatedCompletionDate),
        budgetAllocated: input.budgetAllocated,
        order: input.order,
        updatedAt: new Date(),
      },
    });

    // Notify property investors about the new milestone
    const propertyInvestors = await db.investorContribution.findMany({
      where: { propertyId: input.propertyId },
      select: { investorId: true },
      distinct: ["investorId"],
    });
    for (const inv of propertyInvestors) {
      createNotification(
        inv.investorId,
        "New Milestone Created",
        `A new milestone "${input.name}" has been added to "${property.title}"`,
        "INFO",
        "MILESTONE",
        input.propertyId
      );
    }

    return {
      success: true,
      milestone,
    };
  });
