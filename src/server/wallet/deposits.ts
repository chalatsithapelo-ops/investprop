/**
 * Wallet deposit confirmation — the single code path that turns a successful
 * Paystack charge into credited wallet funds, used by BOTH the webhook
 * (server-to-server source of truth) and the client verify fallback.
 *
 * Idempotent on the Paystack reference: replaying the same event never double-
 * credits. After crediting, it automatically settles any of the buyer's pending
 * trade obligations their new balance can cover (manager-free reconciliation).
 */
import { db } from "~/server/db";
import { createNotification } from "~/server/trpc/procedures/notifications";
import { settlePendingSettlementsForBuyer } from "~/server/trpc/procedures/share-marketplace";

export interface ConfirmDepositResult {
  credited: boolean;
  alreadyProcessed: boolean;
  settledCount: number;
  userId?: number;
  balanceAfter?: number;
}

export async function confirmWalletDeposit(args: {
  reference: string;
  amountCents: number;
  userId?: number;
}): Promise<ConfirmDepositResult> {
  const amount = Math.round(args.amountCents);

  const existing = await db.walletTransaction.findUnique({
    where: { reference: args.reference },
    include: { wallet: true },
  });

  let userId = args.userId;
  if (existing) {
    if (existing.status === "COMPLETED") {
      return { credited: false, alreadyProcessed: true, settledCount: 0, userId: existing.wallet.userId, balanceAfter: existing.balanceAfter };
    }
    userId = existing.wallet.userId;
  }
  if (!userId || amount <= 0) {
    return { credited: false, alreadyProcessed: false, settledCount: 0 };
  }

  let balanceAfter = 0;
  await db.$transaction(async (tx) => {
    if (existing) {
      // Flip the pending deposit record to completed with the actual paid amount.
      const wallet = await tx.wallet.update({
        where: { userId: userId! },
        data: { balanceCents: { increment: amount } },
      });
      balanceAfter = wallet.balanceCents;
      await tx.walletTransaction.update({
        where: { id: existing.id },
        data: { status: "COMPLETED", amountCents: amount, balanceAfter },
      });
    } else {
      // No pending record (e.g. a webhook with no prior initiate) — credit fresh.
      const wallet = await tx.wallet.upsert({
        where: { userId: userId! },
        create: { userId: userId!, balanceCents: amount },
        update: { balanceCents: { increment: amount } },
      });
      balanceAfter = wallet.balanceCents;
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: "DEPOSIT",
          amountCents: amount,
          balanceAfter,
          status: "COMPLETED",
          reference: args.reference,
          description: "Wallet deposit (Paystack)",
        },
      });
    }
  });

  await createNotification(
    userId,
    "Wallet funded",
    `R${(amount / 100).toFixed(2)} was added to your wallet.`,
    "SUCCESS",
    "INVESTMENT",
  );

  // Funding a wallet auto-clears outstanding trade obligations.
  const { settledCount } = await settlePendingSettlementsForBuyer(userId);
  return { credited: true, alreadyProcessed: false, settledCount, userId, balanceAfter };
}
