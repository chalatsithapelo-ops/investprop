/**
 * AI Property Office — advisor data surface.
 *
 * Read-only, model-friendly views that widen what the voice/chat office agent
 * can see about the *authenticated* member: live portfolio valuation, wallet,
 * pending payments, open opportunities, governance votes, FICA/compliance,
 * marketplace activity, a proactive briefing, a transparent tax estimate, and
 * a small cross-session memory.
 *
 * Every function is scoped to `user.id` and is called only after the bridge has
 * authenticated the member and asserted office access. These functions never
 * mutate financial state; `saveMemory` is the only writer and it only appends
 * short, redacted member-stated notes to the member's own record.
 */

import { Prisma } from "@prisma/client";
import { db } from "~/server/db";
import { calculateRentalMetrics, buildRentalInput } from "~/financial-calculations";
import { centsToRands } from "~/wallet-calculations";
import { calculateShareInfo, publicEquityFraction } from "~/server/trpc/procedures/share-certificates";
import { OFFICE_LIMIT, redactForModel, taxYearRange } from "./policy";

type AdvisorUser = { id: number; role: string };
type Client = Prisma.TransactionClient;

const round2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

function propertyType(p: { propertyFlip?: unknown; rentalBond?: unknown; propertyDevelopment?: unknown }): string {
  if (p.propertyFlip) return "flip";
  if (p.rentalBond) return "rental";
  if (p.propertyDevelopment) return "development";
  return "other";
}

/** Live portfolio valuation: current reference value, cost basis and unrealised gain. */
export async function loadPortfolioValuation(user: AdvisorUser, client: Client = db) {
  const holdings = await client.shareHolding.findMany({
    where: { investorId: user.id, sharesOwned: { gt: 0 } },
    select: {
      sharesOwned: true,
      averageCostPerShare: true,
      shareClass: { select: { name: true, pricePerShare: true, navPerShare: true, totalShares: true } },
      property: {
        select: {
          id: true, title: true, city: true, state: true, riskRating: true,
          propertyFlip: { select: { id: true } },
          rentalBond: { select: { id: true } },
          propertyDevelopment: { select: { id: true } },
        },
      },
    },
    orderBy: [{ propertyId: "asc" }, { id: "asc" }],
    take: OFFICE_LIMIT,
  });

  const gaps: string[] = [];
  let costBasisKnown = true;
  const positions = holdings.map((h) => {
    const ref = (h.shareClass.navPerShare && h.shareClass.navPerShare > 0)
      ? h.shareClass.navPerShare
      : h.shareClass.pricePerShare;
    const hasCost = Number.isFinite(h.averageCostPerShare) && h.averageCostPerShare > 0;
    if (!hasCost) costBasisKnown = false;
    const currentValue = h.sharesOwned * ref;
    const invested = hasCost ? h.sharesOwned * h.averageCostPerShare : 0;
    return {
      propertyId: h.property.id,
      title: h.property.title,
      city: h.property.city,
      state: h.property.state,
      type: propertyType(h.property),
      risk: h.property.riskRating,
      shares: h.sharesOwned,
      referencePricePerShare: round2(ref),
      currentValue: round2(currentValue),
      investedAmount: round2(invested),
      unrealisedGain: hasCost ? round2(currentValue - invested) : null,
      ownershipPct: h.shareClass.totalShares > 0 ? round2((h.sharesOwned / h.shareClass.totalShares) * 100) : null,
      basis: hasCost ? "recorded acquisition cost" : "cost unknown — fallback reference price",
    };
  });

  const totalCurrentValue = round2(positions.reduce((s, p) => s + p.currentValue, 0));
  const totalInvested = round2(positions.reduce((s, p) => s + p.investedAmount, 0));
  const totalUnrealisedGain = costBasisKnown ? round2(totalCurrentValue - totalInvested) : null;

  const concentration = (key: "city" | "type" | "risk") => {
    const m = new Map<string, number>();
    for (const p of positions) m.set(p[key], (m.get(p[key]) ?? 0) + p.currentValue);
    return [...m.entries()]
      .map(([label, value]) => ({ label, pct: totalCurrentValue > 0 ? round2((value / totalCurrentValue) * 100) : 0 }))
      .sort((a, b) => b.pct - a.pct);
  };

  if (!positions.length) gaps.push("No current positive share holdings on record.");
  if (!costBasisKnown) gaps.push("Acquisition cost is missing on one or more holdings; unrealised gain is incomplete.");
  gaps.push("Reference value uses the share-class NAV or listed price per share. It is indicative, not a realisable exit quote.");

  return {
    positions,
    propertyCount: new Set(positions.map((p) => p.propertyId)).size,
    totalCurrentValue,
    totalInvested,
    totalUnrealisedGain,
    concentrationByCity: concentration("city"),
    concentrationByType: concentration("type"),
    concentrationByRisk: concentration("risk"),
    gaps,
  };
}

/** Wallet balance + most recent transactions (ZAR). */
export async function loadWalletSummary(user: AdvisorUser, client: Client = db) {
  const wallet = await client.wallet.findUnique({ where: { userId: user.id } });
  if (!wallet) {
    return { hasWallet: false, balanceRands: 0, pendingWithdrawalRands: 0, transactions: [] as unknown[] };
  }
  const [txns, pending] = await Promise.all([
    client.walletTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { type: true, amountCents: true, balanceAfter: true, status: true, description: true, createdAt: true },
    }),
    client.walletWithdrawal.aggregate({
      where: { userId: user.id, status: { in: ["REQUESTED", "APPROVED", "PROCESSING"] } },
      _sum: { amountCents: true },
    }),
  ]);
  return {
    hasWallet: true,
    balanceRands: round2(centsToRands(wallet.balanceCents)),
    pendingWithdrawalRands: round2(centsToRands(pending._sum.amountCents ?? 0)),
    transactions: txns.map((t) => ({
      type: t.type,
      amountRands: round2(centsToRands(t.amountCents)),
      balanceAfterRands: round2(centsToRands(t.balanceAfter)),
      status: t.status,
      description: t.description,
      at: t.createdAt.toISOString(),
    })),
  };
}

/** Contributions that are not yet paid (awaiting payment / under review). */
export async function loadPendingItems(user: AdvisorUser, client: Client = db) {
  const rows = await client.investorContribution.findMany({
    where: {
      investorId: user.id,
      deletedAt: null,
      status: { notIn: ["CANCELLED", "REJECTED"] },
      paymentStatus: { not: "PAID" },
    },
    orderBy: [{ createdAt: "desc" }],
    take: OFFICE_LIMIT,
    select: {
      id: true, contributionAmount: true, status: true, paymentStatus: true,
      coolingOffExpiresAt: true, createdAt: true,
      property: { select: { id: true, title: true } },
    },
  });
  const items = rows.map((c) => ({
    contributionId: c.id,
    propertyId: c.property.id,
    propertyTitle: c.property.title,
    amountRands: round2(c.contributionAmount),
    status: c.status,
    paymentStatus: c.paymentStatus,
    coolingOffExpiresAt: c.coolingOffExpiresAt ? c.coolingOffExpiresAt.toISOString() : null,
    createdAt: c.createdAt.toISOString(),
  }));
  return { count: items.length, totalAwaitingRands: round2(items.reduce((s, i) => s + i.amountRands, 0)), items };
}

/** Open investment opportunities (RAISING_FUNDS) with live expected returns. */
export async function loadOpenOpportunities(user: AdvisorUser, client: Client = db) {
  const opps = await client.property.findMany({
    where: { isPublished: true, investmentStatus: "RAISING_FUNDS", deletedAt: null },
    orderBy: [{ createdAt: "desc" }],
    take: 12,
    select: {
      id: true, title: true, city: true, state: true, riskRating: true, price: true,
      minimumInvestment: true, expectedReturns: true, aiConfidenceRating: true,
      propertyFlip: { select: { expectedROI: true } },
      rentalBond: true,
      propertyDevelopment: { select: { expectedROI: true, expectedIRR: true } },
    },
  });
  const items = opps.map((o) => {
    const rentalCap = o.rentalBond
      ? calculateRentalMetrics(buildRentalInput(o.rentalBond, o.price)).displayCapRate
      : undefined;
    const expectedReturnPct =
      o.propertyFlip?.expectedROI ??
      rentalCap ??
      o.propertyDevelopment?.expectedIRR ??
      o.propertyDevelopment?.expectedROI ??
      o.expectedReturns ??
      null;
    return {
      propertyId: o.id,
      title: o.title,
      city: o.city,
      state: o.state,
      type: propertyType(o),
      risk: o.riskRating,
      confidenceRating: o.aiConfidenceRating ?? null,
      askingPriceRands: round2(o.price),
      minimumInvestmentRands: round2(o.minimumInvestment),
      expectedReturnPct: expectedReturnPct == null ? null : round2(expectedReturnPct),
    };
  });
  return { count: items.length, items };
}

type ListingFilter = {
  query?: string;
  type?: "flip" | "rental" | "development";
  city?: string;
  investmentStatus?: "PLANNING" | "RAISING_FUNDS" | "FUNDED" | "PROJECT_STARTED" | "COMPLETED";
  limit?: number;
};

/** The funding goal for a property, preferring the sub-type goal like the public listing. */
function listingFundingGoal(p: {
  fundingGoal: number;
  propertyFlip?: { fundingGoal: number } | null;
  rentalBond?: { fundingGoal: number } | null;
  propertyDevelopment?: { fundingGoal: number } | null;
}): number {
  const subGoal = p.propertyFlip?.fundingGoal ?? p.rentalBond?.fundingGoal ?? p.propertyDevelopment?.fundingGoal ?? 0;
  return subGoal > 0 ? subGoal : p.fundingGoal;
}

/**
 * Browse ANY published investment listing on the platform — not only the member's
 * own holdings. This lets the agent discuss a property the member is looking at.
 */
export async function browseListings(user: AdvisorUser, opts: ListingFilter = {}, client: Client = db) {
  const where: Prisma.PropertyWhereInput = { isPublished: true, deletedAt: null };
  if (opts.type === "flip") where.propertyFlip = { isNot: null };
  else if (opts.type === "rental") where.rentalBond = { isNot: null };
  else if (opts.type === "development") where.propertyDevelopment = { isNot: null };
  if (opts.investmentStatus) where.investmentStatus = opts.investmentStatus;
  if (opts.city) where.city = { contains: opts.city, mode: "insensitive" };
  if (opts.query) {
    where.OR = [
      { title: { contains: opts.query, mode: "insensitive" } },
      { description: { contains: opts.query, mode: "insensitive" } },
      { city: { contains: opts.query, mode: "insensitive" } },
      { address: { contains: opts.query, mode: "insensitive" } },
    ];
  }
  const limit = Math.min(Math.max(opts.limit ?? 12, 1), 25);
  const rows = await client.property.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    take: limit,
    select: {
      id: true, title: true, city: true, state: true, riskRating: true, price: true, fundingGoal: true,
      minimumInvestment: true, expectedReturns: true, aiConfidenceRating: true, investmentStatus: true,
      platformCarryPct: true,
      propertyFlip: { select: { expectedROI: true, fundingGoal: true } },
      rentalBond: true,
      propertyDevelopment: { select: { expectedROI: true, expectedIRR: true, fundingGoal: true } },
      investorContributions: { where: { paymentStatus: "PAID", deletedAt: null }, select: { contributionAmount: true } },
    },
  });
  const items = rows.map((o) => {
    const rentalCap = o.rentalBond
      ? calculateRentalMetrics(buildRentalInput(o.rentalBond, o.price)).displayCapRate
      : undefined;
    const expectedReturnPct =
      o.propertyFlip?.expectedROI ?? rentalCap ?? o.propertyDevelopment?.expectedIRR ??
      o.propertyDevelopment?.expectedROI ?? o.expectedReturns ?? null;
    const goal = listingFundingGoal(o);
    const raised = o.investorContributions.reduce((s, c) => s + c.contributionAmount, 0);
    return {
      propertyId: o.id,
      title: o.title,
      city: o.city,
      state: o.state,
      type: propertyType(o),
      risk: o.riskRating,
      investmentStatus: o.investmentStatus,
      openForInvestment: o.investmentStatus === "RAISING_FUNDS",
      confidenceRating: o.aiConfidenceRating ?? null,
      askingPriceRands: round2(o.price),
      minimumInvestmentRands: round2(o.minimumInvestment),
      fundingGoalRands: round2(goal),
      fundingRaisedRands: round2(raised),
      fundingProgressPct: goal > 0 ? round2(Math.min((raised / goal) * 100, 100)) : null,
      expectedReturnPct: expectedReturnPct == null ? null : round2(expectedReturnPct),
      platformCarryPct: round2(Math.min(99, Math.max(0, o.platformCarryPct ?? 0))),
      publicEquityPct: round2(publicEquityFraction(o.platformCarryPct) * 100),
    };
  });
  return { count: items.length, items };
}

/**
 * Estimate the ownership a member would receive for a given cash investment in a
 * published listing. Uses the platform's canonical `calculateShareInfo`, so the
 * figure already accounts for any platform carry and the listing's share class —
 * the agent must call this instead of doing the arithmetic itself.
 */
export async function estimateListingOwnership(
  user: AdvisorUser,
  propertyId: number,
  amount: number,
) {
  const p = await db.property.findFirst({
    where: { id: propertyId, isPublished: true, deletedAt: null },
    select: { id: true, title: true, fundingGoal: true, minimumInvestment: true, investmentStatus: true, platformCarryPct: true },
  });
  if (!p) return { found: false as const, reason: "No published listing with that id is available to you." };

  const invest = round2(amount);
  const carryPct = round2(Math.min(99, Math.max(0, p.platformCarryPct ?? 0)));
  const info = await calculateShareInfo(propertyId, invest);
  if (!info) {
    return {
      found: true as const,
      propertyId: p.id,
      title: p.title,
      investmentRands: invest,
      reason: "This listing has no funding goal or share class configured yet, so ownership cannot be estimated.",
      platformCarryPct: carryPct,
      publicEquityPct: round2(publicEquityFraction(p.platformCarryPct) * 100),
    };
  }

  const notes: string[] = [];
  if (carryPct > 0) {
    notes.push(`This listing has a ${carryPct}% platform carry, so investors collectively own ${round2(publicEquityFraction(p.platformCarryPct) * 100)}% of the SPV at full funding — this percentage already reflects that carry.`);
  }
  if (p.investmentStatus !== "RAISING_FUNDS") notes.push(`This listing is '${p.investmentStatus}', so it is not currently open for new investment.`);
  if (p.minimumInvestment > 0 && invest < p.minimumInvestment) notes.push(`The minimum investment for this listing is R${round2(p.minimumInvestment)}.`);
  notes.push("Indicative only — final allocation is confirmed on the signed deal pack and payment.");

  return {
    found: true as const,
    propertyId: p.id,
    title: p.title,
    investmentRands: invest,
    ownershipPct: round2(info.ownershipPercentage),
    numberOfShares: round2(info.numberOfShares),
    sharePriceRands: round2(info.sharePrice),
    shareClassName: info.shareClassName,
    platformCarryPct: carryPct,
    publicEquityPct: round2(publicEquityFraction(p.platformCarryPct) * 100),
    fundingGoalRands: round2(p.fundingGoal),
    minimumInvestmentRands: round2(p.minimumInvestment),
    openForInvestment: p.investmentStatus === "RAISING_FUNDS",
    notes,
  };
}

/** Full investment case for one published listing so the agent can advise on it. */
export async function loadListingDetail(user: AdvisorUser, propertyId: number, client: Client = db) {
  const p = await client.property.findFirst({
    where: { id: propertyId, isPublished: true, deletedAt: null },
    select: {
      id: true, title: true, description: true, city: true, state: true, address: true,
      price: true, fundingGoal: true, minimumInvestment: true, maxInvestors: true, expectedReturns: true,
      platformCarryPct: true,
      preferredReturnRate: true, investorProfitShare: true, targetHoldMonths: true,
      riskRating: true, aiConfidenceRating: true, aiConfidenceJustification: true, aiRiskScore: true,
      investmentStatus: true, fundingClosingDate: true, bedrooms: true, bathrooms: true, squareMeters: true,
      propertyFlip: { select: { expectedROI: true, fundingGoal: true, purchasePrice: true, renovationBudget: true, afterRepairValue: true, daysToComplete: true } },
      rentalBond: true,
      propertyDevelopment: { select: { expectedROI: true, expectedIRR: true, fundingGoal: true, totalBudget: true, totalExpectedRevenue: true, developmentTimelineMonths: true } },
      spv: { select: { name: true, status: true, registrationNumber: true } },
      shareClasses: { select: { name: true, totalShares: true, pricePerShare: true, navPerShare: true, minimumInvestmentAmount: true, holdings: { select: { sharesOwned: true } } } },
      investorContributions: { where: { paymentStatus: "PAID", deletedAt: null }, select: { contributionAmount: true } },
    },
  });
  if (!p) return { found: false as const, reason: "No published listing with that id is available to you." };

  const rentalMetrics = p.rentalBond
    ? calculateRentalMetrics(buildRentalInput(p.rentalBond, p.price))
    : null;
  const expectedReturnPct =
    p.propertyFlip?.expectedROI ?? rentalMetrics?.displayCapRate ?? p.propertyDevelopment?.expectedIRR ??
    p.propertyDevelopment?.expectedROI ?? p.expectedReturns ?? null;
  const goal = listingFundingGoal(p);
  const raised = p.investorContributions.reduce((s, c) => s + c.contributionAmount, 0);

  const shareClasses = p.shareClasses.map((sc) => {
    const allocated = sc.holdings.reduce((s, h) => s + h.sharesOwned, 0);
    return {
      name: sc.name,
      pricePerShareRands: round2(sc.navPerShare && sc.navPerShare > 0 ? sc.navPerShare : sc.pricePerShare),
      totalShares: sc.totalShares,
      availableShares: Math.max(0, sc.totalShares - allocated),
      minimumInvestmentRands: round2(sc.minimumInvestmentAmount),
    };
  });

  const carryPct = Math.min(99, Math.max(0, p.platformCarryPct ?? 0));
  const gaps: string[] = [];
  if (p.investmentStatus !== "RAISING_FUNDS") gaps.push(`This listing is '${p.investmentStatus}', so it is not currently open for new investment.`);
  if (expectedReturnPct == null) gaps.push("No expected-return figure is recorded for this listing.");
  if (carryPct > 0) gaps.push(`This listing carries a ${round2(carryPct)}% platform carry: investors fund the whole goal but collectively own only ${round2(publicEquityFraction(p.platformCarryPct) * 100)}% of the SPV. To quote the shares a member would get for a specific amount, use the ownership-estimate tool — never divide the amount by the funding goal yourself.`);
  gaps.push("Figures come from the sponsor's listing and the platform's financial engine; they are indicative, not a guarantee. Review the full deal pack before investing.");

  return {
    found: true as const,
    propertyId: p.id,
    title: p.title,
    description: p.description ? redactForModel(p.description).slice(0, 1200) : null,
    location: [p.address, p.city, p.state].filter(Boolean).join(", "),
    type: propertyType(p),
    investmentStatus: p.investmentStatus,
    openForInvestment: p.investmentStatus === "RAISING_FUNDS",
    risk: p.riskRating,
    confidenceRating: p.aiConfidenceRating ?? null,
    confidenceJustification: p.aiConfidenceJustification ?? null,
    platformRiskScore: p.aiRiskScore ?? null,
    askingPriceRands: round2(p.price),
    minimumInvestmentRands: round2(p.minimumInvestment),
    maxInvestors: p.maxInvestors,
    fundingGoalRands: round2(goal),
    fundingRaisedRands: round2(raised),
    fundingProgressPct: goal > 0 ? round2(Math.min((raised / goal) * 100, 100)) : null,
    fundingClosingDate: p.fundingClosingDate ? p.fundingClosingDate.toISOString() : null,
    expectedReturnPct: expectedReturnPct == null ? null : round2(expectedReturnPct),
    platformCarryPct: round2(Math.min(99, Math.max(0, p.platformCarryPct ?? 0))),
    publicEquityPct: round2(publicEquityFraction(p.platformCarryPct) * 100),
    preferredReturnRatePct: round2(p.preferredReturnRate),
    investorProfitSharePct: round2(p.investorProfitShare),
    targetHoldMonths: p.targetHoldMonths || null,
    bedrooms: p.bedrooms ?? null,
    bathrooms: p.bathrooms ?? null,
    squareMeters: p.squareMeters ?? null,
    rentalMetrics: rentalMetrics
      ? { displayCapRatePct: round2(rentalMetrics.displayCapRate), monthlyRentRands: round2(p.rentalBond?.monthlyRent ?? 0) }
      : null,
    flip: p.propertyFlip
      ? { expectedROIPct: p.propertyFlip.expectedROI == null ? null : round2(p.propertyFlip.expectedROI), purchasePriceRands: round2(p.propertyFlip.purchasePrice ?? 0), renovationBudgetRands: round2(p.propertyFlip.renovationBudget ?? 0), afterRepairValueRands: round2(p.propertyFlip.afterRepairValue ?? 0), daysToComplete: p.propertyFlip.daysToComplete || null }
      : null,
    development: p.propertyDevelopment
      ? { expectedROIPct: p.propertyDevelopment.expectedROI == null ? null : round2(p.propertyDevelopment.expectedROI), expectedIRRPct: p.propertyDevelopment.expectedIRR == null ? null : round2(p.propertyDevelopment.expectedIRR), totalBudgetRands: round2(p.propertyDevelopment.totalBudget ?? 0), totalExpectedRevenueRands: round2(p.propertyDevelopment.totalExpectedRevenue ?? 0), developmentTimelineMonths: p.propertyDevelopment.developmentTimelineMonths || null }
      : null,
    spv: p.spv ? { name: p.spv.name, status: p.spv.status, registered: Boolean(p.spv.registrationNumber) } : null,
    shareClasses,
    gaps,
  };
}

/** Open governance proposals on properties the member holds, with their vote. */
export async function loadGovernanceItems(user: AdvisorUser, client: Client = db) {
  const held = await client.shareHolding.findMany({
    where: { investorId: user.id, sharesOwned: { gt: 0 } },
    select: { propertyId: true },
    distinct: ["propertyId"],
  });
  const heldIds = held.map((h) => h.propertyId);
  if (!heldIds.length) return { count: 0, awaitingVote: 0, items: [] as unknown[] };

  const proposals = await client.proposal.findMany({
    where: { propertyId: { in: heldIds }, status: "OPEN" },
    orderBy: [{ deadline: "asc" }],
    take: OFFICE_LIMIT,
    select: {
      id: true, title: true, proposalType: true, deadline: true,
      property: { select: { id: true, title: true } },
      votes: { where: { investorId: user.id }, select: { voteChoice: true } },
    },
  });
  const items = proposals.map((p) => ({
    proposalId: p.id,
    title: p.title,
    type: p.proposalType,
    propertyId: p.property.id,
    propertyTitle: p.property.title,
    deadline: p.deadline.toISOString(),
    yourVote: p.votes[0]?.voteChoice ?? null,
    hasVoted: p.votes.length > 0,
  }));
  return { count: items.length, awaitingVote: items.filter((i) => !i.hasVoted).length, items };
}

/** FICA / KYC compliance status for the member. */
export async function loadComplianceStatus(user: AdvisorUser, client: Client = db) {
  const [u, docs] = await Promise.all([
    client.user.findUnique({
      where: { id: user.id },
      select: { ficaVerified: true, ficaVerifiedAt: true, ficaExempt: true, ficaRejectedAt: true, ficaRejectedReason: true },
    }),
    client.kYCDocument.findMany({ where: { investorId: user.id }, select: { documentType: true, status: true } }),
  ]);
  const required = ["ID_DOCUMENT", "PROOF_OF_ADDRESS"];
  const approved = docs.filter((d) => d.status === "APPROVED").map((d) => d.documentType as string);
  const pending = docs.filter((d) => d.status === "PENDING").map((d) => d.documentType as string);
  const missing = required.filter((t) => !approved.includes(t) && !pending.includes(t));
  return {
    ficaVerified: Boolean(u?.ficaVerified),
    ficaVerifiedAt: u?.ficaVerifiedAt ? u.ficaVerifiedAt.toISOString() : null,
    ficaExempt: Boolean(u?.ficaExempt),
    ficaRejectedReason: u?.ficaRejectedAt ? (u.ficaRejectedReason ?? "FICA verification rejected") : null,
    documentsApproved: approved.length,
    documentsPending: pending.filter((t) => required.includes(t)).length,
    missingDocuments: missing,
    actionNeeded: !u?.ficaVerified && (missing.length > 0 || Boolean(u?.ficaRejectedAt)),
  };
}

/** The member's open secondary-market orders. */
export async function loadMarketplaceActivity(user: AdvisorUser, client: Client = db) {
  const orders = await client.shareOrder.findMany({
    where: { investorId: user.id, status: { in: ["OPEN", "PARTIALLY_FILLED"] } },
    orderBy: [{ createdAt: "desc" }],
    take: OFFICE_LIMIT,
    select: {
      id: true, side: true, quantity: true, filledQuantity: true, pricePerShare: true, status: true,
      shareClass: { select: { name: true, property: { select: { id: true, title: true } } } },
    },
  });
  const items = orders.map((o) => ({
    orderId: o.id,
    side: o.side,
    propertyId: o.shareClass.property.id,
    propertyTitle: o.shareClass.property.title,
    shareClass: o.shareClass.name,
    quantity: o.quantity,
    remaining: o.quantity - o.filledQuantity,
    pricePerShare: round2(o.pricePerShare),
    status: o.status,
  }));
  return { count: items.length, items };
}

/** Proactive briefing: the handful of things that may want the member's attention. */
export async function buildAdvisorBriefing(user: AdvisorUser, client: Client = db) {
  const [valuation, wallet, pending, governance, opportunities, compliance] = await Promise.all([
    loadPortfolioValuation(user, client),
    loadWalletSummary(user, client),
    loadPendingItems(user, client),
    loadGovernanceItems(user, client),
    loadOpenOpportunities(user, client),
    loadComplianceStatus(user, client),
  ]);
  const highlights: string[] = [];
  if (pending.count > 0) highlights.push(`${pending.count} contribution(s) awaiting payment totalling about R${Math.round(pending.totalAwaitingRands).toLocaleString("en-ZA")}.`);
  if (governance.awaitingVote > 0) highlights.push(`${governance.awaitingVote} shareholder proposal(s) open for your vote.`);
  if (compliance.actionNeeded) highlights.push("Your FICA verification needs attention before you can invest R20,000 or more.");
  if (wallet.hasWallet && wallet.balanceRands > 0) highlights.push(`Wallet balance about R${Math.round(wallet.balanceRands).toLocaleString("en-ZA")}.`);
  if (opportunities.count > 0) highlights.push(`${opportunities.count} new opportunity(ies) are open for funding.`);
  return {
    portfolioValueRands: valuation.totalCurrentValue,
    propertyCount: valuation.propertyCount,
    walletBalanceRands: wallet.balanceRands,
    pendingPayments: pending.count,
    openVotes: governance.awaitingVote,
    openOpportunities: opportunities.count,
    ficaActionNeeded: compliance.actionNeeded,
    highlights,
  };
}

/**
 * Transparent South African tax estimate from platform distribution records.
 * This is an indicative estimate built from recorded payouts and stated
 * assumptions only — it is NOT a tax return, filing or professional advice.
 */
export async function estimateTax(
  user: AdvisorUser,
  opts: { taxYear: number; marginalRatePct?: number; ageUnder65?: boolean },
  client: Client = db,
) {
  const range = taxYearRange(opts.taxYear);
  const marginalRate = Math.min(45, Math.max(0, opts.marginalRatePct ?? 31)) / 100;
  const marginalProvided = opts.marginalRatePct != null;
  const ageUnder65 = opts.ageUnder65 ?? true;
  const interestExemption = ageUnder65 ? 23800 : 34500;

  const payouts = await client.distributionPayout.findMany({
    where: { investorId: user.id, status: "PAID", paidAt: { gte: range.gte, lt: range.lt }, distribution: { deletedAt: null } },
    select: { grossAmount: true, netAmount: true, taxWithheld: true, distribution: { select: { taxClassification: true } } },
    take: OFFICE_LIMIT + 1,
  });

  const buckets = new Map<string, { gross: number; withheld: number; net: number; count: number }>();
  for (const p of payouts.slice(0, OFFICE_LIMIT)) {
    const cls = (p.distribution.taxClassification ?? "OTHER") as string;
    const b = buckets.get(cls) ?? { gross: 0, withheld: 0, net: 0, count: 0 };
    b.gross += p.grossAmount; b.withheld += p.taxWithheld; b.net += p.netAmount; b.count += 1;
    buckets.set(cls, b);
  }

  let estimatedIncomeTax = 0;
  const lines = [...buckets.entries()].map(([cls, b]) => {
    const upper = cls.toUpperCase();
    let estTax = 0;
    let note = "";
    if (upper.includes("DIVIDEND")) {
      estTax = Math.max(0, round2(b.gross * 0.2 - b.withheld));
      note = "Local dividends: 20% dividends tax, usually withheld at source. Shown net of tax already withheld.";
    } else if (upper.includes("INTEREST")) {
      const taxable = Math.max(0, b.gross - interestExemption);
      estTax = round2(taxable * marginalRate);
      note = `Interest: annual exemption R${interestExemption.toLocaleString("en-ZA")} applied, remainder at ${round2(marginalRate * 100)}% marginal.`;
    } else {
      estTax = round2(b.gross * marginalRate);
      note = `Treated as income taxed at ${round2(marginalRate * 100)}% marginal rate.`;
    }
    estimatedIncomeTax += estTax;
    return {
      classification: cls, count: b.count,
      grossRands: round2(b.gross), taxAlreadyWithheldRands: round2(b.withheld), netRands: round2(b.net),
      estimatedAdditionalTaxRands: estTax, note,
    };
  });

  // Hypothetical CGT if the whole portfolio were sold today (individual).
  const valuation = await loadPortfolioValuation(user, client);
  let hypotheticalCgt: number | null = null;
  if (valuation.totalUnrealisedGain != null && valuation.totalUnrealisedGain > 0) {
    const afterExclusion = Math.max(0, valuation.totalUnrealisedGain - 40000);
    hypotheticalCgt = round2(afterExclusion * 0.4 * marginalRate);
  }

  const assumptions = [
    marginalProvided ? `Marginal tax rate ${round2(marginalRate * 100)}% (as supplied).` : `Marginal tax rate assumed ${round2(marginalRate * 100)}% — provide your actual rate for a sharper estimate.`,
    `Individual taxpayer under 65: ${ageUnder65 ? "yes" : "no"}.`,
    "Only Investprop distribution records are included; salary, other income, expenses and foreign income are excluded.",
    "CGT figure is hypothetical (if the whole portfolio were sold today) using the R40,000 annual exclusion and 40% individual inclusion rate.",
  ];

  return {
    taxYear: opts.taxYear,
    byClassification: lines,
    totalGrossRands: round2(payouts.slice(0, OFFICE_LIMIT).reduce((s, p) => s + p.grossAmount, 0)),
    totalWithheldRands: round2(payouts.slice(0, OFFICE_LIMIT).reduce((s, p) => s + p.taxWithheld, 0)),
    estimatedAdditionalIncomeTaxRands: round2(estimatedIncomeTax),
    hypotheticalCapitalGainsTaxIfSoldTodayRands: hypotheticalCgt,
    assumptions,
    disclaimer: "Indicative estimate only, built from platform records and stated assumptions. Not a tax return, assessment or professional advice. Confirm with a registered tax practitioner (SARS provisional tax dates: end August and end February).",
  };
}

// --- Cross-session memory ------------------------------------------------

type MemoryNote = { text: string; at: string };
const MEMORY_MAX_NOTES = 25;
const MEMORY_MAX_LEN = 280;

function readNotes(value: Prisma.JsonValue | null | undefined): MemoryNote[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const notes = (value as { notes?: unknown }).notes;
  if (!Array.isArray(notes)) return [];
  return notes
    .filter((n): n is { text: string; at?: string } => Boolean(n) && typeof (n as { text?: unknown }).text === "string")
    .map((n) => ({ text: String(n.text).slice(0, MEMORY_MAX_LEN), at: typeof n.at === "string" ? n.at : new Date().toISOString() }));
}

export async function loadMemory(user: AdvisorUser, client: Client = db) {
  const u = await client.user.findUnique({ where: { id: user.id }, select: { officeAgentMemory: true } });
  return { notes: readNotes(u?.officeAgentMemory) };
}

/** Append a short, member-stated note to their own cross-session office memory. */
export async function saveMemory(user: AdvisorUser, text: string, client: Client = db) {
  const clean = redactForModel(String(text ?? "").trim()).slice(0, MEMORY_MAX_LEN);
  if (!clean) return { notes: readNotes(null) };
  const current = await loadMemory(user, client);
  const notes = [...current.notes, { text: clean, at: new Date().toISOString() }].slice(-MEMORY_MAX_NOTES);
  await client.user.update({ where: { id: user.id }, data: { officeAgentMemory: { notes } as Prisma.InputJsonValue } });
  return { notes };
}
