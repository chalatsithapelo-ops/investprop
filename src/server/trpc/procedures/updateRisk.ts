import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { requireAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { createNotification } from "./notifications";

export const updateRisk = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      riskId: z.number(),
      title: z.string().min(1).optional(),
      description: z.string().min(1).optional(),
      severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
      likelihood: z.enum(["RARE", "UNLIKELY", "POSSIBLE", "LIKELY", "ALMOST_CERTAIN"]).optional(),
      mitigationPlan: z.string().min(1).optional(),
      status: z.enum(["ACTIVE", "MITIGATED", "OCCURRED"]).optional(),
      impactCost: z.number().min(0).optional(),
    })
  )
  .mutation(async ({ input }) => {
    // Verify authentication and authorization
    await requireAuthenticatedUser(
      input.authToken,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only managers can update risk entries"
    );

    // Verify risk exists
    const risk = await db.riskEntry.findUnique({
      where: { id: input.riskId },
    });

    if (!risk) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Risk not found",
      });
    }

    // Build update data
    const updateData: any = {};
    if (input.title !== undefined) updateData.title = input.title;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.severity !== undefined) updateData.severity = input.severity;
    if (input.likelihood !== undefined) updateData.likelihood = input.likelihood;
    if (input.mitigationPlan !== undefined) updateData.mitigationPlan = input.mitigationPlan;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.impactCost !== undefined) updateData.impactCost = input.impactCost;

    // Update risk
    const updatedRisk = await db.riskEntry.update({
      where: { id: input.riskId },
      data: updateData,
    });

    // Notify property investors if risk status changed to OCCURRED
    if (input.status === "OCCURRED") {
      const property = await db.property.findUnique({
        where: { id: risk.propertyId },
        select: { title: true },
      });
      const propertyInvestors = await db.investorContribution.findMany({
        where: { propertyId: risk.propertyId },
        select: { investorId: true },
        distinct: ["investorId"],
      });
      for (const inv of propertyInvestors) {
        createNotification(
          inv.investorId,
          "Risk Occurred",
          `Risk "${updatedRisk.title}" for "${property?.title ?? "Property"}" has occurred${updatedRisk.impactCost > 0 ? ` — impact: R${updatedRisk.impactCost.toLocaleString("en-ZA")}` : ""}`,
          "ERROR",
          "PROPERTY",
          risk.propertyId
        );
      }
    }

    // Also notify if risk was mitigated (good news)
    if (input.status === "MITIGATED") {
      const property = await db.property.findUnique({
        where: { id: risk.propertyId },
        select: { title: true },
      });
      const propertyInvestors = await db.investorContribution.findMany({
        where: { propertyId: risk.propertyId },
        select: { investorId: true },
        distinct: ["investorId"],
      });
      for (const inv of propertyInvestors) {
        createNotification(
          inv.investorId,
          "Risk Mitigated",
          `Risk "${updatedRisk.title}" for "${property?.title ?? "Property"}" has been successfully mitigated`,
          "SUCCESS",
          "PROPERTY",
          risk.propertyId
        );
      }
    }

    return {
      success: true,
      risk: updatedRisk,
    };
  });
