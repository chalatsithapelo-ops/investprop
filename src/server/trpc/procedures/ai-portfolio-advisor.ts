/**
 * AI Strategy 2.3 — Portfolio Advisor
 *
 * Monthly AI brief per investor: concentration risk, tax timing, distribution
 * reinvestment, marketplace gap-fillers. Stored as PortfolioInsight, one per
 * investor per month.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { generateText } from "ai";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { getModel, getModelId, runAIWithGuard, safeParseJson } from "~/server/ai/client";

interface PortfolioInsightShape {
  summary: string;
  insights: { type: string; severity: "INFO" | "ATTENTION" | "WARNING"; message: string; action?: string }[];
}

const SEVERITIES = new Set(["INFO", "ATTENTION", "WARNING"]);

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const generatePortfolioInsight = baseProcedure
  .input(z.object({ authToken: z.string(), force: z.boolean().optional() }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const period = currentPeriod();

    if (!input.force) {
      const existing = await db.portfolioInsight.findUnique({
        where: { investorId_period: { investorId: user.id, period } },
      });
      if (existing) {
        return {
          summary: existing.summary,
          insights: existing.insights as PortfolioInsightShape["insights"],
          period: existing.period,
          generatedAt: existing.generatedAt,
        };
      }
    }

    const [contributions, distributions, openOpps] = await Promise.all([
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
      db.distributionPayout.findMany({
        where: { investorId: user.id },
        orderBy: { createdAt: "desc" },
        take: 10,
      }).catch(() => [] as { netAmount: number; createdAt: Date }[]),
      db.property.findMany({
        where: { isPublished: true, investmentStatus: "RAISING_FUNDS", deletedAt: null },
        select: { id: true, title: true, city: true, state: true, riskRating: true, expectedReturns: true },
        take: 8,
      }),
    ]);

    if (contributions.length === 0 && distributions.length === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No portfolio activity yet — make your first contribution to unlock the Portfolio Advisor.",
      });
    }

    const total = contributions.reduce((s, c) => s + c.contributionAmount, 0);
    const byCity = new Map<string, number>();
    const byRisk = new Map<string, number>();
    const byType = new Map<string, number>();
    for (const c of contributions) {
      byCity.set(c.property.city, (byCity.get(c.property.city) ?? 0) + c.contributionAmount);
      byRisk.set(c.property.riskRating, (byRisk.get(c.property.riskRating) ?? 0) + c.contributionAmount);
      const t = c.property.propertyFlip ? "flip" : c.property.rentalBond ? "rental" : c.property.propertyDevelopment ? "development" : "other";
      byType.set(t, (byType.get(t) ?? 0) + c.contributionAmount);
    }
    const concentration = (m: Map<string, number>) =>
      Array.from(m.entries())
        .map(([k, v]) => `${k}=${((v / Math.max(total, 1)) * 100).toFixed(0)}%`)
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
- WARNING only when concentration >50% in one city/type, or unrealised loss, or compliance gap.
- Tax: if distributions paid this month > R5,000, mention provisional tax (Feb / Aug). If SARS tax cert hasn't been generated this year, flag it.
- Liquidity: remind that the share marketplace is thin; cooling-off (5 business days) is the only guaranteed exit window.
- Opportunity: pick ONE specific opportunity from the open marketplace that fills a portfolio gap. Use the deal ID and title.
- NEVER recommend a specific buy/sell action — use "may suit", "worth reviewing", "consider whether".`;

    const userPrompt = `INVESTOR: id=${user.id}, role=${user.role}
PERIOD: ${period}
TOTAL COMMITTED: R${Math.round(total).toLocaleString()} across ${contributions.length} deals
CONCENTRATION:
- by city: ${concentration(byCity) || "n/a"}
- by type: ${concentration(byType) || "n/a"}
- by risk rating: ${concentration(byRisk) || "n/a"}

DISTRIBUTIONS (recent, up to 10): ${distributions.length} payouts, total R${Math.round(totalDistributions).toLocaleString()}

CURRENT DEALS:
${contributions.map((c) => `- #${c.property.id} ${c.property.title} (${c.property.city}) — R${Math.round(c.contributionAmount).toLocaleString()} | ${c.property.riskRating} risk | ${c.property.investmentStatus}`).join("\n")}

OPEN OPPORTUNITIES ON PLATFORM (for gap-fill candidate):
${openOpps.map((o) => `- #${o.id} ${o.title} (${o.city}) — ${o.riskRating} risk | ${o.expectedReturns.toFixed(1)}% expected`).join("\n") || "(none open right now)"}

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

    return {
      summary: saved.summary,
      insights,
      period: saved.period,
      generatedAt: saved.generatedAt,
    };
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
