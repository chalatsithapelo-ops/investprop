import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { env } from "~/server/env";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { userHasFeature } from "~/server/subscriptions/subscription-service";

// ═══════════════════════════════════════════════════════════════
//  Phase 3 — Anonymised market-data export (Enterprise data product).
//  Aggregate distressed-market stats by region. No PII, no listing IDs —
//  only counts and averages. Access via Enterprise subscription OR a
//  provisioned MARKET_DATA_API_KEY.
// ═══════════════════════════════════════════════════════════════

export const getAnonymisedMarketData = baseProcedure
  .input(
    z.object({
      authToken: z.string().optional(),
      apiKey: z.string().optional(),
      groupBy: z.enum(["province", "city"]).default("province"),
      province: z.string().optional(),
    }),
  )
  .query(async ({ input }) => {
    // ── Authorization: API key OR Enterprise entitlement ──
    const keyOk =
      !!input.apiKey && !!env.MARKET_DATA_API_KEY && input.apiKey === env.MARKET_DATA_API_KEY;

    if (!keyOk) {
      if (!input.authToken) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Provide a valid API key or authenticate with an Enterprise subscription.",
        });
      }
      const user = await getAuthenticatedUser(input.authToken);
      const entitled = await userHasFeature(user.id, user.role, "MARKET_DATA_EXPORT");
      if (!entitled) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Market-data export requires an Enterprise subscription.",
        });
      }
    }

    const where = {
      status: "ACTIVE" as const,
      ...(input.province ? { province: input.province } : {}),
    };

    const groups = await db.distressedListing.groupBy({
      by: [input.groupBy],
      where,
      _count: { _all: true },
      _avg: { askingPrice: true, discount: true, marketValue: true, aiRiskScore: true },
      _min: { askingPrice: true },
      _max: { askingPrice: true },
    });

    const regions = groups
      .map((g) => ({
        region: (g as Record<string, unknown>)[input.groupBy] as string,
        listingCount: g._count._all,
        avgAskingPrice: g._avg.askingPrice ? Math.round(g._avg.askingPrice) : null,
        avgMarketValue: g._avg.marketValue ? Math.round(g._avg.marketValue) : null,
        avgDiscountPct: g._avg.discount != null ? Math.round(g._avg.discount * 10) / 10 : null,
        avgRiskScore: g._avg.aiRiskScore != null ? Math.round(g._avg.aiRiskScore) : null,
        minAskingPrice: g._min.askingPrice ? Math.round(g._min.askingPrice) : null,
        maxAskingPrice: g._max.askingPrice ? Math.round(g._max.askingPrice) : null,
      }))
      .sort((a, b) => b.listingCount - a.listingCount);

    return {
      generatedAt: new Date().toISOString(),
      groupBy: input.groupBy,
      totalListings: regions.reduce((s, r) => s + r.listingCount, 0),
      regions,
    };
  });
