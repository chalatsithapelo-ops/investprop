/**
 * AI Strategy 3.2 — Predictive Distress / Early-Warning Engine
 *
 * Score 0..100 of how likely a deal is heading toward delay / over-budget /
 * abandonment. Uses LLM-as-judge over: milestone schedule vs. actuals,
 * budget burn vs. allocation, recent variation orders, risk entries, sponsor
 * comms cadence. Stored as DistressPrediction.
 *
 * Run on-demand from admin; cron job can be added later.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { generateText } from "ai";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";
import { getModel, getModelId, runAIWithGuard, safeParseJson } from "~/server/ai/client";
import { buildPropertyContext } from "~/server/ai/property-context";

interface DistressShape {
  score: number;
  band: "LOW" | "MODERATE" | "ELEVATED" | "HIGH";
  drivers: { factor: string; weight: number; value: string; narrative: string }[];
  narrative: string;
}

const BANDS = new Set(["LOW", "MODERATE", "ELEVATED", "HIGH"]);

function bandFromScore(s: number): DistressShape["band"] {
  if (s >= 75) return "HIGH";
  if (s >= 55) return "ELEVATED";
  if (s >= 30) return "MODERATE";
  return "LOW";
}

export const predictDistress = baseProcedure
  .input(z.object({ authToken: z.string(), propertyId: z.number() }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["ADMIN", "DEVELOPMENT_MANAGER"]);

    const ctx = await buildPropertyContext(input.propertyId, {
      includeFinancials: true,
      includeMilestones: true,
      includeBudget: true,
      includeRisks: true,
    });
    if (!ctx) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });

    // Extra signals: variations, recent photo checks
    const [variationCount, recentAmberRedChecks] = await Promise.all([
      db.variationOrder.count({ where: { workOrder: { propertyId: input.propertyId } } }).catch(() => 0),
      db.constructionPhotoCheck.count({
        where: {
          propertyId: input.propertyId,
          verdict: { in: ["AMBER", "RED"] },
          generatedAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
        },
      }).catch(() => 0),
    ]);

    const systemPrompt = `You are Investprop's Predictive Distress Engine. You judge how likely a deal is heading toward serious trouble (delay > 60d, budget overrun > 20%, abandonment, investor complaints).

Return ONLY JSON in this exact shape (no prose, no code fences):
{
  "score": <integer 0-100, higher = more distressed>,
  "band": "LOW" | "MODERATE" | "ELEVATED" | "HIGH",
  "drivers": [
    { "factor": "<e.g. 'Schedule slippage'>", "weight": <integer 1-30>, "value": "<observed metric, short>", "narrative": "<1-sentence what-this-means>" }
  ],
  "narrative": "<120-180 word independent diagnostic. What's working, what's worrying, recommended sponsor action.>"
}

Scoring rubric (start at 0, add):
- Each milestone DELAYED but still IN_PROGRESS: +8 (max +25)
- Each milestone past estimatedCompletionDate by 30+ days: +12
- Budget spent >100% of allocation on any milestone: +15
- Budget spent <30% with elapsed time >70% of plan: +12 (likely under-reporting or stalled)
- 3+ variation orders: +10
- Recent AMBER photo check: +8 each (max +25)
- Recent RED photo check: +15 each
- Open HIGH/CRITICAL risk entries: +10 each (max +20)
- No milestone updates in last 60 days: +15
- No budget entries in last 45 days: +10

Cap at 100. Show your math in the drivers list — every contributor must appear.`;

    const userPrompt = `${ctx.text}

SIGNALS:
- Variation orders total: ${variationCount}
- AMBER/RED photo checks in last 90 days: ${recentAmberRedChecks}

Return the JSON object now.`;

    const result = await runAIWithGuard({
      userId: user.id,
      feature: "distress",
      model: getModelId("premium"),
      metadata: { propertyId: input.propertyId },
      run: () => generateText({ model: getModel("premium"), system: systemPrompt, prompt: userPrompt }),
      extractUsage: (r) => ({ promptTokens: r.usage?.promptTokens, completionTokens: r.usage?.completionTokens }),
    });

    const parsed = safeParseJson<DistressShape>(result.text);
    if (!parsed?.narrative) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Distress engine returned an unparseable response." });
    }
    const score = Math.max(0, Math.min(100, Math.round(parsed.score ?? 0)));
    const band = BANDS.has(parsed.band) ? parsed.band : bandFromScore(score);

    return db.distressPrediction.create({
      data: {
        propertyId: input.propertyId,
        score,
        band,
        drivers: (parsed.drivers ?? []).slice(0, 12),
        narrative: parsed.narrative,
      },
    });
  });

export const getLatestDistress = baseProcedure
  .input(z.object({ authToken: z.string(), propertyId: z.number() }))
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    return db.distressPrediction.findFirst({
      where: { propertyId: input.propertyId },
      orderBy: { generatedAt: "desc" },
    });
  });

export const listDistressedPortfolio = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["ADMIN", "DEVELOPMENT_MANAGER"]);

    // Latest prediction per property
    const all = await db.distressPrediction.findMany({
      orderBy: { generatedAt: "desc" },
      include: { property: { select: { id: true, title: true, city: true } } },
    });
    const latestByProperty = new Map<number, (typeof all)[number]>();
    for (const p of all) {
      if (!latestByProperty.has(p.propertyId)) latestByProperty.set(p.propertyId, p);
    }
    return Array.from(latestByProperty.values())
      .filter((p) => p.band === "ELEVATED" || p.band === "HIGH")
      .sort((a, b) => b.score - a.score);
  });
