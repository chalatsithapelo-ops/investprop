import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { protectedProcedure } from "../main";
import { createAuditLog } from "./audit-log";
import {
  PLATFORM_FEE_CONFIG_ID,
  getFeeConfig,
  DEFAULT_FEE_CONFIG,
} from "~/server/fees/platform-fees";

// Platform revenue dashboard — ADMIN / DEVELOPMENT_MANAGER only.
const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const allowed: string[] = ["ADMIN", "DEVELOPMENT_MANAGER"];
  if (!allowed.includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

// ─── Revenue summary (totals, by type, monthly trend, recent) ──

export const getPlatformRevenueSummary = adminProcedure
  .input(
    z
      .object({
        months: z.number().int().min(1).max(36).default(12),
      })
      .optional(),
  )
  .query(async ({ input }) => {
    const months = input?.months ?? 12;

    const [totalAgg, byTypeRaw, recent, config] = await Promise.all([
      db.platformRevenue.aggregate({
        _sum: { feeAmount: true },
        _count: true,
      }),
      db.platformRevenue.groupBy({
        by: ["feeType"],
        _sum: { feeAmount: true },
        _count: true,
      }),
      db.platformRevenue.findMany({
        orderBy: { createdAt: "desc" },
        take: 25,
        include: { property: { select: { id: true, title: true } } },
      }),
      getFeeConfig(),
    ]);

    // Month-of-year trend for the requested window (computed in JS to stay
    // database-agnostic — avoids Postgres-specific date_trunc raw SQL).
    const since = new Date();
    since.setMonth(since.getMonth() - (months - 1));
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const windowRows = await db.platformRevenue.findMany({
      where: { createdAt: { gte: since } },
      select: { feeAmount: true, createdAt: true },
    });

    const monthlyMap = new Map<string, number>();
    for (let i = 0; i < months; i++) {
      const d = new Date(since);
      d.setMonth(since.getMonth() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyMap.set(key, 0);
    }
    for (const row of windowRows) {
      const d = row.createdAt;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthlyMap.set(key, (monthlyMap.get(key) ?? 0) + row.feeAmount);
    }
    const monthly = Array.from(monthlyMap.entries()).map(([month, total]) => ({
      month,
      total: Math.round(total * 100) / 100,
    }));

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthToDate = windowRows
      .filter((r) => r.createdAt >= monthStart)
      .reduce((sum, r) => sum + r.feeAmount, 0);

    const byType = byTypeRaw.map((r) => ({
      feeType: r.feeType,
      total: Math.round((r._sum.feeAmount ?? 0) * 100) / 100,
      count: r._count,
    }));

    return {
      totalRevenue: Math.round((totalAgg._sum.feeAmount ?? 0) * 100) / 100,
      totalFees: totalAgg._count,
      monthToDate: Math.round(monthToDate * 100) / 100,
      byType,
      monthly,
      recent,
      config,
    };
  });

// ─── Paginated revenue ledger ──────────────────────────────────

export const getPlatformRevenueLedger = adminProcedure
  .input(
    z.object({
      feeType: z
        .enum(["CAPITAL_RAISE", "DISTRIBUTION", "SECONDARY_TRADE", "SOURCING", "ALL"])
        .default("ALL"),
      page: z.number().int().positive().default(1),
      limit: z.number().int().positive().max(100).default(25),
    }),
  )
  .query(async ({ input }) => {
    const where: any = {};
    if (input.feeType !== "ALL") where.feeType = input.feeType;

    const [entries, total] = await Promise.all([
      db.platformRevenue.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (input.page - 1) * input.limit,
        take: input.limit,
        include: { property: { select: { id: true, title: true } } },
      }),
      db.platformRevenue.count({ where }),
    ]);

    return {
      entries,
      total,
      page: input.page,
      limit: input.limit,
      totalPages: Math.ceil(total / input.limit),
    };
  });

// ─── Read fee configuration ────────────────────────────────────

export const getPlatformFeeConfig = adminProcedure.query(async () => {
  return getFeeConfig();
});

// ─── Update fee configuration ──────────────────────────────────

export const updatePlatformFeeConfig = adminProcedure
  .input(
    z.object({
      capitalRaiseFeeBps: z.number().int().min(0).max(5000).optional(),
      distributionFeeBps: z.number().int().min(0).max(5000).optional(),
      secondaryTradeFeeBps: z.number().int().min(0).max(5000).optional(),
      sourcingFeeBps: z.number().int().min(0).max(5000).optional(),
      sourcingFlatFee: z.number().min(0).max(10_000_000).optional(),
      enabled: z.boolean().optional(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const data: Record<string, number | boolean> = {};
    if (input.capitalRaiseFeeBps !== undefined) data.capitalRaiseFeeBps = input.capitalRaiseFeeBps;
    if (input.distributionFeeBps !== undefined) data.distributionFeeBps = input.distributionFeeBps;
    if (input.secondaryTradeFeeBps !== undefined) data.secondaryTradeFeeBps = input.secondaryTradeFeeBps;
    if (input.sourcingFeeBps !== undefined) data.sourcingFeeBps = input.sourcingFeeBps;
    if (input.sourcingFlatFee !== undefined) data.sourcingFlatFee = input.sourcingFlatFee;
    if (input.enabled !== undefined) data.enabled = input.enabled;

    const updated = await db.platformFeeConfig.upsert({
      where: { id: PLATFORM_FEE_CONFIG_ID },
      create: { id: PLATFORM_FEE_CONFIG_ID, ...DEFAULT_FEE_CONFIG, ...data, updatedById: ctx.user.id },
      update: { ...data, updatedById: ctx.user.id },
    });

    await createAuditLog(ctx.user.id, "UPDATE", "PlatformFeeConfig", PLATFORM_FEE_CONFIG_ID, {
      changes: data,
    });

    return {
      capitalRaiseFeeBps: updated.capitalRaiseFeeBps,
      distributionFeeBps: updated.distributionFeeBps,
      secondaryTradeFeeBps: updated.secondaryTradeFeeBps,
      sourcingFeeBps: updated.sourcingFeeBps,
      sourcingFlatFee: updated.sourcingFlatFee,
      enabled: updated.enabled,
    };
  });
