/**
 * In-process weekly scheduler for the AI deal digest.
 *
 * Checks hourly whether a weekly digest is due and, when it is, runs the digest
 * engine (which itself only emails investors not contacted in the last 6 days,
 * so duplicate runs are harmless). Started lazily from the tRPC request handler,
 * guarded to initialise once per process. In non-production it stays off unless
 * AI_DIGEST_SCHEDULER_ENABLED is "true", so local dev and tests never send mail.
 *
 * An external cron hitting POST /api/cron/ai-digest is the belt-and-braces
 * fallback (survives restarts with no traffic, and makes runs observable).
 */

import { runWeeklyDigestCore } from "~/server/ai/insights-digest";

declare global {
  // eslint-disable-next-line no-var
  var __aiDigestSchedulerStarted: boolean | undefined;
}

const HOUR_MS = 60 * 60 * 1000;
// Send on Mondays at ~07:00 server-local time.
const SEND_WEEKDAY = 1; // Monday
const SEND_HOUR = 7;

function shouldRun(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  return process.env.AI_DIGEST_SCHEDULER_ENABLED === "true";
}

async function maybeRun(): Promise<void> {
  const now = new Date();
  if (now.getDay() !== SEND_WEEKDAY || now.getHours() !== SEND_HOUR) return;
  try {
    const summary = await runWeeklyDigestCore({});
    console.log("[ai-digest-scheduler] run complete", JSON.stringify(summary));
  } catch (e) {
    console.error("[ai-digest-scheduler] run failed", e);
  }
}

/** Idempotently start the weekly digest scheduler. Safe to call on every request. */
export function startAiDigestScheduler(): void {
  if (globalThis.__aiDigestSchedulerStarted) return;
  if (!shouldRun()) return;
  globalThis.__aiDigestSchedulerStarted = true;

  // Align the first tick to the top of the next hour, then check hourly.
  const now = new Date();
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  const delay = next.getTime() - now.getTime();

  setTimeout(() => {
    void maybeRun();
    setInterval(() => void maybeRun(), HOUR_MS).unref?.();
  }, delay).unref?.();

  console.log(`[ai-digest-scheduler] started; first check at ${next.toISOString()}`);
}
