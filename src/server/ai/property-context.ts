/**
 * Build a compact, LLM-friendly text snapshot of a property.
 * Shared by Conversational Co-Pilot, Independent Underwriting,
 * Portfolio Advisor and Auto-Update Drafts.
 */
import { db } from "~/server/db";
import {
  calculateFlipMetrics,
  calculateRentalMetrics,
  calculateDevelopmentMetrics,
  type PropertyFlipInput,
  type RentalPropertyInput,
  type PropertyDevelopmentInput,
} from "~/financial-calculations";

export interface PropertyContextOptions {
  includeFinancials?: boolean;
  includeMilestones?: boolean;
  includeBudget?: boolean;
  includeContributions?: boolean;
  includeLegalDocs?: boolean;
  includeRisks?: boolean;
}

export async function buildPropertyContext(
  propertyId: number,
  opts: PropertyContextOptions = {}
): Promise<{ text: string; propertyTitle: string; propertyType: string } | null> {
  const property = await db.property.findUnique({
    where: { id: propertyId },
    include: {
      propertyFlip: opts.includeFinancials ?? true,
      rentalBond: opts.includeFinancials ?? true,
      propertyDevelopment: opts.includeFinancials ?? true,
      milestones: opts.includeMilestones
        ? { orderBy: { order: "asc" } }
        : false,
      budgetEntries: opts.includeBudget
        ? { orderBy: { dateRecorded: "desc" }, take: 25 }
        : false,
      investorContributions: opts.includeContributions
        ? { include: { investor: { select: { name: true } } } }
        : false,
      legalDocuments: opts.includeLegalDocs
        ? { select: { id: true, documentType: true, title: true, status: true } }
        : false,
      riskEntries: opts.includeRisks
        ? { orderBy: { createdAt: "desc" }, take: 10 }
        : false,
      user: { select: { name: true } },
    },
  });
  if (!property) return null;

  const lines: string[] = [];
  const fmt = (n: number) => `R${Math.round(n).toLocaleString()}`;
  const pct = (n: number) => `${n.toFixed(2)}%`;

  lines.push(`Property #${property.id}: ${property.title}`);
  lines.push(`Location: ${property.address}, ${property.city}, ${property.state} ${property.zipCode}`);
  lines.push(`Sponsor: ${property.user.name}`);
  lines.push(`Status: ${property.status} | Investment status: ${property.investmentStatus}`);
  lines.push(`Sponsor risk rating: ${property.riskRating}`);
  lines.push(`Listing price: ${fmt(property.price)}`);
  if (property.fundingGoal > 0) {
    lines.push(
      `Funding: ${fmt(property.fundingRaised)} of ${fmt(property.fundingGoal)} raised (${pct(
        (property.fundingRaised / property.fundingGoal) * 100
      )})`
    );
  }
  if (property.minimumInvestment > 0) lines.push(`Minimum investment: ${fmt(property.minimumInvestment)}`);
  if (property.expectedReturns > 0) lines.push(`Expected returns: ${pct(property.expectedReturns)}`);
  if (property.bedrooms) lines.push(`Bedrooms: ${property.bedrooms}`);
  if (property.bathrooms) lines.push(`Bathrooms: ${property.bathrooms}`);
  if (property.squareMeters) lines.push(`Size: ${property.squareMeters} m²`);
  if (property.description) lines.push(`Description: ${property.description.slice(0, 500)}`);

  const propertyType = property.propertyFlip
    ? "flip"
    : property.rentalBond
      ? "rental"
      : property.propertyDevelopment
        ? "development"
        : "unknown";

  // IMPORTANT: financial metrics below are DERIVED with the same calculation engine
  // (src/financial-calculations.ts) that renders the numbers investors see on the
  // opportunity page. We deliberately do NOT surface the raw stored fields
  // (e.g. rentalBond.capRate), which are often 0 / stale and would otherwise make
  // the AI contradict the platform UI.
  if (property.propertyFlip) {
    const f = property.propertyFlip;
    const flipInput: PropertyFlipInput = {
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
    };
    const c = calculateFlipMetrics(flipInput);
    lines.push(``, `FLIP FINANCIALS (computed — these match the figures shown to investors on the platform)`);
    lines.push(`Purchase: ${fmt(flipInput.purchasePrice)} | Reno: ${fmt(flipInput.renovationBudget)} | ARV (resale value): ${fmt(c.resaleValue)}`);
    lines.push(`Holding: ${fmt(flipInput.holdingCosts)} | Closing buy: ${fmt(flipInput.closingCostsPurchase)} | Closing sell: ${fmt(flipInput.closingCostsSale)}`);
    lines.push(`Total investment required: ${fmt(c.totalInvestment)} | Break-even sale price: ${fmt(c.breakEvenPrice)}`);
    lines.push(`Expected gross profit: ${fmt(c.expectedProfit)} | ROI ${pct(c.displayROI)}${c.holdingMonths > 0 ? ` | Annualised ${pct(c.annualisedROI)}` : ""}`);
    lines.push(`Margin of safety ${pct(c.marginOfSafety)} | Net profit after 2% platform fee & est. income tax: ${fmt(c.netProfitAfterFeesAndTax)}`);
    lines.push(`Sponsor targets (estimates, not guaranteed): ROI ${pct(flipInput.expectedROI)} | Margin ${pct(flipInput.expectedProfitMargin)} | Timeline ${flipInput.daysToComplete} days`);
  }
  if (property.rentalBond) {
    const r = property.rentalBond;
    const rentalInput: RentalPropertyInput = {
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
    };
    const c = calculateRentalMetrics(rentalInput);
    const isLeveraged = rentalInput.loanAmount > 0;
    lines.push(``, `RENTAL FINANCIALS (computed — these match the figures shown to investors on the platform)`);
    lines.push(`Monthly rent: ${fmt(rentalInput.monthlyRent)} | Purchase price: ${fmt(rentalInput.purchasePrice)} | Bond/loan: ${fmt(rentalInput.loanAmount)}`);
    lines.push(`Annual gross rent: ${fmt(c.annualGrossRent)} | NOI: ${fmt(c.noi)} | Monthly cash flow: ${fmt(c.monthlyCashFlow)}`);
    lines.push(`Cap rate ${pct(c.displayCapRate)} | Cap rate on total cost ${pct(c.capRateOnCost)} | Gross yield ${pct(c.grossYield)} | Net yield ${pct(c.netYield)}`);
    lines.push(
      `Cash-on-cash ${pct(c.cashOnCashReturn)} | ` +
        `DSCR ${isLeveraged ? c.dscr.toFixed(2) : "n/a (unleveraged — no debt service)"} | ` +
        `Gross rent multiplier ${c.grossRentMultiplier.toFixed(1)} | Vacancy ${pct(rentalInput.vacancyRate)}`
    );
  }
  if (property.propertyDevelopment) {
    const d = property.propertyDevelopment;
    const devType = d.developmentType ?? "AFFORDABLE_RESALE";
    const devInput: PropertyDevelopmentInput = {
      developmentType: devType,
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
    };
    const c = calculateDevelopmentMetrics(devInput);
    const isResale = devType === "AFFORDABLE_RESALE";
    lines.push(``, `DEVELOPMENT FINANCIALS (computed — these match the figures shown to investors on the platform)`);
    lines.push(`Type: ${devType} | Units: ${devInput.numberOfUnits} | Timeline: ${devInput.developmentTimelineMonths}mo`);
    lines.push(`Total development cost: ${fmt(c.totalCosts)} | Cost per unit: ${fmt(c.costPerUnit)} | Contingency: ${fmt(c.contingencyAmount)} (${pct(devInput.contingencyPercent)})`);
    lines.push(`Hard: ${fmt(devInput.hardCosts)} | Soft: ${fmt(devInput.softCosts)} | Land: ${fmt(devInput.landAcquisitionCost)} | Financing: ${fmt(devInput.financingCosts)}`);
    if (isResale) {
      lines.push(
        `Gross development value: ${fmt(c.grossDevelopmentValue ?? 0)} | ` +
          `Expected profit (revenue − cost): ${fmt(c.derivedProfit ?? 0)} | ` +
          `ROI ${pct(c.derivedROI ?? 0)}${c.annualisedROI != null && devInput.developmentTimelineMonths > 0 ? ` | Annualised ${pct(c.annualisedROI)}` : ""} | Margin ${pct(c.profitMargin)}`
      );
    } else {
      lines.push(
        `NOI: ${fmt(c.noi ?? 0)} | Cap rate ${pct(c.calculatedCapRate ?? 0)} | ` +
          `Gross yield ${pct(c.calculatedGrossYield ?? 0)} | Net yield ${pct(c.calculatedNetYield ?? 0)} | Margin ${pct(c.profitMargin)}`
      );
    }
    lines.push(`Sponsor targets (estimates, not guaranteed): ROI ${pct(devInput.expectedROI)} | IRR ${pct(devInput.expectedIRR)}`);
  }

  if (opts.includeMilestones && property.milestones && property.milestones.length > 0) {
    lines.push(``, `MILESTONES`);
    for (const m of property.milestones.slice(0, 15)) {
      lines.push(
        `- [${m.status}] ${m.name} | budget ${fmt(m.budgetAllocated)} (spent ${fmt(m.budgetSpent)}) | due ${m.estimatedCompletionDate.toISOString().slice(0, 10)}`
      );
    }
  }

  if (opts.includeBudget && property.budgetEntries && property.budgetEntries.length > 0) {
    lines.push(``, `RECENT BUDGET ENTRIES (last ${property.budgetEntries.length})`);
    for (const b of property.budgetEntries.slice(0, 10)) {
      lines.push(`- ${b.dateRecorded.toISOString().slice(0, 10)} | ${b.category} | ${fmt(b.amount)} | ${b.description.slice(0, 80)}`);
    }
  }

  if (opts.includeContributions && property.investorContributions && property.investorContributions.length > 0) {
    const total = property.investorContributions.reduce((s, c) => s + c.contributionAmount, 0);
    lines.push(``, `INVESTORS: ${property.investorContributions.length} | total committed ${fmt(total)}`);
  }

  if (opts.includeLegalDocs && property.legalDocuments && property.legalDocuments.length > 0) {
    lines.push(``, `LEGAL DOCS`);
    for (const d of property.legalDocuments) lines.push(`- ${d.documentType}: ${d.title} (${d.status})`);
  }

  if (opts.includeRisks && property.riskEntries && property.riskEntries.length > 0) {
    lines.push(``, `RECENT RISKS`);
    for (const r of property.riskEntries) lines.push(`- [${r.severity}] ${r.title}: ${r.description.slice(0, 120)}`);
  }

  return { text: lines.join("\n"), propertyTitle: property.title, propertyType };
}

/**
 * Fetch up to N comparable published properties (same propertyType, same city/state) for
 * cross-checking sponsor numbers in independent underwriting.
 */
export async function findComparables(
  propertyId: number,
  limit = 5
): Promise<{ id: number; title: string; city: string; price: number; type: string; metrics: string }[]> {
  const target = await db.property.findUnique({
    where: { id: propertyId },
    include: { propertyFlip: true, rentalBond: true, propertyDevelopment: true },
  });
  if (!target) return [];

  const type = target.propertyFlip
    ? "flip"
    : target.rentalBond
      ? "rental"
      : target.propertyDevelopment
        ? "development"
        : null;
  if (!type) return [];

  const candidates = await db.property.findMany({
    where: {
      id: { not: propertyId },
      isPublished: true,
      deletedAt: null,
      OR: [{ city: target.city }, { state: target.state }],
      ...(type === "flip" ? { propertyFlip: { isNot: null } } : {}),
      ...(type === "rental" ? { rentalBond: { isNot: null } } : {}),
      ...(type === "development" ? { propertyDevelopment: { isNot: null } } : {}),
    },
    include: { propertyFlip: true, rentalBond: true, propertyDevelopment: true },
    take: limit,
    orderBy: { createdAt: "desc" },
  });

  return candidates.map((c) => {
    let metrics = "";
    if (c.propertyFlip) {
      const f = c.propertyFlip;
      const calc = calculateFlipMetrics({
        purchasePrice: f.purchasePrice || c.price || 0,
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
      metrics = `ARV R${Math.round(calc.resaleValue).toLocaleString()} | ROI ${calc.displayROI.toFixed(2)}%`;
    } else if (c.rentalBond) {
      const r = c.rentalBond;
      const calc = calculateRentalMetrics({
        purchasePrice: r.purchasePrice || c.price || 0,
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
      const dscrText = (r.loanAmount || r.bondAmount || 0) > 0 ? ` | DSCR ${calc.dscr.toFixed(2)}` : "";
      metrics = `Rent R${Math.round(r.monthlyRent).toLocaleString()}/mo | Cap ${calc.displayCapRate.toFixed(2)}% | Net yield ${calc.netYield.toFixed(2)}%${dscrText}`;
    } else if (c.propertyDevelopment) {
      const d = c.propertyDevelopment;
      const calc = calculateDevelopmentMetrics({
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
      const roi = calc.derivedROI != null ? calc.derivedROI : calc.profitMargin;
      metrics = `ROI ${roi.toFixed(2)}% | ${d.numberOfUnits} units | cost/m² R${Math.round(d.costPerSquareMeter).toLocaleString()}`;
    }
    return {
      id: c.id,
      title: c.title,
      city: c.city,
      price: c.price,
      type,
      metrics,
    };
  });
}
