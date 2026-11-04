import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { calculateAnnualGrossRent, calculateAnnualOperatingExpenses, calculateNOI, calculateMonthlyDebtService, type RentalRecordLike } from "~/financial-calculations";
import { db } from "~/server/db";
import { requirePropertyEvidenceAccess } from "~/server/ai/evidence-access";
import { OFFICE_LIMIT, assertOfficeUser, centsNumber, toCents, type OfficeUser } from "./policy";

export const scenarioAssumptionsSchema = z.object({
  rentChangePct: z.number().finite().min(-100).max(100),
  vacancyRatePct: z.number().finite().min(0).max(100),
  operatingCostChangePct: z.number().finite().min(-100).max(200),
  interestRateChangePp: z.number().finite().min(-20).max(20),
}).strict();
export type ScenarioAssumptions = z.infer<typeof scenarioAssumptionsSchema>;

const expenseKeys = ["annualPropertyTax", "annualInsurance", "monthlyHOAFees", "monthlyMaintenanceReserve", "monthlyUtilities", "monthlyManagementFee"] as const;
const nonnegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const positive = (value: unknown): value is number => nonnegative(value) && value > 0;

/** Pure, one-year model. Unknown costs/debt remain null, never a fabricated zero. */
export function calculatePropertyScenario(rental: RentalRecordLike, rawAssumptions: ScenarioAssumptions) {
  const assumptions = scenarioAssumptionsSchema.parse(rawAssumptions);
  if (!nonnegative(rental.monthlyRent) || !nonnegative(rental.vacancyRate) || rental.vacancyRate > 100) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A recorded rental baseline with finite monthlyRent and vacancyRate (0–100%) is required" });
  }
  const gaps: string[] = [];
  const costs = {} as Record<typeof expenseKeys[number], number>;
  for (const key of expenseKeys) {
    const value = rental[key];
    if (!nonnegative(value)) gaps.push(`Missing or invalid ${key}; NOI and cash flow cannot be calculated.`);
    else costs[key] = value;
  }
  const expenses = gaps.length ? null : calculateAnnualOperatingExpenses(costs);
  // Schema defaults of zero do not establish a debt-free property or a zero-rate loan.
  const principal = positive(rental.loanAmount) ? rental.loanAmount : positive(rental.bondAmount) ? rental.bondAmount : null;
  const loanValid = principal !== null && positive(rental.interestRate) && positive(rental.loanTermYears) && Number.isInteger(rental.loanTermYears);
  if (!loanValid) gaps.push("No valid recorded positive principal, historical interest rate and integer loan term; debt service, cash flow and DSCR are unknown (not assumed debt-free).");
  const stressedRate = loanValid ? rental.interestRate! + assumptions.interestRateChangePp : null;
  if (stressedRate !== null && stressedRate < 0) gaps.push("Stressed interest rate is negative; stressed debt service, cash flow and DSCR are unavailable, not clamped to zero.");
  const annualDebt = (rate: number | null): number | null => {
    if (!loanValid || rate === null || rate < 0) return null;
    // The shared amortisation helper returns zero at 0%: use the exact limit instead.
    const payment = rate === 0 ? principal / (rental.loanTermYears! * 12) : calculateMonthlyDebtService(principal, rate, rental.loanTermYears!);
    if (!positive(payment) || !Number.isFinite(payment * 12)) {
      gaps.push("Loan amortisation is non-finite or invalid; no debt result fabricated.");
      return null;
    }
    return payment * 12;
  };
  const point = (monthlyRent: number, vacancyRatePct: number, operatingExpenses: number | null, rate: number | null) => {
    const annualGrossRent = calculateAnnualGrossRent(monthlyRent);
    const annualOperatingExpenses = operatingExpenses;
    const vacancyLoss = annualGrossRent * vacancyRatePct / 100;
    const noi = operatingExpenses === null ? null : calculateNOI(annualGrossRent, vacancyRatePct, operatingExpenses);
    const annualDebtService = annualDebt(rate);
    const annualCashFlow = noi === null || annualDebtService === null ? null : noi - annualDebtService;
    const dscr = noi === null || annualDebtService === null ? null : noi / annualDebtService;
    const result = { annualGrossRent, vacancyRatePct, vacancyLoss, annualOperatingExpenses, noi, annualDebtService, annualCashFlow, dscr, interestRatePct: rate };
    if (Object.values(result).some((value) => value !== null && !Number.isFinite(value))) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Rental baseline exceeds the finite calculation range" });
    }
    return result;
  };
  return {
    assumptions,
    base: point(rental.monthlyRent, rental.vacancyRate, expenses, loanValid ? rental.interestRate! : null),
    stressed: point(rental.monthlyRent * (1 + assumptions.rentChangePct / 100), assumptions.vacancyRatePct,
      expenses === null ? null : expenses * (1 + assumptions.operatingCostChangePct / 100), stressedRate),
    financing: { principal, principalSource: positive(rental.loanAmount) ? "loanAmount" : principal !== null ? "bondAmount" : null,
      loanTermYears: loanValid ? rental.loanTermYears! : null,
      recordedMonthlyDebtService: nonnegative(rental.monthlyDebtService) ? rental.monthlyDebtService : null },
    unitNotes: ["Money: ZAR; annual totals are a constant 12-month model, not a forecast or investor payout. DSCR is a ratio, not a percentage.",
      "Rent and operating costs use relative percentage changes; vacancyRatePct replaces baseline vacancy. Interest change is percentage points, not percent.",
      "Debt is modelled principal-and-interest over the recorded full loan term using historical recorded rates, not current market rates or a verified remaining balance/term. Stored monthlyDebtService is evidence only, not used to infer a loan.",
      "NOI excludes debt service. Cash flow excludes income tax, capital expenditure, acquisition costs and investor/platform distributions. Operating-cost changes apply uniformly to the recorded six cost components."],
    gaps: [...gaps, "RentalBond has no financial review/as-of or updatedAt field; createdAt and lease dates do not establish current rent, costs or rates.",
      "Persisted schema-default zero costs/financing may be unverified. Recorded values are not independently validated; no missing fields are defaulted."],
  };
}

export async function loadPropertyScenario(user: OfficeUser, propertyId: number, assumptions: ScenarioAssumptions, now = new Date()) {
  assertOfficeUser(user);
  z.number().int().positive().parse(propertyId);
  scenarioAssumptionsSchema.parse(assumptions);
  // Authorisation metadata MUST precede rental/content reads. Published shared rental evidence is allowed.
  await requirePropertyEvidenceAccess(user, propertyId, { allowPublished: true });
  const property = await db.property.findUnique({ where: { id: propertyId }, select: {
    id: true, title: true, createdAt: true,
    propertyFlip: { select: { id: true } }, propertyDevelopment: { select: { id: true } },
    rentalBond: { select: { id: true, createdAt: true, leaseStartDate: true, leaseEndDate: true,
      monthlyRent: true, vacancyRate: true, annualPropertyTax: true, annualInsurance: true,
      monthlyHOAFees: true, monthlyMaintenanceReserve: true, monthlyUtilities: true, monthlyManagementFee: true,
      loanAmount: true, bondAmount: true, interestRate: true, loanTermYears: true, monthlyDebtService: true } },
  } });
  if (!property) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found" });
  if (!property.rentalBond || property.propertyFlip || property.propertyDevelopment) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Only an unambiguous rental baseline is supported; flip and development scenarios are not supported" });
  }
  const r = property.rentalBond;
  return { propertyId, title: property.title, strategy: "RENTAL" as const, readOnly: true as const, evaluatedAt: now.toISOString(),
    ...calculatePropertyScenario(r, assumptions),
    evidence: [{ id: `rental:${r.id}`, kind: "RECORDED_RENTAL_BASELINE", asOf: null,
      createdAt: r.createdAt.toISOString(), leaseStartDate: r.leaseStartDate.toISOString(), leaseEndDate: r.leaseEndDate.toISOString(),
      // Neither Property nor RentalBond records an update timestamp; creation is not financial freshness.
      propertyUpdatedAt: null, propertyCreatedAt: property.createdAt.toISOString(), values: {
        monthlyRent: r.monthlyRent, vacancyRate: r.vacancyRate, annualPropertyTax: r.annualPropertyTax, annualInsurance: r.annualInsurance,
        monthlyHOAFees: r.monthlyHOAFees, monthlyMaintenanceReserve: r.monthlyMaintenanceReserve,
        monthlyUtilities: r.monthlyUtilities, monthlyManagementFee: r.monthlyManagementFee,
        loanAmount: r.loanAmount, bondAmount: r.bondAmount, interestRate: r.interestRate,
        loanTermYears: r.loanTermYears, monthlyDebtService: r.monthlyDebtService,
      } }],
  };
}

export interface ExceptionEvidence { id: string; kind: string; asOf: string | null }
export interface AccountingException {
  code: "PAID_MISSING_DATE" | "PAYOUT_INVALID_AMOUNT" | "PAYOUT_UNALLOCATED_DIFFERENCE" | "CERTIFICATE_CLASS_AMBIGUOUS" | "CERTIFICATE_HOLDING_DIFFERENCE" | "CERTIFICATE_INVALID_SHARES" | "PAID_CERTIFICATE_PENDING";
  propertyId: number;
  message: string;
  evidence: ExceptionEvidence[];
  observed: Record<string, number | string | null>;
}
export interface AccountingRows {
  payouts: readonly { id: number; grossAmount: number | null; netAmount: number | null; taxWithheld: number | null; paidAt: Date | null; createdAt: Date; distribution: { propertyId: number } }[];
  holdings: readonly { id: number; propertyId: number; shareClassId: number; sharesOwned: number; updatedAt: Date; shareClass: { name: string } }[];
  certificates: readonly { id: number; propertyId: number; numberOfShares: number; shareClassName: string; issueDate: Date;
    property: { shareClasses: readonly { id: number; name: string }[] } }[];
  contributions: readonly { id: number; propertyId: number; contributionAmount: number; paymentReviewedAt: Date | null; createdAt: Date;
    certificate: { id: number; isValid: boolean; revokedAt: Date | null } | null }[];
}

/** Factual reconciliation observations, never fraud labels or probability scores. */
export function calculateAccountingExceptions(rows: AccountingRows) {
  const exceptions: AccountingException[] = [];
  const gaps = ["Self-only platform snapshot, not an audit, fraud assessment, tax calculation or bank reconciliation.",
    "No persisted investment-receipt register exists in this schema; receipt issuance/delivery cannot be established. Paid contributions without a valid certificate are documentation-pending observations only.",
    "Certificates record issuance, while holdings record current balances; transfers, exits, revocation timing and class renaming can explain differences. Review the share ledger before concluding an error."];
  const truncated = [rows.payouts, rows.holdings, rows.certificates, rows.contributions].some((list) => list.length > OFFICE_LIMIT);
  if (truncated) gaps.push(`Records truncated at ${OFFICE_LIMIT} per category; certificate/holding comparisons suppressed, results are incomplete.`);
  const payouts = rows.payouts.slice(0, OFFICE_LIMIT);
  for (const p of payouts) {
    const evidence = [{ id: `payout:${p.id}`, kind: "PAID_PAYOUT", asOf: p.paidAt?.toISOString() ?? null }];
    if (!p.paidAt) exceptions.push({ code: "PAID_MISSING_DATE", propertyId: p.distribution.propertyId,
      message: "PAID payout has no paidAt; payment date and assessment year cannot be established.", evidence, observed: { paidAt: null, createdAt: p.createdAt.toISOString() } });
    if (![p.grossAmount, p.netAmount, p.taxWithheld].every(nonnegative)) {
      exceptions.push({ code: "PAYOUT_INVALID_AMOUNT", propertyId: p.distribution.propertyId,
        message: "PAID payout has missing, negative or non-finite monetary evidence; conservation cannot be checked.", evidence,
        observed: { grossAmount: nonnegative(p.grossAmount) ? p.grossAmount : null, netAmount: nonnegative(p.netAmount) ? p.netAmount : null, taxWithheld: nonnegative(p.taxWithheld) ? p.taxWithheld : null } });
      continue;
    }
    try {
      const difference = centsNumber(toCents(p.grossAmount!) - toCents(p.netAmount!) - toCents(p.taxWithheld!));
      if (difference !== 0) exceptions.push({ code: "PAYOUT_UNALLOCATED_DIFFERENCE", propertyId: p.distribution.propertyId,
        message: "Recorded gross minus net minus withholding differs. No per-payout fee allocation is available; fees or other deductions may explain it. This is not a fraud finding or a proven conservation error.",
        evidence, observed: { grossAmount: p.grossAmount, netAmount: p.netAmount, taxWithheld: p.taxWithheld, unallocatedDifferenceCents: difference, allocatedFeeCents: null } });
    } catch {
      gaps.push(`Payout ${p.id} monetary precision/range is unsupported; conservation not evaluated.`);
    }
  }
  if (!truncated) {
    const groups = new Map<string, { propertyId: number; shareClassId: number; name: string; held: number; certified: number; evidence: ExceptionEvidence[] }>();
    const ambiguousProperties = new Set<number>();
    const group = (propertyId: number, shareClassId: number, name: string) => {
      const key = `${propertyId}:${shareClassId}`;
      const value = groups.get(key) ?? { propertyId, shareClassId, name, held: 0, certified: 0, evidence: [] };
      groups.set(key, value);
      return value;
    };
    for (const h of rows.holdings) {
      const g = group(h.propertyId, h.shareClassId, h.shareClass.name);
      if (!nonnegative(h.sharesOwned) || !Number.isSafeInteger(h.sharesOwned)) {
        ambiguousProperties.add(h.propertyId);
        gaps.push(`Holding ${h.id} has invalid shares; property comparison suppressed.`);
      } else g.held += h.sharesOwned;
      g.evidence.push({ id: `holding:${h.id}`, kind: "CURRENT_HOLDING", asOf: h.updatedAt.toISOString() });
    }
    for (const c of rows.certificates) {
      const evidence = [{ id: `certificate:${c.id}`, kind: "VALID_CERTIFICATE_ISSUANCE", asOf: c.issueDate.toISOString() }];
      const matches = c.property.shareClasses.filter((sc) => sc.name === c.shareClassName);
      if (matches.length !== 1 || c.property.shareClasses.length > OFFICE_LIMIT) {
        ambiguousProperties.add(c.propertyId);
        exceptions.push({ code: "CERTIFICATE_CLASS_AMBIGUOUS", propertyId: c.propertyId,
          message: "Certificate stores a class name, not a class ID; no unique current property/class match can be established. Numeric mismatch comparison suppressed for this property.",
          evidence, observed: { shareClassName: c.shareClassName, matchingClasses: matches.length } });
      } else if (!nonnegative(c.numberOfShares)) {
        ambiguousProperties.add(c.propertyId);
        exceptions.push({ code: "CERTIFICATE_INVALID_SHARES", propertyId: c.propertyId, message: "Certificate share count is invalid; property comparison suppressed.", evidence, observed: { numberOfShares: null } });
      } else {
        const sc = matches[0]!;
        const g = group(c.propertyId, sc.id, sc.name);
        g.certified += c.numberOfShares;
        g.evidence.push(...evidence);
      }
    }
    for (const g of groups.values()) {
      if (ambiguousProperties.has(g.propertyId)) continue;
      if (![g.held, g.certified].every((n) => Number.isFinite(n) && Math.abs(n) <= Number.MAX_SAFE_INTEGER)) {
        gaps.push(`Share totals for property ${g.propertyId}, class ${g.shareClassId} exceed safe range; comparison suppressed.`);
      } else if (Math.abs(g.certified - g.held) > 1e-8) exceptions.push({ code: "CERTIFICATE_HOLDING_DIFFERENCE", propertyId: g.propertyId,
        message: "Valid certificate issuance shares differ from the current holding for the uniquely mapped property/class. Historical issuance and subsequent transfers may explain this; reconcile the ledger, not a fraud conclusion.",
        evidence: g.evidence, observed: { shareClassId: g.shareClassId, shareClassName: g.name, holdingShares: g.held, certificateShares: g.certified, differenceShares: g.certified - g.held } });
    }
  }
  for (const c of rows.contributions.slice(0, OFFICE_LIMIT)) {
    if (!c.certificate || !c.certificate.isValid || c.certificate.revokedAt) exceptions.push({ code: "PAID_CERTIFICATE_PENDING", propertyId: c.propertyId,
      message: "Eligible PAID contribution has no currently valid linked certificate. Issuance may be pending or revoked; no receipt delivery or present ownership is inferred.",
      evidence: [{ id: `contribution:${c.id}`, kind: "PAID_CONTRIBUTION", asOf: c.paymentReviewedAt?.toISOString() ?? null }],
      observed: { contributionAmount: nonnegative(c.contributionAmount) ? c.contributionAmount : null, certificateId: c.certificate?.id ?? null } });
  }
  return { readOnly: true as const, exceptions, gaps, complete: !truncated,
    counts: { payouts: payouts.length, holdings: Math.min(rows.holdings.length, OFFICE_LIMIT), certificates: Math.min(rows.certificates.length, OFFICE_LIMIT), contributions: Math.min(rows.contributions.length, OFFICE_LIMIT) },
    unitNotes: ["Payout conservation differences are integer ZAR cents after rounding each recorded field to cents; share differences are share units, not money or percentages.", "Share comparison tolerance: 0.00000001 share to ignore binary float summation noise; no arbitrary risk score."] };
}

export async function loadAccountingExceptions(user: OfficeUser, client: Prisma.TransactionClient = db, now = new Date()) {
  assertOfficeUser(user);
  const [payouts, holdings, certificates, contributions] = await Promise.all([
    client.distributionPayout.findMany({ where: { investorId: user.id, status: "PAID", distribution: { deletedAt: null } },
      select: { id: true, grossAmount: true, netAmount: true, taxWithheld: true, paidAt: true, createdAt: true, distribution: { select: { propertyId: true } } },
      orderBy: { id: "asc" }, take: OFFICE_LIMIT + 1 }),
    client.shareHolding.findMany({ where: { investorId: user.id },
      select: { id: true, propertyId: true, shareClassId: true, sharesOwned: true, updatedAt: true, shareClass: { select: { name: true } } },
      orderBy: { id: "asc" }, take: OFFICE_LIMIT + 1 }),
    client.shareCertificate.findMany({ where: { investorId: user.id, isValid: true, revokedAt: null },
      select: { id: true, propertyId: true, numberOfShares: true, shareClassName: true, issueDate: true,
        property: { select: { shareClasses: { select: { id: true, name: true }, orderBy: { id: "asc" }, take: OFFICE_LIMIT + 1 } } } },
      orderBy: { id: "asc" }, take: OFFICE_LIMIT + 1 }),
    client.investorContribution.findMany({ where: { investorId: user.id, paymentStatus: "PAID", status: "APPROVED", cancelledAt: null, deletedAt: null, contributionAmount: { gt: 0 } },
      select: { id: true, propertyId: true, contributionAmount: true, paymentReviewedAt: true, createdAt: true, certificate: { select: { id: true, isValid: true, revokedAt: true } } },
      orderBy: { id: "asc" }, take: OFFICE_LIMIT + 1 }),
  ]);
  return { evaluatedAt: now.toISOString(), ...calculateAccountingExceptions({ payouts, holdings, certificates, contributions }) };
}