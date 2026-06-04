/**
 * AI Strategy 2.1 — Independent AI Underwriting (Investprop Confidence Rating)
 *
 * Cross-checks sponsor numbers against:
 *  - Comparable published opportunities on the platform
 *  - Stress test (vacancy +2pp, rent -10%, build-cost +15%, exit cap +50bp)
 * Produces a sponsor-independent A-E Confidence Rating + risk score 0-100
 * + narrative + structured stress-test output. Persisted on Property.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { generateText } from "ai";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";
import { getModel, getModelId, runAIWithGuard, safeParseJson } from "~/server/ai/client";
import { buildPropertyContext, findComparables } from "~/server/ai/property-context";

interface UnderwritingShape {
  confidenceRating: "A" | "B" | "C" | "D" | "E";
  riskScore: number;
  summary: string;
  comparableAnalysis: string;
  stressTest: {
    scenario: string;
    baseValue: string;
    stressedValue: string;
    impact: string;
  }[];
  deviations: { metric: string; sponsorValue: string; platformView: string; severity: "LOW" | "MEDIUM" | "HIGH" }[];
  recommendations: string[];
}

const RATINGS = new Set(["A", "B", "C", "D", "E"]);

function normalise(parsed: unknown): UnderwritingShape | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Partial<UnderwritingShape>;
  if (typeof p.summary !== "string") return null;
  const rating = RATINGS.has(p.confidenceRating ?? "") ? p.confidenceRating! : "C";
  const score = Math.max(0, Math.min(100, Math.round(Number(p.riskScore ?? 50))));
  return {
    confidenceRating: rating,
    riskScore: score,
    summary: p.summary,
    comparableAnalysis: p.comparableAnalysis ?? "",
    stressTest: Array.isArray(p.stressTest) ? p.stressTest.slice(0, 8) : [],
    deviations: Array.isArray(p.deviations) ? p.deviations.slice(0, 8) : [],
    recommendations: Array.isArray(p.recommendations) ? p.recommendations.slice(0, 8) : [],
  };
}

export const runUnderwriting = baseProcedure
  .input(z.object({ authToken: z.string(), propertyId: z.number(), force: z.boolean().optional() }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    // Underwriting is a platform action — restrict to staff or admin to control cost.
    requireRole(user, ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"]);

    const ctx = await buildPropertyContext(input.propertyId, {
      includeFinancials: true,
      includeMilestones: true,
      includeBudget: true,
      includeRisks: true,
    });
    if (!ctx) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });

    const comps = await findComparables(input.propertyId, 6);

    const systemPrompt = `You are Investprop's independent underwriter — a sponsor-independent second opinion on a fractional-ownership opportunity on a South African platform.

Your job: stress-test the sponsor's assumptions, compare to platform comparables, and assign an Investprop Confidence Rating (A best, E worst).

Return ONLY JSON in this exact shape (no prose, no fences):
{
  "confidenceRating": "A" | "B" | "C" | "D" | "E",
  "riskScore": <integer 0-100, higher = more risk>,
  "summary": "<120-180 word independent assessment, second person addressing the investor reader, balanced (downside first), South African context (Rand, SARB, FSCA, transfer duty, Sec 96 prospectus).>",
  "comparableAnalysis": "<80-150 words: how does this deal stack up against the platform comparables provided? Quantify with numbers.>",
  "stressTest": [
    { "scenario": "<e.g. 'Vacancy +2pp'>", "baseValue": "<sponsor's metric and number>", "stressedValue": "<recalculated number>", "impact": "<one-sentence what-this-means>" }
  ],
  "deviations": [
    { "metric": "<e.g. 'ARV vs. comp median'>", "sponsorValue": "<R or %>", "platformView": "<R or %>", "severity": "LOW" | "MEDIUM" | "HIGH" }
  ],
  "recommendations": ["<imperative bullet, max 12 words>"]
}

Rating rubric:
- A: deal numbers conservative or consistent with comps, stress tests still profitable, clear documents pack.
- B: minor optimism (5-10% off comp median), stress test stays positive.
- C: notable optimism (10-20% off) OR thin documentation, stress test breaks even.
- D: aggressive optimism (>20%), stress test loses money, weak sponsor track record.
- E: red flags — missing fundamentals, unrealistic returns, governance gaps.

Stress test rules (apply only those relevant to deal type):
- RENTAL: vacancy +2pp, rent -10%, interest +100bp, exit cap +50bp.
- FLIP: ARV -10%, reno cost +15%, hold +60 days.
- DEVELOPMENT: hard costs +15%, sale price/unit -10%, timeline +25%, exit cap +50bp.

Be specific with numbers. Recalculate ROI/IRR/DSCR under each stress scenario.`;

    const userPrompt = `${ctx.text}

COMPARABLES (other published ${ctx.propertyType} opportunities on this platform):
${comps.length > 0 ? comps.map((c) => `- #${c.id} ${c.title} (${c.city}) — R${Math.round(c.price).toLocaleString()} | ${c.metrics}`).join("\n") : "(no comparables on platform yet — be explicit about that limitation in your assessment)"}

Return the JSON object now.`;

    const result = await runAIWithGuard({
      userId: user.id,
      feature: "underwriting",
      model: getModelId("premium"), // worth premium model for this
      metadata: { propertyId: input.propertyId },
      run: () => generateText({ model: getModel("premium"), system: systemPrompt, prompt: userPrompt }),
      extractUsage: (r) => ({ promptTokens: r.usage?.promptTokens, completionTokens: r.usage?.completionTokens }),
    });

    const parsed = normalise(safeParseJson(result.text));
    if (!parsed) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI returned an unparseable underwriting." });
    }

    await db.property.update({
      where: { id: input.propertyId },
      data: {
        aiConfidenceRating: parsed.confidenceRating,
        aiConfidenceJustification: parsed.summary,
        aiRiskScore: parsed.riskScore,
        aiUnderwriting: {
          comparableAnalysis: parsed.comparableAnalysis,
          stressTest: parsed.stressTest,
          deviations: parsed.deviations,
          recommendations: parsed.recommendations,
          comparablesUsed: comps.map((c) => ({ id: c.id, title: c.title })),
        },
        aiUnderwrittenAt: new Date(),
      },
    });

    return parsed;
  });

export const getUnderwriting = baseProcedure
  .input(z.object({ authToken: z.string(), propertyId: z.number() }))
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    const p = await db.property.findUnique({
      where: { id: input.propertyId },
      select: {
        aiConfidenceRating: true,
        aiConfidenceJustification: true,
        aiRiskScore: true,
        aiUnderwriting: true,
        aiUnderwrittenAt: true,
      },
    });
    if (!p || !p.aiConfidenceRating) return null;
    return {
      confidenceRating: p.aiConfidenceRating as "A" | "B" | "C" | "D" | "E",
      riskScore: p.aiRiskScore,
      summary: p.aiConfidenceJustification,
      underwriting: p.aiUnderwriting as Record<string, unknown> | null,
      generatedAt: p.aiUnderwrittenAt,
    };
  });
