import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { requireAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { createNotification } from "./notifications";

export const createInvestorContribution = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      investorId: z.number(),
      contributionAmount: z.number().positive(),
      expectedReturnRate: z.number().min(0).max(100),
      notes: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    // Verify authentication and authorization
    try {
      const user = await requireAuthenticatedUser(
        input.authToken,
        ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
        "Only development managers and project managers can record investor contributions"
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

      // Verify investor exists and has INVESTOR role
      const investor = await db.user.findUnique({
        where: { id: input.investorId },
      });

      if (!investor) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Investor not found",
        });
      }

      if (investor.role !== "INVESTOR") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Selected user is not an investor",
        });
      }

      // Calculate expected return amount
      const expectedReturnAmount = input.contributionAmount * (input.expectedReturnRate / 100);

      // Create the contribution (multiple investments per property are allowed)
      const contribution = await db.investorContribution.create({
        data: {
          propertyId: input.propertyId,
          investorId: input.investorId,
          contributionAmount: input.contributionAmount,
          expectedReturnRate: input.expectedReturnRate,
          expectedReturnAmount,
          notes: input.notes,
        },
        include: {
          investor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // Notify the investor about their recorded contribution
      createNotification(
        input.investorId,
        "Contribution Recorded",
        `A contribution of R${input.contributionAmount.toLocaleString("en-ZA")} has been recorded for property "${property.title}"`,
        "SUCCESS",
        "INVESTMENT",
        property.id
      );

      return {
        success: true,
        contribution,
      };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid or expired token",
      });
    }
  });
