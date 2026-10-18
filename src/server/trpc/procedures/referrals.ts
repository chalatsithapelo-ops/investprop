import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { createAuditLog } from "~/server/trpc/procedures/audit-log";

// ═══════════════════════════════════════════════════════════════
//  Phase 3 — Referral partners + commission ledger.
//  We earn commission by referring distressed-deal users to bond
//  originators, conveyancers and auction houses.
// ═══════════════════════════════════════════════════════════════

const partnerTypeEnum = z.enum([
  "BOND_ORIGINATOR",
  "CONVEYANCER",
  "AUCTION_HOUSE",
  "INSURANCE",
  "OTHER",
]);
const leadStatusEnum = z.enum(["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"]);

function requireAdmin(role: string) {
  if (!["ADMIN", "DEVELOPMENT_MANAGER"].includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required." });
  }
}

/** Commission realized on conversion: flat + bps of estimated deal value. */
function computeCommission(
  partner: { commissionBps: number; commissionFlat: number },
  estimatedValue: number | null,
): number {
  const variable = estimatedValue ? (estimatedValue * partner.commissionBps) / 10000 : 0;
  return Math.round((partner.commissionFlat + variable) * 100) / 100;
}

// ─── Public-ish: a logged-in user requests an introduction ─────
export const requestReferralIntro = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      partnerType: partnerTypeEnum,
      listingId: z.number().optional(),
      note: z.string().max(1000).optional(),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);

    const partner = await db.referralPartner.findFirst({
      where: { type: input.partnerType, active: true },
      orderBy: { createdAt: "asc" },
    });
    if (!partner) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No partner available for this service yet. We'll be in touch.",
      });
    }

    const lead = await db.referralLead.create({
      data: {
        partnerId: partner.id,
        userId: user.id,
        listingId: input.listingId ?? null,
        contactName: user.name,
        contactEmail: user.email,
        status: "NEW",
        notes: input.note ?? null,
      },
    });

    await createAuditLog(user.id, "REQUEST_REFERRAL_INTRO", "ReferralLead", lead.id, {
      partnerType: input.partnerType,
    });

    return { success: true, partnerName: partner.name };
  });

// ─── Admin: list partners ──────────────────────────────────────
export const getReferralPartners = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireAdmin(user.role);
    const partners = await db.referralPartner.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { leads: true } } },
    });
    return partners.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      contactEmail: p.contactEmail,
      contactPhone: p.contactPhone,
      commissionBps: p.commissionBps,
      commissionFlat: p.commissionFlat,
      active: p.active,
      notes: p.notes,
      leadCount: p._count.leads,
      createdAt: p.createdAt,
    }));
  });

// ─── Admin: create / update partner ────────────────────────────
export const upsertReferralPartner = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      id: z.number().optional(),
      name: z.string().min(1),
      type: partnerTypeEnum,
      contactEmail: z.string().email().optional(),
      contactPhone: z.string().optional(),
      commissionBps: z.number().int().min(0).max(10000).default(0),
      commissionFlat: z.number().min(0).default(0),
      active: z.boolean().default(true),
      notes: z.string().max(2000).optional(),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireAdmin(user.role);

    const data = {
      name: input.name,
      type: input.type,
      contactEmail: input.contactEmail ?? null,
      contactPhone: input.contactPhone ?? null,
      commissionBps: input.commissionBps,
      commissionFlat: input.commissionFlat,
      active: input.active,
      notes: input.notes ?? null,
    };

    const partner = input.id
      ? await db.referralPartner.update({ where: { id: input.id }, data })
      : await db.referralPartner.create({ data });

    await createAuditLog(user.id, "UPSERT_REFERRAL_PARTNER", "ReferralPartner", partner.id, {
      name: partner.name,
    });

    return { id: partner.id };
  });

// ─── Admin: list leads (optionally filtered) ───────────────────
export const getReferralLeads = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      status: leadStatusEnum.optional(),
      partnerId: z.number().optional(),
    }),
  )
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireAdmin(user.role);

    const leads = await db.referralLead.findMany({
      where: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.partnerId ? { partnerId: input.partnerId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { partner: { select: { name: true, type: true } } },
    });

    return leads.map((l) => ({
      id: l.id,
      partnerId: l.partnerId,
      partnerName: l.partner.name,
      partnerType: l.partner.type,
      contactName: l.contactName,
      contactEmail: l.contactEmail,
      contactPhone: l.contactPhone,
      status: l.status,
      estimatedValue: l.estimatedValue,
      commissionAmount: l.commissionAmount,
      convertedAt: l.convertedAt,
      notes: l.notes,
      createdAt: l.createdAt,
    }));
  });

// ─── Admin: update lead status (books commission on conversion) ─
export const updateReferralLead = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      id: z.number(),
      status: leadStatusEnum,
      estimatedValue: z.number().min(0).optional(),
      notes: z.string().max(2000).optional(),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireAdmin(user.role);

    const lead = await db.referralLead.findUnique({
      where: { id: input.id },
      include: { partner: true },
    });
    if (!lead) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Lead not found." });
    }

    const estimatedValue = input.estimatedValue ?? lead.estimatedValue;
    const isConverting = input.status === "CONVERTED";
    const commissionAmount = isConverting
      ? computeCommission(lead.partner, estimatedValue ?? null)
      : lead.status === "CONVERTED"
        ? lead.commissionAmount
        : 0;

    const updated = await db.referralLead.update({
      where: { id: input.id },
      data: {
        status: input.status,
        estimatedValue: estimatedValue ?? null,
        notes: input.notes ?? lead.notes,
        commissionAmount,
        convertedAt: isConverting ? (lead.convertedAt ?? new Date()) : lead.convertedAt,
      },
    });

    await createAuditLog(user.id, "UPDATE_REFERRAL_LEAD", "ReferralLead", updated.id, {
      status: updated.status,
      commissionAmount: updated.commissionAmount,
    });

    return { id: updated.id, status: updated.status, commissionAmount: updated.commissionAmount };
  });

// ─── Admin: commission ledger summary ──────────────────────────
export const getReferralSummary = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireAdmin(user.role);

    const [byStatus, converted, totalLeads, partners] = await Promise.all([
      db.referralLead.groupBy({ by: ["status"], _count: { _all: true } }),
      db.referralLead.aggregate({
        where: { status: "CONVERTED" },
        _sum: { commissionAmount: true },
        _count: { _all: true },
      }),
      db.referralLead.count(),
      db.referralPartner.count({ where: { active: true } }),
    ]);

    return {
      totalLeads,
      activePartners: partners,
      statusCounts: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
      convertedCount: converted._count._all,
      totalCommissionEarned: converted._sum.commissionAmount ?? 0,
    };
  });
