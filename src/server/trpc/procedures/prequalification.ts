import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { createAuditLog } from "~/server/trpc/procedures/audit-log";
import { calculatePrequalification } from "~/financial-calculations";

// ═══════════════════════════════════════════════════════════════
//  Home-loan prequalification (Phase 1).
//  An INDICATIVE in-app affordability check — NOT a credit approval
//  or a guarantee of finance. Phase 2 turns a qualifying result into
//  an actual multi-bank application via a bond-originator partner.
// ═══════════════════════════════════════════════════════════════

const prequalInputShape = {
  grossMonthlyIncome: z.number().min(0).max(100_000_000),
  monthlyExpenses: z.number().min(0).max(100_000_000).optional(),
  existingDebtRepayments: z.number().min(0).max(100_000_000).optional(),
  depositAmount: z.number().min(0).max(1_000_000_000).optional(),
  propertyPrice: z.number().min(0).max(1_000_000_000).optional(),
  annualInterestRate: z.number().min(0).max(100).optional(),
  loanTermYears: z.number().int().min(1).max(40).optional(),
};

/** Live affordability preview — no database write. */
export const previewPrequalification = baseProcedure
  .input(z.object({ authToken: z.string(), ...prequalInputShape }))
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    return calculatePrequalification(input);
  });

/** Run and SAVE a prequalification result for the investor. */
export const submitPrequalification = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number().int().positive().optional(),
      notes: z.string().max(1000).optional(),
      consent: z.boolean(),
      ...prequalInputShape,
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    // POPIA: require explicit consent before storing financial data.
    if (!input.consent) {
      return {
        success: false as const,
        error: "Consent is required to run a prequalification.",
      };
    }

    const result = calculatePrequalification(input);

    const record = await db.prequalification.create({
      data: {
        userId: user.id,
        propertyId: input.propertyId ?? null,
        grossMonthlyIncome: input.grossMonthlyIncome,
        netMonthlyIncome: 0,
        monthlyExpenses: input.monthlyExpenses ?? 0,
        existingDebtRepayments: input.existingDebtRepayments ?? 0,
        depositAmount: input.depositAmount ?? 0,
        propertyPrice: input.propertyPrice ?? 0,
        annualInterestRate: result.annualInterestRate,
        loanTermYears: result.loanTermYears,
        maxInstalment: result.maxInstalment,
        maxBondAmount: result.maxBondAmount,
        maxPropertyPrice: result.maxPropertyPrice,
        estimatedInstalment: result.estimatedInstalment,
        loanToValue: result.loanToValue,
        band: result.band,
        qualifies: result.qualifies,
        notes: input.notes ?? null,
      },
    });

    await createAuditLog(user.id, "SUBMIT_PREQUALIFICATION", "Prequalification", record.id, {
      band: result.band,
      qualifies: result.qualifies,
      propertyId: input.propertyId ?? null,
    });

    return { success: true as const, id: record.id, result };
  });

/** List the investor's saved prequalifications (most recent first). */
export const getMyPrequalifications = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const rows = await db.prequalification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return { prequalifications: rows };
  });
