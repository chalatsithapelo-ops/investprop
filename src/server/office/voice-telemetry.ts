/**
 * Voice-agent cost & ops telemetry.
 *
 * The Python realtime worker posts one compact metric per completed call to the
 * authenticated office bridge (`action: "logVoiceSession"`). We persist it on the
 * existing `AIUsageLog` table (feature `"voice_agent"`) so it reuses the same
 * accounting surface as every other AI feature — no schema migration required.
 *
 * Cost is an ESTIMATE only. Realtime speech-to-speech providers bill by audio
 * minutes with input/output tiers we don't see here, so we apply a conservative
 * blended per-minute rate purely for internal ops visibility. It is clearly
 * flagged `estimated: true` and must never be presented as a billed amount.
 */

import { db } from "~/server/db";
import type { OfficeUser } from "~/server/office/policy";

export const VOICE_AGENT_FEATURE = "voice_agent";

// Rough blended USD/minute estimates for internal ops visibility only.
const USD_PER_MINUTE: Record<string, number> = {
  gemini: 0.1,
  openai: 0.3,
};
const DEFAULT_USD_PER_MINUTE = 0.3;

export interface VoiceSessionMetric {
  provider: string;
  model: string;
  durationSeconds: number;
  toolCalls: number;
  toolErrors: number;
  sessionErrors: number;
  userTurns?: number;
  agentTurns?: number;
}

/**
 * Lightweight heuristic call-quality score (0-100) for the admin ops view.
 * It is a coarse signal, not a judgement of advice correctness: it rewards a
 * grounded, two-way, error-free call and penalises errors, dead-air calls and
 * answers given without pulling any live data.
 */
export function scoreCallQuality(metric: VoiceSessionMetric): number {
  const userTurns = metric.userTurns ?? 0;
  const agentTurns = metric.agentTurns ?? 0;
  let quality = 100;
  if (metric.sessionErrors > 0) quality -= Math.min(40, metric.sessionErrors * 20);
  if (metric.toolErrors > 0) quality -= Math.min(30, metric.toolErrors * 10);
  // A real exchange that pulled no live data is weaker advice.
  if (userTurns >= 2 && metric.toolCalls === 0) quality -= 20;
  // The member never spoke on a non-trivial call — likely a mic/connection issue.
  if (userTurns === 0 && metric.durationSeconds > 15) quality -= 25;
  // The agent never answered on a non-trivial call.
  if (agentTurns === 0 && metric.durationSeconds > 10) quality -= 25;
  return Math.max(0, Math.min(100, Math.round(quality)));
}

export async function recordVoiceSession(user: OfficeUser, metric: VoiceSessionMetric): Promise<void> {
  const provider = metric.provider.trim().toLowerCase();
  const usdPerMinute = USD_PER_MINUTE[provider] ?? DEFAULT_USD_PER_MINUTE;
  const costUsd = Number(((metric.durationSeconds / 60) * usdPerMinute).toFixed(4));
  const hadError = metric.sessionErrors > 0 || metric.toolErrors > 0;
  const qualityScore = scoreCallQuality(metric);

  try {
    await db.aIUsageLog.create({
      data: {
        userId: user.id,
        feature: VOICE_AGENT_FEATURE,
        model: `${provider}:${metric.model}`.slice(0, 190),
        latencyMs: Math.min(metric.durationSeconds * 1000, 2_147_483_000),
        costUsd,
        status: hadError ? "ERROR" : "OK",
        metadata: {
          voiceAgent: true,
          provider,
          model: metric.model,
          durationSeconds: metric.durationSeconds,
          toolCalls: metric.toolCalls,
          toolErrors: metric.toolErrors,
          sessionErrors: metric.sessionErrors,
          userTurns: metric.userTurns ?? 0,
          agentTurns: metric.agentTurns ?? 0,
          qualityScore,
          estimated: true,
          usdPerMinute,
        },
      },
    });
  } catch (err) {
    // Telemetry must never break the agent flow.
    console.error("[office/voice-telemetry] failed to record session:", err);
  }
}
