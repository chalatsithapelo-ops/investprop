/**
 * Atomic wallet money-movement primitives.
 *
 * The WalletTransaction ledger is the source of truth; `Wallet.balanceCents` is
 * a cached projection kept in lock-step. Every credit/debit must run inside a
 * Prisma transaction so the balance update and the ledger row commit together.
 *
 * Safety properties:
 *  - Debits use a conditional `updateMany` (balance ≥ amount) so two concurrent
 *    debits can never overdraw a wallet (no double-spend).
 *  - All operations are idempotent on `reference`: replaying the same Paystack
 *    webhook or retrying a settlement never double-credits/debits.
 *  - Amounts are signed in the ledger: credits positive, debits negative.
 */
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";

export type TxClient = Parameters<Parameters<typeof db.$transaction>[0]>[0];

type WalletTxnType =
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "TRADE_DEBIT"
  | "TRADE_CREDIT"
  | "FEE"
  | "REFUND"
  | "ADJUSTMENT";

interface MovementArgs {
  userId: number;
  amountCents: number; // positive magnitude
  type: WalletTxnType;
  reference?: string | null;
  description?: string | null;
  settlementId?: number | null;
  withdrawalId?: number | null;
}

export interface MovementResult {
  applied: boolean; // false when skipped as an idempotent replay
  alreadyProcessed: boolean;
  balanceAfter: number;
  transactionId: number | null;
}

/** Ensure a wallet row exists for a user (outside any money movement). */
export async function getOrCreateWallet(userId: number, client: TxClient | typeof db = db) {
  return client.wallet.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

/** Credit a wallet (increment balance). Idempotent on `reference`. */
export async function creditWallet(tx: TxClient, args: MovementArgs): Promise<MovementResult> {
  const amount = Math.round(args.amountCents);
  if (amount <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Credit amount must be positive" });
  }

  if (args.reference) {
    const existing = await tx.walletTransaction.findUnique({ where: { reference: args.reference } });
    if (existing) {
      return { applied: false, alreadyProcessed: true, balanceAfter: existing.balanceAfter, transactionId: existing.id };
    }
  }

  const wallet = await tx.wallet.upsert({
    where: { userId: args.userId },
    create: { userId: args.userId, balanceCents: amount },
    update: { balanceCents: { increment: amount } },
  });

  const txn = await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: args.type,
      amountCents: amount,
      balanceAfter: wallet.balanceCents,
      status: "COMPLETED",
      reference: args.reference ?? null,
      description: args.description ?? null,
      settlementId: args.settlementId ?? null,
      withdrawalId: args.withdrawalId ?? null,
    },
  });

  return { applied: true, alreadyProcessed: false, balanceAfter: wallet.balanceCents, transactionId: txn.id };
}

/**
 * Debit a wallet (decrement balance) atomically. Throws FORBIDDEN-equivalent
 * BAD_REQUEST on insufficient funds. Idempotent on `reference`.
 */
export async function debitWallet(tx: TxClient, args: MovementArgs): Promise<MovementResult> {
  const amount = Math.round(args.amountCents);
  if (amount <= 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Debit amount must be positive" });
  }

  if (args.reference) {
    const existing = await tx.walletTransaction.findUnique({ where: { reference: args.reference } });
    if (existing) {
      return { applied: false, alreadyProcessed: true, balanceAfter: existing.balanceAfter, transactionId: existing.id };
    }
  }

  // Conditional decrement — only succeeds when the balance can cover it.
  const result = await tx.wallet.updateMany({
    where: { userId: args.userId, balanceCents: { gte: amount } },
    data: { balanceCents: { decrement: amount } },
  });
  if (result.count === 0) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient wallet balance" });
  }

  const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId: args.userId } });

  const txn = await tx.walletTransaction.create({
    data: {
      walletId: wallet.id,
      type: args.type,
      amountCents: -amount,
      balanceAfter: wallet.balanceCents,
      status: "COMPLETED",
      reference: args.reference ?? null,
      description: args.description ?? null,
      settlementId: args.settlementId ?? null,
      withdrawalId: args.withdrawalId ?? null,
    },
  });

  return { applied: true, alreadyProcessed: false, balanceAfter: wallet.balanceCents, transactionId: txn.id };
}
