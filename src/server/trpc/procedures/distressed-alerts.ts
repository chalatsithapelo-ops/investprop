import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { createNotification } from "~/server/trpc/procedures/notifications";
import { createAuditLog } from "~/server/trpc/procedures/audit-log";
import { sendBatchEmails, type BatchEmailItem } from "~/server/utils/email";
import { userHasFeature } from "~/server/subscriptions/subscription-service";
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
  }[],
): { subject: string; htmlContent: string; textContent: string } {
  const count = listings.length;
  const subject = `${count} new distressed ${count === 1 ? "deal" : "deals"} match your alerts`;
  const base = env.BASE_URL ?? "";
  const rows = listings
    .map((l) => {
      const disc = l.discount != null ? `${Math.round(l.discount)}% below market` : "";
      const grade = l.aiGrade ? ` · Grade ${l.aiGrade}` : "";
      return `<tr><td style="padding:10px 0;border-bottom:1px solid #eee;">
        <strong>${l.title}</strong><br/>
        <span style="color:#555;">${l.city}, ${l.province} · R${Math.round(l.askingPrice).toLocaleString()} ${disc}${grade}</span>
      </td></tr>`;
    })
    .join("");
  const htmlContent = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
    <h2>New distressed deals for you, ${name}</h2>
    <p>${count} new ${count === 1 ? "listing matches" : "listings match"} your saved alert filters:</p>
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    <p style="margin-top:20px;">
      <a href="${base}/distressed-deals" style="background:#0d9488;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">View all deals</a>
    </p>
    <p style="color:#999;font-size:12px;margin-top:24px;">Manage your alerts at ${base}/distressed-alerts</p>
  </div>`;
  const textContent =
    `New distressed deals for you, ${name}:\n\n` +
    listings
      .map(
        (l) =>
          `- ${l.title} — ${l.city}, ${l.province} — R${Math.round(l.askingPrice).toLocaleString()}` +
          (l.discount != null ? ` (${Math.round(l.discount)}% below market)` : ""),
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

      const matches = candidates.filter((l) => matchesFilters(l, filters)).slice(0, 10);
      if (matches.length === 0) continue;

      matchedSubscribers += 1;
      totalMatches += matches.length;

      if (dryRun) continue;

      if (sub.channelPush) {
        await createNotification(
          sub.user.id,
          `${matches.length} new distressed ${matches.length === 1 ? "deal" : "deals"}`,
          `${matches.length} new ${matches.length === 1 ? "listing matches" : "listings match"} your distressed-deal alerts.`,
          "INFO",
          "PROPERTY",
          matches[0]!.id,
        );
      }

      if (sub.channelEmail && sub.user.email) {
        const { subject, htmlContent, textContent } = buildAlertEmail(
          sub.user.name ?? "Investor",
          matches.map((m) => ({
            id: m.id,
            title: m.title,
            city: m.city,
            province: m.province,
            askingPrice: m.askingPrice,
            discount: m.discount,
            aiGrade: m.aiGrade,
          })),
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
