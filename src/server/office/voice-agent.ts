/**
 * Realtime voice-agent session plumbing.
 *
 * The browser / Flutter client asks the server for a short-lived LiveKit room
 * token. The same request also *dispatches* the Python agent worker into the
 * room with private job metadata that carries the caller's own JWT. That JWT
 * never reaches other participants — it is delivered only to the agent job, so
 * the worker can call the authenticated office action bridge as the user.
 *
 * Nothing here weakens the existing office guard rails: the worker still hits
 * the same tRPC-backed office functions through the bridge, with the user's own
 * token, so every read is scoped and every task still runs through the frozen
 * digest approval.
 */

import { randomUUID } from "node:crypto";
import { AccessToken, AgentDispatchClient } from "livekit-server-sdk";
import { TRPCError } from "@trpc/server";
import { env } from "~/server/env";
import type { OfficeUser } from "~/server/office/policy";

// The session helper needs the display name too, which OfficeUser omits.
type VoiceAgentUser = OfficeUser & { name?: string | null };

// Rooms live only as long as a session; identities are stable per user so the
// worker can address UI data packets back to the right participant.
const ROOM_TTL_SECONDS = 60 * 30; // 30 minutes max room token lifetime
const TOKEN_TTL_SECONDS = 60 * 15; // client token refreshes well before room TTL

export function voiceAgentConfigured(): boolean {
  return (
    env.VOICE_AGENT_ENABLED === "true" &&
    Boolean(env.LIVEKIT_URL) &&
    Boolean(env.LIVEKIT_API_KEY) &&
    Boolean(env.LIVEKIT_API_SECRET)
  );
}

type VoiceAgentConfig = {
  url: string;
  apiKey: string;
  apiSecret: string;
};

function requireConfig(): VoiceAgentConfig {
  if (
    env.VOICE_AGENT_ENABLED !== "true" ||
    !env.LIVEKIT_URL ||
    !env.LIVEKIT_API_KEY ||
    !env.LIVEKIT_API_SECRET
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "The realtime voice agent is not configured. Set VOICE_AGENT_ENABLED, LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET.",
    });
  }
  return {
    url: env.LIVEKIT_URL,
    apiKey: env.LIVEKIT_API_KEY,
    apiSecret: env.LIVEKIT_API_SECRET,
  };
}

export type VoiceAgentSession = {
  url: string;
  token: string;
  roomName: string;
  identity: string;
  expiresInSeconds: number;
};

/**
 * Mint a participant token for the caller and dispatch the office agent into a
 * fresh room. The caller's JWT is passed only through the dispatch metadata so
 * the worker can act as the user against the action bridge.
 */
export async function createVoiceAgentSession(
  user: VoiceAgentUser,
  authToken: string,
): Promise<VoiceAgentSession> {
  const config = requireConfig();

  const roomName = `office-${user.id}-${randomUUID()}`;
  const identity = `user-${user.id}`;

  // Participant token: the human client. Can publish mic audio and subscribe to
  // the agent's audio + data. Never carries the office JWT.
  const at = new AccessToken(config.apiKey, config.apiSecret, {
    identity,
    name: user.name ?? `Member ${user.id}`,
    ttl: TOKEN_TTL_SECONDS,
    // Public, non-secret metadata for the worker to greet the user by name/role.
    metadata: JSON.stringify({ userId: user.id, role: user.role, name: user.name ?? null }),
  });
  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  const token = await at.toJwt();

  // Dispatch the worker explicitly so the user's JWT only reaches the agent job.
  const dispatch = new AgentDispatchClient(
    config.url,
    config.apiKey,
    config.apiSecret,
  );
  try {
    await dispatch.createDispatch(roomName, env.VOICE_AGENT_NAME, {
      metadata: JSON.stringify({
        authToken,
        userId: user.id,
        role: user.role,
        name: user.name ?? null,
        issuedAt: new Date().toISOString(),
      }),
    });
  } catch (error) {
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message:
        error instanceof Error
          ? `Could not start the voice agent: ${error.message}`
          : "Could not start the voice agent",
    });
  }

  return {
    url: config.url,
    token,
    roomName,
    identity,
    expiresInSeconds: Math.min(TOKEN_TTL_SECONDS, ROOM_TTL_SECONDS),
  };
}
