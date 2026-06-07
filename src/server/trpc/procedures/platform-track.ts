/**
 * Platform Track Record — investor-facing trust signal.
 *
 * Unlike the per-sponsor scorecard (an internal oversight tool), investors care
 * about the platform's aggregate delivery record across ALL deals, regardless of
 * which internal dev manager ran them. Every deal carries one brand: Investprop.
 *
 * Deterministic aggregation (no LLM) so the numbers are exact, free to serve and
 * safe to show publicly to authenticated users.
 */
import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";

export const getPlatformTrackRecord = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);

    const properties = await db.property.findMany({
      where: { deletedAt: null },
      select: {
        investmentStatus: true,
        createdAt: true,
        milestones: {
          select: {
            status: true,
            actualCompletionDate: true,
            estimatedCompletionDate: true,
            budgetAllocated: true,
            budgetSpent: true,
          },
        },
      },
    });

    let completed = 0;
    let inProgress = 0;
    let raising = 0;
    let onTime = 0;
    let late = 0;
    let onBudget = 0;
    let overBudget = 0;
    let earliest: Date | null = null;

    for (const p of properties) {
      if (!earliest || p.createdAt < earliest) earliest = p.createdAt;

      if (p.investmentStatus === "COMPLETED") completed++;
      else if (p.investmentStatus === "PROJECT_STARTED" || p.investmentStatus === "FUNDED") inProgress++;
      else if (p.investmentStatus === "RAISING_FUNDS") raising++;

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
    }

    const distAgg = await db.distribution.aggregate({
      where: { status: "DISTRIBUTED", deletedAt: null },
      _sum: { netAmount: true },
    });

    const paidContributions = await db.investorContribution.findMany({
      where: { paymentStatus: "PAID" },
      select: { investorId: true, contributionAmount: true },
    });
    const investorIds = new Set(paidContributions.map((c) => c.investorId));
    const capitalRaised = paidContributions.reduce((s, c) => s + c.contributionAmount, 0);

    return {
      totalDeals: properties.length,
      completed,
      inProgress,
      raising,
      onTimePct: onTime + late > 0 ? (onTime / (onTime + late)) * 100 : null,
      onBudgetPct: onBudget + overBudget > 0 ? (onBudget / (onBudget + overBudget)) * 100 : null,
      milestonesTracked: onTime + late,
      totalDistributed: distAgg._sum.netAmount ?? 0,
      totalInvestors: investorIds.size,
      capitalRaised,
      since: earliest,
    };
  });
