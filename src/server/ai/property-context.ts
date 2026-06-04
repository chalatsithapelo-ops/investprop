/**
 * Build a compact, LLM-friendly text snapshot of a property.
 * Shared by Conversational Co-Pilot, Independent Underwriting,
 * Portfolio Advisor and Auto-Update Drafts.
 */
import { db } from "~/server/db";

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

  if (property.propertyFlip) {
    const f = property.propertyFlip;
    lines.push(``, `FLIP FINANCIALS`);
    lines.push(`Purchase: ${fmt(f.purchasePrice)} | Reno: ${fmt(f.renovationBudget)} | ARV: ${fmt(f.afterRepairValue)}`);
    lines.push(`Holding: ${fmt(f.holdingCosts)} | Closing buy: ${fmt(f.closingCostsPurchase)} | Closing sell: ${fmt(f.closingCostsSale)}`);
    lines.push(`Expected ROI ${pct(f.expectedROI)} | Margin ${pct(f.expectedProfitMargin)} | Days ${f.daysToComplete}`);
  }
  if (property.rentalBond) {
    const r = property.rentalBond;
    lines.push(``, `RENTAL FINANCIALS`);
    lines.push(`Monthly rent: ${fmt(r.monthlyRent)} | Bond: ${fmt(r.bondAmount)}`);
    lines.push(`Cap rate ${pct(r.capRate)} | CoC ${pct(r.cashOnCashReturn)} | DSCR ${r.debtServiceCoverageRatio.toFixed(2)}`);
    lines.push(`Gross yield ${pct(r.grossYield)} | Net yield ${pct(r.netYield)} | Vacancy ${pct(r.vacancyRate)}`);
  }
  if (property.propertyDevelopment) {
    const d = property.propertyDevelopment;
    lines.push(``, `DEVELOPMENT FINANCIALS`);
    lines.push(`Type: ${d.developmentType} | Units: ${d.numberOfUnits} | Timeline: ${d.developmentTimelineMonths}mo`);
    lines.push(`Total budget: ${fmt(d.totalBudget)} | Spent: ${fmt(d.spentBudget)} | Contingency: ${pct(d.contingencyPercent)}`);
    lines.push(`Hard: ${fmt(d.hardCosts)} | Soft: ${fmt(d.softCosts)} | Land: ${fmt(d.landAcquisitionCost)} | Financing: ${fmt(d.financingCosts)}`);
    lines.push(`Expected ROI ${pct(d.expectedROI)} | IRR ${pct(d.expectedIRR)} | Profit ${fmt(d.expectedProfit)}`);
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
      metrics = `ARV R${Math.round(c.propertyFlip.afterRepairValue).toLocaleString()} | ROI ${c.propertyFlip.expectedROI.toFixed(2)}%`;
    } else if (c.rentalBond) {
      metrics = `Rent R${Math.round(c.rentalBond.monthlyRent).toLocaleString()}/mo | Cap ${c.rentalBond.capRate.toFixed(2)}% | DSCR ${c.rentalBond.debtServiceCoverageRatio.toFixed(2)}`;
    } else if (c.propertyDevelopment) {
      metrics = `IRR ${c.propertyDevelopment.expectedIRR.toFixed(2)}% | ${c.propertyDevelopment.numberOfUnits} units | cost/m² R${Math.round(c.propertyDevelopment.costPerSquareMeter).toLocaleString()}`;
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
