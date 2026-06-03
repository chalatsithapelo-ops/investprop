import { z } from "zod";
import { TRPCError } from "@trpc/server";
import bcryptjs from "bcryptjs";
import { db } from "~/server/db";
import { publicProcedure } from "~/server/trpc/main";
import { generateAccessToken, generateRefreshToken } from "~/server/utils/tokens";
import { checkRateLimit, RATE_LIMITS } from "~/server/utils/rate-limiter";

export const login = publicProcedure
  .input(
    z.object({
      email: z.string().email(),
      password: z.string(),
    })
  )
  .mutation(async ({ input }) => {
    // Rate limiting by email
    const rateLimit = checkRateLimit(`login:${input.email}`, RATE_LIMITS.LOGIN);

    if (!rateLimit.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Too many login attempts. Please try again in ${rateLimit.retryAfter} seconds.`,
      });
    }

    // Find user
    const user = await db.user.findUnique({
      where: { email: input.email },
    });

    if (!user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid email or password",
      });
    }

    // Verify password
    const isValidPassword = await bcryptjs.compare(input.password, user.password);

    if (!isValidPassword) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Invalid email or password",
      });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user.id);
    const refreshTokenData = generateRefreshToken(user.id);

    // Store refresh token in database
    await db.refreshToken.create({
      data: {
        token: refreshTokenData.token,
        userId: user.id,
        expiresAt: refreshTokenData.expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenData.token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  });
