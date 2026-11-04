import { z } from "zod";
import { trpcClient } from "~/trpc/react";

// Typed office procedures retain the shared authentication transport. Validate
// responses as well so incomplete evidence fails visibly rather than becoming zero.
const date = z.union([z.string(), z.date()]);
const nullableDate = date.nullish();
export const personaSchema = z.enum(["ACCOUNTANT", "TAX", "ASSET", "ADMIN"]);
export type Persona = z.infer<typeof personaSchema>;
export const taskKindSchema = z.enum([
  "REMINDER",
  "ACCOUNTANT_PACK",
  "OWNER_CHECKLIST",
]);
export type TaskKind = z.infer<typeof taskKindSchema>;
const identifier = z.union([z.string(), z.number()]);
const messageSchema = z.object({
  id: z.string(),
  role: z.string(),
  content: z.string(),
  evidence: z.unknown(),
  createdAt: date,
});
const chatSchema = z.object({
  conversationId: z.string(),
  message: messageSchema,
});
const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.string(),
  status: z.string(),
  parameters: z.unknown(),
  result: z.unknown(),
  expiresAt: nullableDate,
  createdAt: date,
  approvalDigest: z.string().nullish(),
});
export type OfficeTask = z.infer<typeof taskSchema>;
export type TaskParameters = {
  dueAt?: string;
  notes?: string;
  taxYear?: number;
  proposalId?: number;
};
type Auth = { authToken: string };
type Turn = Auth & {
  conversationId?: string;
  persona: Persona;
};
export type AudioMime = "audio/webm" | "audio/mp4" | "audio/wav" | "audio/ogg";

export const scenarioAssumptionsSchema = z.object({
  rentChangePct: z.number().finite().min(-100).max(100),
  vacancyRatePct: z.number().finite().min(0).max(100),
  operatingCostChangePct: z.number().finite().min(-100).max(200),
  interestRateChangePp: z.number().finite().min(-20).max(20),
}).strict();
export type ScenarioAssumptions = z.infer<typeof scenarioAssumptionsSchema>;
const finite = z.number().finite();
const scenarioPointSchema = z.object({
  annualGrossRent: finite, vacancyRatePct: finite, vacancyLoss: finite,
  annualOperatingExpenses: finite.nullable(), noi: finite.nullable(),
  annualDebtService: finite.nullable(), annualCashFlow: finite.nullable(),
  dscr: finite.nullable(), interestRatePct: finite.nullable(),
});
export const propertyScenarioSchema = z.object({
  propertyId: z.number().int().positive(), title: z.string(), strategy: z.literal("RENTAL"),
  readOnly: z.literal(true), evaluatedAt: date, assumptions: scenarioAssumptionsSchema,
  base: scenarioPointSchema, stressed: scenarioPointSchema,
  financing: z.object({ principal: finite.nullable(), principalSource: z.enum(["loanAmount", "bondAmount"]).nullable(),
    loanTermYears: finite.nullable(), recordedMonthlyDebtService: finite.nullable() }),
  evidence: z.array(z.object({ id: z.string(), kind: z.literal("RECORDED_RENTAL_BASELINE"), asOf: z.null(),
    createdAt: date, leaseStartDate: date, leaseEndDate: date, propertyUpdatedAt: date,
    values: z.record(z.string(), finite.nullable()) })),
  unitNotes: z.array(z.string()), gaps: z.array(z.string()),
});
export const accountingExceptionsSchema = z.object({
  readOnly: z.literal(true), evaluatedAt: date, complete: z.boolean(),
  counts: z.object({ payouts: z.number().int().nonnegative(), holdings: z.number().int().nonnegative(),
    certificates: z.number().int().nonnegative(), contributions: z.number().int().nonnegative() }),
  exceptions: z.array(z.object({
    code: z.enum(["PAID_MISSING_DATE", "PAYOUT_INVALID_AMOUNT", "PAYOUT_UNALLOCATED_DIFFERENCE", "CERTIFICATE_CLASS_AMBIGUOUS", "CERTIFICATE_HOLDING_DIFFERENCE", "CERTIFICATE_INVALID_SHARES", "PAID_CERTIFICATE_PENDING"]),
    propertyId: z.number().int().positive(), message: z.string(),
    evidence: z.array(z.object({ id: z.string(), kind: z.string(), asOf: nullableDate })),
    observed: z.record(z.string(), z.union([finite, z.string(), z.null()])),
  })), gaps: z.array(z.string()), unitNotes: z.array(z.string()),
});
export const taxSourceDraftSchema = z.object({
  title: z.string().trim().min(1).max(200), url: z.string().url().max(2000),
  authority: z.enum(["SARS", "GOV_ZA", "SAFLII"]),
  effectiveFrom: z.string().datetime({ offset: true }), effectiveTo: z.string().datetime({ offset: true }).optional(),
  applicability: z.string().trim().min(1).max(2000), content: z.string().trim().min(1).max(20000),
  previousSourceId: z.string().min(1).max(128).optional(),
}).strict();
export type TaxSourceDraft = z.infer<typeof taxSourceDraftSchema>;
const taxSourceSchema = z.object({
  id: z.string(), version: z.number().int().positive(), title: z.string(), url: z.string(),
  authority: z.enum(["SARS", "GOV_ZA", "SAFLII"]), effectiveFrom: date, effectiveTo: nullableDate,
  applicability: z.string(), content: z.string(), contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["DRAFT", "APPROVED", "RETIRED"]), reviewedAt: nullableDate, createdAt: date, updatedAt: date,
});
export const taxSourceReviewSchema = taxSourceSchema.extend({ status: z.literal("DRAFT"), reviewDigest: z.string().regex(/^[a-f0-9]{64}$/) });
export type TaxSourceReview = z.infer<typeof taxSourceReviewSchema>;
export const voiceReplySchema = chatSchema.extend({
  transcript: z.string(), audioBase64: z.string().optional(),
  audioMimeType: z.string().optional(), speechError: z.string().optional(),
});

export const officeApi = {
  overview: async (input: Auth) =>
    z.object({
      capabilities: z.object({
        textAI: z.boolean(),
        voice: z.boolean(),
        regulatedActions: z.literal(false),
      }),
      holdings: z.array(z.object({
        propertyId: identifier,
        title: z.string(),
        shares: z.number(),
        basisValue: z.number(),
        basisLabel: z.string(),
      })),
      paidDistributions: z.object({
        gross: z.number(), net: z.number(), withheld: z.number(), count: z.number(),
      }),
      documents: z.array(z.object({
        id: identifier, title: z.string(), documentType: z.string(),
        propertyId: identifier.nullish(),
      })),
      proposals: z.array(z.object({ id: identifier, title: z.string(), status: z.string() })),
      evidence: z.array(z.object({
        id: identifier, label: z.string(), asOf: nullableDate, kind: z.string(),
      })),
      gaps: z.array(z.string()),
    }).parse(await trpcClient.officeOverview.query(input)),
  conversations: async (input: Auth) =>
    z.array(z.object({ id: z.string(), title: z.string(), createdAt: date }))
      .parse(await trpcClient.officeConversations.query(input)),
  conversation: async (input: Auth & { conversationId: string }) =>
    z.object({ id: z.string(), title: z.string(), messages: z.array(messageSchema) })
      .parse(await trpcClient.officeConversation.query(input)),
  chat: async (input: Turn & { message: string }) =>
    chatSchema.parse(await trpcClient.officeChat.mutate(input)),
  tasks: async (input: Auth) =>
    z.array(taskSchema).parse(await trpcClient.officeTasks.query(input)),
  prepare: async (input: Auth & { kind: TaskKind; title: string; parameters: TaskParameters }) =>
    taskSchema.parse(await trpcClient.officePrepareTask.mutate(input)),
  approve: async (input: Auth & { taskId: string; approvalDigest: string }) =>
    taskSchema.parse(await trpcClient.officeApproveTask.mutate(input)),
  cancel: async (input: Auth & { taskId: string }) =>
    taskSchema.parse(await trpcClient.officeCancelTask.mutate(input)),
  taxSources: async (input: Auth) =>
    z.array(z.object({
      id: identifier, title: z.string(), url: z.string(), authority: z.string(),
      effectiveFrom: nullableDate, effectiveTo: nullableDate,
      reviewedAt: nullableDate, status: z.string(),
      version: z.number().int().positive(), applicability: z.string(), contentHash: z.string(),
    })).parse(await trpcClient.officeTaxSources.query(input)),
  propertyScenario: async (input: Auth & { propertyId: number; assumptions: ScenarioAssumptions }) =>
    propertyScenarioSchema.parse(await trpcClient.officePropertyScenario.query(input)),
  accountingExceptions: async (input: Auth) =>
    accountingExceptionsSchema.parse(await trpcClient.officeAccountingExceptions.query(input)),
  createTaxSource: async ({ authToken, ...draft }: Auth & TaxSourceDraft) =>
    taxSourceReviewSchema.parse(await trpcClient.officeCreateTaxSource.mutate({ authToken, ...taxSourceDraftSchema.parse(draft) })),
  publishTaxSource: async (input: Auth & { sourceId: string; version: number; reviewDigest: string; reviewedPublishAttestation: true }) =>
    taxSourceSchema.parse(await trpcClient.officePublishTaxSource.mutate(input)),
  voice: async (input: Turn & {
    speechConsent: true; audioBase64: string; mimeType: AudioMime;
  }) => voiceReplySchema.parse(await trpcClient.officeVoiceTurn.mutate(input)),
  voiceAgentStatus: async (input: Auth) =>
    z.object({
      available: z.boolean(),
      capabilities: z.object({
        textAI: z.boolean(),
        voice: z.boolean(),
        regulatedActions: z.literal(false),
      }),
    }).parse(await trpcClient.officeVoiceAgentStatus.query(input)),
  voiceAgentSession: async (input: Auth) =>
    z.object({
      url: z.string().url(),
      token: z.string().min(1),
      roomName: z.string().min(1),
      identity: z.string().min(1),
      expiresInSeconds: z.number().int().positive(),
    }).parse(await trpcClient.officeVoiceAgentSession.mutate(input)),
};

export function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError) {
    return `Office response does not match the integration contract: ${error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`;
  }
  return error instanceof Error ? error.message : "Office request failed. Please try again.";
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "Not supplied";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Invalid source date" : parsed.toLocaleString("en-ZA", {
    dateStyle: "medium", timeStyle: "short",
  });
}

export function jsonPreview(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "No data supplied";
}

export function safeSourceUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}
