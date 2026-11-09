/**
 * Office agent action bridge.
 *   POST /api/office-agent/execute
 *
 * The Python voice-agent worker calls this endpoint to execute office
 * functionality on behalf of a user. Two independent checks apply:
 *   1. `x-agent-secret` must equal AGENT_SHARED_SECRET — gates *which process*
 *      may reach the bridge (the agent worker).
 *   2. `Authorization: Bearer <jwt>` must be the caller's own office JWT — gates
 *      *whose data* is read. Every action runs as that user through the same
 *      functions the tRPC procedures use, so all scoping, feature gating and
 *      frozen task-digest approval are preserved.
 *
 * The agent never receives secrets and cannot widen a user's scope: it is a
 * thin, authenticated relay to the existing office domain functions.
 */

import { defineEventHandler, toWebRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { env } from "~/server/env";
import { db } from "~/server/db";
import { timingSafeEqualStr } from "~/server/utils/secret-compare";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { requireFeature } from "~/server/subscriptions/subscription-service";
import {
  assertOfficeUser,
  personas,
  taskKinds,
  parametersSchema,
  OFFICE_LIMIT,
  HISTORY_LIMIT,
} from "~/server/office/policy";
import { loadOfficeContext, sourceMetadataSelect } from "~/server/office/context";
import { chatOffice, ownConversation } from "~/server/office/chat";
import { prepareOfficeTask, approveOfficeTask, cancelOfficeTask } from "~/server/office/tasks";
import { listActionCatalog, runReadAction, prepareOfficeAction, confirmOfficeAction } from "~/server/office/actions";
import { recordVoiceSession } from "~/server/office/voice-telemetry";
import { requestHandoff } from "~/server/office/handoff";
import { analyzeOfficeDocument } from "~/server/office/documents";
import { VOICE_LANGUAGES, normalizeVoiceLanguage } from "~/server/office/voice-language";
import { scenarioAssumptionsSchema, loadPropertyScenario, loadAccountingExceptions } from "~/server/office/scenarios";import {
  loadPortfolioValuation,
  loadWalletSummary,
  loadPendingItems,
  loadOpenOpportunities,
  loadGovernanceItems,
  loadComplianceStatus,
  loadMarketplaceActivity,
  browseListings,
  loadListingDetail,
  estimateListingOwnership,
  buildAdvisorBriefing,
  estimateTax,
  loadMemory,
  saveMemory,
} from "~/server/office/advisor";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function statusForTrpcError(code: TRPCError["code"]): number {
  switch (code) {
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    case "TOO_MANY_REQUESTS":
      return 429;
    case "PRECONDITION_FAILED":
      return 412;
    case "BAD_GATEWAY":
      return 502;
    case "BAD_REQUEST":
      return 400;
    default:
      return 400;
  }
}

// One discriminated action per office capability the agent may invoke.
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("overview") }),
  z.object({
    action: z.literal("chat"),
    persona: personas,
    message: z.string().trim().min(1).max(2000),
    conversationId: z.string().min(1).max(128).optional(),
  }),
  z.object({ action: z.literal("listConversations") }),
  z.object({ action: z.literal("getConversation"), conversationId: z.string().min(1).max(128) }),
  z.object({ action: z.literal("listTasks") }),
  z.object({
    action: z.literal("prepareTask"),
    kind: taskKinds,
    title: z.string().trim().min(1).max(160),
    parameters: parametersSchema,
  }),
  z.object({
    action: z.literal("approveTask"),
    taskId: z.string().min(1).max(128),
    approvalDigest: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.object({ action: z.literal("cancelTask"), taskId: z.string().min(1).max(128) }),
  z.object({
    action: z.literal("propertyScenario"),
    propertyId: z.number().int().positive(),
    assumptions: scenarioAssumptionsSchema,
  }),
  z.object({ action: z.literal("accountingExceptions") }),
  z.object({ action: z.literal("taxSources") }),
  z.object({ action: z.literal("portfolioValuation") }),
  z.object({ action: z.literal("wallet") }),
  z.object({ action: z.literal("pendingItems") }),
  z.object({ action: z.literal("opportunities") }),
  z.object({ action: z.literal("governance") }),
  z.object({ action: z.literal("complianceStatus") }),
  z.object({ action: z.literal("marketplace") }),
  z.object({
    action: z.literal("browseListings"),
    query: z.string().trim().min(1).max(120).optional(),
    propertyType: z.enum(["flip", "rental", "development"]).optional(),
    city: z.string().trim().min(1).max(120).optional(),
    investmentStatus: z.enum(["PLANNING", "RAISING_FUNDS", "FUNDED", "PROJECT_STARTED", "COMPLETED"]).optional(),
    limit: z.number().int().min(1).max(25).optional(),
  }),
  z.object({ action: z.literal("listingDetail"), propertyId: z.number().int().positive() }),
  z.object({
    action: z.literal("estimateOwnership"),
    propertyId: z.number().int().positive(),
    amount: z.number().positive().max(1_000_000_000),
  }),
  z.object({ action: z.literal("briefing") }),
  z.object({
    action: z.literal("taxEstimate"),
    taxYear: z.number().int().min(2000).max(2200),
    marginalRatePct: z.number().min(0).max(45).optional(),
    ageUnder65: z.boolean().optional(),
  }),
  z.object({ action: z.literal("getMemory") }),
  z.object({ action: z.literal("saveMemory"), text: z.string().trim().min(1).max(280) }),
  // Per-call cost & ops telemetry posted by the worker on teardown (admin-only view).
  z.object({
    action: z.literal("logVoiceSession"),
    provider: z.string().trim().min(1).max(40),
    model: z.string().trim().min(1).max(120),
    durationSeconds: z.number().int().min(0).max(36_000),
    toolCalls: z.number().int().min(0).max(100_000),
    toolErrors: z.number().int().min(0).max(100_000),
    sessionErrors: z.number().int().min(0).max(100_000),
    userTurns: z.number().int().min(0).max(100_000).optional(),
    agentTurns: z.number().int().min(0).max(100_000).optional(),
  }),
  // Log a human-handoff request for the team (non-mutating; notifies admins).
  z.object({
    action: z.literal("requestHandoff"),
    reason: z.string().trim().min(1).max(120),
    summary: z.string().trim().min(1).max(1500),
  }),
  // Plain-language analysis of member-supplied document text (persists a task).
  z.object({
    action: z.literal("analyzeDocument"),
    title: z.string().trim().min(1).max(160),
    kind: z.string().trim().min(1).max(60).optional(),
    text: z.string().trim().min(40).max(40000),
  }),
  // Remember the member's preferred spoken language for the voice agent.
  z.object({
    action: z.literal("setVoiceLanguage"),
    language: z.string().trim().min(1).max(40),
  }),
  // Generic capability registry — exposes every member-facing tRPC procedure.
  z.object({ action: z.literal("listActions") }),
  z.object({
    action: z.literal("runRead"),
    name: z.string().trim().min(1).max(80),
    args: z.record(z.unknown()).optional(),
  }),
  z.object({
    action: z.literal("prepareAction"),
    name: z.string().trim().min(1).max(80),
    args: z.record(z.unknown()).optional(),
  }),
  z.object({
    action: z.literal("confirmAction"),
    taskId: z.string().min(1).max(128),
    approvalDigest: z.string().regex(/^[a-f0-9]{64}$/),
  }),
]);

export default defineEventHandler(async (event) => {
  const request = toWebRequest(event);
  if (!request) return json({ ok: false, reason: "no request" }, 400);
  if (request.method !== "POST") return json({ ok: false, reason: "method not allowed" }, 405);

  const secret = env.AGENT_SHARED_SECRET?.trim();
  if (!secret) return json({ ok: false, reason: "agent bridge not configured" }, 503);

  const presented = request.headers.get("x-agent-secret")?.trim() ?? "";
  if (!timingSafeEqualStr(presented, secret)) {
    return json({ ok: false, reason: "unauthorized agent" }, 401);
  }

  const authToken = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!authToken) return json({ ok: false, reason: "missing user token" }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, reason: "invalid JSON body" }, 400);
  }

  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, reason: "invalid action", issues: parsed.error.issues }, 400);
  }
  const input = parsed.data;

  try {
    const user = await getAuthenticatedUser(authToken);
    assertOfficeUser(user);
    await requireFeature(user, user.role === "PROPERTY_OWNER" ? "SELLER_AI_VALUATION" : "AI_COPILOT");

    switch (input.action) {
      case "overview": {
        const context = await loadOfficeContext(user);
        return json({ ok: true, result: context.overview }, 200);
      }
      case "chat": {
        if (input.conversationId) await ownConversation(user.id, input.conversationId);
        const reply = await chatOffice(user, {
          conversationId: input.conversationId,
          persona: input.persona,
          message: input.message,
        });
        return json({ ok: true, result: reply }, 200);
      }
      case "listConversations": {
        const rows = await db.officeConversation.findMany({
          where: { userId: user.id },
          select: { id: true, title: true, createdAt: true, updatedAt: true },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take: HISTORY_LIMIT,
        });
        return json({ ok: true, result: rows }, 200);
      }
      case "getConversation": {
        const conversation = await ownConversation(user.id, input.conversationId);
        const rows = await db.officeMessage.findMany({
          where: { conversationId: conversation.id, conversation: { userId: user.id } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: HISTORY_LIMIT + 1,
        });
        return json(
          { ok: true, result: { ...conversation, messages: rows.slice(0, HISTORY_LIMIT).reverse(), truncated: rows.length > HISTORY_LIMIT } },
          200,
        );
      }
      case "listTasks": {
        const rows = await db.officeTask.findMany({
          where: { userId: user.id },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: OFFICE_LIMIT,
        });
        return json({ ok: true, result: rows }, 200);
      }
      case "prepareTask": {
        const task = await prepareOfficeTask(user, {
          kind: input.kind,
          title: input.title,
          parameters: input.parameters,
        });
        return json({ ok: true, result: task }, 200);
      }
      case "approveTask": {
        const task = await approveOfficeTask(user, input.taskId, input.approvalDigest);
        return json({ ok: true, result: task }, 200);
      }
      case "cancelTask": {
        const task = await cancelOfficeTask(user, input.taskId);
        return json({ ok: true, result: task }, 200);
      }
      case "propertyScenario": {
        const result = await loadPropertyScenario(user, input.propertyId, input.assumptions);
        return json({ ok: true, result }, 200);
      }
      case "accountingExceptions": {
        const result = await loadAccountingExceptions(user);
        return json({ ok: true, result }, 200);
      }
      case "taxSources": {
        const rows = await db.officeTaxSource.findMany({
          where: user.role === "ADMIN" ? {} : { status: "APPROVED", reviewedAt: { not: null } },
          select: sourceMetadataSelect,
          orderBy: [{ effectiveFrom: "desc" }, { id: "asc" }],
          take: OFFICE_LIMIT,
        });
        return json({ ok: true, result: rows }, 200);
      }
      case "portfolioValuation":
        return json({ ok: true, result: await loadPortfolioValuation(user) }, 200);
      case "wallet":
        return json({ ok: true, result: await loadWalletSummary(user) }, 200);
      case "pendingItems":
        return json({ ok: true, result: await loadPendingItems(user) }, 200);
      case "opportunities":
        return json({ ok: true, result: await loadOpenOpportunities(user) }, 200);
      case "governance":
        return json({ ok: true, result: await loadGovernanceItems(user) }, 200);
      case "complianceStatus":
        return json({ ok: true, result: await loadComplianceStatus(user) }, 200);
      case "marketplace":
        return json({ ok: true, result: await loadMarketplaceActivity(user) }, 200);
      case "browseListings":
        return json({ ok: true, result: await browseListings(user, { query: input.query, type: input.propertyType, city: input.city, investmentStatus: input.investmentStatus, limit: input.limit }) }, 200);
      case "listingDetail":
        return json({ ok: true, result: await loadListingDetail(user, input.propertyId) }, 200);
      case "estimateOwnership":
        return json({ ok: true, result: await estimateListingOwnership(user, input.propertyId, input.amount) }, 200);
      case "briefing":
        return json({ ok: true, result: await buildAdvisorBriefing(user) }, 200);
      case "taxEstimate":
        return json({ ok: true, result: await estimateTax(user, { taxYear: input.taxYear, marginalRatePct: input.marginalRatePct, ageUnder65: input.ageUnder65 }) }, 200);
      case "getMemory":
        return json({ ok: true, result: await loadMemory(user) }, 200);
      case "saveMemory":
        return json({ ok: true, result: await saveMemory(user, input.text) }, 200);
      case "logVoiceSession":
        await recordVoiceSession(user, {
          provider: input.provider,
          model: input.model,
          durationSeconds: input.durationSeconds,
          toolCalls: input.toolCalls,
          toolErrors: input.toolErrors,
          sessionErrors: input.sessionErrors,
          userTurns: input.userTurns,
          agentTurns: input.agentTurns,
        });
        return json({ ok: true, result: { recorded: true } }, 200);
      case "requestHandoff":
        return json({ ok: true, result: await requestHandoff(user, { reason: input.reason, summary: input.summary }) }, 200);
      case "analyzeDocument":
        return json({ ok: true, result: await analyzeOfficeDocument(user, { title: input.title, kind: input.kind, text: input.text }) }, 200);
      case "setVoiceLanguage": {
        const language = normalizeVoiceLanguage(input.language);
        await db.user.update({ where: { id: user.id }, data: { voiceLanguage: language } });
        return json({ ok: true, result: { language, supported: VOICE_LANGUAGES } }, 200);
      }
      case "listActions":
        return json({ ok: true, result: listActionCatalog() }, 200);
      case "runRead":
        return json({ ok: true, result: await runReadAction(user, authToken, input.name, input.args) }, 200);
      case "prepareAction":
        return json({ ok: true, result: await prepareOfficeAction(user, input.name, input.args) }, 200);
      case "confirmAction":
        return json({ ok: true, result: await confirmOfficeAction(user, authToken, input.taskId, input.approvalDigest) }, 200);
    }
  } catch (error) {
    if (error instanceof TRPCError) {
      return json({ ok: false, reason: error.message, code: error.code }, statusForTrpcError(error.code));
    }
    return json(
      { ok: false, reason: error instanceof Error ? error.message : "action failed" },
      500,
    );
  }
});
