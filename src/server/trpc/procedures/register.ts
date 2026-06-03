import { z } from "zod";
import { TRPCError } from "@trpc/server";
import bcryptjs from "bcryptjs";
import crypto from "crypto";
import { db } from "~/server/db";
import { publicProcedure } from "~/server/trpc/main";
import { generateAccessToken, generateRefreshToken } from "~/server/utils/tokens";
import { checkRateLimit, RATE_LIMITS } from "~/server/utils/rate-limiter";
import { createAuditLog } from "./audit-log";
import { sendEmail } from "~/server/utils/email";
import { emailTemplates } from "~/server/utils/email-templates";

export const register = publicProcedure
  .input(
    z.object({
      email: z.string().email(),
      password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .regex(/[A-Za-z]/, "Password must contain at least one letter")
        .regex(/[0-9]/, "Password must contain at least one digit"),
      name: z.string().min(1),
      role: z.enum(["INVESTOR", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "PROPERTY_OWNER"]),
    })
  )
  .mutation(async ({ input, ctx }) => {
    // Rate limiting by email
    const rateLimit = checkRateLimit(`register:${input.email}`, RATE_LIMITS.REGISTER);

    if (!rateLimit.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Too many registration attempts. Please try again in ${Math.ceil((rateLimit.retryAfter || 0) / 60)} minutes.`,
      });
    }

    // Check if user already exists
    const existingUser = await db.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "User with this email already exists",
      });
    }

    // Hash password
    const hashedPassword = await bcryptjs.hash(input.password, 10);

    // Non-investor roles require admin approval before they can log in.
    const requiresApproval = input.role !== "INVESTOR";
    const status = requiresApproval ? "PENDING_APPROVAL" : "ACTIVE";

    // Create user
    const user = await db.user.create({
      data: {
        email: input.email,
        password: hashedPassword,
        name: input.name,
        role: input.role,
        status,
        updatedAt: new Date(),
      },
    });

    // Generate unique investor code
    const investorCode = `IP-INV-${user.id.toString().padStart(5, "0")}`;
    await db.user.update({ where: { id: user.id }, data: { investorCode } });

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

    // Create email verification token
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db.emailVerification.create({
      data: {
        token: verificationToken,
        userId: user.id,
        expiresAt: verificationExpiresAt,
      },
    });

    // Send verification email (async, don't block registration)
    const verificationUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/verify-email?token=${verificationToken}`;
    const emailContent = emailTemplates.emailVerification(verificationUrl, user.name);

    sendEmail(
      { email: user.email, name: user.name },
      emailContent.subject,
      emailContent.html,
      emailContent.text,
    ).catch(err => console.error("Failed to send verification email:", err));

    // Create audit log
    await createAuditLog(
      user.id,
      "REGISTER",
      "User",
      user.id,
      { role: user.role }
    );

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
