import { z } from "zod";

// Mirrors submitAppropriatenessQuestionnaire; no inferred or replacement legal acknowledgements.
export const appropriatenessProfileSchema = z.object({
  investmentExperience: z.enum(["NONE", "BASIC", "EXPERIENCED", "PROFESSIONAL"]),
  annualIncome: z.enum(["UNDER_350K", "350_750K", "750K_1_5M", "OVER_1_5M"]),
  netWorth: z.enum(["UNDER_500K", "500K_2M", "2M_10M", "OVER_10M"]),
  understandsIlliquid: z.boolean(),
  understandsLossOfCapital: z.boolean(),
  understandsCoolingOff: z.boolean(),
  maxLossTolerance: z.number().finite().min(0),
});

export const confirmedProfileSchema = appropriatenessProfileSchema.extend({
  understandsIlliquid: z.literal(true),
  understandsLossOfCapital: z.literal(true),
  understandsCoolingOff: z.literal(true),
});

export const onboardingSubmissionSchema = confirmedProfileSchema.extend({
  confirmed: z.literal(true),
}).strict();

const draftShape = Object.fromEntries(
  Object.entries(appropriatenessProfileSchema.shape).map(([name, schema]) => [name, schema.nullable().optional()]),
) as { [K in keyof typeof appropriatenessProfileSchema.shape]: z.ZodOptional<z.ZodNullable<(typeof appropriatenessProfileSchema.shape)[K]>> };

export const onboardingTurnSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  collected: z.object(draftShape).strict(),
  complete: z.boolean(),
}).strict();

export function readCompletedProfile(value: unknown, completedAt: Date | null | undefined) {
  if (!completedAt) return null;
  const result = confirmedProfileSchema.safeParse(value);
  return result.success ? result.data : null;
}

export const liveHoldingSelect = {
  sharesOwned: true,
  averageCostPerShare: true,
  shareClass: {
    select: {
      id: true,
      pricePerShare: true,
      property: {
        select: {
          id: true, title: true, city: true, riskRating: true, investmentStatus: true,
          propertyFlip: { select: { id: true } },
          rentalBond: { select: { id: true } },
          propertyDevelopment: { select: { id: true } },
        },
      },
    },
  },
} as const;

type HoldingProperty = {
  id: number; title: string; city: string; riskRating: string; investmentStatus: string;
  propertyFlip: { id: number } | null;
  rentalBond: { id: number } | null;
  propertyDevelopment: { id: number } | null;
};
type LiveHolding = {
  sharesOwned: number;
  averageCostPerShare: number;
  shareClass: { pricePerShare: number; property: HoldingProperty };
};

export const HOLDING_BASIS = "Remaining shares × recorded average acquisition cost; where cost is unavailable/non-positive, share-class price is an indicative fallback. Not fair market value, an exit quote, or evidence of unrealised gains/losses.";

export function summariseLiveHoldings(holdings: readonly LiveHolding[]) {
  const positions = holdings.filter((h) => Number.isFinite(h.sharesOwned) && h.sharesOwned > 0).map((h) => {
    const hasCost = Number.isFinite(h.averageCostPerShare) && h.averageCostPerShare > 0;
    const price = hasCost ? h.averageCostPerShare : h.shareClass.pricePerShare;
    const amount = h.sharesOwned * price;
    return {
      property: h.shareClass.property,
      sharesOwned: h.sharesOwned,
      amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
      basis: hasCost ? "acquisition cost" : "indicative share-class price",
    };
  });
  const byCity = new Map<string, number>();
  const byRisk = new Map<string, number>();
  const byType = new Map<string, number>();
  for (const position of positions) {
    const p = position.property;
    const type = p.propertyFlip ? "flip" : p.rentalBond ? "rental" : p.propertyDevelopment ? "development" : "other";
    for (const [map, label] of [[byCity, p.city], [byRisk, p.riskRating], [byType, type]] as const) {
      map.set(label, (map.get(label) ?? 0) + position.amount);
    }
  }
  return {
    positions, byCity, byRisk, byType,
    total: positions.reduce((sum, p) => sum + p.amount, 0),
    propertyCount: new Set(positions.map((p) => p.property.id)).size,
    unpricedCount: positions.filter((p) => p.amount === 0).length,
  };
}
