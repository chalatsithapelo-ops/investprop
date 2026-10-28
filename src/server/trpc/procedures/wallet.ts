import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";
import { env } from "~/server/env";
import { createNotification } from "./notifications";
import { createAuditLog } from "./audit-log";
import { getOrCreateWallet, creditWallet, debitWallet } from "~/server/wallet/wallet";
import { confirmWalletDeposit } from "~/server/wallet/deposits";
import { randsToCents, centsToRands, computeWithdrawalFeeCents } from "~/wallet-calculations";
import { getFeeConfig, recordPlatformFee } from "~/server/fees/platform-fees";

// ═══════════════════════════════════════════════════════════════
//  In-app Wallet
//  Investors fund a wallet via Paystack (EFT/card); matched trades settle
//  instantly from the wallet balance (Delivery-versus-Payment, no manual POP
//  review). Sellers receive proceeds into the same wallet and can withdraw.
//  Balances are held in integer cents (ZAR).
// ═══════════════════════════════════════════════════════════════

const WITHDRAWAL_ADMIN_ROLES = ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"] as const;
const MIN_WITHDRAWAL_CENTS = 10_000; // R100 minimum payout

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
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: data.message ?? "Payment gateway error" });
  }
  return data;
}

// ─── Get my wallet (balance + recent transactions) ─────────────

export const getMyWallet = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const wallet = await getOrCreateWallet(user.id);
    const transactions = await db.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    const pendingWithdrawals = await db.walletWithdrawal.aggregate({
      where: { userId: user.id, status: { in: ["REQUESTED", "APPROVED", "PROCESSING"] } },
      _sum: { amountCents: true },
    });
    return {
      balanceCents: wallet.balanceCents,
      balanceRands: centsToRands(wallet.balanceCents),
      currency: wallet.currency,
      pendingWithdrawalCents: pendingWithdrawals._sum.amountCents ?? 0,
      transactions: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amountCents: t.amountCents,
        amountRands: centsToRands(t.amountCents),
        balanceAfterRands: centsToRands(t.balanceAfter),
        status: t.status,
        description: t.description,
        reference: t.reference,
        createdAt: t.createdAt,
      })),
    };
  });

// ─── Get wallet transactions (paged) ───────────────────────────

export const getWalletTransactions = baseProcedure
  .input(z.object({ authToken: z.string(), limit: z.number().int().min(1).max(200).default(100) }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const wallet = await getOrCreateWallet(user.id);
    const txns = await db.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: input.limit,
    });
    return txns.map((t) => ({
      id: t.id,
      type: t.type,
      amountRands: centsToRands(t.amountCents),
      balanceAfterRands: centsToRands(t.balanceAfter),
      status: t.status,
      description: t.description,
      reference: t.reference,
      settlementId: t.settlementId,
      withdrawalId: t.withdrawalId,
      createdAt: t.createdAt,
    }));
  });

// ─── Initiate a wallet deposit (Paystack checkout) ─────────────

export const initiateWalletDeposit = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      amountRands: z.number().min(10, "Minimum deposit is R10"),
      callbackUrl: z.string().optional(),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const wallet = await getOrCreateWallet(user.id);
    const amountCents = randsToCents(input.amountRands);
    const reference = `wallet-${user.id}-${Date.now()}`;

    const result = await paystackRequest("/transaction/initialize", "POST", {
      amount: amountCents,
      email: user.email,
      reference,
      currency: "ZAR",
      callback_url: input.callbackUrl,
      metadata: { type: "WALLET_DEPOSIT", userId: user.id, walletId: wallet.id },
    });

    // Record a pending deposit so the UI can show it; confirmed by webhook/verify.
    await db.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: "DEPOSIT",
        amountCents,
        balanceAfter: wallet.balanceCents,
        status: "PENDING",
        reference,
        description: `Wallet deposit of R${input.amountRands.toFixed(2)} (pending)`,
      },
    });

    await createAuditLog(user.id, "INITIATE_WALLET_DEPOSIT", "Wallet", wallet.id, {
      reference,
      amountRands: input.amountRands,
    });

    return {
      authorizationUrl: result.data.authorization_url,
      accessCode: result.data.access_code,
      reference: result.data.reference,
    };
  });

// ─── Verify a wallet deposit (client fallback to the webhook) ──

export const verifyWalletDeposit = baseProcedure
  .input(z.object({ authToken: z.string(), reference: z.string() }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    // Confirm the reference belongs to this user's wallet.
    const pending = await db.walletTransaction.findUnique({
      where: { reference: input.reference },
      include: { wallet: true },
    });
    if (!pending || pending.wallet.userId !== user.id) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Deposit reference not found" });
    }

    const result = await paystackRequest(`/transaction/verify/${input.reference}`, "GET");
    if (result.data.status !== "success") {
      return { confirmed: false, status: result.data.status };
    }

    const outcome = await confirmWalletDeposit({
      reference: input.reference,
      amountCents: result.data.amount, // Paystack returns the actual paid amount in cents
      userId: user.id,
    });
    await createAuditLog(user.id, "VERIFY_WALLET_DEPOSIT", "Wallet", pending.walletId, {
      reference: input.reference,
      settledCount: outcome.settledCount,
    });
    return {
      confirmed: true,
      alreadyProcessed: outcome.alreadyProcessed,
      balanceRands: centsToRands(outcome.balanceAfter ?? pending.wallet.balanceCents),
      tradesAutoSettled: outcome.settledCount,
    };
  });

// ─── Request a withdrawal (seller cashes out) ──────────────────

export const requestWithdrawal = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      amountRands: z.number().min(100, "Minimum withdrawal is R100"),
      bankName: z.string().min(2),
      accountNumber: z.string().min(4),
      accountName: z.string().min(2),
      branchCode: z.string().optional(),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const amountCents = randsToCents(input.amountRands);
    if (amountCents < MIN_WITHDRAWAL_CENTS) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Minimum withdrawal is R100" });
    }
    const reference = `wd-${user.id}-${Date.now()}`;

    // Platform withdrawal fee (flat + %). The full gross is reserved from the
    // wallet; the bank receives the net (gross − fee) and the platform keeps the fee.
    const feeConfig = await getFeeConfig();
    const feeCents = feeConfig.enabled
      ? computeWithdrawalFeeCents(amountCents, {
          withdrawalFeeBps: feeConfig.withdrawalFeeBps,
          withdrawalFlatFee: feeConfig.withdrawalFlatFee,
        })
      : 0;
    const netCents = Math.max(0, amountCents - feeCents);

    // Reserve the funds by debiting immediately; refunded if the request is rejected.
    const withdrawal = await db.$transaction(async (tx) => {
      const wd = await tx.walletWithdrawal.create({
        data: {
          userId: user.id,
          amountCents,
          feeCents,
          netCents,
          status: "REQUESTED",
          bankName: input.bankName,
          accountNumber: input.accountNumber,
          accountName: input.accountName,
          branchCode: input.branchCode ?? null,
          reference,
        },
      });
      await debitWallet(tx, {
        userId: user.id,
        amountCents,
        type: "WITHDRAWAL",
        reference,
        description: `Withdrawal request #${wd.id} to ${input.bankName} (R${centsToRands(netCents).toFixed(2)} net, R${centsToRands(feeCents).toFixed(2)} fee)`,
        withdrawalId: wd.id,
      });
      return wd;
    });

    const managers = await db.user.findMany({
      where: { role: { in: [...WITHDRAWAL_ADMIN_ROLES] } },
      select: { id: true },
    });
    for (const mgr of managers) {
      await createNotification(
        mgr.id,
        "Withdrawal requested",
        `${user.name} requested a withdrawal of R${input.amountRands.toFixed(2)} to ${input.bankName}. Review and process payout. Withdrawal #${withdrawal.id}.`,
        "WARNING",
        "INVESTMENT",
      );
    }
    await createAuditLog(user.id, "REQUEST_WITHDRAWAL", "WalletWithdrawal", withdrawal.id, {
      amountRands: input.amountRands,
      feeRands: centsToRands(feeCents),
      netRands: centsToRands(netCents),
    });
    return {
      id: withdrawal.id,
      status: withdrawal.status,
      reference,
      feeRands: centsToRands(feeCents),
      netRands: centsToRands(netCents),
    };
  });

// ─── My withdrawals ────────────────────────────────────────────

export const getMyWithdrawals = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const rows = await db.walletWithdrawal.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((w) => ({
      id: w.id,
      amountRands: centsToRands(w.amountCents),
      feeRands: centsToRands(w.feeCents),
      netRands: centsToRands(w.netCents),
      status: w.status,
      bankName: w.bankName,
      accountNumber: w.accountNumber,
      reviewNotes: w.reviewNotes,
      createdAt: w.createdAt,
      processedAt: w.processedAt,
    }));
  });

// ─── Pending withdrawals (manager queue) ───────────────────────

export const getPendingWithdrawals = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, [...WITHDRAWAL_ADMIN_ROLES], "Only managers can view the withdrawal queue");
    const rows = await db.walletWithdrawal.findMany({
      where: { status: { in: ["REQUESTED", "APPROVED", "PROCESSING"] } },
      orderBy: { createdAt: "asc" },
      include: { user: { select: { id: true, name: true, email: true, investorCode: true } } },
    });
    return rows.map((w) => ({
      id: w.id,
      amountRands: centsToRands(w.amountCents),
      feeRands: centsToRands(w.feeCents),
      netRands: centsToRands(w.netCents),
      status: w.status,
      bankName: w.bankName,
      accountNumber: w.accountNumber,
      accountName: w.accountName,
      branchCode: w.branchCode,
      investor: w.user,
      createdAt: w.createdAt,
    }));
  });

// ─── Review a withdrawal (manager) ─────────────────────────────

export const reviewWithdrawal = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      withdrawalId: z.number(),
      action: z.enum(["MARK_PAID", "REJECT"]),
      reviewNotes: z.string().optional(),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, [...WITHDRAWAL_ADMIN_ROLES], "Only managers can process withdrawals");

    const wd = await db.walletWithdrawal.findUnique({ where: { id: input.withdrawalId } });
    if (!wd) throw new TRPCError({ code: "NOT_FOUND", message: "Withdrawal not found" });
    if (!["REQUESTED", "APPROVED", "PROCESSING"].includes(wd.status)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Withdrawal is ${wd.status} and cannot be actioned` });
    }

    if (input.action === "MARK_PAID") {
      // Funds were already debited on request; just mark the payout complete and
      // book the withdrawal fee as platform revenue.
      await db.walletWithdrawal.update({
        where: { id: wd.id },
        data: {
          status: "PAID",
          reviewedById: user.id,
          reviewedAt: new Date(),
          reviewNotes: input.reviewNotes ?? null,
          processedAt: new Date(),
        },
      });
      if (wd.feeCents > 0) {
        try {
          await recordPlatformFee({
            feeType: "WITHDRAWAL",
            sourceType: "WalletWithdrawal",
            sourceId: wd.id,
            baseAmount: centsToRands(wd.amountCents),
            feeAmount: centsToRands(wd.feeCents),
            description: `Wallet withdrawal fee — Withdrawal #${wd.id}`,
          });
        } catch (err) {
          console.error("[platform-fees] withdrawal fee capture failed:", err);
        }
      }
      await createNotification(
        wd.userId,
        "Withdrawal paid",
        `Your withdrawal has been paid to ${wd.bankName}: R${centsToRands(wd.netCents).toFixed(2)} net (R${centsToRands(wd.amountCents).toFixed(2)} gross less R${centsToRands(wd.feeCents).toFixed(2)} fee).`,
        "SUCCESS",
        "INVESTMENT",
      );
      await createAuditLog(user.id, "MARK_WITHDRAWAL_PAID", "WalletWithdrawal", wd.id, {
        amountRands: centsToRands(wd.amountCents),
        feeRands: centsToRands(wd.feeCents),
        netRands: centsToRands(wd.netCents),
      });
      return { success: true, status: "PAID" };
    }

    // REJECT — refund the reserved funds back to the wallet.
    await db.$transaction(async (tx) => {
      await creditWallet(tx, {
        userId: wd.userId,
        amountCents: wd.amountCents,
        type: "REFUND",
        reference: `wd-refund-${wd.id}`,
        description: `Withdrawal #${wd.id} rejected — funds returned`,
        withdrawalId: wd.id,
      });
      await tx.walletWithdrawal.update({
        where: { id: wd.id },
        data: {
          status: "REJECTED",
          reviewedById: user.id,
          reviewedAt: new Date(),
          reviewNotes: input.reviewNotes ?? null,
        },
      });
    });
    await createNotification(
      wd.userId,
      "Withdrawal rejected",
      `Your withdrawal of R${centsToRands(wd.amountCents).toFixed(2)} was rejected and the funds returned to your wallet.${input.reviewNotes ? " Reason: " + input.reviewNotes : ""}`,
      "WARNING",
      "INVESTMENT",
    );
    await createAuditLog(user.id, "REJECT_WITHDRAWAL", "WalletWithdrawal", wd.id, {
      reviewNotes: input.reviewNotes,
    });
    return { success: true, status: "REJECTED" };
  });
