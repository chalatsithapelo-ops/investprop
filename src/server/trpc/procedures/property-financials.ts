import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";

// ─── Record Financial Entry ────────────────────────────────────

export const createFinancialEntry = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      type: z.enum(["INCOME", "EXPENSE"]),
      category: z.enum([
        "RENTAL_INCOME", "SALE_PROCEEDS", "INTEREST_INCOME", "OTHER_INCOME",
        "MAINTENANCE", "INSURANCE", "PROPERTY_TAX", "MANAGEMENT_FEE",
        "LEGAL_FEES", "UTILITIES", "TRANSFER_DUTY", "CONVEYANCING",
        "RATES_AND_LEVIES", "OTHER_EXPENSE",
      ]),
      amount: z.number().min(0.01),
      description: z.string(),
      date: z.string(), // ISO date
      reference: z.string().optional(),
      period: z.string().optional(), // e.g. "2026-02"
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    return db.propertyFinancialEntry.create({
      data: {
        propertyId: input.propertyId,
        type: input.type,
        category: input.category,
        amount: input.amount,
        description: input.description,
        date: new Date(input.date),
        reference: input.reference,
        period: input.period,
        recordedById: user.id,
      },
    });
  });

// ─── Get Financial Entries ─────────────────────────────────────

export const getFinancialEntries = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      type: z.enum(["INCOME", "EXPENSE"]).optional(),
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
      limit: z.number().default(100),
    })
  )
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    const where: any = { propertyId: input.propertyId };
    if (input.type) where.type = input.type;
    if (input.fromDate || input.toDate) {
      where.date = {};
      if (input.fromDate) where.date.gte = new Date(input.fromDate);
      if (input.toDate) where.date.lte = new Date(input.toDate);
    }

    return db.propertyFinancialEntry.findMany({
      where,
      orderBy: { date: "desc" },
      take: input.limit,
      include: {
        recordedBy: { select: { id: true, name: true } },
      },
    });
  });

// ─── Get Financial Summary (P&L) ──────────────────────────────

export const getFinancialSummary = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
    })
  )
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    const where: any = { propertyId: input.propertyId };
    if (input.fromDate || input.toDate) {
      where.date = {};
      if (input.fromDate) where.date.gte = new Date(input.fromDate);
      if (input.toDate) where.date.lte = new Date(input.toDate);
    }

    const entries = await db.propertyFinancialEntry.findMany({ where });

    const income = entries.filter((e) => e.type === "INCOME");
    const expenses = entries.filter((e) => e.type === "EXPENSE");

    const totalIncome = income.reduce((s, e) => s + e.amount, 0);
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const netIncome = totalIncome - totalExpenses;

    // Group by category
    const incomeByCategory = groupByCategory(income);
    const expenseByCategory = groupByCategory(expenses);

    // Monthly breakdown
    const monthlyBreakdown = getMonthlyBreakdown(entries);

    // Property details for yield calculation
    const property = await db.property.findUnique({
      where: { id: input.propertyId },
      select: { price: true, fundingGoal: true, fundingRaised: true },
    });
    const propertyValue = property?.price ?? 0;
    const grossYield = propertyValue > 0 ? (totalIncome / propertyValue) * 100 : 0;
    const netYield = propertyValue > 0 ? (netIncome / propertyValue) * 100 : 0;

    return {
      totalIncome,
      totalExpenses,
      netIncome,
      grossYield,
      netYield,
      profitMargin: totalIncome > 0 ? (netIncome / totalIncome) * 100 : 0,
      incomeByCategory,
      expenseByCategory,
      monthlyBreakdown,
      entryCount: entries.length,
    };
  });

// ─── Get Monthly Cash Flow ─────────────────────────────────────

export const getMonthlyCashFlow = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      months: z.number().int().min(1).max(36).default(12),
    })
  )
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);

    const fromDate = new Date();
    fromDate.setMonth(fromDate.getMonth() - input.months);

    const entries = await db.propertyFinancialEntry.findMany({
      where: {
        propertyId: input.propertyId,
        date: { gte: fromDate },
      },
      orderBy: { date: "asc" },
    });

    return getMonthlyBreakdown(entries);
  });

// ─── Delete Financial Entry ────────────────────────────────────

export const deleteFinancialEntry = baseProcedure
  .input(z.object({ authToken: z.string(), entryId: z.number() }))
  .mutation(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    return db.propertyFinancialEntry.delete({ where: { id: input.entryId } });
  });

// ═══════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════

function groupByCategory(entries: any[]) {
  const map: Record<string, number> = {};
  for (const e of entries) {
    map[e.category] = (map[e.category] ?? 0) + e.amount;
  }
  return Object.entries(map)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

function getMonthlyBreakdown(entries: any[]) {
  const map: Record<string, { income: number; expenses: number }> = {};
  for (const e of entries) {
    const month = `${e.date.getFullYear()}-${String(e.date.getMonth() + 1).padStart(2, "0")}`;
    if (!map[month]) map[month] = { income: 0, expenses: 0 };
    if (e.type === "INCOME") map[month].income += e.amount;
    else map[month].expenses += e.amount;
  }
  return Object.entries(map)
    .map(([month, data]) => ({
      month,
      income: data.income,
      expenses: data.expenses,
      net: data.income - data.expenses,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}
