import { TRPCError } from "@trpc/server";
import type { SubscriptionTier, UserRole } from "@prisma/client";
import { db } from "~/server/db";
import { getEffectiveSubscription, isStaff } from "~/server/subscriptions/subscription-service";

/**
 * Monthly AI Office turn allowance per tier (text + voice combined). Each user
 * question persists one OfficeMessage with role "user", and a voice turn routes
 * through chatOffice so it is counted the same way. Staff always bypass.
 *
 * Caps protect the real per-turn AI cost (OpenRouter text + OpenAI voice) while
 * staying generous enough that normal research use never hits them.
 */
const MONTHLY_QUOTA: Partial<Record<SubscriptionTier, number>> = {
  AI_OFFICE: 100, // standalone AI Property Office
  INVESTOR_PLUS: 100,
  PRO: 300,
  ENTERPRISE: 1000,
};
const DEFAULT_QUOTA = 100;

function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Enforce the caller's monthly AI Office turn cap. Throws TOO_MANY_REQUESTS when
 * the cap is reached. Fails open on any infrastructure error so a transient DB
 * hiccup never blocks a paying user — only a real, counted breach is rejected.
 */
export async function assertOfficeQuota(user: { id: number; role: UserRole }): Promise<void> {
  try {
    if (isStaff(user.role)) return;
    const sub = await getEffectiveSubscription(user.id);
    const quota = MONTHLY_QUOTA[sub.tier] ?? DEFAULT_QUOTA;
    const used = await db.officeMessage.count({
      where: {
        role: "user",
        createdAt: { gte: monthStartUtc(new Date()) },
        conversation: { userId: user.id },
      },
    });
    if (used >= quota) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `You've used all ${quota} of your AI Office questions for this month. Your allowance resets on the 1st — or upgrade your plan for a higher monthly cap.`,
      });
    }
  } catch (err) {
    if (err instanceof TRPCError) throw err; // a real quota breach must propagate
    return; // fail open on infra errors
  }
}
