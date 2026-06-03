import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";

export const getMe = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    // Verify authentication and get user
    const user = await getAuthenticatedUser(input.authToken);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  });
