import { z } from "zod";
import { baseProcedure } from "~/server/trpc/main";
import { db } from "~/server/db";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { requireFeature } from "~/server/subscriptions/subscription-service";
import { assertOfficeUser } from "~/server/office/policy";
import { officeCapabilities } from "~/server/office/context";
import { voiceAgentConfigured, createVoiceAgentSession } from "~/server/office/voice-agent";
import { VOICE_LANGUAGES, normalizeVoiceLanguage } from "~/server/office/voice-language";

const auth = z.object({ authToken: z.string().min(1).max(8192) }).strict();

/**
 * Report whether the realtime voice agent is available to this user without
 * starting a session. Lets the floating button hide itself when unconfigured.
 */
export const officeVoiceAgentStatus = baseProcedure.input(auth).query(async ({ input }) => {
  const user = await getAuthenticatedUser(input.authToken);
  assertOfficeUser(user);
  return {
    available: voiceAgentConfigured(),
    capabilities: officeCapabilities(),
    language: normalizeVoiceLanguage((user as { voiceLanguage?: string | null }).voiceLanguage),
    languages: VOICE_LANGUAGES,
  };
});

/**
 * Persist the member's preferred spoken language for the voice agent. The next
 * session opens in this language; the member can still switch mid-call by voice.
 */
export const officeSetVoiceLanguage = baseProcedure
  .input(auth.extend({ language: z.enum(VOICE_LANGUAGES) }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    assertOfficeUser(user);
    const language = normalizeVoiceLanguage(input.language);
    await db.user.update({ where: { id: user.id }, data: { voiceLanguage: language } });
    return { language };
  });

/**
 * Mint a short-lived LiveKit room token for the caller and dispatch the office
 * agent worker into that room. The agent receives the caller's JWT privately so
 * it can act on the office action bridge as this user. Subject to the same
 * subscription gating as the recorded voice turn.
 */
export const officeVoiceAgentSession = baseProcedure.input(auth).mutation(async ({ input }) => {
  const user = await getAuthenticatedUser(input.authToken);
  assertOfficeUser(user);
  await requireFeature(user, user.role === "PROPERTY_OWNER" ? "SELLER_AI_VALUATION" : "AI_COPILOT");
  return createVoiceAgentSession(user, input.authToken);
});
