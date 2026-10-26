import { describe, it, expect } from "vitest";
import {
  VAT_RATE,
  getAccount,
  checkBalanced,
  assertBalanced,
  reverseEntryDraft,
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
  buildTrialBalance,
  type JournalLineDraft,
} from "~/accounting-calculations";

const d = new Date("2026-01-01T00:00:00Z");

describe("double-entry primitives (#4)", () => {
  it("resolves known accounts and rejects unknown", () => {
    expect(getAccount("1000").name).toBe("Bank");
    expect(() => getAccount("9999")).toThrow();
  });

  it("flags unbalanced entries", () => {
    const lines: JournalLineDraft[] = [
      { accountCode: "1000", debit: 100, credit: 0 },
      { accountCode: "4000", debit: 0, credit: 90 },
    ];
    const chk = checkBalanced(lines);
    expect(chk.balanced).toBe(false);
    expect(chk.difference).toBe(10);
    expect(() => assertBalanced(lines)).toThrow(/Unbalanced/);
  });

  it("accepts a balanced entry", () => {
    const lines: JournalLineDraft[] = [
      { accountCode: "1000", debit: 100, credit: 0 },
      { accountCode: "4000", debit: 0, credit: 100 },
    ];
    expect(checkBalanced(lines).balanced).toBe(true);
    expect(() => assertBalanced(lines)).not.toThrow();
  });
});

describe("immutable reversal (#3)", () => {
  it("swaps debits and credits", () => {
    const orig = depositReceivedEntry({ amount: 50000, date: d, unitRef: "U1" });
    const rev = reverseEntryDraft(orig, d, "cancelled sale");
    expect(rev.kind).toBe("REVERSAL");
    expect(rev.lines[0]!.credit).toBe(orig.lines[0]!.debit);
    expect(rev.lines[0]!.debit).toBe(orig.lines[0]!.credit);
    expect(checkBalanced(rev.lines).balanced).toBe(true);
  });
});

describe("IFRS 15 deposit + revenue + VAT tax point (#5/#6)", () => {
  it("books a deposit as a contract liability, no VAT", () => {
    const e = depositReceivedEntry({ amount: 100000, date: d, unitRef: "U1" });
    expect(e.lines.find((l) => l.accountCode === "1000")!.debit).toBe(100000);
    expect(e.lines.find((l) => l.accountCode === "2000")!.credit).toBe(100000);
    // No VAT output on deposit.
    expect(e.lines.find((l) => l.accountCode === "2200")).toBeUndefined();
  });

  it("recognises revenue net of VAT at transfer and releases the deposit", () => {
    const r = revenueRecognitionEntry({
      saleValue: 1150000,
      costOfSale: 800000,
      depositApplied: 100000,
      vatApplicable: true,
      date: d,
      unitRef: "U1",
    });
    // Output VAT = 1,150,000 * 15/115 = 150,000; net revenue = 1,000,000.
    expect(r.outputVat).toBe(150000);
    expect(r.netRevenue).toBe(1000000);
    expect(r.cashOnTransfer).toBe(1050000);
    expect(r.grossProfit).toBe(200000);
    expect(checkBalanced(r.draft.lines).balanced).toBe(true);
  });

  it("no output VAT when the sale is not VAT-applicable", () => {
    const r = revenueRecognitionEntry({
      saleValue: 1000000,
      costOfSale: 700000,
      depositApplied: 0,
      vatApplicable: false,
      date: d,
      unitRef: "U2",
    });
    expect(r.outputVat).toBe(0);
    expect(r.netRevenue).toBe(1000000);
    expect(VAT_RATE).toBe(0.15);
  });
});

describe("investor capital accounts + waterfall (#7)", () => {
  it("books a capital contribution to investor equity", () => {
    const e = capitalContributionEntry({
      amount: 500000,
      investorId: 7,
      date: d,
      investorName: "Naledi",
    });
    const equity = e.lines.find((l) => l.accountCode === "3000")!;
    expect(equity.credit).toBe(500000);
    expect(equity.investorId).toBe(7);
  });

  it("splits distributable cash: capital, pref, then promote", () => {
    // 1,000,000 contributed; 8% pref over 12 months = 80,000; 20% promote.
    const w = distributionWaterfall({
      contributedCapital: 1000000,
      distributable: 1300000,
      prefRate: 0.08,
      holdingMonths: 12,
      promotePct: 0.2,
    });
    expect(w.returnOfCapital).toBe(1000000);
    expect(w.preferredReturn).toBe(80000);
    // residual 220,000 -> 20% promote = 44,000, LP 176,000
    expect(w.gpPromote).toBe(44000);
    expect(w.lpResidual).toBe(176000);
    expect(w.lpTotal).toBe(1256000);
    expect(w.gpTotal).toBe(44000);
    expect(w.lpTotal + w.gpTotal).toBe(1300000);
  });

  it("caps return of capital and pref when cash is short", () => {
    const w = distributionWaterfall({
      contributedCapital: 1000000,
      distributable: 600000,
      prefRate: 0.08,
      holdingMonths: 12,
      promotePct: 0.2,
    });
    expect(w.returnOfCapital).toBe(600000);
    expect(w.preferredReturn).toBe(0);
    expect(w.gpPromote).toBe(0);
  });

  it("posts a balanced distribution entry", () => {
    const w = distributionWaterfall({
      contributedCapital: 1000000,
      distributable: 1300000,
      prefRate: 0.08,
      holdingMonths: 12,
      promotePct: 0.2,
    });
    const e = distributionEntry({ tranches: w, investorId: 7, investorName: "Naledi", date: d });
    expect(checkBalanced(e.lines).balanced).toBe(true);
    expect(e.lines.find((l) => l.accountCode === "1000")!.credit).toBe(1300000);
  });
});

describe("NRV + provisions (#8)", () => {
  it("impairs stock when NRV is below carrying amount", () => {
    const r = nrvImpairmentEntry({
      carryingAmount: 900000,
      netRealisableValue: 820000,
      date: d,
      unitRef: "U3",
    });
    expect(r.impairment).toBe(80000);
    expect(r.draft).not.toBeNull();
    expect(checkBalanced(r.draft!.lines).balanced).toBe(true);
  });

  it("no impairment when NRV exceeds cost", () => {
    const r = nrvImpairmentEntry({
      carryingAmount: 900000,
      netRealisableValue: 1000000,
      date: d,
      unitRef: "U3",
    });
    expect(r.impairment).toBe(0);
    expect(r.draft).toBeNull();
  });

  it("books retention and defects provisions", () => {
    const ret = retentionProvisionEntry({ amount: 50000, date: d, reference: "WO-1" });
    expect(ret.lines.find((l) => l.accountCode === "2100")!.credit).toBe(50000);
    const def = defectsProvisionEntry({ amount: 30000, date: d, reference: "P1" });
    expect(def.lines.find((l) => l.accountCode === "2150")!.credit).toBe(30000);
  });
});

describe("IAS 23 interest + deferred tax (#10)", () => {
  it("capitalises interest to WIP during construction", () => {
    const e = interestEntry({ amount: 25000, capitalise: true, date: d, reference: "M1" });
    expect(e.kind).toBe("INTEREST_CAPITALISED");
    expect(e.lines.find((l) => l.accountCode === "1200")!.debit).toBe(25000);
  });

  it("expenses interest after practical completion", () => {
    const e = interestEntry({ amount: 25000, capitalise: false, date: d, reference: "M9" });
    expect(e.kind).toBe("FINANCE_COST");
    expect(e.lines.find((l) => l.accountCode === "5200")!.debit).toBe(25000);
  });

  it("raises a deferred-tax liability on a positive temporary difference", () => {
    const r = deferredTaxEntry({ temporaryDifference: 100000, date: d, reference: "DT1" });
    expect(r.deferredTax).toBe(27000);
    expect(r.isLiability).toBe(true);
    expect(r.draft!.lines.find((l) => l.accountCode === "2500")!.credit).toBe(27000);
  });

  it("raises a deferred-tax asset on a negative temporary difference", () => {
    const r = deferredTaxEntry({ temporaryDifference: -50000, date: d, reference: "DT2" });
    expect(r.deferredTax).toBe(13500);
    expect(r.isLiability).toBe(false);
    expect(r.draft!.lines.find((l) => l.accountCode === "1500")!.debit).toBe(13500);
  });
});

describe("trial balance", () => {
  it("nets lines per account onto the normal side and balances", () => {
    const dep = depositReceivedEntry({ amount: 100000, date: d, unitRef: "U1" });
    const cap = capitalContributionEntry({ amount: 500000, investorId: 7, date: d, investorName: "N" });
    const tb = buildTrialBalance([...dep.lines, ...cap.lines]);
    expect(tb.balanced).toBe(true);
    expect(tb.totalDebit).toBe(tb.totalCredit);
    const bank = tb.rows.find((r) => r.code === "1000")!;
    expect(bank.debit).toBe(600000);
  });
});
