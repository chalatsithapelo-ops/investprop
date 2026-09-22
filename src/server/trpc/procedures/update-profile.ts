import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";

/**
 * Self-service profile update for the authenticated user.
 * Limited to display name and contact phone — email, role and compliance
 * fields are intentionally not editable here.
 */
export const updateProfile = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
      phoneNumber: z.string().trim().max(30).optional(),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    const updated = await db.user.update({
      where: { id: user.id },
      data: {
        name: input.name,
        phoneNumber:
          input.phoneNumber && input.phoneNumber.length > 0
            ? input.phoneNumber
            : null,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        investorCode: true,
        phoneNumber: true,
      },
    });

    return updated;
  });
