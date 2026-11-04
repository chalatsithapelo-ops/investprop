import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  property: vi.fn<(query: Prisma.PropertyFindUniqueArgs) => Promise<unknown>>(), holding: vi.fn(), contribution: vi.fn(), ledger: vi.fn(),
  document: vi.fn(), documentUpdate: vi.fn(), auth: vi.fn(), ai: vi.fn(),
  entries: vi.fn(), distributions: vi.fn(), distributionAggregate: vi.fn(),
  classes: vi.fn(), contributionAggregate: vi.fn(), spv: vi.fn<(query: Prisma.SPVFindUniqueArgs) => Promise<unknown>>(),
  holdings: vi.fn<(query: Prisma.ShareHoldingFindManyArgs) => Promise<unknown>>(),
  contributions: vi.fn<(query: Prisma.InvestorContributionFindManyArgs) => Promise<unknown>>(),
  payouts: vi.fn<(query: Prisma.DistributionPayoutFindManyArgs) => Promise<unknown>>(),
}));
vi.mock("~/server/db", () => ({ db: {
  property: { findUnique: mocks.property },
  shareHolding: { findFirst: mocks.holding, findMany: mocks.holdings },
  investorContribution: { findFirst: mocks.contribution, aggregate: mocks.contributionAggregate, findMany: mocks.contributions },
  shareLedgerEntry: { findFirst: mocks.ledger },
  legalDocument: { findUnique: mocks.document, update: mocks.documentUpdate },
  propertyFinancialEntry: { findMany: mocks.entries },
  distribution: { findMany: mocks.distributions, aggregate: mocks.distributionAggregate },
  shareClass: { findMany: mocks.classes }, sPV: { findUnique: mocks.spv },
  distributionPayout: { findMany: mocks.payouts },
} }));
vi.mock("~/server/trpc/auth-helpers", () => ({ getAuthenticatedUser: mocks.auth }));
vi.mock("~/server/ai/client", () => ({
  getModel: () => "mock-model", getModelId: () => "mock-model", runAIWithGuard: mocks.ai,
  safeParseJson: (text: string): unknown => JSON.parse(text),
}));
vi.mock("ai", () => ({ generateText: vi.fn() }));

import { db } from "~/server/db";
import { createTRPCRouter } from "~/server/trpc/main";
import { getLegalDocumentSummary, summariseLegalDocument } from "~/server/trpc/procedures/ai-doc-summary";
import {
  getSPVIncomeStatement, getSPVBalanceSheet, getAnnualTaxReport,
  getSPVPortfolioSummary, getInvestorStatement,
} from "~/server/trpc/procedures/financial-reports";
import { requireLegalEvidenceAccess, requirePropertyEvidenceAccess, type EvidenceUser } from "./evidence-access";

const investor: EvidenceUser = { id: 7, role: "INVESTOR" };
const property = {
  id: 31, userId: 9, isPublished: false, deletedAt: null,
  title: "Property", address: "Address", city: "City", price: 1000,
  fundingGoal: 1000, fundingRaised: 1000,
  spv: { id: 2, name: "SPV", registrationNumber: "REG", status: "ACTIVE", taxNumber: "SECRET-TAX", bankAccountNumber: "SECRET-BANK" },
};
const document = { id: 41, propertyId: 31, generatedFor: null };
const cached = {
  summary: "Cached confidential summary", keyClauses: [], glossary: [], riskFlags: [],
  riskLevel: "LOW", generatedAt: new Date("2026-01-01T00:00:00Z"),
};
const content = {
  ...document, title: "Agreement", documentType: "MOI", content: "Confidential legal content",
  aiSummary: cached.summary, aiKeyClauses: [], aiGlossary: [], aiRiskFlags: [],
  aiRiskLevel: "LOW", aiSummarisedAt: cached.generatedAt,
};
const router = createTRPCRouter({
  getLegalDocumentSummary, summariseLegalDocument, getSPVIncomeStatement, getSPVBalanceSheet,
  getAnnualTaxReport, getSPVPortfolioSummary, getInvestorStatement,
});
const caller = router.createCaller({ db, user: null, req: new Request("http://localhost/test") });
const authToken = "mock-auth";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue(investor);
  mocks.property.mockResolvedValue(property);
  mocks.holding.mockResolvedValue(null);
  mocks.contribution.mockResolvedValue(null);
  mocks.ledger.mockResolvedValue(null);
  // Query-aware fake: authorization reads never return content or cached summaries.
  mocks.document.mockImplementation(async (query: Prisma.LegalDocumentFindUniqueArgs) =>
    query.select?.generatedFor ? document : content);
  mocks.entries.mockResolvedValue([]);
  mocks.distributions.mockResolvedValue([]);
  mocks.distributionAggregate.mockResolvedValue({ _sum: { netAmount: 0 }, _count: 0 });
  mocks.classes.mockResolvedValue([]);
  mocks.contributionAggregate.mockResolvedValue({ _sum: { contributionAmount: 1000 } });
  mocks.holdings.mockResolvedValue([]);
  mocks.contributions.mockResolvedValue([]);
  mocks.payouts.mockResolvedValue([]);
  mocks.ai.mockResolvedValue({ text: JSON.stringify({ ...cached, summary: "New summary" }) });
  mocks.spv.mockImplementation(async (query: Prisma.SPVFindUniqueArgs) =>
    query.select?.id ? { ...property.spv, director: { id: 9, name: "Director" }, properties: [] }
      : { properties: [{ id: 31 }] });
});

describe("authoritative property evidence access", () => {
  it("denies a stranger on a private property", async () => {
    await expect(requirePropertyEvidenceAccess(investor, 31)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.property).toHaveBeenCalledWith({
      where: { id: 31 }, select: { id: true, userId: true, isPublished: true, deletedAt: true },
    });
  });

  it("allows published shared evidence but not sensitive financial evidence", async () => {
    mocks.property.mockResolvedValue({ ...property, isPublished: true });
    await expect(requirePropertyEvidenceAccess(investor, 31)).resolves.toMatchObject({ id: 31 });
    await expect(requirePropertyEvidenceAccess(investor, 31, { allowPublished: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows the actual owner regardless of role, not an unrelated owner-role user", async () => {
    await expect(requirePropertyEvidenceAccess({ id: 9, role: "INVESTOR" }, 31, { allowPublished: false })).resolves.toMatchObject({ id: 31 });
    await expect(requirePropertyEvidenceAccess({ id: 7, role: "PROPERTY_OWNER" }, 31)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each(["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"] as const)("allows staff %s, including deleted properties", async (role) => {
    mocks.property.mockResolvedValue({ ...property, deletedAt: new Date() });
    await expect(requirePropertyEvidenceAccess({ id: 7, role }, 31, { allowPublished: false })).resolves.toMatchObject({ id: 31 });
    expect(mocks.holding).not.toHaveBeenCalled();
  });

  it("allows a live positive holder without primary contributions", async () => {
    mocks.holding.mockResolvedValue({ id: 1 });
    await expect(requirePropertyEvidenceAccess(investor, 31, { allowPublished: false })).resolves.toMatchObject({ id: 31 });
    expect(mocks.holding).toHaveBeenCalledWith({
      where: { propertyId: 31, investorId: 7, sharesOwned: { gt: 0 } }, select: { id: true },
    });
    expect(mocks.contribution).not.toHaveBeenCalled();
  });

  it.each([0, -1])("does not treat a %s holding as positive ownership", async (sharesOwned) => {
    mocks.holding.mockImplementation(async (query: Prisma.ShareHoldingFindFirstArgs) => {
      expect(query.where).toEqual({ propertyId: 31, investorId: 7, sharesOwned: { gt: 0 } });
      return sharesOwned > 0 ? { id: 1 } : null;
    });
    await expect(requirePropertyEvidenceAccess(investor, 31, { allowPublished: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each([
    ["APPROVED", "PAID", null, null, 100, true],
    ["REFUND_REQUESTED", "PAID", null, null, 100, true],
    ["REFUNDED", "PAID", null, null, 100, true],
    ["PENDING", "NOT_PAID", null, null, 100, false],
    ["APPROVED", "AWAITING_PAYMENT", null, null, 100, false],
    ["APPROVED", "POP_SUBMITTED", null, null, 100, false],
    ["REJECTED", "PAID", null, null, 100, false],
    ["CANCELLED", "PAID", null, null, 100, false],
    ["APPROVED", "PAID", new Date("2026-01-01"), null, 100, false],
    ["APPROVED", "PAID", null, new Date("2026-01-01"), 100, false],
    ["APPROVED", "PAID", null, null, 0, false],
  ])("checks paid history %s/%s (cancelled=%s deleted=%s amount=%s)", async (status, paymentStatus, cancelledAt, deletedAt, amount, allowed) => {
    mocks.contribution.mockImplementation(async (query: Prisma.InvestorContributionFindFirstArgs) => {
      expect(query.where).toEqual({
        propertyId: 31, investorId: 7, deletedAt: null, cancelledAt: null,
        status: { in: ["APPROVED", "REFUND_REQUESTED", "REFUNDED"] }, paymentStatus: "PAID", contributionAmount: { gt: 0 },
      });
      return ["APPROVED", "REFUND_REQUESTED", "REFUNDED"].includes(status)
        && paymentStatus === "PAID" && !cancelledAt && !deletedAt && Number(amount) > 0 ? { id: 1 } : null;
    });
    const result = requirePropertyEvidenceAccess(investor, 31, { allowPublished: false });
    if (allowed) await expect(result).resolves.toMatchObject({ id: 31 });
    else await expect(result).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows a past secondary investor using received-share history, not an open order", async () => {
    mocks.ledger.mockResolvedValue({ id: 2 });
    await expect(requirePropertyEvidenceAccess(investor, 31, { allowPublished: false })).resolves.toMatchObject({ id: 31 });
    expect(mocks.ledger).toHaveBeenCalledWith({
      where: { propertyId: 31, investorId: 7, shares: { gt: 0 }, transactionType: { in: ["PURCHASE", "TRANSFER_IN", "BONUS_ISSUE"] } },
      select: { id: true },
    });
  });

  it("denies deleted published property even to owner/holder", async () => {
    mocks.property.mockResolvedValue({ ...property, userId: 7, isPublished: true, deletedAt: new Date() });
    mocks.holding.mockResolvedValue({ id: 1 });
    await expect(requirePropertyEvidenceAccess(investor, 31)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.holding).not.toHaveBeenCalled();
  });

  it("fails closed for missing records or a database failure", async () => {
    mocks.property.mockResolvedValue(null);
    await expect(requirePropertyEvidenceAccess(investor, 31)).rejects.toMatchObject({ code: "NOT_FOUND" });
    mocks.property.mockResolvedValue(property);
    mocks.holding.mockRejectedValue(new Error("Database unavailable"));
    await expect(requirePropertyEvidenceAccess(investor, 31)).rejects.toThrow("Database unavailable");
  });
});

describe("legal document metadata authorization", () => {
  it("preserves published shared document views", async () => {
    mocks.property.mockResolvedValue({ ...property, isPublished: true });
    await expect(requireLegalEvidenceAccess(investor, 41)).resolves.toEqual(document);
    expect(mocks.document).toHaveBeenCalledWith({ where: { id: 41 }, select: { id: true, propertyId: true, generatedFor: true } });
  });

  it("denies another user's generatedFor document even to a property owner/holder", async () => {
    mocks.document.mockResolvedValue({ ...document, generatedFor: 8 });
    mocks.holding.mockResolvedValue({ id: 1 });
    await expect(requireLegalEvidenceAccess({ id: 9, role: "PROPERTY_OWNER" }, 41)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.property).not.toHaveBeenCalled();
  });

  it("requires property access even for the caller's own generatedFor document", async () => {
    mocks.document.mockResolvedValue({ ...document, generatedFor: 7 });
    await expect(requireLegalEvidenceAccess(investor, 41)).rejects.toMatchObject({ code: "FORBIDDEN" });
    mocks.holding.mockResolvedValue({ id: 1 });
    await expect(requireLegalEvidenceAccess(investor, 41)).resolves.toMatchObject({ generatedFor: 7 });
  });

  it("allows managers to access personal documents", async () => {
    mocks.document.mockResolvedValue({ ...document, generatedFor: 8 });
    await expect(requireLegalEvidenceAccess({ id: 7, role: "PROJECT_MANAGER" }, 41)).resolves.toMatchObject({ generatedFor: 8 });
  });

  it("reports a missing document without reading property or content", async () => {
    mocks.document.mockResolvedValue(null);
    await expect(requireLegalEvidenceAccess(investor, 41)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.property).not.toHaveBeenCalled();
  });
});

describe("summary procedure access before cached/content reads", () => {
  it.each(["read", "cached-generation", "forced-generation"])("blocks forbidden %s before cache/content or AI access", async (action) => {
    const result = action === "read" ? caller.getLegalDocumentSummary({ authToken, documentId: 41 })
      : caller.summariseLegalDocument({ authToken, documentId: 41, force: action === "forced-generation" });
    await expect(result).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.document).toHaveBeenCalledTimes(1);
    expect(mocks.document).toHaveBeenCalledWith({ where: { id: 41 }, select: { id: true, propertyId: true, generatedFor: true } });
    expect(mocks.ai).not.toHaveBeenCalled();
    expect(mocks.documentUpdate).not.toHaveBeenCalled();
  });

  it("blocks another user's cached summary even on a published property", async () => {
    mocks.property.mockResolvedValue({ ...property, isPublished: true });
    mocks.document.mockImplementation(async (query: Prisma.LegalDocumentFindUniqueArgs) =>
      query.select?.generatedFor ? { ...document, generatedFor: 8 } : content);
    await expect(caller.getLegalDocumentSummary({ authToken, documentId: 41 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.document).toHaveBeenCalledTimes(1);
  });

  it("returns legitimate shared cached summaries without an AI call", async () => {
    mocks.property.mockResolvedValue({ ...property, isPublished: true });
    await expect(caller.getLegalDocumentSummary({ authToken, documentId: 41 })).resolves.toEqual(cached);
    await expect(caller.summariseLegalDocument({ authToken, documentId: 41 })).resolves.toEqual(cached);
    expect(mocks.ai).not.toHaveBeenCalled();
  });

  it("generates a summary only after successful owner authorization", async () => {
    mocks.auth.mockResolvedValue({ id: 9, role: "PROPERTY_OWNER" });
    await expect(caller.summariseLegalDocument({ authToken, documentId: 41, force: true })).resolves.toMatchObject({ summary: "New summary" });
    expect(mocks.ai).toHaveBeenCalledWith(expect.objectContaining({ userId: 9 }));
    expect(mocks.documentUpdate).toHaveBeenCalledTimes(1);
  });
});

const reportCalls = {
  income: () => caller.getSPVIncomeStatement({ authToken, propertyId: 31, fromDate: "2026-03-01", toDate: "2026-04-01" }),
  balance: () => caller.getSPVBalanceSheet({ authToken, propertyId: 31, asAtDate: "2026-04-01" }),
  tax: () => caller.getAnnualTaxReport({ authToken, propertyId: 31, taxYear: 2026 }),
};

describe("sensitive financial report procedures", () => {
  it.each(Object.keys(reportCalls) as (keyof typeof reportCalls)[])("denies unrelated logged-in users on published %s reports before financial reads", async (report) => {
    mocks.property.mockResolvedValue({ ...property, isPublished: true });
    await expect(reportCalls[report]()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.property).toHaveBeenCalledTimes(1);
    expect(mocks.entries).not.toHaveBeenCalled();
    expect(mocks.distributions).not.toHaveBeenCalled();
    expect(mocks.classes).not.toHaveBeenCalled();
  });

  it.each(Object.keys(reportCalls) as (keyof typeof reportCalls)[])("strips bank/tax identifiers from authorized investor %s reports and does not select them", async (report) => {
    mocks.holding.mockResolvedValue({ id: 1 });
    const result = await reportCalls[report]();
    expect(result?.spv).toMatchObject({ name: "SPV" });
    expect(result?.spv).not.toHaveProperty("taxNumber");
    expect(result?.spv).not.toHaveProperty("bankAccountNumber");
    expect(mocks.property.mock.calls).toHaveLength(2);
    expect(mocks.property.mock.calls[1]![0].select?.spv).toMatchObject({ select: {
      taxNumber: false, ...(report === "balance" ? { bankAccountNumber: false } : {}),
    } });
  });

  it.each(["owner", "paid-past-investor", "secondary-past-investor", "manager"])("preserves legitimate %s report access", async (relationship) => {
    if (relationship === "owner") mocks.auth.mockResolvedValue({ id: 9, role: "PROPERTY_OWNER" });
    if (relationship === "paid-past-investor") mocks.contribution.mockResolvedValue({ id: 1 });
    if (relationship === "secondary-past-investor") mocks.ledger.mockResolvedValue({ id: 1 });
    if (relationship === "manager") mocks.auth.mockResolvedValue({ id: 7, role: "DEVELOPMENT_MANAGER" });
    await expect(reportCalls.income()).resolves.toMatchObject({ property: { id: 31 } });
  });

  it("retains sensitive SPV identifiers for staff only", async () => {
    mocks.auth.mockResolvedValue({ id: 7, role: "ADMIN" });
    await expect(reportCalls.balance()).resolves.toMatchObject({ spv: { taxNumber: "SECRET-TAX", bankAccountNumber: "SECRET-BANK" } });
    expect(mocks.property.mock.calls).toHaveLength(2);
    expect(mocks.property.mock.calls[1]![0].select?.spv).toMatchObject({ select: { bankAccountNumber: true } });
  });

  it("keeps investor statements bound to the authenticated investor", async () => {
    await caller.getInvestorStatement({ authToken });
    expect(mocks.holdings.mock.calls).toHaveLength(1);
    expect(mocks.contributions.mock.calls).toHaveLength(1);
    expect(mocks.payouts.mock.calls).toHaveLength(1);
    expect(mocks.holdings.mock.calls[0]![0].where).toEqual({ investorId: 7 });
    expect(mocks.contributions.mock.calls[0]![0].where?.investorId).toBe(7);
    expect(mocks.payouts.mock.calls[0]![0].where?.investorId).toBe(7);
  });
});

describe("SPV portfolio evidence scope", () => {
  it("denies stranger SPV access before financial or cap-table reads", async () => {
    await expect(caller.getSPVPortfolioSummary({ authToken, spvId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.spv).toHaveBeenCalledTimes(1);
    expect(mocks.entries).not.toHaveBeenCalled();
    expect(mocks.distributionAggregate).not.toHaveBeenCalled();
  });

  it("does not unlock unrelated SPV properties when one is owned", async () => {
    mocks.spv.mockResolvedValue({ properties: [{ id: 31 }, { id: 32 }] });
    mocks.property.mockImplementation(async (query: Prisma.PropertyFindUniqueArgs) => ({
      ...property, id: query.where.id, userId: query.where.id === 31 ? 7 : 9,
    }));
    await expect(caller.getSPVPortfolioSummary({ authToken, spvId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.spv).toHaveBeenCalledTimes(1);
    expect(mocks.entries).not.toHaveBeenCalled();
  });

  it("allows authorized investor portfolios with no sensitive identifiers and selects only checked properties", async () => {
    mocks.holding.mockResolvedValue({ id: 1 });
    const result = await caller.getSPVPortfolioSummary({ authToken, spvId: 2 });
    expect(result?.spv).not.toHaveProperty("taxNumber");
    expect(result?.spv).not.toHaveProperty("bankAccountNumber");
    expect(mocks.spv.mock.calls).toHaveLength(2);
    expect(mocks.spv.mock.calls[1]![0].select).toMatchObject({
      taxNumber: false, properties: { where: { id: { in: [31] } } },
    });
    expect(mocks.spv.mock.calls[1]![0]).not.toHaveProperty("include");
  });

  it("permits managers to view the whole SPV and tax identifier", async () => {
    mocks.auth.mockResolvedValue({ id: 7, role: "PROJECT_MANAGER" });
    await expect(caller.getSPVPortfolioSummary({ authToken, spvId: 2 })).resolves.toMatchObject({ spv: { taxNumber: "SECRET-TAX" } });
  });

  it("denies empty SPVs to non-staff and preserves null for missing SPVs", async () => {
    mocks.spv.mockResolvedValue({ properties: [] });
    await expect(caller.getSPVPortfolioSummary({ authToken, spvId: 2 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    mocks.spv.mockResolvedValue(null);
    await expect(caller.getSPVPortfolioSummary({ authToken, spvId: 2 })).resolves.toBeNull();
  });
});
