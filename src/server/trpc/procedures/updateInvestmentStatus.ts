import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { requireAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { notifyMatchingInvestors } from "~/server/utils/investor-notifications";
import { createNotification } from "./notifications";

export const updateInvestmentStatus = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      newStatus: z.enum(["PLANNING", "RAISING_FUNDS", "FUNDED", "PROJECT_STARTED", "COMPLETED"]),
    })
  )
  .mutation(async ({ input }) => {
    // Verify authentication and authorization
    await requireAuthenticatedUser(
      input.authToken,
      ["DEVELOPMENT_MANAGER"],
      "Only development managers can update investment status"
    );

    // Check if property exists
    const property = await db.property.findUnique({
      where: { id: input.propertyId },
      select: { id: true, investmentStatus: true },
    });

    if (!property) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Property not found",
      });
    }

    // Update the investment status
    const updatedProperty = await db.property.update({
      where: { id: input.propertyId },
      data: { investmentStatus: input.newStatus },
      include: {
        propertyFlip: true,
        rentalBond: true,
        propertyDevelopment: true,
      },
    });

    // Notify property investors about the status change
    const propertyInvestors = await db.investorContribution.findMany({
      where: { propertyId: input.propertyId },
      select: { investorId: true },
      distinct: ["investorId"],
    });
    const statusLabels: Record<string, string> = {
      PLANNING: "Planning",
      RAISING_FUNDS: "Raising Funds",
      FUNDED: "Fully Funded",
      PROJECT_STARTED: "Project Started",
      COMPLETED: "Completed",
    };
    for (const inv of propertyInvestors) {
      createNotification(
        inv.investorId,
        "Investment Status Update",
        `"${updatedProperty.title}" status changed to ${statusLabels[input.newStatus] ?? input.newStatus}`,
        input.newStatus === "COMPLETED" ? "SUCCESS" : "INFO",
        "INVESTMENT",
        input.propertyId
      );
    }

    // Send notifications to matching investors if status changed to RAISING_FUNDS
    if (
      input.newStatus === "RAISING_FUNDS" &&
      property.investmentStatus !== "RAISING_FUNDS"
    ) {
      // Determine property type
      let propertyType: "flip" | "rental" | "development";
      let developmentType: "AFFORDABLE_RESALE" | "AFFORDABLE_RENTAL" | "COMMERCIAL_RENTAL" | undefined;

      if (updatedProperty.propertyFlip) {
        propertyType = "flip";
      } else if (updatedProperty.rentalBond) {
        propertyType = "rental";
      } else if (updatedProperty.propertyDevelopment) {
        propertyType = "development";
        developmentType = updatedProperty.propertyDevelopment.developmentType;
      } else {
        // If we can't determine the type, skip notifications
        console.warn(`Cannot determine property type for property ${input.propertyId}`);
        return { success: true, property: updatedProperty };
      }

      // Notify matching investors (non-blocking)
      notifyMatchingInvestors({
        propertyId: updatedProperty.id,
        title: updatedProperty.title,
        propertyType,
        developmentType,
        price: updatedProperty.price,
        address: updatedProperty.address,
        city: updatedProperty.city,
        state: updatedProperty.state,
        investmentStatus: updatedProperty.investmentStatus,
      }).catch((error) => {
        console.error("Error notifying investors:", error);
      });
    }

    return { success: true, property: updatedProperty };
  });
