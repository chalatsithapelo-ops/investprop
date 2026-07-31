import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { generateText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { env } from "~/server/env";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import {
  calculateFlipMetrics,
  calculateRentalMetrics,
  calculateDevelopmentMetrics,
} from "~/financial-calculations";

export const analyzeProperty = baseProcedure
  .input(
    z.object({
      propertyId: z.number(),
      authToken: z.string(),
    })
  )
  .mutation(async ({ input }) => {
    // Verify authentication token
    const user = await getAuthenticatedUser(input.authToken);

    // Fetch property with all related data
    const property = await db.property.findUnique({
      where: { id: input.propertyId },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            role: true,
          },
        },
        propertyFlip: true,
        rentalBond: true,
        propertyDevelopment: true,
        investorContributions: {
          include: {
            investor: {
              select: {
                name: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!property) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Property not found",
      });
    }

    // Check if OpenRouter API key is configured
    if (!env.OPENROUTER_API_KEY) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "AI analysis is not configured. Please set OPENROUTER_API_KEY environment variable.",
      });
    }

    // Determine property type
    const propertyType = property.propertyFlip
      ? "flip"
      : property.rentalBond
      ? "rental"
      : "development";

    // Build comprehensive property data summary for the AI
    let propertyDataSummary = `
Property: ${property.title}
Location: ${property.address}, ${property.city}, ${property.state} ${property.zipCode}
Price: R${property.price.toLocaleString()}
Status: ${property.status}
Investment Status: ${property.investmentStatus}
${property.bedrooms ? `Bedrooms: ${property.bedrooms}` : ""}
${property.bathrooms ? `Bathrooms: ${property.bathrooms}` : ""}
${property.squareMeters ? `Square Meters: ${property.squareMeters}` : ""}
Description: ${property.description}
`;

    // Add type-specific financial data
    if (property.propertyFlip) {
      const flip = property.propertyFlip;
      const flipCalc = calculateFlipMetrics({
        purchasePrice: flip.purchasePrice || property.price || 0,
        renovationBudget: flip.renovationBudget ?? 0,
        estimatedValue: flip.estimatedValue ?? 0,
        holdingCosts: flip.holdingCosts ?? 0,
        closingCostsPurchase: flip.closingCostsPurchase ?? 0,
        closingCostsSale: flip.closingCostsSale ?? 0,
        estimatedRepairCosts: flip.estimatedRepairCosts ?? 0,
        afterRepairValue: flip.afterRepairValue ?? 0,
        maxOfferPrice: flip.maxOfferPrice ?? 0,
        expectedROI: flip.expectedROI ?? 0,
        expectedProfitMargin: flip.expectedProfitMargin ?? 0,
        daysToComplete: flip.daysToComplete ?? 0,
        totalInvestmentBudget: flip.totalInvestmentBudget ?? 0,
        spentInvestmentBudget: flip.spentInvestmentBudget ?? 0,
      });
      propertyDataSummary += `
FLIP DETAILS (returns are computed with the platform engine — the exact figures shown to investors):
- Flip Type: ${flip.flipType}
- Purchase Price: R${flip.purchasePrice.toLocaleString()}
- Renovation Budget: R${flip.renovationBudget.toLocaleString()}
- Estimated Value: R${flip.estimatedValue.toLocaleString()}
- After Repair Value (ARV / resale value): R${Math.round(flipCalc.resaleValue).toLocaleString()}
- Holding Costs: R${flip.holdingCosts.toLocaleString()}
- Closing Costs (Purchase): R${flip.closingCostsPurchase.toLocaleString()}
- Closing Costs (Sale): R${flip.closingCostsSale.toLocaleString()}
- Estimated Repair Costs: R${flip.estimatedRepairCosts.toLocaleString()}
- Max Offer Price: R${flip.maxOfferPrice.toLocaleString()}
- Total Investment Required: R${Math.round(flipCalc.totalInvestment).toLocaleString()}
- Break-Even Sale Price: R${Math.round(flipCalc.breakEvenPrice).toLocaleString()}
- Expected Gross Profit: R${Math.round(flipCalc.expectedProfit).toLocaleString()}
- Computed ROI: ${flipCalc.displayROI.toFixed(2)}%${flipCalc.holdingMonths > 0 ? `\n- Annualised Return: ${flipCalc.annualisedROI.toFixed(2)}%` : ""}
- Margin of Safety: ${flipCalc.marginOfSafety.toFixed(2)}%
- Net Profit After 2% Fee & Est. Tax: R${Math.round(flipCalc.netProfitAfterFeesAndTax).toLocaleString()}
- Sponsor Target ROI (estimate): ${flip.expectedROI.toFixed(2)}%
- Sponsor Target Profit Margin (estimate): ${flip.expectedProfitMargin.toFixed(2)}%
- Days to Complete: ${flip.daysToComplete}
- Total Investment Budget: R${flip.totalInvestmentBudget.toLocaleString()}
- Spent Investment Budget: R${flip.spentInvestmentBudget.toLocaleString()}
${flip.actualValue ? `- Actual Value: R${flip.actualValue.toLocaleString()}` : ""}
${flip.profit ? `- Actual Profit: R${flip.profit.toLocaleString()}` : ""}
`;
    } else if (property.rentalBond) {
      const rental = property.rentalBond;
      const rentalCalc = calculateRentalMetrics({
        purchasePrice: rental.purchasePrice || property.price || 0,
        monthlyRent: rental.monthlyRent ?? 0,
        annualPropertyTax: rental.annualPropertyTax ?? 0,
        annualInsurance: rental.annualInsurance ?? 0,
        monthlyHOAFees: rental.monthlyHOAFees ?? 0,
        monthlyMaintenanceReserve: rental.monthlyMaintenanceReserve ?? 0,
        monthlyUtilities: rental.monthlyUtilities ?? 0,
        monthlyManagementFee: rental.monthlyManagementFee ?? 0,
        vacancyRate: rental.vacancyRate ?? 5,
        appreciationRate: rental.appreciationRate ?? 3,
        capRate: rental.capRate ?? 0,
        cashOnCashReturn: rental.cashOnCashReturn ?? 0,
        grossRentMultiplier: rental.grossRentMultiplier ?? 0,
        debtServiceCoverageRatio: rental.debtServiceCoverageRatio ?? 0,
        grossYield: rental.grossYield ?? 0,
        netYield: rental.netYield ?? 0,
        downPaymentAmount: rental.downPaymentAmount ?? 0,
        loanAmount: rental.loanAmount || rental.bondAmount || 0,
        interestRate: rental.interestRate ?? 0,
        loanTermYears: rental.loanTermYears ?? 0,
        monthlyDebtService: rental.monthlyDebtService ?? 0,
        totalInvestmentBudget: rental.totalInvestmentBudget ?? 0,
        spentInvestmentBudget: rental.spentInvestmentBudget ?? 0,
      });
      const isLeveraged = (rental.loanAmount || rental.bondAmount || 0) > 0;
      propertyDataSummary += `
RENTAL DETAILS (financial ratios are computed with the platform engine — the exact figures shown to investors):
- Bond Amount: R${rental.bondAmount.toLocaleString()}
- Monthly Rent: R${rental.monthlyRent.toLocaleString()}
- Purchase Price: R${rental.purchasePrice.toLocaleString()}
- Annual Property Tax: R${rental.annualPropertyTax.toLocaleString()}
- Annual Insurance: R${rental.annualInsurance.toLocaleString()}
- Monthly HOA Fees: R${rental.monthlyHOAFees.toLocaleString()}
- Monthly Maintenance Reserve: R${rental.monthlyMaintenanceReserve.toLocaleString()}
- Monthly Utilities: R${rental.monthlyUtilities.toLocaleString()}
- Monthly Management Fee: R${rental.monthlyManagementFee.toLocaleString()}
- Vacancy Rate: ${rental.vacancyRate}%
- Appreciation Rate: ${rental.appreciationRate}%
- Net Operating Income (NOI): R${Math.round(rentalCalc.noi).toLocaleString()}
- Monthly Cash Flow: R${Math.round(rentalCalc.monthlyCashFlow).toLocaleString()}
- Cap Rate: ${rentalCalc.displayCapRate.toFixed(2)}%
- Cap Rate on Total Cost: ${rentalCalc.capRateOnCost.toFixed(2)}%
- Cash-on-Cash Return: ${rentalCalc.cashOnCashReturn.toFixed(2)}%
- Gross Rent Multiplier: ${rentalCalc.grossRentMultiplier.toFixed(2)}
- DSCR: ${isLeveraged ? rentalCalc.dscr.toFixed(2) : "n/a (unleveraged — no debt service)"}
- Gross Yield: ${rentalCalc.grossYield.toFixed(2)}%
- Net Yield: ${rentalCalc.netYield.toFixed(2)}%
- Lease Start: ${new Date(rental.leaseStartDate).toLocaleDateString()}
- Lease End: ${new Date(rental.leaseEndDate).toLocaleDateString()}
${rental.downPaymentAmount > 0 ? `- Down Payment: R${rental.downPaymentAmount.toLocaleString()}` : ""}
${rental.loanAmount > 0 ? `- Loan Amount: R${rental.loanAmount.toLocaleString()}` : ""}
${rental.interestRate > 0 ? `- Interest Rate: ${rental.interestRate.toFixed(2)}%` : ""}
${rental.loanTermYears > 0 ? `- Loan Term: ${rental.loanTermYears} years` : ""}
${rental.monthlyDebtService > 0 ? `- Monthly Debt Service: R${rental.monthlyDebtService.toLocaleString()}` : ""}
${rental.tenantName ? `- Tenant: ${rental.tenantName}` : ""}
`;
    } else if (property.propertyDevelopment) {
      const dev = property.propertyDevelopment;
      const isRental = dev.developmentType === "AFFORDABLE_RENTAL" || dev.developmentType === "COMMERCIAL_RENTAL";
      const devCalc = calculateDevelopmentMetrics({
        developmentType: dev.developmentType ?? "AFFORDABLE_RESALE",
        landAcquisitionCost: dev.landAcquisitionCost ?? 0,
        hardCosts: dev.hardCosts ?? 0,
        softCosts: dev.softCosts ?? 0,
        financingCosts: dev.financingCosts ?? 0,
        contingencyPercent: dev.contingencyPercent ?? 10,
        contingencyAmount: dev.contingencyAmount ?? 0,
        expectedSalePricePerUnit: dev.expectedSalePricePerUnit ?? 0,
        totalExpectedRevenue: dev.totalExpectedRevenue ?? 0,
        expectedProfit: dev.expectedProfit ?? 0,
        expectedMonthlyRentPerUnit: dev.expectedMonthlyRentPerUnit ?? 0,
        annualOperatingExpenses: dev.annualOperatingExpenses ?? 0,
        stabilizedCapRate: dev.stabilizedCapRate ?? 0,
        expectedGrossYield: dev.expectedGrossYield ?? 0,
        expectedNetYield: dev.expectedNetYield ?? 0,
        expectedROI: dev.expectedROI ?? 0,
        expectedIRR: dev.expectedIRR ?? 0,
        developmentTimelineMonths: dev.developmentTimelineMonths ?? 0,
        preSaleUnits: dev.preSaleUnits ?? 0,
        costPerSquareMeter: dev.costPerSquareMeter ?? 0,
        totalSquareMeters: dev.totalSquareMeters ?? 0,
        numberOfUnits: dev.numberOfUnits ?? 0,
        totalBudget: dev.totalBudget ?? 0,
      });
      propertyDataSummary += `
DEVELOPMENT DETAILS (returns are computed with the platform engine — the exact figures shown to investors):
- Project Name: ${dev.projectName}
- Development Type: ${dev.developmentType}
- Number of Units: ${dev.numberOfUnits}
- Total Budget: R${dev.totalBudget.toLocaleString()}
- Spent Budget: R${dev.spentBudget.toLocaleString()}
- Total Development Cost: R${Math.round(devCalc.totalCosts).toLocaleString()}
- Cost per Unit: R${Math.round(devCalc.costPerUnit).toLocaleString()}
- Land Acquisition Cost: R${dev.landAcquisitionCost.toLocaleString()}
- Hard Costs: R${dev.hardCosts.toLocaleString()}
- Soft Costs: R${dev.softCosts.toLocaleString()}
- Financing Costs: R${dev.financingCosts.toLocaleString()}
- Contingency: ${dev.contingencyPercent}% (R${Math.round(devCalc.contingencyAmount).toLocaleString()})
- Profit Margin: ${devCalc.profitMargin.toFixed(2)}%
- Sponsor Target ROI (estimate): ${dev.expectedROI.toFixed(2)}%
- Sponsor Target IRR (estimate): ${dev.expectedIRR.toFixed(2)}%
- Development Timeline: ${dev.developmentTimelineMonths} months
- Start Date: ${new Date(dev.startDate).toLocaleDateString()}
- Estimated Completion: ${new Date(dev.estimatedEndDate).toLocaleDateString()}
- Cost per Square Meter: R${dev.costPerSquareMeter.toFixed(2)}
- Total Square Meters: ${dev.totalSquareMeters.toLocaleString()}
${isRental ? `
- Expected Monthly Rent per Unit: R${dev.expectedMonthlyRentPerUnit.toLocaleString()}
- Annual Operating Expenses: R${dev.annualOperatingExpenses.toLocaleString()}
- Net Operating Income (NOI): R${Math.round(devCalc.noi ?? 0).toLocaleString()}
- Computed Cap Rate: ${(devCalc.calculatedCapRate ?? 0).toFixed(2)}%
- Computed Gross Yield: ${(devCalc.calculatedGrossYield ?? 0).toFixed(2)}%
- Computed Net Yield: ${(devCalc.calculatedNetYield ?? 0).toFixed(2)}%
` : `
- Expected Sale Price per Unit: R${dev.expectedSalePricePerUnit.toLocaleString()}
- Gross Development Value (total sales): R${Math.round(devCalc.grossDevelopmentValue ?? 0).toLocaleString()}
- Expected Profit (revenue − cost): R${Math.round(devCalc.derivedProfit ?? 0).toLocaleString()}
- Computed ROI: ${(devCalc.derivedROI ?? 0).toFixed(2)}%${devCalc.annualisedROI != null && dev.developmentTimelineMonths > 0 ? `\n- Annualised Return: ${devCalc.annualisedROI.toFixed(2)}%` : ""}
- Pre-Sale Units: ${dev.preSaleUnits} of ${dev.numberOfUnits}
`}
`;
    }

    // Add investor information
    if (property.investorContributions.length > 0) {
      const totalContributions = property.investorContributions.reduce(
        (sum, contrib) => sum + contrib.contributionAmount,
        0
      );
      const totalExpectedReturns = property.investorContributions.reduce(
        (sum, contrib) => sum + contrib.expectedReturnAmount,
        0
      );
      propertyDataSummary += `
INVESTOR INFORMATION:
- Number of Investors: ${property.investorContributions.length}
- Total Contributions: R${totalContributions.toLocaleString()}
- Total Expected Returns: R${totalExpectedReturns.toLocaleString()}
`;
    }

    // Create AI model
    const openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
    const model = openrouter("openai/gpt-4o");

    // Generate analysis
    const systemPrompt = `You are an expert real estate investment analyst with deep knowledge of property markets, financial analysis, and investment strategies. Your role is to provide comprehensive, actionable insights on property investments.

When analyzing properties, consider:
- Market conditions and trends in the specific location
- Risk factors and mitigation strategies
- Investment viability and return potential
- Competitive positioning
- Exit strategy options
- Timing considerations
- Regulatory and legal factors
- Market demand and supply dynamics

Provide your analysis in a professional, well-structured format using markdown. Include:
1. **Executive Summary** - A brief overview of your assessment
2. **Market Analysis** - Insights on the local market and property positioning
3. **Risk Assessment** - Key risks and how to mitigate them
4. **Investment Recommendation** - Your professional opinion on the investment
5. **Strategic Considerations** - Additional factors to consider
6. **Next Steps** - Actionable recommendations

Be specific, data-driven where possible, and provide practical insights that complement the quantitative financial metrics. Your analysis should be approximately 400-600 words.`;

    const userPrompt = `Please analyze the following ${propertyType} property investment and provide a comprehensive qualitative assessment:

${propertyDataSummary}

Focus on qualitative insights that complement the quantitative metrics already available. Consider market dynamics, risk factors, strategic positioning, and provide actionable recommendations for investors and property managers.`;

    try {
      const { text } = await generateText({
        model,
        system: systemPrompt,
        prompt: userPrompt,
      });

      // Save the analysis to the database
      const savedAnalysis = await db.aIAnalysis.create({
        data: {
          propertyId: input.propertyId,
          analysis: text,
          propertyType,
          generatedAt: new Date(),
        },
      });

      return {
        id: savedAnalysis.id,
        analysis: savedAnalysis.analysis,
        propertyType: savedAnalysis.propertyType as "flip" | "rental" | "development",
        generatedAt: savedAnalysis.generatedAt.toISOString(),
      };
    } catch (error) {
      console.error("AI analysis error:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to generate AI analysis. Please try again later.",
      });
    }
  });
