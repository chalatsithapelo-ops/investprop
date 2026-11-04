import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
const mock = vi.hoisted(() => ({
  shareHolding: { findMany: vi.fn<(args: { where: Prisma.ShareHoldingWhereInput }) => Promise<unknown[]>>() },
  distributionPayout: { findMany: vi.fn<(args: { where: Prisma.DistributionPayoutWhereInput }) => Promise<unknown[]>>() },
  legalDocument: { findMany: vi.fn<(args: { where: Prisma.LegalDocumentWhereInput; select: unknown }) => Promise<unknown[]>>() },
  ownerSaleProposal: { findMany: vi.fn<(args: { where: Prisma.OwnerSaleProposalWhereInput }) => Promise<unknown[]>>() },
  officeTaxSource: { findMany: vi.fn<(args: { where: Prisma.OfficeTaxSourceWhereInput }) => Promise<unknown[]>>() },
}));
vi.mock("~/server/db", () => ({ db: mock }));
import { loadOfficeContext, sharedPropertyScope } from "./context";
import { OFFICE_LIMIT } from "./policy";
const user = { id: 42, role: "ADMIN", status: "ACTIVE" } as const;
beforeEach(() => {
  vi.clearAllMocks();
  for (const delegate of Object.values(mock)) delegate.findMany.mockResolvedValue([]);
});
describe("office grounded ownership context", () => {
  it("staff still receive only their own holdings/payouts/proposals", async () => {
    await loadOfficeContext(user);
    expect(mock.shareHolding.findMany.mock.calls[0]![0].where).toEqual({ investorId: 42, sharesOwned: { gt: 0 } });
    expect(mock.distributionPayout.findMany.mock.calls[0]![0].where).toMatchObject({ investorId: 42, status: "PAID", distribution: { deletedAt: null } });
    expect(mock.ownerSaleProposal.findMany.mock.calls[0]![0].where).toEqual({ ownerId: 42 });
    expect(mock.legalDocument.findMany.mock.calls[0]![0].where).toEqual({ OR: [{ generatedFor: 42 }, { generatedFor: null, property: sharedPropertyScope(42) }] });
    expect(mock.legalDocument.findMany.mock.calls[0]![0].select).toEqual({ id: true, title: true, documentType: true, propertyId: true, updatedAt: true });
  });
  it("derives acquisition basis exactly, never uses market value", async () => {
    mock.shareHolding.findMany.mockResolvedValue([{ id: 1, propertyId: 9, sharesOwned: 3, averageCostPerShare: 0.335, updatedAt: new Date(), property: { title: "Own holding" } }]);
    const context = await loadOfficeContext(user);
    expect(context.overview.holdings[0]!.basisValue).toBe(1.01);
    expect(context.overview.holdings[0]!.basisLabel).toContain("not fair market value");
  });
  it("caps displayed rows and marks totals incomplete rather than full-account totals", async () => {
    mock.distributionPayout.findMany.mockResolvedValue(Array.from({ length: OFFICE_LIMIT + 1 }, (_, id) => ({ id, grossAmount: 0.1, netAmount: 0.1, taxWithheld: 0, paidAt: new Date(), distribution: { propertyId: 9, taxClassification: "UNCLASSIFIED" } })));
    const context = await loadOfficeContext(user);
    expect(context.payouts).toHaveLength(OFFICE_LIMIT);
    expect(context.overview.paidDistributions.gross).toBe(20);
    expect(context.overview.gaps.some((gap) => gap.includes("incomplete, not full-account totals"))).toBe(true);
  });
  it("refuses non-active accounts before loading any records", async () => {
    await expect(loadOfficeContext({ ...user, status: "PENDING_APPROVAL" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mock.shareHolding.findMany).not.toHaveBeenCalled();
  });
});