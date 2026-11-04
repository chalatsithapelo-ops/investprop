import { generateObject } from "ai";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "~/server/db";
import { requireFeature } from "~/server/subscriptions/subscription-service";
import { getModel, getModelId, runAIWithGuard } from "~/server/ai/client";
import { loadOfficeContext, officeCapabilities } from "./context";
import { assertOfficeUser, HISTORY_LIMIT, personas, redactForModel, type OfficeUser } from "./policy";
import { assistantResponseSchema, specialistPrompt, validateAssistantResponse } from "./prompts";

type Loaded = Awaited<ReturnType<typeof loadOfficeContext>>;
const active = new Set<number>();
const requests = new Map<number, number[]>();

/** Per-process cap also covers no-provider requests and simultaneous turns. */
function reserveTurn(userId: number, now: number) {
  for (const [id, times] of requests) if (!times.some((time) => now - time < 3600000)) requests.delete(id);
  const times = (requests.get(userId) ?? []).filter((time) => now - time < 3600000);
  if (active.has(userId) || times.filter((time) => now - time < 60000).length >= 6 || times.length >= 60 || requests.size >= 10000 && !requests.has(userId)) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Office request cap reached or a turn is already in progress; try later" });
  }
  requests.set(userId, [...times, now]); active.add(userId);
}

export async function ownConversation(userId: number, conversationId: string) {
  const conversation = await db.officeConversation.findFirst({ where: { id: conversationId, userId } });
  if (!conversation) throw new TRPCError({ code: "NOT_FOUND", message: "Office conversation not found" });
  return conversation;
}

/** Drop whole records, never slice serialized JSON or silently hide gaps. */
export function modelContext(context: Loaded, maxChars = 32000) {
  const gaps = [...context.overview.gaps];
  const bounded: Record<string, unknown[]> = {};
  let used = JSON.stringify(gaps).length + 1000;
  let metadataTruncated = false;
  const buckets = {
    holdings: context.overview.holdings, paidDistributions: [context.overview.paidDistributions],
    documents: context.overview.documents, proposals: context.overview.proposals,
    evidence: context.overview.evidence,
    sources: context.sources.map((source) => ({ ...source, content: source.content.slice(0, 2000), contentTruncated: source.content.length > 2000 })),
  };
  for (const [key, rows] of Object.entries(buckets)) {
    bounded[key] = [];
    for (const row of rows) {
      // Recursive JSON string redaction also protects all descriptive metadata.
      const cleaned: unknown = JSON.parse(JSON.stringify(row, (_key, value: unknown) => {
        if (typeof value !== "string") return value;
        if (value.length > 2000) metadataTruncated = true;
        return redactForModel(value).slice(0, 2000);
      }));
      const length = JSON.stringify(cleaned).length + 2;
      if (used + length > maxChars - 2000) { gaps.push(`${key} omitted from model context due to request budget; this response is incomplete.`); break; }
      bounded[key].push(cleaned); used += length;
    }
  }
  if (metadataTruncated) gaps.push("Descriptive evidence metadata truncated to 2000 characters; this context is incomplete.");
  if (context.sources.some((source) => source.content.length > 2000)) gaps.push("Reviewed source text truncated to 2000 characters; consult the complete reviewed material with a professional.");
  const evidence = bounded.evidence as { id: string }[];
  // Source IDs are allowed only when that source's text was actually supplied.
  const sourceIds = new Set((bounded.sources as { id: string }[]).map((source) => `tax-source:${source.id}`));
  const allowedIds = new Set(evidence.map((row) => row.id).filter((id) => !id.startsWith("tax-source:") || sourceIds.has(id)));
  return { text: JSON.stringify({ ...bounded, gaps }), allowedIds, gaps };
}

export function deterministicReply(context: Loaded, reason: string) {
  const sums = context.overview.paidDistributions;
  return { content: `${reason}\nGrounded platform overview (not a generated answer): ${context.overview.holdings.length} recorded property positions; ${sums.count} PAID payouts. Recorded gross R${sums.gross.toFixed(2)}, withheld R${sums.withheld.toFixed(2)}, net R${sums.net.toFixed(2)}. ${context.overview.documents.length} authorised document metadata records; ${context.overview.proposals.length} own proposals. Acquisition cost is not market value. No task was executed.\n\nEvidence gaps:\n${context.overview.gaps.map((gap) => `- ${gap}`).join("\n")}`, evidenceIds: [] as string[] };
}

export async function chatOffice(user: OfficeUser, input: { conversationId?: string; persona: z.infer<typeof personas>; message: string }) {
  assertOfficeUser(user);
  const persona = personas.parse(input.persona);
  const message = z.string().trim().min(1).max(2000).parse(input.message);
  await requireFeature(user, user.role === "PROPERTY_OWNER" ? "SELLER_AI_VALUATION" : "AI_COPILOT");
  // No creation, context loading or model call until supplied ownership is verified.
  const existing = input.conversationId ? await ownConversation(user.id, input.conversationId) : null;
  reserveTurn(user.id, Date.now());
  try {
    const conversation = existing ?? await db.officeConversation.create({ data: { userId: user.id, title: redactForModel(message).slice(0, 160) } });
    const [context, history] = await Promise.all([
      loadOfficeContext(user), db.officeMessage.findMany({ where: { conversationId: conversation.id, conversation: { userId: user.id } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: HISTORY_LIMIT + 1 }),
    ]);
    const supplied = modelContext(context);
    if (history.length > 12) supplied.gaps.push("Conversation history truncated to the latest 12 messages.");
    if (history.slice(0, 12).some((row) => row.content.length > 1000)) supplied.gaps.push("Conversation message text truncated to 1000 characters per message.");
    let mode = "DETERMINISTIC";
    let response = deterministicReply(context, "Text AI is not configured.");
    if (officeCapabilities().textAI) {
      try {
        const generated = await runAIWithGuard({ userId: user.id, feature: "chat", model: getModelId("cheap"), metadata: { office: true, persona },
          run: () => generateObject({ model: getModel("cheap"), schema: assistantResponseSchema,
            system: specialistPrompt(persona), maxTokens: 2500, maxRetries: 0, temperature: 0,
            abortSignal: AbortSignal.timeout(30000),
            // History is enclosed as untrusted data, never elevated to system instructions.
            prompt: JSON.stringify({ context: { ...(JSON.parse(supplied.text) as Record<string, unknown>), gaps: supplied.gaps },
              history: history.slice(0, 12).reverse().map((row) => ({ role: row.role, content: redactForModel(row.content).slice(0, 1000) })),
              message: redactForModel(message) }), }),
          extractUsage: (result) => ({ promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens }),
        });
        response = validateAssistantResponse(generated.object, supplied.allowedIds); mode = "AI";
      } catch {
        response = deterministicReply(context, "Text AI was unavailable or its response failed evidence validation. No generated answer is shown.");
      }
    }
    if (mode === "AI") response.content += `\n\nEvidence gaps:\n${supplied.gaps.map((gap) => `- ${gap}`).join("\n")}`;
    const saved = await db.$transaction(async (tx) => {
      // Recheck ownership at persistence too, with both messages in one transaction.
      if (!await tx.officeConversation.findFirst({ where: { id: conversation.id, userId: user.id } })) throw new TRPCError({ code: "NOT_FOUND", message: "Office conversation not found" });
      await tx.officeMessage.create({ data: { conversationId: conversation.id, role: "user", content: redactForModel(message), evidence: { persona } } });
      const assistant = await tx.officeMessage.create({ data: { conversationId: conversation.id, role: "assistant", content: response.content, evidence: { persona, evidenceIds: response.evidenceIds, mode } } });
      await tx.officeConversation.updateMany({ where: { id: conversation.id, userId: user.id }, data: { updatedAt: new Date() } });
      return assistant;
    });
    return { conversationId: conversation.id, message: saved, content: saved.content, evidenceIds: response.evidenceIds, mode, capabilities: officeCapabilities() };
  } finally { active.delete(user.id); }
}