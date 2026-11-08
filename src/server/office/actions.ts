/**
 * Office voice-agent action registry.
 *
 * A single declarative catalog that lets the voice agent reach EVERY member
 * capability the Flutter / web app exposes, while reusing the exact tRPC
 * procedures (and therefore every auth, role, KYC, rate-limit, collar and
 * business-rule guard rail) rather than re-implementing any logic.
 *
 *   • READ actions run immediately through `appRouter.createCaller`.
 *   • WRITE actions are two-phase: `prepareOfficeAction` freezes a human
 *     read-back + an approvalDigest in an OfficeTask (kind "ACTION"); the
 *     agent must read the summary back and get a verbal "yes" before
 *     `confirmOfficeAction` replays the frozen args through the same caller.
 *
 * The digest / CAS / TTL machinery is shared with the existing office tasks
 * (see policy.ts + tasks.ts) so nothing can be executed twice or mutated
 * between preparation and confirmation.
 */

import { randomUUID } from "node:crypto";
import { Prisma, type User } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db } from "~/server/db";
import { appRouter } from "~/server/trpc/root";
import type { Context } from "~/server/trpc/context";
import {
  APPROVAL_TTL_MS,
  assertOfficeUser,
  assertPrepared,
  assertDigest,
  taskDigest,
} from "./policy";

const json = (v: unknown): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "Office action task not found" });
const conflict = () =>
  new TRPCError({ code: "CONFLICT", message: "Action changed concurrently; prepare it again" });
const zar = (n: number) => "R" + Math.round(n).toLocaleString("en-ZA");

type MemberCaller = ReturnType<typeof appRouter.createCaller>;

/** Build a caller that runs as the member, reusing every procedure guard rail. */
function memberCaller(user: User, authToken: string): MemberCaller {
  const ctx: Context = {
    db,
    user,
    req: new Request("http://office-agent.internal/trpc", {
      headers: { authorization: `Bearer ${authToken}` },
    }),
  };
  return appRouter.createCaller(ctx);
}

type ReadEntry<A> = {
  mode: "read";
  description: string;
  input: z.ZodType<A>;
  run: (caller: MemberCaller, authToken: string, args: A) => Promise<unknown>;
};
type WriteEntry<A> = {
  mode: "write";
  risk: "low" | "money" | "compliance";
  description: string;
  input: z.ZodType<A>;
  summary: (args: A) => string;
  run: (caller: MemberCaller, authToken: string, args: A) => Promise<unknown>;
};
type AnyEntry = ReadEntry<unknown> | WriteEntry<unknown>;

function read<A>(
  description: string,
  input: z.ZodType<A>,
  run: ReadEntry<A>["run"],
): ReadEntry<A> {
  return { mode: "read", description, input, run };
}
function write<A>(
  risk: WriteEntry<A>["risk"],
  description: string,
  input: z.ZodType<A>,
  summary: WriteEntry<A>["summary"],
  run: WriteEntry<A>["run"],
): WriteEntry<A> {
  return { mode: "write", risk, description, input, summary, run };
}

const empty = z.object({});

const preferencesSchema = z.object({
  preferredPropertyTypes: z.array(z.string()).optional(),
  minInvestment: z.number().min(0).optional(),
  maxInvestment: z.number().min(0).optional(),
  preferredLocations: z.array(z.string()).optional(),
  riskTolerance: z.string().optional(),
  preferredReturnRate: z.number().min(0).optional(),
  notificationsEnabled: z.boolean().optional(),
});

/**
 * Rank open opportunities against the member's saved mandate so the agent can
 * proactively source deals that fit them. Deliberately tolerant of unknown
 * field shapes: every lookup is optional-chained and the raw listing is still
 * returned, so a schema drift can only weaken ranking, never throw.
 */
function rankListingsByMandate(
  prefsRaw: unknown,
  listings: unknown,
  limit: number,
): { mandate: unknown; matches: Array<Record<string, unknown>>; note: string } {
  const prefs = (prefsRaw && typeof prefsRaw === "object"
    ? ((prefsRaw as Record<string, unknown>).preferences ?? prefsRaw)
    : null) as Record<string, unknown> | null;
  const items = Array.isArray(listings) ? (listings as Array<Record<string, unknown>>) : [];

  const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
  const types = Array.isArray(prefs?.preferredPropertyTypes)
    ? (prefs!.preferredPropertyTypes as unknown[]).map(norm).filter(Boolean)
    : [];
  const locations = Array.isArray(prefs?.preferredLocations)
    ? (prefs!.preferredLocations as unknown[]).map(norm).filter(Boolean)
    : [];
  const targetReturn = typeof prefs?.preferredReturnRate === "number" ? (prefs!.preferredReturnRate as number) : null;

  const scored = items.map((opp) => {
    const type = norm(opp.propertyType ?? opp.type);
    const city = norm(opp.city);
    const province = norm(opp.province);
    const title = norm(opp.title);
    const expected = typeof opp.expectedReturns === "number" ? (opp.expectedReturns as number) : null;

    let score = 0;
    const reasons: string[] = [];
    if (types.length && type && types.some((t) => type.includes(t) || t.includes(type))) {
      score += 3;
      reasons.push(`matches your preferred ${type} type`);
    }
    if (locations.length) {
      const hit = locations.find((l) => (city && (city.includes(l) || l.includes(city))) || (province && (province.includes(l) || l.includes(province))) || (title && title.includes(l)));
      if (hit) {
        score += 3;
        reasons.push(`in your preferred area (${hit})`);
      }
    }
    if (targetReturn != null && expected != null && expected >= targetReturn) {
      score += 2;
      reasons.push(`expected return ${expected}% meets your ${targetReturn}% target`);
    } else if (expected != null) {
      score += Math.min(1, expected / 100);
    }
    return { opp, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);
  const matches = scored.slice(0, limit).map((s) => ({
    ...s.opp,
    whyMatch: s.reasons.length ? s.reasons.join("; ") : "Open opportunity currently raising funds",
    mandateScore: Number(s.score.toFixed(2)),
  }));

  return {
    mandate: prefs ?? { note: "No saved preferences — ask the member for their mandate (cities, property type, ticket size, target return) and save it with remember/updateInvestorPreferences." },
    matches,
    note: prefs
      ? "Ranked against the member's saved mandate. Lead with whyMatch, then the real numbers."
      : "No mandate on record — these are open opportunities only. Ask one or two short questions to build their mandate.",
  };
}

/**
 * The full capability catalog. Keys are stable action names the agent calls.
 */
export const ACTION_REGISTRY: Record<string, AnyEntry> = {
  // ─── Reads ──────────────────────────────────────────────────────────────
  me: read("The member's own account profile (name, email, role, investor code).",
    empty, (c, t) => c.getMe({ authToken: t })),
  portfolioInsight: read("AI portfolio insight and advice for the member.",
    z.object({ period: z.string().optional() }), (c, t, a) => c.getPortfolioInsight({ authToken: t, period: a.period })),
  trackRecord: read("The platform's realised track record.",
    empty, (c, t) => c.getPlatformTrackRecord({ authToken: t })),
  myCertificates: read("The member's share certificates.",
    empty, (c, t) => c.getMyCertificates({ authToken: t })),
  myContributions: read("The member's investment contributions and their statuses.",
    empty, (c, t) => c.getMyContributions({ authToken: t })),
  myDistressedAlerts: read("The member's distressed-property alert subscription.",
    empty, (c, t) => c.getMyDistressedAlerts({ authToken: t })),
  myDocuments: read("The member's legal documents.",
    empty, (c, t) => c.getMyDocuments({ authToken: t })),
  myPrequalifications: read("The member's saved home-loan prequalification results.",
    empty, (c, t) => c.getMyPrequalifications({ authToken: t })),
  myHomeLoanApplications: read("The member's home-loan applications and bank offers.",
    empty, (c, t) => c.getMyHomeLoanApplications({ authToken: t })),
  appropriatenessStatus: read("Whether the member has completed the FAIS suitability questionnaire.",
    empty, (c, t) => c.getAppropriatenessStatus({ authToken: t })),
  myFicaStatus: read("The member's FICA verification status.",
    empty, (c, t) => c.getMyFicaStatus({ authToken: t })),
  myAwaitingPayment: read("The member's contributions awaiting payment.",
    empty, (c, t) => c.getMyAwaitingPayment({ authToken: t })),
  kycProfile: read("The member's KYC profile and document statuses.",
    empty, (c, t) => c.getKYCProfile({ authToken: t })),
  myLandPartnerships: read("The member's land-partnership submissions (owners only).",
    empty, (c, t) => c.getMyLandPartnerships({ authToken: t })),
  marketplaceOverview: read("Secondary-market overview: tradeable share classes and prices.",
    empty, (c) => c.getMarketplaceOverview({})),
  orderBook: read("The live order book (bids/asks) for a share class.",
    z.object({ shareClassId: z.number().int().positive() }), (c, _t, a) => c.getOrderBook({ shareClassId: a.shareClassId })),
  myOrders: read("The member's secondary-market share orders.",
    z.object({
      shareClassId: z.number().int().positive().optional(),
      status: z.enum(["OPEN", "PARTIALLY_FILLED", "FILLED", "CANCELLED", "EXPIRED"]).optional(),
    }), (c, t, a) => c.getMyOrders({ authToken: t, shareClassId: a.shareClassId, status: a.status })),
  tradeHistory: read("Recent trade prints for a share class.",
    z.object({ shareClassId: z.number().int().positive().optional(), limit: z.number().int().min(1).max(100).optional() }),
    (c, _t, a) => c.getTradeHistory({ shareClassId: a.shareClassId, limit: a.limit ?? 50 })),
  myTradeSettlements: read("The member's pending trade settlements.",
    empty, (c, t) => c.getMyTradeSettlements({ authToken: t })),
  lookupInvestor: read("Look up another investor by their investor code (for share transfers).",
    z.object({ investorCode: z.string().min(3) }), (c, t, a) => c.lookupInvestorByCode({ authToken: t, investorCode: a.investorCode })),
  myShareHoldings: read("The member's share holdings by share class.",
    empty, (c, t) => c.getMyShareHoldings({ authToken: t })),
  investorPortfolio: read("The member's full fractional-ownership portfolio.",
    empty, (c, t) => c.getInvestorPortfolio({ authToken: t })),
  investmentOpportunities: read("Open investment opportunities the member can invest in.",
    empty, (c, t) => c.getInvestmentOpportunities({ authToken: t })),
  mySaleProposals: read("The member's property-sale proposals (owners only).",
    empty, (c, t) => c.getMySaleProposals({ authToken: t })),
  ownerFeeSchedule: read("The owner fee schedule for listing a property.",
    empty, (c) => c.getOwnerFeeSchedule()),
  publicResaleListings: read("Publicly listed resale properties, optionally filtered.",
    z.object({
      province: z.string().optional(),
      propertyType: z.string().optional(),
      maxPrice: z.number().positive().optional(),
      search: z.string().max(120).optional(),
    }), (c, t, a) => c.getPublicResaleListings({ authToken: t, province: a.province, propertyType: a.propertyType, maxPrice: a.maxPrice, search: a.search })),
  myDistributions: read("The member's distribution payouts.",
    empty, (c, t) => c.getMyDistributions({ authToken: t })),
  investorPreferences: read("The member's saved investment preferences.",
    empty, (c, t) => c.getInvestorPreferences({ authToken: t })),
  recommendedListings: read(
    "Open opportunities ranked against the member's saved mandate (preferred property types, locations, ticket size, target return). Use this to proactively source deals that fit them; each result carries a whyMatch explanation.",
    z.object({ limit: z.number().int().min(1).max(10).optional() }),
    async (c, t, a) => {
      const [prefs, opps] = await Promise.all([
        c.getInvestorPreferences({ authToken: t }).catch(() => null),
        c.getInvestmentOpportunities({ authToken: t }).catch(() => [] as unknown),
      ]);
      return rankListingsByMandate(prefs, opps, a.limit ?? 5);
    }),
  aiDigestPrefs: read("Whether the member is opted in to the weekly AI digest email.",
    empty, (c, t) => c.getAiDigestPrefs({ authToken: t })),
  shareProvenance: read("Provenance / conservation audit of the member's shares.",
    z.object({ investorId: z.number().int().positive().optional() }), (c, t, a) => c.getShareProvenance({ authToken: t, investorId: a.investorId })),
  mySubscription: read("The member's SaaS subscription status.",
    empty, (c, t) => c.getMySubscription({ authToken: t })),
  subscriptionPlans: read("Available SaaS subscription plans.",
    empty, (c) => c.getSubscriptionPlans()),
  myWallet: read("The member's wallet balance (ZAR).",
    empty, (c, t) => c.getMyWallet({ authToken: t })),
  walletTransactions: read("The member's recent wallet transactions.",
    z.object({ limit: z.number().int().min(1).max(200).optional() }), (c, t, a) => c.getWalletTransactions({ authToken: t, limit: a.limit ?? 100 })),
  myWithdrawals: read("The member's withdrawal requests.",
    empty, (c, t) => c.getMyWithdrawals({ authToken: t })),
  proposals: read("Governance proposals, optionally filtered by property or status.",
    z.object({
      propertyId: z.number().int().positive().optional(),
      status: z.enum(["OPEN", "CLOSED", "EXECUTED", "CANCELLED"]).optional(),
    }), (c, _t, a) => c.getProposals({ propertyId: a.propertyId, status: a.status })),
  governanceRules: read("The platform's governance / voting rules.",
    empty, (c) => c.getGovernanceRules({})),
  myPropertyInvestments: read("The member's own investments in one property.",
    z.object({ propertyId: z.number().int().positive() }), (c, t, a) => c.getMyPropertyInvestments({ authToken: t, propertyId: a.propertyId })),

  // ─── Writes (prepare → verbal yes → confirm) ─────────────────────────────
  updateProfile: write("low", "Update the member's display name and contact phone.",
    z.object({ name: z.string().trim().min(2).max(120), phoneNumber: z.string().trim().max(30).optional() }),
    (a) => `Update your profile name to "${a.name}"${a.phoneNumber ? ` and phone to ${a.phoneNumber}` : ""}.`,
    (c, t, a) => c.updateProfile({ authToken: t, name: a.name, phoneNumber: a.phoneNumber })),

  updateInvestorPreferences: write("low", "Update the member's investment preferences.",
    z.object({ preferences: preferencesSchema }),
    () => `Update your saved investment preferences.`,
    (c, t, a) => c.updateInvestorPreferences({ authToken: t, preferences: a.preferences })),

  setAiDigestOptOut: write("low", "Opt the member in or out of the weekly AI digest email.",
    z.object({ optOut: z.boolean() }),
    (a) => `${a.optOut ? "Opt out of" : "Opt in to"} the weekly AI digest email.`,
    (c, t, a) => c.setAiDigestOptOut({ authToken: t, optOut: a.optOut })),

  setDistressedAlerts: write("low", "Create or update the member's distressed-property alert filters.",
    z.object({
      active: z.boolean().optional(),
      provinces: z.array(z.string()).optional(),
      cities: z.array(z.string()).optional(),
      maxPrice: z.number().positive().optional(),
      minDiscountPct: z.number().min(0).max(100).optional(),
      minAIGrade: z.enum(["A", "B", "C", "D", "E"]).optional(),
      propertyTypes: z.array(z.string()).optional(),
      channelEmail: z.boolean().optional(),
      channelPush: z.boolean().optional(),
    }),
    (a) => `Update your distressed-deal alerts${a.active === false ? " (turn them off)" : ""}${a.maxPrice ? `, max price ${zar(a.maxPrice)}` : ""}.`,
    (c, t, a) => c.upsertDistressedAlerts({ authToken: t, ...a })),

  markNotificationsRead: write("low", "Mark all the member's notifications as read.",
    empty,
    () => `Mark all your notifications as read.`,
    (c) => c.markAllNotificationsAsRead()),

  submitAppropriateness: write("compliance", "Submit the member's FAIS suitability questionnaire (required before investing).",
    z.object({
      investmentExperience: z.enum(["NONE", "BASIC", "EXPERIENCED", "PROFESSIONAL"]),
      annualIncome: z.enum(["UNDER_350K", "350_750K", "750K_1_5M", "OVER_1_5M"]),
      netWorth: z.enum(["UNDER_500K", "500K_2M", "2M_10M", "OVER_10M"]),
      understandsIlliquid: z.boolean(),
      understandsLossOfCapital: z.boolean(),
      understandsCoolingOff: z.boolean(),
      maxLossTolerance: z.number().min(0),
    }),
    (a) => `Submit your suitability questionnaire (experience ${a.investmentExperience}, max loss tolerance ${zar(a.maxLossTolerance)}), confirming you understand the risks.`,
    (c, t, a) => c.submitAppropriatenessQuestionnaire({ authToken: t, ...a })),

  submitPrequalification: write("compliance", "Run and save a home-loan affordability prequalification.",
    z.object({
      grossMonthlyIncome: z.number().min(0).max(100_000_000),
      monthlyExpenses: z.number().min(0).max(100_000_000).optional(),
      existingDebtRepayments: z.number().min(0).max(100_000_000).optional(),
      depositAmount: z.number().min(0).max(1_000_000_000).optional(),
      propertyPrice: z.number().min(0).max(1_000_000_000).optional(),
      annualInterestRate: z.number().min(0).max(100).optional(),
      loanTermYears: z.number().int().min(1).max(40).optional(),
      propertyId: z.number().int().positive().optional(),
      notes: z.string().max(1000).optional(),
      consent: z.literal(true),
    }),
    (a) => `Run and save a prequalification on a gross monthly income of ${zar(a.grossMonthlyIncome)}, with your consent to store the result.`,
    (c, t, a) => c.submitPrequalification({ authToken: t, ...a })),

  castVote: write("money", "Cast or change the member's vote on a governance proposal.",
    z.object({ proposalId: z.number().int().positive(), voteChoice: z.enum(["YES", "NO", "ABSTAIN"]) }),
    (a) => `Vote ${a.voteChoice} on governance proposal #${a.proposalId}.`,
    (c, t, a) => c.castVote({ authToken: t, proposalId: a.proposalId, voteChoice: a.voteChoice })),

  submitInvestmentProposal: write("money", "Submit a new investment proposal (commits the member to invest a cash amount in a property).",
    z.object({
      propertyId: z.number().int().positive(),
      contributionAmount: z.number().positive(),
      notes: z.string().optional(),
      strategy: z.string().optional(),
    }),
    (a) => `Submit an investment proposal of ${zar(a.contributionAmount)} into property #${a.propertyId}. This is a binding commitment subject to review.`,
    (c, t, a) => c.submitInvestmentProposal({ authToken: t, propertyId: a.propertyId, contributionAmount: a.contributionAmount, notes: a.notes, strategy: a.strategy })),

  cancelInvestmentProposal: write("money", "Cancel one of the member's own investment proposals.",
    z.object({ contributionId: z.number().int().positive() }),
    (a) => `Cancel your investment proposal / contribution #${a.contributionId}.`,
    (c, t, a) => c.cancelInvestmentProposal({ authToken: t, contributionId: a.contributionId })),

  initiateInvestmentPayment: write("money", "Start the payment for one of the member's contributions (returns a Paystack link).",
    z.object({ contributionId: z.number().int().positive(), callbackUrl: z.string().optional() }),
    (a) => `Begin payment for contribution #${a.contributionId}. You will receive a secure payment link to complete it.`,
    (c, t, a) => c.initiateInvestmentPayment({ authToken: t, contributionId: a.contributionId, callbackUrl: a.callbackUrl })),

  requestRefund: write("money", "Request a refund / cancellation of a contribution within the cooling-off window.",
    z.object({ contributionId: z.number().int().positive(), reason: z.string().min(10) }),
    (a) => `Request a refund of contribution #${a.contributionId}. Reason: "${a.reason}".`,
    (c, t, a) => c.requestRefund({ authToken: t, contributionId: a.contributionId, reason: a.reason })),

  placeShareOrder: write("money", "Place a secondary-market share order (BUY or SELL). For SELL prefer prepare_sell_order which pre-checks holdings.",
    z.object({
      shareClassId: z.number().int().positive(),
      side: z.enum(["BUY", "SELL"]),
      quantity: z.number().int().min(1),
      pricePerShare: z.number().min(0.01),
      expiresInDays: z.number().int().min(1).max(90).optional(),
    }),
    (a) => `Place a ${a.side} order for ${a.quantity} shares of class #${a.shareClassId} at ${zar(a.pricePerShare)} each (about ${zar(a.quantity * a.pricePerShare)} total). This is a real, binding market order.`,
    (c, t, a) => c.placeShareOrder({ authToken: t, shareClassId: a.shareClassId, side: a.side, quantity: a.quantity, pricePerShare: a.pricePerShare, expiresInDays: a.expiresInDays })),

  cancelShareOrder: write("money", "Cancel one of the member's resting share orders.",
    z.object({ orderId: z.number().int().positive() }),
    (a) => `Cancel your share order #${a.orderId}.`,
    (c, t, a) => c.cancelShareOrder({ authToken: t, orderId: a.orderId })),

  transferShares: write("money", "Transfer the member's shares to another investor.",
    z.object({
      shareClassId: z.number().int().positive(),
      toInvestorId: z.number().int().positive(),
      shares: z.number().int().min(1),
      pricePerShare: z.number().min(0),
    }),
    (a) => `Transfer ${a.shares} shares of class #${a.shareClassId} to investor #${a.toInvestorId} at ${zar(a.pricePerShare)} each. This moves real ownership and cannot be undone.`,
    (c, t, a) => c.transferShares({ authToken: t, shareClassId: a.shareClassId, toInvestorId: a.toInvestorId, shares: a.shares, pricePerShare: a.pricePerShare })),

  initiateWalletDeposit: write("money", "Start a wallet top-up (returns a Paystack payment link).",
    z.object({ amountRands: z.number().min(10), callbackUrl: z.string().optional() }),
    (a) => `Start a wallet deposit of ${zar(a.amountRands)}. You will receive a secure link to pay.`,
    (c, t, a) => c.initiateWalletDeposit({ authToken: t, amountRands: a.amountRands, callbackUrl: a.callbackUrl })),

  requestWithdrawal: write("money", "Request a withdrawal of wallet funds to a bank account.",
    z.object({
      amountRands: z.number().min(100),
      bankName: z.string().min(2),
      accountNumber: z.string().min(4),
      accountName: z.string().min(2),
      branchCode: z.string().optional(),
    }),
    (a) => `Withdraw ${zar(a.amountRands)} to ${a.bankName} account ${a.accountNumber} (${a.accountName}). A platform fee may apply.`,
    (c, t, a) => c.requestWithdrawal({ authToken: t, amountRands: a.amountRands, bankName: a.bankName, accountNumber: a.accountNumber, accountName: a.accountName, branchCode: a.branchCode })),

  expressResaleInterest: write("money", "Register the member's interest (and optional offer) in a public resale listing.",
    z.object({
      id: z.number().int().positive(),
      offerAmount: z.number().min(0).max(1_000_000_000).optional(),
      message: z.string().max(1000).optional(),
      contactPhone: z.string().max(40).optional(),
    }),
    (a) => `Express interest in resale listing #${a.id}${a.offerAmount ? ` with an offer of ${zar(a.offerAmount)}` : ""}.`,
    (c, t, a) => c.expressResaleInterest({ authToken: t, id: a.id, offerAmount: a.offerAmount, message: a.message, contactPhone: a.contactPhone })),

  requestReferralIntro: write("low", "Request an introduction to a partner (bond originator, conveyancer, auction house, insurer).",
    z.object({
      partnerType: z.enum(["BOND_ORIGINATOR", "CONVEYANCER", "AUCTION_HOUSE", "INSURANCE", "OTHER"]),
      listingId: z.number().int().positive().optional(),
      note: z.string().max(1000).optional(),
    }),
    (a) => `Request an introduction to a ${a.partnerType.replace(/_/g, " ").toLowerCase()} partner.`,
    (c, t, a) => c.requestReferralIntro({ authToken: t, partnerType: a.partnerType, listingId: a.listingId, note: a.note })),

  submitHomeLoanApplication: write("compliance", "Submit a home-loan application to the bond-originator partner.",
    z.object({
      requestedBondAmount: z.number().min(0).max(1_000_000_000),
      prequalificationId: z.number().int().positive().optional(),
      propertyId: z.number().int().positive().optional(),
      propertyPrice: z.number().min(0).max(1_000_000_000).optional(),
      depositAmount: z.number().min(0).max(1_000_000_000).optional(),
      grossMonthlyIncome: z.number().min(0).max(100_000_000).optional(),
      loanTermYears: z.number().int().min(1).max(40).optional(),
      applicantPhone: z.string().max(40).optional(),
      notes: z.string().max(1000).optional(),
      consentShareData: z.literal(true),
    }),
    (a) => `Submit a home-loan application for a bond of ${zar(a.requestedBondAmount)}, consenting to share your data with the bond originator.`,
    (c, t, a) => c.submitHomeLoanApplication({ authToken: t, ...a })),

  withdrawHomeLoanApplication: write("low", "Withdraw one of the member's home-loan applications.",
    z.object({ id: z.number().int().positive() }),
    (a) => `Withdraw your home-loan application #${a.id}.`,
    (c, t, a) => c.withdrawHomeLoanApplication({ authToken: t, id: a.id })),

  acceptHomeLoanOffer: write("money", "Accept a specific bank's home-loan offer.",
    z.object({ offerId: z.number().int().positive() }),
    (a) => `Accept bank offer #${a.offerId} on your home-loan application. Other offers will be declined.`,
    (c, t, a) => c.acceptHomeLoanOffer({ authToken: t, offerId: a.offerId })),

  withdrawLandPartnership: write("low", "Withdraw one of the member's land-partnership submissions (owners only).",
    z.object({ id: z.number().int().positive() }),
    (a) => `Withdraw your land-partnership submission #${a.id}.`,
    (c, t, a) => c.withdrawLandPartnership({ authToken: t, id: a.id })),

  withdrawSaleProposal: write("low", "Withdraw one of the member's property-sale proposals (owners only).",
    z.object({ id: z.number().int().positive() }),
    (a) => `Withdraw your sale proposal #${a.id}.`,
    (c, t, a) => c.withdrawSaleProposal({ authToken: t, id: a.id })),

  cancelTradeSettlement: write("money", "Cancel one of the member's pending trade settlements.",
    z.object({ settlementId: z.number().int().positive() }),
    (a) => `Cancel trade settlement #${a.settlementId}.`,
    (c, t, a) => c.cancelTradeSettlement({ authToken: t, settlementId: a.settlementId })),
};

/** A compact catalog for discovery by the agent / its prompt. */
export function listActionCatalog() {
  return Object.entries(ACTION_REGISTRY).map(([name, entry]) => ({
    name,
    mode: entry.mode,
    risk: entry.mode === "write" ? entry.risk : undefined,
    description: entry.description,
  }));
}

/** Run a READ action immediately through the member caller. */
export async function runReadAction(user: User, authToken: string, name: string, rawArgs: unknown) {
  assertOfficeUser(user);
  const entry = ACTION_REGISTRY[name];
  if (!entry) throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown action "${name}"` });
  if (entry.mode !== "read") {
    throw new TRPCError({ code: "BAD_REQUEST", message: `"${name}" is a write action; use prepareAction` });
  }
  const args = entry.input.parse(rawArgs ?? {});
  const caller = memberCaller(user, authToken);
  return entry.run(caller, authToken, args);
}

/**
 * Freeze a WRITE action for approval. Stores a human read-back + approvalDigest
 * in an OfficeTask (kind "ACTION"); nothing is executed yet.
 */
export async function prepareOfficeAction(user: User, name: string, rawArgs: unknown, now = new Date()) {
  assertOfficeUser(user);
  const entry = ACTION_REGISTRY[name];
  if (!entry) throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown action "${name}"` });
  if (entry.mode !== "write") {
    throw new TRPCError({ code: "BAD_REQUEST", message: `"${name}" is a read action; call it directly` });
  }
  const args = entry.input.parse(rawArgs ?? {});
  const summary = entry.summary(args);
  const title = summary.slice(0, 160);
  const data = {
    id: randomUUID(),
    userId: user.id,
    title,
    kind: "ACTION",
    parameters: json({ name, args }),
    result: json({ name, args, summary, risk: entry.risk }),
    expiresAt: new Date(now.getTime() + APPROVAL_TTL_MS),
    status: "PREPARED",
  };
  const approvalDigest = taskDigest(data);
  const task = await db.officeTask.create({ data: { ...data, approvalDigest } });
  await db.officeActionEvent.create({
    data: { taskId: task.id, userId: user.id, action: "PREPARED", payload: { approvalDigest, name } },
  });
  return {
    taskId: task.id,
    name,
    title,
    summary,
    risk: entry.risk,
    approvalDigest,
    expiresAt: data.expiresAt.toISOString(),
  };
}

/**
 * Execute a previously prepared WRITE action. Two-phase: atomically claim
 * PREPARED → APPROVED (verifying the frozen digest), then replay the frozen
 * args through the member caller and settle COMPLETED / FAILED.
 */
export async function confirmOfficeAction(
  user: User,
  authToken: string,
  taskId: string,
  approvalDigest: string,
  now = new Date(),
) {
  assertOfficeUser(user);
  // Phase 1: validate the frozen action and atomically claim it.
  const claimed = await db.$transaction(async (tx) => {
    const task = await tx.officeTask.findFirst({ where: { id: taskId, userId: user.id } });
    if (!task) throw notFound();
    if (task.kind !== "ACTION") {
      throw new TRPCError({ code: "BAD_REQUEST", message: "This task is not a voice action" });
    }
    assertPrepared(task, now);
    if (task.result === null) throw new TRPCError({ code: "BAD_REQUEST", message: "Frozen action is missing" });
    assertDigest(taskDigest({ ...task, result: task.result }), task.approvalDigest);
    assertDigest(task.approvalDigest, approvalDigest);
    const changed = await tx.officeTask.updateMany({
      where: {
        id: task.id,
        userId: user.id,
        status: "PREPARED",
        approvalDigest: task.approvalDigest,
        updatedAt: task.updatedAt,
        expiresAt: { gt: now },
      },
      data: { status: "APPROVED", approvedAt: now },
    });
    if (changed.count !== 1) throw conflict();
    await tx.officeActionEvent.create({
      data: { taskId: task.id, userId: user.id, action: "APPROVED", payload: { approvalDigest } },
    });
    return task;
  });

  const frozen = claimed.result as unknown as { name: string; args: unknown; summary: string };
  const entry = ACTION_REGISTRY[frozen.name];
  if (!entry || entry.mode !== "write") {
    await db.$transaction(async (tx) => {
      await tx.officeTask.updateMany({ where: { id: taskId, userId: user.id, status: "APPROVED" }, data: { status: "FAILED" } });
      await tx.officeActionEvent.create({ data: { taskId, userId: user.id, action: "FAILED", payload: { reason: "action no longer available" } } });
    });
    throw new TRPCError({ code: "BAD_REQUEST", message: "Action no longer available" });
  }

  // Phase 2: execute the REAL action using the exact frozen args the member approved.
  try {
    const caller = memberCaller(user, authToken);
    const args = entry.input.parse(frozen.args);
    const result = await entry.run(caller, authToken, args);
    await db.$transaction(async (tx) => {
      const done = await tx.officeTask.updateMany({
        where: { id: taskId, userId: user.id, status: "APPROVED" },
        data: { status: "COMPLETED", completedAt: new Date(), result: json({ ...frozen, executed: result ?? null }) },
      });
      if (done.count !== 1) throw conflict();
      await tx.officeActionEvent.create({ data: { taskId, userId: user.id, action: "COMPLETED", payload: { name: frozen.name } } });
    });
    return { ok: true as const, taskId, name: frozen.name, summary: frozen.summary, result };
  } catch (err) {
    const reason = err instanceof TRPCError ? err.message : err instanceof Error ? err.message : "Action failed";
    await db.$transaction(async (tx) => {
      await tx.officeTask.updateMany({ where: { id: taskId, userId: user.id, status: "APPROVED" }, data: { status: "FAILED" } });
      await tx.officeActionEvent.create({ data: { taskId, userId: user.id, action: "FAILED", payload: { reason } } });
    });
    throw err;
  }
}
