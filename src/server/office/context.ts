import { Prisma } from "@prisma/client";
import { db } from "~/server/db";
import { env } from "~/server/env";
import { OFFICE_LIMIT, assertOfficeUser, centsNumber, payoutTotals, toCents, type OfficeUser } from "./policy";

export function officeCapabilities() {
  return {
    textAI: Boolean(env.OPENROUTER_API_KEY),
    voice: env.OFFICE_VOICE_ENABLED === "true" && Boolean(env.OPENAI_API_KEY),
    regulatedActions: false as const,
  };
}

// Deliberately stricter than evidence-access.ts: staff may not read anyone else's
// personal records. Only public/owned/held/paid-history shared document metadata.
export function sharedPropertyScope(userId: number): Prisma.PropertyWhereInput {
  return {
    deletedAt: null,
    OR: [
      { userId }, { isPublished: true },
      { shareHoldings: { some: { investorId: userId, sharesOwned: { gt: 0 } } } },
      { investorContributions: { some: {
        investorId: userId, deletedAt: null, cancelledAt: null,
        status: { in: ["APPROVED", "REFUND_REQUESTED", "REFUNDED"] },
        paymentStatus: "PAID", contributionAmount: { gt: 0 },
      } } },
      { shareLedgerEntries: { some: { investorId: userId, shares: { gt: 0 }, transactionType: { in: ["PURCHASE", "TRANSFER_IN", "BONUS_ISSUE"] } } } },
    ],
  };
}

export const sourceMetadataSelect = {
  id: true, title: true, url: true, authority: true, effectiveFrom: true,
  effectiveTo: true, reviewedAt: true, status: true, applicability: true, contentHash: true, version: true,
} as const;

export function approvedSourcesWhere(now: Date): Prisma.OfficeTaxSourceWhereInput {
  return { status: "APPROVED", reviewedAt: { lte: now }, effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] };
}

export async function loadOfficeContext(user: OfficeUser, client: Prisma.TransactionClient = db, now = new Date(), period?: { gte: Date; lt: Date }) {
  assertOfficeUser(user);
  const [holdingRows, payoutRows, documentRows, proposalRows, sourceRows] = await Promise.all([
    client.shareHolding.findMany({
      where: { investorId: user.id, sharesOwned: { gt: 0 } },
      select: { id: true, propertyId: true, sharesOwned: true, averageCostPerShare: true, updatedAt: true, property: { select: { title: true } } },
      orderBy: [{ propertyId: "asc" }, { id: "asc" }], take: OFFICE_LIMIT + 1,
    }),
    client.distributionPayout.findMany({
      where: { investorId: user.id, status: "PAID", ...(period ? { paidAt: period } : {}), distribution: { deletedAt: null } },
      select: { id: true, grossAmount: true, netAmount: true, taxWithheld: true, paidAt: true, distribution: { select: { propertyId: true, taxClassification: true } } },
      orderBy: [{ paidAt: "asc" }, { id: "asc" }], take: OFFICE_LIMIT + 1,
    }),
    client.legalDocument.findMany({
      where: { OR: [{ generatedFor: user.id }, { generatedFor: null, property: sharedPropertyScope(user.id) }] },
      select: { id: true, title: true, documentType: true, propertyId: true, updatedAt: true },
      orderBy: [{ id: "asc" }], take: OFFICE_LIMIT + 1,
    }),
    client.ownerSaleProposal.findMany({
      where: { ownerId: user.id }, select: { id: true, title: true, status: true, updatedAt: true },
      orderBy: [{ id: "asc" }], take: OFFICE_LIMIT + 1,
    }),
    client.officeTaxSource.findMany({
      where: approvedSourcesWhere(now), select: { ...sourceMetadataSelect, content: true },
      orderBy: [{ effectiveFrom: "desc" }, { id: "asc" }], take: 21,
    }),
  ]);
  const gaps: string[] = ["Platform-only evidence; external income, expenses and tax circumstances are not included. No tax liability estimate or filing is provided."];
  const bounded = <T>(rows: T[], label: string, limit = OFFICE_LIMIT): T[] => {
    if (rows.length > limit) gaps.push(`${label} truncated at ${limit} records; displayed totals/checklists are incomplete, not full-account totals.`);
    return rows.slice(0, limit);
  };
  const holdingsRaw = bounded(holdingRows, "Holdings");
  const payouts = bounded(payoutRows, "Paid payouts");
  const documentsRaw = bounded(documentRows, "Documents");
  const proposalsRaw = bounded(proposalRows, "Proposals");
  const sources = bounded(sourceRows, "Reviewed tax sources", 20);
  const byProperty = new Map<number, { propertyId: number; title: string; shares: number; basisCents: bigint; missingCost: boolean }>();
  for (const row of holdingsRaw) {
    const position = byProperty.get(row.propertyId) ?? { propertyId: row.propertyId, title: row.property.title, shares: 0, basisCents: 0n, missingCost: false };
    position.shares += row.sharesOwned;
    if (Number.isFinite(row.averageCostPerShare) && row.averageCostPerShare >= 0) position.basisCents += toCents(row.averageCostPerShare, row.sharesOwned);
    else position.missingCost = true;
    byProperty.set(row.propertyId, position);
  }
  const holdings = [...byProperty.values()].map((row) => {
    if (row.missingCost) gaps.push(`Recorded acquisition cost missing for property ${row.propertyId}; basis is incomplete.`);
    return { propertyId: row.propertyId, title: row.title, shares: row.shares,
      basisValue: centsNumber(row.basisCents) / 100,
      basisLabel: row.missingCost ? "Incomplete recorded acquisition cost; not fair market value" : "Remaining shares × recorded average acquisition cost; not fair market value",
    };
  });
  if (!holdings.length) gaps.push("No current positive share holdings on record.");
  if (!payouts.length) gaps.push("No PAID distribution payouts in the selected period.");
  if (!documentsRaw.length) gaps.push("No authorised document metadata on record.");
  if (!sources.length) gaps.push("No effective-dated, human-reviewed approved tax sources available; tax rules and liability cannot be inferred.");
  if (payouts.some((row) => !row.paidAt)) gaps.push("A PAID payout has no paidAt; it cannot be assigned to an assessment year.");
  const documents = documentsRaw.map(({ id, title, documentType, propertyId }) => ({ id, title, documentType, propertyId }));
  const proposals = proposalsRaw.map(({ id, title, status }) => ({ id, title, status }));
  const evidence = [
    ...holdingsRaw.map((row) => ({ id: `holding:${row.id}`, label: `Recorded acquisition-cost holding: ${row.property.title}`, asOf: row.updatedAt.toISOString(), kind: "HOLDING" })),
    ...payouts.map((row) => ({ id: `payout:${row.id}`, label: `PAID payout for property ${row.distribution.propertyId}`, asOf: row.paidAt?.toISOString() ?? null, kind: "PAID_PAYOUT" })),
    ...documentsRaw.map((row) => ({ id: `document:${row.id}`, label: row.title, asOf: row.updatedAt.toISOString(), kind: "DOCUMENT_METADATA" })),
    ...proposalsRaw.map((row) => ({ id: `proposal:${row.id}`, label: row.title, asOf: row.updatedAt.toISOString(), kind: "OWN_PROPOSAL" })),
    ...sources.map((row) => ({ id: `tax-source:${row.id}`, label: row.title, asOf: row.reviewedAt!.toISOString(), kind: "REVIEWED_TAX_SOURCE" })),
  ];
  return { overview: { capabilities: officeCapabilities(), holdings, paidDistributions: payoutTotals(payouts), documents, proposals, evidence, gaps }, payouts, sources };
}

export async function loadOwnLedger(userId: number, period: { gte: Date; lt: Date }, client: Prisma.TransactionClient) {
  // Share sub-ledger and investor-attributed journal lines, never property-wide journals.
  const [shares, lines] = await Promise.all([
    client.shareLedgerEntry.findMany({ where: { investorId: userId, createdAt: period },
      select: { id: true, propertyId: true, transactionType: true, shares: true, totalAmount: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: OFFICE_LIMIT + 1 }),
    client.journalLine.findMany({ where: { investorId: userId, journalEntry: { entryDate: period } },
      select: { id: true, accountCode: true, debit: true, credit: true, journalEntry: { select: { id: true, propertyId: true, entryDate: true, kind: true, status: true } } },
      orderBy: [{ journalEntry: { entryDate: "asc" } }, { id: "asc" }], take: OFFICE_LIMIT + 1 }),
  ]);
  return {
    shareTransactions: shares.slice(0, OFFICE_LIMIT).map((row) => ({ id: row.id, propertyId: row.propertyId, kind: row.transactionType, shares: row.shares, amountCents: centsNumber(toCents(row.totalAmount)), at: row.createdAt.toISOString() })),
    journalLines: lines.slice(0, OFFICE_LIMIT).map((row) => ({ id: row.id, accountCode: row.accountCode, debitCents: centsNumber(toCents(row.debit)), creditCents: centsNumber(toCents(row.credit)), entryId: row.journalEntry.id, propertyId: row.journalEntry.propertyId, at: row.journalEntry.entryDate.toISOString(), kind: row.journalEntry.kind, status: row.journalEntry.status })),
    gaps: shares.length > OFFICE_LIMIT || lines.length > OFFICE_LIMIT ? ["Own ledger truncated; accountant pack is incomplete."] : [],
  };
}
