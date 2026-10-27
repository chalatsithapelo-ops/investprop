import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";
import { createNotification } from "./notifications";
import { createAuditLog } from "./audit-log";
import {
  generateLandPartnershipAgreement,
  DEFAULT_PLATFORM_PARTY,
  type LandPartnershipForAgreement,
  type PlatformParty,
} from "~/server/land-partnership/agreement";

// Roles permitted to review / countersign / form SPVs for land partnerships.
const MANAGER_ROLES = ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"] as const;

/** Build a unique LP-YYYY-#### reference code. */
async function nextReferenceCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `LP-${year}-`;
  const last = await db.landPartnership.findFirst({
    where: { referenceCode: { startsWith: prefix } },
    orderBy: { referenceCode: "desc" },
    select: { referenceCode: true },
  });
  let seq = 1;
  if (last?.referenceCode) {
    const n = parseInt(last.referenceCode.slice(prefix.length), 10);
    if (!Number.isNaN(n)) seq = n + 1;
  }
  return `${prefix}${seq.toString().padStart(4, "0")}`;
}

/** Map a DB record to the shape the agreement generator expects. */
function toAgreementInput(lp: {
  id: number;
  referenceCode: string;
  ownerFullName: string;
  ownerIdNumber: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
  ownerAddress: string | null;
  ownerEntityName: string | null;
  ownerEntityRegNumber: string | null;
  landTitle: string;
  landDescription: string;
  address: string;
  city: string;
  province: string;
  erfNumber: string | null;
  titleDeedNumber: string | null;
  erfSize: number | null;
  currentZoning: string | null;
  currentUse: string | null;
  municipalValue: number | null;
  estimatedLandValue: number | null;
  bondStatus: string | null;
  bondOutstanding: number | null;
  bondBank: string | null;
  ratesStatus: string | null;
  ratesArrears: number | null;
  coOwners: string | null;
  developmentType: string | null;
  intendedStrategy: string | null;
  proposedUnits: number | null;
  estimatedGDV: number | null;
  estimatedBuildCost: number | null;
  ownerEquityPct: number;
  platformEquityPct: number;
  createdAt: Date;
}): LandPartnershipForAgreement {
  return { ...lp };
}

// ─── Submit a land partnership (Property Owner) ─────────────────────

export const submitLandPartnership = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      ownerFullName: z.string().min(3, "Full name is required"),
      ownerIdNumber: z.string().optional(),
      ownerPhone: z.string().optional(),
      ownerEmail: z.string().email().optional(),
      ownerAddress: z.string().optional(),
      ownerEntityName: z.string().optional(),
      ownerEntityRegNumber: z.string().optional(),
      landTitle: z.string().min(3, "A short title for the land is required"),
      landDescription: z.string().min(10, "Please describe the land"),
      address: z.string().min(3, "Address is required"),
      city: z.string().min(2, "City is required"),
      province: z.string().default("Gauteng"),
      erfNumber: z.string().optional(),
      titleDeedNumber: z.string().optional(),
      erfSize: z.number().min(0).optional(),
      currentZoning: z.string().optional(),
      currentUse: z.string().optional(),
      municipalValue: z.number().min(0).optional(),
      estimatedLandValue: z.number().min(0).optional(),
      bondStatus: z.enum(["NONE", "EXISTING"]).default("NONE"),
      bondOutstanding: z.number().min(0).optional(),
      bondBank: z.string().optional(),
      ratesStatus: z.enum(["CURRENT", "ARREARS"]).default("CURRENT"),
      ratesArrears: z.number().min(0).optional(),
      coOwners: z.string().optional(),
      developmentType: z.string().optional(),
      intendedStrategy: z.enum(["DEVELOP", "FLIP", "HOLD"]).optional(),
      proposedUnits: z.number().int().min(0).optional(),
      estimatedGDV: z.number().min(0).optional(),
      estimatedBuildCost: z.number().min(0).optional(),
      documentUrls: z
        .array(
          z.object({
            kind: z.string(),
            url: z.string(),
            name: z.string(),
          }),
        )
        .optional(),
      imageUrls: z.array(z.string()).optional(),
      popiaConsent: z.literal(true, {
        errorMap: () => ({
          message: "You must consent to POPIA processing of your information",
        }),
      }),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(
      user,
      ["PROPERTY_OWNER"],
      "Only property owners can submit land for partnership",
    );

    if (
      input.bondStatus === "EXISTING" &&
      (!input.bondOutstanding || input.bondOutstanding <= 0)
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Please provide the outstanding bond balance",
      });
    }
    if (
      input.ratesStatus === "ARREARS" &&
      (!input.ratesArrears || input.ratesArrears <= 0)
    ) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Please provide the rates arrears amount",
      });
    }

    const referenceCode = await nextReferenceCode();

    const lp = await db.landPartnership.create({
      data: {
        ownerId: user.id,
        referenceCode,
        ownerFullName: input.ownerFullName,
        ownerIdNumber: input.ownerIdNumber,
        ownerPhone: input.ownerPhone ?? user.email,
        ownerEmail: input.ownerEmail ?? user.email,
        ownerAddress: input.ownerAddress,
        ownerEntityName: input.ownerEntityName,
        ownerEntityRegNumber: input.ownerEntityRegNumber,
        landTitle: input.landTitle,
        landDescription: input.landDescription,
        address: input.address,
        city: input.city,
        province: input.province,
        erfNumber: input.erfNumber,
        titleDeedNumber: input.titleDeedNumber,
        erfSize: input.erfSize,
        currentZoning: input.currentZoning,
        currentUse: input.currentUse,
        municipalValue: input.municipalValue,
        estimatedLandValue: input.estimatedLandValue,
        bondStatus: input.bondStatus,
        bondOutstanding: input.bondOutstanding,
        bondBank: input.bondBank,
        ratesStatus: input.ratesStatus,
        ratesArrears: input.ratesArrears,
        coOwners: input.coOwners,
        developmentType: input.developmentType,
        intendedStrategy: input.intendedStrategy,
        proposedUnits: input.proposedUnits,
        estimatedGDV: input.estimatedGDV,
        estimatedBuildCost: input.estimatedBuildCost,
        documentUrls: (input.documentUrls ?? []) as any,
        imageUrls: (input.imageUrls ?? []) as any,
        popiaConsent: input.popiaConsent,
        ownerEquityPct: 20,
        platformEquityPct: 80,
        status: "SUBMITTED",
      },
    });

    const managers = await db.user.findMany({
      where: { role: { in: [...MANAGER_ROLES] } },
      select: { id: true },
    });
    await Promise.all(
      managers.map((mgr) =>
        createNotification(
          mgr.id,
          `New Land Partnership — ${lp.referenceCode}`,
          `${user.name} submitted land "${input.landTitle}" in ${input.city} for a development partnership. Please review in the Land Partnerships queue.`,
          "INFO",
          "PROPERTY",
          lp.id,
        ),
      ),
    );
    await createNotification(
      user.id,
      "Land Partnership Submitted",
      `Your land "${input.landTitle}" (${lp.referenceCode}) has been submitted. Our development team will review it and prepare a partnership agreement.`,
      "SUCCESS",
      "PROPERTY",
      lp.id,
    );

    return { success: true, landPartnership: lp };
  });

// ─── Get my land partnerships (Property Owner) ──────────────────────

export const getMyLandPartnerships = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["PROPERTY_OWNER"], "Only property owners can view their land partnerships");
    return db.landPartnership.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: "desc" },
      include: { reviewedBy: { select: { name: true } }, spv: { select: { name: true, registrationNumber: true, status: true } } },
    });
  });

// ─── Get one land partnership (owner or manager) ────────────────────

export const getLandPartnershipById = baseProcedure
  .input(z.object({ authToken: z.string(), id: z.number() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const lp = await db.landPartnership.findUnique({
      where: { id: input.id },
      include: {
        reviewedBy: { select: { name: true } },
        spv: { select: { name: true, registrationNumber: true, status: true } },
        owner: { select: { name: true, email: true } },
      },
    });
    if (!lp) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Land partnership not found" });
    }
    const isManager = (MANAGER_ROLES as readonly string[]).includes(user.role);
    if (lp.ownerId !== user.id && !isManager) {
      throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this record" });
    }
    return lp;
  });

// ─── Manager queue: all land partnerships ───────────────────────────

export const getAllLandPartnerships = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      status: z
        .enum([
          "SUBMITTED",
          "UNDER_REVIEW",
          "APPROVED",
          "AGREEMENT_READY",
          "SIGNED",
          "COUNTERSIGNED",
          "SPV_FORMED",
          "ACTIVE",
          "REJECTED",
          "WITHDRAWN",
        ])
        .optional(),
    }),
  )
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, [...MANAGER_ROLES], "Only managers can view the land partnership queue");
    return db.landPartnership.findMany({
      where: input.status ? { status: input.status } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        owner: { select: { name: true, email: true } },
        reviewedBy: { select: { name: true } },
        spv: { select: { name: true, registrationNumber: true, status: true } },
      },
    });
  });

// ─── Review / approve (Manager) — generates the agreement ───────────

export const reviewLandPartnership = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      id: z.number(),
      action: z.enum(["UNDER_REVIEW", "APPROVE", "REJECT"]),
      reviewNotes: z.string().optional(),
      rejectedReason: z.string().optional(),
      ownerEquityPct: z.number().min(0).max(100).optional(),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, [...MANAGER_ROLES], "Only managers can review land partnerships");

    const lp = await db.landPartnership.findUnique({ where: { id: input.id } });
    if (!lp) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Land partnership not found" });
    }

    if (input.action === "UNDER_REVIEW") {
      const updated = await db.landPartnership.update({
        where: { id: lp.id },
        data: {
          status: "UNDER_REVIEW",
          reviewedById: user.id,
          reviewNotes: input.reviewNotes,
          reviewedAt: new Date(),
        },
      });
      await createNotification(
        lp.ownerId,
        "Land Partnership Under Review",
        `Your land "${lp.landTitle}" (${lp.referenceCode}) is now being assessed by our development team.`,
        "INFO",
        "PROPERTY",
        lp.id,
      );
      await createAuditLog(
        user.id,
        "LAND_PARTNERSHIP_UNDER_REVIEW",
        "LandPartnership",
        lp.id,
        { referenceCode: lp.referenceCode },
      );
      return updated;
    }

    if (input.action === "REJECT") {
      const updated = await db.landPartnership.update({
        where: { id: lp.id },
        data: {
          status: "REJECTED",
          reviewedById: user.id,
          reviewNotes: input.reviewNotes,
          rejectedReason: input.rejectedReason ?? input.reviewNotes,
          reviewedAt: new Date(),
        },
      });
      await createNotification(
        lp.ownerId,
        "Land Partnership Declined",
        `Your land "${lp.landTitle}" (${lp.referenceCode}) was not approved at this time.${input.rejectedReason ? ` Reason: ${input.rejectedReason}` : ""}`,
        "WARNING",
        "PROPERTY",
        lp.id,
      );
      await createAuditLog(
        user.id,
        "LAND_PARTNERSHIP_REJECTED",
        "LandPartnership",
        lp.id,
        { referenceCode: lp.referenceCode, rejectedReason: input.rejectedReason ?? null },
      );
      return updated;
    }

    // APPROVE → set equity, generate the auto-filled agreement
    const ownerPct = input.ownerEquityPct ?? lp.ownerEquityPct ?? 20;
    const platformPct = 100 - ownerPct;

    const agreementInput = toAgreementInput({
      ...lp,
      ownerEquityPct: ownerPct,
      platformEquityPct: platformPct,
    });
    const agreementContent = generateLandPartnershipAgreement(
      agreementInput,
      DEFAULT_PLATFORM_PARTY,
    );

    const updated = await db.landPartnership.update({
      where: { id: lp.id },
      data: {
        status: "AGREEMENT_READY",
        reviewedById: user.id,
        reviewNotes: input.reviewNotes,
        reviewedAt: new Date(),
        ownerEquityPct: ownerPct,
        platformEquityPct: platformPct,
        agreementContent,
        agreementGeneratedAt: new Date(),
      },
    });

    await createNotification(
      lp.ownerId,
      "Partnership Agreement Ready to Sign",
      `Great news — your land "${lp.landTitle}" (${lp.referenceCode}) has been approved for a development partnership on a ${ownerPct}% / ${platformPct}% basis. Your agreement is ready to review and sign in the app.`,
      "SUCCESS",
      "PROPERTY",
      lp.id,
    );
    await createAuditLog(
      user.id,
      "LAND_PARTNERSHIP_APPROVED",
      "LandPartnership",
      lp.id,
      { referenceCode: lp.referenceCode, ownerEquityPct: ownerPct, platformEquityPct: platformPct },
    );

    return updated;
  });

// ─── Owner e-signs the agreement ────────────────────────────────────

export const signLandPartnership = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      id: z.number(),
      signatureName: z.string().min(3, "Please type your full legal name to sign"),
      signatureId: z.string().optional(),
      signatureData: z.string().optional(),
      acceptTerms: z.literal(true, {
        errorMap: () => ({ message: "You must accept the agreement terms to sign" }),
      }),
    }),
  )
  .mutation(async ({ input, ctx }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["PROPERTY_OWNER"], "Only the landowner can sign this agreement");

    const lp = await db.landPartnership.findUnique({ where: { id: input.id } });
    if (!lp || lp.ownerId !== user.id) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Land partnership not found" });
    }
    if (lp.status !== "AGREEMENT_READY") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "This agreement is not ready to sign yet.",
      });
    }
    if (!lp.agreementContent) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No agreement has been generated for this partnership.",
      });
    }

    const ip =
      (ctx as any)?.req?.headers?.get?.("x-forwarded-for") ??
      (ctx as any)?.req?.headers?.["x-forwarded-for"] ??
      null;

    const updated = await db.landPartnership.update({
      where: { id: lp.id },
      data: {
        status: "SIGNED",
        ownerSignatureName: input.signatureName,
        ownerSignatureId: input.signatureId,
        ownerSignatureData: input.signatureData,
        ownerSignatureIp: typeof ip === "string" ? ip : null,
        ownerSignedAt: new Date(),
      },
    });

    const managers = await db.user.findMany({
      where: { role: { in: [...MANAGER_ROLES] } },
      select: { id: true },
    });
    await Promise.all(
      managers.map((mgr) =>
        createNotification(
          mgr.id,
          `Agreement Signed — ${lp.referenceCode}`,
          `${lp.ownerFullName} has e-signed the partnership agreement for "${lp.landTitle}". Please countersign and proceed to SPV formation.`,
          "SUCCESS",
          "PROPERTY",
          lp.id,
        ),
      ),
    );
    await createAuditLog(
      user.id,
      "LAND_PARTNERSHIP_SIGNED",
      "LandPartnership",
      lp.id,
      { referenceCode: lp.referenceCode, signatureName: input.signatureName },
      typeof ip === "string" ? ip : null,
    );

    return updated;
  });

// ─── Platform countersigns ──────────────────────────────────────────

export const countersignLandPartnership = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      id: z.number(),
      signatoryName: z.string().min(3, "Signatory name is required"),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, [...MANAGER_ROLES], "Only managers can countersign agreements");

    const lp = await db.landPartnership.findUnique({ where: { id: input.id } });
    if (!lp) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Land partnership not found" });
    }
    if (lp.status !== "SIGNED") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "The owner must sign before the platform can countersign.",
      });
    }

    const updated = await db.landPartnership.update({
      where: { id: lp.id },
      data: {
        status: "COUNTERSIGNED",
        platformSignatoryName: input.signatoryName,
        platformSignedAt: new Date(),
      },
    });

    await createNotification(
      lp.ownerId,
      "Partnership Agreement Executed",
      `The partnership agreement for "${lp.landTitle}" (${lp.referenceCode}) has been countersigned by Investprop and is now fully executed. We will proceed to form the ring-fenced SPV for your project.`,
      "SUCCESS",
      "PROPERTY",
      lp.id,
    );
    await createAuditLog(
      user.id,
      "LAND_PARTNERSHIP_COUNTERSIGNED",
      "LandPartnership",
      lp.id,
      { referenceCode: lp.referenceCode, signatoryName: input.signatoryName },
    );

    return updated;
  });

// ─── Form the ring-fenced SPV and link it ───────────────────────────

export const formSpvForLandPartnership = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      id: z.number(),
      spvName: z.string().min(3, "SPV name is required"),
      registrationNumber: z.string().optional(),
      directorId: z.number().optional(),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, [...MANAGER_ROLES], "Only managers can form SPVs");

    const lp = await db.landPartnership.findUnique({ where: { id: input.id } });
    if (!lp) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Land partnership not found" });
    }
    if (lp.status !== "COUNTERSIGNED" && lp.status !== "SIGNED") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "The agreement must be signed before forming the SPV.",
      });
    }
    if (lp.spvId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "An SPV is already linked to this partnership." });
    }

    const spv = await db.sPV.create({
      data: {
        name: input.spvName,
        registrationNumber: input.registrationNumber,
        status: "PENDING_REGISTRATION",
        directorId: input.directorId ?? user.id,
        notes: `Formed for land partnership ${lp.referenceCode} — ${lp.ownerFullName} contributes land for ${lp.ownerEquityPct}% equity.`,
      },
    });

    const updated = await db.landPartnership.update({
      where: { id: lp.id },
      data: {
        status: "SPV_FORMED",
        spvId: spv.id,
        spvFormedAt: new Date(),
      },
    });

    await createNotification(
      lp.ownerId,
      "Your Project SPV Has Been Formed",
      `A ring-fenced company (${spv.name}) has been set up for "${lp.landTitle}" (${lp.referenceCode}). Your land will be transferred into this SPV, in which you hold ${lp.ownerEquityPct}%.`,
      "SUCCESS",
      "PROPERTY",
      lp.id,
    );
    await createAuditLog(
      user.id,
      "LAND_PARTNERSHIP_SPV_FORMED",
      "LandPartnership",
      lp.id,
      { referenceCode: lp.referenceCode, spvId: spv.id, spvName: spv.name },
    );

    return { landPartnership: updated, spv };
  });

// ─── Activate the live partnership ──────────────────────────────────

export const activateLandPartnership = baseProcedure
  .input(z.object({ authToken: z.string(), id: z.number() }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, [...MANAGER_ROLES], "Only managers can activate partnerships");

    const lp = await db.landPartnership.findUnique({ where: { id: input.id } });
    if (!lp) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Land partnership not found" });
    }
    if (lp.status !== "SPV_FORMED") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "The SPV must be formed before the partnership can go live.",
      });
    }

    const updated = await db.landPartnership.update({
      where: { id: lp.id },
      data: { status: "ACTIVE" },
    });
    await createNotification(
      lp.ownerId,
      "Partnership Live",
      `Your development partnership for "${lp.landTitle}" (${lp.referenceCode}) is now live. Welcome aboard.`,
      "SUCCESS",
      "PROPERTY",
      lp.id,
    );
    return updated;
  });

// ─── Withdraw own submission (Property Owner) ───────────────────────

export const withdrawLandPartnership = baseProcedure
  .input(z.object({ authToken: z.string(), id: z.number() }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["PROPERTY_OWNER"], "Only property owners can withdraw their submissions");

    const lp = await db.landPartnership.findUnique({ where: { id: input.id } });
    if (!lp || lp.ownerId !== user.id) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Land partnership not found" });
    }
    if (["SPV_FORMED", "ACTIVE"].includes(lp.status)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "This partnership is already in formation and cannot be withdrawn here.",
      });
    }

    return db.landPartnership.update({
      where: { id: lp.id },
      data: { status: "WITHDRAWN" },
    });
  });
