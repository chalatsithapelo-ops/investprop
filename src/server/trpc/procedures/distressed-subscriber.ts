/**
 * Subscriber-facing distressed-deal access (read-only).
 *
 * The full /distressed-finder page is manager-gated. These procedures give
 * paying subscribers (DISTRESSED_FULL_ACCESS: PRO / ENTERPRISE / DISTRESSED)
 * an in-app, read-only way to browse AI-graded listings, see the full AI deal
 * breakdown, and grade an un-scored listing on demand. Nothing here can mutate
 * listings or the pipeline.
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { userHasFeature } from "~/server/subscriptions/subscription-service";
import { screenListingCore } from "~/server/trpc/procedures/distressed-ai";
import { computeDistressedMarketAnalysis } from "~/server/distressed/market-analysis";

const GRADE_RANK: Record<string, number> = { A: 5, B: 4, C: 3, D: 2, E: 1 };

/**
 * Derives a display-friendly price drop by comparing the current asking price
 * to the highest previously-recorded price. Returns nulls when there is no
 * meaningful (≥1%) drop. Mirrors the alert pipeline's drop semantics.
 */
function computePriceDrop(
  history: { askingPrice: number }[],
  current: number,
): { priceDropPct: number | null; previousPrice: number | null } {
  if (!history.length || current <= 0) return { priceDropPct: null, previousPrice: null };
  const prevMax = Math.max(...history.map((h) => h.askingPrice).filter((p) => p > 0), current);
  if (prevMax <= current) return { priceDropPct: null, previousPrice: null };
  const pct = ((prevMax - current) / prevMax) * 100;
  if (pct < 1) return { priceDropPct: null, previousPrice: null };
  return { priceDropPct: pct, previousPrice: prevMax };
}


const listingSelect = {
  id: true,
  title: true,
  propertyType: true,
  suburb: true,
  city: true,
  province: true,
  address: true,
  askingPrice: true,
  marketValue: true,
  discount: true,
  bedrooms: true,
  bathrooms: true,
  erfSize: true,
  floorSize: true,
  imageUrl: true,
  source: true,
  sourceUrl: true,
  auctionType: true,
  auctionDate: true,
  auctionVenue: true,
  aiGrade: true,
  aiRiskScore: true,
  aiSummary: true,
  aiScoredAt: true,
  createdAt: true,
} as const;

// ─── Browse (read-only, entitlement-gated) ─────────────────────
export const getSubscriberDistressedDeals = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      province: z.string().optional(),
      city: z.string().optional(),
      propertyType: z.string().optional(),
      maxPrice: z.number().positive().optional(),
      minDiscountPct: z.number().min(0).max(100).optional(),
      minAIGrade: z.enum(["A", "B", "C", "D", "E"]).optional(),
      onlyGraded: z.boolean().optional(),
      sortBy: z.enum(["newest", "discount", "price_asc", "ai_grade"]).optional().default("newest"),
      limit: z.number().min(1).max(60).optional().default(24),
      page: z.number().min(1).optional().default(1),
    }),
  )
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const entitled = await userHasFeature(user.id, user.role, "DISTRESSED_FULL_ACCESS");
    if (!entitled) {
      return { entitled: false as const, listings: [], totalCount: 0, totalPages: 0, currentPage: 1, newThisWeek: 0 };
    }

    const where: any = { status: { in: ["ACTIVE", "WATCHED"] } };
    if (input.province && input.province !== "all") where.province = input.province;
    if (input.city && input.city !== "all") where.city = { contains: input.city, mode: "insensitive" };
    if (input.propertyType && input.propertyType !== "all") where.propertyType = input.propertyType;
    if (input.maxPrice) where.askingPrice = { lte: input.maxPrice };
    if (input.minDiscountPct) where.discount = { gte: input.minDiscountPct };
    if (input.onlyGraded) where.aiGrade = { not: null };
    if (input.minAIGrade) {
      const allowed = ["A", "B", "C", "D", "E"].filter((g) => (GRADE_RANK[g] ?? 0) >= (GRADE_RANK[input.minAIGrade!] ?? 0));
      where.aiGrade = { in: allowed };
    }

    let orderBy: any = { createdAt: "desc" };
    switch (input.sortBy) {
      case "discount": orderBy = [{ discount: "desc" }, { createdAt: "desc" }]; break;
      case "price_asc": orderBy = { askingPrice: "asc" }; break;
      case "ai_grade": orderBy = [{ aiGrade: "asc" }, { aiRiskScore: "asc" }, { createdAt: "desc" }]; break;
      default: orderBy = { createdAt: "desc" };
    }

    const totalCount = await db.distressedListing.count({ where });
    const totalPages = Math.ceil(totalCount / input.limit);
    const skip = (input.page - 1) * input.limit;

    const listings = await db.distressedListing.findMany({
      where,
      orderBy,
      skip,
      take: input.limit,
      select: listingSelect,
    });

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const newThisWeek = await db.distressedListing.count({
      where: { status: { in: ["ACTIVE", "WATCHED"] }, createdAt: { gte: weekAgo } },
    });

    // Price-drop annotation: one grouped query over the page's listings.
    const priceRows = listings.length
      ? await db.distressedListingPriceHistory.findMany({
          where: { listingId: { in: listings.map((l) => l.id) } },
          select: { listingId: true, askingPrice: true },
        })
      : [];
    const historyByListing = new Map<number, { askingPrice: number }[]>();
    for (const row of priceRows) {
      const arr = historyByListing.get(row.listingId) ?? [];
      arr.push({ askingPrice: row.askingPrice });
      historyByListing.set(row.listingId, arr);
    }
    const annotated = listings.map((l) => ({
      ...l,
      ...computePriceDrop(historyByListing.get(l.id) ?? [], l.askingPrice),
    }));

    return {
      entitled: true as const,
      listings: annotated,
      totalCount,
      totalPages,
      currentPage: input.page,
      newThisWeek,
    };
  });

// ─── Single-listing detail with full AI breakdown ──────────────
export const getSubscriberDistressedDetail = baseProcedure
  .input(z.object({ authToken: z.string(), listingId: z.number() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const entitled = await userHasFeature(user.id, user.role, "DISTRESSED_FULL_ACCESS");
    if (!entitled) throw new TRPCError({ code: "FORBIDDEN", message: "Upgrade to a plan with distressed access." });

    const listing = await db.distressedListing.findUnique({
      where: { id: input.listingId },
      select: {
        ...listingSelect,
        description: true,
        aiUnderwriting: true,
        caseNumber: true,
        noReserve: true,
        auctionTime: true,
        priceHistory: { orderBy: { recordedAt: "asc" }, select: { askingPrice: true, recordedAt: true } },
      },
    });
    if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });
    return {
      ...listing,
      ...computePriceDrop(listing.priceHistory, listing.askingPrice),
    };
  });

// ─── On-demand AI grade (entitlement-gated, rate-limited) ──────
export const screenSubscriberDistressedDeal = baseProcedure
  .input(z.object({ authToken: z.string(), listingId: z.number() }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const entitled = await userHasFeature(user.id, user.role, "DISTRESSED_FULL_ACCESS");
    if (!entitled) throw new TRPCError({ code: "FORBIDDEN", message: "Upgrade to a plan with distressed access." });
    // force:false returns the cached grade if already scored, otherwise screens.
    return screenListingCore({ actorUserId: user.id, listingId: input.listingId, force: false });
  });

// ─── Market analysis (comparables, valuation, trend) ───────────
// Deterministic, no AI spend. Tells the subscriber whether a listing is a
// worthwhile investment using comparable distressed listings in the area.
export const getSubscriberDistressedMarketAnalysis = baseProcedure
  .input(z.object({ authToken: z.string(), listingId: z.number() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const entitled = await userHasFeature(user.id, user.role, "DISTRESSED_FULL_ACCESS");
    if (!entitled) throw new TRPCError({ code: "FORBIDDEN", message: "Upgrade to a plan with distressed access." });
    const analysis = await computeDistressedMarketAnalysis(input.listingId);
    if (!analysis) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });
    return analysis;
  });
