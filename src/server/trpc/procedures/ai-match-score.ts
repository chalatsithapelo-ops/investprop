/**
 * AI Strategy 1.2 — Personalised Risk Match Score
 *
 * Combines investor's appropriatenessAssessment + portfolio concentration +
 * deal riskRating + AI confidence rating into a 0-100 match score with a
 * plain-language "why this fits / doesn't fit you" justification.
 *
 * Result is per-investor × per-deal and cached for 24h via in-memory map
 * (cheap, deals/investors change slowly).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { generateText } from "ai";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { getModel, getModelId, runAIWithGuard, safeParseJson } from "~/server/ai/client";

type CacheEntry = {
  score: number;
  band: "STRONG_MATCH" | "GOOD_MATCH" | "FAIR_MATCH" | "POOR_MATCH" | "MISMATCH";
  justification: string;
  factors: { label: string; weight: number; positive: boolean }[];
  generatedAt: number;
};
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const key = (uid: number, pid: number) => `${uid}:${pid}`;

function bandFromScore(s: number): CacheEntry["band"] {
  if (s >= 80) return "STRONG_MATCH";
  if (s >= 65) return "GOOD_MATCH";
  if (s >= 50) return "FAIR_MATCH";
  if (s >= 30) return "POOR_MATCH";
  return "MISMATCH";
}

interface AssessmentShape {
  experience?: string;
  income?: string;
  netWorth?: string;
  tolerance?: string;
  horizon?: string;
  goals?: string[] | string;
}

async function computeMatch(userId: number, propertyId: number): Promise<CacheEntry> {
  const k = key(userId, propertyId);
  const hit = cache.get(k);
  if (hit && Date.now() - hit.generatedAt < CACHE_TTL_MS) return hit;

  const [user, property, portfolio] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        appropriatenessAssessment: true,
        appropriatenessCompletedAt: true,
        ficaVerified: true,
        investorPreferences: true,
      },
    }),
    db.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        title: true,
        price: true,
        riskRating: true,
        aiConfidenceRating: true,
        aiRiskScore: true,
        expectedReturns: true,
        minimumInvestment: true,
        investmentStatus: true,
        city: true,
        state: true,
        propertyFlip: { select: { expectedROI: true, daysToComplete: true } },
        rentalBond: { select: { capRate: true, cashOnCashReturn: true } },
        propertyDevelopment: { select: { developmentTimelineMonths: true, expectedIRR: true, developmentType: true } },
      },
    }),
    db.investorContribution.findMany({
      where: { investorId: userId, deletedAt: null, status: { not: "CANCELLED" } },
      select: {
        contributionAmount: true,
        property: { select: { id: true, city: true, riskRating: true, propertyFlip: { select: { id: true } }, rentalBond: { select: { id: true } }, propertyDevelopment: { select: { id: true } } } },
      },
    }),
  ]);

  if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });

  const assessment = (user?.appropriatenessAssessment as AssessmentShape | null) ?? null;
  const totalCommitted = portfolio.reduce((s, c) => s + c.contributionAmount, 0);

  // Concentration analysis
  const byCity = new Map<string, number>();
  const byType = new Map<string, number>();
  const byRisk = new Map<string, number>();
  for (const c of portfolio) {
    byCity.set(c.property.city, (byCity.get(c.property.city) ?? 0) + c.contributionAmount);
    byRisk.set(c.property.riskRating, (byRisk.get(c.property.riskRating) ?? 0) + c.contributionAmount);
    const t = c.property.propertyFlip ? "flip" : c.property.rentalBond ? "rental" : c.property.propertyDevelopment ? "development" : "other";
    byType.set(t, (byType.get(t) ?? 0) + c.contributionAmount);
  }
  const thisType = property.propertyFlip ? "flip" : property.rentalBond ? "rental" : property.propertyDevelopment ? "development" : "other";
  const cityShare = totalCommitted > 0 ? ((byCity.get(property.city) ?? 0) / totalCommitted) * 100 : 0;
  const typeShare = totalCommitted > 0 ? ((byType.get(thisType) ?? 0) / totalCommitted) * 100 : 0;

  const dealLine = property.propertyFlip
    ? `flip, expected ROI ${property.propertyFlip.expectedROI.toFixed(1)}%, ~${property.propertyFlip.daysToComplete}d hold`
    : property.rentalBond
      ? `rental, cap rate ${property.rentalBond.capRate.toFixed(1)}%, CoC ${property.rentalBond.cashOnCashReturn.toFixed(1)}%`
      : property.propertyDevelopment
        ? `development (${property.propertyDevelopment.developmentType}), IRR ${property.propertyDevelopment.expectedIRR.toFixed(1)}%, ${property.propertyDevelopment.developmentTimelineMonths}mo`
        : "uncategorised";

  const systemPrompt = `You are a personalisation engine for Investprop's South African fractional-property platform. Your job: score how well a single deal matches a single investor, given their FSCA appropriateness profile + their current portfolio.

Return ONLY a JSON object, no prose, no code fences, in this exact shape:
{
  "score": <integer 0-100>,
  "justification": "<60-120 word plain-English explanation, second person ('you'), South African context, balanced (call out both fit and friction). Never give advice — use phrases like 'may suit', 'worth considering', 'consider whether'.>",
  "factors": [
    { "label": "<3-5 word factor name>", "weight": <integer 1-25>, "positive": <true|false> }
  ]
}

Scoring rubric:
- Risk tolerance vs. deal risk rating: largest single contributor (up to ±30 pts)
- Experience level vs. deal complexity (flip < rental < development): ±15 pts
- Concentration: penalise if this would push city share or type share above 50% of portfolio
- Minimum investment vs. inferred income/net-worth band: penalise if minimum > ~20% of stated net-worth
- AI Confidence Rating (A best, E worst): ±10 pts
- Liquidity expectation (cooling-off only, share marketplace thin): mention if horizon is short
- Diversification bonus if this fills a gap (new city or new type)

If the investor has NOT completed the appropriateness questionnaire, give a neutral baseline score (50-60) and explicitly tell them to complete it for a better match.`;

  const userPrompt = `INVESTOR PROFILE:
- Appropriateness completed: ${user?.appropriatenessCompletedAt ? "yes (" + user.appropriatenessCompletedAt.toISOString().slice(0, 10) + ")" : "NO"}
- FICA verified: ${user?.ficaVerified ? "yes" : "no"}
- Self-assessed: experience=${assessment?.experience ?? "?"}, income=${assessment?.income ?? "?"}, netWorth=${assessment?.netWorth ?? "?"}, tolerance=${assessment?.tolerance ?? "?"}, horizon=${assessment?.horizon ?? "?"}
- Portfolio so far: ${portfolio.length} deals, R${Math.round(totalCommitted).toLocaleString()} total committed
- Concentration: ${cityShare.toFixed(0)}% in ${property.city}, ${typeShare.toFixed(0)}% in ${thisType}s

DEAL:
- ${property.title} (${property.city}, ${property.state})
- Listed R${Math.round(property.price).toLocaleString()}, minimum investment R${Math.round(property.minimumInvestment).toLocaleString()}
- ${dealLine}
- Sponsor risk rating: ${property.riskRating}
- Investprop Confidence Rating: ${property.aiConfidenceRating ?? "not rated yet"} ${property.aiRiskScore != null ? "(score " + property.aiRiskScore.toFixed(0) + "/100)" : ""}
- Status: ${property.investmentStatus}

Return the JSON object now.`;

  const result = await runAIWithGuard({
    userId,
    feature: "chat", // share quota with chat; cheap calls
    model: getModelId("cheap"),
    metadata: { propertyId, kind: "match-score" },
    run: () =>
      generateText({ model: getModel("cheap"), system: systemPrompt, prompt: userPrompt }),
    extractUsage: (r) => ({ promptTokens: r.usage?.promptTokens, completionTokens: r.usage?.completionTokens }),
  });

  const parsed = safeParseJson<{
    score: number;
    justification: string;
    factors: { label: string; weight: number; positive: boolean }[];
  }>(result.text);

  const score = Math.max(0, Math.min(100, Math.round(parsed?.score ?? 50)));
  const entry: CacheEntry = {
    score,
    band: bandFromScore(score),
    justification: parsed?.justification ?? "We couldn't generate a personalised assessment for this deal. Complete your appropriateness questionnaire for tailored matches.",
    factors: Array.isArray(parsed?.factors) ? parsed!.factors.slice(0, 6) : [],
    generatedAt: Date.now(),
  };
  cache.set(k, entry);
  return entry;
}

export const getMatchScore = baseProcedure
  .input(z.object({ authToken: z.string(), propertyId: z.number() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    if (user.role !== "INVESTOR" && user.role !== "ADMIN") {
      return null; // Match score is only meaningful for investors
    }
    return computeMatch(user.id, input.propertyId);
  });

export const getMatchScoresBatch = baseProcedure
  .input(z.object({ authToken: z.string(), propertyIds: z.array(z.number()).max(20) }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    if (user.role !== "INVESTOR" && user.role !== "ADMIN") return [];
    // Only return cache hits in batch mode (don't burn quota on a grid view).
    return input.propertyIds.map((pid) => {
      const hit = cache.get(key(user.id, pid));
      if (!hit) return { propertyId: pid, score: null, band: null };
      return { propertyId: pid, score: hit.score, band: hit.band };
    });
  });
