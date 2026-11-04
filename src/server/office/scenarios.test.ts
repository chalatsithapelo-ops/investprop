import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";
import { calculateMonthlyDebtService, calculateRentalMetrics, buildRentalInput } from "~/financial-calculations";

const mocks = vi.hoisted(() => ({
  property: vi.fn<(args: Prisma.PropertyFindUniqueArgs) => Promise<unknown>>(),
  holding: vi.fn(), contribution: vi.fn(), ledger: vi.fn(),
  payouts: vi.fn<(args: Prisma.DistributionPayoutFindManyArgs) => Promise<unknown[]>>(),
  holdings: vi.fn<(args: Prisma.ShareHoldingFindManyArgs) => Promise<unknown[]>>(),
  certificates: vi.fn<(args: Prisma.ShareCertificateFindManyArgs) => Promise<unknown[]>>(),
  contributions: vi.fn<(args: Prisma.InvestorContributionFindManyArgs) => Promise<unknown[]>>(),
  auth: vi.fn(), feature: vi.fn(),
}));
vi.mock("~/server/db", () => ({ db: {
  property: { findUnique: mocks.property },
  shareHolding: { findFirst: mocks.holding, findMany: mocks.holdings },
  investorContribution: { findFirst: mocks.contribution, findMany: mocks.contributions },
  shareLedgerEntry: { findFirst: mocks.ledger },
  distributionPayout: { findMany: mocks.payouts }, shareCertificate: { findMany: mocks.certificates },
} }));
vi.mock("~/server/trpc/auth-helpers", () => ({ getAuthenticatedUser: mocks.auth }));
vi.mock("~/server/subscriptions/subscription-service", () => ({ requireFeature: mocks.feature }));

import { db } from "~/server/db";
import { createTRPCRouter } from "~/server/trpc/main";
import { officePropertyScenario, officeAccountingExceptions } from "~/server/trpc/procedures/office-scenarios";
import { calculatePropertyScenario, calculateAccountingExceptions, scenarioAssumptionsSchema, type AccountingRows } from "./scenarios";
import { OFFICE_LIMIT } from "./policy";

const date = new Date("2024-02-01T00:00:00Z");
const rental = { id: 5, createdAt: date, leaseStartDate: date, leaseEndDate: new Date("2025-02-01T00:00:00Z"),
  monthlyRent: 10000, vacancyRate: 5, annualPropertyTax: 12000, annualInsurance: 6000,
  monthlyHOAFees: 200, monthlyMaintenanceReserve: 300, monthlyUtilities: 100, monthlyManagementFee: 400,
  loanAmount: 500000, bondAmount: 500000, interestRate: 10, loanTermYears: 20,
  monthlyDebtService: calculateMonthlyDebtService(500000, 10, 20),
};
const unchanged = { rentChangePct: 0, vacancyRatePct: 5, operatingCostChangePct: 0, interestRateChangePp: 0 };
const downside = { rentChangePct: -10, vacancyRatePct: 20, operatingCostChangePct: 25, interestRateChangePp: 2 };
const property = { id: 31, title: "Recorded rental", userId: 9, isPublished: false, deletedAt: null,
  createdAt: date, rentalBond: rental, propertyFlip: null, propertyDevelopment: null };
const user = { id: 7, role: "INVESTOR", status: "ACTIVE" } as const;
const router = createTRPCRouter({ officePropertyScenario, officeAccountingExceptions });
const caller = router.createCaller({ db, user: null, req: new Request("http://localhost/test") });
const input = { authToken: "test-token", propertyId: 31, assumptions: unchanged };
const emptyRows = (): AccountingRows => ({ payouts: [], holdings: [], certificates: [], contributions: [] });
const payout = { id: 1, grossAmount: 100, netAmount: 80, taxWithheld: 20, paidAt: date, createdAt: date, distribution: { propertyId: 31 } };
const holding = { id: 2, propertyId: 31, shareClassId: 4, sharesOwned: 100, updatedAt: date, shareClass: { name: "Ordinary" } };
const certificate = { id: 3, propertyId: 31, numberOfShares: 100, shareClassName: "Ordinary", issueDate: date,
  property: { shareClasses: [{ id: 4, name: "Ordinary" }] } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue(user);
  mocks.feature.mockResolvedValue(undefined);
  // Real access helper with metadata-only authorisation response, never content.
  mocks.property.mockImplementation(async (args) => args.select?.userId
    ? { id: property.id, userId: property.userId, isPublished: property.isPublished, deletedAt: property.deletedAt } : property);
  mocks.holding.mockResolvedValue(null);
  mocks.contribution.mockResolvedValue(null);
  mocks.ledger.mockResolvedValue(null);
  for (const delegate of [mocks.payouts, mocks.holdings, mocks.certificates, mocks.contributions]) delegate.mockResolvedValue([]);
});

describe("deterministic rental calculator", () => {
  it("identity assumptions preserve base and match the existing rental engine", () => {
    const result = calculatePropertyScenario(rental, unchanged);
    const sharedInput = buildRentalInput(rental);
    const shared = calculateRentalMetrics(sharedInput);
    expect(result.base).toEqual(result.stressed);
    expect(result.base).toMatchObject({ annualGrossRent: shared.annualGrossRent, annualOperatingExpenses: shared.annualOperatingExpenses,
      noi: shared.noi, annualCashFlow: shared.annualCashFlow, annualDebtService: sharedInput.monthlyDebtService * 12, dscr: shared.dscr });
  });
  it("computes exact stressed operating metrics with rate-point, not percent, changes", () => {
    const result = calculatePropertyScenario(rental, downside);
    expect(result.base).toMatchObject({ annualGrossRent: 120000, annualOperatingExpenses: 30000, vacancyLoss: 6000, noi: 84000 });
    expect(result.stressed).toMatchObject({ annualGrossRent: 108000, annualOperatingExpenses: 37500, vacancyLoss: 21600, noi: 48900, interestRatePct: 12 });
    expect(result.stressed.annualDebtService).toBe(calculateMonthlyDebtService(500000, 12, 20) * 12);
    expect(result.stressed.annualCashFlow).toBe(48900 - result.stressed.annualDebtService!);
    expect(result.stressed.dscr).toBe(48900 / result.stressed.annualDebtService!);
  });
  it("downside changes cannot improve NOI, cashflow or DSCR with valid debt", () => {
    for (const drop of [0, -1, -50, -100]) {
      const r = calculatePropertyScenario(rental, { rentChangePct: drop, vacancyRatePct: 80, operatingCostChangePct: 100, interestRateChangePp: 10 });
      expect(r.stressed.noi!).toBeLessThanOrEqual(r.base.noi!);
      expect(r.stressed.annualDebtService!).toBeGreaterThanOrEqual(r.base.annualDebtService!);
      expect(r.stressed.annualCashFlow!).toBeLessThanOrEqual(r.base.annualCashFlow!);
      expect(r.stressed.dscr!).toBeLessThanOrEqual(r.base.dscr!);
    }
  });
  it("keeps negative NOI/DSCR and zero rent/vacancy endpoints without clamping losses", () => {
    const r = calculatePropertyScenario(rental, { ...unchanged, rentChangePct: -100, vacancyRatePct: 100 });
    expect(r.stressed.annualGrossRent).toBe(0);
    expect(r.stressed.noi).toBe(-30000);
    expect(r.stressed.dscr!).toBeLessThan(0);
    expect(calculatePropertyScenario({ ...rental, monthlyRent: 0, vacancyRate: 0 }, { ...unchanged, vacancyRatePct: 0 }).base.noi).toBe(-30000);
  });
  it("handles the zero-interest limit but never fabricates a negative-rate repayment", () => {
    const zero = calculatePropertyScenario(rental, { ...unchanged, interestRateChangePp: -10 });
    expect(zero.stressed.annualDebtService).toBe(25000);
    const negative = calculatePropertyScenario(rental, { ...unchanged, interestRateChangePp: -20 });
    expect(negative.stressed.interestRatePct).toBe(-10);
    expect(negative.stressed.annualDebtService).toBeNull();
    expect(negative.stressed.annualCashFlow).toBeNull();
    expect(negative.gaps.join(" ")).toContain("not clamped");
  });
  it.each(["annualPropertyTax", "annualInsurance", "monthlyHOAFees", "monthlyMaintenanceReserve", "monthlyUtilities", "monthlyManagementFee"] as const)("missing %s never defaults to zero", (key) => {
    const r = calculatePropertyScenario({ ...rental, [key]: null }, unchanged);
    expect(r.base.annualGrossRent).toBe(120000);
    expect(r.base.annualOperatingExpenses).toBeNull();
    expect(r.base.noi).toBeNull();
    expect(r.stressed.annualCashFlow).toBeNull();
    expect(r.base.dscr).toBeNull();
    expect(r.gaps.join(" ")).toContain(key);
  });
  it.each([{ loanAmount: null, bondAmount: null }, { interestRate: null }, { interestRate: 0 }, { loanTermYears: 0 }, { loanTermYears: 1.5 }, { loanAmount: 0, bondAmount: 0 }])("unknown/invalid loan %j is not treated as all-cash", (patch) => {
    const r = calculatePropertyScenario({ ...rental, ...patch }, unchanged);
    expect(r.base.noi).toBe(84000);
    expect(r.base.annualDebtService).toBeNull();
    expect(r.base.annualCashFlow).toBeNull();
    expect(r.base.dscr).toBeNull();
  });
  it("uses recorded bond principal fallback, not a stored debt payment or market rate", () => {
    const r = calculatePropertyScenario({ ...rental, loanAmount: null, monthlyDebtService: 99999 }, unchanged);
    expect(r.financing.principalSource).toBe("bondAmount");
    expect(r.base.annualDebtService).toBe(rental.monthlyDebtService * 12);
    expect(r.financing.recordedMonthlyDebtService).toBe(99999);
    expect(r.unitNotes.join(" ")).toContain("historical recorded rates");
  });
  it.each([{ monthlyRent: null }, { monthlyRent: -1 }, { monthlyRent: Infinity }, { vacancyRate: undefined }, { vacancyRate: 101 }])("rejects absent/invalid baseline %j", (patch) => {
    expect(() => calculatePropertyScenario({ ...rental, ...patch }, unchanged)).toThrow(TRPCError);
  });
  it("rejects overflow rather than publishing non-finite metrics", () => {
    expect(() => calculatePropertyScenario({ ...rental, monthlyRent: Number.MAX_VALUE }, unchanged)).toThrow("finite calculation range");
  });
  it.each([
    { rentChangePct: -101 }, { rentChangePct: 101 }, { vacancyRatePct: -1 }, { vacancyRatePct: 101 },
    { operatingCostChangePct: -101 }, { operatingCostChangePct: 201 }, { interestRateChangePp: -21 }, { interestRateChangePp: 21 },
    { rentChangePct: NaN }, { vacancyRatePct: Infinity }, { extra: 1 },
  ])("bounds and strictly validates assumptions %j", (patch) => {
    expect(scenarioAssumptionsSchema.safeParse({ ...unchanged, ...patch }).success).toBe(false);
  });
  it("does not mutate evidence or assumptions", () => {
    const r = Object.freeze({ ...rental });
    const a = Object.freeze({ ...downside });
    expect(calculatePropertyScenario(r, a)).toEqual(calculatePropertyScenario(r, a));
    expect(r).toEqual(rental);
    expect(a).toEqual(downside);
  });
});

describe("factual accounting exceptions", () => {
  it("does not invent any exceptions for empty or consistent evidence", () => {
    expect(calculateAccountingExceptions(emptyRows()).exceptions).toEqual([]);
    const result = calculateAccountingExceptions({ ...emptyRows(), payouts: [payout], holdings: [holding], certificates: [certificate] });
    expect(result.exceptions).toEqual([]);
    expect(result.gaps.join(" ")).toContain("receipt issuance/delivery cannot be established");
  });
  it("flags missing payment date without substituting record creation date", () => {
    const result = calculateAccountingExceptions({ ...emptyRows(), payouts: [{ ...payout, paidAt: null }] });
    expect(result.exceptions[0]).toMatchObject({ code: "PAID_MISSING_DATE", observed: { paidAt: null }, evidence: [{ asOf: null }] });
  });
  it("records unexplained differences, including possible fees, to cents without asserting fraud", () => {
    const result = calculateAccountingExceptions({ ...emptyRows(), payouts: [{ ...payout, grossAmount: 100.1, netAmount: 78.1 }] });
    expect(result.exceptions[0]).toMatchObject({ code: "PAYOUT_UNALLOCATED_DIFFERENCE", observed: { unallocatedDifferenceCents: 200, allocatedFeeCents: null } });
    expect(result.exceptions[0]!.message).toContain("not a fraud finding");
    expect(result.exceptions[0]).not.toHaveProperty("probability");
  });
  it("avoids binary float noise and preserves the sign of over-allocation", () => {
    expect(calculateAccountingExceptions({ ...emptyRows(), payouts: [{ ...payout, grossAmount: 0.3, netAmount: 0.2, taxWithheld: 0.1 }] }).exceptions).toEqual([]);
    expect(calculateAccountingExceptions({ ...emptyRows(), payouts: [{ ...payout, netAmount: 90 }] }).exceptions[0]!.observed.unallocatedDifferenceCents).toBe(-1000);
  });
  it.each([null, NaN, Infinity, -1])("invalid amount %s does not produce a fabricated conservation total", (netAmount) => {
    const r = calculateAccountingExceptions({ ...emptyRows(), payouts: [{ ...payout, netAmount }] });
    expect(r.exceptions.map((e) => e.code)).toEqual(["PAYOUT_INVALID_AMOUNT"]);
    expect(r.exceptions[0]!.observed.netAmount).toBeNull();
  });
  it("groups issuance by property AND class, not individual certificates or cross-property names", () => {
    const r = calculateAccountingExceptions({ ...emptyRows(), holdings: [holding, { ...holding, id: 9, propertyId: 32, sharesOwned: 60 }],
      certificates: [{ ...certificate, numberOfShares: 40 }, { ...certificate, id: 8, numberOfShares: 60 }, { ...certificate, id: 10, propertyId: 32, numberOfShares: 50 }] });
    expect(r.exceptions).toHaveLength(1);
    expect(r.exceptions[0]).toMatchObject({ code: "CERTIFICATE_HOLDING_DIFFERENCE", propertyId: 32, observed: { holdingShares: 60, certificateShares: 50, differenceShares: -10 } });
    expect(r.exceptions[0]!.message).toContain("Historical issuance");
  });
  it.each([
    { shareClasses: [] },
    { shareClasses: [{ id: 4, name: "Ordinary" }, { id: 5, name: "Ordinary" }] },
  ])("ambiguous/missing class mapping %j suppresses numeric comparison", ({ shareClasses }) => {
    const r = calculateAccountingExceptions({ ...emptyRows(), holdings: [holding], certificates: [{ ...certificate, property: { shareClasses } }] });
    expect(r.exceptions.map((e) => e.code)).toEqual(["CERTIFICATE_CLASS_AMBIGUOUS"]);
  });
  it("never nets one class against another class in the same property", () => {
    const preference = { id: 5, name: "Preference" };
    const r = calculateAccountingExceptions({ ...emptyRows(), holdings: [holding, { ...holding, id: 8, shareClassId: 5, sharesOwned: 50, shareClass: preference }],
      certificates: [{ ...certificate, numberOfShares: 50 }, { ...certificate, id: 9, shareClassName: "Preference", property: { shareClasses: [preference] } }] });
    expect(r.exceptions.map((e) => e.observed.differenceShares)).toEqual([-50, 50]);
  });
  it("invalid certificate shares are not fabricated as zero", () => {
    const r = calculateAccountingExceptions({ ...emptyRows(), holdings: [holding], certificates: [{ ...certificate, numberOfShares: NaN }] });
    expect(r.exceptions.map((e) => e.code)).toEqual(["CERTIFICATE_INVALID_SHARES"]);
  });
  it("reports missing/revoked linked documentation, not receipt failure or absent ownership", () => {
    const c = { id: 1, propertyId: 31, contributionAmount: 100, paymentReviewedAt: null, createdAt: date, certificate: null };
    const r = calculateAccountingExceptions({ ...emptyRows(), contributions: [c, { ...c, id: 2, certificate: { id: 4, isValid: false, revokedAt: date } },
      { ...c, id: 3, certificate: { id: 5, isValid: true, revokedAt: null } }] });
    expect(r.exceptions.map((e) => e.code)).toEqual(["PAID_CERTIFICATE_PENDING", "PAID_CERTIFICATE_PENDING"]);
    expect(r.exceptions[0]!.evidence[0]!.asOf).toBeNull();
  });
  it("truncated evidence does not produce false certificate mismatches", () => {
    const r = calculateAccountingExceptions({ ...emptyRows(), holdings: Array.from({ length: OFFICE_LIMIT + 1 }, (_, id) => ({ ...holding, id })) });
    expect(r.complete).toBe(false);
    expect(r.counts.holdings).toBe(OFFICE_LIMIT);
    expect(r.exceptions).toEqual([]);
    expect(r.gaps.join(" ")).toContain("comparisons suppressed");
  });
});

describe("read-only procedure authorisation", () => {
  it("denies a private-property stranger after metadata only, before rental reads", async () => {
    await expect(caller.officePropertyScenario(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.property).toHaveBeenCalledTimes(1);
    expect(mocks.property.mock.calls[0]![0].select).toEqual({ id: true, userId: true, isPublished: true, deletedAt: true });
  });
  it.each(["published", "owned", "holding", "paid-history", "received-history"])("authorises %s evidence before reading rental values", async (access) => {
    mocks.property.mockImplementation(async (args) => args.select?.userId
      ? { ...property, userId: access === "owned" ? user.id : 9, isPublished: access === "published" }
      : property);
    if (access === "holding") mocks.holding.mockResolvedValue({ id: 2 });
    if (access === "paid-history") mocks.contribution.mockResolvedValue({ id: 3 });
    if (access === "received-history") mocks.ledger.mockResolvedValue({ id: 4 });
    const r = await caller.officePropertyScenario(input);
    expect(mocks.property).toHaveBeenCalledTimes(2);
    expect(mocks.property.mock.calls[0]![0].select?.userId).toBe(true);
    expect(mocks.property.mock.calls[1]![0].select?.rentalBond).toBeTruthy();
    expect(mocks.property.mock.calls[1]![0].select).toHaveProperty("createdAt", true);
    expect(mocks.property.mock.calls[1]![0].select).not.toHaveProperty("updatedAt");
    expect(r.evidence[0]).toMatchObject({ asOf: null, createdAt: date.toISOString(),
      propertyUpdatedAt: null, propertyCreatedAt: date.toISOString(), values: { interestRate: 10 } });
    expect(mocks.property.mock.calls[1]![0].select?.rentalBond).not.toHaveProperty("tenantEmail");
    expect(r.readOnly).toBe(true);
    expect(mocks.feature).toHaveBeenCalledWith(user, "AI_COPILOT");
  });
  it.each(["PENDING_APPROVAL", "SUSPENDED"])("blocks %s before subscription or evidence reads", async (status) => {
    mocks.auth.mockResolvedValue({ ...user, status });
    await expect(caller.officePropertyScenario(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.officeAccountingExceptions({ authToken: "test" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.feature).not.toHaveBeenCalled();
    expect(mocks.property).not.toHaveBeenCalled();
    expect(mocks.payouts).not.toHaveBeenCalled();
  });
  it("fails authentication and feature denial closed before any evidence", async () => {
    mocks.auth.mockRejectedValueOnce(new TRPCError({ code: "UNAUTHORIZED" }));
    await expect(caller.officePropertyScenario(input)).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    mocks.feature.mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
    await expect(caller.officePropertyScenario(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.officeAccountingExceptions({ authToken: "test" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.property).not.toHaveBeenCalled();
    expect(mocks.payouts).not.toHaveBeenCalled();
  });
  it("owner subscription uses SELLER_AI_VALUATION but owner role alone grants no property access", async () => {
    mocks.auth.mockResolvedValue({ ...user, role: "PROPERTY_OWNER" });
    await expect(caller.officePropertyScenario(input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.feature).toHaveBeenCalledWith({ ...user, role: "PROPERTY_OWNER" }, "SELLER_AI_VALUATION");
    await caller.officeAccountingExceptions({ authToken: "test" });
    expect(mocks.payouts.mock.calls[0]![0].where?.investorId).toBe(7);
  });
  it.each([{ rentalBond: null }, { propertyFlip: { id: 1 } }, { propertyDevelopment: { id: 2 } }])("explicitly rejects unsupported/missing baseline %j", async (patch) => {
    mocks.property.mockImplementation(async (args) => args.select?.userId ? { ...property, isPublished: true } : { ...property, ...patch });
    await expect(caller.officePropertyScenario(input)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("missing property and evidence failures do not trigger content reads", async () => {
    mocks.property.mockResolvedValueOnce(null);
    await expect(caller.officePropertyScenario(input)).rejects.toMatchObject({ code: "NOT_FOUND" });
    mocks.property.mockRejectedValueOnce(new Error("Evidence unavailable"));
    await expect(caller.officePropertyScenario(input)).rejects.toThrow("Evidence unavailable");
    expect(mocks.property).toHaveBeenCalledTimes(2);
  });
  it.each([0, -1, 1.5])("requires positive integer property ID %s before auth", async (propertyId) => {
    await expect(caller.officePropertyScenario({ ...input, propertyId })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it("accepts no caller-supplied accounting user ID", async () => {
    const forged = { authToken: "test", userId: 999 };
    await expect(caller.officeAccountingExceptions(forged)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.auth).not.toHaveBeenCalled();
  });
  it("staff accounting remains self-only with bounded, safe metadata projections", async () => {
    mocks.auth.mockResolvedValue({ ...user, role: "ADMIN" });
    await caller.officeAccountingExceptions({ authToken: "test" });
    expect(mocks.payouts.mock.calls[0]![0].where).toEqual({ investorId: 7, status: "PAID", distribution: { deletedAt: null } });
    expect(mocks.holdings.mock.calls[0]![0].where).toEqual({ investorId: 7 });
    expect(mocks.certificates.mock.calls[0]![0].where).toEqual({ investorId: 7, isValid: true, revokedAt: null });
    expect(mocks.contributions.mock.calls[0]![0].where).toEqual({ investorId: 7, paymentStatus: "PAID", status: "APPROVED", cancelledAt: null, deletedAt: null, contributionAmount: { gt: 0 } });
    for (const delegate of [mocks.payouts, mocks.holdings, mocks.certificates, mocks.contributions]) {
      expect(delegate.mock.calls[0]![0].take).toBe(OFFICE_LIMIT + 1);
    }
    const projection = JSON.stringify(mocks.certificates.mock.calls[0]![0].select);
    expect(projection).not.toMatch(/validationHash|internalFingerprint|fraudFlags|internalNotes/);
    expect(JSON.stringify(mocks.payouts.mock.calls[0]![0].select)).not.toMatch(/paymentRef|reconciliationNotes|bank/);
  });
});