/**
 * AI Strategy 2.3 — Portfolio Advisor
 *
 * Monthly AI brief per investor: concentration risk, tax timing, distribution
 * reinvestment, marketplace gap-fillers. Stored as PortfolioInsight, one per
 * investor per month.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { UserRole } from "@prisma/client";
import { generateText } from "ai";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { requireFeature } from "~/server/subscriptions/subscription-service";
import { getModel, getModelId, runAIWithGuard, safeParseJson } from "~/server/ai/client";
import { calculateRentalMetrics, buildRentalInput } from "~/financial-calculations";
import { HOLDING_BASIS, liveHoldingSelect, summariseLiveHoldings } from "./ai-investor-profile";

interface PortfolioInsightShape {
  summary: string;
  insights: { type: string; severity: "INFO" | "ATTENTION" | "WARNING"; message: string; action?: string }[];
}

const SEVERITIES = new Set(["INFO", "ATTENTION", "WARNING"]);
// Only reuse briefs generated with this version's live ownership snapshot.
const portfolioSnapshots = new Map<string, string>();

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Generate (or return cached) the monthly portfolio insight for one investor.
 * Reusable by the tRPC mutation and the scheduled portfolio watchdog. Assumes
 * the caller has already verified AI_PORTFOLIO_ADVISOR entitlement.
 * Throws TRPCError BAD_REQUEST when the investor has no portfolio activity yet.
 */
export async function generatePortfolioInsightCore(
  user: { id: number; role: UserRole },
  opts: { force?: boolean } = {},
) {
    const period = currentPeriod();

    const [contributions, holdings, distributions, openOpps] = await Promise.all([
      db.investorContribution.findMany({
        where: { investorId: user.id, deletedAt: null, status: { not: "CANCELLED" } },
        include: {
          property: {
            select: {
              id: true,
              title: true,
              city: true,
              state: true,
              riskRating: true,
              expectedReturns: true,
              investmentStatus: true,
              propertyFlip: { select: { id: true } },
              rentalBond: { select: { id: true } },
              propertyDevelopment: { select: { id: true } },
            },
          },
        },
      }),
      db.shareHolding.findMany({
        where: { investorId: user.id, sharesOwned: { gt: 0 } },
        select: liveHoldingSelect,
        orderBy: { shareClassId: "asc" },
      }),
      db.distributionPayout.findMany({
        where: { investorId: user.id },
        orderBy: { createdAt: "desc" },
        take: 10,
      }).catch(() => [] as { netAmount: number; createdAt: Date }[]),
      db.property.findMany({
        where: { isPublished: true, investmentStatus: "RAISING_FUNDS", deletedAt: null },
        select: {
          id: true, title: true, city: true, state: true, riskRating: true, expectedReturns: true, price: true,
          propertyFlip: { select: { expectedROI: true } },
          rentalBond: true,
          propertyDevelopment: { select: { expectedROI: true } },
        },
        take: 8,
      }),
    ]);

    const portfolio = summariseLiveHoldings(holdings);
    if (portfolio.positions.length === 0 && contributions.length === 0 && distributions.length === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No portfolio activity yet — acquire shares or make your first contribution to unlock the Portfolio Advisor.",
      });
    }

    const snapshotKey = `${user.id}:${period}`;
    const snapshot = JSON.stringify([holdings, contributions, distributions, openOpps]);
    if (!opts.force && portfolioSnapshots.get(snapshotKey) === snapshot) {
      const existing = await db.portfolioInsight.findUnique({
        where: { investorId_period: { investorId: user.id, period } },
      });
      if (existing) {
        return { summary: existing.summary, insights: existing.insights as PortfolioInsightShape["insights"], period: existing.period, generatedAt: existing.generatedAt };
      }
    }

    const contributionTotal = contributions.reduce((s, c) => s + c.contributionAmount, 0);
    const { total, byCity, byRisk, byType } = portfolio;
    const concentration = (m: Map<string, number>) =>
      Array.from(m.entries())
        .map(([k, v]) => `${k}=${(total > 0 ? (v / total) * 100 : 0).toFixed(0)}%`)
        .join(", ");

    const totalDistributions = distributions.reduce(
      (s, d) => s + (typeof (d as { netAmount?: number }).netAmount === "number" ? (d as { netAmount: number }).netAmount : 0),
      0
    );

    const systemPrompt = `You are Investprop's Portfolio Advisor — a monthly brief generator for a South African retail investor on a fractional-property platform. You provide research and observations, NOT financial, tax or legal advice.

Return ONLY JSON in this exact shape (no prose, no code fences):
{
  "summary": "<150-220 word monthly brief, second person, balanced, South African context (SARB rate, JSE listed property index for context, FSCA, SARS provisional tax dates, transfer duty). Cover: current portfolio shape, what changed this month, biggest opportunity, biggest risk.>",
  "insights": [
    { "type": "<concentration | tax | liquidity | rebalance | opportunity | compliance>", "severity": "INFO" | "ATTENTION" | "WARNING", "message": "<1-2 sentences>", "action": "<optional, imperative, short>" }
  ]
}

Rules:
- 3-7 insights.
- Concentration and current deals use positive live share ownership only, never historical contributions. Sold-out investments are absent; secondary acquisitions are included.
- The stated cost/indicative basis is NOT fair market value. Do not infer unrealised gains/losses, available exit proceeds, or changes this month from this snapshot. Unpriced holdings make concentration incomplete.
- WARNING only when concentration >50% in one city/type, or unrealised loss, or compliance gap.
- Tax: if distributions paid this month > R5,000, mention provisional tax (Feb / Aug). If SARS tax cert hasn't been generated this year, flag it.
- Liquidity: remind that the share marketplace is thin; cooling-off (5 business days) is the only guaranteed exit window.
- Opportunity: pick ONE specific opportunity from the open marketplace that fills a portfolio gap. Use the deal ID and title.
- NEVER recommend a specific buy/sell action — use "may suit", "worth reviewing", "consider whether".`;

    const userPrompt = `INVESTOR: id=${user.id}, role=${user.role}
PERIOD: ${period}
CURRENT OWNERSHIP: R${Math.round(total).toLocaleString()} on a cost/indicative basis across ${portfolio.propertyCount} properties (${portfolio.positions.length} share-class holdings)
BASIS: ${HOLDING_BASIS}
UNPRICED POSITIVE HOLDINGS: ${portfolio.unpricedCount} (excluded from monetary percentages; concentration is incomplete if non-zero)
CONTRIBUTION HISTORY (non-cancelled, non-deleted records; not current ownership): R${Math.round(contributionTotal).toLocaleString()} across ${contributions.length} contribution records
CONCENTRATION:
- by city: ${concentration(byCity) || "n/a"}
- by type: ${concentration(byType) || "n/a"}
- by risk rating: ${concentration(byRisk) || "n/a"}

DISTRIBUTIONS (recent, up to 10): ${distributions.length} payouts, total R${Math.round(totalDistributions).toLocaleString()}

CURRENT OWNED DEALS:
${portfolio.positions.map((p) => `- #${p.property.id} ${p.property.title} (${p.property.city}) — ${p.sharesOwned} shares, R${Math.round(p.amount).toLocaleString()} (${p.basis}) | ${p.property.riskRating} risk | ${p.property.investmentStatus}`).join("\n") || "(no positive share holdings)"}

ACTUAL CONTRIBUTION HISTORY (not an ownership list):
${contributions.map((c) => `- #${c.property.id} ${c.property.title} — R${Math.round(c.contributionAmount).toLocaleString()} | ${c.status}`).join("\n") || "(no primary contributions; secondary ownership may still exist)"}

OPEN OPPORTUNITIES ON PLATFORM (for gap-fill candidate):
${openOpps.map((o) => {
  const rentalCap = o.rentalBond ? calculateRentalMetrics(buildRentalInput(o.rentalBond, o.price)).displayCapRate : undefined;
  const expected = o.propertyFlip?.expectedROI ?? rentalCap ?? o.propertyDevelopment?.expectedROI ?? o.expectedReturns ?? 0;
  return `- #${o.id} ${o.title} (${o.city}) — ${o.riskRating} risk | ${expected.toFixed(1)}% expected`;
}).join("\n") || "(none open right now)"}

Return the JSON object now.`;

    const result = await runAIWithGuard({
      userId: user.id,
      feature: "portfolio",
      model: getModelId("premium"),
      run: () => generateText({ model: getModel("premium"), system: systemPrompt, prompt: userPrompt }),
      extractUsage: (r) => ({ promptTokens: r.usage?.promptTokens, completionTokens: r.usage?.completionTokens }),
    });

    const parsed = safeParseJson<PortfolioInsightShape>(result.text);
    if (!parsed?.summary) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Portfolio Advisor returned an unparseable response." });
    }
    const insights = (parsed.insights ?? [])
      .filter((i) => i && typeof i.message === "string")
      .slice(0, 10)
      .map((i) => ({
        type: i.type ?? "info",
        severity: SEVERITIES.has(i.severity) ? i.severity : "INFO",
        message: i.message,
        action: i.action,
      }));

    const saved = await db.portfolioInsight.upsert({
      where: { investorId_period: { investorId: user.id, period } },
      update: { summary: parsed.summary, insights, dismissedAt: null, generatedAt: new Date() },
      create: { investorId: user.id, period, summary: parsed.summary, insights },
    });
    portfolioSnapshots.set(snapshotKey, snapshot);

    return {
      summary: saved.summary,
      insights,
      period: saved.period,
      generatedAt: saved.generatedAt,
    };
}

export const generatePortfolioInsight = baseProcedure
  .input(z.object({ authToken: z.string(), force: z.boolean().optional() }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    await requireFeature(user, "AI_PORTFOLIO_ADVISOR");
    return generatePortfolioInsightCore(user, { force: input.force });
  });

export const getPortfolioInsight = baseProcedure
  .input(z.object({ authToken: z.string(), period: z.string().optional() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const period = input.period ?? currentPeriod();
    const row = await db.portfolioInsight.findUnique({
      where: { investorId_period: { investorId: user.id, period } },
    });
    if (!row) return null;
    return {
      summary: row.summary,
      insights: row.insights as PortfolioInsightShape["insights"],
      period: row.period,
      generatedAt: row.generatedAt,
      dismissedAt: row.dismissedAt,
    };
  });

export const dismissPortfolioInsight = baseProcedure
  .input(z.object({ authToken: z.string(), period: z.string() }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    await db.portfolioInsight.updateMany({
      where: { investorId: user.id, period: input.period },
      data: { dismissedAt: new Date() },
    });
    return { ok: true };
  });
