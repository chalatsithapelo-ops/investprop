import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { env } from "~/server/env";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { createAuditLog } from "~/server/trpc/procedures/audit-log";
import {
  ALL_TIERS,
  PLAN_CATALOG,
  getPlan,
  getPrice,
  type PlanDefinition,
} from "~/server/subscriptions/plans";
import { getEffectiveSubscription, isStaff } from "~/server/subscriptions/subscription-service";
import { activatePaidSubscription } from "~/server/subscriptions/activate";
import type { SubscriptionTier } from "@prisma/client";

// ═══════════════════════════════════════════════════════════════
//  Phase 2 — SaaS Subscriptions (Paystack recurring billing)
//  Gracefully degrades when Paystack/DB config is absent.
// ═══════════════════════════════════════════════════════════════

const PAYSTACK_BASE = "https://api.paystack.co";
const TRIAL_DAYS = 14;

/** Tiers a self-serve user may subscribe to (FREE is implicit). */
const SELF_SERVE_TIERS: SubscriptionTier[] = [
  "INVESTOR_PLUS",
  "PRO",
  "ENTERPRISE",
  "DISTRESSED",
];
const tierEnum = z.enum(["INVESTOR_PLUS", "PRO", "ENTERPRISE", "DISTRESSED"]);
const cycleEnum = z.enum(["MONTHLY", "ANNUAL"]);

async function paystackRequest(path: string, method: string, body?: any) {
  if (!env.PAYSTACK_SECRET_KEY) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Payment gateway not configured. Set PAYSTACK_SECRET_KEY in environment.",
    });
  }
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!data.status) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: data.message ?? "Payment gateway error",
    });
  }
  return data;
}

/** Merge code catalog with admin DB price overrides. */
async function resolvePlans(): Promise<
  (PlanDefinition & {
    paystackPlanCodeMonthly?: string | null;
    paystackPlanCodeAnnual?: string | null;
  })[]
> {
  let overrides: Record<string, any> = {};
  try {
    const rows = await db.subscriptionPlan.findMany();
    overrides = Object.fromEntries(rows.map((r) => [r.tier, r]));
  } catch {
    overrides = {};
  }
  return ALL_TIERS.map((tier) => {
    const base = PLAN_CATALOG[tier];
    const ov = overrides[tier];
    return {
      ...base,
      name: ov?.name ?? base.name,
      description: ov?.description ?? base.description,
      monthlyPrice: ov?.monthlyPrice ?? base.monthlyPrice,
      annualPrice: ov?.annualPrice ?? base.annualPrice,
      features: ov?.features ?? base.features,
      active: ov?.active ?? true,
      paystackPlanCodeMonthly: ov?.paystackPlanCodeMonthly ?? null,
      paystackPlanCodeAnnual: ov?.paystackPlanCodeAnnual ?? null,
    };
  });
}

// ─── Public: list plans ────────────────────────────────────────
export const getSubscriptionPlans = baseProcedure.query(async () => {
  const plans = await resolvePlans();
  return plans.map((p) => ({
    tier: p.tier,
    name: p.name,
    tagline: p.tagline,
    description: p.description,
    monthlyPrice: p.monthlyPrice,
    annualPrice: p.annualPrice,
    features: p.features,
    capabilities: p.capabilities,
    rank: p.rank,
    highlighted: p.highlighted ?? false,
    standalone: p.standalone ?? false,
  }));
});

// ─── My subscription ───────────────────────────────────────────
export const getMySubscription = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const sub = await getEffectiveSubscription(user.id);
    const plan = getPlan(sub.tier);
    return {
      tier: sub.tier,
      status: sub.status,
      active: sub.active,
      billingCycle: sub.billingCycle,
      priceAmount: sub.priceAmount,
      trialEndsAt: sub.trialEndsAt,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      staffBypass: isStaff(user.role),
      planName: plan.name,
      capabilities: plan.capabilities,
    };
  });

// ─── Start a free trial ────────────────────────────────────────
export const startFreeTrial = baseProcedure
  .input(z.object({ authToken: z.string(), tier: tierEnum }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    const existing = await db.subscription.findUnique({ where: { userId: user.id } });
    if (existing && existing.tier !== "FREE") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "You already have an active subscription.",
      });
    }
    if (existing?.trialEndsAt) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "You have already used your free trial.",
      });
    }

    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const sub = await db.subscription.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        tier: input.tier,
        status: "TRIALING",
        billingCycle: "MONTHLY",
        priceAmount: getPrice(input.tier, "MONTHLY"),
        trialEndsAt,
        currentPeriodEnd: trialEndsAt,
      },
      update: {
        tier: input.tier,
        status: "TRIALING",
        trialEndsAt,
        currentPeriodEnd: trialEndsAt,
      },
    });

    await createAuditLog(user.id, "START_SUBSCRIPTION_TRIAL", "Subscription", sub.id, {
      tier: input.tier,
      trialEndsAt,
    });

    return { tier: sub.tier, status: sub.status, trialEndsAt };
  });

// ─── Initialize a paid subscription (Paystack) ─────────────────
export const initializeSubscription = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      tier: tierEnum,
      billingCycle: cycleEnum,
      callbackUrl: z.string().optional(),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    if (!SELF_SERVE_TIERS.includes(input.tier)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid plan." });
    }

    const amount = getPrice(input.tier, input.billingCycle);
    if (amount <= 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This plan is free." });
    }

    const reference = `sub-${user.id}-${input.tier}-${Date.now()}`;

    // If an admin has synced a Paystack recurring plan for this tier+cycle,
    // pass its code so Paystack auto-manages renewals (true recurring billing).
    // Otherwise fall back to a one-off charge for this period.
    const plans = await resolvePlans();
    const plan = plans.find((p) => p.tier === input.tier);
    const planCode =
      input.billingCycle === "ANNUAL"
        ? plan?.paystackPlanCodeAnnual
        : plan?.paystackPlanCodeMonthly;

    // Record a pending payment for idempotent verification later.
    await db.subscriptionPayment.create({
      data: {
        userId: user.id,
        tier: input.tier,
        billingCycle: input.billingCycle,
        amount,
        reference,
        status: "PENDING",
      },
    });

    const result = await paystackRequest("/transaction/initialize", "POST", {
      amount: Math.round(amount * 100), // cents
      email: user.email,
      reference,
      currency: "ZAR",
      callback_url: input.callbackUrl,
      ...(planCode ? { plan: planCode } : {}),
      metadata: {
        type: "SUBSCRIPTION_PAYMENT",
        userId: user.id,
        tier: input.tier,
        billingCycle: input.billingCycle,
      },
    });

    await createAuditLog(user.id, "INITIATE_SUBSCRIPTION_PAYMENT", "Subscription", user.id, {
      tier: input.tier,
      billingCycle: input.billingCycle,
      amount,
      reference,
    });

    return {
      authorizationUrl: result.data.authorization_url,
      accessCode: result.data.access_code,
      reference: result.data.reference,
    };
  });

// ─── Verify + activate subscription ────────────────────────────
export const verifySubscription = baseProcedure
  .input(z.object({ authToken: z.string(), reference: z.string() }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    const pending = await db.subscriptionPayment.findUnique({
      where: { reference: input.reference },
    });
    if (!pending || pending.userId !== user.id) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Payment reference not found." });
    }

    // Already settled — idempotent success.
    if (pending.status === "PAID") {
      const sub = await getEffectiveSubscription(user.id);
      return { success: true, tier: sub.tier, status: sub.status, alreadyProcessed: true };
    }

    const verification = await paystackRequest(
      `/transaction/verify/${encodeURIComponent(input.reference)}`,
      "GET",
    );
    if (verification.data.status !== "success") {
      await db.subscriptionPayment.update({
        where: { reference: input.reference },
        data: { status: "FAILED" },
      });
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Payment not successful (status: ${verification.data.status}).`,
      });
    }

    const now = new Date();
    const customerCode = verification.data.customer?.customer_code ?? null;
    const subscriptionCode = verification.data.subscription?.subscription_code ?? null;

    const result = await activatePaidSubscription({
      pending,
      customerCode,
      subscriptionCode,
      paidAt: now,
    });

    return {
      success: true,
      tier: result.tier,
      status: result.status,
      currentPeriodEnd: result.currentPeriodEnd,
    };
  });

// ─── Cancel (at period end) ────────────────────────────────────
export const cancelSubscription = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const existing = await db.subscription.findUnique({ where: { userId: user.id } });
    if (!existing || existing.tier === "FREE") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "No active subscription to cancel." });
    }

    // Best-effort disable Paystack recurring charge if a code exists.
    if (existing.paystackSubscriptionCode && env.PAYSTACK_SECRET_KEY) {
      try {
        await paystackRequest("/subscription/disable", "POST", {
          code: existing.paystackSubscriptionCode,
          token: existing.paystackCustomerCode,
        });
      } catch {
        // Non-fatal — we still mark cancel-at-period-end locally.
      }
    }

    const updated = await db.subscription.update({
      where: { userId: user.id },
      data: { cancelAtPeriodEnd: true, cancelledAt: new Date() },
    });

    await createAuditLog(user.id, "CANCEL_SUBSCRIPTION", "Subscription", updated.id, {
      tier: updated.tier,
      effectiveAt: updated.currentPeriodEnd,
    });

    return {
      success: true,
      tier: updated.tier,
      accessUntil: updated.currentPeriodEnd,
    };
  });

// ─── Admin: subscription stats ─────────────────────────────────
export const getSubscriptionStats = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    if (!["ADMIN", "DEVELOPMENT_MANAGER"].includes(user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required." });
    }

    const [byTier, byStatus, payments, recent] = await Promise.all([
      db.subscription.groupBy({ by: ["tier"], _count: { _all: true } }),
      db.subscription.groupBy({ by: ["status"], _count: { _all: true } }),
      db.subscriptionPayment.aggregate({
        where: { status: "PAID" },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      db.subscriptionPayment.findMany({
        where: { status: "PAID" },
        orderBy: { paidAt: "desc" },
        take: 20,
        include: { user: { select: { name: true, email: true } } },
      }),
    ]);

    // Approximate MRR from active monthly-equivalent subscriptions.
    const activeSubs = await db.subscription.findMany({
      where: { status: { in: ["ACTIVE", "TRIALING"] } },
      select: { priceAmount: true, billingCycle: true },
    });
    const mrr = activeSubs.reduce((sum, s) => {
      const monthly = s.billingCycle === "ANNUAL" ? s.priceAmount / 12 : s.priceAmount;
      return sum + monthly;
    }, 0);

    return {
      tierCounts: Object.fromEntries(byTier.map((t) => [t.tier, t._count._all])),
      statusCounts: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
      totalPaidRevenue: payments._sum.amount ?? 0,
      totalPaidCount: payments._count._all,
      estimatedMRR: Math.round(mrr),
      recentPayments: recent.map((p) => ({
        id: p.id,
        tier: p.tier,
        amount: p.amount,
        billingCycle: p.billingCycle,
        paidAt: p.paidAt,
        userName: p.user.name,
        userEmail: p.user.email,
      })),
    };
  });

// ─── Admin: create/sync Paystack recurring plans ───────────────
// Creates a Paystack Plan for each paid tier + billing cycle (if the plan
// code isn't already stored) and persists the returned plan_code onto the
// SubscriptionPlan row. Once synced, initializeSubscription passes the plan
// code so Paystack auto-charges renewals (true recurring billing).
export const syncPaystackPlans = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    if (!["ADMIN", "DEVELOPMENT_MANAGER"].includes(user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required." });
    }

    const created: { tier: SubscriptionTier; cycle: "MONTHLY" | "ANNUAL"; planCode: string }[] = [];
    const skipped: { tier: SubscriptionTier; cycle: "MONTHLY" | "ANNUAL"; reason: string }[] = [];

    for (const tier of SELF_SERVE_TIERS) {
      const existing = await db.subscriptionPlan.findUnique({ where: { tier } });
      const def = PLAN_CATALOG[tier];

      for (const cycle of ["MONTHLY", "ANNUAL"] as const) {
        const amount = getPrice(tier, cycle);
        if (amount <= 0) {
          skipped.push({ tier, cycle, reason: "free" });
          continue;
        }

        const codeField = cycle === "ANNUAL" ? "paystackPlanCodeAnnual" : "paystackPlanCodeMonthly";
        if (existing?.[codeField]) {
          skipped.push({ tier, cycle, reason: "already synced" });
          continue;
        }

        const res = await paystackRequest("/plan", "POST", {
          name: `${def.name} (${cycle === "ANNUAL" ? "Annual" : "Monthly"})`,
          amount: Math.round(amount * 100),
          interval: cycle === "ANNUAL" ? "annually" : "monthly",
          currency: "ZAR",
          description: def.tagline,
        });
        const planCode = res.data?.plan_code as string;
        if (!planCode) {
          skipped.push({ tier, cycle, reason: "no plan_code returned" });
          continue;
        }

        await db.subscriptionPlan.upsert({
          where: { tier },
          create: {
            tier,
            name: def.name,
            description: def.description,
            monthlyPrice: def.monthlyPrice,
            annualPrice: def.annualPrice,
            features: def.features,
            [codeField]: planCode,
          },
          update: { [codeField]: planCode },
        });

        created.push({ tier, cycle, planCode });
      }
    }

    await createAuditLog(user.id, "SYNC_PAYSTACK_PLANS", "SubscriptionPlan", user.id, {
      created: created.length,
      skipped: skipped.length,
    });

    return { created, skipped };
  });

