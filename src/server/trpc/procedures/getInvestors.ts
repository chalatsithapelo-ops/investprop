import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";

export const getInvestors = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
    })
  )
  .query(async ({ input }) => {
    // Verify authentication — investor directory (PII) is manager/admin-only.
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(
      user,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only managers can view the investor directory"
    );

    // Fetch all users with INVESTOR role
    const investors = await db.user.findMany({
      where: {
        role: "INVESTOR",
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return investors;
  });
