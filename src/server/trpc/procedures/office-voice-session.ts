import { z } from "zod";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { requireFeature } from "~/server/subscriptions/subscription-service";
import { assertOfficeUser } from "~/server/office/policy";
import { officeCapabilities } from "~/server/office/context";
import { voiceAgentConfigured, createVoiceAgentSession } from "~/server/office/voice-agent";

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
  };
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
