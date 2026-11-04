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
import { confirmedProfileSchema, onboardingSubmissionSchema, onboardingTurnSchema } from "./ai-investor-profile";

const SYSTEM_PROMPT = `You are Investprop's onboarding co-pilot. You guide a new South African retail investor through the FSCA-aligned appropriateness questionnaire in a warm, conversational way.

You MUST collect ALL of these fields before completing:
  - investmentExperience: "NONE" | "BASIC" | "EXPERIENCED" | "PROFESSIONAL"
  - annualIncome: "UNDER_350K" | "350_750K" | "750K_1_5M" | "OVER_1_5M" (annual Rand income)
  - netWorth: "UNDER_500K" | "500K_2M" | "2M_10M" | "OVER_10M" (Rand)
  - maxLossTolerance: finite non-negative number — maximum Rand amount they can afford to lose, NOT a risk category
  - understandsIlliquid: boolean — "I understand that property investments are illiquid and capital may be locked up for years."
  - understandsLossOfCapital: boolean — "I understand I may lose some or all of my invested capital."
  - understandsCoolingOff: boolean — "I understand I have a 5-business-day cooling-off period to cancel and receive a full refund."

Rules:
- Ask ONE question per turn. Keep it under 2 sentences. Use plain English. South African spelling.
- If user gives a free-text answer (e.g. "I earn about R30k a month"), interpret it into the structured value yourself — don't make them recite codes.
- If user seems confused, briefly explain why the question matters then re-ask.
- Never infer acknowledgement from income, experience, silence or another acknowledgement; ask each disclosure explicitly.
- After all 7 fields are valid and all 3 acknowledgements are explicitly true, present the answers for review. The client must submit an explicit structured submission with confirmed=true; chat and model output alone never complete the assessment.
- You provide information, NOT financial advice; this disclaimer is not a replacement legal acknowledgement.

Return ONLY JSON on EVERY turn, in this exact shape:
{
  "message": "<your next question or confirmation, what to say to the user>",
  "collected": {
    "investmentExperience": "...",
    "annualIncome": "...",
    "netWorth": "...",
    "maxLossTolerance": 0,
    "understandsIlliquid": true/false,
    "understandsLossOfCapital": true/false,
    "understandsCoolingOff": true/false
  },
  "complete": true | false
}
Set values to null if not yet collected. Always set complete=false: only the server can complete an explicitly confirmed submission.`;

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

    const turn = onboardingTurnSchema.safeParse(safeParseJson<unknown>(result.text));
    const parsed = turn.success ? turn.data : {
      message: "Welcome! Let's start. How much experience do you have with property or share investing?",
      collected: {},
      complete: false,
    };
    return { ...parsed, complete: false, readyForConfirmation: false };
  });

export const continueOnboardingSession = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).max(40),
      userMessage: z.string().min(1).max(2000),
      // Explicit user-reviewed fields, never populated from model output on the server.
      submission: onboardingSubmissionSchema.optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    if (input.submission) {
      const profile = confirmedProfileSchema.parse(input.submission);
      const completedAt = new Date();
      await db.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            appropriatenessAssessment: { ...profile, completedAt: completedAt.toISOString(), source: "ai-onboarding" },
            appropriatenessCompletedAt: completedAt,
          },
        });
        await tx.auditLog.create({
          data: {
            userId: user.id, action: "APPROPRIATENESS_COMPLETED", entity: "User", entityId: user.id,
            changes: { experience: profile.investmentExperience, tolerance: profile.maxLossTolerance, source: "ai-onboarding" },
          },
        });
      });
      return { message: "Your confirmed assessment has been submitted.", collected: profile, complete: true, readyForConfirmation: false };
    }

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

    const turn = onboardingTurnSchema.safeParse(safeParseJson<unknown>(result.text));
    if (!turn.success) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Onboarding assistant returned an unparseable response." });
    }

    return {
      ...turn.data,
      complete: false,
      readyForConfirmation: confirmedProfileSchema.safeParse(turn.data.collected).success,
    };
  });
