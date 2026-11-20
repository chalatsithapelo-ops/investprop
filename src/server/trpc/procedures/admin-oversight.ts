import { z } from "zod";
import { db } from "~/server/db";
import { protectedProcedure } from "~/server/trpc/main";
import { TRPCError } from "@trpc/server";

// Admin + managers may view platform-wide investment & people oversight (PII).
const OVERSIGHT_ROLES = ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "COMPLIANCE_OFFICER"];

const oversightProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!OVERSIGHT_ROLES.includes(ctx.user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Oversight access required" });
  }
  return next({ ctx });
});

/**
 * Admin oversight: every investment across every property — who invested in
 * what, for how much, their status and expected return. Grouped by property
 * with platform-wide totals, so the Admin team has a single source of truth.
 */
export const getAllInvestmentsOverview = oversightProcedure
  .input(
    z.object({
      search: z.string().optional(),
      status: z.enum(["ALL", "PENDING", "APPROVED", "PAID", "CANCELLED"]).default("ALL"),
    }).optional(),
  )
  .query(async ({ input }) => {
    const statusFilter = input?.status && input.status !== "ALL" ? input.status : undefined;

    const contributions = await db.investorContribution.findMany({
      where: {
        deletedAt: null,
        ...(statusFilter ? { status: statusFilter } : {}),
      },
      include: {
        investor: { select: { id: true, name: true, email: true, investorCode: true, ficaVerified: true } },
        property: {
          select: {
            id: true,
            title: true,
            city: true,
            state: true,
            fundingGoal: true,
            investmentStatus: true,
            propertyFlip: { select: { id: true } },
            rentalBond: { select: { id: true } },
            propertyDevelopment: { select: { id: true } },
            spv: { select: { id: true, name: true, registrationNumber: true } },
          },
        },
      },
      orderBy: { contributionDate: "desc" },
    });

    const term = input?.search?.trim().toLowerCase();
    const filtered = term
      ? contributions.filter((c) => {
          const hay = [
            c.investor?.name,
            c.investor?.email,
            c.investor?.investorCode,
            c.property?.title,
            c.property?.city,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(term);
        })
      : contributions;

    const derivedType = (p: (typeof filtered)[number]["property"]) =>
      p.propertyDevelopment ? "development" : p.propertyFlip ? "flip" : p.rentalBond ? "rental" : "property";

    // Group by property.
    const byProperty = new Map<number, {
      propertyId: number;
      propertyTitle: string;
      location: string;
      propertyType: string;
      fundingGoal: number;
      investmentStatus: string;
      spvName: string | null;
      spvRegistration: string | null;
      totalInvested: number;
      investorCount: number;
      investors: {
        contributionId: number;
        investorId: number;
        investorName: string;
        investorEmail: string;
        investorCode: string | null;
        ficaVerified: boolean;
        amount: number;
        shares: number;
        expectedReturnRate: number;
        expectedReturnAmount: number;
        status: string;
        contributionDate: Date;
      }[];
    }>();

    for (const c of filtered) {
      const p = c.property;
      if (!byProperty.has(p.id)) {
        byProperty.set(p.id, {
          propertyId: p.id,
          propertyTitle: p.title,
          location: [p.city, p.state].filter(Boolean).join(", "),
          propertyType: derivedType(p),
          fundingGoal: p.fundingGoal ?? 0,
          investmentStatus: p.investmentStatus,
          spvName: p.spv?.name ?? null,
          spvRegistration: p.spv?.registrationNumber ?? null,
          totalInvested: 0,
          investorCount: 0,
          investors: [],
        });
      }
      const group = byProperty.get(p.id)!;
      group.totalInvested += c.contributionAmount;
      group.investorCount += 1;
      group.investors.push({
        contributionId: c.id,
        investorId: c.investor.id,
        investorName: c.investor.name,
        investorEmail: c.investor.email,
        investorCode: c.investor.investorCode,
        ficaVerified: c.investor.ficaVerified,
        amount: c.contributionAmount,
        shares: c.numberOfShares ?? 0,
        expectedReturnRate: c.expectedReturnRate,
        expectedReturnAmount: c.expectedReturnAmount,
        status: c.status,
        contributionDate: c.contributionDate,
      });
    }

    const properties = [...byProperty.values()].sort((a, b) => b.totalInvested - a.totalInvested);

    const grandTotalInvested = filtered.reduce((s, c) => s + c.contributionAmount, 0);
    const uniqueInvestors = new Set(filtered.map((c) => c.investor.id)).size;

    return {
      properties,
      summary: {
        totalInvested: grandTotalInvested,
        totalContributions: filtered.length,
        uniqueInvestors,
        propertiesWithInvestment: properties.length,
      },
    };
  });

/**
 * Admin oversight: directory of every stakeholder on the platform —
 * investors, property owners, conveyancers, bond originators, managers,
 * contractors and compliance officers — grouped by role with contact info
 * and lightweight activity counts.
 */
export const getPeopleDirectory = oversightProcedure
  .input(z.object({ search: z.string().optional() }).optional())
  .query(async ({ input }) => {
    const term = input?.search?.trim();
    const where: any = {};
    if (term) {
      where.OR = [
        { name: { contains: term, mode: "insensitive" } },
        { email: { contains: term, mode: "insensitive" } },
        { investorCode: { contains: term, mode: "insensitive" } },
      ];
    }

    const users = await db.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        investorCode: true,
        phoneNumber: true,
        ficaVerified: true,
        complianceOfficer: true,
        complianceOfficerLicense: true,
        createdAt: true,
        referralPartner: { select: { id: true, name: true, type: true, contactEmail: true, contactPhone: true } },
        _count: {
          select: {
            properties: true,
            investorContributions: true,
          },
        },
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });

    const people = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      investorCode: u.investorCode,
      phoneNumber: u.phoneNumber,
      ficaVerified: u.ficaVerified,
      complianceOfficer: u.complianceOfficer,
      complianceOfficerLicense: u.complianceOfficerLicense,
      partnerFirm: u.referralPartner?.name ?? null,
      partnerType: u.referralPartner?.type ?? null,
      partnerContactEmail: u.referralPartner?.contactEmail ?? null,
      partnerContactPhone: u.referralPartner?.contactPhone ?? null,
      propertyCount: u._count.properties,
      investmentCount: u._count.investorContributions,
      createdAt: u.createdAt,
    }));

    const countsByRole: Record<string, number> = {};
    for (const p of people) countsByRole[p.role] = (countsByRole[p.role] ?? 0) + 1;

    return { people, countsByRole, total: people.length };
  });
