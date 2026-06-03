import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";
import { createNotification } from "./notifications";

const fundingBreakdownItemSchema = z.object({
  category: z.string().min(1, "Category is required"),
  amount: z.number().positive("Amount must be positive"),
  description: z.string().min(1, "Description is required"),
});

export const publishPropertyForFunding = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      fundingGoal: z.number().positive(),
      fundingClosingDate: z.string(), // ISO date string
      fundingBreakdown: z.array(fundingBreakdownItemSchema).min(1, "At least one funding breakdown item is required"),
    })
  )
  .mutation(async ({ input }) => {
    // Verify authentication and ensure user is a development manager
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(
      user,
      ["DEVELOPMENT_MANAGER", "PROPERTY_OWNER"],
      "Only development managers can publish properties for funding"
    );

    // Verify property exists and belongs to user
    const property = await db.property.findUnique({
      where: { id: input.propertyId },
      include: {
        spv: { select: { id: true, name: true, status: true } },
      },
    });

    if (!property) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Property not found",
      });
    }

    if (property.userId !== user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You can only publish your own properties",
      });
    }

    // Require SPV assignment before publishing for investment
    if (!property.spvId || !property.spv) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Property must be assigned to an SPV before it can be published for funding. Go to SPV Management to assign this property to an SPV.",
      });
    }

    if (property.spv.status !== "ACTIVE" && property.spv.status !== "REGISTERED") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `SPV "${property.spv.name}" must be in ACTIVE or REGISTERED status before publishing. Current status: ${property.spv.status}.`,
      });
    }

    // Validate that funding breakdown amounts sum to funding goal
    const totalBreakdown = input.fundingBreakdown.reduce((sum, item) => sum + item.amount, 0);
    if (Math.abs(totalBreakdown - input.fundingGoal) > 0.01) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Funding breakdown total (${totalBreakdown}) must equal funding goal (${input.fundingGoal})`,
      });
    }

    // Validate closing date is in the future
    const closingDate = new Date(input.fundingClosingDate);
    if (closingDate <= new Date()) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Funding closing date must be in the future",
      });
    }

    // Update property to RAISING_FUNDS status and set funding details
    const updatedProperty = await db.property.update({
      where: { id: input.propertyId },
      data: {
        investmentStatus: "RAISING_FUNDS",
        isPublished: true,
        fundingGoal: input.fundingGoal,
        fundingClosingDate: closingDate,
        fundingBreakdown: input.fundingBreakdown,
      },
    });

    // Notify all investors about the new funding opportunity
    const investors = await db.user.findMany({
      where: { role: "INVESTOR" },
      select: { id: true },
    });
    for (const inv of investors) {
      createNotification(
        inv.id,
        "New Investment Opportunity",
        `"${updatedProperty.title}" is now open for funding — goal: R${input.fundingGoal.toLocaleString("en-ZA")}. Closing: ${closingDate.toLocaleDateString("en-ZA")}`,
        "INFO",
        "PROPERTY",
        updatedProperty.id
      );
    }

    return updatedProperty;
  });
