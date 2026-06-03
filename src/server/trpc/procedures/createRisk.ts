import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { requireAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { createNotification } from "./notifications";

export const createRisk = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      title: z.string().min(1),
      description: z.string().min(1),
      severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
      likelihood: z.enum(["RARE", "UNLIKELY", "POSSIBLE", "LIKELY", "ALMOST_CERTAIN"]),
      mitigationPlan: z.string().min(1),
      impactCost: z.number().min(0).default(0),
    })
  )
  .mutation(async ({ input }) => {
    // Verify authentication and authorization
    const user = await requireAuthenticatedUser(
      input.authToken,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only managers can create risk entries"
    );

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

    // Create risk entry
    const risk = await db.riskEntry.create({
      data: {
        propertyId: input.propertyId,
        title: input.title,
        description: input.description,
        severity: input.severity,
        likelihood: input.likelihood,
        mitigationPlan: input.mitigationPlan,
        impactCost: input.impactCost,
        createdById: user.id,
        updatedAt: new Date(),
      },
    });

    // Notify property investors about HIGH or CRITICAL risks
    if (input.severity === "HIGH" || input.severity === "CRITICAL") {
      const propertyInvestors = await db.investorContribution.findMany({
        where: { propertyId: input.propertyId },
        select: { investorId: true },
        distinct: ["investorId"],
      });
      for (const inv of propertyInvestors) {
        createNotification(
          inv.investorId,
          `${input.severity} Risk Identified`,
          `A ${input.severity.toLowerCase()} risk "${input.title}" has been identified for "${property.title}"${input.impactCost > 0 ? ` — potential impact: R${input.impactCost.toLocaleString("en-ZA")}` : ""}`,
          input.severity === "CRITICAL" ? "ERROR" : "WARNING",
          "PROPERTY",
          input.propertyId
        );
      }
    }

    return {
      success: true,
      risk,
    };
  });
