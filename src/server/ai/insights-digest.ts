/**
 * Proactive weekly AI deal digest.
 *
 * For each active investor (not opted out, not digested in the last 6 days) we
 * surface the best open opportunities + distressed deals that fit their stated
 * preferences, ranked by the AI grades already computed by the underwriting and
 * distressed engines. Delivered via in-app notification + email.
 *
 * Deliberately data-driven (no per-user LLM call) so it scales to the whole
 * investor base at near-zero marginal cost — the "AI" is the pre-computed
 * confidence ratings and distressed grades each item already carries.
 */
import { db } from "~/server/db";
import { env } from "~/server/env";
import { createNotification } from "~/server/trpc/procedures/notifications";
import { sendBatchEmails, type BatchEmailItem } from "~/server/utils/email";
import { propertyMatchesPreferences } from "~/server/utils/investor-notifications";

const GRADE_RANK: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, E: 1 };
const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;

type OppItem = {
  id: number;
  title: string;
  city: string;
  state: string;
  price: number;
  minimumInvestment: number;
  grade: string | null;
  expected: number | null;
};

type DistressedItem = {
  id: number;
  title: string;
  city: string;
  province: string;
  askingPrice: number;
  discount: number | null;
  grade: string | null;
};

/** Derive the loose preference shape used by propertyMatchesPreferences. */
function prefsOf(raw: unknown) {
  return (raw ?? null) as Parameters<typeof propertyMatchesPreferences>[0];
}

/** Pick the best open opportunities for one investor (pref-filtered, grade-ranked). */
function rankOpportunities(
  opps: {
    id: number;
    title: string;
    city: string;
    state: string;
    price: number;
    minimumInvestment: number;
    aiConfidenceRating: string | null;
    expectedReturns: number | null;
    propertyType: string;
    developmentType: string | null;
  }[],
  prefsRaw: unknown,
): OppItem[] {
  const prefs = prefsOf(prefsRaw);
  const matched = opps.filter((o) =>
    propertyMatchesPreferences(prefs, {
      propertyId: o.id,
      title: o.title,
      propertyType: o.propertyType,
      developmentType: o.developmentType ?? undefined,
      price: o.price,
      address: "",
      city: o.city,
      state: o.state,
      investmentStatus: "RAISING_FUNDS",
    }),
  );
  return matched
    .sort((a, b) => {
      const ga = a.aiConfidenceRating ? GRADE_RANK[a.aiConfidenceRating] ?? 0 : 0;
      const gb = b.aiConfidenceRating ? GRADE_RANK[b.aiConfidenceRating] ?? 0 : 0;
      if (gb !== ga) return gb - ga;
      return (b.expectedReturns ?? 0) - (a.expectedReturns ?? 0);
    })
    .slice(0, 3)
    .map((o) => ({
      id: o.id,
      title: o.title,
      city: o.city,
      state: o.state,
      price: o.price,
      minimumInvestment: o.minimumInvestment,
      grade: o.aiConfidenceRating,
      expected: o.expectedReturns,
    }));
}

function buildDigestEmail(
  name: string,
  opps: OppItem[],
  distressed: DistressedItem[],
): { subject: string; htmlContent: string; textContent: string } {
  const base = env.BASE_URL ?? "";
  const money = (n: number) => `R${Math.round(n).toLocaleString("en-ZA")}`;
  const total = opps.length + distressed.length;
  const subject = `Your weekly deals: ${total} ${total === 1 ? "pick" : "picks"} matched to you`;

  const oppRows = opps
    .map((o) => {
      const grade = o.grade ? ` · Grade ${o.grade}` : "";
      const ret = o.expected ? ` · ${o.expected.toFixed(1)}% expected` : "";
      return `<tr><td style="padding:12px 0;border-bottom:1px solid #eee;">
        <a href="${base}/properties/${o.id}" style="color:#111;text-decoration:none;font-weight:600;">${o.title}</a><br/>
        <span style="color:#555;">${o.city}, ${o.state} · ${money(o.price)} · from ${money(o.minimumInvestment)}${grade}${ret}</span>
      </td></tr>`;
    })
    .join("");

  const distressedRows = distressed
    .map((d) => {
      const disc = d.discount != null ? ` · ${Math.round(d.discount)}% below market` : "";
      const grade = d.grade ? ` · Grade ${d.grade}` : "";
      return `<tr><td style="padding:12px 0;border-bottom:1px solid #eee;">
        <a href="${base}/distressed-deals" style="color:#111;text-decoration:none;font-weight:600;">${d.title}</a><br/>
        <span style="color:#555;">${d.city}, ${d.province} · ${money(d.askingPrice)}${disc}${grade}</span>
      </td></tr>`;
    })
    .join("");

  const htmlContent = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#111;">
    <h2 style="margin-bottom:4px;">Your weekly deal digest, ${name}</h2>
    <p style="color:#555;margin-top:0;">Hand-picked by Investprop's AI from this week's listings, matched to your preferences.</p>
    ${opps.length ? `<h3 style="margin:24px 0 4px;">Investment opportunities</h3>
    <table style="width:100%;border-collapse:collapse;">${oppRows}</table>` : ""}
    ${distressed.length ? `<h3 style="margin:24px 0 4px;">Below-market & distressed</h3>
    <table style="width:100%;border-collapse:collapse;">${distressedRows}</table>` : ""}
    <p style="margin-top:24px;">
      <a href="${base}/investments/opportunities" style="background:#0d9488;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Browse all opportunities</a>
    </p>
    <p style="color:#999;font-size:12px;margin-top:24px;">You're receiving this because you're an Investprop investor. Manage or turn off these emails at ${base}/investments/preferences</p>
  </div>`;

  const lines: string[] = [`Your weekly deal digest, ${name}:`, ""];
  if (opps.length) {
    lines.push("Investment opportunities:");
    for (const o of opps) {
      lines.push(
        `- ${o.title} — ${o.city}, ${o.state} — ${money(o.price)} (from ${money(o.minimumInvestment)})` +
          (o.grade ? ` [Grade ${o.grade}]` : ""),
      );
    }
    lines.push("");
  }
  if (distressed.length) {
    lines.push("Below-market & distressed:");
    for (const d of distressed) {
      lines.push(
        `- ${d.title} — ${d.city}, ${d.province} — ${money(d.askingPrice)}` +
          (d.discount != null ? ` (${Math.round(d.discount)}% below market)` : ""),
      );
    }
    lines.push("");
  }
  lines.push(`Browse all: ${base}/investments/opportunities`);
  lines.push(`Manage emails: ${base}/investments/preferences`);

  return { subject, htmlContent, textContent: lines.join("\n") };
}

/** Core weekly-digest run. Reusable by the cron handler, scheduler and admin trigger. */
export async function runWeeklyDigestCore(opts: { dryRun?: boolean } = {}) {
  const dryRun = opts.dryRun ?? false;
  const now = new Date();
  const cutoff = new Date(now.getTime() - SIX_DAYS_MS);

  const investors = await db.user.findMany({
    where: {
      role: "INVESTOR",
      status: "ACTIVE",
      aiDigestOptOut: false,
      OR: [{ aiDigestLastSentAt: null }, { aiDigestLastSentAt: { lt: cutoff } }],
    },
    select: { id: true, name: true, email: true, investorPreferences: true },
  });

  // Shared candidate pools (fetched once, filtered per-investor).
  const openOpps = await db.property.findMany({
    where: { isPublished: true, investmentStatus: "RAISING_FUNDS", deletedAt: null },
    select: {
      id: true,
      title: true,
      city: true,
      state: true,
      price: true,
      minimumInvestment: true,
      aiConfidenceRating: true,
      expectedReturns: true,
      propertyFlip: { select: { id: true } },
      rentalBond: { select: { id: true } },
      propertyDevelopment: { select: { developmentType: true } },
    },
    take: 100,
    orderBy: { createdAt: "desc" },
  });

  const oppPool = openOpps.map((o) => ({
    id: o.id,
    title: o.title,
    city: o.city,
    state: o.state,
    price: o.price,
    minimumInvestment: o.minimumInvestment,
    aiConfidenceRating: o.aiConfidenceRating,
    expectedReturns: o.expectedReturns,
    propertyType: o.propertyFlip ? "flip" : o.rentalBond ? "rental" : o.propertyDevelopment ? "development" : "other",
    developmentType: o.propertyDevelopment?.developmentType ?? null,
  }));

  const topDistressed = await db.distressedListing.findMany({
    where: { status: { in: ["ACTIVE", "WATCHED"] }, aiGrade: { in: ["A", "B"] } },
    select: {
      id: true,
      title: true,
      city: true,
      province: true,
      askingPrice: true,
      discount: true,
      aiGrade: true,
    },
    orderBy: [{ aiGrade: "asc" }, { discount: "desc" }],
    take: 30,
  });

  const emailItems: BatchEmailItem[] = [];
  let notified = 0;

  for (const inv of investors) {
    const opps = rankOpportunities(oppPool, inv.investorPreferences);

    const prefs = prefsOf(inv.investorPreferences) as { preferredLocations?: string[]; preferredCities?: string[]; preferredStates?: string[] } | null;
    const locPrefs = [
      ...(prefs?.preferredLocations ?? []),
      ...(prefs?.preferredCities ?? []),
      ...(prefs?.preferredStates ?? []),
    ].map((s) => s.trim().toLowerCase());
    const distressed: DistressedItem[] = topDistressed
      .filter((d) => {
        if (locPrefs.length === 0) return true;
        const tokens = [d.city, d.province].filter(Boolean).map((s) => s.toLowerCase());
        return locPrefs.some((p) => tokens.some((t) => t.includes(p) || p.includes(t)));
      })
      .slice(0, 3)
      .map((d) => ({
        id: d.id,
        title: d.title,
        city: d.city,
        province: d.province,
        askingPrice: d.askingPrice,
        discount: d.discount,
        grade: d.aiGrade,
      }));

    if (opps.length === 0 && distressed.length === 0) continue;

    notified += 1;
    if (dryRun) continue;

    const count = opps.length + distressed.length;
    await createNotification(
      inv.id,
      `${count} new ${count === 1 ? "deal" : "deals"} matched to you`,
      `Your weekly AI digest is ready: ${opps.length} investment ${opps.length === 1 ? "opportunity" : "opportunities"}${distressed.length ? ` and ${distressed.length} below-market ${distressed.length === 1 ? "deal" : "deals"}` : ""} picked for you.`,
      "INFO",
      "PROPERTY",
      opps[0]?.id ?? distressed[0]?.id ?? null,
    );

    if (inv.email) {
      const { subject, htmlContent, textContent } = buildDigestEmail(inv.name ?? "Investor", opps, distressed);
      emailItems.push({ to: { email: inv.email, name: inv.name ?? "Investor" }, subject, htmlContent, textContent });
    }

    await db.user.update({ where: { id: inv.id }, data: { aiDigestLastSentAt: now } });
  }

  let emailsSent = 0;
  if (!dryRun && emailItems.length > 0) {
    emailsSent = await sendBatchEmails(emailItems);
  }

  return {
    investorsChecked: investors.length,
    notified,
    emailsSent,
    openOpportunities: oppPool.length,
    distressedCandidates: topDistressed.length,
    dryRun,
  };
}
