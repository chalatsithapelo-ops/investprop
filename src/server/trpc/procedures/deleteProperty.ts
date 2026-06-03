import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { createNotification } from "./notifications";

export const deleteProperty = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
    })
  )
  .mutation(async ({ input }) => {
    // Verify authentication
    const user = await getAuthenticatedUser(input.authToken);

    // Check if property exists and belongs to user
    const property = await db.property.findUnique({
      where: { id: input.propertyId },
      include: {
        propertyFlip: true,
        rentalBond: true,
        propertyDevelopment: true,
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
        message: "You do not have permission to delete this property",
      });
    }

    // Notify investors before deletion
    const propertyInvestors = await db.investorContribution.findMany({
      where: { propertyId: input.propertyId },
      select: { investorId: true },
      distinct: ["investorId"],
    });
    for (const inv of propertyInvestors) {
      createNotification(
        inv.investorId,
        "Property Removed",
        `Property "${property.title}" has been removed from the platform. Please contact management for more details.`,
        "WARNING",
        "PROPERTY",
        null
      );
    }

    // Delete related records and property in a transaction
    await db.$transaction(async (tx) => {
      // Delete related records first (one-to-one relationships)
      if (property.propertyFlip) {
        await tx.propertyFlip.delete({
          where: { propertyId: input.propertyId },
        });
      }
      if (property.rentalBond) {
        await tx.rentalBond.delete({
          where: { propertyId: input.propertyId },
        });
      }
      if (property.propertyDevelopment) {
        await tx.propertyDevelopment.delete({
          where: { propertyId: input.propertyId },
        });
      }

      // Delete the property itself
      await tx.property.delete({
        where: { id: input.propertyId },
      });
    });

    return { success: true };
  });
