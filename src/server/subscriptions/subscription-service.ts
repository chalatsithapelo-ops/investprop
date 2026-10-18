import { TRPCError } from "@trpc/server";
import type { SubscriptionTier, UserRole } from "@prisma/client";
import { db } from "~/server/db";
import {
  getPlan,
  tierHasFeature,
  tiersWithFeature,
  type Feature,
} from "~/server/subscriptions/plans";

// ═══════════════════════════════════════════════════════════════
//  Subscription Service — effective tier resolution + feature gating.
//  Gracefully degrades: if the Subscription table is missing/unreachable,
//  callers fall back to FREE (never throws for infra reasons), and internal
//  staff always bypass the paywall.
// ═══════════════════════════════════════════════════════════════

/** Internal roles that are never paywalled. */
const STAFF_ROLES: UserRole[] = ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"];

export function isStaff(role: UserRole): boolean {
  return STAFF_ROLES.includes(role);
}

export type EffectiveSubscription = {
  tier: SubscriptionTier;
  status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED" | "EXPIRED" | "NONE";
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  billingCycle: "MONTHLY" | "ANNUAL";
  priceAmount: number;
  /** True while the subscription still grants its tier's capabilities. */
  active: boolean;
};

const FREE_SUBSCRIPTION: EffectiveSubscription = {
  tier: "FREE",
  status: "NONE",
  trialEndsAt: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  billingCycle: "MONTHLY",
  priceAmount: 0,
  active: true,
};

/**
 * Resolve a user's effective subscription. Expired trials and lapsed periods
 * collapse to FREE access (tier retained for display, but `active` reflects
 * entitlement). Returns FREE if no row or on any DB error.
 */
export async function getEffectiveSubscription(userId: number): Promise<EffectiveSubscription> {
  try {
    const sub = await db.subscription.findUnique({ where: { userId } });
    if (!sub) return { ...FREE_SUBSCRIPTION };

    const now = new Date();

    // Trial expiry → drop entitlement to FREE.
    if (sub.status === "TRIALING" && sub.trialEndsAt && sub.trialEndsAt.getTime() < now.getTime()) {
      return {
        tier: "FREE",
        status: "EXPIRED",
        trialEndsAt: sub.trialEndsAt,
        currentPeriodEnd: sub.currentPeriodEnd,
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        billingCycle: sub.billingCycle,
        priceAmount: sub.priceAmount,
        active: false,
      };
    }

    // Lapsed paid period → no entitlement.
    const periodLapsed =
      !!sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() < now.getTime();
    const entitled =
      (sub.status === "ACTIVE" || sub.status === "TRIALING") && !periodLapsed;

    return {
      tier: entitled ? sub.tier : "FREE",
      status: entitled ? sub.status : sub.status === "TRIALING" ? "EXPIRED" : "PAST_DUE",
      trialEndsAt: sub.trialEndsAt,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      billingCycle: sub.billingCycle,
      priceAmount: sub.priceAmount,
      active: entitled,
    };
  } catch {
    // Never break money/feature flow on a subscription infra hiccup.
    return { ...FREE_SUBSCRIPTION };
  }
}

/** Does this user (role + subscription) currently have access to a feature? */
export async function userHasFeature(
  userId: number,
  role: UserRole,
  feature: Feature,
): Promise<boolean> {
  if (isStaff(role)) return true;
  const sub = await getEffectiveSubscription(userId);
  if (!sub.active) return false;
  return tierHasFeature(sub.tier, feature);
}

/**
 * Throw a FORBIDDEN TRPCError (with an upgrade hint) unless the user may use
 * the feature. Staff bypass. Use inside premium procedures.
 */
export async function requireFeature(
  user: { id: number; role: UserRole },
  feature: Feature,
): Promise<void> {
  const ok = await userHasFeature(user.id, user.role, feature);
  if (ok) return;

  const upgradeTiers = tiersWithFeature(feature);
  const cheapest = upgradeTiers[0];
  const planName = cheapest ? getPlan(cheapest).name : "a paid plan";
  throw new TRPCError({
    code: "FORBIDDEN",
    message: `This feature requires the ${planName} plan or higher. Upgrade on the Pricing page to unlock it.`,
  });
}
