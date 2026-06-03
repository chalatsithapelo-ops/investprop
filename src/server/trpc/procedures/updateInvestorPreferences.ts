import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { requireAuthenticatedUser } from "~/server/trpc/auth-helpers";

export const updateInvestorPreferences = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      preferences: z.object({
        preferredPropertyTypes: z.array(z.string()).optional(),
        minInvestment: z.number().min(0).optional(),
        maxInvestment: z.number().min(0).optional(),
        preferredLocations: z.array(z.string()).optional(),
        riskTolerance: z.string().optional(),
        preferredReturnRate: z.number().min(0).optional(),
        // Legacy fields
        propertyTypes: z.array(z.string()).optional(),
        developmentTypes: z.array(z.string()).optional(),
        minInvestmentAmount: z.number().min(0).optional(),
        maxInvestmentAmount: z.number().min(0).optional(),
        preferredCities: z.array(z.string()).optional(),
        preferredStates: z.array(z.string()).optional(),
        minROI: z.number().min(0).optional(),
        notificationsEnabled: z.boolean().optional(),
      }),
    })
  )
  .mutation(async ({ input }) => {
    // Authenticate user and verify they are an investor
    const user = await requireAuthenticatedUser(
      input.authToken,
      ["INVESTOR"],
      "Only investors can update investment preferences"
    );

    // Update user preferences
    await db.user.update({
      where: { id: user.id },
      data: {
        investorPreferences: input.preferences,
      },
    });

    return {
      success: true,
      preferences: input.preferences,
    };
  });
