import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { calculateShareInfo } from "~/server/trpc/procedures/share-certificates";
import { getFeeConfig } from "~/server/fees/platform-fees";
import {
  calculateFlipMetrics,
  calculateRentalMetrics,
  calculateDevelopmentMetrics,
  calculateTransferDuty,
} from "~/financial-calculations";
import {
  projectInvestorReturn,
  INVESTOR_STRATEGIES,
  type InvestorStrategy,
  type HoldingType,
  type ScenarioEconomics,
} from "~/investor-returns";

// ─────────────────────────────────────────────────────────────
//  Derive whole-deal scenario economics from a property, reusing
//  the platform engine. Returns downside / base / upside bands so
//  the per-investor projection and the UI share one source of truth.
// ─────────────────────────────────────────────────────────────

type DealEconomics = {
  scenarios: { downside: ScenarioEconomics; base: ScenarioEconomics; upside: ScenarioEconomics };
  projectHoldMonths: number;
  defaultStrategy: InvestorStrategy;
  availableStrategies: InvestorStrategy[];
  propertyType: "FLIP" | "RENTAL" | "DEVELOPMENT";
};

type PropertyWithDeal = {
  price: number;
  targetHoldMonths: number;
  propertyFlip: any | null;
  rentalBond: any | null;
  propertyDevelopment: any | null;
};

/**
 * Investor-controllable stress applied to the downside / upside bands. The
 * percentages represent how far the investor wants to swing revenue and costs
 * against (down) and for (up) the deal. Defaults reproduce the platform's
 * standard ±10% sensitivity so existing behaviour is unchanged.
 */
export type ScenarioStress = { downPct: number; upPct: number };

const DEFAULT_STRESS: ScenarioStress = { downPct: 10, upPct: 10 };

function normaliseStress(stress?: Partial<ScenarioStress>): ScenarioStress {
  const clampPct = (v: number | undefined, fallback: number) =>
    Math.max(0, Math.min(40, Number.isFinite(v as number) ? (v as number) : fallback));
  return {
    downPct: clampPct(stress?.downPct, DEFAULT_STRESS.downPct),
    upPct: clampPct(stress?.upPct, DEFAULT_STRESS.upPct),
  };
}

export function deriveDealEconomics(
  property: PropertyWithDeal,
  stressInput?: Partial<ScenarioStress>,
): DealEconomics {
  const stress = normaliseStress(stressInput);
  const dn = stress.downPct / 100; // revenue haircut / cost overrun on the downside
  const up = stress.upPct / 100; // revenue upside / cost saving on the upside
  if (property.propertyFlip) {
    const f = property.propertyFlip;
    const fc = calculateFlipMetrics({
      purchasePrice: f.purchasePrice || property.price || 0,
      renovationBudget: f.renovationBudget ?? 0,
      estimatedValue: f.estimatedValue ?? 0,
      holdingCosts: f.holdingCosts ?? 0,
      closingCostsPurchase: f.closingCostsPurchase ?? 0,
      closingCostsSale: f.closingCostsSale ?? 0,
      estimatedRepairCosts: f.estimatedRepairCosts ?? 0,
      afterRepairValue: f.afterRepairValue ?? 0,
      maxOfferPrice: f.maxOfferPrice ?? 0,
      expectedROI: f.expectedROI ?? 0,
      expectedProfitMargin: f.expectedProfitMargin ?? 0,
      daysToComplete: f.daysToComplete ?? 0,
      totalInvestmentBudget: f.totalInvestmentBudget ?? 0,
      spentInvestmentBudget: f.spentInvestmentBudget ?? 0,
    });
    const resale = fc.resaleValue;
    const cost = fc.totalInvestment;
    const hold = fc.holdingMonths > 0 ? fc.holdingMonths : property.targetHoldMonths || 6;
    return {
      scenarios: {
        downside: { projectProfit: resale * (1 - dn) - cost * (1 + dn) },
        base: { projectProfit: fc.expectedProfit },
        upside: { projectProfit: resale * (1 + up) - cost * (1 - up / 2) },
      },
      projectHoldMonths: hold,
      defaultStrategy: "FLIP",
      availableStrategies: ["FLIP", "EARLY_RESALE"],
      propertyType: "FLIP",
    };
  }

  if (property.rentalBond) {
    const r = property.rentalBond;
    const rc = calculateRentalMetrics({
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
    });
    const noi = rc.noi;
    const hold = property.targetHoldMonths || 60;
    // Capital growth over the hold on the property's value (appreciation play).
    const appreciation = (r.appreciationRate ?? 3) / 100;
    const value = r.purchasePrice || property.price || 0;
    const growthProfit = value * (Math.pow(1 + appreciation, hold / 12) - 1);
    return {
      scenarios: {
        downside: {
          projectProfit: growthProfit * Math.max(0, 1 - dn * 5),
          projectAnnualIncome: noi * Math.max(0, 1 - dn * 1.5),
        },
        base: { projectProfit: growthProfit, projectAnnualIncome: noi },
        upside: {
          projectProfit: growthProfit * (1 + up * 3),
          projectAnnualIncome: noi * (1 + up),
        },
      },
      projectHoldMonths: hold,
      defaultStrategy: "RENTAL_INCOME",
      availableStrategies: ["RENTAL_INCOME", "BUY_AND_HOLD", "EARLY_RESALE"],
      propertyType: "RENTAL",
    };
  }

  if (property.propertyDevelopment) {
    const d = property.propertyDevelopment;
    const dc = calculateDevelopmentMetrics({
      developmentType: d.developmentType ?? "AFFORDABLE_RESALE",
      landAcquisitionCost: d.landAcquisitionCost ?? 0,
      hardCosts: d.hardCosts ?? 0,
      softCosts: d.softCosts ?? 0,
      financingCosts: d.financingCosts ?? 0,
      contingencyPercent: d.contingencyPercent ?? 10,
      contingencyAmount: d.contingencyAmount ?? 0,
      expectedSalePricePerUnit: d.expectedSalePricePerUnit ?? 0,
      totalExpectedRevenue: d.totalExpectedRevenue ?? 0,
      expectedProfit: d.expectedProfit ?? 0,
      expectedMonthlyRentPerUnit: d.expectedMonthlyRentPerUnit ?? 0,
      annualOperatingExpenses: d.annualOperatingExpenses ?? 0,
      stabilizedCapRate: d.stabilizedCapRate ?? 0,
      expectedGrossYield: d.expectedGrossYield ?? 0,
      expectedNetYield: d.expectedNetYield ?? 0,
      expectedROI: d.expectedROI ?? 0,
      expectedIRR: d.expectedIRR ?? 0,
      developmentTimelineMonths: d.developmentTimelineMonths ?? 0,
      preSaleUnits: d.preSaleUnits ?? 0,
      costPerSquareMeter: d.costPerSquareMeter ?? 0,
      totalSquareMeters: d.totalSquareMeters ?? 0,
      numberOfUnits: d.numberOfUnits ?? 0,
      totalBudget: d.totalBudget ?? 0,
    });
    const hold = (d.developmentTimelineMonths ?? 0) > 0 ? d.developmentTimelineMonths : property.targetHoldMonths || 24;
    const isRental = (dc.noi ?? 0) > 0 && (dc.derivedProfit ?? 0) <= 0;
    if (isRental) {
      const noi = dc.noi ?? 0;
      return {
        scenarios: {
          downside: { projectProfit: 0, projectAnnualIncome: noi * Math.max(0, 1 - dn * 1.5) },
          base: { projectProfit: 0, projectAnnualIncome: noi },
          upside: { projectProfit: 0, projectAnnualIncome: noi * (1 + up) },
        },
        projectHoldMonths: hold,
        defaultStrategy: "RENTAL_INCOME",
        availableStrategies: ["RENTAL_INCOME", "BUY_AND_HOLD", "EARLY_RESALE"],
        propertyType: "DEVELOPMENT",
      };
    }
    // Resale development — mirrors the opportunity page's sensitivity rows.
    const gdv = dc.grossDevelopmentValue ?? d.totalExpectedRevenue ?? 0;
    const cost = dc.totalCosts;
    return {
      scenarios: {
        downside: { projectProfit: gdv * (1 - dn) - cost * (1 + dn) },
        base: { projectProfit: dc.derivedProfit ?? d.expectedProfit ?? 0 },
        upside: { projectProfit: gdv * (1 + up) - cost * (1 - up / 2) },
      },
      projectHoldMonths: hold,
      defaultStrategy: "DEVELOPMENT_EXIT",
      availableStrategies: ["DEVELOPMENT_EXIT", "EARLY_RESALE"],
      propertyType: "DEVELOPMENT",
    };
  }

  // No structured deal — fall back to the property's headline expected return.
  const hold = property.targetHoldMonths || 36;
  return {
    scenarios: {
      downside: { projectProfit: 0 },
      base: { projectProfit: 0 },
      upside: { projectProfit: 0 },
    },
    projectHoldMonths: hold,
    defaultStrategy: "BUY_AND_HOLD",
    availableStrategies: ["BUY_AND_HOLD", "EARLY_RESALE"],
    propertyType: "RENTAL",
  };
}

/**
 * SARS-aware estimated tax rates on the investor's gain, split into the
 * rental-income portion and the capital-gain portion and flexed by how the
 * investor holds the stake (company/SPV vs individual).
 */
function taxRatesFor(
  strategy: InvestorStrategy,
  holdingType: HoldingType,
): { incomeRate: number; capitalGainsRate: number } {
  const trading = strategy === "FLIP" || strategy === "DEVELOPMENT_EXIT";
  if (holdingType === "INDIVIDUAL") {
    // Trading/rental income at the top marginal rate (45%); capital growth at
    // the effective individual CGT ceiling (40% inclusion × 45% ≈ 18%).
    return trading
      ? { incomeRate: 45, capitalGainsRate: 45 }
      : { incomeRate: 45, capitalGainsRate: 18 };
  }
  // Company / SPV: 27% on trading & rental income; ~21.6% effective CGT on growth.
  return trading
    ? { incomeRate: 27, capitalGainsRate: 27 }
    : { incomeRate: 27, capitalGainsRate: 21.6 };
}

/**
 * Estimate the investor's pro-rata share of SA transaction costs for the deal:
 * transfer duty + conveyancing on acquisition (scaled to their ownership) plus
 * 0.25% securities transfer tax on their own share subscription.
 */
function estimateInvestorTransactionCosts(
  property: any,
  ownershipFraction: number,
  contribution: number,
): number {
  const price =
    property.price ||
    property.propertyFlip?.purchasePrice ||
    property.rentalBond?.purchasePrice ||
    property.propertyDevelopment?.landAcquisitionCost ||
    0;
  const transferDuty = calculateTransferDuty(price);
  const conveyancing = price * 0.012; // ~1.2% attorney + deeds-office registration
  const investorAcquisitionShare = (transferDuty + conveyancing) * ownershipFraction;
  const stt = contribution * 0.0025; // 0.25% STT on the share purchase
  return Math.max(0, investorAcquisitionShare + stt);
}

const financingSchema = z
  .object({
    amount: z.number().min(0),
    annualRate: z.number().min(0).max(40),
    termMonths: z.number().int().min(1).max(360),
  })
  .optional();

// ─────────────────────────────────────────────────────────────
//  calculateInvestmentProjection — live, strategy-aware projection
//  of what a single investor can expect for their contribution.
// ─────────────────────────────────────────────────────────────

export const calculateInvestmentProjection = baseProcedure
  .input(
    z.object({
      propertyId: z.number(),
      amount: z.number().positive(),
      strategy: z.enum(INVESTOR_STRATEGIES as [InvestorStrategy, ...InvestorStrategy[]]).optional(),
      holdMonths: z.number().int().min(1).max(600).optional(),
      financing: financingSchema,
      stressDownPct: z.number().min(0).max(40).optional(),
      stressUpPct: z.number().min(0).max(40).optional(),
      holdingType: z.enum(["INDIVIDUAL", "COMPANY"]).optional(),
    }),
  )
  .query(async ({ input }) => {
    const property = (await db.property.findUnique({
      where: { id: input.propertyId },
      include: { propertyFlip: true, rentalBond: true, propertyDevelopment: true },
    })) as any;
    if (!property) return null;

    const share = await calculateShareInfo(input.propertyId, input.amount);
    if (!share) return null;

    const econ = deriveDealEconomics(property, {
      downPct: input.stressDownPct,
      upPct: input.stressUpPct,
    });
    const strategy = input.strategy ?? econ.defaultStrategy;
    const holdMonths = input.holdMonths ?? econ.projectHoldMonths;

    const feeConfig = await getFeeConfig().catch(() => null);
    const platformFeeRate = (feeConfig?.distributionFeeBps ?? 200) / 100;

    const holdingType: HoldingType = input.holdingType ?? "COMPANY";
    const { incomeRate, capitalGainsRate } = taxRatesFor(strategy, holdingType);
    const ownershipFraction = share.ownershipPercentage / 100;
    const estimatedTransactionCosts = estimateInvestorTransactionCosts(
      property,
      ownershipFraction,
      input.amount,
    );

    const projection = projectInvestorReturn({
      contributionAmount: input.amount,
      ownershipFraction,
      strategy,
      holdMonths,
      projectHoldMonths: econ.projectHoldMonths,
      scenarios: econ.scenarios,
      preferredReturnRate: property.preferredReturnRate ?? 0,
      investorProfitShare: property.investorProfitShare ?? 100,
      platformFeeRate,
      incomeTaxRate: incomeRate,
      capitalGainsTaxRate: capitalGainsRate,
      estimatedTransactionCosts,
      holdingType,
      financing: input.financing,
    });

    return {
      share: {
        numberOfShares: share.numberOfShares,
        sharePrice: share.sharePrice,
        ownershipPercentage: share.ownershipPercentage,
        shareClassName: share.shareClassName,
      },
      projection,
      defaultStrategy: econ.defaultStrategy,
      availableStrategies: econ.availableStrategies,
      projectHoldMonths: econ.projectHoldMonths,
      propertyType: econ.propertyType,
      preferredReturnRate: property.preferredReturnRate ?? 0,
      investorProfitShare: property.investorProfitShare ?? 100,
      holdingType,
      stressDownPct: normaliseStress({ downPct: input.stressDownPct, upPct: input.stressUpPct }).downPct,
      stressUpPct: normaliseStress({ downPct: input.stressDownPct, upPct: input.stressUpPct }).upPct,
    };
  });

// ─────────────────────────────────────────────────────────────
//  updateInvestorStrategy — persist the investor's chosen strategy
//  on their contribution so they remember it and performance can be
//  tracked against it.
// ─────────────────────────────────────────────────────────────

export const updateInvestorStrategy = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      contributionId: z.number(),
      strategy: z.enum(INVESTOR_STRATEGIES as [InvestorStrategy, ...InvestorStrategy[]]),
      strategyHoldMonths: z.number().int().min(1).max(600),
      strategyNotes: z.string().max(1000).optional(),
      usesFinancing: z.boolean().optional(),
      financingAmount: z.number().min(0).optional(),
      financingRate: z.number().min(0).max(40).optional(),
      financingTermMonths: z.number().int().min(0).max(360).optional(),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const contribution = await db.investorContribution.findUnique({
      where: { id: input.contributionId },
      select: { id: true, investorId: true },
    });
    if (!contribution || contribution.investorId !== user.id) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Investment not found." });
    }
    await db.investorContribution.update({
      where: { id: input.contributionId },
      data: {
        strategy: input.strategy,
        strategyHoldMonths: input.strategyHoldMonths,
        strategyNotes: input.strategyNotes,
        usesFinancing: input.usesFinancing ?? false,
        financingAmount: input.financingAmount ?? 0,
        financingRate: input.financingRate ?? 0,
        financingTermMonths: input.financingTermMonths ?? 0,
      } as any,
    });
    return { success: true };
  });
