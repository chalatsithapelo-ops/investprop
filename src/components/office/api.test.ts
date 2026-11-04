import { beforeEach, describe, expect, it, vi } from "vitest";
import { accountingExceptionsSchema, officeApi, propertyScenarioSchema, scenarioAssumptionsSchema, taxSourceDraftSchema, voiceReplySchema } from "./api";

const rpc = vi.hoisted(() => ({
  officePropertyScenario: { query: vi.fn() },
  officeAccountingExceptions: { query: vi.fn() },
  officeCreateTaxSource: { mutate: vi.fn() },
  officePublishTaxSource: { mutate: vi.fn() },
  officeVoiceTurn: { mutate: vi.fn() },
}));
vi.mock("~/trpc/react", () => ({ trpcClient: rpc }));

const stamp = "2026-11-04T10:00:00.000Z";
const assumptions = { rentChangePct: -10, vacancyRatePct: 12, operatingCostChangePct: 20, interestRateChangePp: 1.5 };
const point = { annualGrossRent: 120000, vacancyRatePct: 5, vacancyLoss: 6000, annualOperatingExpenses: null,
  noi: null, annualDebtService: null, annualCashFlow: null, dscr: null, interestRatePct: null };
const scenario = { propertyId: 7, title: "Recorded rental", strategy: "RENTAL", readOnly: true, evaluatedAt: stamp,
  assumptions, base: point, stressed: { ...point, annualGrossRent: 108000, vacancyRatePct: 12, vacancyLoss: 12960 },
  financing: { principal: null, principalSource: null, loanTermYears: null, recordedMonthlyDebtService: 0 },
  evidence: [{ id: "rental:1", kind: "RECORDED_RENTAL_BASELINE", asOf: null, createdAt: stamp, leaseStartDate: stamp, leaseEndDate: stamp, propertyUpdatedAt: stamp, values: { monthlyRent: 10000, vacancyRate: 5 } }],
  gaps: ["Missing cost evidence; debt not assumed zero."], unitNotes: ["ZAR annual totals; DSCR is a ratio."] };
const exceptions = { evaluatedAt: stamp, readOnly: true, complete: false,
  counts: { payouts: 1, holdings: 0, certificates: 0, contributions: 0 },
  exceptions: [{ code: "PAYOUT_UNALLOCATED_DIFFERENCE", propertyId: 7, message: "Review deductions, not a fraud conclusion.",
    observed: { unallocatedDifferenceCents: 125, allocatedFeeCents: null }, evidence: [{ id: "payout:1", kind: "PAID_PAYOUT", asOf: null }] }],
  gaps: ["Snapshot incomplete."], unitNotes: ["Differences are integer ZAR cents."] };
const draft = { title: "Dated source", url: "https://www.sars.gov.za/example", authority: "SARS" as const,
  effectiveFrom: stamp, applicability: "General research", content: "Exact reviewed content" };
const source = { ...draft, id: "source-1", version: 1, status: "DRAFT", effectiveTo: null, contentHash: "a".repeat(64),
  reviewedAt: null, createdAt: stamp, updatedAt: stamp };
const reviewDigest = "b".repeat(64);
const reply = { conversationId: "conversation-1", message: { id: "message-1", role: "assistant", content: "Complete text reply", evidence: null, createdAt: stamp }, transcript: "My spoken question" };

beforeEach(() => vi.resetAllMocks());

describe("typed office scenario boundary", () => {
  it("calls the scenario query with exact auth, property and user assumptions; preserves baseline and unknowns", async () => {
    rpc.officePropertyScenario.query.mockResolvedValue(scenario);
    const input = { authToken: "test-token", propertyId: 7, assumptions };
    const result = await officeApi.propertyScenario(input);
    expect(rpc.officePropertyScenario.query).toHaveBeenCalledWith(input);
    expect(result.base.vacancyRatePct).toBe(5);
    expect(result.stressed.vacancyRatePct).toBe(12);
    expect(result.base.annualCashFlow).toBeNull();
    expect(result.financing.recordedMonthlyDebtService).toBe(0);
    expect(result.gaps).toEqual(scenario.gaps);
  });
  it("requires explicit vacancy with no zero default", () => {
    expect(scenarioAssumptionsSchema.safeParse({ rentChangePct: 0, operatingCostChangePct: 0, interestRateChangePp: 0 }).success).toBe(false);
    expect(scenarioAssumptionsSchema.safeParse({ ...assumptions, vacancyRatePct: "" }).success).toBe(false);
    expect(scenarioAssumptionsSchema.parse({ ...assumptions, vacancyRatePct: 0 }).vacancyRatePct).toBe(0);
  });
  it.each([
    { rentChangePct: -101 }, { rentChangePct: 101 }, { vacancyRatePct: -1 }, { vacancyRatePct: 101 },
    { operatingCostChangePct: -101 }, { operatingCostChangePct: 201 }, { interestRateChangePp: -21 }, { interestRateChangePp: 21 }, { rentChangePct: Infinity },
  ])("rejects out-of-contract stress inputs %j", (change) => {
    expect(scenarioAssumptionsSchema.safeParse({ ...assumptions, ...change }).success).toBe(false);
  });
  it("rejects missing baseline metrics and unsupported strategies rather than fabricating a baseline", () => {
    expect(propertyScenarioSchema.safeParse({ ...scenario, base: { ...point, noi: undefined } }).success).toBe(false);
    expect(propertyScenarioSchema.safeParse({ ...scenario, strategy: "FLIP" }).success).toBe(false);
  });
  it("keeps server access/eligibility failures visible to callers", async () => {
    rpc.officePropertyScenario.query.mockRejectedValue(new Error("Only an unambiguous rental baseline is supported"));
    await expect(officeApi.propertyScenario({ authToken: "test-token", propertyId: 7, assumptions })).rejects.toThrow("unambiguous rental");
  });
  it("queries self-only accounting exceptions and preserves cents, nulls and incomplete status", async () => {
    rpc.officeAccountingExceptions.query.mockResolvedValue(exceptions);
    const result = await officeApi.accountingExceptions({ authToken: "test-token" });
    expect(rpc.officeAccountingExceptions.query).toHaveBeenCalledWith({ authToken: "test-token" });
    expect(result.complete).toBe(false);
    expect(result.exceptions[0]?.observed).toEqual({ unallocatedDifferenceCents: 125, allocatedFeeCents: null });
    expect(accountingExceptionsSchema.safeParse({ ...exceptions, counts: undefined }).success).toBe(false);
  });
});

describe("immutable tax source boundary", () => {
  it("creates a draft and retains exact returned content, version and review digest", async () => {
    rpc.officeCreateTaxSource.mutate.mockResolvedValue({ ...source, reviewDigest });
    const result = await officeApi.createTaxSource({ authToken: "admin-token", ...draft });
    expect(rpc.officeCreateTaxSource.mutate).toHaveBeenCalledWith({ authToken: "admin-token", ...draft });
    expect(result.content).toBe(draft.content);
    expect(result.reviewDigest).toBe(reviewDigest);
    expect(result.version).toBe(1);
    expect(result.status).toBe("DRAFT");
  });
  it("forwards the unchanged digest and explicit human attestation to publish", async () => {
    rpc.officePublishTaxSource.mutate.mockResolvedValue({ ...source, status: "APPROVED", reviewedAt: stamp });
    const input = { authToken: "admin-token", sourceId: source.id, version: 1, reviewDigest, reviewedPublishAttestation: true as const };
    expect((await officeApi.publishTaxSource(input)).status).toBe("APPROVED");
    expect(rpc.officePublishTaxSource.mutate).toHaveBeenCalledWith(input);
  });
  it("fails closed if a returned review digest is missing", async () => {
    rpc.officeCreateTaxSource.mutate.mockResolvedValue(source);
    await expect(officeApi.createTaxSource({ authToken: "admin-token", ...draft })).rejects.toThrow();
  });
  it("accepts the exact draft fields and rejects unknown fields or invalid dates", () => {
    expect(taxSourceDraftSchema.parse({ ...draft, previousSourceId: "source-previous" }).previousSourceId).toBe("source-previous");
    expect(taxSourceDraftSchema.safeParse({ ...draft, reviewedPublishAttestation: true }).success).toBe(false);
    expect(taxSourceDraftSchema.safeParse({ ...draft, effectiveFrom: "2026-11-04" }).success).toBe(false);
  });
  it("propagates publication conflicts without silently publishing a different version", async () => {
    rpc.officePublishTaxSource.mutate.mockRejectedValue(new Error("Draft changed concurrently; review again"));
    await expect(officeApi.publishTaxSource({ authToken: "admin-token", sourceId: source.id, version: 1, reviewDigest, reviewedPublishAttestation: true })).rejects.toThrow("review again");
  });
});

describe("voice text fallback", () => {
  it("retains speechError, transcript and complete text when synthesis is unavailable", async () => {
    const speechError = "Spoken playback unavailable; your complete answer is available as text.";
    rpc.officeVoiceTurn.mutate.mockResolvedValue({ ...reply, speechError });
    const result = await officeApi.voice({ authToken: "test-token", persona: "ACCOUNTANT", speechConsent: true, audioBase64: "dGVzdA==", mimeType: "audio/webm" });
    expect(result.speechError).toBe(speechError);
    expect(result.transcript).toBe(reply.transcript);
    expect(result.message.content).toBe(reply.message.content);
    expect(result.audioBase64).toBeUndefined();
  });
  it("also accepts successful optional MP3 output", () => {
    expect(voiceReplySchema.parse({ ...reply, audioBase64: "dGVzdA==", audioMimeType: "audio/mpeg" }).audioMimeType).toBe("audio/mpeg");
  });
});