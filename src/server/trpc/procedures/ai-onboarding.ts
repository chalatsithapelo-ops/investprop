/**
 * AI Strategy 3.1 — Conversational Onboarding (Voice-ready)
 *
 * MVP: Chat-based onboarding wizard. The LLM asks the FSCA appropriateness
 * questions one at a time, in plain South African English, adapting follow-ups
 * to user answers. Final structured JSON is written to
 * User.appropriatenessAssessment.
 *
 * Voice (Whisper/Realtime) is a thin layer on top: client transcribes speech
 * locally / via browser API, sends text to `continueOnboardingSession`,
 * speaks the response back. No server-side audio handling in this MVP.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { generateText } from "ai";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { getModel, getModelId, runAIWithGuard, safeParseJson } from "~/server/ai/client";

const SYSTEM_PROMPT = `You are Investprop's onboarding co-pilot. You guide a new South African retail investor through the FSCA-aligned appropriateness questionnaire in a warm, conversational way.

You MUST collect ALL of these fields before completing:
  - experience: one of "NONE" | "SOME" | "EXPERIENCED" (their property/equity investing background)
  - monthlyIncomeBand: one of "U10K" | "10_25K" | "25_50K" | "50_100K" | "100K_PLUS" (Rand)
  - netWorthBand: one of "U100K" | "100_500K" | "500K_2M" | "2M_PLUS" (Rand, excl. primary residence)
  - riskTolerance: one of "LOW" | "MEDIUM" | "HIGH"
  - illiquidityAck: boolean — they understand fractional property is illiquid (no easy resale)
  - lossAck: boolean — they understand they can lose their entire investment
  - notAdviceAck: boolean — they understand Investprop does NOT provide financial advice

Rules:
- Ask ONE question per turn. Keep it under 2 sentences. Use plain English. South African spelling.
- If user gives a free-text answer (e.g. "I earn about R30k a month"), interpret it into the structured value yourself — don't make them recite codes.
- If user seems confused, briefly explain why the question matters then re-ask.
- After all 7 fields are collected, ask: "Ready to submit?". If yes, return the COMPLETE JSON.

Return ONLY JSON on EVERY turn, in this exact shape:
{
  "message": "<your next question or confirmation, what to say to the user>",
  "collected": {
    "experience": "...",
    "monthlyIncomeBand": "...",
    "netWorthBand": "...",
    "riskTolerance": "...",
    "illiquidityAck": true/false,
    "lossAck": true/false,
    "notAdviceAck": true/false
  },
  "complete": true | false
}
Set values to null if not yet collected. Set complete=true ONLY when ALL 7 are non-null AND the user has confirmed submission.`;

interface OnboardingTurn {
  message: string;
  collected: Record<string, string | boolean | null>;
  complete: boolean;
}

export const startOnboardingSession = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    const result = await runAIWithGuard({
      userId: user.id,
      feature: "onboarding",
      model: getModelId("cheap"),
      metadata: { phase: "start" },
      run: () =>
        generateText({
          model: getModel("cheap"),
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: "Hi, I'd like to start the onboarding." }],
        }),
      extractUsage: (r) => ({ promptTokens: r.usage?.promptTokens, completionTokens: r.usage?.completionTokens }),
    });

    const parsed = safeParseJson<OnboardingTurn>(result.text) ?? {
      message: "Welcome! Let's start. How much experience do you have with property or share investing?",
      collected: {},
      complete: false,
    };
    return parsed;
  });

export const continueOnboardingSession = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).max(40),
      userMessage: z.string().min(1).max(2000),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    const messages = [
      ...input.history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: input.userMessage },
    ];

    const result = await runAIWithGuard({
      userId: user.id,
      feature: "onboarding",
      model: getModelId("cheap"),
      metadata: { phase: "continue", turn: input.history.length + 1 },
      run: () => generateText({ model: getModel("cheap"), system: SYSTEM_PROMPT, messages }),
      extractUsage: (r) => ({ promptTokens: r.usage?.promptTokens, completionTokens: r.usage?.completionTokens }),
    });

    const parsed = safeParseJson<OnboardingTurn>(result.text);
    if (!parsed?.message) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Onboarding assistant returned an unparseable response." });
    }

    // If the assistant says we're complete AND all 7 fields are present, persist.
    if (parsed.complete) {
      const c = parsed.collected ?? {};
      const required = ["experience", "monthlyIncomeBand", "netWorthBand", "riskTolerance", "illiquidityAck", "lossAck", "notAdviceAck"];
      const allPresent = required.every((k) => c[k] != null);
      if (allPresent) {
        await db.user.update({
          where: { id: user.id },
          data: {
            appropriatenessAssessment: {
              ...c,
              completedAt: new Date().toISOString(),
              source: "ai-onboarding",
            },
          },
        });
      } else {
        // Roll back the complete flag — assistant got ahead of itself.
        parsed.complete = false;
      }
    }

    return parsed;
  });
