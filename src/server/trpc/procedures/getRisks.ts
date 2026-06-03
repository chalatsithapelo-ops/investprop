import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";

export const getRisks = baseProcedure
  .input(
    z.object({
      propertyId: z.number(),
    })
  )
  .query(async ({ input }) => {
    // Verify property exists
    const property = await db.property.findUnique({
      where: { id: input.propertyId },
    });

    if (!property) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Property not found",
      });
    }

    // Get risks
    const risks = await db.riskEntry.findMany({
      where: {
        propertyId: input.propertyId,
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Calculate risk scores (severity * likelihood)
    const severityScores = {
      LOW: 1,
      MEDIUM: 2,
      HIGH: 3,
      CRITICAL: 4,
    };

    const likelihoodScores = {
      RARE: 1,
      UNLIKELY: 2,
      POSSIBLE: 3,
      LIKELY: 4,
      ALMOST_CERTAIN: 5,
    };

    const risksWithScores = risks.map((risk) => ({
      ...risk,
      riskScore:
        severityScores[risk.severity] * likelihoodScores[risk.likelihood],
    }));

    // Calculate summary statistics
    const totalRisks = risks.length;
    const activeRisks = risks.filter((r) => r.status === "ACTIVE").length;
    const criticalRisks = risks.filter((r) => r.severity === "CRITICAL").length;
    const totalImpactCost = risks.reduce((sum, r) => sum + r.impactCost, 0);

    return {
      risks: risksWithScores,
      summary: {
        totalRisks,
        activeRisks,
        criticalRisks,
        totalImpactCost,
      },
    };
  });
