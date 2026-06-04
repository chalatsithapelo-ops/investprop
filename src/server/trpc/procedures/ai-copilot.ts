/**
 * AI Strategy 1.1 — Conversational Deal Co-Pilot
 *
 * Per-property RAG chat. Investor asks plain-language questions about an
 * opportunity ("worst-case IRR if 6 months late?", "explain cooling-off",
 * "how does this compare to the other Sandton flip?") and gets a grounded
 * answer that cites the property data + comparables + legal docs the
 * platform already knows about.
 *
 * History is persisted to PropertyChatMessage so the same investor sees
 * their thread next visit.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { generateText } from "ai";
import { db } from "~/server/db";
import { baseProcedure, createTRPCRouter } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { getModel, getModelId, runAIWithGuard } from "~/server/ai/client";
import { buildPropertyContext, findComparables } from "~/server/ai/property-context";

const MAX_HISTORY = 12; // turns of context sent to model

export const propertyChatHistory = baseProcedure
  .input(z.object({ authToken: z.string(), propertyId: z.number() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const messages = await db.propertyChatMessage.findMany({
      where: { propertyId: input.propertyId, userId: user.id },
      orderBy: { createdAt: "asc" },
      take: 60,
    });
    return messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    }));
  });

export const chatAboutProperty = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      message: z.string().min(1).max(2000),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    const ctx = await buildPropertyContext(input.propertyId, {
      includeFinancials: true,
      includeMilestones: true,
      includeContributions: true,
      includeLegalDocs: true,
      includeRisks: true,
    });
    if (!ctx) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });
    }

    const comps = await findComparables(input.propertyId, 4);
    const compsText =
      comps.length > 0
        ? `\n\nCOMPARABLES (other published ${ctx.propertyType} opportunities on this platform):\n` +
          comps
            .map(
              (c) =>
                `- #${c.id} ${c.title} (${c.city}) — listed R${Math.round(c.price).toLocaleString()} | ${c.metrics}`
            )
            .join("\n")
        : "";

    // Persist user message
    await db.propertyChatMessage.create({
      data: {
        propertyId: input.propertyId,
        userId: user.id,
        role: "user",
        content: input.message,
      },
    });

    // Fetch recent history
    const prior = await db.propertyChatMessage.findMany({
      where: { propertyId: input.propertyId, userId: user.id },
      orderBy: { createdAt: "desc" },
      take: MAX_HISTORY,
    });
    prior.reverse();

    const systemPrompt = `You are Investprop's deal co-pilot, helping a South African retail investor understand a specific fractional-ownership opportunity on https://investprop.io.

Your job:
- Answer the investor's questions using ONLY the property data, comparables, milestones, legal docs and risks provided below. If asked something not covered, say so plainly and recommend the right next step (e.g. "ask the sponsor", "review the OTP doc").
- Be direct and concise — under 200 words unless they ask for more.
- Explain financial jargon in plain English (cap rate, DSCR, IRR, cooling-off, Sec 96 prospectus). Use Rand (R) and South African context.
- When discussing risk or returns, be balanced: surface downsides, not just upsides.
- NEVER give personalised financial, tax or legal advice. You provide research and education only. If a question crosses into advice territory, redirect: "That's a question for an FSCA-licensed advisor."
- Format with short paragraphs and bullets where helpful. Use markdown.

PROPERTY DATA:
${ctx.text}
${compsText}`;

    const messages = prior.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

    const result = await runAIWithGuard({
      userId: user.id,
      feature: "chat",
      model: getModelId("cheap"),
      metadata: { propertyId: input.propertyId },
      run: () =>
        generateText({
          model: getModel("cheap"),
          system: systemPrompt,
          messages,
        }),
      extractUsage: (r) => ({
        promptTokens: r.usage?.promptTokens,
        completionTokens: r.usage?.completionTokens,
      }),
    });

    const reply = (result.text ?? "").trim() || "I couldn't generate a response. Please try again.";

    const saved = await db.propertyChatMessage.create({
      data: {
        propertyId: input.propertyId,
        userId: user.id,
        role: "assistant",
        content: reply,
      },
    });

    return {
      id: saved.id,
      role: "assistant" as const,
      content: reply,
      createdAt: saved.createdAt,
    };
  });

export const clearPropertyChat = baseProcedure
  .input(z.object({ authToken: z.string(), propertyId: z.number() }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    await db.propertyChatMessage.deleteMany({
      where: { propertyId: input.propertyId, userId: user.id },
    });
    return { ok: true };
  });

export const aiCopilotRouter = createTRPCRouter({
  propertyChatHistory,
  chatAboutProperty,
  clearPropertyChat,
});
