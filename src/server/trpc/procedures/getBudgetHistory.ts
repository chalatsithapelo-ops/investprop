import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";

export const getBudgetHistory = baseProcedure
  .input(
    z.object({
      propertyId: z.number(),
      limit: z.number().min(1).max(100).default(50),
    })
  )
  .query(async ({ input }) => {
    // Verify property exists
    const property = await db.property.findUnique({
      where: { id: input.propertyId },
      include: {
        propertyFlip: true,
        rentalBond: true,
        propertyDevelopment: true,
      },
    });

    if (!property) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Property not found",
      });
    }

    // Get budget entries
    const entries = await db.budgetEntry.findMany({
      where: {
        propertyId: input.propertyId,
      },
      include: {
        recordedBy: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
      orderBy: {
        dateRecorded: "desc",
      },
      take: input.limit,
    });

    // Calculate cumulative spending over time
    const sortedEntries = [...entries].reverse(); // Oldest first for cumulative calc
    let cumulative = 0;
    const entriesWithCumulative = sortedEntries.map((entry) => {
      cumulative += entry.amount;
      return {
        ...entry,
        cumulativeSpent: cumulative,
      };
    });

    // Reverse back to newest first for display
    entriesWithCumulative.reverse();

    // Get budget totals based on property type
    let totalSpent = 0;
    let totalBudget = 0;

    if (property.propertyFlip) {
      totalSpent = property.propertyFlip.spentInvestmentBudget;
      totalBudget = property.propertyFlip.totalInvestmentBudget || 
        (property.propertyFlip.purchasePrice + property.propertyFlip.renovationBudget + 
         property.propertyFlip.holdingCosts + property.propertyFlip.closingCostsPurchase);
    } else if (property.rentalBond) {
      totalSpent = property.rentalBond.spentInvestmentBudget;
      totalBudget = property.rentalBond.totalInvestmentBudget || property.rentalBond.purchasePrice;
    } else if (property.propertyDevelopment) {
      totalSpent = property.propertyDevelopment.spentBudget;
      totalBudget = property.propertyDevelopment.totalBudget;
    }

    const remainingBudget = totalBudget - totalSpent;
    const percentageUsed = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;

    // Group spending by category
    const spendingByCategory = entries.reduce(
      (acc, entry) => {
        acc[entry.category] = (acc[entry.category] || 0) + entry.amount;
        return acc;
      },
      {} as Record<string, number>
    );

    return {
      entries: entriesWithCumulative,
      summary: {
        totalSpent,
        totalBudget,
        remainingBudget,
        percentageUsed,
        spendingByCategory,
        entryCount: entries.length,
      },
    };
  });
