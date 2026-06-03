import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import {
  calculateFlipMetrics,
  calculateRentalMetrics,
  calculateDevelopmentMetrics,
  calculateMonthlyDebtService,
  calculateDebtServiceCoverageRatio,
  type PropertyFlipInput,
  type RentalPropertyInput,
  type PropertyDevelopmentInput,
} from "~/financial-calculations";
import { createNotification } from "./notifications";

export const updateProperty = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      // Basic property fields (optional for partial updates)
      title: z.string().optional(),
      description: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      state: z.string().optional(),
      zipCode: z.string().optional(),
      price: z.number().optional(),
      imageUrl: z.string().optional(),
      imageUrls: z.array(z.string()).optional(),
      bedrooms: z.number().optional(),
      bathrooms: z.number().optional(),
      squareMeters: z.number().optional(),
      status: z.enum(["AVAILABLE", "IN_PROGRESS", "COMPLETED", "SOLD", "RENTED"]).optional(),
      investmentStatus: z.enum(["PLANNING", "RAISING_FUNDS", "FUNDED", "PROJECT_STARTED", "COMPLETED"]).optional(),
      fundingBreakdown: z
        .array(
          z.object({
            category: z.string(),
            amount: z.number(),
            description: z.string().optional(),
          })
        )
        .optional(),
      // Mark complete action fields
      markComplete: z.boolean().optional(),
      // Flip specific fields for completion
      actualValue: z.number().optional(),
      profit: z.number().optional(),
      completionDate: z.string().optional(),
      // Flip advanced financial metrics
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
      // Investment package budget fields
      flipTotalInvestmentBudget: z.number().optional(),
      // Rental specific fields
      tenantName: z.string().optional(),
      tenantEmail: z.string().optional(),
      bondAmount: z.number().optional(),
      monthlyRent: z.number().optional(),
      leaseStartDate: z.string().optional(),
      leaseEndDate: z.string().optional(),
      // Rental advanced financial metrics
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
      // Rental financing fields
      downPaymentAmount: z.number().optional(),
      loanAmount: z.number().optional(),
      interestRate: z.number().optional(),
      loanTermYears: z.number().optional(),
      monthlyDebtService: z.number().optional(),
      rentalTotalInvestmentBudget: z.number().optional(),
      flipFundingGoal: z.number().optional(),
      rentalFundingGoal: z.number().optional(),
      developmentFundingGoal: z.number().optional(),
      // Development specific fields
      projectName: z.string().optional(),
      totalBudget: z.number().optional(),
      startDate: z.string().optional(),
      estimatedEndDate: z.string().optional(),
      actualEndDate: z.string().optional(),
      numberOfUnits: z.number().optional(),
      spentBudget: z.number().optional(),
      developmentType: z.enum(["AFFORDABLE_RESALE", "AFFORDABLE_RENTAL", "COMMERCIAL_RENTAL"]).optional(),
      // Development advanced financial metrics
      landAcquisitionCost: z.number().optional(),
      hardCosts: z.number().optional(),
      softCosts: z.number().optional(),
      financingCosts: z.number().optional(),
      contingencyPercent: z.number().optional(),
      contingencyAmount: z.number().optional(),
      // Sale-focused development fields
      expectedSalePricePerUnit: z.number().optional(),
      totalExpectedRevenue: z.number().optional(),
      expectedProfit: z.number().optional(),
      // Rental-focused development fields
      expectedMonthlyRentPerUnit: z.number().optional(),
      annualOperatingExpenses: z.number().optional(),
      stabilizedCapRate: z.number().optional(),
      expectedGrossYield: z.number().optional(),
      expectedNetYield: z.number().optional(),
      // Common development fields
      developmentExpectedROI: z.number().optional(),
      expectedIRR: z.number().optional(),
      developmentTimelineMonths: z.number().optional(),
      preSaleUnits: z.number().optional(),
      costPerSquareMeter: z.number().optional(),
      totalSquareMeters: z.number().optional(),
      // Funding settings
      minimumInvestment: z.number().optional(),
      maximumInvestors: z.number().optional(),
      expectedReturnRate: z.number().optional(),
      fundingGoal: z.number().optional(),
    })
  )
  .mutation(async ({ input }) => {
    // Verify authentication
    const user = await getAuthenticatedUser(input.authToken);

    // Check if property exists and belongs to user
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

    if (property.userId !== user.id) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You do not have permission to update this property",
      });
    }

    // Perform updates in a transaction
    await db.$transaction(async (tx) => {
      // Prepare property update data
      const propertyUpdateData: any = {};
      if (input.title !== undefined) propertyUpdateData.title = input.title;
      if (input.description !== undefined) propertyUpdateData.description = input.description;
      if (input.address !== undefined) propertyUpdateData.address = input.address;
      if (input.city !== undefined) propertyUpdateData.city = input.city;
      if (input.state !== undefined) propertyUpdateData.state = input.state;
      if (input.zipCode !== undefined) propertyUpdateData.zipCode = input.zipCode;
      if (input.price !== undefined) propertyUpdateData.price = input.price;
      if (input.imageUrl !== undefined) propertyUpdateData.imageUrl = input.imageUrl;
      if (input.imageUrls !== undefined) propertyUpdateData.imageUrls = input.imageUrls;
      if (input.bedrooms !== undefined) propertyUpdateData.bedrooms = input.bedrooms;
      if (input.bathrooms !== undefined) propertyUpdateData.bathrooms = input.bathrooms;
      if (input.squareMeters !== undefined) propertyUpdateData.squareMeters = input.squareMeters;
      if (input.status !== undefined) propertyUpdateData.status = input.status;
      if (input.investmentStatus !== undefined) {
        propertyUpdateData.investmentStatus = input.investmentStatus;
        // Auto-publish when status changes to RAISING_FUNDS so it appears in investor opportunities
        if (input.investmentStatus === "RAISING_FUNDS") {
          propertyUpdateData.isPublished = true;
        }
      }
      if (input.fundingBreakdown !== undefined) propertyUpdateData.fundingBreakdown = input.fundingBreakdown;
      if (input.fundingGoal !== undefined) propertyUpdateData.fundingGoal = input.fundingGoal;
      if (input.minimumInvestment !== undefined) propertyUpdateData.minimumInvestment = input.minimumInvestment;
      if (input.maximumInvestors !== undefined) propertyUpdateData.maxInvestors = input.maximumInvestors;
      if (input.expectedReturnRate !== undefined) propertyUpdateData.expectedReturns = input.expectedReturnRate;

      // Handle mark complete action
      if (input.markComplete) {
        propertyUpdateData.status = "COMPLETED";

        // Update type-specific completion fields
        if (property.propertyFlip) {
          await tx.propertyFlip.update({
            where: { propertyId: input.propertyId },
            data: {
              completionDate: input.completionDate ? new Date(input.completionDate) : new Date(),
              actualValue: input.actualValue,
              profit: input.profit,
            },
          });
        } else if (property.propertyDevelopment) {
          await tx.propertyDevelopment.update({
            where: { propertyId: input.propertyId },
            data: {
              actualEndDate: input.actualEndDate ? new Date(input.actualEndDate) : new Date(),
            },
          });
        }
      }

      // Update flip-specific fields if provided
      if (property.propertyFlip) {
        const flipUpdateData: any = {};
        if (input.purchasePrice !== undefined) flipUpdateData.purchasePrice = input.purchasePrice;
        if (input.renovationBudget !== undefined) flipUpdateData.renovationBudget = input.renovationBudget;
        if (input.estimatedValue !== undefined) flipUpdateData.estimatedValue = input.estimatedValue;
        if (input.holdingCosts !== undefined) flipUpdateData.holdingCosts = input.holdingCosts;
        if (input.closingCostsPurchase !== undefined) flipUpdateData.closingCostsPurchase = input.closingCostsPurchase;
        if (input.closingCostsSale !== undefined) flipUpdateData.closingCostsSale = input.closingCostsSale;
        if (input.estimatedRepairCosts !== undefined) flipUpdateData.estimatedRepairCosts = input.estimatedRepairCosts;
        if (input.afterRepairValue !== undefined) flipUpdateData.afterRepairValue = input.afterRepairValue;
        if (input.maxOfferPrice !== undefined) flipUpdateData.maxOfferPrice = input.maxOfferPrice;
        if (input.daysToComplete !== undefined) flipUpdateData.daysToComplete = input.daysToComplete;
        if (input.flipTotalInvestmentBudget !== undefined) flipUpdateData.totalInvestmentBudget = input.flipTotalInvestmentBudget;
        if (input.flipFundingGoal !== undefined) {
          flipUpdateData.fundingGoal = input.flipFundingGoal;
          // Sync sub-type funding goal to main Property table
          propertyUpdateData.fundingGoal = input.flipFundingGoal;
        }

        // Merge existing data with updates for calculation
        const flipInput: PropertyFlipInput = {
          purchasePrice: input.purchasePrice !== undefined ? input.purchasePrice : property.propertyFlip.purchasePrice,
          renovationBudget: input.renovationBudget !== undefined ? input.renovationBudget : property.propertyFlip.renovationBudget,
          estimatedValue: input.estimatedValue !== undefined ? input.estimatedValue : property.propertyFlip.estimatedValue,
          holdingCosts: input.holdingCosts !== undefined ? input.holdingCosts : property.propertyFlip.holdingCosts,
          closingCostsPurchase: input.closingCostsPurchase !== undefined ? input.closingCostsPurchase : property.propertyFlip.closingCostsPurchase,
          closingCostsSale: input.closingCostsSale !== undefined ? input.closingCostsSale : property.propertyFlip.closingCostsSale,
          estimatedRepairCosts: input.estimatedRepairCosts !== undefined ? input.estimatedRepairCosts : property.propertyFlip.estimatedRepairCosts,
          afterRepairValue: input.afterRepairValue !== undefined ? input.afterRepairValue : property.propertyFlip.afterRepairValue,
          maxOfferPrice: input.maxOfferPrice !== undefined ? input.maxOfferPrice : property.propertyFlip.maxOfferPrice,
          expectedROI: property.propertyFlip.expectedROI,
          expectedProfitMargin: property.propertyFlip.expectedProfitMargin,
          daysToComplete: input.daysToComplete !== undefined ? input.daysToComplete : property.propertyFlip.daysToComplete,
          totalInvestmentBudget: input.flipTotalInvestmentBudget !== undefined ? input.flipTotalInvestmentBudget : property.propertyFlip.totalInvestmentBudget,
          spentInvestmentBudget: property.propertyFlip.spentInvestmentBudget,
        };

        // Calculate metrics
        const calculations = calculateFlipMetrics(flipInput);

        // Calculate profit margin
        const profitMargin = flipInput.estimatedValue > 0
          ? (calculations.expectedProfit / flipInput.estimatedValue) * 100
          : 0;

        // Add calculated values to update
        flipUpdateData.expectedROI = calculations.calculatedROI;
        flipUpdateData.expectedProfitMargin = profitMargin;

        if (Object.keys(flipUpdateData).length > 0) {
          await tx.propertyFlip.update({
            where: { propertyId: input.propertyId },
            data: flipUpdateData,
          });
        }
      }

      // Update rental-specific fields if provided
      if (property.rentalBond) {
        const rentalUpdateData: any = {};
        if (input.tenantName !== undefined) rentalUpdateData.tenantName = input.tenantName;
        if (input.tenantEmail !== undefined) rentalUpdateData.tenantEmail = input.tenantEmail;
        if (input.bondAmount !== undefined) rentalUpdateData.bondAmount = input.bondAmount;
        if (input.monthlyRent !== undefined) rentalUpdateData.monthlyRent = input.monthlyRent;
        if (input.leaseStartDate !== undefined) rentalUpdateData.leaseStartDate = new Date(input.leaseStartDate);
        if (input.leaseEndDate !== undefined) rentalUpdateData.leaseEndDate = new Date(input.leaseEndDate);
        if (input.rentalPurchasePrice !== undefined) rentalUpdateData.purchasePrice = input.rentalPurchasePrice;
        if (input.annualPropertyTax !== undefined) rentalUpdateData.annualPropertyTax = input.annualPropertyTax;
        if (input.annualInsurance !== undefined) rentalUpdateData.annualInsurance = input.annualInsurance;
        if (input.monthlyHOAFees !== undefined) rentalUpdateData.monthlyHOAFees = input.monthlyHOAFees;
        if (input.monthlyMaintenanceReserve !== undefined) rentalUpdateData.monthlyMaintenanceReserve = input.monthlyMaintenanceReserve;
        if (input.monthlyUtilities !== undefined) rentalUpdateData.monthlyUtilities = input.monthlyUtilities;
        if (input.monthlyManagementFee !== undefined) rentalUpdateData.monthlyManagementFee = input.monthlyManagementFee;
        if (input.vacancyRate !== undefined) rentalUpdateData.vacancyRate = input.vacancyRate;
        if (input.appreciationRate !== undefined) rentalUpdateData.appreciationRate = input.appreciationRate;
        if (input.rentalTotalInvestmentBudget !== undefined) rentalUpdateData.totalInvestmentBudget = input.rentalTotalInvestmentBudget;
        if (input.rentalFundingGoal !== undefined) {
          rentalUpdateData.fundingGoal = input.rentalFundingGoal;
          // Sync sub-type funding goal to main Property table
          propertyUpdateData.fundingGoal = input.rentalFundingGoal;
        }

        // Handle financing fields
        if (input.downPaymentAmount !== undefined) rentalUpdateData.downPaymentAmount = input.downPaymentAmount;
        if (input.interestRate !== undefined) rentalUpdateData.interestRate = input.interestRate;
        if (input.loanTermYears !== undefined) rentalUpdateData.loanTermYears = input.loanTermYears;

        // Merge existing data with updates for calculation
        const purchasePrice = input.rentalPurchasePrice !== undefined ? input.rentalPurchasePrice : property.rentalBond.purchasePrice;
        const downPayment = input.downPaymentAmount !== undefined ? input.downPaymentAmount : property.rentalBond.downPaymentAmount;
        const interestRate = input.interestRate !== undefined ? input.interestRate : property.rentalBond.interestRate;
        const loanTermYears = input.loanTermYears !== undefined ? input.loanTermYears : property.rentalBond.loanTermYears;

        // Calculate loan amount and monthly debt service
        const loanAmount = purchasePrice - downPayment;
        const monthlyDebtService = calculateMonthlyDebtService(loanAmount, interestRate, loanTermYears);

        rentalUpdateData.loanAmount = loanAmount;
        rentalUpdateData.monthlyDebtService = monthlyDebtService;

        const rentalInput: RentalPropertyInput = {
          purchasePrice: purchasePrice,
          monthlyRent: input.monthlyRent !== undefined ? input.monthlyRent : property.rentalBond.monthlyRent,
          annualPropertyTax: input.annualPropertyTax !== undefined ? input.annualPropertyTax : property.rentalBond.annualPropertyTax,
          annualInsurance: input.annualInsurance !== undefined ? input.annualInsurance : property.rentalBond.annualInsurance,
          monthlyHOAFees: input.monthlyHOAFees !== undefined ? input.monthlyHOAFees : property.rentalBond.monthlyHOAFees,
          monthlyMaintenanceReserve: input.monthlyMaintenanceReserve !== undefined ? input.monthlyMaintenanceReserve : property.rentalBond.monthlyMaintenanceReserve,
          monthlyUtilities: input.monthlyUtilities !== undefined ? input.monthlyUtilities : property.rentalBond.monthlyUtilities,
          monthlyManagementFee: input.monthlyManagementFee !== undefined ? input.monthlyManagementFee : property.rentalBond.monthlyManagementFee,
          vacancyRate: input.vacancyRate !== undefined ? input.vacancyRate : property.rentalBond.vacancyRate,
          appreciationRate: input.appreciationRate !== undefined ? input.appreciationRate : property.rentalBond.appreciationRate,
          capRate: property.rentalBond.capRate,
          cashOnCashReturn: property.rentalBond.cashOnCashReturn,
          grossRentMultiplier: property.rentalBond.grossRentMultiplier,
          debtServiceCoverageRatio: property.rentalBond.debtServiceCoverageRatio,
          grossYield: property.rentalBond.grossYield,
          netYield: property.rentalBond.netYield,
          downPaymentAmount: downPayment,
          loanAmount: loanAmount,
          interestRate: interestRate,
          loanTermYears: loanTermYears,
          monthlyDebtService: monthlyDebtService,
          totalInvestmentBudget: input.rentalTotalInvestmentBudget !== undefined ? input.rentalTotalInvestmentBudget : property.rentalBond.totalInvestmentBudget,
          spentInvestmentBudget: property.rentalBond.spentInvestmentBudget,
        };

        // Calculate metrics
        const calculations = calculateRentalMetrics(rentalInput);

        // Calculate additional metrics
        const grossRentMultiplier = calculations.annualGrossRent > 0
          ? rentalInput.purchasePrice / calculations.annualGrossRent
          : 0;

        // Calculate DSCR
        const annualDebtService = monthlyDebtService * 12;
        const dscr = calculateDebtServiceCoverageRatio(calculations.noi, annualDebtService);

        // Add calculated values to update
        rentalUpdateData.capRate = calculations.calculatedCapRate;
        rentalUpdateData.cashOnCashReturn = calculations.cashOnCashReturn;
        rentalUpdateData.grossRentMultiplier = grossRentMultiplier;
        rentalUpdateData.debtServiceCoverageRatio = dscr;
        rentalUpdateData.grossYield = calculations.grossYield;
        rentalUpdateData.netYield = calculations.netYield;

        if (Object.keys(rentalUpdateData).length > 0) {
          await tx.rentalBond.update({
            where: { propertyId: input.propertyId },
            data: rentalUpdateData,
          });
        }
      }

      // Update development-specific fields if provided
      if (property.propertyDevelopment) {
        const devUpdateData: any = {};
        if (input.projectName !== undefined) devUpdateData.projectName = input.projectName;
        if (input.spentBudget !== undefined) devUpdateData.spentBudget = input.spentBudget;
        if (input.startDate !== undefined) devUpdateData.startDate = new Date(input.startDate);
        if (input.estimatedEndDate !== undefined) devUpdateData.estimatedEndDate = new Date(input.estimatedEndDate);
        if (input.numberOfUnits !== undefined) devUpdateData.numberOfUnits = input.numberOfUnits;
        if (input.developmentType !== undefined) devUpdateData.developmentType = input.developmentType;
        if (input.landAcquisitionCost !== undefined) devUpdateData.landAcquisitionCost = input.landAcquisitionCost;
        if (input.hardCosts !== undefined) devUpdateData.hardCosts = input.hardCosts;
        if (input.softCosts !== undefined) devUpdateData.softCosts = input.softCosts;
        if (input.financingCosts !== undefined) devUpdateData.financingCosts = input.financingCosts;
        if (input.contingencyPercent !== undefined) devUpdateData.contingencyPercent = input.contingencyPercent;
        if (input.expectedIRR !== undefined) devUpdateData.expectedIRR = input.expectedIRR;
        if (input.developmentTimelineMonths !== undefined) devUpdateData.developmentTimelineMonths = input.developmentTimelineMonths;
        if (input.totalSquareMeters !== undefined) devUpdateData.totalSquareMeters = input.totalSquareMeters;
        if (input.developmentFundingGoal !== undefined) {
          devUpdateData.fundingGoal = input.developmentFundingGoal;
          // Sync sub-type funding goal to main Property table
          propertyUpdateData.fundingGoal = input.developmentFundingGoal;
        }

        // Merge existing data with updates for calculation
        const landAcquisitionCost = input.landAcquisitionCost !== undefined ? input.landAcquisitionCost : property.propertyDevelopment.landAcquisitionCost;
        const hardCosts = input.hardCosts !== undefined ? input.hardCosts : property.propertyDevelopment.hardCosts;
        const softCosts = input.softCosts !== undefined ? input.softCosts : property.propertyDevelopment.softCosts;
        const financingCosts = input.financingCosts !== undefined ? input.financingCosts : property.propertyDevelopment.financingCosts;

        const baseCosts = landAcquisitionCost + hardCosts + softCosts + financingCosts;
        const contingencyPercent = input.contingencyPercent !== undefined ? input.contingencyPercent : property.propertyDevelopment.contingencyPercent;
        const contingencyAmount = baseCosts * (contingencyPercent / 100);

        const developmentType = input.developmentType !== undefined ? input.developmentType : property.propertyDevelopment.developmentType;

        const devInput: PropertyDevelopmentInput = {
          developmentType: developmentType as "AFFORDABLE_RESALE" | "AFFORDABLE_RENTAL" | "COMMERCIAL_RENTAL",
          landAcquisitionCost,
          hardCosts,
          softCosts,
          financingCosts,
          contingencyPercent,
          contingencyAmount,
          expectedSalePricePerUnit: input.expectedSalePricePerUnit !== undefined ? input.expectedSalePricePerUnit : property.propertyDevelopment.expectedSalePricePerUnit,
          totalExpectedRevenue: property.propertyDevelopment.totalExpectedRevenue,
          expectedProfit: property.propertyDevelopment.expectedProfit,
          expectedMonthlyRentPerUnit: input.expectedMonthlyRentPerUnit !== undefined ? input.expectedMonthlyRentPerUnit : property.propertyDevelopment.expectedMonthlyRentPerUnit,
          annualOperatingExpenses: input.annualOperatingExpenses !== undefined ? input.annualOperatingExpenses : property.propertyDevelopment.annualOperatingExpenses,
          stabilizedCapRate: property.propertyDevelopment.stabilizedCapRate,
          expectedGrossYield: property.propertyDevelopment.expectedGrossYield,
          expectedNetYield: property.propertyDevelopment.expectedNetYield,
          expectedROI: property.propertyDevelopment.expectedROI,
          expectedIRR: input.expectedIRR !== undefined ? input.expectedIRR : property.propertyDevelopment.expectedIRR,
          developmentTimelineMonths: input.developmentTimelineMonths !== undefined ? input.developmentTimelineMonths : property.propertyDevelopment.developmentTimelineMonths,
          preSaleUnits: input.preSaleUnits !== undefined ? input.preSaleUnits : property.propertyDevelopment.preSaleUnits,
          costPerSquareMeter: property.propertyDevelopment.costPerSquareMeter,
          totalSquareMeters: input.totalSquareMeters !== undefined ? input.totalSquareMeters : property.propertyDevelopment.totalSquareMeters,
          numberOfUnits: input.numberOfUnits !== undefined ? input.numberOfUnits : property.propertyDevelopment.numberOfUnits,
          totalBudget: property.propertyDevelopment.totalBudget,
        };

        // Calculate metrics
        const calculations = calculateDevelopmentMetrics(devInput);

        const costPerSquareMeter = devInput.totalSquareMeters > 0
          ? calculations.totalCosts / devInput.totalSquareMeters
          : 0;

        // Add calculated values to update
        devUpdateData.contingencyAmount = contingencyAmount;
        devUpdateData.totalBudget = calculations.totalCosts;
        devUpdateData.costPerSquareMeter = costPerSquareMeter;

        // Branch based on development type
        if (developmentType === "AFFORDABLE_RESALE") {
          // Sale-focused development calculations
          const totalExpectedRevenue = devInput.numberOfUnits > 0 && devInput.expectedSalePricePerUnit > 0
            ? devInput.numberOfUnits * devInput.expectedSalePricePerUnit
            : 0;

          const expectedProfit = totalExpectedRevenue - calculations.totalCosts;

          const expectedROI = calculations.totalCosts > 0
            ? (expectedProfit / calculations.totalCosts) * 100
            : 0;

          if (input.expectedSalePricePerUnit !== undefined) devUpdateData.expectedSalePricePerUnit = input.expectedSalePricePerUnit;
          devUpdateData.totalExpectedRevenue = totalExpectedRevenue;
          devUpdateData.expectedProfit = expectedProfit;
          devUpdateData.expectedROI = expectedROI;
          if (input.preSaleUnits !== undefined) devUpdateData.preSaleUnits = input.preSaleUnits;
        } else {
          // Rental-focused development calculations
          if (input.expectedMonthlyRentPerUnit !== undefined) devUpdateData.expectedMonthlyRentPerUnit = input.expectedMonthlyRentPerUnit;
          if (input.annualOperatingExpenses !== undefined) devUpdateData.annualOperatingExpenses = input.annualOperatingExpenses;

          devUpdateData.stabilizedCapRate = calculations.calculatedCapRate || 0;
          devUpdateData.expectedGrossYield = calculations.calculatedGrossYield || 0;
          devUpdateData.expectedNetYield = calculations.calculatedNetYield || 0;
          devUpdateData.expectedROI = calculations.calculatedCapRate || 0; // For rental, ROI is based on cap rate
        }

        if (Object.keys(devUpdateData).length > 0) {
          await tx.propertyDevelopment.update({
            where: { propertyId: input.propertyId },
            data: devUpdateData,
          });
        }
      }

      // Update the property itself
      if (Object.keys(propertyUpdateData).length > 0) {
        await tx.property.update({
          where: { id: input.propertyId },
          data: propertyUpdateData,
        });
      }
    });

    // Notify property investors about significant changes
    const notifyInvestors = input.markComplete || input.status || input.investmentStatus;
    if (notifyInvestors) {
      const propertyInvestors = await db.investorContribution.findMany({
        where: { propertyId: input.propertyId },
        select: { investorId: true },
        distinct: ["investorId"],
      });

      let title = "Property Updated";
      let message = `"${property.title}" has been updated`;
      let type: "INFO" | "SUCCESS" | "WARNING" = "INFO";

      if (input.markComplete) {
        title = "Property Completed";
        message = `"${property.title}" has been marked as completed`;
        type = "SUCCESS";
      } else if (input.status) {
        title = "Property Status Changed";
        message = `"${property.title}" status changed to ${input.status}`;
        type = input.status === "COMPLETED" ? "SUCCESS" : "INFO";
      } else if (input.investmentStatus) {
        title = "Investment Status Update";
        message = `"${property.title}" investment status changed to ${input.investmentStatus}`;
        type = input.investmentStatus === "COMPLETED" ? "SUCCESS" : "INFO";
      }

      for (const inv of propertyInvestors) {
        createNotification(
          inv.investorId,
          title,
          message,
          type,
          "PROPERTY",
          input.propertyId
        );
      }
    }

    return { success: true };
  });
