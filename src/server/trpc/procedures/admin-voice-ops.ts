import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { protectedProcedure } from "../main";
import { VOICE_AGENT_FEATURE } from "~/server/office/voice-telemetry";

// Voice-agent cost & ops dashboard — ADMIN only. Deliberately NOT exposed to
// investors, owners or other staff roles: this is internal operations data.
const adminOnly = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.role !== "ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

type Metadata = {
  provider?: unknown;
  durationSeconds?: unknown;
  toolCalls?: unknown;
  toolErrors?: unknown;
  sessionErrors?: unknown;
  userTurns?: unknown;
  agentTurns?: unknown;
  qualityScore?: unknown;
  usdPerMinute?: unknown;
};

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === "string" && v.trim() ? v.trim() : "unknown");

export const getVoiceAgentOps = adminOnly
  .input(z.object({ days: z.number().int().min(1).max(180).default(30) }).optional())
  .query(async ({ input }) => {
    const days = input?.days ?? 30;
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);

    const rows = await db.aIUsageLog.findMany({
      where: { feature: VOICE_AGENT_FEATURE, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: 5000,
      select: {
        id: true,
        userId: true,
        model: true,
        costUsd: true,
        status: true,
        createdAt: true,
        metadata: true,
        user: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    let totalSessions = 0;
    let totalDurationSeconds = 0;
    let totalCostUsd = 0;
    let totalToolCalls = 0;
    let totalToolErrors = 0;
    let errorSessions = 0;
    let qualitySum = 0;
    let qualityCount = 0;
    let lowQualitySessions = 0;

    const byProvider = new Map<string, { sessions: number; durationSeconds: number; costUsd: number; errorSessions: number }>();
    const byDay = new Map<string, { sessions: number; durationSeconds: number; costUsd: number }>();

    for (const row of rows) {
      const meta = (row.metadata ?? {}) as Metadata;
      const provider = str(meta.provider);
      const duration = num(meta.durationSeconds);
      const toolCalls = num(meta.toolCalls);
      const toolErrors = num(meta.toolErrors);
      const sessionErrors = num(meta.sessionErrors);
      const cost = num(row.costUsd);
      const errored = row.status === "ERROR" || toolErrors > 0 || sessionErrors > 0;

      totalSessions += 1;
      totalDurationSeconds += duration;
      totalCostUsd += cost;
      totalToolCalls += toolCalls;
      totalToolErrors += toolErrors;
      if (errored) errorSessions += 1;

      if (typeof meta.qualityScore === "number" && Number.isFinite(meta.qualityScore)) {
        qualitySum += meta.qualityScore;
        qualityCount += 1;
        if (meta.qualityScore < 60) lowQualitySessions += 1;
      }

      const p = byProvider.get(provider) ?? { sessions: 0, durationSeconds: 0, costUsd: 0, errorSessions: 0 };
      p.sessions += 1;
      p.durationSeconds += duration;
      p.costUsd += cost;
      if (errored) p.errorSessions += 1;
      byProvider.set(provider, p);

      const dayKey = row.createdAt.toISOString().slice(0, 10);
      const d = byDay.get(dayKey) ?? { sessions: 0, durationSeconds: 0, costUsd: 0 };
      d.sessions += 1;
      d.durationSeconds += duration;
      d.costUsd += cost;
      byDay.set(dayKey, d);
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const round4 = (n: number) => Math.round(n * 10000) / 10000;

    const dailyTrend: { date: string; sessions: number; minutes: number; costUsd: number }[] = [];
    for (let i = 0; i < days; i += 1) {
      const d = new Date(since);
      d.setDate(since.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const entry = byDay.get(key);
      dailyTrend.push({
        date: key,
        sessions: entry?.sessions ?? 0,
        minutes: round2((entry?.durationSeconds ?? 0) / 60),
        costUsd: round4(entry?.costUsd ?? 0),
      });
    }

    const recent = rows.slice(0, 25).map((row) => {
      const meta = (row.metadata ?? {}) as Metadata;
      return {
        id: row.id,
        at: row.createdAt.toISOString(),
        userId: row.userId,
        userLabel: row.user ? (row.user.name || row.user.email) : "Unknown",
        userRole: row.user?.role ?? null,
        provider: str(meta.provider),
        model: row.model,
        durationSeconds: num(meta.durationSeconds),
        toolCalls: num(meta.toolCalls),
        toolErrors: num(meta.toolErrors),
        sessionErrors: num(meta.sessionErrors),
        userTurns: num(meta.userTurns),
        agentTurns: num(meta.agentTurns),
        qualityScore: typeof meta.qualityScore === "number" ? Math.round(meta.qualityScore) : null,
        costUsd: round4(num(row.costUsd)),
        status: row.status,
      };
    });

    return {
      windowDays: days,
      since: since.toISOString(),
      estimated: true as const,
      totals: {
        sessions: totalSessions,
        totalMinutes: round2(totalDurationSeconds / 60),
        avgMinutes: totalSessions ? round2(totalDurationSeconds / 60 / totalSessions) : 0,
        estCostUsd: round2(totalCostUsd),
        toolCalls: totalToolCalls,
        toolErrors: totalToolErrors,
        errorSessions,
        errorRatePct: totalSessions ? round2((errorSessions / totalSessions) * 100) : 0,
        avgQualityScore: qualityCount ? Math.round(qualitySum / qualityCount) : null,
        qualityScored: qualityCount,
        lowQualitySessions,
      },
      byProvider: [...byProvider.entries()]
        .map(([provider, v]) => ({
          provider,
          sessions: v.sessions,
          minutes: round2(v.durationSeconds / 60),
          estCostUsd: round2(v.costUsd),
          errorSessions: v.errorSessions,
        }))
        .sort((a, b) => b.sessions - a.sessions),
      dailyTrend,
      recent,
    };
  });
