import type { Prisma } from "@prisma/client";
import { db } from "~/server/db";

// ═══════════════════════════════════════════════════════════════
//  Platform Fee Engine (Phase 1 monetization)
//  Single source of truth for computing & recording platform revenue.
//  Every money-movement procedure books realized revenue here.
// ═══════════════════════════════════════════════════════════════

export const PLATFORM_FEE_CONFIG_ID = 1;

export type PlatformFeeType =
  | "CAPITAL_RAISE"
  | "DISTRIBUTION"
  | "SECONDARY_TRADE"
  | "SOURCING"
  // ─── Owner (seller-side) monetization ───
  | "SELLER_FACILITATION"
  | "ASSESSMENT_PACK"
  | "JV_PROMOTE"
  | "LEASE_BACK_SETUP"
  | "LEASE_BACK_MGMT"
  | "BOND_REFERRAL";

export type FeeConfig = {
  capitalRaiseFeeBps: number;
  distributionFeeBps: number;
  secondaryTradeFeeBps: number;
  sourcingFeeBps: number;
  sourcingFlatFee: number;
  sellerFacilitationFeeBps: number;
  assessmentPackFee: number;
  jvPromoteFeeBps: number;
  leaseBackSetupFee: number;
  leaseBackMgmtFeeBps: number;
  bondReferralFee: number;
  enabled: boolean;
};

/** Hard-coded fallback defaults — mirror the Prisma model @default values. */
export const DEFAULT_FEE_CONFIG: FeeConfig = {
  capitalRaiseFeeBps: 250, // 2.5%
  distributionFeeBps: 200, // 2.0%
  secondaryTradeFeeBps: 100, // 1.0%
  sourcingFeeBps: 100, // 1.0%
  sourcingFlatFee: 0,
  sellerFacilitationFeeBps: 200, // 2.0%
  assessmentPackFee: 2500, // flat ZAR
  jvPromoteFeeBps: 1000, // 10%
  leaseBackSetupFee: 5000, // flat ZAR
  leaseBackMgmtFeeBps: 800, // 8%
  bondReferralFee: 0, // flat ZAR
  enabled: true,
};

/**
 * Pure helper — compute a fee amount from a base and a basis-point rate.
 * 100 bps = 1%. Rounded to 2 decimal places (ZAR cents).
 */
export function computeFeeFromBps(baseAmount: number, bps: number): number {
  if (!Number.isFinite(baseAmount) || !Number.isFinite(bps)) return 0;
  if (baseAmount <= 0 || bps <= 0) return 0;
  return Math.round(baseAmount * (bps / 10_000) * 100) / 100;
}

/**
 * Read the singleton fee config, creating it with defaults on first use.
 * Falls back to in-memory defaults if the table does not yet exist
 * (e.g. before the migration has run) so money movement never breaks.
 */
export async function getFeeConfig(
  client: Prisma.TransactionClient | typeof db = db,
): Promise<FeeConfig> {
  try {
    const existing = await client.platformFeeConfig.findUnique({
      where: { id: PLATFORM_FEE_CONFIG_ID },
    });
    if (existing) {
      return {
        capitalRaiseFeeBps: existing.capitalRaiseFeeBps,
        distributionFeeBps: existing.distributionFeeBps,
        secondaryTradeFeeBps: existing.secondaryTradeFeeBps,
        sourcingFeeBps: existing.sourcingFeeBps,
        sourcingFlatFee: existing.sourcingFlatFee,
        sellerFacilitationFeeBps: existing.sellerFacilitationFeeBps,
        assessmentPackFee: existing.assessmentPackFee,
        jvPromoteFeeBps: existing.jvPromoteFeeBps,
        leaseBackSetupFee: existing.leaseBackSetupFee,
        leaseBackMgmtFeeBps: existing.leaseBackMgmtFeeBps,
        bondReferralFee: existing.bondReferralFee,
        enabled: existing.enabled,
      };
    }
    const created = await client.platformFeeConfig.create({
      data: { id: PLATFORM_FEE_CONFIG_ID },
    });
    return {
      capitalRaiseFeeBps: created.capitalRaiseFeeBps,
      distributionFeeBps: created.distributionFeeBps,
      secondaryTradeFeeBps: created.secondaryTradeFeeBps,
      sourcingFeeBps: created.sourcingFeeBps,
      sourcingFlatFee: created.sourcingFlatFee,
      sellerFacilitationFeeBps: created.sellerFacilitationFeeBps,
      assessmentPackFee: created.assessmentPackFee,
      jvPromoteFeeBps: created.jvPromoteFeeBps,
      leaseBackSetupFee: created.leaseBackSetupFee,
      leaseBackMgmtFeeBps: created.leaseBackMgmtFeeBps,
      bondReferralFee: created.bondReferralFee,
      enabled: created.enabled,
    };
  } catch (err) {
    console.error("[platform-fees] getFeeConfig fell back to defaults:", err);
    return DEFAULT_FEE_CONFIG;
  }
}

export type RecordPlatformFeeArgs = {
  feeType: PlatformFeeType;
  sourceType:
    | "InvestorContribution"
    | "Distribution"
    | "ShareTrade"
    | "Acquisition"
    | "OwnerSaleProposal";
  sourceId: number;
  baseAmount: number;
  feeBps: number;
  /** Pre-computed fee. When omitted it is derived from baseAmount × feeBps. */
  feeAmount?: number;
  propertyId?: number | null;
  description?: string;
  /** Optional Prisma transaction client so the fee write joins an outer tx. */
  tx?: Prisma.TransactionClient;
};

/**
 * Record a single platform fee into the revenue ledger.
 * Idempotent on (feeType, sourceType, sourceId) — a duplicate capture is a
 * no-op rather than an error, so retries/replays never double-book revenue.
 * Returns the fee amount booked (0 when nothing was recorded).
 */
export async function recordPlatformFee(
  args: RecordPlatformFeeArgs,
): Promise<number> {
  const client = args.tx ?? db;
  const feeAmount =
    args.feeAmount ?? computeFeeFromBps(args.baseAmount, args.feeBps);

  if (feeAmount <= 0) return 0;

  try {
    await client.platformRevenue.create({
      data: {
        feeType: args.feeType,
        sourceType: args.sourceType,
        sourceId: args.sourceId,
        propertyId: args.propertyId ?? null,
        baseAmount: args.baseAmount,
        feeBps: args.feeBps,
        feeAmount,
        description: args.description ?? null,
      },
    });
    return feeAmount;
  } catch (err: any) {
    // P2002 = unique constraint violation → fee already captured, ignore.
    if (err?.code === "P2002") return 0;
    // Never let revenue bookkeeping break the underlying money movement.
    console.error("[platform-fees] recordPlatformFee failed:", err);
    return 0;
  }
}
