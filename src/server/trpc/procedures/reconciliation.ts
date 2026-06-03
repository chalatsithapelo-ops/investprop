import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { createAuditLog } from "./audit-log";

interface CsvRow {
  reference: string;
  amount: number;
  paidAt?: string;
}

/**
 * Match a list of CSV rows from a payment processor (Paystack, Stitch, manual EFT)
 * against pending DistributionPayout rows by paymentRef.
 *
 * Returns matched + unmatched buckets. Does NOT modify state.
 */
export const reconcilePayouts = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      rows: z
        .array(
          z.object({
            reference: z.string().min(1),
            amount: z.number(),
            paidAt: z.string().optional(),
          })
        )
        .min(1)
        .max(5000),
    })
  )
  .mutation(async ({ input }) => {
    const caller = await getAuthenticatedUser(input.authToken);
    if (caller.role !== "ADMIN" && caller.role !== "DEVELOPMENT_MANAGER") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Reconciliation is admin-only" });
    }

    const refs = input.rows.map((r) => r.reference);
    const payouts = await db.distributionPayout.findMany({
      where: { paymentRef: { in: refs } },
      include: {
        distribution: { select: { id: true, propertyId: true, type: true } },
        investor: { select: { id: true, name: true, email: true } },
      },
    });
    const byRef = new Map(payouts.map((p) => [p.paymentRef ?? "", p]));

    const matched: Array<{
      reference: string;
      csvAmount: number;
      payoutId: number;
      payoutNet: number;
      delta: number;
      investorName: string | null;
      currentStatus: string;
      paidAt: string | null;
    }> = [];
    const unmatched: CsvRow[] = [];
    let mismatchCount = 0;

    for (const row of input.rows) {
      const p = byRef.get(row.reference);
      if (!p) {
        unmatched.push(row);
        continue;
      }
      const delta = Math.round((row.amount - p.netAmount) * 100) / 100;
      if (Math.abs(delta) > 0.01) mismatchCount += 1;
      matched.push({
        reference: row.reference,
        csvAmount: row.amount,
        payoutId: p.id,
        payoutNet: p.netAmount,
        delta,
        investorName: p.investor?.name ?? null,
        currentStatus: p.status,
        paidAt: row.paidAt ?? null,
      });
    }

    await createAuditLog(caller.id, "RECONCILE_PAYOUTS", "DistributionPayout", null, {
      totalRows: input.rows.length,
      matched: matched.length,
      unmatched: unmatched.length,
      mismatches: mismatchCount,
    });

    return {
      totalRows: input.rows.length,
      matched,
      unmatched,
      mismatchCount,
    };
  });

/**
 * After reviewing reconciliation, mark a payout PAID and store reconciliation notes.
 * Requires a non-empty notes string when amount delta != 0 (manual override audit trail).
 */
export const markPayoutReconciled = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      payoutId: z.number(),
      csvAmount: z.number(),
      paidAt: z.string().optional(),
      notes: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const caller = await getAuthenticatedUser(input.authToken);
    if (caller.role !== "ADMIN" && caller.role !== "DEVELOPMENT_MANAGER") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Reconciliation is admin-only" });
    }
    const p = await db.distributionPayout.findUnique({ where: { id: input.payoutId } });
    if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Payout not found" });

    const delta = Math.abs(input.csvAmount - p.netAmount);
    if (delta > 0.01 && (!input.notes || input.notes.trim().length < 3)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Amount mismatch (R${delta.toFixed(2)}). A reconciliation note (min 3 chars) is required for manual override.`,
      });
    }

    const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
    await db.distributionPayout.update({
      where: { id: input.payoutId },
      data: {
        status: "PAID",
        paidAt,
        reconciledAt: new Date(),
        reconciliationNotes: input.notes ?? null,
      },
    });
    await createAuditLog(caller.id, "MARK_PAYOUT_PAID", "DistributionPayout", input.payoutId, {
      csvAmount: input.csvAmount,
      payoutNet: p.netAmount,
      delta,
      notes: input.notes,
    });
    return { success: true };
  });
