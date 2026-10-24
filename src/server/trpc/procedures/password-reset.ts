import { TRPCError } from "@trpc/server";
import { z } from "zod";
import crypto from "crypto";
import bcryptjs from "bcryptjs";
import { db } from "~/server/db";
import { publicProcedure } from "../main";
import { sendEmail } from "~/server/utils/email";
import { emailTemplates } from "~/server/utils/email-templates";
import { userPasswordSchema } from "~/server/utils/validation-schemas";
import { checkRateLimit, RATE_LIMITS } from "~/server/utils/rate-limiter";

export const requestPasswordReset = publicProcedure
  .input(z.object({ email: z.string().email() }))
  .mutation(async ({ input }) => {
    const rl = checkRateLimit(`password-reset:${input.email.toLowerCase()}`, RATE_LIMITS.PASSWORD_RESET);
    if (!rl.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Too many password reset requests. Try again in ${Math.ceil((rl.retryAfter || 0) / 60)} minutes.`,
      });
    }

    const user = await db.user.findUnique({
      where: { email: input.email },
    });

    // Don't reveal if user exists for security
    if (!user) {
      return { success: true, message: "If the email exists, a reset link has been sent" };
    }

    // Generate reset token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store token in database
    await db.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    // Send reset email
    const resetUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/reset-password?token=${token}`;
    const emailContent = emailTemplates.passwordReset(resetUrl, user.name);

    await sendEmail(
      { email: user.email, name: user.name },
      emailContent.subject,
      emailContent.html,
      emailContent.text
    ).catch((error) => {
      console.error("Failed to send password reset email:", error);
    });

    return { success: true, message: "Password reset email sent" };
  });

export const resetPassword = publicProcedure
  .input(
    z.object({
      token: z.string(),
      newPassword: userPasswordSchema,
    })
  )
  .mutation(async ({ input }) => {
    const rl = checkRateLimit(`password-reset-confirm:${input.token.slice(0, 16)}`, RATE_LIMITS.PASSWORD_RESET);
    if (!rl.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Too many attempts. Try again in ${Math.ceil((rl.retryAfter || 0) / 60)} minutes.`,
      });
    }

    const resetToken = await db.passwordResetToken.findUnique({
      where: { token: input.token },
      include: { user: true },
    });

    if (!resetToken) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Invalid reset token",
      });
    }

    if (resetToken.used) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Reset token has already been used",
      });
    }

    if (resetToken.expiresAt < new Date()) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Reset token has expired",
      });
    }

    // Hash new password
    const hashedPassword = await bcryptjs.hash(input.newPassword, 12);

    // Update password and mark token as used, revoke all refresh tokens
    await db.$transaction([
      db.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword },
      }),
      db.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      }),
      // Revoke all refresh tokens for security
      db.refreshToken.updateMany({
        where: { userId: resetToken.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return {
      success: true,
      message: "Password reset successfully",
    };
  });

export const validateResetToken = publicProcedure
  .input(z.object({ token: z.string() }))
  .query(async ({ input }) => {
    const resetToken = await db.passwordResetToken.findUnique({
      where: { token: input.token },
    });

    if (!resetToken || resetToken.used || resetToken.expiresAt < new Date()) {
      return { valid: false };
    }

    return { valid: true };
  });
