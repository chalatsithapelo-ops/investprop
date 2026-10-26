/**
 * Double-entry accounting engine for property development SPVs.
 *
 * Pure, deterministic functions only — no Prisma, no I/O — so every posting
 * rule and the waterfall / VAT / NRV / deferred-tax maths are unit-testable.
 *
 * The DB persistence layer (src/server/accounting/ledger.ts) turns the
 * {@link JournalEntryDraft}s these functions return into immutable
 * JournalEntry + JournalLine rows.
 *
 * Covers accountant findings:
 *  #3  immutable posted entries + reversal journals (see {@link reverseEntryDraft})
 *  #4  minimal double-entry general ledger ({@link assertBalanced}, chart of accounts)
 *  #5  IFRS 15 revenue recognition + deposits as contract liabilities
 *  #6  VAT tax-point timing (output VAT raised at transfer, not on deposit)
 *  #7  investor capital accounts + distribution waterfall
 *  #8  NRV impairment + retention / defects provisions
 *  #10 IAS 23 capitalise-then-cease interest + deferred tax
 */

export const VAT_RATE = 0.15;
/** SA company income-tax rate used for deferred-tax timing differences. */
export const COMPANY_TAX_RATE = 0.27;

// ============================================================================
// Chart of accounts
// ============================================================================

export type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "INCOME" | "EXPENSE";
export type NormalBalance = "DEBIT" | "CREDIT";

export interface ChartAccount {
  code: string;
  name: string;
  type: AccountType;
  normalBalance: NormalBalance;
}

/**
 * Standard chart of accounts for a single development SPV. Codes follow the
 * usual 1xxx assets / 2xxx liabilities / 3xxx equity / 4xxx income / 5xxx
 * expense convention so a trial balance groups cleanly.
 */
export const CHART_OF_ACCOUNTS: readonly ChartAccount[] = [
  // Assets
  { code: "1000", name: "Bank", type: "ASSET", normalBalance: "DEBIT" },
  { code: "1200", name: "Development WIP / Inventory", type: "ASSET", normalBalance: "DEBIT" },
  { code: "1210", name: "Land", type: "ASSET", normalBalance: "DEBIT" },
  { code: "1400", name: "VAT Input (receivable)", type: "ASSET", normalBalance: "DEBIT" },
  { code: "1500", name: "Deferred Tax Asset", type: "ASSET", normalBalance: "DEBIT" },
  // Contra-asset (credit-normal) — NRV / inventory impairment provision
  { code: "1290", name: "Inventory Impairment Provision", type: "ASSET", normalBalance: "CREDIT" },
  // Liabilities
  { code: "2000", name: "Contract Liabilities (customer deposits)", type: "LIABILITY", normalBalance: "CREDIT" },
  { code: "2100", name: "Retention Payable", type: "LIABILITY", normalBalance: "CREDIT" },
  { code: "2150", name: "Defects / Warranty Provision", type: "LIABILITY", normalBalance: "CREDIT" },
  { code: "2200", name: "VAT Output (payable)", type: "LIABILITY", normalBalance: "CREDIT" },
  { code: "2400", name: "Senior Debt", type: "LIABILITY", normalBalance: "CREDIT" },
  { code: "2410", name: "Interest Payable", type: "LIABILITY", normalBalance: "CREDIT" },
  { code: "2500", name: "Deferred Tax Liability", type: "LIABILITY", normalBalance: "CREDIT" },
  // Equity
  { code: "3000", name: "Investor Capital", type: "EQUITY", normalBalance: "CREDIT" },
  { code: "3100", name: "Sponsor / Promote Capital", type: "EQUITY", normalBalance: "CREDIT" },
  { code: "3900", name: "Retained Earnings", type: "EQUITY", normalBalance: "CREDIT" },
  // Income
  { code: "4000", name: "Development Sales Revenue", type: "INCOME", normalBalance: "CREDIT" },
  { code: "4100", name: "Rental Revenue", type: "INCOME", normalBalance: "CREDIT" },
  // Expenses
  { code: "5000", name: "Cost of Sales", type: "EXPENSE", normalBalance: "DEBIT" },
  { code: "5100", name: "Inventory Impairment (NRV)", type: "EXPENSE", normalBalance: "DEBIT" },
  { code: "5200", name: "Finance Costs", type: "EXPENSE", normalBalance: "DEBIT" },
  { code: "5300", name: "Income Tax Expense", type: "EXPENSE", normalBalance: "DEBIT" },
] as const;

const ACCOUNT_BY_CODE = new Map(CHART_OF_ACCOUNTS.map((a) => [a.code, a]));

export function getAccount(code: string): ChartAccount {
  const a = ACCOUNT_BY_CODE.get(code);
  if (!a) throw new Error(`Unknown ledger account code: ${code}`);
  return a;
}

// ============================================================================
// Journal primitives
// ============================================================================

export interface JournalLineDraft {
  accountCode: string;
  /** Debit amount (>= 0). Exactly one of debit/credit is non-zero per line. */
  debit: number;
  credit: number;
  memo?: string;
  /** Optional investor sub-ledger key for capital-account lines. */
  investorId?: number;
}

export type JournalEntryKind =
  | "DEPOSIT_RECEIVED"
  | "REVENUE_RECOGNITION"
  | "CAPITAL_CONTRIBUTION"
  | "DISTRIBUTION"
  | "NRV_IMPAIRMENT"
  | "RETENTION_PROVISION"
  | "DEFECTS_PROVISION"
  | "INTEREST_CAPITALISED"
  | "FINANCE_COST"
  | "DEFERRED_TAX"
  | "REVERSAL"
  | "MANUAL";

export interface JournalEntryDraft {
  kind: JournalEntryKind;
  date: Date;
  description: string;
  reference?: string;
  lines: JournalLineDraft[];
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface BalanceCheck {
  balanced: boolean;
  totalDebit: number;
  totalCredit: number;
  difference: number;
}

/** A journal entry is valid only when debits equal credits (to the cent). */
export function checkBalanced(lines: JournalLineDraft[]): BalanceCheck {
  const totalDebit = round2(lines.reduce((a, l) => a + (l.debit || 0), 0));
  const totalCredit = round2(lines.reduce((a, l) => a + (l.credit || 0), 0));
  const difference = round2(totalDebit - totalCredit);
  return { balanced: difference === 0, totalDebit, totalCredit, difference };
}

export function assertBalanced(lines: JournalLineDraft[]): void {
  if (lines.length < 2) throw new Error("A journal entry needs at least two lines");
  for (const l of lines) {
    if (l.debit < 0 || l.credit < 0) throw new Error("Journal amounts cannot be negative");
    if (l.debit > 0 && l.credit > 0) throw new Error("A line cannot be both debit and credit");
    if (l.debit === 0 && l.credit === 0) throw new Error("A line must have a debit or a credit");
    if (!ACCOUNT_BY_CODE.has(l.accountCode)) throw new Error(`Unknown account ${l.accountCode}`);
  }
  const chk = checkBalanced(lines);
  if (!chk.balanced) {
    throw new Error(
      `Unbalanced entry: debits ${chk.totalDebit} != credits ${chk.totalCredit} (diff ${chk.difference})`
    );
  }
}

/**
 * Finding #3 — posted entries are immutable; a correction is a NEW contra
 * entry that swaps every debit and credit, never an edit of the original.
 */
export function reverseEntryDraft(
  original: JournalEntryDraft,
  date: Date,
  reason: string
): JournalEntryDraft {
  return {
    kind: "REVERSAL",
    date,
    description: `Reversal of "${original.description}" — ${reason}`,
    reference: original.reference,
    lines: original.lines.map((l) => ({
      accountCode: l.accountCode,
      debit: l.credit,
      credit: l.debit,
      memo: l.memo,
      investorId: l.investorId,
    })),
  };
}

// ============================================================================
// #5 / #6 — IFRS 15 revenue recognition, deposits, VAT tax point
// ============================================================================

/**
 * Finding #5 — an off-plan deposit is a CONTRACT LIABILITY, not revenue.
 * No VAT is raised here: under the SA VAT Act the tax point for fixed
 * property is the earlier of registration of transfer or payment per the
 * agreement; a refundable reservation deposit held in trust is not yet a
 * taxable supply, so VAT is deferred to transfer (finding #6).
 */
export function depositReceivedEntry(args: {
  amount: number;
  date: Date;
  unitRef: string;
}): JournalEntryDraft {
  const amount = round2(args.amount);
  const draft: JournalEntryDraft = {
    kind: "DEPOSIT_RECEIVED",
    date: args.date,
    description: `Deposit received — ${args.unitRef}`,
    reference: args.unitRef,
    lines: [
      { accountCode: "1000", debit: amount, credit: 0, memo: "Cash received" },
      { accountCode: "2000", debit: 0, credit: amount, memo: "Contract liability" },
    ],
  };
  assertBalanced(draft.lines);
  return draft;
}

export interface RevenueRecognitionResult {
  grossSale: number;
  netRevenue: number;
  outputVat: number;
  costOfSale: number;
  depositApplied: number;
  cashOnTransfer: number;
  grossProfit: number;
  draft: JournalEntryDraft;
}

/**
 * Finding #5 + #6 — revenue is recognised at the point control transfers
 * (registration of transfer), VAT output is raised at the same tax point, the
 * deposit held as a contract liability is released, and the inventory cost is
 * expensed to cost of sales.
 *
 * @param saleValue gross selling price (VAT-inclusive when vatApplicable)
 * @param costOfSale carrying amount of the unit released from inventory
 * @param depositApplied deposit previously banked as a contract liability
 */
export function revenueRecognitionEntry(args: {
  saleValue: number;
  costOfSale: number;
  depositApplied: number;
  vatApplicable: boolean;
  date: Date;
  unitRef: string;
}): RevenueRecognitionResult {
  const grossSale = round2(args.saleValue);
  const outputVat = args.vatApplicable ? round2((grossSale * VAT_RATE) / (1 + VAT_RATE)) : 0;
  const netRevenue = round2(grossSale - outputVat);
  const depositApplied = round2(Math.min(args.depositApplied, grossSale));
  const cashOnTransfer = round2(grossSale - depositApplied);
  const costOfSale = round2(args.costOfSale);

  const lines: JournalLineDraft[] = [];
  // Release the contract liability and bank the balance of proceeds.
  if (depositApplied > 0) {
    lines.push({ accountCode: "2000", debit: depositApplied, credit: 0, memo: "Release deposit" });
  }
  if (cashOnTransfer > 0) {
    lines.push({ accountCode: "1000", debit: cashOnTransfer, credit: 0, memo: "Transfer proceeds" });
  }
  // Recognise net revenue + output VAT at the tax point.
  lines.push({ accountCode: "4000", debit: 0, credit: netRevenue, memo: "Development sales revenue" });
  if (outputVat > 0) {
    lines.push({ accountCode: "2200", debit: 0, credit: outputVat, memo: "Output VAT at transfer" });
  }
  // Expense the inventory cost.
  lines.push({ accountCode: "5000", debit: costOfSale, credit: 0, memo: "Cost of sales" });
  lines.push({ accountCode: "1200", debit: 0, credit: costOfSale, memo: "Release inventory" });

  const draft: JournalEntryDraft = {
    kind: "REVENUE_RECOGNITION",
    date: args.date,
    description: `Revenue recognised on transfer — ${args.unitRef}`,
    reference: args.unitRef,
    lines,
  };
  assertBalanced(draft.lines);
  return {
    grossSale,
    netRevenue,
    outputVat,
    costOfSale,
    depositApplied,
    cashOnTransfer,
    grossProfit: round2(netRevenue - costOfSale),
    draft,
  };
}

// ============================================================================
// #7 — investor capital accounts + distribution waterfall
// ============================================================================

export function capitalContributionEntry(args: {
  amount: number;
  investorId: number;
  date: Date;
  investorName: string;
  isSponsor?: boolean;
}): JournalEntryDraft {
  const amount = round2(args.amount);
  const equityAccount = args.isSponsor ? "3100" : "3000";
  const draft: JournalEntryDraft = {
    kind: "CAPITAL_CONTRIBUTION",
    date: args.date,
    description: `Capital contribution — ${args.investorName}`,
    reference: `INV-${args.investorId}`,
    lines: [
      { accountCode: "1000", debit: amount, credit: 0, memo: "Cash received" },
      {
        accountCode: equityAccount,
        debit: 0,
        credit: amount,
        memo: "Investor capital",
        investorId: args.investorId,
      },
    ],
  };
  assertBalanced(draft.lines);
  return draft;
}

export interface WaterfallTranches {
  returnOfCapital: number;
  preferredReturn: number;
  lpResidual: number;
  gpPromote: number;
  lpTotal: number;
  gpTotal: number;
  undistributed: number;
}

/**
 * Finding #7 — a European-style equity waterfall applied to a lump of
 * distributable cash:
 *   1. return LP contributed capital,
 *   2. pay the accrued preferred return (hurdle),
 *   3. split the residual between LPs and the GP promote (carried interest).
 *
 * @param prefRate annual preferred-return rate (e.g. 0.08 for 8%)
 * @param holdingMonths months capital has been outstanding (for pref accrual)
 * @param promotePct GP carry share of residual above the hurdle (e.g. 0.20)
 */
export function distributionWaterfall(args: {
  contributedCapital: number;
  distributable: number;
  prefRate: number;
  holdingMonths: number;
  promotePct: number;
}): WaterfallTranches {
  let remaining = round2(Math.max(0, args.distributable));
  const contributed = round2(Math.max(0, args.contributedCapital));

  const returnOfCapital = round2(Math.min(remaining, contributed));
  remaining = round2(remaining - returnOfCapital);

  const accruedPref = round2(contributed * args.prefRate * (args.holdingMonths / 12));
  const preferredReturn = round2(Math.min(remaining, accruedPref));
  remaining = round2(remaining - preferredReturn);

  const gpPromote = round2(remaining * Math.min(Math.max(args.promotePct, 0), 1));
  const lpResidual = round2(remaining - gpPromote);

  return {
    returnOfCapital,
    preferredReturn,
    lpResidual,
    gpPromote,
    lpTotal: round2(returnOfCapital + preferredReturn + lpResidual),
    gpTotal: gpPromote,
    undistributed: 0,
  };
}

/**
 * Posts a waterfall distribution: cash out of the bank, return-of-capital
 * debited against investor capital, pref + residual to retained earnings /
 * distributions, promote to the sponsor capital account.
 */
export function distributionEntry(args: {
  tranches: WaterfallTranches;
  investorId: number;
  investorName: string;
  date: Date;
}): JournalEntryDraft {
  const t = args.tranches;
  const cashOut = round2(t.lpTotal + t.gpTotal);
  const lines: JournalLineDraft[] = [];
  if (t.returnOfCapital > 0) {
    lines.push({
      accountCode: "3000",
      debit: t.returnOfCapital,
      credit: 0,
      memo: "Return of capital",
      investorId: args.investorId,
    });
  }
  const income = round2(t.preferredReturn + t.lpResidual);
  if (income > 0) {
    lines.push({ accountCode: "3900", debit: income, credit: 0, memo: "Preferred + residual to LP" });
  }
  if (t.gpPromote > 0) {
    lines.push({ accountCode: "3900", debit: t.gpPromote, credit: 0, memo: "Promote to sponsor" });
  }
  lines.push({ accountCode: "1000", debit: 0, credit: cashOut, memo: "Cash distributed" });

  const draft: JournalEntryDraft = {
    kind: "DISTRIBUTION",
    date: args.date,
    description: `Distribution — ${args.investorName}`,
    reference: `INV-${args.investorId}`,
    lines,
  };
  assertBalanced(draft.lines);
  return draft;
}

// ============================================================================
// #8 — NRV impairment + retention / defects provisions
// ============================================================================

export interface NrvResult {
  carryingAmount: number;
  netRealisableValue: number;
  impairment: number;
  draft: JournalEntryDraft | null;
}

/**
 * Finding #8 — unsold stock is carried at the lower of cost and net realisable
 * value. When NRV falls below carrying amount the shortfall is impaired to a
 * contra-asset provision (reversible if NRV later recovers).
 */
export function nrvImpairmentEntry(args: {
  carryingAmount: number;
  netRealisableValue: number;
  date: Date;
  unitRef: string;
}): NrvResult {
  const carryingAmount = round2(args.carryingAmount);
  const netRealisableValue = round2(args.netRealisableValue);
  const impairment = round2(Math.max(0, carryingAmount - netRealisableValue));
  if (impairment === 0) {
    return { carryingAmount, netRealisableValue, impairment, draft: null };
  }
  const draft: JournalEntryDraft = {
    kind: "NRV_IMPAIRMENT",
    date: args.date,
    description: `NRV impairment — ${args.unitRef}`,
    reference: args.unitRef,
    lines: [
      { accountCode: "5100", debit: impairment, credit: 0, memo: "Impairment to NRV" },
      { accountCode: "1290", debit: 0, credit: impairment, memo: "Impairment provision" },
    ],
  };
  assertBalanced(draft.lines);
  return { carryingAmount, netRealisableValue, impairment, draft };
}

/** Finding #8 — retention held back from a contractor certificate is a liability. */
export function retentionProvisionEntry(args: {
  amount: number;
  date: Date;
  reference: string;
}): JournalEntryDraft {
  const amount = round2(args.amount);
  const draft: JournalEntryDraft = {
    kind: "RETENTION_PROVISION",
    date: args.date,
    description: `Retention withheld — ${args.reference}`,
    reference: args.reference,
    lines: [
      { accountCode: "1200", debit: amount, credit: 0, memo: "Retention asset in WIP" },
      { accountCode: "2100", debit: 0, credit: amount, memo: "Retention payable" },
    ],
  };
  assertBalanced(draft.lines);
  return draft;
}

/** Finding #8 — a defects / warranty provision for the NHBRC-style liability period. */
export function defectsProvisionEntry(args: {
  amount: number;
  date: Date;
  reference: string;
}): JournalEntryDraft {
  const amount = round2(args.amount);
  const draft: JournalEntryDraft = {
    kind: "DEFECTS_PROVISION",
    date: args.date,
    description: `Defects / warranty provision — ${args.reference}`,
    reference: args.reference,
    lines: [
      { accountCode: "5000", debit: amount, credit: 0, memo: "Defects cost accrual" },
      { accountCode: "2150", debit: 0, credit: amount, memo: "Defects provision" },
    ],
  };
  assertBalanced(draft.lines);
  return draft;
}

// ============================================================================
// #10 — IAS 23 interest capitalisation + deferred tax
// ============================================================================

/**
 * Finding #10 — while the qualifying asset is under active construction,
 * borrowing costs are capitalised into WIP. Once the asset is substantially
 * complete (or construction is suspended) capitalisation CEASES and interest
 * is expensed to finance costs instead.
 */
export function interestEntry(args: {
  amount: number;
  capitalise: boolean;
  date: Date;
  reference: string;
}): JournalEntryDraft {
  const amount = round2(args.amount);
  const target = args.capitalise ? "1200" : "5200";
  const draft: JournalEntryDraft = {
    kind: args.capitalise ? "INTEREST_CAPITALISED" : "FINANCE_COST",
    date: args.date,
    description: args.capitalise
      ? `Interest capitalised to WIP — ${args.reference}`
      : `Interest expensed (post-completion) — ${args.reference}`,
    reference: args.reference,
    lines: [
      {
        accountCode: target,
        debit: amount,
        credit: 0,
        memo: args.capitalise ? "Capitalised borrowing cost" : "Finance cost",
      },
      { accountCode: "2410", debit: 0, credit: amount, memo: "Interest payable" },
    ],
  };
  assertBalanced(draft.lines);
  return draft;
}

export interface DeferredTaxResult {
  temporaryDifference: number;
  taxRate: number;
  deferredTax: number;
  isLiability: boolean;
  draft: JournalEntryDraft | null;
}

/**
 * Finding #10 — a deferred-tax balance on a temporary difference (e.g. interest
 * capitalised into inventory for accounts but deducted for tax). A positive
 * difference (carrying > tax base) raises a deferred-tax LIABILITY; a negative
 * one raises a deferred-tax ASSET.
 */
export function deferredTaxEntry(args: {
  temporaryDifference: number;
  taxRate?: number;
  date: Date;
  reference: string;
}): DeferredTaxResult {
  const taxRate = args.taxRate ?? COMPANY_TAX_RATE;
  const temporaryDifference = round2(args.temporaryDifference);
  const deferredTax = round2(Math.abs(temporaryDifference) * taxRate);
  if (deferredTax === 0) {
    return { temporaryDifference, taxRate, deferredTax, isLiability: temporaryDifference >= 0, draft: null };
  }
  const isLiability = temporaryDifference >= 0;
  const lines: JournalLineDraft[] = isLiability
    ? [
        { accountCode: "5300", debit: deferredTax, credit: 0, memo: "Deferred tax charge" },
        { accountCode: "2500", debit: 0, credit: deferredTax, memo: "Deferred tax liability" },
      ]
    : [
        { accountCode: "1500", debit: deferredTax, credit: 0, memo: "Deferred tax asset" },
        { accountCode: "5300", debit: 0, credit: deferredTax, memo: "Deferred tax credit" },
      ];
  const draft: JournalEntryDraft = {
    kind: "DEFERRED_TAX",
    date: args.date,
    description: `Deferred tax — ${args.reference}`,
    reference: args.reference,
    lines,
  };
  assertBalanced(draft.lines);
  return { temporaryDifference, taxRate, deferredTax, isLiability, draft };
}

// ============================================================================
// Trial balance
// ============================================================================

export interface TrialBalanceRow {
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
  balance: number;
}

export interface TrialBalance {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

/**
 * Builds a trial balance from posted journal lines. Each account's balance is
 * expressed on its normal side (debit-normal accounts show a positive debit
 * balance, credit-normal accounts a positive credit balance).
 */
export function buildTrialBalance(
  lines: { accountCode: string; debit: number; credit: number }[]
): TrialBalance {
  const totals = new Map<string, { debit: number; credit: number }>();
  for (const l of lines) {
    const t = totals.get(l.accountCode) ?? { debit: 0, credit: 0 };
    t.debit += l.debit || 0;
    t.credit += l.credit || 0;
    totals.set(l.accountCode, t);
  }
  const rows: TrialBalanceRow[] = [];
  for (const acct of CHART_OF_ACCOUNTS) {
    const t = totals.get(acct.code);
    if (!t || (round2(t.debit) === 0 && round2(t.credit) === 0)) continue;
    const net = round2(t.debit - t.credit);
    const onNormalSide = acct.normalBalance === "DEBIT" ? net : -net;
    rows.push({
      code: acct.code,
      name: acct.name,
      type: acct.type,
      debit: net > 0 ? net : 0,
      credit: net < 0 ? -net : 0,
      balance: round2(onNormalSide),
    });
  }
  const totalDebit = round2(rows.reduce((a, r) => a + r.debit, 0));
  const totalCredit = round2(rows.reduce((a, r) => a + r.credit, 0));
  return { rows, totalDebit, totalCredit, balanced: round2(totalDebit - totalCredit) === 0 };
}
