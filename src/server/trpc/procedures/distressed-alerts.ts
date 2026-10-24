import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { createNotification } from "~/server/trpc/procedures/notifications";
import { createAuditLog } from "~/server/trpc/procedures/audit-log";
import { sendBatchEmails, type BatchEmailItem } from "~/server/utils/email";
import { userHasFeature } from "~/server/subscriptions/subscription-service";
import { computeDistressedMarketAnalysis } from "~/server/distressed/market-analysis";
import { env } from "~/server/env";

// ═══════════════════════════════════════════════════════════════
//  Phase 3 — Distressed-deal alert subscriptions.
//  Subscribers define filters; a scheduled run matches newly-added or
//  price-dropped distressed listings and notifies them (email + push).
// ═══════════════════════════════════════════════════════════════

const GRADE_RANK: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, E: 1 };

const filtersSchema = z.object({
  provinces: z.array(z.string()).optional(),
  cities: z.array(z.string()).optional(),
  maxPrice: z.number().positive().optional(),
  minDiscountPct: z.number().min(0).max(100).optional(),
  minAIGrade: z.enum(["A", "B", "C", "D", "E"]).optional(),
  propertyTypes: z.array(z.string()).optional(),
  channelEmail: z.boolean().optional(),
  channelPush: z.boolean().optional(),
  active: z.boolean().optional(),
});

// ─── Get my alert subscription ─────────────────────────────────
export const getMyDistressedAlerts = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const sub = await db.distressedAlertSubscription.findUnique({ where: { userId: user.id } });
    const entitled = await userHasFeature(user.id, user.role, "DISTRESSED_ALERTS");
    return {
      entitled,
      subscription: sub
        ? {
            active: sub.active,
            provinces: (sub.provinces as string[] | null) ?? [],
            cities: (sub.cities as string[] | null) ?? [],
            maxPrice: sub.maxPrice,
            minDiscountPct: sub.minDiscountPct,
            minAIGrade: sub.minAIGrade,
            propertyTypes: (sub.propertyTypes as string[] | null) ?? [],
            channelEmail: sub.channelEmail,
            channelPush: sub.channelPush,
            lastAlertedAt: sub.lastAlertedAt,
          }
        : null,
    };
  });

// ─── Create / update alert preferences ─────────────────────────
export const upsertDistressedAlerts = baseProcedure
  .input(z.object({ authToken: z.string() }).merge(filtersSchema))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    const data = {
      active: input.active ?? true,
      provinces: input.provinces ?? [],
      cities: input.cities ?? [],
      maxPrice: input.maxPrice ?? null,
      minDiscountPct: input.minDiscountPct ?? null,
      minAIGrade: input.minAIGrade ?? null,
      propertyTypes: input.propertyTypes ?? [],
      channelEmail: input.channelEmail ?? true,
      channelPush: input.channelPush ?? true,
    };

    const sub = await db.distressedAlertSubscription.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
    });

    await createAuditLog(user.id, "UPDATE_DISTRESSED_ALERTS", "DistressedAlertSubscription", sub.id, {
      active: sub.active,
    });

    return { success: true, active: sub.active };
  });

/** Does a listing match a subscriber's filters? */
function matchesFilters(
  listing: {
    province: string;
    city: string;
    askingPrice: number;
    discount: number | null;
    aiGrade: string | null;
    propertyType: string;
  },
  f: {
    provinces: string[];
    cities: string[];
    maxPrice: number | null;
    minDiscountPct: number | null;
    minAIGrade: string | null;
    propertyTypes: string[];
  },
): boolean {
  if (f.provinces.length && !f.provinces.includes(listing.province)) return false;
  if (f.cities.length && !f.cities.includes(listing.city)) return false;
  if (f.maxPrice != null && listing.askingPrice > f.maxPrice) return false;
  if (f.minDiscountPct != null && (listing.discount ?? 0) < f.minDiscountPct) return false;
  if (f.propertyTypes.length && !f.propertyTypes.includes(listing.propertyType)) return false;
  if (f.minAIGrade) {
    const need = GRADE_RANK[f.minAIGrade] ?? 0;
    const have = listing.aiGrade ? GRADE_RANK[listing.aiGrade] ?? 0 : 0;
    if (have < need) return false;
  }
  return true;
}

function buildAlertEmail(
  name: string,
  listings: {
    id: number;
    title: string;
    city: string;
    province: string;
    askingPrice: number;
    discount: number | null;
    aiGrade: string | null;
    priceDropPct?: number | null;
    previousPrice?: number | null;
    verdictLabel?: string | null;
    verdictScore?: number | null;
  }[],
): { subject: string; htmlContent: string; textContent: string } {
  const count = listings.length;
  const dropCount = listings.filter((l) => l.priceDropPct != null).length;
  const newCount = count - dropCount;
  const subjectParts: string[] = [];
  if (newCount > 0) subjectParts.push(`${newCount} new`);
  if (dropCount > 0) subjectParts.push(`${dropCount} price-dropped`);
  const subject = `${subjectParts.join(" + ")} distressed ${count === 1 ? "deal" : "deals"} match your alerts`;
  const base = env.BASE_URL ?? "";
  const rows = listings
    .map((l) => {
      const disc = l.discount != null ? `${Math.round(l.discount)}% below market` : "";
      const grade = l.aiGrade ? ` · Grade ${l.aiGrade}` : "";
      const verdict =
        l.verdictLabel != null
          ? ` · <span style="font-weight:600;color:#0d9488;">${l.verdictLabel}${l.verdictScore != null ? ` ${l.verdictScore}/100` : ""}</span>`
          : "";
      const drop =
        l.priceDropPct != null
          ? `<br/><span style="color:#dc2626;font-weight:600;">↓ Price dropped ${Math.round(l.priceDropPct)}%${l.previousPrice != null ? ` from R${Math.round(l.previousPrice).toLocaleString()}` : ""}</span>`
          : "";
      return `<tr><td style="padding:10px 0;border-bottom:1px solid #eee;">
        <strong>${l.title}</strong><br/>
        <span style="color:#555;">${l.city}, ${l.province} · R${Math.round(l.askingPrice).toLocaleString()} ${disc}${grade}${verdict}</span>${drop}
      </td></tr>`;
    })
    .join("");
  const htmlContent = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <h2>Distressed deals for you, ${name}</h2>
    <p>${count} ${count === 1 ? "listing matches" : "listings match"} your saved alert filters:</p>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    <p style="margin-top:20px;">
      <a href="${base}/distressed-deals" style="background:#0d9488;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">View all deals</a>
    </p>
    <p style="color:#999;font-size:12px;margin-top:24px;">Manage your alerts at ${base}/distressed-alerts</p>
  </div>`;
  const textContent =
    `Distressed deals for you, ${name}:\n\n` +
    listings
      .map(
        (l) =>
          `- ${l.title} — ${l.city}, ${l.province} — R${Math.round(l.askingPrice).toLocaleString()}` +
          (l.discount != null ? ` (${Math.round(l.discount)}% below market)` : "") +
          (l.verdictLabel != null ? ` [${l.verdictLabel}${l.verdictScore != null ? ` ${l.verdictScore}/100` : ""}]` : "") +
          (l.priceDropPct != null ? ` [↓ dropped ${Math.round(l.priceDropPct)}%]` : ""),
      )
      .join("\n") +
    `\n\nView all: ${base}/distressed-deals`;
  return { subject, htmlContent, textContent };
}

// ─── Run subscriber alerts (admin / scheduled) ─────────────────
/** Core subscriber-alert run. Reusable by the admin procedure and the scheduler. */
export async function runSubscriberAlertsCore(opts: { dryRun?: boolean }) {
    const dryRun = opts.dryRun ?? false;
    const subs = await db.distressedAlertSubscription.findMany({
      where: { active: true },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    });

    const now = new Date();
    const emailItems: BatchEmailItem[] = [];
    let matchedSubscribers = 0;
    let totalMatches = 0;
    let totalPriceDrops = 0;

    // Cache verdicts per listing within this run (listings overlap across subscribers).
    const verdictCache = new Map<number, { label: string; score: number } | null>();
    const getVerdict = async (id: number): Promise<{ label: string; score: number } | null> => {
      if (verdictCache.has(id)) return verdictCache.get(id) ?? null;
      let v: { label: string; score: number } | null = null;
      try {
        const a = await computeDistressedMarketAnalysis(id);
        if (a && !a.insufficientData) v = { label: a.verdict.label, score: a.verdict.score };
      } catch {
        v = null;
      }
      verdictCache.set(id, v);
      return v;
    };

    for (const sub of subs) {
      // Only entitled subscribers receive alerts.
      const entitled = await userHasFeature(sub.user.id, sub.user.role, "DISTRESSED_ALERTS");
      if (!entitled) continue;

      const since = sub.lastAlertedAt ?? new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const candidates = await db.distressedListing.findMany({
        where: { status: "ACTIVE", createdAt: { gt: since } },
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      const filters = {
        provinces: (sub.provinces as string[] | null) ?? [],
        cities: (sub.cities as string[] | null) ?? [],
        maxPrice: sub.maxPrice,
        minDiscountPct: sub.minDiscountPct,
        minAIGrade: sub.minAIGrade,
        propertyTypes: (sub.propertyTypes as string[] | null) ?? [],
      };

      type MatchItem = {
        id: number;
        title: string;
        city: string;
        province: string;
        askingPrice: number;
        discount: number | null;
        aiGrade: string | null;
        priceDropPct?: number | null;
        previousPrice?: number | null;
        verdictLabel?: string | null;
        verdictScore?: number | null;
      };

      const newMatches: MatchItem[] = candidates
        .filter((l) => matchesFilters(l, filters))
        .slice(0, 10)
        .map((m) => ({
          id: m.id,
          title: m.title,
          city: m.city,
          province: m.province,
          askingPrice: m.askingPrice,
          discount: m.discount,
          aiGrade: m.aiGrade,
        }));

      // ─── Price-drop re-alerts on pre-existing listings ─────────
      // Existing listings (created before this subscriber's window) that logged
      // a new price point since `since`, where the current price is below the
      // last price on/before `since` — i.e. a genuine drop.
      const dropCandidates = await db.distressedListing.findMany({
        where: {
          status: "ACTIVE",
          createdAt: { lte: since },
          priceHistory: { some: { recordedAt: { gt: since } } },
        },
        include: { priceHistory: { orderBy: { recordedAt: "desc" }, take: 20 } },
        take: 100,
      });

      const alreadyIncluded = new Set(newMatches.map((m) => m.id));
      const dropMatches: MatchItem[] = [];
      for (const l of dropCandidates) {
        if (alreadyIncluded.has(l.id)) continue;
        if (!matchesFilters(l, filters)) continue;
        // Baseline = most recent recorded price at/before the window start.
        const baseline = l.priceHistory.find((p) => p.recordedAt.getTime() <= since.getTime());
        if (!baseline) continue;
        if (l.askingPrice >= baseline.askingPrice) continue; // no drop
        const dropPct = ((baseline.askingPrice - l.askingPrice) / baseline.askingPrice) * 100;
        if (dropPct < 1) continue; // ignore sub-1% noise
        dropMatches.push({
          id: l.id,
          title: l.title,
          city: l.city,
          province: l.province,
          askingPrice: l.askingPrice,
          discount: l.discount,
          aiGrade: l.aiGrade,
          priceDropPct: dropPct,
          previousPrice: baseline.askingPrice,
        });
      }

      const matches = [...newMatches, ...dropMatches.slice(0, 10)];
      if (matches.length === 0) continue;

      matchedSubscribers += 1;
      totalMatches += matches.length;
      totalPriceDrops += dropMatches.length;

      if (dryRun) continue;

      // Enrich with the Finder market verdict (cached per listing).
      for (const m of matches) {
        const v = await getVerdict(m.id);
        if (v) {
          m.verdictLabel = v.label;
          m.verdictScore = v.score;
        }
      }

      if (sub.channelPush) {
        const dropN = dropMatches.length;
        const newN = newMatches.length;
        const parts: string[] = [];
        if (newN > 0) parts.push(`${newN} new`);
        if (dropN > 0) parts.push(`${dropN} price-dropped`);
        await createNotification(
          sub.user.id,
          `${parts.join(" + ")} distressed ${matches.length === 1 ? "deal" : "deals"}`,
          `${parts.join(" and ")} ${matches.length === 1 ? "listing matches" : "listings match"} your distressed-deal alerts.`,
          "INFO",
          "PROPERTY",
          matches[0]!.id,
        );
      }

      if (sub.channelEmail && sub.user.email) {
        const { subject, htmlContent, textContent } = buildAlertEmail(
          sub.user.name ?? "Investor",
          matches,
        );
        emailItems.push({
          to: { email: sub.user.email, name: sub.user.name ?? "Investor" },
          subject,
          htmlContent,
          textContent,
        });
      }

      await db.distressedAlertSubscription.update({
        where: { id: sub.id },
        data: { lastAlertedAt: now },
      });
    }

    let emailsSent = 0;
    if (!dryRun && emailItems.length > 0) {
      emailsSent = await sendBatchEmails(emailItems);
    }

    return {
      subscribersChecked: subs.length,
      matchedSubscribers,
      totalMatches,
      totalPriceDrops,
      emailsSent,
      dryRun,
    };
}

export const runDistressedSubscriberAlerts = baseProcedure
  .input(z.object({ authToken: z.string(), dryRun: z.boolean().optional() }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    if (!["ADMIN", "DEVELOPMENT_MANAGER"].includes(user.role)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required." });
    }
    return runSubscriberAlertsCore({ dryRun: input.dryRun });
  });
