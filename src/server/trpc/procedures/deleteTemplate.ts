import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";

export const deleteTemplate = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      templateId: z.number(),
    })
  )
  .mutation(async ({ input }) => {
    // Verify authentication
    const user = await getAuthenticatedUser(input.authToken);

    // Check if template exists and belongs to user
    const template = await db.propertyTemplate.findUnique({
      where: {
        id: input.templateId,
      },
    });

    if (!template) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Template not found",
      });
    }

    if (template.userId !== user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You do not have permission to delete this template",
      });
    }

    // Delete the template
    await db.propertyTemplate.delete({
      where: {
        id: input.templateId,
      },
    });

    return {
      success: true,
    };
  });
