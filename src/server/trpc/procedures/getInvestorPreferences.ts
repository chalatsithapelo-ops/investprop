import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";

export const getInvestorPreferences = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    // Authenticate user
    const user = await getAuthenticatedUser(input.authToken);

    // Return preferences (will be null if not set)
    return {
      preferences: user.investorPreferences as any || null,
    };
  });
