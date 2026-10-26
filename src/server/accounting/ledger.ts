/**
 * DB persistence for the double-entry ledger. Turns the pure
 * {@link JournalEntryDraft}s from src/accounting-calculations.ts into immutable
 * JournalEntry + JournalLine rows, and reads them back as a trial balance /
 * investor capital accounts.
 */
import { db } from "~/server/db";
import { TRPCError } from "@trpc/server";
import {
  getAccount,
  assertBalanced,
  reverseEntryDraft,
  buildTrialBalance,
  type JournalEntryDraft,
} from "~/accounting-calculations";

/** Posts a balanced draft as an immutable journal entry. */
export async function postEntry(
  propertyId: number,
  draft: JournalEntryDraft,
  postedById: number
) {
  assertBalanced(draft.lines);
  return db.journalEntry.create({
    data: {
      propertyId,
      kind: draft.kind,
      entryDate: draft.date,
      description: draft.description,
      reference: draft.reference ?? null,
      postedById,
      lines: {
        create: draft.lines.map((l) => {
          const acct = getAccount(l.accountCode);
          return {
            accountCode: l.accountCode,
            accountName: acct.name,
            accountType: acct.type,
            debit: l.debit,
            credit: l.credit,
            memo: l.memo ?? null,
            investorId: l.investorId ?? null,
          };
        }),
      },
    },
    include: { lines: true },
  });
}

/**
 * Finding #3 — reverses a posted entry by posting its contra and marking the
 * original REVERSED. The original's lines are never mutated.
 */
export async function reverseEntry(entryId: number, postedById: number, reason: string) {
  const original = await db.journalEntry.findUnique({
    where: { id: entryId },
    include: { lines: true },
  });
  if (!original) throw new TRPCError({ code: "NOT_FOUND", message: "Journal entry not found" });
  if (original.status === "REVERSED") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Entry already reversed" });
  }
  if (original.kind === "REVERSAL") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot reverse a reversal" });
  }

  const draft: JournalEntryDraft = {
    kind: original.kind as JournalEntryDraft["kind"],
    date: new Date(),
    description: original.description,
    reference: original.reference ?? undefined,
    lines: original.lines.map((l) => ({
      accountCode: l.accountCode,
      debit: l.debit,
      credit: l.credit,
      memo: l.memo ?? undefined,
      investorId: l.investorId ?? undefined,
    })),
  };
  const reversalDraft = reverseEntryDraft(draft, new Date(), reason);

  return db.$transaction(async (tx) => {
    const reversal = await tx.journalEntry.create({
      data: {
        propertyId: original.propertyId,
        kind: "REVERSAL",
        entryDate: reversalDraft.date,
        description: reversalDraft.description,
        reference: reversalDraft.reference ?? null,
        reversesEntryId: original.id,
        postedById,
        lines: {
          create: reversalDraft.lines.map((l) => {
            const acct = getAccount(l.accountCode);
            return {
              accountCode: l.accountCode,
              accountName: acct.name,
              accountType: acct.type,
              debit: l.debit,
              credit: l.credit,
              memo: l.memo ?? null,
              investorId: l.investorId ?? null,
            };
          }),
        },
      },
      include: { lines: true },
    });
    await tx.journalEntry.update({
      where: { id: original.id },
      data: { status: "REVERSED", reversedByEntryId: reversal.id },
    });
    return reversal;
  });
}

/** Trial balance across every posted line for a property (reversed pairs net to zero). */
export async function getTrialBalance(propertyId: number) {
  const lines = await db.journalLine.findMany({
    where: { journalEntry: { propertyId } },
    select: { accountCode: true, debit: true, credit: true },
  });
  return buildTrialBalance(lines);
}

export interface CapitalAccountRow {
  investorId: number;
  investorName: string;
  contributed: number;
  returned: number;
  balance: number;
}

/** Investor capital accounts — contributions less returns of capital, per investor. */
export async function getCapitalAccounts(propertyId: number): Promise<CapitalAccountRow[]> {
  const lines = await db.journalLine.findMany({
    where: {
      journalEntry: { propertyId },
      accountCode: { in: ["3000", "3100"] },
      investorId: { not: null },
    },
    select: { investorId: true, debit: true, credit: true },
  });
  const byInvestor = new Map<number, { contributed: number; returned: number }>();
  for (const l of lines) {
    const id = l.investorId as number;
    const acc = byInvestor.get(id) ?? { contributed: 0, returned: 0 };
    acc.contributed += l.credit || 0; // credit to capital = contribution
    acc.returned += l.debit || 0; // debit to capital = return of capital
    byInvestor.set(id, acc);
  }
  const ids = [...byInvestor.keys()];
  const users = ids.length
    ? await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  return ids.map((id) => {
    const acc = byInvestor.get(id)!;
    const contributed = Math.round(acc.contributed * 100) / 100;
    const returned = Math.round(acc.returned * 100) / 100;
    return {
      investorId: id,
      investorName: nameById.get(id) ?? `Investor #${id}`,
      contributed,
      returned,
      balance: Math.round((contributed - returned) * 100) / 100,
    };
  });
}
