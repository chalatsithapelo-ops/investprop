import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { runFullScrape, getSourceInfo } from "~/server/scrapers/distressed-property-scraper";

// ─── Get Distressed Listings ──────────────────────────────────────

export const getDistressedListings = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      maxPrice: z.number().optional().default(450000),
      minMarketValue: z.number().optional(),
      province: z.string().optional().default("Gauteng"),
      city: z.string().optional(),
      source: z.string().optional(),
      auctionType: z.string().optional(),
      propertyType: z.string().optional(),
      status: z.enum(["ACTIVE", "SOLD", "WITHDRAWN", "EXPIRED", "WATCHED"]).optional(),
      onlyUpcoming: z.boolean().optional(), // only show future auction dates
      onlyFavourited: z.boolean().optional(),
      onlyAIScored: z.boolean().optional(),
      minAIGrade: z.enum(["A", "B", "C", "D", "E"]).optional(),
      sortBy: z.enum(["recommended", "price_asc", "price_desc", "date_asc", "date_desc", "newest", "discount", "ai_grade"]).optional().default("recommended"),
      limit: z.number().min(1).max(100).optional().default(20),
      page: z.number().min(1).optional().default(1),
    })
  )
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);

    const isStudentFilter = input.propertyType === "STUDENT";

    const where: any = {
      province: input.province === "all" ? undefined : input.province,
    };
    if (where.province === undefined) delete where.province;

    // Student accommodation has no price cap (investment properties like R2M+ buildings).
    // All other property types keep the normal max-price filter.
    if (!isStudentFilter) {
      where.askingPrice = { lte: input.maxPrice };
    }

    if (input.minMarketValue) where.marketValue = { gte: input.minMarketValue };
    if (input.city && input.city !== "all") where.city = { contains: input.city, mode: "insensitive" };
    if (input.source && input.source !== "all") where.source = input.source;
    if (input.auctionType && input.auctionType !== "all") where.auctionType = input.auctionType;
    if (input.propertyType && input.propertyType !== "all") {
      if (input.propertyType === "HOUSE") {
        where.propertyType = { in: ["HOUSE", "RESIDENTIAL"] };
      } else if (input.propertyType === "HOUSE_STANDALONE") {
        // Standalone houses: HOUSE/RESIDENTIAL whose title/description does
        // NOT mention apartment/flat/unit/townhouse/duplex/sectional.
        const apartmentKeywords = ["apartment", "flat", "unit ", "townhouse", "duplex", "sectional"];
        where.propertyType = { in: ["HOUSE", "RESIDENTIAL"] };
        where.AND = [
          ...apartmentKeywords.map(kw => ({
            AND: [
              { NOT: { title: { contains: kw, mode: "insensitive" as const } } },
              { NOT: { description: { contains: kw, mode: "insensitive" as const } } },
            ],
          })),
        ];
      } else if (input.propertyType === "HOUSE_APARTMENT") {
        // Apartments / flats / townhouses / sectional title units.
        where.propertyType = { in: ["HOUSE", "RESIDENTIAL"] };
        where.OR = [
          { title: { contains: "apartment", mode: "insensitive" } },
          { title: { contains: "flat", mode: "insensitive" } },
          { title: { contains: "unit ", mode: "insensitive" } },
          { title: { contains: "townhouse", mode: "insensitive" } },
          { title: { contains: "duplex", mode: "insensitive" } },
          { title: { contains: "sectional", mode: "insensitive" } },
          { description: { contains: "apartment", mode: "insensitive" } },
          { description: { contains: "flat", mode: "insensitive" } },
          { description: { contains: "townhouse", mode: "insensitive" } },
        ];
      } else if (input.propertyType === "STUDENT") {
        where.propertyType = "STUDENT";
      } else {
        where.propertyType = input.propertyType;
      }
    }
    if (input.status) {
      where.status = input.status;
    } else {
      where.status = { in: ["ACTIVE", "WATCHED"] };
    }
    if (input.onlyUpcoming) where.auctionDate = { gte: new Date() };
    if (input.onlyFavourited) where.isFavourited = true;
    if (input.onlyAIScored) where.aiGrade = { not: null };
    if (input.minAIGrade) {
      // Grade order: A < B < C < D < E (lexicographic works)
      const allowed = ["A", "B", "C", "D", "E"].filter((g) => g <= input.minAIGrade!);
      where.aiGrade = { in: allowed };
    }

    // Sort
    const isRecommended = input.sortBy === "recommended";
    let orderBy: any = { createdAt: "desc" };
    switch (input.sortBy) {
      case "price_asc": orderBy = { askingPrice: "asc" }; break;
      case "price_desc": orderBy = { askingPrice: "desc" }; break;
      case "date_asc": orderBy = { auctionDate: "asc" }; break;
      case "date_desc": orderBy = { auctionDate: "desc" }; break;
      case "discount": orderBy = { discount: "desc" }; break;
      case "ai_grade": orderBy = [{ aiGrade: "asc" }, { aiRiskScore: "asc" }, { createdAt: "desc" }]; break;
      case "recommended": orderBy = { createdAt: "desc" }; break;
      default: orderBy = { createdAt: "desc" };
    }

    // Apply R0 askingPrice filter consistently for non-recommended sorts that
    // don't deal with score-based ordering — keeps cheapest/avg meaningful.
    if (input.sortBy === "price_asc" && !input.onlyFavourited) {
      where.askingPrice = { ...(where.askingPrice ?? {}), gt: 0 };
    }

    const totalCount = await db.distressedListing.count({ where });
    const totalPages = Math.ceil(totalCount / input.limit);
    const skip = (input.page - 1) * input.limit;

    let listings: any[];

    if (isRecommended) {
      // Fetch all matching and score in memory for smart prioritisation
      const allListings = await db.distressedListing.findMany({
        where,
        include: {
          addedBy: { select: { id: true, name: true } },
          priceHistory: { orderBy: { recordedAt: "asc" }, take: 50 },
        },
      });

      // Priority cities: Johannesburg, Kempton Park, Benoni and East Rand surrounds
      const PRIORITY_CITIES_T1 = ["johannesburg", "kempton park", "benoni"];
      const PRIORITY_CITIES_T2 = [
        "boksburg", "germiston", "springs", "alberton", "edenvale",
        "bedfordview", "east rand", "midrand", "sandton", "randburg",
      ];

      const scoreListing = (l: any): number => {
        let score = 0;
        // Property type: standalone houses first (lower = better)
        const pt = (l.propertyType || "").toUpperCase();
        if (pt === "HOUSE" || pt === "RESIDENTIAL") score += 0;
        else if (pt === "STUDENT") score += 50; // student accommodation right after houses
        else if (pt === "VACANT LAND") score += 200;
        else score += 400; // OFFICE, INDUSTRIAL, etc.

        // City priority
        const city = (l.city || "").toLowerCase();
        const addr = (l.address || "").toLowerCase();
        const combined = `${city} ${addr}`;
        if (PRIORITY_CITIES_T1.some(c => combined.includes(c))) score += 0;
        else if (PRIORITY_CITIES_T2.some(c => combined.includes(c))) score += 50;
        else if (city === "gauteng") score += 100; // generic, no specific city
        else score += 150;

        // Favour listings with actual prices over R0
        if (l.askingPrice > 0) score -= 30;

        // Favour listings with images
        if (l.imageUrl) score -= 20;

        // Favour favourited/watched items
        if (l.isFavourited) score -= 50;

        // Favour upcoming auctions
        if (l.auctionDate && new Date(l.auctionDate) > new Date()) score -= 10;

        return score;
      };

      allListings.sort((a: any, b: any) => scoreListing(a) - scoreListing(b));
      listings = allListings.slice(skip, skip + input.limit);
    } else {
      listings = await db.distressedListing.findMany({
        where,
        orderBy,
        skip,
        take: input.limit,
        include: {
          addedBy: { select: { id: true, name: true } },
          priceHistory: { orderBy: { recordedAt: "asc" }, take: 50 },
        },
      });
    }

    // Enrich each listing with dedup-group size + first-recorded price for UI badges.
    // Single query for all groups, then map.
    const groupIds = Array.from(new Set(listings.map((l: any) => l.dedupGroupId).filter(Boolean))) as string[];
    const groupCounts: Record<string, number> = {};
    if (groupIds.length > 0) {
      const counts = await db.distressedListing.groupBy({
        by: ["dedupGroupId"],
        where: { dedupGroupId: { in: groupIds } },
        _count: { dedupGroupId: true },
      });
      counts.forEach((c) => {
        if (c.dedupGroupId) groupCounts[c.dedupGroupId] = c._count.dedupGroupId;
      });
    }
    listings = listings.map((l: any) => ({
      ...l,
      dedupCount: l.dedupGroupId ? groupCounts[l.dedupGroupId] ?? 1 : 1,
      firstAskingPrice: l.priceHistory?.[0]?.askingPrice ?? l.askingPrice,
    }));

    // Summary stats — respect current filter so the user sees averages
    // for what they're actually browsing. Exclude R0 listings from price
    // averages (auctions with no published reserve skew the figure).
    const statsWhere = { ...where };
    const priceWhere = { ...statsWhere, askingPrice: { gt: 0, lte: 500_000_000 } };
    const provinceScope = where.province ? { province: where.province } : {};
    const totalActive = await db.distressedListing.count({ where: { status: "ACTIVE", ...provinceScope } });
    const totalWatched = await db.distressedListing.count({ where: { isFavourited: true, ...provinceScope } });
    const upcomingAuctions = await db.distressedListing.count({
      where: { ...statsWhere, auctionDate: { gte: new Date() } },
    });
    const avgPrice = await db.distressedListing.aggregate({
      where: priceWhere,
      _avg: { askingPrice: true },
    });
    const cheapest = await db.distressedListing.findFirst({
      where: priceWhere,
      orderBy: { askingPrice: "asc" },
      select: { askingPrice: true },
    });

    return {
      listings,
      totalCount,
      totalPages,
      currentPage: input.page,
      hasMore: input.page < totalPages,
      stats: {
        totalActive,
        totalWatched,
        upcomingAuctions,
        avgPrice: avgPrice._avg?.askingPrice ?? 0,
        cheapest: cheapest?.askingPrice ?? 0,
      },
    };
  });

// ─── Trigger Scrape ──────────────────────────────────────────────

export const triggerDistressedScrape = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .mutation(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    const result = await runFullScrape();
    return result;
  });

// ─── Distressed Dashboard Summary (lightweight for tile) ─────────

export const getDistressedDashboardSummary = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [totalActive, upcomingThisWeek, gradedA_B, newest, lastScrape] = await Promise.all([
      db.distressedListing.count({ where: { status: "ACTIVE" } }),
      db.distressedListing.count({
        where: { status: "ACTIVE", auctionDate: { gte: now, lte: weekAhead } },
      }),
      db.distressedListing.count({
        where: { status: "ACTIVE", aiGrade: { in: ["A", "B"] } },
      }),
      db.distressedListing.findFirst({
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, city: true, askingPrice: true, aiGrade: true, createdAt: true },
      }),
      db.distressedScrapeLog.findFirst({
        orderBy: { scrapedAt: "desc" },
        select: { scrapedAt: true, status: true },
      }),
    ]);

    return {
      totalActive,
      upcomingThisWeek,
      gradedA_B,
      newest,
      lastScrape,
    };
  });


// ─── Get Scrape Logs ─────────────────────────────────────────────

export const getScrapeLogs = baseProcedure
  .input(z.object({ authToken: z.string(), limit: z.number().optional().default(20) }))
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    return db.distressedScrapeLog.findMany({
      orderBy: { scrapedAt: "desc" },
      take: input.limit,
    });
  });

// ─── Get Source Info ─────────────────────────────────────────────

export const getDistressedSources = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);

    const sources = getSourceInfo();

    // Enrich with last scrape info
    const enriched = await Promise.all(
      sources.map(async (s) => {
        const lastLog = await db.distressedScrapeLog.findFirst({
          where: { source: s.id },
          orderBy: { scrapedAt: "desc" },
        });
        const count = await db.distressedListing.count({ where: { source: s.id, status: "ACTIVE" } });
        return {
          ...s,
          lastScraped: lastLog?.scrapedAt ?? null,
          lastStatus: lastLog?.status ?? null,
          activeListings: count,
        };
      })
    );

    return enriched;
  });

// ─── Toggle Favourite ────────────────────────────────────────────

export const toggleDistressedFavourite = baseProcedure
  .input(z.object({ authToken: z.string(), listingId: z.number() }))
  .mutation(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    const listing = await db.distressedListing.findUniqueOrThrow({ where: { id: input.listingId } });
    return db.distressedListing.update({
      where: { id: input.listingId },
      data: { isFavourited: !listing.isFavourited, status: !listing.isFavourited ? "WATCHED" : "ACTIVE" },
    });
  });

// ─── Add Manual Listing ──────────────────────────────────────────

export const addDistressedListing = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      title: z.string().min(1),
      source: z.string().default("manual"),
      sourceUrl: z.string().optional(),
      propertyType: z.string().default("HOUSE"),
      address: z.string().optional(),
      suburb: z.string().optional(),
      city: z.string().default("Johannesburg"),
      marketValue: z.number().optional(),
      askingPrice: z.number().min(1),
      bedrooms: z.number().optional(),
      bathrooms: z.number().optional(),
      erfSize: z.number().optional(),
      floorSize: z.number().optional(),
      auctionDate: z.string().optional(),
      auctionTime: z.string().optional(),
      auctionVenue: z.string().optional(),
      auctionType: z.string().optional(),
      auctioneer: z.string().optional(),
      notes: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const discount = input.marketValue && input.marketValue > 0
      ? ((input.marketValue - input.askingPrice) / input.marketValue) * 100
      : undefined;

    return db.distressedListing.create({
      data: {
        externalId: `manual-${Date.now()}`,
        source: input.source,
        sourceUrl: input.sourceUrl,
        title: input.title,
        propertyType: input.propertyType,
        address: input.address,
        suburb: input.suburb,
        city: input.city,
        province: "Gauteng",
        marketValue: input.marketValue,
        askingPrice: input.askingPrice,
        discount,
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
        erfSize: input.erfSize,
        floorSize: input.floorSize,
        auctionDate: input.auctionDate ? new Date(input.auctionDate) : undefined,
        auctionTime: input.auctionTime,
        auctionVenue: input.auctionVenue,
        auctionType: input.auctionType,
        auctioneer: input.auctioneer,
        notes: input.notes,
        addedById: user.id,
      },
    });
  });

// ─── Update Listing Status ───────────────────────────────────────

export const updateDistressedStatus = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      listingId: z.number(),
      status: z.enum(["ACTIVE", "SOLD", "WITHDRAWN", "EXPIRED", "WATCHED"]),
      notes: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    return db.distressedListing.update({
      where: { id: input.listingId },
      data: {
        status: input.status,
        notes: input.notes,
      },
    });
  });

// ─── Delete Listing ──────────────────────────────────────────────

export const deleteDistressedListing = baseProcedure
  .input(z.object({ authToken: z.string(), listingId: z.number() }))
  .mutation(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    return db.distressedListing.delete({ where: { id: input.listingId } });
  });
