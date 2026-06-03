import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";

export const createTemplate = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      name: z.string().min(1, "Template name is required"),
      propertyType: z.enum(["flip", "rental", "development"]),
      configuration: z.object({
        // Basic property fields
        title: z.string().optional(),
        description: z.string().optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zipCode: z.string().optional(),
        price: z.number().optional(),
        bedrooms: z.number().optional(),
        bathrooms: z.number().optional(),
        squareMeters: z.number().optional(),
        // Flip specific fields
        flipType: z.enum(["RENTAL", "RESALE"]).optional(),
        purchasePrice: z.number().optional(),
        renovationBudget: z.number().optional(),
        estimatedValue: z.number().optional(),
        holdingCosts: z.number().optional(),
        closingCostsPurchase: z.number().optional(),
        closingCostsSale: z.number().optional(),
        estimatedRepairCosts: z.number().optional(),
        afterRepairValue: z.number().optional(),
        maxOfferPrice: z.number().optional(),
        expectedROI: z.number().optional(),
        expectedProfitMargin: z.number().optional(),
        daysToComplete: z.number().optional(),
        // Rental specific fields
        bondAmount: z.number().optional(),
        monthlyRent: z.number().optional(),
        leaseStartDate: z.string().optional(),
        leaseEndDate: z.string().optional(),
        rentalPurchasePrice: z.number().optional(),
        annualPropertyTax: z.number().optional(),
        annualInsurance: z.number().optional(),
        monthlyHOAFees: z.number().optional(),
        monthlyMaintenanceReserve: z.number().optional(),
        monthlyUtilities: z.number().optional(),
        monthlyManagementFee: z.number().optional(),
        vacancyRate: z.number().optional(),
        appreciationRate: z.number().optional(),
        capRate: z.number().optional(),
        cashOnCashReturn: z.number().optional(),
        grossRentMultiplier: z.number().optional(),
        debtServiceCoverageRatio: z.number().optional(),
        grossYield: z.number().optional(),
        netYield: z.number().optional(),
        downPaymentAmount: z.number().optional(),
        loanAmount: z.number().optional(),
        interestRate: z.number().optional(),
        loanTermYears: z.number().optional(),
        monthlyDebtService: z.number().optional(),
        // Development specific fields
        projectName: z.string().optional(),
        totalBudget: z.number().optional(),
        startDate: z.string().optional(),
        estimatedEndDate: z.string().optional(),
        numberOfUnits: z.number().optional(),
        developmentType: z.enum(["AFFORDABLE_RESALE", "AFFORDABLE_RENTAL", "COMMERCIAL_RENTAL"]).optional(),
        landAcquisitionCost: z.number().optional(),
        hardCosts: z.number().optional(),
        softCosts: z.number().optional(),
        financingCosts: z.number().optional(),
        contingencyPercent: z.number().optional(),
        contingencyAmount: z.number().optional(),
        expectedSalePricePerUnit: z.number().optional(),
        totalExpectedRevenue: z.number().optional(),
        expectedProfit: z.number().optional(),
        expectedMonthlyRentPerUnit: z.number().optional(),
        annualOperatingExpenses: z.number().optional(),
        stabilizedCapRate: z.number().optional(),
        expectedGrossYield: z.number().optional(),
        expectedNetYield: z.number().optional(),
        developmentExpectedROI: z.number().optional(),
        expectedIRR: z.number().optional(),
        developmentTimelineMonths: z.number().optional(),
        preSaleUnits: z.number().optional(),
        costPerSquareMeter: z.number().optional(),
        totalSquareMeters: z.number().optional(),
        flipTotalInvestmentBudget: z.number().optional(),
        rentalTotalInvestmentBudget: z.number().optional(),
        flipFundingGoal: z.number().optional(),
        rentalFundingGoal: z.number().optional(),
        developmentFundingGoal: z.number().optional(),
      }),
    })
  )
  .mutation(async ({ input }) => {
    // Verify authentication
    const user = await getAuthenticatedUser(input.authToken);

    // Create the template
    const template = await db.propertyTemplate.create({
      data: {
        userId: user.id,
        name: input.name,
        propertyType: input.propertyType,
        configuration: input.configuration,
      },
    });

    return {
      success: true,
      templateId: template.id,
    };
  });
