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
import { calculateRentalMetrics, type RentalPropertyInput } from "~/financial-calculations";
import { HOLDING_BASIS, liveHoldingSelect, readCompletedProfile, summariseLiveHoldings } from "./ai-investor-profile";

type CacheEntry = {
  score: number;
  band: "STRONG_MATCH" | "GOOD_MATCH" | "FAIR_MATCH" | "POOR_MATCH" | "MISMATCH";
  justification: string;
  factors: { label: string; weight: number; positive: boolean }[];
  generatedAt: number;
  profilePortfolioKey: string;
  contextKey: string;
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

const matchProfileSelect = {
  id: true, appropriatenessAssessment: true, appropriatenessCompletedAt: true, ficaVerified: true,
} as const;

async function computeMatch(userId: number, propertyId: number): Promise<CacheEntry> {
  const k = key(userId, propertyId);
  const [user, property, holdings, contributions] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: matchProfileSelect,
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
        rentalBond: {
          select: {
            purchasePrice: true, monthlyRent: true, annualPropertyTax: true, annualInsurance: true,
            monthlyHOAFees: true, monthlyMaintenanceReserve: true, monthlyUtilities: true, monthlyManagementFee: true,
            vacancyRate: true, appreciationRate: true, capRate: true, cashOnCashReturn: true,
            grossRentMultiplier: true, debtServiceCoverageRatio: true, grossYield: true, netYield: true,
            downPaymentAmount: true, loanAmount: true, bondAmount: true, interestRate: true, loanTermYears: true,
            monthlyDebtService: true, totalInvestmentBudget: true, spentInvestmentBudget: true,
          },
        },
        propertyDevelopment: { select: { developmentTimelineMonths: true, expectedIRR: true, developmentType: true } },
      },
    }),
    db.shareHolding.findMany({
      where: { investorId: userId, sharesOwned: { gt: 0 } },
      select: liveHoldingSelect,
      orderBy: { shareClassId: "asc" },
    }),
    db.investorContribution.findMany({
      where: { investorId: userId, deletedAt: null, status: { not: "CANCELLED" } },
      select: {
        contributionAmount: true,
      },
    }),
  ]);

  if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });

  const assessment = readCompletedProfile(user?.appropriatenessAssessment, user?.appropriatenessCompletedAt);
  const totalCommitted = contributions.reduce((s, c) => s + c.contributionAmount, 0);
  const profilePortfolioKey = JSON.stringify([user, holdings, totalCommitted]);
  const hit = cache.get(k);
  const contextKey = JSON.stringify(property);
  if (hit && hit.profilePortfolioKey === profilePortfolioKey && hit.contextKey === contextKey && Date.now() - hit.generatedAt < CACHE_TTL_MS) return hit;

  const portfolio = summariseLiveHoldings(holdings);
  const { total, byCity, byType } = portfolio;
  const thisType = property.propertyFlip ? "flip" : property.rentalBond ? "rental" : property.propertyDevelopment ? "development" : "other";
  const cityShare = total > 0 ? ((byCity.get(property.city) ?? 0) / total) * 100 : 0;
  const typeShare = total > 0 ? ((byType.get(thisType) ?? 0) / total) * 100 : 0;

  let rentalDealLine = "";
  if (property.rentalBond) {
    const r = property.rentalBond;
    const rentalInput: RentalPropertyInput = {
      purchasePrice: r.purchasePrice || property.price || 0,
      monthlyRent: r.monthlyRent ?? 0,
      annualPropertyTax: r.annualPropertyTax ?? 0,
      annualInsurance: r.annualInsurance ?? 0,
      monthlyHOAFees: r.monthlyHOAFees ?? 0,
      monthlyMaintenanceReserve: r.monthlyMaintenanceReserve ?? 0,
      monthlyUtilities: r.monthlyUtilities ?? 0,
      monthlyManagementFee: r.monthlyManagementFee ?? 0,
      vacancyRate: r.vacancyRate ?? 5,
      appreciationRate: r.appreciationRate ?? 3,
      capRate: r.capRate ?? 0,
      cashOnCashReturn: r.cashOnCashReturn ?? 0,
      grossRentMultiplier: r.grossRentMultiplier ?? 0,
      debtServiceCoverageRatio: r.debtServiceCoverageRatio ?? 0,
      grossYield: r.grossYield ?? 0,
      netYield: r.netYield ?? 0,
      downPaymentAmount: r.downPaymentAmount ?? 0,
      loanAmount: r.loanAmount || r.bondAmount || 0,
      interestRate: r.interestRate ?? 0,
      loanTermYears: r.loanTermYears ?? 0,
      monthlyDebtService: r.monthlyDebtService ?? 0,
      totalInvestmentBudget: r.totalInvestmentBudget ?? 0,
      spentInvestmentBudget: r.spentInvestmentBudget ?? 0,
    };
    const rc = calculateRentalMetrics(rentalInput);
    rentalDealLine = `rental, cap rate ${rc.displayCapRate.toFixed(1)}%, CoC ${rc.cashOnCashReturn.toFixed(1)}%`;
  }

  const dealLine = property.propertyFlip
    ? `flip, expected ROI ${property.propertyFlip.expectedROI.toFixed(1)}%, ~${property.propertyFlip.daysToComplete}d hold`
    : property.rentalBond
      ? rentalDealLine
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
- Maximum affordable loss in Rand vs. minimum investment and capital-at-risk: largest single contributor (up to ±30 pts). Do not convert this amount into an invented LOW/MEDIUM/HIGH risk tolerance.
- Experience level vs. deal complexity (flip < rental < development): ±15 pts
- Concentration: discuss current live ownership city/type percentages; no proposed investment amount was supplied, so do not claim a calculated post-purchase concentration. Historical contributions are not current ownership.
- Minimum investment vs. stated annual income/net-worth bands: treat bands as ranges, not exact amounts; do not invent values or affordability guarantees.
- AI Confidence Rating (A best, E worst): ±10 pts
- Liquidity: use the explicit illiquidity/cooling-off acknowledgements; no investment horizon was collected, so do not invent one.
- Diversification bonus if this fills a gap (new city or new type)

If the investor has NOT completed the appropriateness questionnaire, give a neutral baseline score (50-60) and explicitly tell them to complete it for a better match.`;

  const userPrompt = `INVESTOR PROFILE:
- Appropriateness completed and server-validated: ${assessment ? "yes" : "NO (missing, invalid or unacknowledged profile)"}
- FICA verified: ${user?.ficaVerified ? "yes" : "no"}
- Self-assessed: investmentExperience=${assessment?.investmentExperience ?? "?"}, annualIncome=${assessment?.annualIncome ?? "?"}, netWorth=${assessment?.netWorth ?? "?"}, maxLossTolerance (Rand)=${assessment?.maxLossTolerance ?? "?"}
- Explicit acknowledgements: illiquid=${assessment?.understandsIlliquid ?? "?"}, lossOfCapital=${assessment?.understandsLossOfCapital ?? "?"}, coolingOff=${assessment?.understandsCoolingOff ?? "?"}
- Live ownership: ${portfolio.propertyCount} properties, R${Math.round(total).toLocaleString()} on a cost/indicative basis
- Basis: ${HOLDING_BASIS}
- Unpriced positive holdings: ${portfolio.unpricedCount}; percentages exclude these and may be incomplete
- Actual contribution history (not current ownership): ${contributions.length} records, R${Math.round(totalCommitted).toLocaleString()} non-cancelled, non-deleted contributions
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

  const candidateScore = typeof parsed?.score === "number" && Number.isFinite(parsed.score) ? parsed.score : 50;
  const score = assessment ? Math.max(0, Math.min(100, Math.round(candidateScore))) : 50;
  const entry: CacheEntry = {
    score,
    band: bandFromScore(score),
    justification: !assessment ? "Complete your appropriateness questionnaire and acknowledge all key risks for a personalised match. This is a neutral baseline, not an affordability assessment." : typeof parsed?.justification === "string" ? parsed.justification : "We couldn't generate a personalised assessment for this deal.",
    factors: assessment && Array.isArray(parsed?.factors) ? parsed.factors.filter((f) => f && typeof f.label === "string" && Number.isFinite(f.weight) && f.weight >= 1 && f.weight <= 25 && typeof f.positive === "boolean").slice(0, 6) : [],
    generatedAt: Date.now(),
    profilePortfolioKey,
    contextKey,
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
    const { profilePortfolioKey: _profile, contextKey: _context, ...result } = await computeMatch(user.id, input.propertyId);
    return result;
  });

export const getMatchScoresBatch = baseProcedure
  .input(z.object({ authToken: z.string(), propertyIds: z.array(z.number()).max(20) }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    if (user.role !== "INVESTOR" && user.role !== "ADMIN") return [];
    const [profile, holdings, contributions] = await Promise.all([
      db.user.findUnique({ where: { id: user.id }, select: matchProfileSelect }),
      db.shareHolding.findMany({ where: { investorId: user.id, sharesOwned: { gt: 0 } }, select: liveHoldingSelect, orderBy: { shareClassId: "asc" } }),
      db.investorContribution.findMany({ where: { investorId: user.id, deletedAt: null, status: { not: "CANCELLED" } }, select: { contributionAmount: true } }),
    ]);
    const profilePortfolioKey = JSON.stringify([profile, holdings, contributions.reduce((sum, c) => sum + c.contributionAmount, 0)]);
    // Only return cache hits in batch mode (don't burn quota on a grid view).
    return input.propertyIds.map((pid) => {
      const hit = cache.get(key(user.id, pid));
      if (!hit || hit.profilePortfolioKey !== profilePortfolioKey || Date.now() - hit.generatedAt >= CACHE_TTL_MS) return { propertyId: pid, score: null, band: null };
      return { propertyId: pid, score: hit.score, band: hit.band };
    });
  });
