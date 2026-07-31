import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Activity, Calculator, ChevronRight, CircleDollarSign, TrendingDown, TrendingUp } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import {
  calculateAnnualIRRFromMonthly,
  calculateMonthlyDebtService,
  calculateNOI,
  calculateTransferDuty,
} from "~/financial-calculations";
import { useAuthStore } from "~/stores/authStore";

type CalcInput = {
  purchasePrice: number;
  monthlyRent: number;
  vacancyRate: number;
  annualPropertyTax: number;
  annualInsurance: number;
  monthlyHOA: number;
  monthlyMaintenance: number;
  monthlyUtilities: number;
  monthlyManagement: number;
  closingCosts: number;
  includeTransferDuty: boolean;
  downPaymentPercent: number;
  annualInterestRate: number;
  loanTermYears: number;
  rentGrowthRate: number;
  expenseGrowthRate: number;
  holdingYears: number;
  exitCapRate: number;
  exitValueOverride: number;
  sellingCostPercent: number;
  stressRateIncrease: number;
  stressRentDrop: number;
};

type StrategyPresetKey = "RENTAL" | "FLIP" | "DEVELOPMENT";

const DEFAULTS: CalcInput = {
  purchasePrice: 1_850_000,
  monthlyRent: 18_500,
  vacancyRate: 6,
  annualPropertyTax: 22_000,
  annualInsurance: 11_000,
  monthlyHOA: 1_400,
  monthlyMaintenance: 1_600,
  monthlyUtilities: 900,
  monthlyManagement: 1_500,
  closingCosts: 45_000,
  includeTransferDuty: true,
  downPaymentPercent: 20,
  annualInterestRate: 11.75,
  loanTermYears: 20,
  rentGrowthRate: 5.5,
  expenseGrowthRate: 6,
  holdingYears: 7,
  exitCapRate: 8.75,
  exitValueOverride: 0,
  sellingCostPercent: 4,
  stressRateIncrease: 2,
  stressRentDrop: 10,
};

const STRATEGY_PRESETS: Record<StrategyPresetKey, Partial<CalcInput>> = {
  RENTAL: {
    vacancyRate: 6,
    downPaymentPercent: 20,
    annualInterestRate: 11.75,
    loanTermYears: 20,
    rentGrowthRate: 5.5,
    expenseGrowthRate: 6,
    holdingYears: 7,
    exitCapRate: 8.75,
    sellingCostPercent: 4,
    stressRateIncrease: 2,
    stressRentDrop: 10,
  },
  FLIP: {
    vacancyRate: 0,
    downPaymentPercent: 30,
    annualInterestRate: 12.5,
    loanTermYears: 2,
    rentGrowthRate: 0,
    expenseGrowthRate: 8,
    holdingYears: 1,
    exitCapRate: 0,
    sellingCostPercent: 5,
    stressRateIncrease: 2.5,
    stressRentDrop: 0,
  },
  DEVELOPMENT: {
    vacancyRate: 4,
    downPaymentPercent: 35,
    annualInterestRate: 12.0,
    loanTermYears: 10,
    rentGrowthRate: 4.5,
    expenseGrowthRate: 6.5,
    holdingYears: 4,
    exitCapRate: 9.5,
    sellingCostPercent: 4.5,
    stressRateIncrease: 2.25,
    stressRentDrop: 8,
  },
};

const STRATEGY_LABELS: Record<StrategyPresetKey, string> = {
  RENTAL: "Rental Hold",
  FLIP: "Flip",
  DEVELOPMENT: "Development",
};

const DEAL_SPECIFIC_KEYS: (keyof CalcInput)[] = [
  "purchasePrice",
  "monthlyRent",
  "annualPropertyTax",
  "annualInsurance",
  "monthlyHOA",
  "monthlyMaintenance",
  "monthlyUtilities",
  "monthlyManagement",
  "vacancyRate",
  "closingCosts",
  "downPaymentPercent",
  "annualInterestRate",
  "loanTermYears",
];

function parseStrategy(value?: string): StrategyPresetKey {
  const raw = (value ?? "").toUpperCase();
  if (raw.includes("FLIP")) return "FLIP";
  if (raw.includes("DEV")) return "DEVELOPMENT";
  return "RENTAL";
}

function applyPreset(base: CalcInput, strategy: StrategyPresetKey, preserveDealSpecific: boolean): CalcInput {
  const preset = STRATEGY_PRESETS[strategy];
  if (!preserveDealSpecific) return { ...base, ...preset };

  const withPreset = { ...base, ...preset };
  for (const key of DEAL_SPECIFIC_KEYS) {
    withPreset[key] = base[key] as never;
  }
  return withPreset;
}

const R = (n: number) =>
  `R${n.toLocaleString("en-ZA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
const pct = (n: number) => `${n.toFixed(1)}%`;

export const Route = createFileRoute("/investments/financing-calculator/")({
  validateSearch: (search: Record<string, unknown>) => {
    const num = (key: string) => {
      const raw = search[key];
      if (raw == null || raw === "") return undefined;
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    };
    return {
      purchasePrice: num("purchasePrice"),
      monthlyRent: num("monthlyRent"),
      annualPropertyTax: num("annualPropertyTax"),
      annualInsurance: num("annualInsurance"),
      monthlyHOA: num("monthlyHOA"),
      monthlyMaintenance: num("monthlyMaintenance"),
      monthlyUtilities: num("monthlyUtilities"),
      monthlyManagement: num("monthlyManagement"),
      vacancyRate: num("vacancyRate"),
      closingCosts: num("closingCosts"),
      loanAmount: num("loanAmount"),
      interestRate: num("interestRate"),
      loanTermYears: num("loanTermYears"),
      source: typeof search.source === "string" ? search.source : undefined,
      strategy: typeof search.strategy === "string" ? search.strategy : undefined,
    };
  },
  component: FinancingCalculatorPage,
});

function FinancingCalculatorPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const [input, setInput] = useState<CalcInput>(DEFAULTS);
  const [strategy, setStrategy] = useState<StrategyPresetKey>("RENTAL");

  useEffect(() => {
    // Prefill from opportunity page query params when present.
    const resolvedStrategy = parseStrategy(search.strategy);
    setStrategy(resolvedStrategy);

    setInput((prev) => {
      const baseline = applyPreset(prev, resolvedStrategy, true);
      const resolvedLoanAmount =
        search.loanAmount != null && search.purchasePrice != null
          ? Math.max(0, (search.purchasePrice ?? baseline.purchasePrice) - search.loanAmount)
          : undefined;

      return {
        ...baseline,
        purchasePrice: search.purchasePrice ?? baseline.purchasePrice,
        monthlyRent: search.monthlyRent ?? baseline.monthlyRent,
        annualPropertyTax: search.annualPropertyTax ?? baseline.annualPropertyTax,
        annualInsurance: search.annualInsurance ?? baseline.annualInsurance,
        monthlyHOA: search.monthlyHOA ?? baseline.monthlyHOA,
        monthlyMaintenance: search.monthlyMaintenance ?? baseline.monthlyMaintenance,
        monthlyUtilities: search.monthlyUtilities ?? baseline.monthlyUtilities,
        monthlyManagement: search.monthlyManagement ?? baseline.monthlyManagement,
        vacancyRate: search.vacancyRate ?? baseline.vacancyRate,
        closingCosts: search.closingCosts ?? baseline.closingCosts,
        annualInterestRate: search.interestRate ?? baseline.annualInterestRate,
        loanTermYears: search.loanTermYears ?? baseline.loanTermYears,
        downPaymentPercent:
          resolvedLoanAmount != null && (search.purchasePrice ?? baseline.purchasePrice) > 0
            ? Math.max(
                0,
                Math.min(
                  100,
                  (resolvedLoanAmount / (search.purchasePrice ?? baseline.purchasePrice)) * 100,
                ),
              )
            : baseline.downPaymentPercent,
      };
    });
  }, [search]);

  const applyStrategyPreset = (next: StrategyPresetKey) => {
    setStrategy(next);
    setInput((prev) => applyPreset(prev, next, true));
  };

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [authToken, hasHydrated, navigate, user]);

  const base = useMemo(() => {
    const transferDuty = input.includeTransferDuty
      ? calculateTransferDuty(input.purchasePrice)
      : 0;
    const acquisitionCosts = transferDuty + input.closingCosts;
    const downPayment = input.purchasePrice * (input.downPaymentPercent / 100);
    const loanAmount = Math.max(0, input.purchasePrice - downPayment);
    const monthlyDebtService = calculateMonthlyDebtService(
      loanAmount,
      input.annualInterestRate,
      input.loanTermYears,
    );
    const annualDebtService = monthlyDebtService * 12;

    const annualGrossRent = input.monthlyRent * 12;
    const annualOperatingExpenses =
      input.annualPropertyTax +
      input.annualInsurance +
      (input.monthlyHOA +
        input.monthlyMaintenance +
        input.monthlyUtilities +
        input.monthlyManagement) *
        12;
    const noi = calculateNOI(
      annualGrossRent,
      input.vacancyRate,
      annualOperatingExpenses,
    );

    const annualCashFlow = noi - annualDebtService;
    const monthlyCashFlow = annualCashFlow / 12;
    const cashInvested = downPayment + acquisitionCosts;
    const cashOnCashReturn =
      cashInvested > 0 ? (annualCashFlow / cashInvested) * 100 : 0;
    const dscr = annualDebtService > 0 ? noi / annualDebtService : 0;
    const debtYield = loanAmount > 0 ? (noi / loanAmount) * 100 : 0;
    const breakEvenOccupancy =
      annualGrossRent > 0
        ? ((annualOperatingExpenses + annualDebtService) / annualGrossRent) * 100
        : 0;

    const monthlyRate = input.annualInterestRate / 100 / 12;
    const months = Math.max(1, input.holdingYears * 12);
    // Stabilised NOI at exit: grow the (vacancy-adjusted) rent and the operating
    // expenses independently at their own rates, then net them. Growing the net
    // NOI directly would compound expenses at the rent-growth rate.
    const effectiveGrossRent = annualGrossRent * (1 - input.vacancyRate / 100);
    const grownEffectiveRent =
      effectiveGrossRent * Math.pow(1 + input.rentGrowthRate / 100, input.holdingYears);
    const grownExpenses =
      annualOperatingExpenses * Math.pow(1 + input.expenseGrowthRate / 100, input.holdingYears);
    const stabilizedNOI = Math.max(0, grownEffectiveRent - grownExpenses);
    // Exit value model:
    //  1. Explicit override (e.g. a flip's after-repair resale value) wins.
    //  2. Otherwise an income reversion on the stabilised NOI at the exit cap rate
    //     (the right model for rental / development holds).
    //  3. If no exit cap rate is set (e.g. a flip), fall back to appreciating the
    //     purchase price at the rent-growth rate so the IRR is not modelled as zero.
    const incomeReversionValue =
      input.exitCapRate > 0 ? stabilizedNOI / (input.exitCapRate / 100) : 0;
    const appreciationValue =
      input.purchasePrice * Math.pow(1 + input.rentGrowthRate / 100, input.holdingYears);
    const grossExitValue =
      input.exitValueOverride > 0
        ? input.exitValueOverride
        : incomeReversionValue > 0
          ? incomeReversionValue
          : appreciationValue;
    const sellingCosts = grossExitValue * (input.sellingCostPercent / 100);

    let outstandingLoan = loanAmount;
    if (loanAmount > 0) {
      if (monthlyRate > 0) {
        const growth = Math.pow(1 + monthlyRate, months);
        outstandingLoan =
          loanAmount * growth -
          monthlyDebtService * ((growth - 1) / monthlyRate);
      } else {
        outstandingLoan = loanAmount - monthlyDebtService * months;
      }
      outstandingLoan = Math.max(0, outstandingLoan);
    }

    const netSaleProceeds = Math.max(0, grossExitValue - sellingCosts - outstandingLoan);

    const monthlyCashFlows: number[] = [-cashInvested];
    for (let i = 1; i <= months; i += 1) {
      monthlyCashFlows.push(monthlyCashFlow);
    }
    const terminalFlow = monthlyCashFlows[months] ?? 0;
    monthlyCashFlows[months] = terminalFlow + netSaleProceeds;

    const equityIRR = calculateAnnualIRRFromMonthly(monthlyCashFlows);

    return {
      transferDuty,
      acquisitionCosts,
      downPayment,
      loanAmount,
      monthlyDebtService,
      annualDebtService,
      annualGrossRent,
      annualOperatingExpenses,
      noi,
      annualCashFlow,
      monthlyCashFlow,
      cashInvested,
      cashOnCashReturn,
      dscr,
      debtYield,
      breakEvenOccupancy,
      grossExitValue,
      sellingCosts,
      outstandingLoan,
      netSaleProceeds,
      equityIRR,
    };
  }, [input]);

  const stress = useMemo(() => {
    const stressedRent = input.monthlyRent * (1 - input.stressRentDrop / 100);
    const stressedRate = input.annualInterestRate + input.stressRateIncrease;
    const stressedDebtService =
      calculateMonthlyDebtService(
        base.loanAmount,
        stressedRate,
        input.loanTermYears,
      ) * 12;
    const stressedNOI = calculateNOI(
      stressedRent * 12,
      input.vacancyRate,
      base.annualOperatingExpenses,
    );
    const stressedAnnualCashFlow = stressedNOI - stressedDebtService;

    return {
      stressedRent,
      stressedRate,
      stressedDebtService,
      stressedNOI,
      stressedAnnualCashFlow,
      stressedDSCR: stressedDebtService > 0 ? stressedNOI / stressedDebtService : 0,
    };
  }, [base.annualOperatingExpenses, base.loanAmount, input]);

  if (!user || !authToken) return null;

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Calculator className="text-gold-500" size={30} />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Financing Deal Calculator</h1>
              <p className="text-sm text-gray-500">A lender-style view of rental deals: debt sizing, resilience and equity outcomes.</p>
              {search.source && (
                <p className="mt-1 text-xs text-gold-600">Prefilled from: {search.source}</p>
              )}
            </div>
          </div>
          <Link
            to="/investments/opportunities"
            className="inline-flex items-center gap-2 rounded-lg border border-gold-500/30 bg-gold-500/10 px-3 py-2 text-sm font-medium text-gold-600 hover:bg-gold-500/20"
          >
            Back to opportunities <ChevronRight size={16} />
          </Link>
        </div>

        <div className="mb-6 rounded-xl border border-navy-700 bg-gradient-to-r from-navy-800/50 via-navy-900/40 to-gold-900/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gold-500">What this fixes vs most calculators</p>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2 lg:grid-cols-4">
            {[
              "Includes transfer duty + closing costs in cash invested",
              "Shows DSCR and debt yield (lender credit view)",
              "Runs a stress scenario: higher rates + lower rent",
              "Adds terminal equity view with estimated annual IRR",
            ].map((item) => (
              <div key={item} className="rounded-md bg-navy-800/40 px-3 py-2 text-xs text-gray-600">{item}</div>
            ))}
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-navy-700 bg-navy-900/50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-gold-500">Strategy Presets</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {(["RENTAL", "FLIP", "DEVELOPMENT"] as StrategyPresetKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => applyStrategyPreset(key)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  strategy === key
                    ? "bg-gold-500 text-navy-950"
                    : "border border-navy-700 bg-navy-800/30 text-gray-600 hover:bg-navy-800/50"
                }`}
              >
                {STRATEGY_LABELS[key]}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Presets tune financing assumptions for each deal style while keeping the loaded opportunity numbers.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-6">
            <section className="rounded-xl border border-navy-700 bg-navy-900/50 p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gold-500">Deal Inputs</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <NumberField label="Purchase Price" value={input.purchasePrice} onChange={(v) => setInput((s) => ({ ...s, purchasePrice: v }))} currency />
                <NumberField label="Monthly Rent" value={input.monthlyRent} onChange={(v) => setInput((s) => ({ ...s, monthlyRent: v }))} currency />
                <NumberField label="Vacancy Rate" value={input.vacancyRate} onChange={(v) => setInput((s) => ({ ...s, vacancyRate: v }))} percent />
                <NumberField label="Closing Costs" value={input.closingCosts} onChange={(v) => setInput((s) => ({ ...s, closingCosts: v }))} currency />
                <NumberField label="Down Payment" value={input.downPaymentPercent} onChange={(v) => setInput((s) => ({ ...s, downPaymentPercent: v }))} percent />
                <NumberField label="Interest Rate" value={input.annualInterestRate} onChange={(v) => setInput((s) => ({ ...s, annualInterestRate: v }))} percent />
                <NumberField label="Loan Term (years)" value={input.loanTermYears} onChange={(v) => setInput((s) => ({ ...s, loanTermYears: v }))} />
                <NumberField label="Exit Cap Rate" value={input.exitCapRate} onChange={(v) => setInput((s) => ({ ...s, exitCapRate: v }))} percent />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <NumberField label="Annual Property Tax" value={input.annualPropertyTax} onChange={(v) => setInput((s) => ({ ...s, annualPropertyTax: v }))} currency />
                <NumberField label="Annual Insurance" value={input.annualInsurance} onChange={(v) => setInput((s) => ({ ...s, annualInsurance: v }))} currency />
                <NumberField label="Monthly HOA/Levy" value={input.monthlyHOA} onChange={(v) => setInput((s) => ({ ...s, monthlyHOA: v }))} currency />
                <NumberField label="Monthly Maintenance" value={input.monthlyMaintenance} onChange={(v) => setInput((s) => ({ ...s, monthlyMaintenance: v }))} currency />
                <NumberField label="Monthly Utilities" value={input.monthlyUtilities} onChange={(v) => setInput((s) => ({ ...s, monthlyUtilities: v }))} currency />
                <NumberField label="Monthly Management Fee" value={input.monthlyManagement} onChange={(v) => setInput((s) => ({ ...s, monthlyManagement: v }))} currency />
              </div>

              <label className="mt-4 inline-flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={input.includeTransferDuty}
                  onChange={(e) => setInput((s) => ({ ...s, includeTransferDuty: e.target.checked }))}
                  className="h-4 w-4 rounded border-navy-600 bg-navy-800 text-gold-500"
                />
                Include SARS transfer duty estimate in upfront costs
              </label>
            </section>

            <section className="rounded-xl border border-navy-700 bg-navy-900/50 p-5">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gold-500">Projection and Stress Settings</h2>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <NumberField label="Holding Period (years)" value={input.holdingYears} onChange={(v) => setInput((s) => ({ ...s, holdingYears: v }))} />
                <NumberField label="Selling Costs" value={input.sellingCostPercent} onChange={(v) => setInput((s) => ({ ...s, sellingCostPercent: v }))} percent />
                <NumberField label="Exit Value Override (0 = auto)" value={input.exitValueOverride} onChange={(v) => setInput((s) => ({ ...s, exitValueOverride: v }))} currency />
                <NumberField label="Annual Rent Growth" value={input.rentGrowthRate} onChange={(v) => setInput((s) => ({ ...s, rentGrowthRate: v }))} percent />
                <NumberField label="Annual Expense Growth" value={input.expenseGrowthRate} onChange={(v) => setInput((s) => ({ ...s, expenseGrowthRate: v }))} percent />
                <NumberField label="Stress: Rate Shock" value={input.stressRateIncrease} onChange={(v) => setInput((s) => ({ ...s, stressRateIncrease: v }))} percent />
                <NumberField label="Stress: Rent Drop" value={input.stressRentDrop} onChange={(v) => setInput((s) => ({ ...s, stressRentDrop: v }))} percent />
              </div>
            </section>
          </div>

          <div className="space-y-4">
            <MetricCard title="Loan and Equity" icon={CircleDollarSign}>
              <MetricRow label="Loan Amount" value={R(base.loanAmount)} />
              <MetricRow label="Down Payment" value={R(base.downPayment)} />
              <MetricRow label="Acquisition Costs" value={R(base.acquisitionCosts)} />
              <MetricRow label="Cash Invested" value={R(base.cashInvested)} emphasize />
            </MetricCard>

            <MetricCard title="Income and Coverage" icon={Activity}>
              <MetricRow label="NOI (annual)" value={R(base.noi)} />
              <MetricRow label="Debt Service (annual)" value={R(base.annualDebtService)} />
              <MetricRow label="Monthly Cash Flow" value={R(base.monthlyCashFlow)} tone={base.monthlyCashFlow >= 0 ? "good" : "bad"} />
              <MetricRow label="DSCR" value={base.dscr.toFixed(2)} tone={base.dscr >= 1.2 ? "good" : base.dscr >= 1 ? "warn" : "bad"} />
              <MetricRow label="Debt Yield" value={pct(base.debtYield)} tone={base.debtYield >= 10 ? "good" : base.debtYield >= 8 ? "warn" : "bad"} />
              <MetricRow label="Cash-on-Cash" value={pct(base.cashOnCashReturn)} tone={base.cashOnCashReturn >= 8 ? "good" : base.cashOnCashReturn >= 4 ? "warn" : "bad"} />
              <MetricRow
                label="Break-even Occupancy"
                value={pct(base.breakEvenOccupancy)}
                tone={base.breakEvenOccupancy <= 85 ? "good" : base.breakEvenOccupancy <= 95 ? "warn" : "bad"}
              />
            </MetricCard>

            <MetricCard title="Stress Test" icon={TrendingDown}>
              <MetricRow label="Stressed Interest Rate" value={pct(stress.stressedRate)} />
              <MetricRow label="Stressed Monthly Rent" value={R(stress.stressedRent)} />
              <MetricRow label="Stressed Annual Cash Flow" value={R(stress.stressedAnnualCashFlow)} tone={stress.stressedAnnualCashFlow >= 0 ? "good" : "bad"} />
              <MetricRow label="Stressed DSCR" value={stress.stressedDSCR.toFixed(2)} tone={stress.stressedDSCR >= 1.1 ? "good" : stress.stressedDSCR >= 1 ? "warn" : "bad"} />
            </MetricCard>

            <MetricCard title="Exit and IRR View" icon={TrendingUp}>
              <MetricRow label="Estimated Exit Value" value={R(base.grossExitValue)} />
              <MetricRow label="Outstanding Loan at Exit" value={R(base.outstandingLoan)} />
              <MetricRow label="Net Sale Proceeds to Equity" value={R(base.netSaleProceeds)} emphasize />
              <MetricRow
                label="Estimated Equity IRR"
                value={Number.isFinite(base.equityIRR) ? pct(base.equityIRR) : "N/A"}
                tone={Number.isFinite(base.equityIRR) && base.equityIRR >= 12 ? "good" : Number.isFinite(base.equityIRR) && base.equityIRR >= 8 ? "warn" : "bad"}
              />
            </MetricCard>
          </div>
        </div>

        <p className="mt-6 rounded-lg border border-navy-700 bg-navy-900/40 px-4 py-3 text-xs leading-relaxed text-gray-500">
          These figures are illustrative estimates generated from the assumptions you enter, not financial,
          investment or tax advice and not a guarantee of returns. Actual results depend on interest rates,
          rental performance, costs, taxes and market conditions. Confirm any figure with your own advisers
          before making an investment decision.
        </p>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  currency,
  percent,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  currency?: boolean;
  percent?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
      <div className="relative">
        {currency && <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-gray-500">R</span>}
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value || 0))}
          className={`w-full rounded-md border border-navy-700 bg-navy-800/30 py-2 text-sm text-gray-900 placeholder-gray-500 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500 ${currency ? "pl-8 pr-10" : "px-3"}`}
        />
        {percent && <span className="pointer-events-none absolute right-3 top-2.5 text-sm text-gray-500">%</span>}
      </div>
    </label>
  );
}

function MetricCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-navy-700 bg-navy-900/60 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gold-500">
        <Icon size={16} className="text-gold-500" /> {title}
      </h3>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function MetricRow({
  label,
  value,
  tone = "default",
  emphasize = false,
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "warn" | "bad";
  emphasize?: boolean;
}) {
  const toneCls =
    tone === "good"
      ? "text-emerald-600"
      : tone === "warn"
        ? "text-orange-500"
        : tone === "bad"
          ? "text-red-500"
          : "text-gray-900";

  return (
    <div className="flex items-center justify-between rounded-md bg-navy-800/20 px-3 py-2">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm ${emphasize ? "font-bold" : "font-semibold"} ${toneCls}`}>{value}</span>
    </div>
  );
}
