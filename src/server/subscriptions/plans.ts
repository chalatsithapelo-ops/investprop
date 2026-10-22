import type { SubscriptionTier } from "@prisma/client";

// ═══════════════════════════════════════════════════════════════
//  Subscription Plan Catalog (Phase 2 + Phase 3 monetization)
//  Code is the single source of truth for feature-gating. Prices here
//  are sensible defaults; admins may override price/Paystack codes via the
//  SubscriptionPlan DB table (surfaced to the pricing UI).
// ═══════════════════════════════════════════════════════════════

/** Gated capabilities. Map a premium feature to the tiers that unlock it. */
export type Feature =
  | "AI_COPILOT" // Conversational deal co-pilot chat
  | "AI_PORTFOLIO_ADVISOR" // AI portfolio insights
  | "AI_UNDERWRITING" // Automated underwriting (also staff-gated)
  | "DISTRESSED_ALERTS" // Email/push distressed-deal alerts
  | "DISTRESSED_FULL_ACCESS" // Full distressed finder + AI grades
  | "MARKET_DATA_EXPORT" // Anonymised aggregate market data API
  | "PRIORITY_SUPPORT"
  // ─── Seller / landlord (supply side) ───
  | "SELLER_MULTI_LISTING" // List multiple properties for sale concurrently
  | "SELLER_AI_VALUATION" // AI valuation & offer-readiness report
  | "SELLER_PRIORITY_REVIEW"; // Priority / fast-tracked proposal review

export type PlanDefinition = {
  tier: SubscriptionTier;
  name: string;
  tagline: string;
  description: string;
  monthlyPrice: number; // ZAR
  annualPrice: number; // ZAR (per year — usually ~10 months for 2 free)
  /** Marketing bullets shown on the pricing page. */
  features: string[];
  /** Capabilities unlocked by this tier. */
  capabilities: Feature[];
  /** Higher = more premium. Used for tier comparison / "at least X" checks. */
  rank: number;
  /** Highlighted as the recommended plan on the pricing page. */
  highlighted?: boolean;
  /** Standalone product (not part of the main investor ladder). */
  standalone?: boolean;
};

export const PLAN_CATALOG: Record<SubscriptionTier, PlanDefinition> = {
  FREE: {
    tier: "FREE",
    name: "Starter",
    tagline: "Get started free — no card, no risk",
    description: "Free forever. Browse every vetted deal and invest from R1,000 to build confidence before you add AI decision tools.",
    monthlyPrice: 0,
    annualPrice: 0,
    rank: 0,
    features: [
      "Browse every live investment opportunity",
      "Invest from R1,000 per property",
      "Track your portfolio & returns",
      "Standard property analytics",
      "Community support",
    ],
    capabilities: [],
  },
  INVESTOR_PLUS: {
    tier: "INVESTOR_PLUS",
    name: "Investor Plus",
    tagline: "Understand every deal before you commit",
    description: "Under R10 a day for a personal AI co-pilot on every deal and a monthly brief on your whole portfolio. Pays for itself the first time it stops you misreading a R10,000+ commitment.",
    monthlyPrice: 299,
    annualPrice: 2990, // 2 months free
    rank: 1,
    highlighted: true,
    features: [
      "Everything in Starter",
      "AI Deal Co-Pilot — plain-English answers on any deal's risk, returns & docs",
      "AI Portfolio Advisor — monthly brief on concentration, tax timing & gaps",
      "Advanced analytics & on-platform comparable sales",
      "Email support",
    ],
    capabilities: ["AI_COPILOT", "AI_PORTFOLIO_ADVISOR"],
  },
  PRO: {
    tier: "PRO",
    name: "Pro",
    tagline: "An independent grade on every deal — and bargains before the crowd",
    description: "The full AI suite plus SA's distressed & auction engine. One below-market deal it surfaces, or one weak deal its underwriting flags, pays for years of Pro.",
    monthlyPrice: 799,
    annualPrice: 7990,
    rank: 2,
    features: [
      "Everything in Investor Plus",
      "Independent AI underwriting — full assumption breakdown & risk read on every deal",
      "AI deal grades (A–E) across SA's full distressed & auction engine",
      "Real-time, strategy-filtered distressed deal alerts",
      "Priority support",
    ],
    capabilities: [
      "AI_COPILOT",
      "AI_PORTFOLIO_ADVISOR",
      "AI_UNDERWRITING",
      "DISTRESSED_ALERTS",
      "DISTRESSED_FULL_ACCESS",
      "PRIORITY_SUPPORT",
    ],
  },
  ENTERPRISE: {
    tier: "ENTERPRISE",
    name: "Enterprise",
    tagline: "Run your fund's books, compliance & data from one place",
    description: "Everything in Pro, plus automated multi-SPV reporting, compliance tooling and an anonymised market-data API. Cheaper than the bookkeeper and compliance consultant it replaces.",
    monthlyPrice: 2499,
    annualPrice: 24990,
    rank: 3,
    features: [
      "Everything in Pro",
      "Automated multi-SPV financial reporting (P&L, balance sheet, investor statements)",
      "Anonymised market-data export API",
      "Dedicated account manager, custom data feeds & SLAs",
    ],
    capabilities: [
      "AI_COPILOT",
      "AI_PORTFOLIO_ADVISOR",
      "AI_UNDERWRITING",
      "DISTRESSED_ALERTS",
      "DISTRESSED_FULL_ACCESS",
      "MARKET_DATA_EXPORT",
      "PRIORITY_SUPPORT",
    ],
  },
  DISTRESSED: {
    tier: "DISTRESSED",
    name: "DistressedDeals SA",
    tagline: "Below-market deals in your inbox before everyone else",
    description:
      "Standalone access to our distressed & auction engine — no investor plan needed. One flagged bargain pays for years of alerts.",
    monthlyPrice: 499,
    annualPrice: 4990,
    rank: 2,
    standalone: true,
    features: [
      "Full distressed & auction property engine",
      "AI deal grades (A–E) & risk scores on every listing",
      "Daily email + push alerts filtered to your strategy",
      "Auction reminders (7 / 3 / 1 day)",
      "Introductions to bond & conveyancing partners",
    ],
    capabilities: ["DISTRESSED_ALERTS", "DISTRESSED_FULL_ACCESS"],
  },
  SELLER_PRO: {
    tier: "SELLER_PRO",
    name: "Seller Pro",
    tagline: "Sell to Investprop faster — and pay a lower fee",
    description:
      "A standalone toolkit for sellers and landlords. The lower facilitation fee on a single close can recover a full year of Seller Pro.",
    monthlyPrice: 499,
    annualPrice: 4990,
    rank: 2,
    standalone: true,
    features: [
      "List multiple properties for sale at once",
      "AI valuation & offer-readiness report",
      "Priority / fast-tracked proposal review",
      "Lower seller facilitation fee on close",
      "Direct line to the acquisitions team",
    ],
    capabilities: [
      "SELLER_MULTI_LISTING",
      "SELLER_AI_VALUATION",
      "SELLER_PRIORITY_REVIEW",
    ],
  },
};

export const ALL_TIERS: SubscriptionTier[] = [
  "FREE",
  "INVESTOR_PLUS",
  "PRO",
  "ENTERPRISE",
  "DISTRESSED",
  "SELLER_PRO",
];

export function getPlan(tier: SubscriptionTier): PlanDefinition {
  return PLAN_CATALOG[tier];
}

/** Does the given tier unlock the given feature? */
export function tierHasFeature(tier: SubscriptionTier, feature: Feature): boolean {
  return PLAN_CATALOG[tier].capabilities.includes(feature);
}

/** All tiers (sorted by rank) that unlock a feature — handy for gating messages. */
export function tiersWithFeature(feature: Feature): SubscriptionTier[] {
  return ALL_TIERS.filter((t) => tierHasFeature(t, feature)).sort(
    (a, b) => PLAN_CATALOG[a].rank - PLAN_CATALOG[b].rank,
  );
}

/** Price for a tier + cycle, in ZAR. */
export function getPrice(tier: SubscriptionTier, cycle: "MONTHLY" | "ANNUAL"): number {
  const plan = PLAN_CATALOG[tier];
  return cycle === "ANNUAL" ? plan.annualPrice : plan.monthlyPrice;
}
