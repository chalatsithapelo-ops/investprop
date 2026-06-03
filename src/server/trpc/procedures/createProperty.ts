import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
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
import { notifyMatchingInvestors } from "~/server/utils/investor-notifications";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";

export const createProperty = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      title: z.string(),
      description: z.string(),
      address: z.string(),
      city: z.string(),
      state: z.string(),
      zipCode: z.string(),
      price: z.number(),
      imageUrl: z.string().optional(),
      imageUrls: z.array(z.string()).optional(),
      bedrooms: z.number().optional(),
      bathrooms: z.number().optional(),
      squareMeters: z.number().optional(),
      propertyType: z.enum(["flip", "rental", "development"]),
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
      // Flip specific fields
      flipType: z.enum(["RENTAL", "RESALE"]).optional(),
      purchasePrice: z.number().optional(),
      renovationBudget: z.number().optional(),
      estimatedValue: z.number().optional(),
      // Flip advanced financial metrics
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
      // Development specific fields
      projectName: z.string().optional(),
      totalBudget: z.number().optional(),
      startDate: z.string().optional(),
      estimatedEndDate: z.string().optional(),
      numberOfUnits: z.number().optional(),
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
      // Investment package budget fields
      flipTotalInvestmentBudget: z.number().optional(),
      rentalTotalInvestmentBudget: z.number().optional(),
      flipFundingGoal: z.number().optional(),
      rentalFundingGoal: z.number().optional(),
      developmentFundingGoal: z.number().optional(),
    })
  )
  .mutation(async ({ input }) => {
    // Verify authentication
    const user = await getAuthenticatedUser(input.authToken);

    const coverImageUrl =
      input.imageUrl ??
      (input.imageUrls && input.imageUrls.length > 0 ? input.imageUrls[0] : undefined) ??
      "/placeholder-property.svg";

    const imageUrls =
      input.imageUrls && input.imageUrls.length > 0
        ? input.imageUrls
        : [coverImageUrl];

    // Create property
    const property = await db.property.create({
      data: {
        title: input.title,
        description: input.description,
        address: input.address,
        city: input.city,
        state: input.state,
        zipCode: input.zipCode,
        price: input.price,
        imageUrl: coverImageUrl,
        imageUrls,
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
        squareMeters: input.squareMeters,
        investmentStatus: input.investmentStatus || "PLANNING",
        fundingBreakdown: input.fundingBreakdown,
        userId: user.id,
      },
    });

    // Create related records based on property type
    if (input.propertyType === "flip" && input.flipType) {
      // Build input for calculation
      const flipInput: PropertyFlipInput = {
        purchasePrice: input.purchasePrice || 0,
        renovationBudget: input.renovationBudget || 0,
        estimatedValue: input.estimatedValue || 0,
        holdingCosts: input.holdingCosts || 0,
        closingCostsPurchase: input.closingCostsPurchase || 0,
        closingCostsSale: input.closingCostsSale || 0,
        estimatedRepairCosts: input.estimatedRepairCosts || 0,
        afterRepairValue: input.afterRepairValue || 0,
        maxOfferPrice: input.maxOfferPrice || 0,
        expectedROI: input.expectedROI || 0,
        expectedProfitMargin: input.expectedProfitMargin || 0,
        daysToComplete: input.daysToComplete || 0,
        totalInvestmentBudget: input.flipTotalInvestmentBudget || 0,
        spentInvestmentBudget: 0,
      };

      // Calculate metrics
      const calculations = calculateFlipMetrics(flipInput);

      // Calculate profit margin
      const profitMargin = flipInput.estimatedValue > 0
        ? (calculations.expectedProfit / flipInput.estimatedValue) * 100
        : 0;

      await db.propertyFlip.create({
        data: {
          propertyId: property.id,
          flipType: input.flipType,
          purchasePrice: flipInput.purchasePrice,
          renovationBudget: flipInput.renovationBudget,
          estimatedValue: flipInput.estimatedValue,
          holdingCosts: flipInput.holdingCosts,
          closingCostsPurchase: flipInput.closingCostsPurchase,
          closingCostsSale: flipInput.closingCostsSale,
          estimatedRepairCosts: flipInput.estimatedRepairCosts,
          afterRepairValue: flipInput.afterRepairValue,
          maxOfferPrice: flipInput.maxOfferPrice,
          expectedROI: calculations.calculatedROI,
          expectedProfitMargin: profitMargin,
          daysToComplete: flipInput.daysToComplete,
          totalInvestmentBudget: input.flipTotalInvestmentBudget ||
            (flipInput.purchasePrice + flipInput.renovationBudget + flipInput.holdingCosts + flipInput.closingCostsPurchase),
          spentInvestmentBudget: 0,
          fundingGoal: input.flipFundingGoal || 0,
          userId: user.id,
        },
      });
    } else if (input.propertyType === "rental") {
      // Calculate monthly debt service from financing inputs
      const downPayment = input.downPaymentAmount || 0;
      const purchasePrice = input.rentalPurchasePrice || 0;
      const loanAmount = purchasePrice - downPayment;
      const interestRate = input.interestRate || 0;
      const loanTermYears = input.loanTermYears || 0;

      const monthlyDebtService = calculateMonthlyDebtService(
        loanAmount,
        interestRate,
        loanTermYears
      );

      // Build input for calculation
      const rentalInput: RentalPropertyInput = {
        purchasePrice: purchasePrice,
        monthlyRent: input.monthlyRent || 0,
        annualPropertyTax: input.annualPropertyTax || 0,
        annualInsurance: input.annualInsurance || 0,
        monthlyHOAFees: input.monthlyHOAFees || 0,
        monthlyMaintenanceReserve: input.monthlyMaintenanceReserve || 0,
        monthlyUtilities: input.monthlyUtilities || 0,
        monthlyManagementFee: input.monthlyManagementFee || 0,
        vacancyRate: input.vacancyRate !== undefined ? input.vacancyRate : 5,
        appreciationRate: input.appreciationRate !== undefined ? input.appreciationRate : 3,
        capRate: input.capRate || 0,
        cashOnCashReturn: input.cashOnCashReturn || 0,
        grossRentMultiplier: input.grossRentMultiplier || 0,
        debtServiceCoverageRatio: input.debtServiceCoverageRatio || 0,
        grossYield: input.grossYield || 0,
        netYield: input.netYield || 0,
        downPaymentAmount: downPayment,
        loanAmount: loanAmount,
        interestRate: interestRate,
        loanTermYears: loanTermYears,
        monthlyDebtService: monthlyDebtService,
        totalInvestmentBudget: input.rentalTotalInvestmentBudget || (purchasePrice + downPayment),
        spentInvestmentBudget: 0,
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

      await db.rentalBond.create({
        data: {
          propertyId: property.id,
          bondAmount: input.bondAmount || 0,
          monthlyRent: rentalInput.monthlyRent,
          leaseStartDate: input.leaseStartDate ? new Date(input.leaseStartDate) : new Date(),
          leaseEndDate: input.leaseEndDate ? new Date(input.leaseEndDate) : new Date(),
          purchasePrice: rentalInput.purchasePrice,
          annualPropertyTax: rentalInput.annualPropertyTax,
          annualInsurance: rentalInput.annualInsurance,
          monthlyHOAFees: rentalInput.monthlyHOAFees,
          monthlyMaintenanceReserve: rentalInput.monthlyMaintenanceReserve,
          monthlyUtilities: rentalInput.monthlyUtilities,
          monthlyManagementFee: rentalInput.monthlyManagementFee,
          vacancyRate: rentalInput.vacancyRate,
          appreciationRate: rentalInput.appreciationRate,
          capRate: calculations.calculatedCapRate,
          cashOnCashReturn: calculations.cashOnCashReturn,
          grossRentMultiplier: grossRentMultiplier,
          debtServiceCoverageRatio: dscr,
          grossYield: calculations.grossYield,
          netYield: calculations.netYield,
          // Financing fields
          downPaymentAmount: downPayment,
          loanAmount: loanAmount,
          interestRate: interestRate,
          loanTermYears: loanTermYears,
          monthlyDebtService: monthlyDebtService,
          totalInvestmentBudget: input.rentalTotalInvestmentBudget || rentalInput.purchasePrice,
          spentInvestmentBudget: 0,
          fundingGoal: input.rentalFundingGoal || 0,
          userId: user.id,
        },
      });
    } else if (input.propertyType === "development") {
      // Calculate contingency amount
      const baseCosts =
        (input.landAcquisitionCost || 0) +
        (input.hardCosts || 0) +
        (input.softCosts || 0) +
        (input.financingCosts || 0);

      const contingencyPercent = input.contingencyPercent !== undefined ? input.contingencyPercent : 10;
      const contingencyAmount = baseCosts * (contingencyPercent / 100);

      const developmentType = input.developmentType || "AFFORDABLE_RESALE";

      // Build input for calculation
      const devInput: PropertyDevelopmentInput = {
        developmentType: developmentType as "AFFORDABLE_RESALE" | "AFFORDABLE_RENTAL" | "COMMERCIAL_RENTAL",
        landAcquisitionCost: input.landAcquisitionCost || 0,
        hardCosts: input.hardCosts || 0,
        softCosts: input.softCosts || 0,
        financingCosts: input.financingCosts || 0,
        contingencyPercent,
        contingencyAmount,
        expectedSalePricePerUnit: input.expectedSalePricePerUnit || 0,
        totalExpectedRevenue: input.totalExpectedRevenue || 0,
        expectedProfit: input.expectedProfit || 0,
        expectedMonthlyRentPerUnit: input.expectedMonthlyRentPerUnit || 0,
        annualOperatingExpenses: input.annualOperatingExpenses || 0,
        stabilizedCapRate: input.stabilizedCapRate || 0,
        expectedGrossYield: input.expectedGrossYield || 0,
        expectedNetYield: input.expectedNetYield || 0,
        expectedROI: input.developmentExpectedROI || 0,
        expectedIRR: input.expectedIRR || 0,
        developmentTimelineMonths: input.developmentTimelineMonths || 0,
        preSaleUnits: input.preSaleUnits || 0,
        costPerSquareMeter: input.costPerSquareMeter || 0,
        totalSquareMeters: input.totalSquareMeters || 0,
        numberOfUnits: input.numberOfUnits || 0,
        totalBudget: input.totalBudget || 0,
      };

      // Calculate metrics
      const calculations = calculateDevelopmentMetrics(devInput);

      const costPerSquareMeter = devInput.totalSquareMeters > 0
        ? calculations.totalCosts / devInput.totalSquareMeters
        : 0;

      // Prepare data object with common fields
      const developmentData: any = {
        propertyId: property.id,
        projectName: input.projectName || "",
        totalBudget: calculations.totalCosts,
        startDate: input.startDate ? new Date(input.startDate) : new Date(),
        estimatedEndDate: input.estimatedEndDate ? new Date(input.estimatedEndDate) : new Date(),
        numberOfUnits: devInput.numberOfUnits,
        developmentType: developmentType,
        landAcquisitionCost: devInput.landAcquisitionCost,
        hardCosts: devInput.hardCosts,
        softCosts: devInput.softCosts,
        financingCosts: devInput.financingCosts,
        contingencyPercent: contingencyPercent,
        contingencyAmount: contingencyAmount,
        expectedIRR: input.expectedIRR || 0,
        developmentTimelineMonths: devInput.developmentTimelineMonths,
        preSaleUnits: devInput.preSaleUnits,
        costPerSquareMeter: costPerSquareMeter,
        totalSquareMeters: devInput.totalSquareMeters,
        userId: user.id,
      };

      developmentData.fundingGoal = input.developmentFundingGoal || 0;

      // Branch based on development type
      if (developmentType === "AFFORDABLE_RESALE") {
        // Sale-focused development
        const totalExpectedRevenue = devInput.numberOfUnits > 0 && devInput.expectedSalePricePerUnit > 0
          ? devInput.numberOfUnits * devInput.expectedSalePricePerUnit
          : 0;

        const expectedProfit = totalExpectedRevenue - calculations.totalCosts;

        const expectedROI = calculations.totalCosts > 0
          ? (expectedProfit / calculations.totalCosts) * 100
          : 0;

        developmentData.expectedSalePricePerUnit = devInput.expectedSalePricePerUnit;
        developmentData.totalExpectedRevenue = totalExpectedRevenue;
        developmentData.expectedProfit = expectedProfit;
        developmentData.expectedROI = expectedROI;
        // Set rental fields to 0 for sale-focused developments
        developmentData.expectedMonthlyRentPerUnit = 0;
        developmentData.annualOperatingExpenses = 0;
        developmentData.stabilizedCapRate = 0;
        developmentData.expectedGrossYield = 0;
        developmentData.expectedNetYield = 0;
      } else {
        // Rental-focused development (AFFORDABLE_RENTAL or COMMERCIAL_RENTAL)
        developmentData.expectedMonthlyRentPerUnit = devInput.expectedMonthlyRentPerUnit;
        developmentData.annualOperatingExpenses = devInput.annualOperatingExpenses;
        developmentData.stabilizedCapRate = calculations.calculatedCapRate || 0;
        developmentData.expectedGrossYield = calculations.calculatedGrossYield || 0;
        developmentData.expectedNetYield = calculations.calculatedNetYield || 0;
        developmentData.expectedROI = calculations.calculatedCapRate || 0; // For rental, ROI is based on cap rate
        // Set sale fields to 0 for rental-focused developments
        developmentData.expectedSalePricePerUnit = 0;
        developmentData.totalExpectedRevenue = 0;
        developmentData.expectedProfit = 0;
      }

      await db.propertyDevelopment.create({
        data: developmentData,
      });
    }

    // Send new opportunity notifications to matching investors
    // Only notify if the investment status indicates it's open for investment
    const notifiableStatuses = ["RAISING_FUNDS", "FUNDED", "PROJECT_STARTED"];
    if (notifiableStatuses.includes(property.investmentStatus)) {
      // Notify matching investors (non-blocking)
      notifyMatchingInvestors({
        propertyId: property.id,
        title: input.title,
        propertyType: input.propertyType,
        developmentType: input.developmentType,
        price: input.price,
        address: input.address,
        city: input.city,
        state: input.state,
        investmentStatus: property.investmentStatus,
      }).catch((error) => {
        console.error("Error notifying investors:", error);
      });
    }

    return { success: true, propertyId: property.id };
  });
