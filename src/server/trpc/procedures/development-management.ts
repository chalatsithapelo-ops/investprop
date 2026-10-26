import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { requireAuthenticatedUser, getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { createNotification } from "./notifications";
import {
  buildDevelopmentCashflow,
  calculateResidualLandValue,
  runDevelopmentSensitivity,
  calculateDevelopmentMetrics,
  assessGreenfieldFeasibility,
  type PropertyDevelopmentInput,
} from "~/financial-calculations";

const MANAGER_ROLES = ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"] as const;

const APPROVAL_TYPES = [
  "REZONING",
  "TOWNSHIP_ESTABLISHMENT",
  "SUBDIVISION_CONSOLIDATION",
  "SITE_DEVELOPMENT_PLAN",
  "BUILDING_PLANS",
  "ENVIRONMENTAL_AUTHORISATION",
  "WATER_USE_LICENCE",
  "WATER_LICENCE",
  "GEOTECHNICAL_CLEARANCE",
  "TRAFFIC_IMPACT_APPROVAL",
  "HERITAGE_AUTHORISATION",
  "NHBRC_ENROLMENT",
  "BULK_SERVICES_AGREEMENT",
  "ELECTRICAL_SUPPLY_AGREEMENT",
  "FIRE_APPROVAL",
  "HEALTH_APPROVAL",
  "SG_DIAGRAM_APPROVAL",
  "OCCUPANCY_CERTIFICATE",
  "OTHER",
] as const;

const PROFESSIONAL_ROLES = [
  "TOWN_PLANNER",
  "ARCHITECT",
  "QUANTITY_SURVEYOR",
  "CIVIL_ENGINEER",
  "STRUCTURAL_ENGINEER",
  "ELECTRICAL_ENGINEER",
  "MECHANICAL_ENGINEER",
  "WET_SERVICES_ENGINEER",
  "ENVIRONMENTAL_SPECIALIST",
  "LAND_SURVEYOR",
  "GEOTECHNICAL_ENGINEER",
  "TRAFFIC_ENGINEER",
  "FIRE_CONSULTANT",
  "HEALTH_SAFETY_AGENT",
  "PROJECT_MANAGER",
  "CONVEYANCER",
  "VALUER",
  "OTHER",
] as const;

const APPOINTMENT_STATUSES = [
  "NOT_APPOINTED",
  "SHORTLISTED",
  "APPOINTED",
  "TERMINATED",
] as const;

const APPROVAL_STATUSES = [
  "NOT_STARTED",
  "SUBMITTED",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "CONDITIONAL",
] as const;

const UNIT_STATUSES = ["AVAILABLE", "RESERVED", "SOLD", "TRANSFERRED"] as const;

const DEVELOPMENT_STAGES = [
  "APPRAISAL",
  "LAND_SECURED",
  "PLANNING_APPROVALS",
  "FUNDING",
  "CONSTRUCTION",
  "PRACTICAL_COMPLETION",
  "DEFECTS_LIABILITY",
  "SALES_LETTING",
  "EXITED",
] as const;

async function notifyPropertyInvestors(
  propertyId: number,
  title: string,
  message: string,
  type: "INFO" | "SUCCESS" | "WARNING" = "INFO",
  category: "PROPERTY" | "INVESTMENT" | "MILESTONE" | "SYSTEM" = "PROPERTY"
) {
  const investors = await db.investorContribution.findMany({
    where: { propertyId },
    select: { investorId: true },
    distinct: ["investorId"],
  });
  for (const inv of investors) {
    createNotification(inv.investorId, title, message, type, category, propertyId);
  }
}

// ============================================================================
// Milestone progress — VERIFIED physical % complete (decoupled from spend)
// ============================================================================

export const updateMilestoneProgress = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      milestoneId: z.number(),
      percentComplete: z.number().min(0).max(100),
      notes: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await requireAuthenticatedUser(
      input.authToken,
      [...MANAGER_ROLES],
      "Only development and project managers can verify milestone progress"
    );

    const existing = await db.milestone.findUnique({
      where: { id: input.milestoneId },
      include: { property: { select: { id: true, title: true } } },
    });
    if (!existing) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Milestone not found" });
    }

    // Progress drives status — completion requires a VERIFIED 100%, never spend.
    const now = new Date();
    const data: Record<string, unknown> = {
      percentComplete: input.percentComplete,
      verifiedById: user.id,
      verifiedAt: now,
      updatedAt: now,
    };
    if (input.percentComplete >= 100) {
      data.status = "COMPLETED";
      data.actualCompletionDate = existing.actualCompletionDate ?? now;
    } else if (input.percentComplete > 0) {
      if (existing.status === "PLANNED") data.status = "IN_PROGRESS";
      if (!existing.actualStartDate) data.actualStartDate = now;
    }

    const milestone = await db.milestone.update({
      where: { id: input.milestoneId },
      data,
    });

    if (input.percentComplete >= 100 && existing.status !== "COMPLETED") {
      await notifyPropertyInvestors(
        existing.property.id,
        "Milestone Completed",
        `Milestone "${existing.name}" on "${existing.property.title}" was verified complete.`,
        "SUCCESS",
        "MILESTONE"
      );
    }

    return { success: true, milestone };
  });

// ============================================================================
// Cost report — budget vs committed vs actual vs cost-to-complete
// ============================================================================

export const getDevelopmentCostReport = baseProcedure
  .input(z.object({ authToken: z.string(), propertyId: z.number() }))
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);

    const property = await db.property.findUnique({
      where: { id: input.propertyId },
      include: { propertyDevelopment: true, budgetEntries: true },
    });
    if (!property || !property.propertyDevelopment) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Development not found" });
    }
    const dev = property.propertyDevelopment;

    // Budget baseline per cost code (from the appraisal buckets).
    const budgetByCode: Record<string, number> = {
      LAND: dev.landAcquisitionCost,
      CONSTRUCTION: dev.hardCosts,
      PROFESSIONAL_FEES: dev.softCosts,
      FINANCE: dev.financingCosts,
      CONTINGENCY: dev.contingencyAmount,
      STATUTORY_APPROVALS: 0,
      BULK_SERVICES: 0,
      MARKETING_SALES: 0,
      OTHER: 0,
    };

    const committedByCode: Record<string, number> = {};
    const actualByCode: Record<string, number> = {};
    for (const e of property.budgetEntries) {
      const code = e.costCode ?? "OTHER";
      if (e.entryType === "COMMITMENT") {
        committedByCode[code] = (committedByCode[code] ?? 0) + e.amount;
      } else {
        actualByCode[code] = (actualByCode[code] ?? 0) + e.amount;
      }
    }

    const codes = Array.from(
      new Set([
        ...Object.keys(budgetByCode),
        ...Object.keys(committedByCode),
        ...Object.keys(actualByCode),
      ])
    );

    const lines = codes.map((code) => {
      const budget = budgetByCode[code] ?? 0;
      const committed = committedByCode[code] ?? 0;
      const actual = actualByCode[code] ?? 0;
      // Open commitments = orders placed but not yet certified as actual spend.
      const openCommitments = Math.max(0, committed - actual);
      // Forecast to complete = remaining budget beyond actuals, but never below
      // the value of outstanding commitments already placed.
      const forecastToComplete = Math.max(budget - actual, openCommitments);
      const anticipatedFinalCost = actual + forecastToComplete;
      return {
        code,
        budget,
        committed,
        actual,
        openCommitments,
        costToComplete: Math.max(0, budget - actual),
        forecastToComplete,
        anticipatedFinalCost,
        variance: budget - anticipatedFinalCost, // + = under, − = over
      };
    });

    const sum = (f: (l: (typeof lines)[number]) => number) =>
      lines.reduce((a, l) => a + f(l), 0);

    return {
      projectName: dev.projectName,
      totalBudget: dev.totalBudget,
      contingency: {
        allocated: dev.contingencyAmount,
        drawn: dev.contingencyDrawn,
        remaining: Math.max(0, dev.contingencyAmount - dev.contingencyDrawn),
      },
      lines,
      totals: {
        budget: sum((l) => l.budget),
        committed: sum((l) => l.committed),
        actual: sum((l) => l.actual),
        anticipatedFinalCost: sum((l) => l.anticipatedFinalCost),
        variance: sum((l) => l.variance),
      },
    };
  });

export const drawContingency = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      amount: z.number().positive(),
      reason: z.string().min(1),
    })
  )
  .mutation(async ({ input }) => {
    await requireAuthenticatedUser(
      input.authToken,
      [...MANAGER_ROLES],
      "Only managers can draw contingency"
    );
    const dev = await db.propertyDevelopment.findUnique({
      where: { propertyId: input.propertyId },
    });
    if (!dev) throw new TRPCError({ code: "NOT_FOUND", message: "Development not found" });
    const remaining = dev.contingencyAmount - dev.contingencyDrawn;
    if (input.amount > remaining) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Only R${remaining.toLocaleString("en-ZA")} of contingency remains`,
      });
    }
    const updated = await db.propertyDevelopment.update({
      where: { propertyId: input.propertyId },
      data: { contingencyDrawn: { increment: input.amount } },
    });
    await notifyPropertyInvestors(
      input.propertyId,
      "Contingency Drawn",
      `R${input.amount.toLocaleString("en-ZA")} of contingency was drawn: ${input.reason}`,
      "WARNING"
    );
    return { success: true, contingencyDrawn: updated.contingencyDrawn };
  });

// ============================================================================
// Statutory approvals / consents tracker
// ============================================================================

export const createDevelopmentApproval = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      type: z.enum(APPROVAL_TYPES),
      status: z.enum(APPROVAL_STATUSES).default("NOT_STARTED"),
      isRequired: z.boolean().default(true),
      authority: z.string().optional(),
      reference: z.string().optional(),
      targetDate: z.string().optional(),
      documentUrl: z.string().optional(),
      notes: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await requireAuthenticatedUser(
      input.authToken,
      [...MANAGER_ROLES],
      "Only managers can record approvals"
    );
    const approval = await db.developmentApproval.create({
      data: {
        propertyId: input.propertyId,
        type: input.type,
        status: input.status,
        isRequired: input.isRequired,
        authority: input.authority,
        reference: input.reference,
        targetDate: input.targetDate ? new Date(input.targetDate) : null,
        documentUrl: input.documentUrl,
        notes: input.notes,
        createdById: user.id,
      },
    });
    return { success: true, approval };
  });

export const getDevelopmentApprovals = baseProcedure
  .input(z.object({ authToken: z.string(), propertyId: z.number() }))
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    const approvals = await db.developmentApproval.findMany({
      where: { propertyId: input.propertyId },
      orderBy: { createdAt: "asc" },
    });
    const required = approvals.filter((a) => a.isRequired);
    const outstanding = required.filter((a) => a.status !== "APPROVED");
    return {
      approvals,
      summary: {
        total: approvals.length,
        required: required.length,
        approved: required.filter((a) => a.status === "APPROVED").length,
        outstanding: outstanding.length,
        constructionReady: outstanding.length === 0,
      },
    };
  });

export const updateDevelopmentApproval = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      approvalId: z.number(),
      status: z.enum(APPROVAL_STATUSES).optional(),
      authority: z.string().optional(),
      reference: z.string().optional(),
      submittedAt: z.string().optional(),
      decisionAt: z.string().optional(),
      targetDate: z.string().optional(),
      documentUrl: z.string().optional(),
      notes: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    await requireAuthenticatedUser(
      input.authToken,
      [...MANAGER_ROLES],
      "Only managers can update approvals"
    );
    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (input.status !== undefined) data.status = input.status;
    if (input.authority !== undefined) data.authority = input.authority;
    if (input.reference !== undefined) data.reference = input.reference;
    if (input.submittedAt !== undefined) data.submittedAt = new Date(input.submittedAt);
    if (input.decisionAt !== undefined) data.decisionAt = new Date(input.decisionAt);
    if (input.targetDate !== undefined) data.targetDate = new Date(input.targetDate);
    if (input.documentUrl !== undefined) data.documentUrl = input.documentUrl;
    if (input.notes !== undefined) data.notes = input.notes;
    const approval = await db.developmentApproval.update({
      where: { id: input.approvalId },
      data,
    });
    return { success: true, approval };
  });

// ============================================================================
// Unit sales inventory & absorption
// ============================================================================

async function syncPreSaleUnits(propertyId: number) {
  const reserved = await db.developmentUnit.count({
    where: { propertyId, status: { in: ["RESERVED", "SOLD", "TRANSFERRED"] } },
  });
  await db.propertyDevelopment.updateMany({
    where: { propertyId },
    data: { preSaleUnits: reserved },
  });
}

export const createDevelopmentUnit = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      unitNumber: z.string().min(1),
      sizeSqm: z.number().min(0).default(0),
      listPrice: z.number().min(0).default(0),
    })
  )
  .mutation(async ({ input }) => {
    const user = await requireAuthenticatedUser(
      input.authToken,
      [...MANAGER_ROLES],
      "Only managers can add units"
    );
    const unit = await db.developmentUnit.create({
      data: {
        propertyId: input.propertyId,
        unitNumber: input.unitNumber,
        sizeSqm: input.sizeSqm,
        listPrice: input.listPrice,
        createdById: user.id,
      },
    });
    return { success: true, unit };
  });

export const updateDevelopmentUnit = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      unitId: z.number(),
      status: z.enum(UNIT_STATUSES).optional(),
      soldPrice: z.number().min(0).optional(),
      buyerName: z.string().optional(),
      depositPaid: z.number().min(0).optional(),
      bondApproved: z.boolean().optional(),
    })
  )
  .mutation(async ({ input }) => {
    await requireAuthenticatedUser(
      input.authToken,
      [...MANAGER_ROLES],
      "Only managers can update units"
    );
    const existing = await db.developmentUnit.findUnique({ where: { id: input.unitId } });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Unit not found" });

    const now = new Date();
    const data: Record<string, unknown> = { updatedAt: now };
    if (input.status !== undefined) {
      data.status = input.status;
      if (input.status === "RESERVED" && !existing.reservedAt) data.reservedAt = now;
      if (input.status === "SOLD" && !existing.soldAt) data.soldAt = now;
      if (input.status === "TRANSFERRED" && !existing.transferredAt) data.transferredAt = now;
    }
    if (input.soldPrice !== undefined) data.soldPrice = input.soldPrice;
    if (input.buyerName !== undefined) data.buyerName = input.buyerName;
    if (input.depositPaid !== undefined) data.depositPaid = input.depositPaid;
    if (input.bondApproved !== undefined) data.bondApproved = input.bondApproved;

    const unit = await db.developmentUnit.update({ where: { id: input.unitId }, data });
    await syncPreSaleUnits(existing.propertyId);
    return { success: true, unit };
  });

export const getDevelopmentUnits = baseProcedure
  .input(z.object({ authToken: z.string(), propertyId: z.number() }))
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    const units = await db.developmentUnit.findMany({
      where: { propertyId: input.propertyId },
      orderBy: { unitNumber: "asc" },
    });
    const total = units.length;
    const by = (s: string) => units.filter((u) => u.status === s).length;
    const reserved = by("RESERVED");
    const sold = by("SOLD");
    const transferred = by("TRANSFERRED");
    const securedValue = units
      .filter((u) => u.status !== "AVAILABLE")
      .reduce((a, u) => a + (u.soldPrice ?? u.listPrice), 0);
    return {
      units,
      summary: {
        total,
        available: by("AVAILABLE"),
        reserved,
        sold,
        transferred,
        preSalePercentage: total > 0 ? ((reserved + sold + transferred) / total) * 100 : 0,
        securedValue,
      },
    };
  });

// ============================================================================
// Lifecycle stage — gated transitions (pre-sale covenant + approvals)
// ============================================================================

export const updateDevelopmentStage = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      stage: z.enum(DEVELOPMENT_STAGES),
    })
  )
  .mutation(async ({ input }) => {
    await requireAuthenticatedUser(
      input.authToken,
      [...MANAGER_ROLES],
      "Only managers can change the development stage"
    );
    const dev = await db.propertyDevelopment.findUnique({
      where: { propertyId: input.propertyId },
    });
    if (!dev) throw new TRPCError({ code: "NOT_FOUND", message: "Development not found" });

    // Gate the move into CONSTRUCTION on (a) required approvals being in place
    // and (b) the pre-sale covenant being met.
    if (input.stage === "CONSTRUCTION") {
      const approvals = await db.developmentApproval.findMany({
        where: { propertyId: input.propertyId, isRequired: true },
      });
      const outstanding = approvals.filter((a) => a.status !== "APPROVED");
      if (outstanding.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot start construction: ${outstanding.length} required approval(s) still outstanding (${outstanding
            .map((a) => a.type)
            .join(", ")}).`,
        });
      }
      if (dev.preSaleThresholdPercent > 0 && dev.numberOfUnits > 0) {
        const preSalePct = (dev.preSaleUnits / dev.numberOfUnits) * 100;
        if (preSalePct < dev.preSaleThresholdPercent) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cannot start construction: pre-sales at ${preSalePct.toFixed(
              0
            )}% are below the ${dev.preSaleThresholdPercent}% covenant.`,
          });
        }
      }

      // Funding adequacy: committed equity + senior debt must cover the
      // modelled peak funding, or the project can be cleared to build while
      // structurally under-funded.
      const committedFunding = dev.equityAmount + dev.seniorDebtAmount;
      if (dev.peakFunding > 0 && committedFunding < dev.peakFunding) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot start construction: committed funding R${committedFunding.toLocaleString(
            "en-ZA"
          )} is below peak funding R${dev.peakFunding.toLocaleString(
            "en-ZA"
          )} (shortfall R${(dev.peakFunding - committedFunding).toLocaleString("en-ZA")}).`,
        });
      }

      // Professional team: every required consultant must be appointed.
      const pros = await db.developmentProfessional.findMany({
        where: { propertyId: input.propertyId, isRequired: true },
      });
      const unappointed = pros.filter((p) => p.status !== "APPOINTED");
      if (unappointed.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot start construction: ${unappointed.length} required professional(s) not appointed (${unappointed
            .map((p) => p.role)
            .join(", ")}).`,
        });
      }
    }

    const updated = await db.propertyDevelopment.update({
      where: { propertyId: input.propertyId },
      data: { developmentStage: input.stage },
    });
    await notifyPropertyInvestors(
      input.propertyId,
      "Project Stage Update",
      `"${dev.projectName}" moved to ${input.stage.replace(/_/g, " ").toLowerCase()}.`,
      "INFO"
    );
    return { success: true, developmentStage: updated.developmentStage };
  });

// ============================================================================
// Appraisal — run the feasibility engine on demand (read-only)
// ============================================================================

export const getDevelopmentAppraisal = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      targetProfitOnCostPercent: z.number().default(20),
    })
  )
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    const dev = await db.propertyDevelopment.findUnique({
      where: { propertyId: input.propertyId },
    });
    if (!dev) throw new TRPCError({ code: "NOT_FOUND", message: "Development not found" });

    const devInput: PropertyDevelopmentInput = {
      developmentType: dev.developmentType as PropertyDevelopmentInput["developmentType"],
      landAcquisitionCost: dev.landAcquisitionCost,
      hardCosts: dev.hardCosts,
      softCosts: dev.softCosts,
      financingCosts: dev.financingCosts,
      contingencyPercent: dev.contingencyPercent,
      contingencyAmount: dev.contingencyAmount,
      expectedSalePricePerUnit: dev.expectedSalePricePerUnit,
      totalExpectedRevenue: dev.totalExpectedRevenue,
      expectedProfit: dev.expectedProfit,
      expectedMonthlyRentPerUnit: dev.expectedMonthlyRentPerUnit,
      annualOperatingExpenses: dev.annualOperatingExpenses,
      stabilizedCapRate: dev.stabilizedCapRate,
      expectedGrossYield: dev.expectedGrossYield,
      expectedNetYield: dev.expectedNetYield,
      expectedROI: dev.expectedROI,
      expectedIRR: dev.expectedIRR,
      developmentTimelineMonths: dev.developmentTimelineMonths,
      preSaleUnits: dev.preSaleUnits,
      costPerSquareMeter: dev.costPerSquareMeter,
      totalSquareMeters: dev.totalSquareMeters,
      numberOfUnits: dev.numberOfUnits,
      totalBudget: dev.totalBudget,
    };
    const metrics = calculateDevelopmentMetrics(devInput);
    const gdv =
      metrics.grossDevelopmentValue ??
      (metrics.calculatedCapRate && metrics.calculatedCapRate > 0
        ? (metrics.noi || 0) / (metrics.calculatedCapRate / 100)
        : 0);

    const cashflow = buildDevelopmentCashflow({
      landCost: dev.landAcquisitionCost,
      hardCosts: dev.hardCosts,
      softCosts: dev.softCosts,
      contingencyAmount: metrics.contingencyAmount,
      grossDevelopmentValue: gdv,
      timelineMonths: dev.developmentTimelineMonths || 12,
      equityAmount: dev.equityAmount,
      seniorDebtAmount: dev.seniorDebtAmount,
      debtAnnualRate: dev.seniorDebtRate,
      vatApplicable: dev.vatApplicable,
    });

    const residualLandValue = calculateResidualLandValue({
      grossDevelopmentValue: gdv,
      hardCosts: dev.hardCosts,
      softCosts: dev.softCosts,
      financingCosts: dev.financingCosts,
      contingencyPercent: dev.contingencyPercent,
      targetProfitOnCostPercent: input.targetProfitOnCostPercent,
    });

    const sensitivity = runDevelopmentSensitivity({
      landCost: dev.landAcquisitionCost,
      buildCost: dev.hardCosts + dev.softCosts + dev.financingCosts,
      contingencyPercent: dev.contingencyPercent,
      grossDevelopmentValue: gdv,
      costDeltas: [-0.1, 0, 0.1],
      priceDeltas: [-0.1, 0, 0.1],
    });

    return {
      grossDevelopmentValue: gdv,
      metrics,
      cashflow,
      residualLandValue,
      landHeadroom: residualLandValue - dev.landAcquisitionCost,
      sensitivity,
      hurdle: {
        targetProfitOnCostPercent: input.targetProfitOnCostPercent,
        meetsHurdle: cashflow.profitOnCost >= input.targetProfitOnCostPercent,
      },
    };
  });

// ============================================================================
// Professional team appointment register
// ============================================================================

export const createDevelopmentProfessional = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      role: z.enum(PROFESSIONAL_ROLES),
      isRequired: z.boolean().default(true),
      status: z.enum(APPOINTMENT_STATUSES).default("NOT_APPOINTED"),
      firmName: z.string().optional(),
      contactName: z.string().optional(),
      contactEmail: z.string().email().optional(),
      contactPhone: z.string().optional(),
      registrationBody: z.string().optional(),
      registrationNo: z.string().optional(),
      feeAmount: z.number().min(0).default(0),
      notes: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await requireAuthenticatedUser(
      input.authToken,
      [...MANAGER_ROLES],
      "Only managers can appoint professionals"
    );
    const pro = await db.developmentProfessional.create({
      data: {
        propertyId: input.propertyId,
        role: input.role,
        isRequired: input.isRequired,
        status: input.status,
        firmName: input.firmName,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        registrationBody: input.registrationBody,
        registrationNo: input.registrationNo,
        feeAmount: input.feeAmount,
        appointedAt: input.status === "APPOINTED" ? new Date() : null,
        createdById: user.id,
      },
    });
    return { success: true, professional: pro };
  });

export const updateDevelopmentProfessional = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      professionalId: z.number(),
      status: z.enum(APPOINTMENT_STATUSES).optional(),
      isRequired: z.boolean().optional(),
      firmName: z.string().optional(),
      contactName: z.string().optional(),
      contactEmail: z.string().email().optional(),
      contactPhone: z.string().optional(),
      registrationBody: z.string().optional(),
      registrationNo: z.string().optional(),
      feeAmount: z.number().min(0).optional(),
      notes: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    await requireAuthenticatedUser(
      input.authToken,
      [...MANAGER_ROLES],
      "Only managers can update professionals"
    );
    const existing = await db.developmentProfessional.findUnique({
      where: { id: input.professionalId },
    });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Professional not found" });

    const data: Record<string, unknown> = { updatedAt: new Date() };
    if (input.status !== undefined) {
      data.status = input.status;
      if (input.status === "APPOINTED" && !existing.appointedAt) data.appointedAt = new Date();
    }
    if (input.isRequired !== undefined) data.isRequired = input.isRequired;
    if (input.firmName !== undefined) data.firmName = input.firmName;
    if (input.contactName !== undefined) data.contactName = input.contactName;
    if (input.contactEmail !== undefined) data.contactEmail = input.contactEmail;
    if (input.contactPhone !== undefined) data.contactPhone = input.contactPhone;
    if (input.registrationBody !== undefined) data.registrationBody = input.registrationBody;
    if (input.registrationNo !== undefined) data.registrationNo = input.registrationNo;
    if (input.feeAmount !== undefined) data.feeAmount = input.feeAmount;
    if (input.notes !== undefined) data.notes = input.notes;

    const pro = await db.developmentProfessional.update({
      where: { id: input.professionalId },
      data,
    });
    return { success: true, professional: pro };
  });

export const getDevelopmentProfessionals = baseProcedure
  .input(z.object({ authToken: z.string(), propertyId: z.number() }))
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    const professionals = await db.developmentProfessional.findMany({
      where: { propertyId: input.propertyId },
      orderBy: { role: "asc" },
    });
    const required = professionals.filter((p) => p.isRequired);
    const appointed = required.filter((p) => p.status === "APPOINTED");
    const outstanding = required.filter((p) => p.status !== "APPOINTED");
    return {
      professionals,
      summary: {
        total: professionals.length,
        required: required.length,
        appointed: appointed.length,
        outstanding: outstanding.length,
        totalFees: professionals.reduce((a, p) => a + p.feeAmount, 0),
        teamComplete: outstanding.length === 0,
      },
    };
  });

// ============================================================================
// Unified project readiness — economics + team + approvals + funding
// ============================================================================

export const getProjectReadiness = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      minProfitOnCost: z.number().default(15),
      minYieldSpread: z.number().optional(),
    })
  )
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    const dev = await db.propertyDevelopment.findUnique({
      where: { propertyId: input.propertyId },
    });
    if (!dev) throw new TRPCError({ code: "NOT_FOUND", message: "Development not found" });

    const [approvals, professionals] = await Promise.all([
      db.developmentApproval.findMany({
        where: { propertyId: input.propertyId, isRequired: true },
      }),
      db.developmentProfessional.findMany({
        where: { propertyId: input.propertyId, isRequired: true },
      }),
    ]);

    const devInput: PropertyDevelopmentInput = {
      developmentType: dev.developmentType as PropertyDevelopmentInput["developmentType"],
      landAcquisitionCost: dev.landAcquisitionCost,
      hardCosts: dev.hardCosts,
      softCosts: dev.softCosts,
      financingCosts: dev.financingCosts,
      contingencyPercent: dev.contingencyPercent,
      contingencyAmount: dev.contingencyAmount,
      expectedSalePricePerUnit: dev.expectedSalePricePerUnit,
      totalExpectedRevenue: dev.totalExpectedRevenue,
      expectedProfit: dev.expectedProfit,
      expectedMonthlyRentPerUnit: dev.expectedMonthlyRentPerUnit,
      annualOperatingExpenses: dev.annualOperatingExpenses,
      stabilizedCapRate: dev.stabilizedCapRate,
      expectedGrossYield: dev.expectedGrossYield,
      expectedNetYield: dev.expectedNetYield,
      expectedROI: dev.expectedROI,
      expectedIRR: dev.expectedIRR,
      developmentTimelineMonths: dev.developmentTimelineMonths,
      preSaleUnits: dev.preSaleUnits,
      costPerSquareMeter: dev.costPerSquareMeter,
      totalSquareMeters: dev.totalSquareMeters,
      numberOfUnits: dev.numberOfUnits,
      totalBudget: dev.totalBudget,
    };
    const metrics = calculateDevelopmentMetrics(devInput);
    const gdv =
      metrics.grossDevelopmentValue ??
      (metrics.calculatedCapRate && metrics.calculatedCapRate > 0
        ? (metrics.noi || 0) / (metrics.calculatedCapRate / 100)
        : 0);

    const cashflow = buildDevelopmentCashflow({
      landCost: dev.landAcquisitionCost,
      hardCosts: dev.hardCosts,
      softCosts: dev.softCosts,
      contingencyAmount: metrics.contingencyAmount,
      grossDevelopmentValue: gdv,
      timelineMonths: dev.developmentTimelineMonths || 12,
      equityAmount: dev.equityAmount,
      seniorDebtAmount: dev.seniorDebtAmount,
      debtAnnualRate: dev.seniorDebtRate,
      vatApplicable: dev.vatApplicable,
    });

    const gate = assessGreenfieldFeasibility({
      model: {
        developmentType: dev.developmentType as
          | "AFFORDABLE_RESALE"
          | "COMMERCIAL_RENTAL"
          | "AFFORDABLE_RENTAL",
        totalDevelopmentCost: cashflow.totalCost,
        grossDevelopmentValue: gdv,
        profit: cashflow.profit,
        profitOnCost: cashflow.profitOnCost,
        profitOnGdv: cashflow.profitOnGdv,
        developmentYield:
          dev.developmentType === "AFFORDABLE_RESALE"
            ? undefined
            : metrics.calculatedCapRate,
        yieldSpread:
          dev.developmentType === "AFFORDABLE_RESALE" || metrics.calculatedCapRate == null
            ? undefined
            : metrics.calculatedCapRate - dev.stabilizedCapRate,
        notes: [],
      },
      minProfitOnCost: input.minProfitOnCost,
      minYieldSpread: input.minYieldSpread,
      requiredProfessionals: professionals.map((p) => p.role),
      appointedProfessionals: professionals
        .filter((p) => p.status === "APPOINTED")
        .map((p) => p.role),
      requiredApprovals: approvals.map((a) => a.type),
      approvedApprovals: approvals
        .filter((a) => a.status === "APPROVED")
        .map((a) => a.type),
      committedFunding: dev.equityAmount + dev.seniorDebtAmount,
      peakFunding: dev.peakFunding,
    });

    return {
      developmentStage: dev.developmentStage,
      grossDevelopmentValue: gdv,
      profit: cashflow.profit,
      profitOnCost: cashflow.profitOnCost,
      projectIRR: cashflow.projectIRR,
      peakFunding: cashflow.peakFunding,
      committedFunding: dev.equityAmount + dev.seniorDebtAmount,
      readiness: gate,
    };
  });
