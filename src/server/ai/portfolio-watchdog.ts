/**
 * Monthly AI portfolio watchdog + recap.
 *
 * For each investor entitled to AI_PORTFOLIO_ADVISOR with portfolio activity we
 * generate (or reuse) this month's PortfolioInsight, then — once per period —
 * push an in-app notification + email recap. Items flagged WARNING/ATTENTION
 * are surfaced first so investors act on concentration, tax or liquidity risks.
 *
 * Reuses generatePortfolioInsightCore (the same premium brief shown in-app), so
 * the scheduled recap and the on-demand advisor never diverge.
 */
import { db } from "~/server/db";
import { env } from "~/server/env";
import { createNotification } from "~/server/trpc/procedures/notifications";
import { sendBatchEmails, type BatchEmailItem } from "~/server/utils/email";
import { userHasFeature } from "~/server/subscriptions/subscription-service";
import { generatePortfolioInsightCore } from "~/server/trpc/procedures/ai-portfolio-advisor";

type Insight = { type: string; severity: "INFO" | "ATTENTION" | "WARNING"; message: string; action?: string };

const SEVERITY_RANK: Record<string, number> = { WARNING: 3, ATTENTION: 2, INFO: 1 };

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function buildRecapEmail(
  name: string,
  period: string,
  summary: string,
  insights: Insight[],
): { subject: string; htmlContent: string; textContent: string } {
  const base = env.BASE_URL ?? "";
  const sorted = [...insights].sort(
    (a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0),
  );
  const warnings = sorted.filter((i) => i.severity === "WARNING").length;
  const subject = warnings
    ? `Portfolio watchdog: ${warnings} ${warnings === 1 ? "item needs" : "items need"} your attention`
    : `Your monthly portfolio recap is ready`;

  const colour = (s: string) => (s === "WARNING" ? "#dc2626" : s === "ATTENTION" ? "#d97706" : "#0d9488");
  const rows = sorted
    .map(
      (i) => `<tr><td style="padding:10px 0;border-bottom:1px solid #eee;">
        <span style="display:inline-block;font-size:11px;font-weight:700;color:#fff;background:${colour(i.severity)};padding:2px 8px;border-radius:4px;">${i.severity}</span>
        <span style="color:#111;"> ${i.message}</span>
        ${i.action ? `<br/><span style="color:#555;font-size:13px;">→ ${i.action}</span>` : ""}
      </td></tr>`,
    )
    .join("");

  const htmlContent = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;">
    <h2 style="margin-bottom:4px;">Monthly portfolio recap, ${name}</h2>
    <p style="color:#777;margin-top:0;font-size:13px;">${period}</p>
    <p style="color:#333;line-height:1.5;">${summary}</p>
    ${rows ? `<h3 style="margin:20px 0 4px;">What to watch</h3><table style="width:100%;border-collapse:collapse;">${rows}</table>` : ""}
    <p style="margin-top:24px;">
      <a href="${base}/investments" style="background:#0d9488;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Open your portfolio</a>
    </p>
    <p style="color:#999;font-size:12px;margin-top:24px;">Research and observations only — not financial, tax or legal advice. Manage emails at ${base}/investments/preferences</p>
  </div>`;

  const lines = [`Monthly portfolio recap, ${name} (${period}):`, "", summary, ""];
  if (sorted.length) {
    lines.push("What to watch:");
    for (const i of sorted) {
      lines.push(`- [${i.severity}] ${i.message}${i.action ? ` → ${i.action}` : ""}`);
    }
    lines.push("");
  }
  lines.push(`Open your portfolio: ${base}/investments`);

  return { subject, htmlContent, textContent: lines.join("\n") };
}

/** Core monthly watchdog run. Reusable by the cron handler, scheduler and admin trigger. */
export async function runPortfolioWatchdogCore(opts: { dryRun?: boolean } = {}) {
  const dryRun = opts.dryRun ?? false;
  const period = currentPeriod();

  // Investors with at least one live contribution this period.
  const activeInvestors = await db.user.findMany({
    where: {
      role: "INVESTOR",
      status: "ACTIVE",
      investorContributions: { some: { deletedAt: null, status: { not: "CANCELLED" } } },
    },
    select: { id: true, name: true, email: true, role: true },
  });

  const emailItems: BatchEmailItem[] = [];
  let entitled = 0;
  let generated = 0;
  let notified = 0;
  let skipped = 0;

  for (const inv of activeInvestors) {
    const hasFeature = await userHasFeature(inv.id, inv.role, "AI_PORTFOLIO_ADVISOR");
    if (!hasFeature) continue;
    entitled += 1;

    // Skip if this period's insight was already pushed (idempotent across re-runs).
    const existing = await db.portfolioInsight.findUnique({
      where: { investorId_period: { investorId: inv.id, period } },
      select: { notifiedAt: true },
    });
    if (existing?.notifiedAt) {
      skipped += 1;
      continue;
    }

    let result: { summary: string; insights: Insight[]; period: string } | null = null;
    try {
      const r = await generatePortfolioInsightCore({ id: inv.id, role: inv.role }, { force: false });
      result = { summary: r.summary, insights: (r.insights ?? []) as Insight[], period: r.period };
      generated += 1;
    } catch {
      // No portfolio activity / transient AI error — skip this investor silently.
      continue;
    }

    if (dryRun) continue;

    const warnings = result.insights.filter((i) => i.severity === "WARNING").length;
    await createNotification(
      inv.id,
      warnings
        ? `Portfolio watchdog: ${warnings} ${warnings === 1 ? "item needs" : "items need"} attention`
        : "Your monthly portfolio recap is ready",
      result.summary.length > 160 ? `${result.summary.slice(0, 157)}...` : result.summary,
      warnings ? "WARNING" : "INFO",
      "INVESTMENT",
      null,
    );

    if (inv.email) {
      const { subject, htmlContent, textContent } = buildRecapEmail(
        inv.name ?? "Investor",
        result.period,
        result.summary,
        result.insights,
      );
      emailItems.push({ to: { email: inv.email, name: inv.name ?? "Investor" }, subject, htmlContent, textContent });
    }

    await db.portfolioInsight.update({
      where: { investorId_period: { investorId: inv.id, period } },
      data: { notifiedAt: new Date() },
    });
    notified += 1;
  }

  let emailsSent = 0;
  if (!dryRun && emailItems.length > 0) {
    emailsSent = await sendBatchEmails(emailItems);
  }

  return { period, activeInvestors: activeInvestors.length, entitled, generated, notified, skipped, emailsSent, dryRun };
}
