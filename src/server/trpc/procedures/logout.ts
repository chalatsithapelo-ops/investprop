import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { protectedProcedure } from "../main";

export const logout = protectedProcedure
  .mutation(async ({ ctx }) => {
    if (!ctx.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "You must be logged in to logout",
      });
    }

    // Revoke all active refresh tokens for this user
    await db.refreshToken.updateMany({
      where: {
        userId: ctx.user.id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return {
      success: true,
      message: "Successfully logged out",
    };
  });
