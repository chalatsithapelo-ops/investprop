/**
 * AI Property Office — proactive in-app alert scheduler.
 *
 * Once a day, for every office-eligible member, we build the same proactive
 * briefing the voice/chat agent sees and turn the few genuinely actionable
 * items (FICA gap, contributions awaiting payment, open shareholder votes, new
 * opportunities that fit) into durable in-app notifications. The member does
 * not have to ask — the office reaches out.
 *
 * Everything is derived from the member's OWN data via `buildAdvisorBriefing`
 * (no per-user LLM call, so it scales at near-zero cost) and is deduplicated:
 * each alert type has a cooldown, so re-runs and daily ticks never spam. At
 * most two alerts are sent per member per run, highest priority first.
 *
 * Mirrors the in-process scheduler + secure-cron pattern used by the distressed
 * pipeline, weekly digest and monthly watchdog.
 */

import { db } from "~/server/db";
import { buildAdvisorBriefing } from "~/server/office/advisor";
import { userHasFeature } from "~/server/subscriptions/subscription-service";
import { createNotification } from "~/server/trpc/procedures/notifications";

const DAY_MS = 24 * 60 * 60 * 1000;
const zar = (n: number) => "R" + Math.round(n).toLocaleString("en-ZA");

type AlertType = "FICA_ACTION" | "PENDING_PAYMENTS" | "OPEN_VOTES" | "NEW_OPPORTUNITIES";

interface AlertSpec {
  type: AlertType;
  title: string;
  message: string;
  severity: "INFO" | "SUCCESS" | "WARNING";
  cooldownDays: number;
}

type Briefing = Awaited<ReturnType<typeof buildAdvisorBriefing>>;

/** Priority order: the first matching, non-cooled alerts are the ones we send. */
function candidateAlerts(b: Briefing): AlertSpec[] {
  const out: AlertSpec[] = [];
  if (b.ficaActionNeeded) {
    out.push({
      type: "FICA_ACTION", severity: "WARNING", cooldownDays: 7,
      title: "Action needed: complete your FICA verification",
      message: "Finish your FICA verification so you can invest R20,000 or more. Your AI Property Office can walk you through it.",
    });
  }
  if (b.pendingPayments > 0) {
    out.push({
      type: "PENDING_PAYMENTS", severity: "WARNING", cooldownDays: 2,
      title: "You have contributions awaiting payment",
      message: `${b.pendingPayments} contribution${b.pendingPayments === 1 ? "" : "s"} ${b.pendingPayments === 1 ? "is" : "are"} awaiting payment. Open your AI Property Office to review and complete them.`,
    });
  }
  if (b.openVotes > 0) {
    out.push({
      type: "OPEN_VOTES", severity: "INFO", cooldownDays: 3,
      title: "A shareholder vote is open for you",
      message: `${b.openVotes} shareholder proposal${b.openVotes === 1 ? "" : "s"} ${b.openVotes === 1 ? "is" : "are"} open for your vote. Ask your AI Property Office for a plain-language summary before you decide.`,
    });
  }
  if (b.openOpportunities > 0) {
    out.push({
      type: "NEW_OPPORTUNITIES", severity: "INFO", cooldownDays: 4,
      title: "New opportunities match your mandate",
      message:
        `${b.openOpportunities} opportunit${b.openOpportunities === 1 ? "y is" : "ies are"} open for funding` +
        (b.walletBalanceRands > 0 ? `, and your wallet holds about ${zar(b.walletBalanceRands)}.` : ".") +
        " Ask your AI Property Office which ones fit your goals.",
    });
  }
  return out;
}

/** Core daily run. Reusable by the cron handler, in-process scheduler and admin trigger. */
export async function runOfficeProactiveAlertsCore(opts: { dryRun?: boolean; limit?: number } = {}) {
  const dryRun = opts.dryRun ?? false;
  const limit = Math.min(Math.max(opts.limit ?? 2000, 1), 10000);
  const now = new Date();
  const MAX_PER_MEMBER = 2;

  const members = await db.user.findMany({
    where: { status: "ACTIVE", role: { in: ["INVESTOR", "PROPERTY_OWNER"] } },
    select: { id: true, role: true },
    orderBy: { id: "asc" },
    take: limit,
  });

  let entitled = 0;
  let notified = 0;
  let alertsSent = 0;
  let skippedCooldown = 0;

  for (const m of members) {
    const feature = m.role === "PROPERTY_OWNER" ? "SELLER_AI_VALUATION" : "AI_COPILOT";
    if (!(await userHasFeature(m.id, m.role as Parameters<typeof userHasFeature>[1], feature))) continue;
    entitled += 1;

    let briefing: Briefing;
    try {
      briefing = await buildAdvisorBriefing({ id: m.id, role: m.role });
    } catch {
      continue; // transient per-member failure must never abort the whole run
    }

    const candidates = candidateAlerts(briefing);
    if (candidates.length === 0) continue;

    // One lookback window covering the longest cooldown, to dedupe by title.
    const maxCooldown = Math.max(...candidates.map((c) => c.cooldownDays));
    const recent = await db.notification.findMany({
      where: { userId: m.id, category: "SYSTEM", createdAt: { gte: new Date(now.getTime() - maxCooldown * DAY_MS) } },
      select: { title: true, createdAt: true },
    });

    let sentForMember = 0;
    for (const alert of candidates) {
      if (sentForMember >= MAX_PER_MEMBER) break;
      const cooldownStart = now.getTime() - alert.cooldownDays * DAY_MS;
      const onCooldown = recent.some((r) => r.title === alert.title && r.createdAt.getTime() >= cooldownStart);
      if (onCooldown) { skippedCooldown += 1; continue; }
      if (dryRun) { alertsSent += 1; sentForMember += 1; continue; }
      await createNotification(m.id, alert.title, alert.message, alert.severity, "SYSTEM", null);
      alertsSent += 1;
      sentForMember += 1;
    }
    if (sentForMember > 0) notified += 1;
  }

  return { inspected: members.length, entitled, notified, alertsSent, skippedCooldown, dryRun };
}

// ─── In-process daily scheduler ────────────────────────────────────────

declare global {
  // eslint-disable-next-line no-var
  var __officeProactiveAlertSchedulerStarted: boolean | undefined;
}

const HOUR_MS = 60 * 60 * 1000;
const SEND_HOUR = 8; // server-local

function shouldRun(): boolean {
  if (process.env.NODE_ENV === "production") return true;
  return process.env.OFFICE_ALERTS_SCHEDULER_ENABLED === "true";
}

async function maybeRun(): Promise<void> {
  if (new Date().getHours() !== SEND_HOUR) return;
  try {
    const summary = await runOfficeProactiveAlertsCore({});
    console.log("[office-alerts-scheduler] run complete", JSON.stringify(summary));
  } catch (e) {
    console.error("[office-alerts-scheduler] run failed", e instanceof Error ? e.name : "Error");
  }
}

/** Idempotently start the daily proactive-alert scheduler. Safe to call on every request. */
export function startOfficeProactiveAlertScheduler(): void {
  if (globalThis.__officeProactiveAlertSchedulerStarted) return;
  if (!shouldRun()) return;
  globalThis.__officeProactiveAlertSchedulerStarted = true;

  const now = new Date();
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  const delay = next.getTime() - now.getTime();

  setTimeout(() => {
    void maybeRun();
    setInterval(() => void maybeRun(), HOUR_MS).unref?.();
  }, delay).unref?.();

  console.log(`[office-alerts-scheduler] started; first check at ${next.toISOString()}`);
}
