import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";

export const getTemplates = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyType: z.enum(["flip", "rental", "development"]).optional(),
    })
  )
  .query(async ({ input }) => {
    // Verify authentication
    const user = await getAuthenticatedUser(input.authToken);

    // Build where clause
    const where: any = {
      userId: user.id,
    };

    // Filter by property type if specified
    if (input.propertyType) {
      where.propertyType = input.propertyType;
    }

    // Fetch templates
    const templates = await db.propertyTemplate.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        name: true,
        propertyType: true,
        configuration: true,
        createdAt: true,
      },
    });

    return {
      templates,
    };
  });
