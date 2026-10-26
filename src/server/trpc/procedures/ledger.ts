import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { requireAuthenticatedUser } from "~/server/trpc/auth-helpers";
import {
  postEntry,
  reverseEntry,
  getTrialBalance as readTrialBalance,
  getCapitalAccounts as readCapitalAccounts,
} from "~/server/accounting/ledger";
import {
  CHART_OF_ACCOUNTS,
  depositReceivedEntry,
  revenueRecognitionEntry,
  capitalContributionEntry,
  distributionWaterfall,
  distributionEntry,
  nrvImpairmentEntry,
  retentionProvisionEntry,
  defectsProvisionEntry,
  interestEntry,
  deferredTaxEntry,
} from "~/accounting-calculations";

const LEDGER_ROLES = ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"] as const;
const LEDGER_MSG = "Only development managers and administrators can post to the ledger";

async function requirePropertyAccess(authToken: string, propertyId: number) {
  const user = await requireAuthenticatedUser(authToken, [...LEDGER_ROLES], LEDGER_MSG);
  const property = await db.property.findUnique({ where: { id: propertyId }, select: { id: true } });
  if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });
  return user;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export const getChartOfAccounts = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    await requireAuthenticatedUser(input.authToken, [...LEDGER_ROLES], LEDGER_MSG);
    return CHART_OF_ACCOUNTS;
  });

export const getTrialBalance = baseProcedure
  .input(z.object({ authToken: z.string(), propertyId: z.number() }))
  .query(async ({ input }) => {
    await requirePropertyAccess(input.authToken, input.propertyId);
    return readTrialBalance(input.propertyId);
  });

export const getCapitalAccounts = baseProcedure
  .input(z.object({ authToken: z.string(), propertyId: z.number() }))
  .query(async ({ input }) => {
    await requirePropertyAccess(input.authToken, input.propertyId);
    return readCapitalAccounts(input.propertyId);
  });

export const getLedgerEntries = baseProcedure
  .input(z.object({ authToken: z.string(), propertyId: z.number() }))
  .query(async ({ input }) => {
    await requirePropertyAccess(input.authToken, input.propertyId);
    return db.journalEntry.findMany({
      where: { propertyId: input.propertyId },
      orderBy: [{ entryDate: "desc" }, { id: "desc" }],
      include: {
        lines: true,
        postedBy: { select: { id: true, name: true } },
      },
    });
  });

// ---------------------------------------------------------------------------
// Immutability — reversal
// ---------------------------------------------------------------------------

export const reverseJournalEntry = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      entryId: z.number(),
      reason: z.string().min(3, "A reason is required"),
    })
  )
  .mutation(async ({ input }) => {
    const user = await requirePropertyAccess(input.authToken, input.propertyId);
    const entry = await db.journalEntry.findUnique({ where: { id: input.entryId } });
    if (!entry || entry.propertyId !== input.propertyId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Journal entry not found" });
    }
    return reverseEntry(input.entryId, user.id, input.reason);
  });

// ---------------------------------------------------------------------------
// Posting-rule wrappers
// ---------------------------------------------------------------------------

export const recordDeposit = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      amount: z.number().positive(),
      unitRef: z.string().min(1),
      date: z.coerce.date().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await requirePropertyAccess(input.authToken, input.propertyId);
    const draft = depositReceivedEntry({
      amount: input.amount,
      unitRef: input.unitRef,
      date: input.date ?? new Date(),
    });
    return postEntry(input.propertyId, draft, user.id);
  });

export const recognizeRevenue = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      saleValue: z.number().positive(),
      costOfSale: z.number().nonnegative(),
      depositApplied: z.number().nonnegative().default(0),
      vatApplicable: z.boolean().default(false),
      unitRef: z.string().min(1),
      date: z.coerce.date().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await requirePropertyAccess(input.authToken, input.propertyId);
    const result = revenueRecognitionEntry({
      saleValue: input.saleValue,
      costOfSale: input.costOfSale,
      depositApplied: input.depositApplied,
      vatApplicable: input.vatApplicable,
      unitRef: input.unitRef,
      date: input.date ?? new Date(),
    });
    const entry = await postEntry(input.propertyId, result.draft, user.id);
    return { entry, summary: result };
  });

export const recordCapitalContribution = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      investorId: z.number(),
      amount: z.number().positive(),
      isSponsor: z.boolean().default(false),
      date: z.coerce.date().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await requirePropertyAccess(input.authToken, input.propertyId);
    const investor = await db.user.findUnique({
      where: { id: input.investorId },
      select: { id: true, name: true },
    });
    if (!investor) throw new TRPCError({ code: "NOT_FOUND", message: "Investor not found" });
    const draft = capitalContributionEntry({
      amount: input.amount,
      investorId: investor.id,
      investorName: investor.name,
      isSponsor: input.isSponsor,
      date: input.date ?? new Date(),
    });
    return postEntry(input.propertyId, draft, user.id);
  });

export const recordDistribution = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      investorId: z.number(),
      contributedCapital: z.number().nonnegative(),
      distributable: z.number().positive(),
      prefRate: z.number().min(0).max(1).default(0.08),
      holdingMonths: z.number().nonnegative().default(12),
      promotePct: z.number().min(0).max(1).default(0.2),
      date: z.coerce.date().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await requirePropertyAccess(input.authToken, input.propertyId);
    const investor = await db.user.findUnique({
      where: { id: input.investorId },
      select: { id: true, name: true },
    });
    if (!investor) throw new TRPCError({ code: "NOT_FOUND", message: "Investor not found" });
    const tranches = distributionWaterfall({
      contributedCapital: input.contributedCapital,
      distributable: input.distributable,
      prefRate: input.prefRate,
      holdingMonths: input.holdingMonths,
      promotePct: input.promotePct,
    });
    const draft = distributionEntry({
      tranches,
      investorId: investor.id,
      investorName: investor.name,
      date: input.date ?? new Date(),
    });
    const entry = await postEntry(input.propertyId, draft, user.id);
    return { entry, tranches };
  });

export const recordNrvImpairment = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      carryingAmount: z.number().nonnegative(),
      netRealisableValue: z.number().nonnegative(),
      unitRef: z.string().min(1),
      date: z.coerce.date().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await requirePropertyAccess(input.authToken, input.propertyId);
    const result = nrvImpairmentEntry({
      carryingAmount: input.carryingAmount,
      netRealisableValue: input.netRealisableValue,
      unitRef: input.unitRef,
      date: input.date ?? new Date(),
    });
    if (!result.draft) {
      return { entry: null, impairment: 0, message: "No impairment — NRV at or above carrying amount" };
    }
    const entry = await postEntry(input.propertyId, result.draft, user.id);
    return { entry, impairment: result.impairment };
  });

export const recordRetention = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      amount: z.number().positive(),
      reference: z.string().min(1),
      date: z.coerce.date().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await requirePropertyAccess(input.authToken, input.propertyId);
    const draft = retentionProvisionEntry({
      amount: input.amount,
      reference: input.reference,
      date: input.date ?? new Date(),
    });
    return postEntry(input.propertyId, draft, user.id);
  });

export const recordDefectsProvision = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      amount: z.number().positive(),
      reference: z.string().min(1),
      date: z.coerce.date().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await requirePropertyAccess(input.authToken, input.propertyId);
    const draft = defectsProvisionEntry({
      amount: input.amount,
      reference: input.reference,
      date: input.date ?? new Date(),
    });
    return postEntry(input.propertyId, draft, user.id);
  });

export const recordInterest = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      amount: z.number().positive(),
      capitalise: z.boolean(),
      reference: z.string().min(1),
      date: z.coerce.date().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await requirePropertyAccess(input.authToken, input.propertyId);
    const draft = interestEntry({
      amount: input.amount,
      capitalise: input.capitalise,
      reference: input.reference,
      date: input.date ?? new Date(),
    });
    return postEntry(input.propertyId, draft, user.id);
  });

export const recordDeferredTax = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      propertyId: z.number(),
      temporaryDifference: z.number(),
      taxRate: z.number().min(0).max(1).optional(),
      reference: z.string().min(1),
      date: z.coerce.date().optional(),
    })
  )
  .mutation(async ({ input }) => {
    const user = await requirePropertyAccess(input.authToken, input.propertyId);
    const result = deferredTaxEntry({
      temporaryDifference: input.temporaryDifference,
      taxRate: input.taxRate,
      reference: input.reference,
      date: input.date ?? new Date(),
    });
    if (!result.draft) {
      return { entry: null, deferredTax: 0, message: "No deferred tax — nil temporary difference" };
    }
    const entry = await postEntry(input.propertyId, result.draft, user.id);
    return { entry, deferredTax: result.deferredTax, isLiability: result.isLiability };
  });
