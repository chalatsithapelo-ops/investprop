import { defineEventHandler, toWebRequest } from "@tanstack/react-start/server";
import crypto from "node:crypto";
import { env } from "~/server/env";
import { db } from "~/server/db";
import { getPrice } from "~/server/subscriptions/plans";
import { activatePaidSubscription } from "~/server/subscriptions/activate";
import { createAuditLog } from "~/server/trpc/procedures/audit-log";
import { createNotification } from "~/server/trpc/procedures/notifications";

// ═══════════════════════════════════════════════════════════════
//  Paystack webhook — the reliable, server-to-server source of truth
//  for payment + subscription lifecycle events. Verifies the HMAC
//  SHA512 signature, then processes events idempotently.
//  Endpoint: POST /api/paystack/webhook
//  Configure in Paystack dashboard → Settings → API Keys & Webhooks.
// ═══════════════════════════════════════════════════════════════

interface PaystackEvent {
  event: string;
  data: Record<string, any>;
}

async function handleChargeSuccess(data: Record<string, any>): Promise<string> {
  const reference: string | undefined = data.reference;
  const customerCode: string | null = data.customer?.customer_code ?? null;
  const subscriptionCode: string | null =
    data.subscription?.subscription_code ?? data.plan?.subscription_code ?? null;
  const metaType: string | undefined = data.metadata?.type;

  // 1. First charge of a subscription we initialized — has our pending record.
  if (reference) {
    const pending = await db.subscriptionPayment.findUnique({ where: { reference } });
    if (pending) {
      const result = await activatePaidSubscription({
        pending,
        customerCode,
        subscriptionCode,
      });
      return `subscription ${result.alreadyProcessed ? "already active" : "activated"} (${pending.tier})`;
    }
  }

  // 2. Recurring renewal charge from a Paystack-managed plan — no pending
  //    record, but the charge carries a plan + customer we already know.
  if (data.plan?.plan_code && customerCode) {
    const sub = await db.subscription.findFirst({
      where: { paystackCustomerCode: customerCode },
    });
    if (sub && sub.tier !== "FREE") {
      const renewalRef = reference ?? `renewal-${sub.userId}-${Date.now()}`;
      const amount = (data.amount ?? 0) / 100 || getPrice(sub.tier, sub.billingCycle);

      // Idempotency: skip if this renewal reference was already booked.
      const already = await db.subscriptionPayment.findUnique({ where: { reference: renewalRef } });
      if (already?.status === "PAID") return "renewal already processed";

      const pending =
        already ??
        (await db.subscriptionPayment.create({
          data: {
            userId: sub.userId,
            tier: sub.tier,
            billingCycle: sub.billingCycle,
            amount,
            reference: renewalRef,
            status: "PENDING",
          },
        }));

      await activatePaidSubscription({
        pending,
        customerCode,
        subscriptionCode: subscriptionCode ?? sub.paystackSubscriptionCode,
      });
      await createNotification(
        sub.userId,
        "Subscription renewed",
        `Your subscription has been renewed and is active.`,
        "SUCCESS",
        "SYSTEM",
      );
      return `renewal booked (${sub.tier})`;
    }
  }

  // 3. Some other charge (e.g. investment payment) — not ours to handle here.
  return "ignored (not a subscription charge)";
}

async function handleSubscriptionCreate(data: Record<string, any>): Promise<string> {
  const subscriptionCode: string | undefined = data.subscription_code;
  const customerCode: string | undefined = data.customer?.customer_code;
  if (!subscriptionCode || !customerCode) return "ignored (missing codes)";

  const sub = await db.subscription.findFirst({
    where: { paystackCustomerCode: customerCode },
  });
  if (!sub) return "ignored (no matching subscription)";

  await db.subscription.update({
    where: { userId: sub.userId },
    data: { paystackSubscriptionCode: subscriptionCode },
  });
  return "subscription_code attached";
}

async function handleSubscriptionCancelled(data: Record<string, any>): Promise<string> {
  const subscriptionCode: string | undefined = data.subscription_code;
  if (!subscriptionCode) return "ignored (missing code)";

  const sub = await db.subscription.findFirst({
    where: { paystackSubscriptionCode: subscriptionCode },
  });
  if (!sub) return "ignored (no matching subscription)";

  await db.subscription.update({
    where: { userId: sub.userId },
    data: { cancelAtPeriodEnd: true, cancelledAt: new Date() },
  });
  await createNotification(
    sub.userId,
    "Subscription will not renew",
    "Your subscription has been set to cancel at the end of the current period.",
    "WARNING",
    "SYSTEM",
  );
  return "marked cancel-at-period-end";
}

async function handlePaymentFailed(data: Record<string, any>): Promise<string> {
  const customerCode: string | undefined =
    data.customer?.customer_code ?? data.subscription?.customer?.customer_code;
  const subscriptionCode: string | undefined =
    data.subscription?.subscription_code ?? data.subscription_code;

  const sub = await db.subscription.findFirst({
    where: subscriptionCode
      ? { paystackSubscriptionCode: subscriptionCode }
      : customerCode
        ? { paystackCustomerCode: customerCode }
        : { id: -1 },
  });
  if (!sub) return "ignored (no matching subscription)";

  await db.subscription.update({
    where: { userId: sub.userId },
    data: { status: "PAST_DUE" },
  });
  await createNotification(
    sub.userId,
    "Payment failed",
    "We couldn't process your subscription renewal. Please update your payment method to avoid losing access.",
    "ERROR",
    "SYSTEM",
  );
  return "marked past_due";
}

export default defineEventHandler(async (event) => {
  const request = toWebRequest(event);
  if (!request || request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!env.PAYSTACK_SECRET_KEY) {
    // Nothing to verify against — acknowledge so Paystack stops retrying.
    return new Response(JSON.stringify({ ok: false, reason: "gateway not configured" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Signature verification requires the RAW body (not re-serialized JSON).
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature") ?? "";
  const expected = crypto
    .createHmac("sha512", env.PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest("hex");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    console.warn("[paystack] webhook signature mismatch — rejecting");
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: PaystackEvent;
  try {
    payload = JSON.parse(rawBody) as PaystackEvent;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  try {
    let outcome = "unhandled";
    switch (payload.event) {
      case "charge.success":
        outcome = await handleChargeSuccess(payload.data);
        break;
      case "subscription.create":
        outcome = await handleSubscriptionCreate(payload.data);
        break;
      case "subscription.disable":
      case "subscription.not_renew":
        outcome = await handleSubscriptionCancelled(payload.data);
        break;
      case "invoice.payment_failed":
        outcome = await handlePaymentFailed(payload.data);
        break;
      default:
        outcome = `ignored event ${payload.event}`;
    }

    console.log(`[paystack] webhook ${payload.event}: ${outcome}`);
    return new Response(JSON.stringify({ ok: true, outcome }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    // Return 500 so Paystack retries transient failures. Never throw secrets.
    console.error(`[paystack] webhook error handling ${payload.event}:`, err);
    await createAuditLog(0, "PAYSTACK_WEBHOOK_ERROR", "Subscription", 0, {
      event: payload.event,
      error: err instanceof Error ? err.message : String(err),
    }).catch(() => {});
    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
