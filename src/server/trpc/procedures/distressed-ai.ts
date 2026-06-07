/**
 * AI screening + workflow procedures for distressed listings.
 *
 *   screenDistressedListing  — cheap-tier quick AI grade (A-E) + plain summary
 *   screenDistressedBatch    — bulk-grade all unscreened listings (manager trigger)
 *   promoteDistressedToProperty — convert a distressed listing into a Property row
 *                                  (pre-fills enough that the manager can finish in PropertyForm)
 *   getDistressedPriceHistory — price-over-time for a single listing
 *   runDistressedDedup       — fuzzy-merge listings that look like the same property
 *                              across multiple sources (city + suburb + ±5% price)
 *   runDistressedReminders   — manual trigger for auction (7/3/1 day) reminders
 *                              and price-drop alerts; emits Notification rows for
 *                              favouriters. Safe to re-run; tracked via remindersSent.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { generateText } from "ai";
import { randomUUID } from "node:crypto";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";
import { getModel, getModelId, runAIWithGuard, safeParseJson } from "~/server/ai/client";

const RATINGS = new Set(["A", "B", "C", "D", "E"]);

interface ScreeningShape {
  grade: "A" | "B" | "C" | "D" | "E";
  riskScore: number;
  summary: string;
  pros: string[];
  cons: string[];
  redFlags: string[];
  recommendations: string[];
}

function normaliseScreen(parsed: unknown): ScreeningShape | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Partial<ScreeningShape>;
  if (typeof p.summary !== "string") return null;
  const grade = RATINGS.has(p.grade ?? "") ? p.grade! : "C";
  const score = Math.max(0, Math.min(100, Math.round(Number(p.riskScore ?? 50))));
  return {
    grade,
    riskScore: score,
    summary: p.summary,
    pros: Array.isArray(p.pros) ? p.pros.slice(0, 6) : [],
    cons: Array.isArray(p.cons) ? p.cons.slice(0, 6) : [],
    redFlags: Array.isArray(p.redFlags) ? p.redFlags.slice(0, 6) : [],
    recommendations: Array.isArray(p.recommendations) ? p.recommendations.slice(0, 6) : [],
  };
}

async function buildListingContext(listingId: number) {
  const l = await db.distressedListing.findUnique({ where: { id: listingId } });
  if (!l) return null;
  const lines: string[] = [
    `Title: ${l.title}`,
    `Source: ${l.source}`,
    `Type: ${l.propertyType}`,
    `Location: ${l.suburb ? l.suburb + ", " : ""}${l.city}, ${l.province}`,
    `Asking Price: R${(l.askingPrice ?? 0).toLocaleString()}`,
  ];
  if (l.marketValue) lines.push(`Estimated Market Value: R${l.marketValue.toLocaleString()}`);
  if (l.discount) lines.push(`Discount vs market: ${l.discount.toFixed(0)}%`);
  if (l.bedrooms) lines.push(`Bedrooms: ${l.bedrooms}`);
  if (l.bathrooms) lines.push(`Bathrooms: ${l.bathrooms}`);
  if (l.erfSize) lines.push(`Erf size: ${l.erfSize} m²`);
  if (l.floorSize) lines.push(`Floor size: ${l.floorSize} m²`);
  if (l.auctionType) lines.push(`Auction type: ${l.auctionType}`);
  if (l.auctionDate) lines.push(`Auction date: ${l.auctionDate.toISOString().slice(0, 10)}`);
  if (l.auctionVenue) lines.push(`Venue: ${l.auctionVenue}`);
  if (l.noReserve) lines.push(`No reserve: yes`);
  if (l.caseNumber) lines.push(`Case number: ${l.caseNumber}`);
  if (l.description) lines.push(`Description: ${l.description.slice(0, 1500)}`);
  return { listing: l, text: lines.join("\n") };
}

export const screenDistressedListing = baseProcedure
  .input(z.object({ authToken: z.string(), listingId: z.number(), force: z.boolean().optional() }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"]);

    const ctx = await buildListingContext(input.listingId);
    if (!ctx) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });

    if (!input.force && ctx.listing.aiGrade) {
      return {
        grade: ctx.listing.aiGrade,
        riskScore: ctx.listing.aiRiskScore,
        summary: ctx.listing.aiSummary,
        underwriting: ctx.listing.aiUnderwriting,
        scoredAt: ctx.listing.aiScoredAt,
        cached: true,
      };
    }

    const systemPrompt = `You are Investprop's quick-screen analyst for distressed property opportunities in South Africa.

Given one distressed/auction listing, return ONLY JSON in this exact shape (no prose, no fences):
{
  "grade": "A" | "B" | "C" | "D" | "E",
  "riskScore": <integer 0-100, higher = more risk>,
  "summary": "<2-3 short sentences, ZA English, plain language, mention area, price vs market, what type of buyer this suits.>",
  "pros": ["<bullet, max 12 words>"],
  "cons": ["<bullet, max 12 words>"],
  "redFlags": ["<bullet, only true risks, max 12 words>"],
  "recommendations": ["<imperative bullet, max 12 words>"]
}

Grade rubric (be honest, don't inflate):
- A: clear discount (>30%), good area, sound numbers, low risk profile.
- B: real discount (15-30%), decent area, manageable risks.
- C: marginal discount (5-15%) OR average area OR thin info.
- D: small/no discount, weak area, multiple risks.
- E: red flags — overpriced, unsafe area, missing critical info, legal issues.

Risk score:
- 0-25: low risk
- 26-50: moderate
- 51-75: high
- 76-100: very high / avoid

South African context: factor in transfer duty, bond registration, rates clearance, occupants-in-possession, sheriff auction quirks (cash deposit, no cooling-off).`;

    const userPrompt = `LISTING:\n${ctx.text}\n\nReturn the JSON object now.`;

    const result = await runAIWithGuard({
      userId: user.id,
      feature: "distress",
      model: getModelId("cheap"),
      metadata: { listingId: input.listingId },
      run: () => generateText({ model: getModel("cheap"), system: systemPrompt, prompt: userPrompt }),
      extractUsage: (r) => ({ promptTokens: r.usage?.promptTokens, completionTokens: r.usage?.completionTokens }),
    });

    const parsed = normaliseScreen(safeParseJson(result.text));
    if (!parsed) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "AI returned an unparseable screen." });

    await db.distressedListing.update({
      where: { id: input.listingId },
      data: {
        aiGrade: parsed.grade,
        aiRiskScore: parsed.riskScore,
        aiSummary: parsed.summary,
        aiUnderwriting: {
          pros: parsed.pros,
          cons: parsed.cons,
          redFlags: parsed.redFlags,
          recommendations: parsed.recommendations,
        },
        aiScoredAt: new Date(),
      },
    });

    return { ...parsed, cached: false };
  });

export const screenDistressedBatch = baseProcedure
  .input(z.object({ authToken: z.string(), limit: z.number().min(1).max(50).optional().default(20) }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"]);

    // Find listings that have never been screened (or are stale > 30 days)
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const listings = await db.distressedListing.findMany({
      where: {
        status: { in: ["ACTIVE", "WATCHED"] },
        OR: [{ aiGrade: null }, { aiScoredAt: { lt: cutoff } }],
      },
      take: input.limit,
      orderBy: [{ isFavourited: "desc" }, { createdAt: "desc" }],
    });

    let screened = 0;
    let failed = 0;
    for (const l of listings) {
      try {
        const ctx = await buildListingContext(l.id);
        if (!ctx) { failed++; continue; }
        const systemPrompt = `Return ONLY JSON: {"grade":"A-E","riskScore":0-100,"summary":"2-3 plain sentences","pros":["..."],"cons":["..."],"redFlags":["..."],"recommendations":["..."]}. Grade harshly. South African distressed property context.`;
        const result = await runAIWithGuard({
          userId: user.id,
          feature: "distress",
          model: getModelId("cheap"),
          metadata: { listingId: l.id, batch: true },
          run: () => generateText({ model: getModel("cheap"), system: systemPrompt, prompt: ctx.text }),
          extractUsage: (r) => ({ promptTokens: r.usage?.promptTokens, completionTokens: r.usage?.completionTokens }),
        });
        const parsed = normaliseScreen(safeParseJson(result.text));
        if (!parsed) { failed++; continue; }
        await db.distressedListing.update({
          where: { id: l.id },
          data: {
            aiGrade: parsed.grade,
            aiRiskScore: parsed.riskScore,
            aiSummary: parsed.summary,
            aiUnderwriting: {
              pros: parsed.pros, cons: parsed.cons, redFlags: parsed.redFlags, recommendations: parsed.recommendations,
            },
            aiScoredAt: new Date(),
          },
        });
        screened++;
      } catch {
        failed++;
      }
    }
    return { screened, failed, attempted: listings.length };
  });

export const getDistressedPriceHistory = baseProcedure
  .input(z.object({ authToken: z.string(), listingId: z.number() }))
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    const history = await db.distressedListingPriceHistory.findMany({
      where: { listingId: input.listingId },
      orderBy: { recordedAt: "asc" },
    });
    return history;
  });

/** Get up to 10 comparable distressed listings in the same suburb/city (excluding the source listing).
 *  Helps a manager see whether a price is fair vs the local market. */
export const getDistressedComparables = baseProcedure
  .input(z.object({ authToken: z.string(), listingId: z.number() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "ADMIN"], "Manager-only");

    const subject = await db.distressedListing.findUnique({
      where: { id: input.listingId },
      select: { id: true, suburb: true, city: true, province: true, propertyType: true, askingPrice: true, bedrooms: true },
    });
    if (!subject) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });
    }

    // Layer 1: same suburb + similar property type
    const sameSuburb = subject.suburb
      ? await db.distressedListing.findMany({
          where: {
            id: { not: subject.id },
            suburb: subject.suburb,
            propertyType: subject.propertyType ?? undefined,
            status: { in: ["ACTIVE", "SOLD", "EXPIRED"] },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            title: true,
            askingPrice: true,
            marketValue: true,
            propertyType: true,
            bedrooms: true,
            bathrooms: true,
            suburb: true,
            city: true,
            status: true,
            source: true,
            sourceUrl: true,
            aiGrade: true,
            createdAt: true,
            convertedToPropertyId: true,
          },
        })
      : [];

    // Layer 2: same city + property type (fill if suburb is sparse)
    const sameCity =
      sameSuburb.length < 5
        ? await db.distressedListing.findMany({
            where: {
              id: { not: subject.id },
              city: subject.city ?? undefined,
              propertyType: subject.propertyType ?? undefined,
              status: { in: ["ACTIVE", "SOLD", "EXPIRED"] },
              NOT: { id: { in: sameSuburb.map((s) => s.id) } },
            },
            orderBy: { createdAt: "desc" },
            take: 10 - sameSuburb.length,
            select: {
              id: true,
              title: true,
              askingPrice: true,
              marketValue: true,
              propertyType: true,
              bedrooms: true,
              bathrooms: true,
              suburb: true,
              city: true,
              status: true,
              source: true,
              sourceUrl: true,
              aiGrade: true,
              createdAt: true,
              convertedToPropertyId: true,
            },
          })
        : [];

    const comparables = [...sameSuburb, ...sameCity];
    const prices = comparables.map((c) => Number(c.askingPrice)).filter((p) => p > 0);
    const median = prices.length === 0 ? null : prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)] ?? null;
    const avg = prices.length === 0 ? null : prices.reduce((s, p) => s + p, 0) / prices.length;

    return {
      subject,
      comparables,
      summary: {
        count: comparables.length,
        medianAskingPrice: median,
        avgAskingPrice: avg,
        priceVsMedian: subject.askingPrice && median ? ((subject.askingPrice - median) / median) * 100 : null,
      },
    };
  });

export const promoteDistressedToProperty = baseProcedure
  .input(z.object({
    authToken: z.string(),
    listingId: z.number(),
    overrides: z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      fundingGoal: z.number().optional(),
      expectedReturns: z.number().optional(),
      investmentStatus: z.string().optional(),
    }).optional(),
  }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["ADMIN", "DEVELOPMENT_MANAGER"]);

    const listing = await db.distressedListing.findUnique({ where: { id: input.listingId } });
    if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });
    if (listing.convertedToPropertyId) {
      throw new TRPCError({ code: "CONFLICT", message: `Already promoted as property #${listing.convertedToPropertyId}` });
    }

    const overrides = input.overrides ?? {};
    const seedFunding = overrides.fundingGoal ?? listing.askingPrice;
    const seedTitle = overrides.title ?? listing.title;
    const seedDesc = overrides.description ?? [
      listing.description ?? `Distressed property sourced from ${listing.source}.`,
      listing.auctionDate ? `Auction: ${listing.auctionDate.toISOString().slice(0,10)}${listing.auctionTime ? " " + listing.auctionTime : ""}.` : "",
      listing.auctionVenue ? `Venue: ${listing.auctionVenue}.` : "",
      listing.caseNumber ? `Case number: ${listing.caseNumber}.` : "",
    ].filter(Boolean).join("\n\n");

    const property = await db.property.create({
      data: {
        title: seedTitle,
        description: seedDesc,
        address: listing.address ?? listing.suburb ?? listing.city,
        city: listing.city,
        state: listing.province,
        zipCode: "",
        price: listing.askingPrice,
        imageUrl: listing.imageUrl ?? "",
        imageUrls: listing.imageUrl ? [listing.imageUrl] : [],
        status: "AVAILABLE",
        investmentStatus: (overrides.investmentStatus as any) ?? "PLANNING",
        fundingGoal: seedFunding,
        fundingRaised: 0,
        isPublished: false,
        minimumInvestment: 500,
        expectedReturns: overrides.expectedReturns ?? 0,
        bedrooms: listing.bedrooms ?? undefined,
        bathrooms: listing.bathrooms ?? undefined,
        squareMeters: listing.floorSize ? Math.round(listing.floorSize) : undefined,
        userId: user.id,
      },
    });

    await db.distressedListing.update({
      where: { id: listing.id },
      data: {
        convertedToPropertyId: property.id,
        convertedAt: new Date(),
        status: "SOLD", // remove from active pipeline view; admin can flip back if cancelled
      },
    });

    return { propertyId: property.id, title: property.title };
  });

// ─── Dedup ────────────────────────────────────────────────────────
// Fuzzy match: same city + (suburb match OR street match) + asking price within 5%.
// Assigns a shared dedupGroupId to all members. Runs in O(n^2) over active set —
// fine for current volume (low thousands). Pull into a worker if it grows.

function normaliseString(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

export const runDistressedDedup = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"]);

    const listings = await db.distressedListing.findMany({
      where: { status: { in: ["ACTIVE", "WATCHED"] } },
      orderBy: { createdAt: "asc" },
    });

    // Reset all dedupGroupIds first (cheap and avoids drift across runs)
    await db.distressedListing.updateMany({
      where: { dedupGroupId: { not: null } },
      data: { dedupGroupId: null },
    });

    type Group = { id: string; members: number[] };
    const groups: Group[] = [];
    const assigned = new Map<number, string>();

    const lToKey = listings.map((l) => ({
      l,
      city: normaliseString(l.city),
      suburb: normaliseString(l.suburb),
      street: normaliseString(l.address).split(" ").slice(0, 3).join(" "),
      price: l.askingPrice,
    }));

    for (let i = 0; i < lToKey.length; i++) {
      for (let j = i + 1; j < lToKey.length; j++) {
        const a = lToKey[i];
        const b = lToKey[j];
        if (!a || !b) continue;
        if (!a.city || a.city !== b.city) continue;
        const suburbMatch = a.suburb && a.suburb === b.suburb;
        const streetMatch = a.street && b.street && a.street.length >= 4 && a.street === b.street;
        if (!suburbMatch && !streetMatch) continue;
        if (a.price <= 0 || b.price <= 0) continue;
        const diff = Math.abs(a.price - b.price) / Math.max(a.price, b.price);
        if (diff > 0.05) continue;

        // Same group
        const gIdA = assigned.get(a.l.id);
        const gIdB = assigned.get(b.l.id);
        if (gIdA && gIdB && gIdA === gIdB) continue;
        if (gIdA && !gIdB) {
          assigned.set(b.l.id, gIdA);
          groups.find((g) => g.id === gIdA)?.members.push(b.l.id);
        } else if (gIdB && !gIdA) {
          assigned.set(a.l.id, gIdB);
          groups.find((g) => g.id === gIdB)?.members.push(a.l.id);
        } else if (!gIdA && !gIdB) {
          const newId = randomUUID();
          assigned.set(a.l.id, newId);
          assigned.set(b.l.id, newId);
          groups.push({ id: newId, members: [a.l.id, b.l.id] });
        } else if (gIdA && gIdB && gIdA !== gIdB) {
          // Merge group B into A
          const target = gIdA;
          const source = gIdB;
          const srcGroup = groups.find((g) => g.id === source);
          if (srcGroup) {
            for (const memberId of srcGroup.members) {
              assigned.set(memberId, target);
              groups.find((g) => g.id === target)?.members.push(memberId);
            }
            srcGroup.members.length = 0;
          }
        }
      }
    }

    // Persist
    let updated = 0;
    for (const [listingId, groupId] of assigned.entries()) {
      await db.distressedListing.update({
        where: { id: listingId },
        data: { dedupGroupId: groupId },
      });
      updated++;
    }

    const liveGroups = groups.filter((g) => g.members.length > 0);
    return { groupsFound: liveGroups.length, listingsGrouped: updated, totalListings: listings.length };
  });

// ─── Reminders (manual trigger for now; wire to cron when scheduler exists) ───

export const runDistressedReminders = baseProcedure
  .input(z.object({ authToken: z.string(), priceDropThresholdPct: z.number().optional().default(10) }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["ADMIN", "DEVELOPMENT_MANAGER"]);

    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const in1Day = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

    let auctionReminders = 0;
    let priceDropAlerts = 0;

    // ── Auction reminders ──────────────────────────────────────
    const watched = await db.distressedListing.findMany({
      where: {
        isFavourited: true,
        status: { in: ["ACTIVE", "WATCHED"] },
        auctionDate: { gte: now, lte: in7Days },
        addedById: { not: null },
      },
    });

    for (const l of watched) {
      if (!l.addedById || !l.auctionDate) continue;
      const days = Math.ceil((l.auctionDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      const sent = (l.remindersSent ?? {}) as Record<string, string>;
      let key: "auction7" | "auction3" | "auction1" | null = null;
      if (days <= 1 && !sent.auction1) key = "auction1";
      else if (days <= 3 && !sent.auction3) key = "auction3";
      else if (days <= 7 && !sent.auction7) key = "auction7";
      if (!key) continue;

      await db.notification.create({
        data: {
          userId: l.addedById,
          title: `Auction in ${days} day${days === 1 ? "" : "s"}: ${l.title}`,
          message: `${l.suburb ? l.suburb + ", " : ""}${l.city} · R${l.askingPrice.toLocaleString()} · ${l.auctionVenue ?? "venue TBC"} · ${l.auctionDate.toISOString().slice(0,10)}${l.auctionTime ? " " + l.auctionTime : ""}`,
          type: "AUCTION_REMINDER",
          category: "distressed",
          relatedId: l.id,
        },
      });

      await db.distressedListing.update({
        where: { id: l.id },
        data: { remindersSent: { ...sent, [key]: now.toISOString() } },
      });
      auctionReminders++;
    }

    // ── Price-drop alerts ──────────────────────────────────────
    const watchedAll = await db.distressedListing.findMany({
      where: { isFavourited: true, status: { in: ["ACTIVE", "WATCHED"] }, addedById: { not: null } },
      include: { priceHistory: { orderBy: { recordedAt: "asc" } } },
    });

    for (const l of watchedAll) {
      if (!l.addedById || l.priceHistory.length < 2) continue;
      const sent = (l.remindersSent ?? {}) as Record<string, any>;
      const first = l.priceHistory[0]!.askingPrice;
      const current = l.askingPrice;
      if (first <= 0 || current >= first) continue;
      const dropPct = ((first - current) / first) * 100;
      if (dropPct < input.priceDropThresholdPct) continue;
      // Only notify once per fresh drop threshold
      if (sent.priceDropFromR && sent.priceDropFromR <= current) continue;

      await db.notification.create({
        data: {
          userId: l.addedById,
          title: `Price dropped ${dropPct.toFixed(0)}% on ${l.title}`,
          message: `${l.suburb ? l.suburb + ", " : ""}${l.city} · Was R${first.toLocaleString()} → now R${current.toLocaleString()}`,
          type: "PRICE_DROP",
          category: "distressed",
          relatedId: l.id,
        },
      });

      await db.distressedListing.update({
        where: { id: l.id },
        data: { remindersSent: { ...sent, priceDropFromR: current } },
      });
      priceDropAlerts++;
    }

    return { auctionReminders, priceDropAlerts, watchedScanned: watchedAll.length };
  });
