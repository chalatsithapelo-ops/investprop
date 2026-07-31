/**
 * Backfill stored derived financial columns on RentalBond so they match the
 * figures the platform computes and displays (via src/financial-calculations.ts).
 *
 * Historically these columns (capRate, netYield, grossYield, cashOnCashReturn,
 * grossRentMultiplier, debtServiceCoverageRatio) were often left at 0, which made
 * older code paths, exports and reports disagree with the opportunity page.
 *
 * SAFE BY DEFAULT: runs as a dry-run and only prints what WOULD change.
 * Pass --apply to actually persist the updates.
 *
 * The script needs DATABASE_URL. It will auto-load a local `.env` / `.env.production`
 * if one exists, otherwise set it inline. Examples:
 *
 *   pnpm exec tsx scripts/backfill-financial-metrics.ts                       # preview (uses .env)
 *   pnpm exec tsx scripts/backfill-financial-metrics.ts --apply               # write (uses .env)
 *   $env:DATABASE_URL="postgres://..."; pnpm exec tsx scripts/backfill-financial-metrics.ts --apply
 */
import { existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { calculateRentalMetrics } from "../src/financial-calculations";

// Load DATABASE_URL from a local env file if it isn't already present in the shell.
if (!process.env.DATABASE_URL && typeof (process as any).loadEnvFile === "function") {
  for (const f of [".env", ".env.production", ".env.local"]) {
    if (existsSync(f)) {
      (process as any).loadEnvFile(f);
      if (process.env.DATABASE_URL) break;
    }
  }
}

const db = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const EPSILON = 0.01; // ignore sub-0.01 differences (rounding noise)

function changed(a: number, b: number): boolean {
  return Math.abs((a ?? 0) - (b ?? 0)) > EPSILON;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL is not set. Create a local .env with DATABASE_URL, or run:\n" +
        '  $env:DATABASE_URL="postgres://..."; pnpm exec tsx scripts/backfill-financial-metrics.ts'
    );
    process.exit(1);
  }

  console.log(APPLY ? "APPLY MODE — changes will be written.\n" : "DRY RUN — no changes will be written. Pass --apply to persist.\n");

  const rentals = await db.rentalBond.findMany({
    include: { property: { select: { id: true, title: true, price: true } } },
  });

  console.log(`Scanning ${rentals.length} rental bond record(s)...\n`);

  let updatedCount = 0;

  for (const r of rentals) {
    const calc = calculateRentalMetrics({
      purchasePrice: r.purchasePrice || r.property?.price || 0,
      monthlyRent: r.monthlyRent ?? 0,
      annualPropertyTax: r.annualPropertyTax ?? 0,
      annualInsurance: r.annualInsurance ?? 0,
      monthlyHOAFees: r.monthlyHOAFees ?? 0,
      monthlyMaintenanceReserve: r.monthlyMaintenanceReserve ?? 0,
      monthlyUtilities: r.monthlyUtilities ?? 0,
      monthlyManagementFee: r.monthlyManagementFee ?? 0,
      vacancyRate: r.vacancyRate ?? 5,
      appreciationRate: r.appreciationRate ?? 3,
      capRate: r.capRate ?? 0,
      cashOnCashReturn: r.cashOnCashReturn ?? 0,
      grossRentMultiplier: r.grossRentMultiplier ?? 0,
      debtServiceCoverageRatio: r.debtServiceCoverageRatio ?? 0,
      grossYield: r.grossYield ?? 0,
      netYield: r.netYield ?? 0,
      downPaymentAmount: r.downPaymentAmount ?? 0,
      loanAmount: r.loanAmount || r.bondAmount || 0,
      interestRate: r.interestRate ?? 0,
      loanTermYears: r.loanTermYears ?? 0,
      monthlyDebtService: r.monthlyDebtService ?? 0,
      totalInvestmentBudget: r.totalInvestmentBudget ?? 0,
      spentInvestmentBudget: r.spentInvestmentBudget ?? 0,
    });

    const next = {
      capRate: calc.displayCapRate,
      netYield: calc.netYield,
      grossYield: calc.grossYield,
      cashOnCashReturn: calc.cashOnCashReturn,
      grossRentMultiplier: calc.grossRentMultiplier,
      debtServiceCoverageRatio: calc.dscr,
    };

    const diffs: string[] = [];
    if (changed(r.capRate, next.capRate)) diffs.push(`capRate ${r.capRate.toFixed(2)}→${next.capRate.toFixed(2)}`);
    if (changed(r.netYield, next.netYield)) diffs.push(`netYield ${r.netYield.toFixed(2)}→${next.netYield.toFixed(2)}`);
    if (changed(r.grossYield, next.grossYield)) diffs.push(`grossYield ${r.grossYield.toFixed(2)}→${next.grossYield.toFixed(2)}`);
    if (changed(r.cashOnCashReturn, next.cashOnCashReturn)) diffs.push(`CoC ${r.cashOnCashReturn.toFixed(2)}→${next.cashOnCashReturn.toFixed(2)}`);
    if (changed(r.grossRentMultiplier, next.grossRentMultiplier)) diffs.push(`GRM ${r.grossRentMultiplier.toFixed(2)}→${next.grossRentMultiplier.toFixed(2)}`);
    if (changed(r.debtServiceCoverageRatio, next.debtServiceCoverageRatio)) diffs.push(`DSCR ${r.debtServiceCoverageRatio.toFixed(2)}→${next.debtServiceCoverageRatio.toFixed(2)}`);

    if (diffs.length === 0) continue;

    updatedCount++;
    console.log(`#${r.property?.id ?? "?"} ${r.property?.title ?? `rentalBond ${r.id}`}: ${diffs.join(" | ")}`);

    if (APPLY) {
      await db.rentalBond.update({ where: { id: r.id }, data: next });
    }
  }

  console.log(
    `\n${APPLY ? "Updated" : "Would update"} ${updatedCount} of ${rentals.length} rental record(s).` +
      (APPLY ? "" : "\nRe-run with --apply to persist these changes.")
  );

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
