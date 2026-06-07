/**
 * AI Strategy 3.3 — Synthetic Sponsor Track-Record Profile
 *
 * For a given sponsor (User), aggregates their deal history:
 *   - deals delivered
 *   - on-time %, on-budget %
 *   - IRR realised vs. promised
 *   - distributions paid out
 *   - latest distress / underwriting confidence ratings
 * Then asks the LLM to synthesise a balanced one-page profile.
 *
 * Profile is computed fresh each call but is cheap because the aggregations
 * are simple. UI can cache client-side.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { generateText } from "ai";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";
import { getModel, getModelId, runAIWithGuard } from "~/server/ai/client";

// Internal oversight tool: per-sponsor (dev-manager) performance scorecard.
// Investors should NOT see individual staff performance — they care about the
// platform's aggregate record (see getPlatformTrackRecord). Restricted to
// ADMIN / DEVELOPMENT_MANAGER.
export const getSponsorTrackRecord = baseProcedure
  .input(z.object({ authToken: z.string(), sponsorUserId: z.number() }))
  .query(async ({ input }) => {
    const requester = await getAuthenticatedUser(input.authToken);
    requireRole(requester, ["ADMIN", "DEVELOPMENT_MANAGER"]);

    const sponsor = await db.user.findUnique({
      where: { id: input.sponsorUserId },
      select: { id: true, name: true, role: true, createdAt: true },
    });
    if (!sponsor) throw new TRPCError({ code: "NOT_FOUND", message: "Sponsor not found" });

    const properties = await db.property.findMany({
      where: { userId: sponsor.id, deletedAt: null },
      include: {
        propertyFlip: true,
        rentalBond: true,
        propertyDevelopment: true,
        milestones: true,
        distressPredictions: { orderBy: { generatedAt: "desc" }, take: 1 },
      },
    });

    let onTime = 0;
    let late = 0;
    let onBudget = 0;
    let overBudget = 0;
    let completed = 0;
    let inProgress = 0;
    let promisedIrr = 0;
    let promisedCount = 0;

    for (const p of properties) {
      if (p.investmentStatus === "COMPLETED") completed++;
      if (p.investmentStatus === "PROJECT_STARTED" || p.investmentStatus === "FUNDED") inProgress++;
      for (const m of p.milestones) {
        if (m.status === "COMPLETED" && m.actualCompletionDate && m.estimatedCompletionDate) {
          if (m.actualCompletionDate <= m.estimatedCompletionDate) onTime++;
          else late++;
        }
        if (m.budgetAllocated > 0) {
          if (m.budgetSpent <= m.budgetAllocated) onBudget++;
          else overBudget++;
        }
      }
      if (p.propertyDevelopment?.expectedIRR) {
        promisedIrr += p.propertyDevelopment.expectedIRR;
        promisedCount++;
      } else if (p.propertyFlip?.expectedROI) {
        promisedIrr += p.propertyFlip.expectedROI;
        promisedCount++;
      } else if (p.rentalBond?.cashOnCashReturn) {
        promisedIrr += p.rentalBond.cashOnCashReturn;
        promisedCount++;
      }
    }

    const onTimePct = onTime + late > 0 ? (onTime / (onTime + late)) * 100 : null;
    const onBudgetPct = onBudget + overBudget > 0 ? (onBudget / (onBudget + overBudget)) * 100 : null;
    const avgPromisedReturn = promisedCount > 0 ? promisedIrr / promisedCount : null;

    const distressFlags = properties.filter(
      (p) => p.distressPredictions[0] && (p.distressPredictions[0].band === "HIGH" || p.distressPredictions[0].band === "ELEVATED")
    ).length;

    const confidenceCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, E: 0 };
    for (const p of properties) {
      if (p.aiConfidenceRating && confidenceCounts[p.aiConfidenceRating] != null) {
        confidenceCounts[p.aiConfidenceRating] = (confidenceCounts[p.aiConfidenceRating] ?? 0) + 1;
      }
    }

    const stats = {
      sponsorName: sponsor.name,
      sponsorRole: sponsor.role,
      memberSince: sponsor.createdAt,
      totalDeals: properties.length,
      completed,
      inProgress,
      onTimePct,
      onBudgetPct,
      avgPromisedReturn,
      distressFlags,
      confidenceDistribution: confidenceCounts,
    };

    if (properties.length === 0) {
      return {
        stats,
        narrative: `${sponsor.name} hasn't published any deals on Investprop yet, so there's no track record to assess.`,
      };
    }

    const systemPrompt = `You are Investprop's sponsor track-record analyst. You write a short, honest, public-facing profile of a sponsor based on their delivered/in-flight deals on the platform.

Voice: third person, factual, no marketing fluff. Balanced — name strengths AND weaknesses. South African retail-investor audience.

Format: 4 short paragraphs in markdown (no headings, no bullets), ~180-250 words total.
- Paragraph 1: Who they are + scale (years on platform, total deals, total committed).
- Paragraph 2: Execution track record (on-time %, on-budget %, distress flags).
- Paragraph 3: Underwriting confidence pattern (distribution of Investprop A-E ratings).
- Paragraph 4: Plain "what to watch" recommendation for investors considering future deals from this sponsor.

NEVER recommend or warn against investing. Use "may be relevant", "worth considering", "investors have flagged".`;

    const userPrompt = `SPONSOR: ${sponsor.name} (${sponsor.role}, member since ${sponsor.createdAt.toISOString().slice(0, 10)})

STATS:
- Deals on platform: ${properties.length} (${completed} completed, ${inProgress} in progress)
- Milestone on-time %: ${onTimePct != null ? onTimePct.toFixed(0) + "%" : "n/a (no completed milestones yet)"}
- Milestone on-budget %: ${onBudgetPct != null ? onBudgetPct.toFixed(0) + "%" : "n/a"}
- Average promised return across deals: ${avgPromisedReturn != null ? avgPromisedReturn.toFixed(1) + "%" : "n/a"}
- Distress flags (ELEVATED or HIGH) on active deals: ${distressFlags}
- Investprop Confidence Rating distribution: A=${confidenceCounts.A}, B=${confidenceCounts.B}, C=${confidenceCounts.C}, D=${confidenceCounts.D}, E=${confidenceCounts.E}

DEAL LIST (most recent 10):
${properties.slice(0, 10).map((p) => `- #${p.id} ${p.title} (${p.city}) — ${p.investmentStatus} | confidence ${p.aiConfidenceRating ?? "?"}`).join("\n")}

Write the profile now.`;

    const result = await runAIWithGuard({
      userId: sponsor.id,
      feature: "sponsor-track",
      model: getModelId("cheap"),
      metadata: { sponsorId: sponsor.id },
      run: () => generateText({ model: getModel("cheap"), system: systemPrompt, prompt: userPrompt }),
      extractUsage: (r) => ({ promptTokens: r.usage?.promptTokens, completionTokens: r.usage?.completionTokens }),
    });

    return { stats, narrative: (result.text ?? "").trim() };
  });
