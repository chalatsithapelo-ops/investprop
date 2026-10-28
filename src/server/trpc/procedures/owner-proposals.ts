import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";
import { createNotification } from "./notifications";
import { createAuditLog } from "./audit-log";
import {
  getFeeConfig,
  recordPlatformFee,
  computeFeeFromBps,
} from "~/server/fees/platform-fees";
import { getEffectiveSubscription } from "~/server/subscriptions/subscription-service";
import { requireFeature } from "~/server/subscriptions/subscription-service";
import { tierHasFeature } from "~/server/subscriptions/plans";
import { generateText } from "ai";
import { getModel, getModelId, runAIWithGuard, safeParseJson } from "~/server/ai/client";
import { recordAiPrediction, resolveAiPrediction } from "~/server/ai/prediction-log";

/** Discounted seller facilitation rate for active Seller Pro subscribers. */
const SELLER_PRO_FACILITATION_BPS = 100; // 1.0% vs the 2.0% standard

// ═══════════════════════════════════════════════════════════════
//  Owner (seller-side) fee booking helpers.
//  All bookings are idempotent per (feeType, sourceType, sourceId) and are
//  wrapped in try/catch so revenue bookkeeping never breaks the workflow.
// ═══════════════════════════════════════════════════════════════

/** Flat due-diligence / valuation pack fee — booked once per proposal. */
export async function bookAssessmentPackFee(proposalId: number): Promise<void> {
  try {
    const cfg = await getFeeConfig();
    if (!cfg.enabled || cfg.assessmentPackFee <= 0) return;
    await recordPlatformFee({
      feeType: "ASSESSMENT_PACK",
      sourceType: "OwnerSaleProposal",
      sourceId: proposalId,
      baseAmount: cfg.assessmentPackFee,
      feeBps: 0,
      feeAmount: cfg.assessmentPackFee,
      description: `Assessment / due-diligence pack — proposal #${proposalId}`,
    });
  } catch (err) {
    console.error("[owner-fees] assessment pack booking failed:", err);
  }
}

/**
 * Fees due when an owner sale proposal is ACCEPTED:
 *   • seller facilitation fee (% of the agreed price)
 *   • lease-back setup fee (flat) when the engagement is a lease-back
 *   • bond / conveyancing referral commission (flat) when a bond exists
 * Each fee type is idempotent per proposal.
 */
export async function bookOwnerAcceptanceFees(proposal: {
  id: number;
  ownerId: number;
  askingPrice: number;
  counterOfferAmount: number | null;
  engagementType: string;
  bondStatus: string;
}): Promise<void> {
  try {
    const cfg = await getFeeConfig();
    if (!cfg.enabled) return;
    const agreedPrice = proposal.counterOfferAmount ?? proposal.askingPrice;

    if (cfg.sellerFacilitationFeeBps > 0 && agreedPrice > 0) {
      // Active Seller Pro subscribers pay a reduced facilitation fee on close.
      const ownerSub = await getEffectiveSubscription(proposal.ownerId);
      const isSellerPro =
        ownerSub.active && tierHasFeature(ownerSub.tier, "SELLER_MULTI_LISTING");
      const facilitationBps = isSellerPro
        ? Math.min(cfg.sellerFacilitationFeeBps, SELLER_PRO_FACILITATION_BPS)
        : cfg.sellerFacilitationFeeBps;

      await recordPlatformFee({
        feeType: "SELLER_FACILITATION",
        sourceType: "OwnerSaleProposal",
        sourceId: proposal.id,
        baseAmount: agreedPrice,
        feeBps: facilitationBps,
        description: `Seller facilitation fee${isSellerPro ? " (Seller Pro rate)" : ""} — proposal #${proposal.id}`,
      });
    }

    if (proposal.engagementType === "LEASE_BACK" && cfg.leaseBackSetupFee > 0) {
      await recordPlatformFee({
        feeType: "LEASE_BACK_SETUP",
        sourceType: "OwnerSaleProposal",
        sourceId: proposal.id,
        baseAmount: cfg.leaseBackSetupFee,
        feeBps: 0,
        feeAmount: cfg.leaseBackSetupFee,
        description: `Lease-back setup fee — proposal #${proposal.id}`,
      });
    }

    if (proposal.bondStatus === "EXISTING" && cfg.bondReferralFee > 0) {
      await recordPlatformFee({
        feeType: "BOND_REFERRAL",
        sourceType: "OwnerSaleProposal",
        sourceId: proposal.id,
        baseAmount: cfg.bondReferralFee,
        feeBps: 0,
        feeAmount: cfg.bondReferralFee,
        description: `Bond / conveyancing referral — proposal #${proposal.id}`,
      });
    }
  } catch (err) {
    console.error("[owner-fees] acceptance fee booking failed:", err);
  }
}

// ─── Submit a sale proposal (Property Owner) ─────────────────────────

export const submitSaleProposal = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      title: z.string().min(3, "Title must be at least 3 characters"),
      description: z.string().min(10, "Description must be at least 10 characters"),
      address: z.string().min(3, "Address is required"),
      city: z.string().min(2, "City is required"),
      province: z.string().default("Gauteng"),
      propertyType: z.string(),
      askingPrice: z.number().positive("Asking price must be positive"),
      marketValue: z.number().positive().optional(),
      urgencyLevel: z.enum(["URGENT", "HIGH", "STANDARD"]).default("STANDARD"),
      saleType: z.enum(["CASH", "BOND", "INSTALLMENT"]),
      reason: z.string().optional(),
      bedrooms: z.number().int().min(0).optional(),
      bathrooms: z.number().int().min(0).optional(),
      squareMeters: z.number().int().min(0).optional(),
      erfSize: z.number().min(0).optional(),
      imageUrls: z.array(z.string()).optional(),
      documentUrls: z.array(z.object({
        kind: z.enum([
          "TITLE_DEED", "ID", "RATES_ACCOUNT", "BOND_STATEMENT", "LEASE", "OTHER",
          "ZONING_CERTIFICATE", "SURVEY_DIAGRAM", "BUILDING_PLANS",
          "ENVIRONMENTAL_APPROVAL", "GEOTECH", "SERVICES_CONFIRMATION",
        ]),
        url: z.string(),
        name: z.string(),
      })).optional(),
      engagementType: z.enum(["OUTRIGHT_SALE", "JOINT_VENTURE", "LEASE_BACK", "DEVELOPMENT_PARTNERSHIP"]).default("OUTRIGHT_SALE"),
      titleDeedNumber: z.string().optional(),
      erfNumber: z.string().optional(),
      bondStatus: z.enum(["NONE", "EXISTING"]).default("NONE"),
      bondOutstanding: z.number().min(0).optional(),
      bondBank: z.string().optional(),
      ratesStatus: z.enum(["CURRENT", "ARREARS"]).default("CURRENT"),
      ratesArrears: z.number().min(0).optional(),
      tenancyStatus: z.enum(["OWNER_OCCUPIED", "TENANTED", "VACANT"]).default("OWNER_OCCUPIED"),
      monthlyRent: z.number().min(0).optional(),
      leaseEndDate: z.string().optional(),
      conditionRating: z.enum(["EXCELLENT", "GOOD", "FAIR", "NEEDS_RENOVATION", "DISTRESSED"]).default("GOOD"),
      estimatedRenoCost: z.number().min(0).optional(),
      coOwners: z.string().optional(),
      popiaConsent: z.literal(true, {
        errorMap: () => ({ message: "You must consent to POPIA processing of your information" }),
      }),
      contactPhone: z.string().optional(),
      contactEmail: z.string().email().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["PROPERTY_OWNER"], "Only property owners can submit sale proposals");

    // Listing cap: Seller Pro subscribers list unlimited properties; everyone
    // else may keep a single active (PENDING/UNDER_REVIEW) listing at a time.
    const ownerSub = await getEffectiveSubscription(user.id);
    const sellerPro =
      ownerSub.active && tierHasFeature(ownerSub.tier, "SELLER_MULTI_LISTING");
    if (!sellerPro) {
      const activeListings = await db.ownerSaleProposal.count({
        where: { ownerId: user.id, status: { in: ["PENDING", "UNDER_REVIEW"] } },
      });
      if (activeListings >= 1) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "You already have an active listing. Upgrade to Seller Pro on the Pricing page to list multiple properties at once.",
        });
      }
    }

    // Cross-field validation
    if (input.bondStatus === "EXISTING" && (!input.bondOutstanding || input.bondOutstanding <= 0)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Please provide the outstanding bond balance" });
    }
    if (input.ratesStatus === "ARREARS" && (!input.ratesArrears || input.ratesArrears <= 0)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Please provide the rates arrears amount" });
    }
    if (input.tenancyStatus === "TENANTED" && !input.monthlyRent) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Please provide the monthly rent for the tenanted property" });
    }

    const proposal = await db.ownerSaleProposal.create({
      data: {
        ownerId: user.id,
        title: input.title,
        description: input.description,
        address: input.address,
        city: input.city,
        province: input.province,
        propertyType: input.propertyType,
        askingPrice: input.askingPrice,
        marketValue: input.marketValue,
        urgencyLevel: input.urgencyLevel,
        saleType: input.saleType,
        reason: input.reason,
        bedrooms: input.bedrooms,
        bathrooms: input.bathrooms,
        squareMeters: input.squareMeters,
        erfSize: input.erfSize,
        imageUrls: input.imageUrls ?? [],
        documentUrls: (input.documentUrls ?? []) as any,
        engagementType: input.engagementType,
        titleDeedNumber: input.titleDeedNumber,
        erfNumber: input.erfNumber,
        bondStatus: input.bondStatus,
        bondOutstanding: input.bondOutstanding,
        bondBank: input.bondBank,
        ratesStatus: input.ratesStatus,
        ratesArrears: input.ratesArrears,
        tenancyStatus: input.tenancyStatus,
        monthlyRent: input.monthlyRent,
        leaseEndDate: input.leaseEndDate ? new Date(input.leaseEndDate) : null,
        conditionRating: input.conditionRating,
        estimatedRenoCost: input.estimatedRenoCost,
        coOwners: input.coOwners,
        popiaConsent: input.popiaConsent,
        contactPhone: input.contactPhone ?? user.email,
        contactEmail: input.contactEmail ?? user.email,
      },
    });

    // Notify all DEV managers & project managers
    const managers = await db.user.findMany({
      where: { role: { in: ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"] } },
      select: { id: true },
    });

    const urgencyLabel =
      input.urgencyLevel === "URGENT"
        ? "🚨 URGENT"
        : input.urgencyLevel === "HIGH"
          ? "⚡ HIGH PRIORITY"
          : "New";

    await Promise.all(
      managers.map((mgr) =>
        createNotification(
          mgr.id,
          `${urgencyLabel} Sale Proposal — R${input.askingPrice.toLocaleString()}`,
          `${user.name} has submitted a ${input.saleType.toLowerCase()} sale proposal for "${input.title}" in ${input.city}. Asking price: R${input.askingPrice.toLocaleString()}. Please review in your dashboard.`,
          input.urgencyLevel === "URGENT" ? "WARNING" : "INFO",
          "PROPERTY",
          proposal.id
        )
      )
    );

    // Confirm to the owner
    await createNotification(
      user.id,
      "Sale Proposal Submitted",
      `Your sale proposal for "${input.title}" has been submitted and is pending review by the development team.`,
      "SUCCESS",
      "PROPERTY",
      proposal.id
    );

    return { success: true, proposal };
  });

// ─── Get my sale proposals (Property Owner) ─────────────────────────

export const getMySaleProposals = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
    })
  )
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["PROPERTY_OWNER"], "Only property owners can view their sale proposals");

    const proposals = await db.ownerSaleProposal.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        reviewedBy: {
          select: { name: true },
        },
      },
    });

    return proposals;
  });

// ─── Seller Pro: AI valuation report for a sale proposal ────────────

interface SellerValuationShape {
  estimatedValueLow: number;
  estimatedValueMid: number;
  estimatedValueHigh: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  askingPriceAssessment: string;
  pricePerSqm: string;
  summary: string;
  comparableAnalysis: string;
  sellingPoints: string[];
  risks: string[];
  recommendations: string[];
}

function normaliseValuation(parsed: unknown): SellerValuationShape | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Partial<SellerValuationShape>;
  if (typeof p.summary !== "string") return null;
  const num = (v: unknown) => Math.max(0, Math.round(Number(v ?? 0)));
  const conf = p.confidence === "LOW" || p.confidence === "HIGH" ? p.confidence : "MEDIUM";
  return {
    estimatedValueLow: num(p.estimatedValueLow),
    estimatedValueMid: num(p.estimatedValueMid),
    estimatedValueHigh: num(p.estimatedValueHigh),
    confidence: conf,
    askingPriceAssessment: p.askingPriceAssessment ?? "",
    pricePerSqm: p.pricePerSqm ?? "",
    summary: p.summary,
    comparableAnalysis: p.comparableAnalysis ?? "",
    sellingPoints: Array.isArray(p.sellingPoints) ? p.sellingPoints.slice(0, 8) : [],
    risks: Array.isArray(p.risks) ? p.risks.slice(0, 8) : [],
    recommendations: Array.isArray(p.recommendations) ? p.recommendations.slice(0, 8) : [],
  };
}

export const valuateSaleProposal = baseProcedure
  .input(z.object({ authToken: z.string(), proposalId: z.number(), force: z.boolean().optional() }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    // Seller Pro feature — staff bypass; everyone else gets an upgrade hint.
    await requireFeature(user, "SELLER_AI_VALUATION");

    const proposal = await db.ownerSaleProposal.findUnique({
      where: { id: input.proposalId },
    });
    if (!proposal) throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
    const isStaffRole = ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"].includes(user.role);
    if (proposal.ownerId !== user.id && !isStaffRole) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You can only value your own listings" });
    }

    // Serve the cached valuation unless the caller forces a refresh. Keeps the
    // premium feature cheap: repeat views never re-run the LLM.
    if (!input.force && proposal.aiValuation && proposal.aiValuatedAt) {
      const cached = normaliseValuation(proposal.aiValuation);
      if (cached) {
        return {
          proposalId: proposal.id,
          generatedAt: proposal.aiValuatedAt.toISOString(),
          cached: true,
          ...cached,
        };
      }
    }

    // Comparable homes: other owner listings in the same city (fallback province),
    // preferring the same property type.
    const comps = await db.ownerSaleProposal.findMany({
      where: {
        id: { not: proposal.id },
        OR: [{ city: proposal.city }, { province: proposal.province }],
      },
      orderBy: [{ city: proposal.city ? "asc" : "desc" }, { createdAt: "desc" }],
      take: 10,
      select: {
        propertyType: true,
        city: true,
        askingPrice: true,
        marketValue: true,
        bedrooms: true,
        bathrooms: true,
        squareMeters: true,
        conditionRating: true,
      },
    });

    const fmt = (n: number | null | undefined) =>
      n && n > 0 ? `R${Math.round(n).toLocaleString()}` : "n/a";

    const subject = [
      `Subject property (owner is selling):`,
      `- Type: ${proposal.propertyType}`,
      `- Location: ${proposal.address}, ${proposal.city}, ${proposal.province}`,
      `- Asking price: ${fmt(proposal.askingPrice)}`,
      `- Owner's market-value estimate: ${fmt(proposal.marketValue)}`,
      `- Beds/Baths: ${proposal.bedrooms ?? "?"}/${proposal.bathrooms ?? "?"}`,
      `- Floor area: ${proposal.squareMeters ? `${proposal.squareMeters} m²` : "?"}`,
      `- Erf size: ${proposal.erfSize ? `${proposal.erfSize} m²` : "?"}`,
      `- Condition: ${proposal.conditionRating}`,
      `- Estimated renovation cost: ${fmt(proposal.estimatedRenoCost)}`,
      `- Tenancy: ${proposal.tenancyStatus}${proposal.monthlyRent ? ` (rent ${fmt(proposal.monthlyRent)}/mo)` : ""}`,
    ].join("\n");

    const compText =
      comps.length > 0
        ? comps
            .map(
              (c) =>
                `- ${c.propertyType} in ${c.city}: asking ${fmt(c.askingPrice)}${c.marketValue ? `, est. value ${fmt(c.marketValue)}` : ""}, ${c.bedrooms ?? "?"}bd/${c.bathrooms ?? "?"}ba, ${c.squareMeters ? `${c.squareMeters}m²` : "?"}, ${c.conditionRating}`,
            )
            .join("\n")
        : "(no comparable listings on the platform yet — be explicit about this limitation)";

    const systemPrompt = `You are Investprop's seller-side valuation analyst for the South African residential market. A property owner wants an independent estimate of what their home is worth before selling.

Return ONLY JSON in this exact shape (no prose, no fences):
{
  "estimatedValueLow": <integer Rand>,
  "estimatedValueMid": <integer Rand>,
  "estimatedValueHigh": <integer Rand>,
  "confidence": "LOW" | "MEDIUM" | "HIGH",
  "askingPriceAssessment": "<is the asking price realistic vs your estimate? 1-2 sentences, be direct>",
  "pricePerSqm": "<estimated R/m² for this area and condition, with a short note>",
  "summary": "<120-160 words, second person to the owner, balanced, South African context (Rand, transfer duty, typical agent commission 5-7%, condition impact). State the fair-market range plainly.>",
  "comparableAnalysis": "<80-140 words comparing the subject to the comparable listings; quantify with numbers>",
  "sellingPoints": ["<short bullet, max 12 words>"],
  "risks": ["<short bullet on what could reduce value or slow the sale>"],
  "recommendations": ["<imperative bullet, max 12 words>"]
}

Rules:
- Ground your range in the comparables and the subject's condition/size. If data is thin, widen the range and set confidence LOW.
- Deduct for renovation cost and poor condition; add for larger erf/floor area and good condition.
- Never invent comparables beyond those provided. Be honest about uncertainty.`;

    const userPrompt = `${subject}\n\nCOMPARABLE LISTINGS ON THE PLATFORM:\n${compText}\n\nReturn the JSON object now.`;

    let result: Awaited<ReturnType<typeof generateText>>;
    try {
      result = await runAIWithGuard({
        userId: user.id,
        feature: "analyze-property",
        model: getModelId("cheap"),
        metadata: { proposalId: proposal.id },
        run: () => generateText({ model: getModel("cheap"), system: systemPrompt, prompt: userPrompt }),
        extractUsage: (r) => ({
          promptTokens: r.usage?.promptTokens,
          completionTokens: r.usage?.completionTokens,
        }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Valuation failed: ${msg}` });
    }

    const valuation = normaliseValuation(safeParseJson(result.text));
    if (!valuation) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "The AI valuation could not be generated. Please try again.",
      });
    }

    const generatedAt = new Date();
    await db.ownerSaleProposal.update({
      where: { id: proposal.id },
      data: { aiValuation: valuation as object, aiValuatedAt: generatedAt },
    });

    void recordAiPrediction({
      kind: "SELLER_VALUATION",
      subjectType: "OwnerSaleProposal",
      subjectId: proposal.id,
      userId: user.id,
      modelId: getModelId("cheap"),
      confidence: valuation.confidence,
      predicted: {
        estimatedValueLow: valuation.estimatedValueLow,
        estimatedValueMid: valuation.estimatedValueMid,
        estimatedValueHigh: valuation.estimatedValueHigh,
        askingPrice: proposal.askingPrice,
      },
    });

    return { proposalId: proposal.id, generatedAt: generatedAt.toISOString(), cached: false, ...valuation };
  });

export const getSaleProposals = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      status: z.enum(["PENDING", "UNDER_REVIEW", "ACCEPTED", "REJECTED", "WITHDRAWN"]).optional(),
    })
  )
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(
      user,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only development managers can view all sale proposals"
    );

    const where: any = {};
    if (input.status) {
      where.status = input.status;
    }

    const proposals = await db.ownerSaleProposal.findMany({
      where,
      orderBy: [{ urgencyLevel: "asc" }, { createdAt: "desc" }],
      include: {
        owner: {
          select: { id: true, name: true, email: true },
        },
        reviewedBy: {
          select: { name: true },
        },
      },
    });

    // Seller Pro priority review: flag proposals from active Seller Pro owners
    // and float them to the top of the queue (within their urgency ordering).
    const ownerIds = [...new Set(proposals.map((p) => p.owner.id))];
    const sellerProOwnerIds = new Set<number>();
    if (ownerIds.length > 0) {
      const now = new Date();
      const subs = await db.subscription.findMany({
        where: { userId: { in: ownerIds }, tier: "SELLER_PRO" },
        select: { userId: true, status: true, trialEndsAt: true, currentPeriodEnd: true },
      });
      for (const s of subs) {
        const trialOk =
          s.status === "TRIALING" ? !s.trialEndsAt || s.trialEndsAt.getTime() >= now.getTime() : true;
        const periodOk = !s.currentPeriodEnd || s.currentPeriodEnd.getTime() >= now.getTime();
        const entitled = (s.status === "ACTIVE" || s.status === "TRIALING") && trialOk && periodOk;
        if (entitled) sellerProOwnerIds.add(s.userId);
      }
    }
    const annotated = proposals
      .map((p) => ({ ...p, sellerPro: sellerProOwnerIds.has(p.owner.id) }))
      .sort((a, b) => Number(b.sellerPro) - Number(a.sellerPro));

    // Also get counts per status
    const counts = await db.ownerSaleProposal.groupBy({
      by: ["status"],
      _count: true,
    });

    const statusCounts: Record<string, number> = {};
    counts.forEach((c) => {
      statusCounts[c.status] = c._count;
    });

    return { proposals: annotated, statusCounts };
  });

// ─── Review a sale proposal (Dev Manager) ───────────────────────────

export const reviewSaleProposal = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      proposalId: z.number(),
      action: z.enum(["UNDER_REVIEW", "ACCEPTED", "REJECTED"]),
      reviewNotes: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(
      user,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only development managers can review sale proposals"
    );

    const proposal = await db.ownerSaleProposal.findUnique({
      where: { id: input.proposalId },
    });

    if (!proposal) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Sale proposal not found" });
    }

    const updated = await db.ownerSaleProposal.update({
      where: { id: input.proposalId },
      data: {
        status: input.action,
        reviewedById: user.id,
        reviewNotes: input.reviewNotes,
        reviewedAt: new Date(),
      },
    });

    // ── Platform monetization (owner / seller side) ──
    // Assessment pack is booked once the proposal enters active review;
    // facilitation / lease-back / bond-referral fees book on acceptance.
    if (input.action === "UNDER_REVIEW") {
      await bookAssessmentPackFee(proposal.id);
    } else if (input.action === "ACCEPTED") {
      await bookAssessmentPackFee(proposal.id);
      await bookOwnerAcceptanceFees(proposal);
      // Close the loop on any AI valuation: the accepted price is the real
      // outcome we can later calibrate the estimate against.
      void resolveAiPrediction("SELLER_VALUATION", proposal.id, {
        outcome: "ACCEPTED",
        agreedPrice: proposal.counterOfferAmount ?? proposal.askingPrice,
        acceptedAt: new Date().toISOString(),
      });
    }

    // Notify the property owner
    const statusLabel =
      input.action === "UNDER_REVIEW"
        ? "is now under review"
        : input.action === "ACCEPTED"
          ? "has been accepted"
          : "has been declined";

    await createNotification(
      proposal.ownerId,
      `Sale Proposal ${input.action.replace(/_/g, " ")}`,
      `Your sale proposal for "${proposal.title}" ${statusLabel}.${input.reviewNotes ? ` Notes: ${input.reviewNotes}` : ""}`,
      input.action === "ACCEPTED" ? "SUCCESS" : input.action === "REJECTED" ? "WARNING" : "INFO",
      "PROPERTY",
      proposal.id
    );

    return updated;
  });

// ─── Withdraw own proposal (Property Owner) ────────────────────────

export const withdrawSaleProposal = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      proposalId: z.number(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["PROPERTY_OWNER"], "Only property owners can withdraw their proposals");

    const proposal = await db.ownerSaleProposal.findUnique({
      where: { id: input.proposalId },
    });

    if (!proposal || proposal.ownerId !== user.id) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
    }

    if (proposal.status === "ACCEPTED") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cannot withdraw an accepted proposal",
      });
    }

    const updated = await db.ownerSaleProposal.update({
      where: { id: input.proposalId },
      data: { status: "WITHDRAWN" },
    });

    return updated;
  });

// ─── Book a recurring owner fee (Dev Manager) ──────────────────────
// JV promote (% of an owner JV / partnership payout) and lease-back
// management margin (% of rental income) are recurring, so each booking is
// recorded against an occurrence-unique ledger key to avoid collisions on
// the (feeType, sourceType, sourceId) unique index.
export const bookOwnerRecurringFee = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      proposalId: z.number(),
      feeType: z.enum(["JV_PROMOTE", "LEASE_BACK_MGMT"]),
      baseAmount: z.number().positive(),
      period: z.string().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(
      user,
      ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "ADMIN"],
      "Only managers can book owner fees"
    );

    const proposal = await db.ownerSaleProposal.findUnique({
      where: { id: input.proposalId },
    });
    if (!proposal) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Sale proposal not found" });
    }
    if (proposal.status !== "ACCEPTED") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Recurring fees can only be booked on an accepted proposal",
      });
    }

    const cfg = await getFeeConfig();
    if (!cfg.enabled) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Fee capture is currently disabled" });
    }
    const bps =
      input.feeType === "JV_PROMOTE" ? cfg.jvPromoteFeeBps : cfg.leaseBackMgmtFeeBps;
    if (bps <= 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "This fee is disabled (rate is 0). Set a rate in the revenue settings first.",
      });
    }

    const feeAmount = computeFeeFromBps(input.baseAmount, bps);
    const label = input.feeType === "JV_PROMOTE" ? "JV promote" : "Lease-back management";
    const period = input.period ?? new Date().toISOString().slice(0, 7);

    // Occurrence-unique sourceId keeps each recurring booking distinct.
    const occurrence = await db.platformRevenue.count({
      where: {
        feeType: input.feeType,
        sourceType: "OwnerSaleProposal",
        description: { contains: `proposal #${input.proposalId}/` },
      },
    });
    const sourceId = input.proposalId * 100000 + occurrence;

    const booked = await recordPlatformFee({
      feeType: input.feeType,
      sourceType: "OwnerSaleProposal",
      sourceId,
      baseAmount: input.baseAmount,
      feeBps: bps,
      feeAmount,
      description: `${label} fee — proposal #${input.proposalId}/${period}`,
    });

    await createAuditLog(user.id, "BOOK_OWNER_FEE", "OwnerSaleProposal", input.proposalId, {
      feeType: input.feeType,
      baseAmount: input.baseAmount,
      feeAmount: booked,
      period,
    });

    return { success: true, feeType: input.feeType, feeAmount: booked, period };
  });

// ─── Promote an accepted proposal into the investable pipeline ──────
// Bridges the gap between an agreed owner sale and an investor-facing
// opportunity: creates a DRAFT Property (unpublished, PLANNING) pre-filled
// from the proposal so a manager can structure the SPV, funding goal and
// share class before publishing it to investors. Idempotent: a proposal can
// only be promoted once.
export const promoteSaleProposalToProperty = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      proposalId: z.number(),
      fundingGoal: z.number().positive().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(
      user,
      ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only managers can promote proposals into the pipeline"
    );

    const proposal = await db.ownerSaleProposal.findUnique({
      where: { id: input.proposalId },
    });
    if (!proposal) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Proposal not found" });
    }
    if (proposal.status !== "ACCEPTED") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Only an accepted proposal can be promoted into the pipeline",
      });
    }
    if (proposal.convertedToPropertyId) {
      throw new TRPCError({
        code: "CONFLICT",
        message: `Already promoted as property #${proposal.convertedToPropertyId}`,
      });
    }

    // Agreed price = accepted counter-offer, else asking price. Seed the
    // funding goal from the agreed price unless the manager overrides it.
    const agreedPrice = proposal.counterOfferAmount ?? proposal.askingPrice;
    const seedFunding = input.fundingGoal ?? agreedPrice;
    const images = Array.isArray(proposal.imageUrls)
      ? (proposal.imageUrls as string[])
      : [];

    const property = await db.property.create({
      data: {
        title: proposal.title,
        description: proposal.description,
        address: proposal.address,
        city: proposal.city,
        state: proposal.province,
        zipCode: "",
        price: agreedPrice,
        imageUrl: images[0] ?? "",
        imageUrls: images,
        status: "AVAILABLE",
        investmentStatus: "PLANNING",
        fundingGoal: seedFunding,
        fundingRaised: 0,
        isPublished: false,
        minimumInvestment: 10000,
        expectedReturns: 0,
        bedrooms: proposal.bedrooms ?? undefined,
        bathrooms: proposal.bathrooms ?? undefined,
        squareMeters: proposal.squareMeters ?? undefined,
        userId: user.id,
      },
    });

    await db.ownerSaleProposal.update({
      where: { id: proposal.id },
      data: { convertedToPropertyId: property.id, convertedAt: new Date() },
    });

    await createAuditLog(
      user.id,
      "PROMOTE_PROPOSAL_TO_PROPERTY",
      "OwnerSaleProposal",
      proposal.id,
      { propertyId: property.id, agreedPrice, fundingGoal: seedFunding }
    );

    // Tell the owner their deal has entered the acquisition pipeline.
    await createNotification(
      proposal.ownerId,
      "Your property has entered our acquisition pipeline",
      `"${proposal.title}" has been moved into structuring. Our team will finalise the acquisition and keep you updated on next steps.`,
      "SUCCESS",
      "PROPERTY",
      proposal.id
    );

    return { success: true, propertyId: property.id, title: property.title };
  });

// ═══════════════════════════════════════════════════════════════
//  Public resale marketplace — properties the SPV chooses NOT to flip
//  but lists for the public to buy outright. Buyers browse, view a
//  PII-safe listing, and finance the purchase via the home-loan flow.
// ═══════════════════════════════════════════════════════════════

/** PII-safe projection for a buyer-facing resale listing. */
function serialisePublicListing(p: {
  id: number;
  title: string;
  description: string;
  address: string;
  city: string;
  province: string;
  propertyType: string;
  askingPrice: number;
  marketValue: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  squareMeters: number | null;
  erfSize: number | null;
  imageUrls: unknown;
  conditionRating: string;
  publiclyListedAt: Date | null;
}) {
  const images = Array.isArray(p.imageUrls) ? (p.imageUrls as string[]) : [];
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    address: p.address,
    city: p.city,
    province: p.province,
    propertyType: p.propertyType,
    askingPrice: p.askingPrice,
    marketValue: p.marketValue,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    squareMeters: p.squareMeters,
    erfSize: p.erfSize,
    imageUrls: images,
    conditionRating: p.conditionRating,
    publiclyListedAt: p.publiclyListedAt,
  };
}

// ─── Admin: list / delist a proposal on the public resale market ─────
export const setSaleProposalPublic = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      proposalId: z.number(),
      publiclyListed: z.boolean(),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(
      user,
      ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"],
      "Only managers can publish resale listings",
    );

    const proposal = await db.ownerSaleProposal.findUnique({ where: { id: input.proposalId } });
    if (!proposal) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Sale proposal not found" });
    }
    if (proposal.convertedToPropertyId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "This proposal was promoted into the investment pipeline and cannot be public-listed.",
      });
    }

    const updated = await db.ownerSaleProposal.update({
      where: { id: proposal.id },
      data: {
        publiclyListed: input.publiclyListed,
        publiclyListedAt: input.publiclyListed ? (proposal.publiclyListedAt ?? new Date()) : null,
      },
    });

    await createAuditLog(
      user.id,
      input.publiclyListed ? "PUBLISH_RESALE_LISTING" : "UNPUBLISH_RESALE_LISTING",
      "OwnerSaleProposal",
      proposal.id,
    );

    if (input.publiclyListed) {
      await createNotification(
        proposal.ownerId,
        "Your property is now listed for sale to the public",
        `"${proposal.title}" is live on the InvestProp resale marketplace for buyers to view and make an offer.`,
        "SUCCESS",
        "PROPERTY",
        proposal.id,
      );
    }

    return { success: true as const, publiclyListed: updated.publiclyListed };
  });

// ─── Public (logged-in): browse the resale marketplace ──────────────
export const getPublicResaleListings = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      province: z.string().optional(),
      propertyType: z.string().optional(),
      maxPrice: z.number().positive().optional(),
      search: z.string().max(120).optional(),
    }),
  )
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);

    const where: any = {
      publiclyListed: true,
      convertedToPropertyId: null,
      status: { not: "WITHDRAWN" },
    };
    if (input.province) where.province = input.province;
    if (input.propertyType) where.propertyType = input.propertyType;
    if (input.maxPrice) where.askingPrice = { lte: input.maxPrice };
    if (input.search) {
      where.OR = [
        { title: { contains: input.search, mode: "insensitive" } },
        { city: { contains: input.search, mode: "insensitive" } },
        { address: { contains: input.search, mode: "insensitive" } },
      ];
    }

    const rows = await db.ownerSaleProposal.findMany({
      where,
      orderBy: { publiclyListedAt: "desc" },
      take: 120,
    });
    return { listings: rows.map(serialisePublicListing) };
  });

// ─── Public (logged-in): one resale listing ─────────────────────────
export const getPublicResaleListing = baseProcedure
  .input(z.object({ authToken: z.string(), id: z.number().int().positive() }))
  .query(async ({ input }) => {
    await getAuthenticatedUser(input.authToken);
    const p = await db.ownerSaleProposal.findFirst({
      where: { id: input.id, publiclyListed: true, convertedToPropertyId: null },
    });
    if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });
    return { listing: serialisePublicListing(p) };
  });

// ─── Buyer: express interest / make an offer on a resale listing ─────
export const expressResaleInterest = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      id: z.number().int().positive(),
      offerAmount: z.number().min(0).max(1_000_000_000).optional(),
      message: z.string().max(1000).optional(),
      contactPhone: z.string().max(40).optional(),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const listing = await db.ownerSaleProposal.findFirst({
      where: { id: input.id, publiclyListed: true, convertedToPropertyId: null },
    });
    if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });

    // Notify the managers who handle acquisitions/sales.
    const managers = await db.user.findMany({
      where: { role: { in: ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"] }, status: "ACTIVE" },
      select: { id: true },
    });
    const offerText = input.offerAmount
      ? ` Offer: R${Math.round(input.offerAmount).toLocaleString("en-ZA")}.`
      : "";
    await Promise.all(
      managers.map((m) =>
        createNotification(
          m.id,
          "New resale buyer enquiry",
          `${user.name} is interested in "${listing.title}".${offerText}`,
          "INFO",
          "PROPERTY",
          listing.id,
        ),
      ),
    );

    await createAuditLog(user.id, "EXPRESS_RESALE_INTEREST", "OwnerSaleProposal", listing.id, {
      offerAmount: input.offerAmount ?? null,
    });

    return { success: true as const };
  });

