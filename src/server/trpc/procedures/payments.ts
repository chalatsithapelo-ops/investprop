import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { TRPCError } from "@trpc/server";
import { env } from "~/server/env";
import { createNotification } from "./notifications";

// ═══════════════════════════════════════════════════════════════
//  Paystack Payment Gateway Integration
//  For distribution payouts and share purchases
// ═══════════════════════════════════════════════════════════════

const PAYSTACK_BASE = "https://api.paystack.co";

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

// ─── Initiate Distribution Payout via Paystack ─────────────────

export const initiateDistributionPayout = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      distributionId: z.number(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await requireAuthenticatedUser(
      input.authToken,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "PROPERTY_OWNER"],
      "Only managers can initiate distribution payouts."
    );

    const distribution = await db.distribution.findUnique({
      where: { id: input.distributionId },
      include: {
        payouts: { include: { investor: true } },
        property: { select: { title: true } },
      },
    });

    if (!distribution) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Distribution not found" });
    }

    if (distribution.status === "DISTRIBUTED") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Distribution already paid" });
    }

    // Create Paystack transfer recipients and initiate transfers
    const transferResults = [];

    for (const payout of distribution.payouts) {
      if (payout.status === "PAID") continue;

      try {
        // Create transfer recipient (using investor email as identifier)
        const recipientData = await paystackRequest("/transferrecipient", "POST", {
          type: "nuban",
          name: payout.investor.name,
          account_number: (payout.investor as any).bankAccountNumber ?? "0000000000",
          bank_code: (payout.investor as any).bankCode ?? "058", // Default GTBank
          currency: "ZAR",
        });

        // Initiate transfer
        const transfer = await paystackRequest("/transfer", "POST", {
          source: "balance",
          amount: Math.round(payout.netAmount * 100), // Paystack uses kobo/cents
          recipient: recipientData.data.recipient_code,
          reason: `Distribution: ${distribution.property?.title} — ${distribution.type}`,
          reference: `dist-${distribution.id}-payout-${payout.id}-${Date.now()}`,
        });

        // Update payout with payment reference
        await db.distributionPayout.update({
          where: { id: payout.id },
          data: {
            status: "PROCESSING",
            paymentRef: transfer.data.transfer_code,
          },
        });

        transferResults.push({
          payoutId: payout.id,
          investorName: payout.investor.name,
          amount: payout.netAmount,
          status: "PROCESSING",
          transferCode: transfer.data.transfer_code,
        });

        await createNotification(
          payout.investorId,
          "Payment Processing",
          `Your distribution payout of R${payout.netAmount.toLocaleString()} for ${distribution.property?.title} is being processed via bank transfer.`,
          "INFO",
          "INVESTMENT",
          distribution.propertyId
        );
      } catch (error: any) {
        transferResults.push({
          payoutId: payout.id,
          investorName: payout.investor.name,
          amount: payout.netAmount,
          status: "FAILED",
          error: error.message,
        });
      }
    }

    // Update distribution status
    const allProcessing = transferResults.every((r) => r.status === "PROCESSING");
    if (allProcessing) {
      await db.distribution.update({
        where: { id: distribution.id },
        data: { status: "PROCESSING" as any },
      });
    }

    return {
      distributionId: distribution.id,
      totalPayouts: transferResults.length,
      successful: transferResults.filter((r) => r.status === "PROCESSING").length,
      failed: transferResults.filter((r) => r.status === "FAILED").length,
      results: transferResults,
    };
  });

// ─── Verify a Paystack Transfer ────────────────────────────────

export const verifyPaystackTransfer = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      transferCode: z.string(),
    })
  )
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    const result = await paystackRequest(`/transfer/verify/${input.transferCode}`, "GET");
    return {
      status: result.data.status,
      amount: result.data.amount / 100,
      recipient: result.data.recipient,
      reference: result.data.reference,
      createdAt: result.data.createdAt,
    };
  });

// ─── Initialize Payment (for share purchase) ─────────────────

export const initializePayment = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      amount: z.number().positive(),
      email: z.string().email(),
      reference: z.string(),
      metadata: z.record(z.any()).optional(),
      callbackUrl: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);

    const result = await paystackRequest("/transaction/initialize", "POST", {
      amount: Math.round(input.amount * 100),
      email: input.email,
      reference: input.reference,
      currency: "ZAR",
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    });

    return {
      authorizationUrl: result.data.authorization_url,
      accessCode: result.data.access_code,
      reference: result.data.reference,
    };
  });

// ─── Verify Payment (after callback) ──────────────────────────

export const verifyPayment = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      reference: z.string(),
    })
  )
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    const result = await paystackRequest(`/transaction/verify/${input.reference}`, "GET");

    return {
      status: result.data.status,
      amount: result.data.amount / 100,
      currency: result.data.currency,
      reference: result.data.reference,
      paidAt: result.data.paid_at,
      channel: result.data.channel,
      gatewayResponse: result.data.gateway_response,
    };
  });

// ─── Get Paystack Balance ─────────────────────────────────────

export const getPaystackBalance = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    await requireAuthenticatedUser(
      input.authToken,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "PROPERTY_OWNER"],
      "Only managers can view the platform balance."
    );
    const result = await paystackRequest("/balance", "GET");
    return result.data.map((b: any) => ({
      currency: b.currency,
      balance: b.balance / 100,
    }));
  });

// ─── Get Payment Gateway Status ───────────────────────────────

export const getPaymentGatewayStatus = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    return {
      configured: !!env.PAYSTACK_SECRET_KEY,
      provider: "Paystack",
      supportedCurrencies: ["ZAR", "NGN", "USD", "GHS"],
      features: {
        bankTransfers: true,
        cardPayments: true,
        bulkTransfers: true,
        recurringCharges: true,
      },
    };
  });
