import { z } from "zod";
import type { UserRole } from "@prisma/client";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";
import { buildAnnouncementEmail, sendBatchEmails } from "~/server/utils/email";

/**
 * Map a target audience to the set of user roles that should receive the announcement.
 */
const AUDIENCE_ROLES: Record<string, UserRole[]> = {
  ALL: [
    "INVESTOR",
    "PROPERTY_OWNER",
    "DEVELOPMENT_MANAGER",
    "PROJECT_MANAGER",
    "CONTRACTOR",
  ],
  INVESTORS: ["INVESTOR"],
  PROPERTY_OWNERS: ["PROPERTY_OWNER"],
  INVESTORS_AND_OWNERS: ["INVESTOR", "PROPERTY_OWNER"],
  DEVELOPMENT_TEAM: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "CONTRACTOR"],
};

/**
 * Allows an admin or development manager to broadcast an announcement to a
 * target audience via BOTH in-app notifications and (optionally) email.
 */
export const broadcastAnnouncement = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      title: z.string().min(3, "Title must be at least 3 characters").max(150),
      message: z.string().min(10, "Message must be at least 10 characters").max(5000),
      audience: z.enum([
        "ALL",
        "INVESTORS",
        "PROPERTY_OWNERS",
        "INVESTORS_AND_OWNERS",
        "DEVELOPMENT_TEAM",
      ]),
      sendEmail: z.boolean().default(true),
    })
  )
  .mutation(async ({ input }) => {
    // Only admins and development managers may broadcast announcements.
    const sender = await getAuthenticatedUser(input.authToken);
    requireRole(
      sender,
      ["ADMIN", "DEVELOPMENT_MANAGER"],
      "Only admins and development managers can send announcements"
    );

    const roles = AUDIENCE_ROLES[input.audience] ?? [];

    // Resolve recipients (exclude the sender so they don't notify themselves).
    const recipients = await db.user.findMany({
      where: {
        role: { in: roles },
        id: { not: sender.id },
      },
      select: { id: true, name: true, email: true },
    });

    if (recipients.length === 0) {
      return { recipientCount: 0, emailsSent: 0 };
    }

    // 1) In-app notifications (bulk insert).
    await db.notification.createMany({
      data: recipients.map((r) => ({
        userId: r.id,
        title: input.title,
        message: input.message,
        type: "INFO",
        category: "SYSTEM",
        relatedId: null,
      })),
    });

    // 2) Email broadcast (optional, sent via Resend's batch endpoint to respect rate limits).
    let emailsSent = 0;
    if (input.sendEmail) {
      emailsSent = await sendBatchEmails(
        recipients.map((r) => {
          const { subject, htmlContent, textContent } = buildAnnouncementEmail(
            { email: r.email, name: r.name },
            {
              title: input.title,
              message: input.message,
              senderName: sender.name,
            }
          );
          return {
            to: { email: r.email, name: r.name },
            subject,
            htmlContent,
            textContent,
          };
        })
      );
    }

    return {
      recipientCount: recipients.length,
      emailsSent,
    };
  });
