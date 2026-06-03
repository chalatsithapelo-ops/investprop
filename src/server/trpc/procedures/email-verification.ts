import { TRPCError } from "@trpc/server";
import { z } from "zod";
import crypto from "crypto";
import { db } from "~/server/db";
import { publicProcedure } from "../main";
import { sendEmail } from "~/server/utils/email";
import { emailTemplates } from "~/server/utils/email-templates";

export const sendVerificationEmail = publicProcedure
  .input(z.object({ email: z.string().email() }))
  .mutation(async ({ input }) => {
    const user = await db.user.findUnique({
      where: { email: input.email },
    });

    if (!user) {
      // Don't reveal if user exists for security
      return { success: true, message: "If the email exists, a verification link has been sent" };
    }

    if (user.emailVerified) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Email is already verified",
      });
    }

    // Generate verification token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Store token in database
    await db.emailVerification.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    // Send verification email
    const verificationUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/verify-email?token=${token}`;
    const emailContent = emailTemplates.emailVerification(verificationUrl, user.name);

    await sendEmail(
      { email: user.email, name: user.name },
      emailContent.subject,
      emailContent.html,
      emailContent.text
    ).catch((error) => {
      console.error("Failed to send verification email:", error);
    });

    return { success: true, message: "Verification email sent" };
  });

export const verifyEmail = publicProcedure
  .input(z.object({ token: z.string() }))
  .mutation(async ({ input }) => {
    const verification = await db.emailVerification.findUnique({
      where: { token: input.token },
      include: { user: true },
    });

    if (!verification) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Invalid verification token",
      });
    }

    if (verification.verified) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Email already verified",
      });
    }

    if (verification.expiresAt < new Date()) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Verification token has expired",
      });
    }

    // Mark email as verified
    await db.$transaction([
      db.emailVerification.update({
        where: { id: verification.id },
        data: { verified: true },
      }),
      db.user.update({
        where: { id: verification.userId },
        data: { emailVerified: true },
      }),
    ]);

    return {
      success: true,
      message: "Email verified successfully",
      user: {
        id: verification.user.id,
        email: verification.user.email,
        name: verification.user.name,
      },
    };
  });
