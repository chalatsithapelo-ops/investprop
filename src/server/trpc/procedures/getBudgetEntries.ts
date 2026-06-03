import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";

export const getBudgetEntries = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number().optional(),
      entityType: z.string().optional(),
      entityId: z.number().optional(),
    })
  )
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);

    // Determine which property to fetch budget entries for
    const propId = input.propertyId ?? input.entityId;
    if (!propId) {
      return [];
    }

    const entries = await db.budgetEntry.findMany({
      where: { propertyId: propId },
      include: {
        recordedBy: {
          select: { id: true, name: true, role: true },
        },
        milestone: {
          select: { id: true, name: true },
        },
      },
      orderBy: { dateRecorded: "desc" },
    });

    return entries;
  });
