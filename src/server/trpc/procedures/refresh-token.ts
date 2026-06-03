import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "~/server/db";
import { verifyRefreshToken, generateAccessToken, generateRefreshToken } from "~/server/utils/tokens";
import { publicProcedure } from "../main";

export const refreshTokenProcedure = publicProcedure
  .input(
    z.object({
      refreshToken: z.string().min(1, "Refresh token is required"),
    })
  )
  .mutation(async ({ input }) => {
    const { refreshToken: token } = input;

    // Verify the refresh token
    const decoded = verifyRefreshToken(token);

    if (!decoded) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid or expired refresh token",
      });
    }

    // Check if the token exists in the database and is not revoked
    const storedToken = await db.refreshToken.findFirst({
      where: {
        token,
        userId: decoded.userId,
        revokedAt: null,
      },
    });

    if (!storedToken) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Refresh token has been revoked or does not exist",
      });
    }

    // Check if token has expired
    if (storedToken.expiresAt < new Date()) {
      // Delete expired token
      await db.refreshToken.delete({
        where: { id: storedToken.id },
      });

      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Refresh token has expired",
      });
    }

    // Get user to generate new tokens
    const user = await db.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        tokenVersion: true,
        suspendedReason: true,
      },
    });

    if (!user) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "User not found",
      });
    }

    // Token version mismatch → all sessions invalidated (e.g. after suspension or password reset)
    if ((decoded as any).tokenVersion !== undefined && (decoded as any).tokenVersion !== user.tokenVersion) {
      await db.refreshToken.update({ where: { id: storedToken.id }, data: { revokedAt: new Date() } });
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Session has been invalidated. Please log in again." });
    }

    if (user.status === "SUSPENDED") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: user.suspendedReason
          ? `Account suspended: ${user.suspendedReason}`
          : "Your account has been suspended. Please contact support.",
      });
    }
    if (user.status === "PENDING_APPROVAL") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Your account is pending approval by an administrator.",
      });
    }

    // Generate new tokens
    const newAccessToken = generateAccessToken(user.id);
    const newRefreshToken = generateRefreshToken(user.id, user.tokenVersion);

    // Revoke old refresh token (refresh token rotation)
    await db.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    // Store new refresh token in database
    await db.refreshToken.create({
      data: {
        token: newRefreshToken.token,
        userId: user.id,
        expiresAt: newRefreshToken.expiresAt,
      },
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken.token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  });
