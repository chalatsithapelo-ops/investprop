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
    tagline: "Best for first-time investors exploring the platform",
    description: "Free forever. Create an account, browse every live property deal and track a simple portfolio — no card required.",
    monthlyPrice: 0,
    annualPrice: 0,
    rank: 0,
    features: [
      "Browse every live investment opportunity",
      "Invest from R1,000 per property",
      "Basic portfolio & returns tracking",
      "Standard property analytics",
      "Community support",
    ],
    capabilities: [],
  },
  INVESTOR_PLUS: {
    tier: "INVESTOR_PLUS",
    name: "Investor Plus",
    tagline: "Best for active investors who want AI guidance",
    description: "Everything in Starter, plus an AI co-pilot that answers questions about any deal and gives personalised insights on your portfolio.",
    monthlyPrice: 299,
    annualPrice: 2990, // 2 months free
    rank: 1,
    highlighted: true,
    features: [
      "Everything in Starter",
      "AI Deal Co-Pilot — ask anything about a property",
      "AI Portfolio Advisor — personalised insights",
      "Advanced analytics & comparable sales",
      "Email support",
    ],
    capabilities: ["AI_COPILOT", "AI_PORTFOLIO_ADVISOR"],
  },
  PRO: {
    tier: "PRO",
    name: "Pro",
    tagline: "Best for serious investors hunting below-market deals",
    description: "The full AI suite plus South Africa's distressed & auction property engine — AI deal grades and real-time alerts so you spot bargains first.",
    monthlyPrice: 799,
    annualPrice: 7990,
    rank: 2,
    features: [
      "Everything in Investor Plus",
      "Full Distressed Property engine + AI grades (A–E)",
      "Real-time distressed deal alerts",
      "AI underwriting access",
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
    tagline: "Best for funds, teams and data-driven businesses",
    description: "Everything in Pro, plus an anonymised market-data export API, a dedicated account manager and custom data feeds with SLAs.",
    monthlyPrice: 2499,
    annualPrice: 24990,
    rank: 3,
    features: [
      "Everything in Pro",
      "Anonymised market-data export API",
      "Dedicated account manager",
      "Custom data feeds & SLAs",
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
    tagline: "Best for bargain hunters who only want distressed deals",
    description:
      "Standalone access to our distressed & auction property engine — AI grading, daily alerts and auction reminders, without needing a full investor plan.",
    monthlyPrice: 499,
    annualPrice: 4990,
    rank: 2,
    standalone: true,
    features: [
      "Full Distressed Property engine",
      "AI deal grades (A–E) & risk scores",
      "Daily filtered email + push alerts",
      "Auction reminders (7 / 3 / 1 day)",
      "Introductions to bond & conveyancing partners",
    ],
    capabilities: ["DISTRESSED_ALERTS", "DISTRESSED_FULL_ACCESS"],
  },
  SELLER_PRO: {
    tier: "SELLER_PRO",
    name: "Seller Pro",
    tagline: "Best for property owners selling to Investprop",
    description:
      "A standalone toolkit for sellers and landlords — list multiple properties, get an AI valuation and have your proposal fast-tracked by our acquisitions team.",
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
