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
  | "PRIORITY_SUPPORT";

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
    tagline: "Explore opportunities",
    description: "Browse live investment opportunities and track a basic portfolio.",
    monthlyPrice: 0,
    annualPrice: 0,
    rank: 0,
    features: [
      "Browse all live opportunities",
      "Basic portfolio tracking",
      "Standard property analytics",
      "Community support",
    ],
    capabilities: [],
  },
  INVESTOR_PLUS: {
    tier: "INVESTOR_PLUS",
    name: "Investor Plus",
    tagline: "Smarter investing with AI",
    description: "Unlock the AI deal co-pilot and personalised portfolio insights.",
    monthlyPrice: 299,
    annualPrice: 2990, // 2 months free
    rank: 1,
    highlighted: true,
    features: [
      "Everything in Starter",
      "AI Deal Co-Pilot (ask anything about a property)",
      "AI Portfolio Advisor insights",
      "Advanced analytics & comparables",
      "Email support",
    ],
    capabilities: ["AI_COPILOT", "AI_PORTFOLIO_ADVISOR"],
  },
  PRO: {
    tier: "PRO",
    name: "Pro",
    tagline: "For serious portfolio builders",
    description: "Full AI suite plus the distressed-property engine and alerts.",
    monthlyPrice: 799,
    annualPrice: 7990,
    rank: 2,
    features: [
      "Everything in Investor Plus",
      "Full Distressed Property engine + AI grades",
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
    tagline: "Data & scale",
    description: "Everything in Pro plus the anonymised market-data export API.",
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
    tagline: "Distressed property, delivered",
    description:
      "Standalone access to South Africa's distressed & auction property engine with AI grading and daily alerts.",
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
};

export const ALL_TIERS: SubscriptionTier[] = [
  "FREE",
  "INVESTOR_PLUS",
  "PRO",
  "ENTERPRISE",
  "DISTRESSED",
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
