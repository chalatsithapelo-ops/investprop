/**
 * Distressed-deal pipeline — the single daily run that keeps the finder fresh
 * and makes paid alerts actually fire. Each step is isolated so one failure
 * never aborts the rest. Triggered by the in-process scheduler, the secure
 * /api/cron/distressed endpoint, or manually from the admin tools.
 *
 *   1. Scrape all sources            (fresh listings)
 *   2. AI batch-grade new listings   (populate A–E grades + risk)
 *   3. Dedup across sources          (merge duplicate listings)
 *   4. Watchlist reminders           (auction + price-drop notifications)
 *   5. Subscriber alerts             (filtered email + push to paying users)
 */

import { db } from "~/server/db";
import { runFullScrape } from "~/server/scrapers/distressed-property-scraper";
import { screenBatchCore, runDedupCore, runRemindersCore } from "~/server/trpc/procedures/distressed-ai";
import { runSubscriberAlertsCore } from "~/server/trpc/procedures/distressed-alerts";

export interface DistressedPipelineSummary {
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  scrape?: { totalFound: number; totalNew: number; totalExpired: number };
  grade?: { screened: number; failed: number; attempted: number };
  dedup?: { groupsFound: number; listingsGrouped: number; totalListings: number };
  reminders?: { auctionReminders: number; priceDropAlerts: number; watchedScanned: number };
  alerts?: { subscribersChecked: number; matchedSubscribers: number; totalMatches: number; emailsSent: number };
  errors: string[];
}

export async function runDistressedPipeline(opts?: {
  gradeLimit?: number;
  dryRunAlerts?: boolean;
}): Promise<DistressedPipelineSummary> {
  const started = Date.now();
  const errors: string[] = [];
  const summary: DistressedPipelineSummary = {
    startedAt: new Date(started).toISOString(),
    finishedAt: "",
    durationMs: 0,
    errors,
  };

  // AI cost/usage is logged against an internal admin actor.
  const admin = await db.user
    .findFirst({ where: { role: "ADMIN" }, select: { id: true } })
    .catch(() => null);
  const actorUserId = admin?.id ?? null;

  // 1. Scrape
  try {
    const r = await runFullScrape();
    summary.scrape = { totalFound: r.totalFound, totalNew: r.totalNew, totalExpired: r.totalExpired };
  } catch (e) {
    errors.push(`scrape: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2. AI batch-grade
  try {
    summary.grade = await screenBatchCore({ actorUserId, limit: opts?.gradeLimit ?? 40 });
  } catch (e) {
    errors.push(`grade: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 3. Dedup
  try {
    summary.dedup = await runDedupCore();
  } catch (e) {
    errors.push(`dedup: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 4. Watchlist reminders (auction + price drops)
  try {
    summary.reminders = await runRemindersCore({});
  } catch (e) {
    errors.push(`reminders: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 5. Subscriber alerts
  try {
    summary.alerts = await runSubscriberAlertsCore({ dryRun: opts?.dryRunAlerts ?? false });
  } catch (e) {
    errors.push(`alerts: ${e instanceof Error ? e.message : String(e)}`);
  }

  summary.finishedAt = new Date().toISOString();
  summary.durationMs = Date.now() - started;
  return summary;
}
