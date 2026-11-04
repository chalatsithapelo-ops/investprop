import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateText } from "ai";
import {
  appropriatenessProfileSchema, confirmedProfileSchema, onboardingSubmissionSchema,
  onboardingTurnSchema, readCompletedProfile, summariseLiveHoldings, liveHoldingSelect, HOLDING_BASIS,
} from "./ai-investor-profile";

const profile = {
  investmentExperience: "BASIC" as const,
  annualIncome: "350_750K" as const,
  netWorth: "500K_2M" as const,
  maxLossTolerance: 25000,
  understandsIlliquid: true,
  understandsLossOfCapital: true,
  understandsCoolingOff: true,
};

function holding(id: number, city: string, sharesOwned: number, cost: number, price = 100) {
  return {
    sharesOwned, averageCostPerShare: cost,
    shareClass: {
      id, pricePerShare: price,
      property: {
        id, title: `Property ${id}`, city, riskRating: "MEDIUM", investmentStatus: "FUNDED",
        propertyFlip: { id }, rentalBond: null, propertyDevelopment: null,
      },
    },
  };
}

describe("canonical appropriateness profile", () => {
  it("accepts the existing questionnaire fields and strips storage metadata", () => {
    expect(readCompletedProfile({ ...profile, completedAt: "2026-11-04", source: "form" }, new Date())).toEqual(profile);
    expect(confirmedProfileSchema.parse({ ...profile, authToken: "not-persisted" })).toEqual(profile);
  });

  it.each(Object.keys(profile))("requires %s", (field) => {
    const missing: Record<string, unknown> = { ...profile };
    delete missing[field];
    expect(appropriatenessProfileSchema.safeParse(missing).success).toBe(false);
  });

  it.each([
    ["investmentExperience", "SOME"], ["annualIncome", "25_50K"], ["netWorth", "2M_PLUS"],
    ["maxLossTolerance", -1], ["maxLossTolerance", Infinity], ["maxLossTolerance", NaN],
    ["maxLossTolerance", "25000"], ["understandsIlliquid", "true"],
  ])("rejects invalid %s=%s", (field, value) => {
    expect(appropriatenessProfileSchema.safeParse({ ...profile, [field]: value }).success).toBe(false);
  });

  it.each(["understandsIlliquid", "understandsLossOfCapital", "understandsCoolingOff"])("requires explicit true for %s", (field) => {
    expect(confirmedProfileSchema.safeParse({ ...profile, [field]: false }).success).toBe(false);
    expect(readCompletedProfile({ ...profile, [field]: false }, new Date())).toBeNull();
  });

  it("accepts zero affordable loss without inventing a risk tolerance", () => {
    expect(confirmedProfileSchema.parse({ ...profile, maxLossTolerance: 0 }).maxLossTolerance).toBe(0);
  });

  it("requires a completion timestamp and rejects legacy AI profiles", () => {
    expect(readCompletedProfile(profile, null)).toBeNull();
    expect(readCompletedProfile({ experience: "SOME", monthlyIncomeBand: "25_50K", notAdviceAck: true }, new Date())).toBeNull();
  });

  it("requires a separate explicit final confirmation", () => {
    expect(onboardingSubmissionSchema.safeParse(profile).success).toBe(false);
    expect(onboardingSubmissionSchema.safeParse({ ...profile, confirmed: false }).success).toBe(false);
    expect(onboardingSubmissionSchema.safeParse({ ...profile, confirmed: "true" }).success).toBe(false);
    expect(onboardingSubmissionSchema.safeParse({ ...profile, confirmed: true }).success).toBe(true);
  });

  it("validates partial drafts without accepting malformed or legacy fields", () => {
    expect(onboardingTurnSchema.safeParse({ message: "Your annual income?", collected: { investmentExperience: "BASIC", annualIncome: null }, complete: false }).success).toBe(true);
    expect(onboardingTurnSchema.safeParse({ message: "Question", collected: { riskTolerance: "HIGH" }, complete: false }).success).toBe(false);
    expect(onboardingTurnSchema.safeParse({ message: "Question", collected: { annualIncome: "U10K" }, complete: false }).success).toBe(false);
  });
});

describe("live ownership concentration", () => {
  it("excludes sold-out holdings and includes secondary buyers without contributions", () => {
    const result = summariseLiveHoldings([holding(1, "Sold city", 0, 1000), holding(2, "Buyer city", 10, 200)]);
    expect(result.propertyCount).toBe(1);
    expect(result.total).toBe(2000);
    expect(result.byCity.has("Sold city")).toBe(false);
    expect(result.byCity.get("Buyer city")).toBe(2000);
  });

  it("weights remaining ownership by acquisition cost, not share-class price", () => {
    const result = summariseLiveHoldings([holding(1, "A", 5, 300, 999), holding(2, "B", 10, 50)]);
    expect(result.total).toBe(2000);
    expect(result.byCity.get("A")! / result.total).toBe(0.75);
    expect(result.byType.get("flip")).toBe(2000);
    expect(result.byRisk.get("MEDIUM")).toBe(2000);
  });

  it("labels indicative fallback and does not call it fair market value", () => {
    const result = summariseLiveHoldings([holding(1, "A", 2, 0, 75)]);
    expect(result.total).toBe(150);
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0]!.basis).toBe("indicative share-class price");
    expect(HOLDING_BASIS).toContain("Not fair market value");
  });

  it("keeps unpriced positive ownership visible without NaN concentration", () => {
    const result = summariseLiveHoldings([holding(1, "A", 5, NaN, Infinity), holding(2, "B", -2, 20)]);
    expect(result.propertyCount).toBe(1);
    expect(result.unpricedCount).toBe(1);
    expect(result.total).toBe(0);
  });

  it("counts properties once across multiple share classes", () => {
    const result = summariseLiveHoldings([holding(1, "A", 1, 100), holding(1, "A", 2, 100)]);
    expect(result.propertyCount).toBe(1);
    expect(result.positions).toHaveLength(2);
    expect(result.total).toBe(300);
  });
});

// Procedure integration uses in-memory fakes only: no Prisma connection or AI calls.
type UserUpdateInput = {
  where: { id: number };
  data: { appropriatenessAssessment: Record<string, unknown>; appropriatenessCompletedAt: Date };
};
type AuditInput = { data: { action: string } };
type InsightCreate = { investorId: number; period: string; summary: string; insights: unknown };
type FakeTransaction = {
  user: { update: (input: UserUpdateInput) => Promise<unknown> };
  auditLog: { create: (input: AuditInput) => Promise<unknown> };
};
const mocks = vi.hoisted(() => ({
  userFind: vi.fn(), userUpdate: vi.fn<(input: UserUpdateInput) => Promise<unknown>>(),
  audit: vi.fn<(input: AuditInput) => Promise<unknown>>(),
  transaction: vi.fn<(run: (tx: FakeTransaction) => Promise<unknown>) => Promise<unknown>>(),
  holdings: vi.fn(), contributions: vi.fn(), payouts: vi.fn(), opportunities: vi.fn(), property: vi.fn(),
  insightFind: vi.fn(), insightSave: vi.fn<(input: { create: InsightCreate }) => Promise<unknown>>(),
  ai: vi.fn<(request: { run: () => Promise<unknown> }) => Promise<{ text: string }>>(),
}));
vi.mock("~/server/db", () => ({ db: {
  user: { findUnique: mocks.userFind, update: mocks.userUpdate }, auditLog: { create: mocks.audit },
  $transaction: mocks.transaction,
  shareHolding: { findMany: mocks.holdings }, investorContribution: { findMany: mocks.contributions },
  distributionPayout: { findMany: mocks.payouts }, property: { findUnique: mocks.property, findMany: mocks.opportunities },
  portfolioInsight: { findUnique: mocks.insightFind, upsert: mocks.insightSave },
} }));
vi.mock("~/server/trpc/auth-helpers", () => ({ getAuthenticatedUser: async () => ({ id: 91, role: "INVESTOR" }) }));
vi.mock("~/server/subscriptions/subscription-service", () => ({ requireFeature: vi.fn() }));
vi.mock("~/server/ai/client", () => ({
  getModel: vi.fn(), getModelId: () => "test", runAIWithGuard: mocks.ai,
  safeParseJson: (text: string): unknown => { try { return JSON.parse(text) as unknown; } catch { return null; } },
}));
vi.mock("~/server/trpc/main", () => ({ baseProcedure: {
  input: (schema: { parse: (input: unknown) => unknown }) => {
    const wrap = (handler: (context: { input: unknown }) => unknown) => async (input: unknown) => handler({ input: schema.parse(input) });
    return { mutation: wrap, query: wrap };
  },
} }));

import { continueOnboardingSession, startOnboardingSession } from "./ai-onboarding";
import { generatePortfolioInsightCore } from "./ai-portfolio-advisor";
import { getMatchScore, getMatchScoresBatch } from "./ai-match-score";

const call = (procedure: unknown, input: unknown) => (procedure as (input: unknown) => Promise<Record<string, unknown>>)(input);
const chatInput = { authToken: "test", history: [], userMessage: "yes" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userFind.mockResolvedValue({ id: 91, appropriatenessAssessment: profile, appropriatenessCompletedAt: new Date("2026-11-04"), ficaVerified: false });
  mocks.holdings.mockResolvedValue([holding(2, "Buyer city", 10, 200)]);
  mocks.contributions.mockResolvedValue([]);
  mocks.payouts.mockResolvedValue([]);
  mocks.opportunities.mockResolvedValue([]);
  mocks.insightFind.mockResolvedValue(null);
  mocks.insightSave.mockImplementation(async ({ create }) => ({ ...create, generatedAt: new Date() }));
  mocks.property.mockResolvedValue({
    id: 301, title: "Target", price: 1000000, minimumInvestment: 1000, city: "Buyer city", state: "Gauteng",
    riskRating: "MEDIUM", investmentStatus: "RAISING_FUNDS", aiConfidenceRating: null, aiRiskScore: null,
    propertyFlip: { expectedROI: 10, daysToComplete: 90 }, rentalBond: null, propertyDevelopment: null,
  });
  mocks.ai.mockResolvedValue({ text: JSON.stringify({ score: 80, justification: "May suit.", factors: [] }) });
  mocks.transaction.mockImplementation(async (run) => run({ user: { update: mocks.userUpdate }, auditLog: { create: mocks.audit } }));
});

describe("onboarding persistence boundary", () => {
  it("never persists model-complete output or a generic chat yes", async () => {
    mocks.ai.mockResolvedValue({ text: JSON.stringify({ message: "Done", collected: profile, complete: true }) });
    const result = await call(continueOnboardingSession, chatInput);
    expect(result.complete).toBe(false);
    expect(result.readyForConfirmation).toBe(true);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("never completes the initial greeting", async () => {
    mocks.ai.mockResolvedValue({ text: JSON.stringify({ message: "Done", collected: profile, complete: true }) });
    expect((await call(startOnboardingSession, { authToken: "test" })).complete).toBe(false);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it("atomically writes canonical fields, completion time and audit on explicit submission", async () => {
    const result = await call(continueOnboardingSession, { ...chatInput, submission: { ...profile, confirmed: true } });
    expect(result.complete).toBe(true);
    expect(mocks.ai).not.toHaveBeenCalled();
    expect(mocks.userUpdate.mock.calls).toHaveLength(1);
    expect(mocks.audit.mock.calls).toHaveLength(1);
    const data = mocks.userUpdate.mock.calls[0]![0].data;
    expect(data.appropriatenessAssessment).toEqual({ ...profile, completedAt: data.appropriatenessCompletedAt.toISOString(), source: "ai-onboarding" });
    expect(mocks.audit.mock.calls[0]![0].data.action).toBe("APPROPRIATENESS_COMPLETED");
    expect(data.appropriatenessAssessment).not.toHaveProperty("confirmed");
  });

  it("rejects unconfirmed risks before any model or persistence call", async () => {
    await expect(call(continueOnboardingSession, { ...chatInput, submission: { ...profile, understandsCoolingOff: false, confirmed: true } })).rejects.toThrow();
    expect(mocks.ai).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects malformed model fields server-side", async () => {
    mocks.ai.mockResolvedValue({ text: JSON.stringify({ message: "Done", collected: { ...profile, maxLossTolerance: "100" }, complete: true }) });
    await expect(call(continueOnboardingSession, chatInput)).rejects.toThrow("unparseable");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

describe("advisor and matching ownership integration", () => {
  it("does not turn a sold-out historical contribution into current concentration", async () => {
    mocks.holdings.mockResolvedValue([]);
    mocks.contributions.mockResolvedValue([{ contributionAmount: 900000, status: "APPROVED", property: { id: 1, title: "Sold property" } }]);
    mocks.ai.mockResolvedValue({ text: JSON.stringify({ summary: "Brief", insights: [] }) });
    await generatePortfolioInsightCore({ id: 91, role: "INVESTOR" }, { force: true });
    expect(mocks.ai.mock.calls).toHaveLength(1);
    await mocks.ai.mock.calls[0]![0].run();
    const mockedGenerateText = vi.mocked(generateText);
    expect(mockedGenerateText.mock.calls).toHaveLength(1);
    const prompt = (mockedGenerateText.mock.calls[0]![0] as { prompt: string }).prompt;
    expect(prompt).toContain("CURRENT OWNERSHIP: R0");
    expect(prompt).toContain("(no positive share holdings)");
    expect(prompt).toContain("Sold property — R900,000 | APPROVED");
    expect(prompt).toContain("- by city: n/a");
  });

  it("sends canonical profile fields and acquisition-cost concentration to matching", async () => {
    await call(getMatchScore, { authToken: "test", propertyId: 303 });
    expect(mocks.ai.mock.calls).toHaveLength(1);
    await mocks.ai.mock.calls[0]![0].run();
    const mockedGenerateText = vi.mocked(generateText);
    expect(mockedGenerateText.mock.calls).toHaveLength(1);
    const prompt = (mockedGenerateText.mock.calls[0]![0] as { prompt: string }).prompt;
    expect(prompt).toContain("investmentExperience=BASIC, annualIncome=350_750K, netWorth=500K_2M, maxLossTolerance (Rand)=25000");
    expect(prompt).toContain("Live ownership: 1 properties, R2,000");
    expect(prompt).toContain("Concentration: 100% in Buyer city, 100% in flips");
    expect(prompt).toContain("Actual contribution history (not current ownership): 0 records, R0");
  });

  it("unlocks advisor for a secondary buyer and sends ownership and history separately", async () => {
    mocks.ai.mockResolvedValue({ text: JSON.stringify({ summary: "Brief", insights: [] }) });
    await generatePortfolioInsightCore({ id: 91, role: "INVESTOR" }, { force: true });
    expect(mocks.holdings).toHaveBeenCalledWith({ where: { investorId: 91, sharesOwned: { gt: 0 } }, select: liveHoldingSelect, orderBy: { shareClassId: "asc" } });
    expect(mocks.ai.mock.calls).toHaveLength(1);
    const request = mocks.ai.mock.calls[0]![0];
    const mockedGenerateText = vi.mocked(generateText);
    await request.run();
    expect(mockedGenerateText.mock.calls).toHaveLength(1);
    const prompt = (mockedGenerateText.mock.calls[0]![0] as { prompt: string }).prompt;
    expect(prompt).toContain("CURRENT OWNERSHIP: R2,000");
    expect(prompt).toContain("CONTRIBUTION HISTORY");
    expect(prompt).toContain("(no primary contributions; secondary ownership may still exist)");
    expect(prompt).toContain("Not fair market value");
  });

  it("invalidates matching and batch hits after a sale", async () => {
    await call(getMatchScore, { authToken: "test", propertyId: 301 });
    const initialCalls = mocks.ai.mock.calls.length;
    await call(getMatchScore, { authToken: "test", propertyId: 301 });
    expect(mocks.ai).toHaveBeenCalledTimes(initialCalls);
    mocks.holdings.mockResolvedValue([]);
    expect(await call(getMatchScoresBatch, { authToken: "test", propertyIds: [301] })).toEqual([{ propertyId: 301, score: null, band: null }]);
    await call(getMatchScore, { authToken: "test", propertyId: 301 });
    expect(mocks.ai).toHaveBeenCalledTimes(initialCalls + 1);
  });

  it("uses a deterministic neutral score for invalid stored profiles", async () => {
    mocks.userFind.mockResolvedValue({ id: 91, appropriatenessAssessment: { ...profile, understandsCoolingOff: false }, appropriatenessCompletedAt: new Date(), ficaVerified: false });
    const result = await call(getMatchScore, { authToken: "test", propertyId: 302 });
    expect(result.score).toBe(50);
    expect(result.justification).toContain("acknowledge all key risks");
    expect(result.factors).toEqual([]);
    expect(result).not.toHaveProperty("profilePortfolioKey");
  });
});

vi.mock("ai", () => ({ generateText: vi.fn(async () => ({ text: "{}" })) }));
