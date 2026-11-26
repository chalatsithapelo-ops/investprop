import { useMemo } from "react";
import { Building2, TrendingUp } from "lucide-react";
import {
  computeRentalProjections,
  type RentalFinancialsInput,
  type RentalProjections,
} from "~/financial-calculations";

/**
 * Owner-facing inputs + live projections for an income-producing property the
 * owner may want to renovate for higher rent. Shared by the owner sale-proposal
 * and land-partnership submission forms. The parent owns the `value` state and
 * the base property value (asking price / estimated land value) used for yields.
 */
export type RentalFinancialsValue = {
  isIncomeProducing: boolean;
  numberOfUnits: string;
  occupancyRate: string;
  currentMonthlyRent: string;
  ratesMonthly: string;
  leviesMonthly: string;
  insuranceMonthly: string;
  managementMonthly: string;
  maintenanceMonthly: string;
  utilitiesMonthly: string;
  otherOpexMonthly: string;
  renovationBudget: string;
  renovationMonths: string;
  projectedMonthlyRent: string;
  projectedOccupancyRate: string;
  leaseTermMonths: string;
  leaseEscalationPct: string;
  leaseExpiry: string;
};

export const EMPTY_RENTAL_FINANCIALS: RentalFinancialsValue = {
  isIncomeProducing: false,
  numberOfUnits: "",
  occupancyRate: "",
  currentMonthlyRent: "",
  ratesMonthly: "",
  leviesMonthly: "",
  insuranceMonthly: "",
  managementMonthly: "",
  maintenanceMonthly: "",
  utilitiesMonthly: "",
  otherOpexMonthly: "",
  renovationBudget: "",
  renovationMonths: "",
  projectedMonthlyRent: "",
  projectedOccupancyRate: "",
  leaseTermMonths: "",
  leaseEscalationPct: "",
  leaseExpiry: "",
};

const n = (v: string): number | undefined => {
  const t = v.trim();
  if (t === "") return undefined;
  const parsed = Number(t);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** Convert form state into the API `financials` payload (undefined when empty). */
export function toRentalFinancialsInput(
  v: RentalFinancialsValue,
): RentalFinancialsInput | undefined {
  if (!v.isIncomeProducing) return undefined;
  const out: RentalFinancialsInput = {
    isIncomeProducing: true,
    numberOfUnits: n(v.numberOfUnits),
    occupancyRate: n(v.occupancyRate),
    currentMonthlyRent: n(v.currentMonthlyRent),
    ratesMonthly: n(v.ratesMonthly),
    leviesMonthly: n(v.leviesMonthly),
    insuranceMonthly: n(v.insuranceMonthly),
    managementMonthly: n(v.managementMonthly),
    maintenanceMonthly: n(v.maintenanceMonthly),
    utilitiesMonthly: n(v.utilitiesMonthly),
    otherOpexMonthly: n(v.otherOpexMonthly),
    renovationBudget: n(v.renovationBudget),
    renovationMonths: n(v.renovationMonths),
    projectedMonthlyRent: n(v.projectedMonthlyRent),
    projectedOccupancyRate: n(v.projectedOccupancyRate),
    leaseTermMonths: n(v.leaseTermMonths),
    leaseEscalationPct: n(v.leaseEscalationPct),
    leaseExpiry: v.leaseExpiry.trim() || undefined,
  };
  return out;
}

const ZAR = (x: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(x) ? x : 0);
const PCT = (x: number) => `${(Number.isFinite(x) ? x : 0).toFixed(1)}%`;

const INPUT =
  "w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";
const LABEL = "mb-1 block text-sm font-medium text-gray-700";

export function RentalFinancialsSection({
  value,
  onChange,
  baseValue,
}: {
  value: RentalFinancialsValue;
  onChange: (next: RentalFinancialsValue) => void;
  /** Property value used to measure yields (asking price / estimated land value). */
  baseValue: number;
}) {
  const set = (k: keyof RentalFinancialsValue, v: string | boolean) =>
    onChange({ ...value, [k]: v });

  const projections = useMemo<RentalProjections | null>(() => {
    const input = toRentalFinancialsInput(value);
    if (!input) return null;
    return computeRentalProjections(input, baseValue);
  }, [value, baseValue]);

  const Field = ({
    k,
    label,
    placeholder,
    suffix,
  }: {
    k: keyof RentalFinancialsValue;
    label: string;
    placeholder?: string;
    suffix?: string;
  }) => (
    <div>
      <label className={LABEL}>{label}</label>
      <div className="relative">
        <input
          type="number"
          min={0}
          className={INPUT}
          placeholder={placeholder ?? "0"}
          value={value[k] as string}
          onChange={(e) => set(k, e.target.value)}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-gray-400">
            {suffix}
          </span>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold-50 text-gold-600">
          <Building2 size={18} />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-gray-900">
            Rental financial performance
          </h3>
          <p className="mt-0.5 text-sm text-gray-500">
            For income-producing buildings — including ones you want to renovate
            for higher rent. We use this to build due-diligence projections.
          </p>
        </div>
      </div>

      <label className="mt-4 flex cursor-pointer items-center gap-2.5 rounded-lg bg-gray-50 px-3 py-2.5">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300 text-gold-600 focus:ring-gold-500"
          checked={value.isIncomeProducing}
          onChange={(e) => set("isIncomeProducing", e.target.checked)}
        />
        <span className="text-sm font-medium text-gray-800">
          This property earns (or will earn) rental income
        </span>
      </label>

      {value.isIncomeProducing && (
        <div className="mt-5 space-y-6">
          {/* Current income */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Current income
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field k="currentMonthlyRent" label="Gross monthly rent" suffix="R" />
              <Field k="numberOfUnits" label="Lettable units" />
              <Field k="occupancyRate" label="Occupancy" suffix="%" />
            </div>
          </div>

          {/* Operating expenses */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Monthly operating expenses
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field k="ratesMonthly" label="Rates" suffix="R" />
              <Field k="leviesMonthly" label="Levies" suffix="R" />
              <Field k="insuranceMonthly" label="Insurance" suffix="R" />
              <Field k="managementMonthly" label="Management" suffix="R" />
              <Field k="maintenanceMonthly" label="Maintenance" suffix="R" />
              <Field k="utilitiesMonthly" label="Utilities" suffix="R" />
              <Field k="otherOpexMonthly" label="Other" suffix="R" />
            </div>
          </div>

          {/* Renovation & projection */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Renovation & projected income
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field k="renovationBudget" label="Renovation budget" suffix="R" />
              <Field k="renovationMonths" label="Reno. duration" suffix="mo" />
              <Field
                k="projectedMonthlyRent"
                label="Projected monthly rent"
                suffix="R"
              />
              <Field
                k="projectedOccupancyRate"
                label="Projected occupancy"
                suffix="%"
              />
            </div>
          </div>

          {/* Lease details */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Current lease (optional)
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field k="leaseTermMonths" label="Lease term" suffix="mo" />
              <Field
                k="leaseEscalationPct"
                label="Annual escalation"
                suffix="%"
              />
              <div>
                <label className={LABEL}>Lease expiry</label>
                <input
                  type="date"
                  className={INPUT}
                  value={value.leaseExpiry}
                  onChange={(e) => set("leaseExpiry", e.target.value)}
                />
              </div>
            </div>
          </div>

          {projections && (
            <RentalProjectionsCard projections={projections} compact />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Read-only presentation of computed current vs post-renovation projections.
 * Used inside the submission form (live) and on deal/detail views.
 */
export function RentalProjectionsCard({
  projections,
  compact = false,
}: {
  projections: RentalProjections;
  compact?: boolean;
}) {
  const { current, projected } = projections;
  const Row = ({
    label,
    now,
    future,
    money = true,
  }: {
    label: string;
    now: number;
    future: number;
    money?: boolean;
  }) => (
    <tr className="border-t border-gray-100">
      <td className="py-1.5 pr-2 text-gray-600">{label}</td>
      <td className="py-1.5 px-2 text-right font-medium text-gray-900">
        {money ? ZAR(now) : PCT(now)}
      </td>
      <td className="py-1.5 pl-2 text-right font-medium text-emerald-700">
        {money ? ZAR(future) : PCT(future)}
      </td>
    </tr>
  );

  return (
    <div
      className={`rounded-xl border border-emerald-200 bg-emerald-50/50 ${compact ? "p-4" : "p-5"}`}
    >
      <div className="mb-3 flex items-center gap-2">
        <TrendingUp size={16} className="text-emerald-600" />
        <h4 className="text-sm font-semibold text-emerald-900">
          Due-diligence projections
        </h4>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-gray-500">
            <th className="pb-1 text-left font-semibold">Metric</th>
            <th className="pb-1 text-right font-semibold">Current</th>
            <th className="pb-1 text-right font-semibold">Post-reno.</th>
          </tr>
        </thead>
        <tbody>
          <Row
            label="Gross annual rent"
            now={current.grossAnnualRent}
            future={projected.grossAnnualRent}
          />
          <Row
            label="Operating expenses"
            now={current.annualOperatingExpenses}
            future={projected.annualOperatingExpenses}
          />
          <Row label="Net operating income" now={current.noi} future={projected.noi} />
          <Row
            label="Gross yield"
            now={current.grossYield}
            future={projected.grossYield}
            money={false}
          />
          <Row
            label="Net yield"
            now={current.netYield}
            future={projected.netYield}
            money={false}
          />
        </tbody>
      </table>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Reno. budget" value={ZAR(projections.renovationBudget)} />
        <Stat label="Annual NOI uplift" value={ZAR(projections.noiUpliftAnnual)} highlight />
        <Stat label="Yield on cost" value={PCT(projections.yieldOnCostProjected)} />
        <Stat
          label="Return on reno."
          value={PCT(projections.returnOnRenovation)}
          highlight
        />
      </div>
      <p className="mt-3 text-[11px] leading-snug text-gray-500">
        Indicative, unleveraged projections computed from the figures you entered
        and the property value. Subject to Investprop due diligence and valuation.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg px-3 py-2 ${highlight ? "bg-emerald-600 text-white" : "bg-white text-gray-900"}`}
    >
      <p
        className={`text-[10px] uppercase tracking-wide ${highlight ? "text-emerald-50" : "text-gray-400"}`}
      >
        {label}
      </p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}
