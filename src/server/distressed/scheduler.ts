/**
 * In-process daily scheduler for the distressed pipeline.
 *
 * Runs once per day at ~02:15 server-local time. It's started lazily from the
 * tRPC request handler (server-only), guarded so it only ever initialises once
 * per process. In non-production it stays off unless DISTRESSED_SCHEDULER_ENABLED
 * is "true", so local dev and tests never fire the scrapers/AI.
 *
 * An external cron hitting POST /api/cron/distressed is the belt-and-braces
 * fallback (survives restarts with no traffic, and makes runs observable).
 */

import { runDistressedPipeline } from "~/server/distressed/pipeline";

declare global {
  // eslint-disable-next-line no-var
  var __distressedSchedulerStarted: boolean | undefined;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function shouldRun(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  return process.env.DISTRESSED_SCHEDULER_ENABLED === "true";
}

async function runOnce(): Promise<void> {
  try {
    const summary = await runDistressedPipeline();
    console.log("[distressed-scheduler] run complete", JSON.stringify(summary));
  } catch (e) {
    console.error("[distressed-scheduler] run failed", e);
  }
}

/** Idempotently start the daily scheduler. Safe to call on every request. */
export function startDistressedScheduler(): void {
  if (globalThis.__distressedSchedulerStarted) return;
  if (!shouldRun()) return;
  globalThis.__distressedSchedulerStarted = true;

  const now = new Date();
  const next = new Date(now);
  next.setHours(2, 15, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  const delay = next.getTime() - now.getTime();

  setTimeout(() => {
    void runOnce();
    setInterval(() => void runOnce(), DAY_MS).unref?.();
  }, delay).unref?.();

  console.log(`[distressed-scheduler] started; first run at ${next.toISOString()}`);
}
