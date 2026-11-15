import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";
import { notifyMatchingInvestors } from "~/server/utils/investor-notifications";

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
      platformCarryPct: z.number().min(0).max(99).optional(),
      fundingBreakdown: z.array(fundingBreakdownItemSchema).min(1, "At least one funding breakdown item is required"),
    })
  )
  .mutation(async ({ input }) => {
    // Verify authentication and ensure user is a manager or the owner
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(
      user,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "PROPERTY_OWNER"],
      "Only managers or property owners can publish properties for funding"
    );

    // Verify property exists and belongs to user
    const property = await db.property.findUnique({
      where: { id: input.propertyId },
      include: {
        spv: { select: { id: true, name: true, status: true } },
        propertyFlip: { select: { id: true } },
        rentalBond: { select: { id: true } },
        propertyDevelopment: { select: { developmentType: true } },
      },
    });

    if (!property) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Property not found",
      });
    }

    // Owners may publish their own property; ADMIN / DEVELOPMENT_MANAGER /
    // PROJECT_MANAGER may publish or republish any property.
    const isManager =
      user.role === "ADMIN" ||
      user.role === "DEVELOPMENT_MANAGER" ||
      user.role === "PROJECT_MANAGER";
    if (property.userId !== user.id && !isManager) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You can only publish your own properties",
      });
    }

    // SPV is OPTIONAL at publish time. A property may raise funds first and be
    // assigned to an SPV later (e.g. once commitments are in / money is raised).
    // Only validate the SPV status when one is already assigned.
    if (property.spvId && property.spv) {
      if (property.spv.status !== "ACTIVE" && property.spv.status !== "REGISTERED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `SPV "${property.spv.name}" must be in ACTIVE or REGISTERED status before publishing. Current status: ${property.spv.status}.`,
        });
      }
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
        ...(input.platformCarryPct !== undefined
          ? { platformCarryPct: input.platformCarryPct }
          : {}),
      },
    });

    // Derive the high-level property type from whichever specialised model exists.
    const derivedPropertyType = property.propertyDevelopment
      ? "development"
      : property.rentalBond
        ? "rental"
        : property.propertyFlip
          ? "flip"
          : "property";

    // Notify investors whose preferences match — sends BOTH in-app and email.
    // Fire-and-forget: notification failures must never block publishing.
    void notifyMatchingInvestors({
      propertyId: updatedProperty.id,
      title: updatedProperty.title,
      propertyType: derivedPropertyType,
      developmentType: property.propertyDevelopment?.developmentType,
      price: updatedProperty.price,
      address: updatedProperty.address,
      city: updatedProperty.city,
      state: updatedProperty.state,
      investmentStatus: updatedProperty.investmentStatus,
    });

    return updatedProperty;
  });
