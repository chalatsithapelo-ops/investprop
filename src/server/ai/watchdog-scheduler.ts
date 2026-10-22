/**
 * In-process monthly scheduler for the AI portfolio watchdog.
 *
 * Checks hourly whether the monthly recap is due (1st of the month, ~08:00
 * server-local) and runs the watchdog, which is itself idempotent per period
 * (it skips investors already notified this month), so duplicate runs are safe.
 * Started lazily from the tRPC request handler, guarded to initialise once per
 * process. In non-production it stays off unless AI_WATCHDOG_SCHEDULER_ENABLED
 * is "true". External cron POST /api/cron/ai-watchdog is the fallback.
 */

import { runPortfolioWatchdogCore } from "~/server/ai/portfolio-watchdog";

declare global {
  // eslint-disable-next-line no-var
  var __aiWatchdogSchedulerStarted: boolean | undefined;
}

const HOUR_MS = 60 * 60 * 1000;
const SEND_DAY_OF_MONTH = 1;
const SEND_HOUR = 8;

function shouldRun(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  return process.env.AI_WATCHDOG_SCHEDULER_ENABLED === "true";
}

async function maybeRun(): Promise<void> {
  const now = new Date();
  if (now.getDate() !== SEND_DAY_OF_MONTH || now.getHours() !== SEND_HOUR) return;
  try {
    const summary = await runPortfolioWatchdogCore({});
    console.log("[ai-watchdog-scheduler] run complete", JSON.stringify(summary));
  } catch (e) {
    console.error("[ai-watchdog-scheduler] run failed", e);
  }
}

/** Idempotently start the monthly watchdog scheduler. Safe to call on every request. */
export function startAiWatchdogScheduler(): void {
  if (globalThis.__aiWatchdogSchedulerStarted) return;
  if (!shouldRun()) return;
  globalThis.__aiWatchdogSchedulerStarted = true;

  const now = new Date();
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  const delay = next.getTime() - now.getTime();

  setTimeout(() => {
    void maybeRun();
    setInterval(() => void maybeRun(), HOUR_MS).unref?.();
  }, delay).unref?.();

  console.log(`[ai-watchdog-scheduler] started; first check at ${next.toISOString()}`);
}
