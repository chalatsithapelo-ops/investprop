import { db } from "~/server/db";
import { createAuditLog } from "~/server/trpc/procedures/audit-log";
import { getPlan } from "~/server/subscriptions/plans";
import type { SubscriptionPayment } from "@prisma/client";

// ═══════════════════════════════════════════════════════════════
//  Shared subscription-activation logic.
//  Used by BOTH the client-driven verify mutation and the Paystack
//  webhook so the two paths can never diverge. Fully idempotent:
//  safe to run twice for the same payment reference.
// ═══════════════════════════════════════════════════════════════

export function addPeriod(from: Date, cycle: "MONTHLY" | "ANNUAL"): Date {
  const d = new Date(from);
  if (cycle === "ANNUAL") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

export interface ActivateResult {
  tier: string;
  status: string;
  currentPeriodEnd: Date | null;
  alreadyProcessed: boolean;
}

/**
 * Mark a pending SubscriptionPayment as PAID, activate/renew the user's
 * subscription, and book the charge into the unified PlatformRevenue ledger.
 * Idempotent on the payment's PAID status.
 */
export async function activatePaidSubscription(opts: {
  pending: SubscriptionPayment;
  customerCode?: string | null;
  subscriptionCode?: string | null;
  paidAt?: Date;
}): Promise<ActivateResult> {
  const { pending } = opts;
  const now = opts.paidAt ?? new Date();
  const periodEnd = addPeriod(now, pending.billingCycle);
  const customerCode = opts.customerCode ?? null;
  const subscriptionCode = opts.subscriptionCode ?? null;

  const { sub, newlyActivated } = await db.$transaction(async (tx) => {
    // Idempotency guard: if this payment is already settled, just return the
    // current subscription without re-booking revenue or re-auditing.
    const current = await tx.subscriptionPayment.findUnique({ where: { id: pending.id } });
    if (current?.status === "PAID") {
      const existing = await tx.subscription.findUnique({ where: { userId: pending.userId } });
      return { sub: existing, newlyActivated: false };
    }

    await tx.subscriptionPayment.update({
      where: { id: pending.id },
      data: { status: "PAID", paidAt: now, periodStart: now, periodEnd },
    });

    const upserted = await tx.subscription.upsert({
      where: { userId: pending.userId },
      create: {
        userId: pending.userId,
        tier: pending.tier,
        status: "ACTIVE",
        billingCycle: pending.billingCycle,
        priceAmount: pending.amount,
        currentPeriodEnd: periodEnd,
        paystackCustomerCode: customerCode,
        paystackSubscriptionCode: subscriptionCode,
        lastPaymentReference: pending.reference,
        lastPaymentAt: now,
        cancelAtPeriodEnd: false,
      },
      update: {
        tier: pending.tier,
        status: "ACTIVE",
        billingCycle: pending.billingCycle,
        priceAmount: pending.amount,
        currentPeriodEnd: periodEnd,
        paystackCustomerCode: customerCode ?? undefined,
        paystackSubscriptionCode: subscriptionCode ?? undefined,
        lastPaymentReference: pending.reference,
        lastPaymentAt: now,
        cancelAtPeriodEnd: false,
        cancelledAt: null,
      },
    });

    // Book subscription revenue into the unified platform-revenue ledger so it
    // shows in the admin revenue dashboard. Idempotent via the
    // (feeType, sourceType, sourceId) unique constraint.
    try {
      await tx.platformRevenue.create({
        data: {
          feeType: "SUBSCRIPTION",
          sourceType: "SubscriptionPayment",
          sourceId: pending.id,
          baseAmount: pending.amount,
          feeBps: 10000,
          feeAmount: pending.amount,
          description: `${getPlan(pending.tier).name} (${pending.billingCycle.toLowerCase()})`,
        },
      });
    } catch {
      // Unique-constraint collision → already booked; ignore.
    }

    return { sub: upserted, newlyActivated: true };
  });

  if (newlyActivated) {
    await createAuditLog(pending.userId, "ACTIVATE_SUBSCRIPTION", "Subscription", sub?.id ?? pending.userId, {
      tier: pending.tier,
      billingCycle: pending.billingCycle,
      amount: pending.amount,
      reference: pending.reference,
    });
  }

  return {
    tier: sub?.tier ?? pending.tier,
    status: sub?.status ?? "ACTIVE",
    currentPeriodEnd: sub?.currentPeriodEnd ?? periodEnd,
    alreadyProcessed: !newlyActivated,
  };
}
