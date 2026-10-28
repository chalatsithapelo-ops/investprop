import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Building,
  Home,
  Store,
  Calculator,
  TrendingUp,
  AlertTriangle,
  Info,
  HardHat,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useAuthStore } from "~/stores/authStore";
import {
  buildAffordableHousingModel,
  buildCommercialInvestmentModel,
  buildAffordableRentalModel,
  type GreenfieldModelResult,
} from "~/financial-calculations";

export const Route = createFileRoute("/financial-models/")({
  component: FinancialModelsPage,
});

type ModelKind = "AFFORDABLE_HOUSING" | "SHOPPING_CENTRE" | "AFFORDABLE_RENTAL";

const MODELS: {
  kind: ModelKind;
  label: string;
  blurb: string;
  icon: typeof Building;
}[] = [
  {
    kind: "SHOPPING_CENTRE",
    label: "Shopping Centre",
    blurb: "Retail / commercial income development — value is the capitalised net operating income.",
    icon: Store,
  },
  {
    kind: "AFFORDABLE_HOUSING",
    label: "Affordable Housing",
    blurb: "Build-and-sell housing — trading margin on the sale-out, with FLISP ceiling checks.",
    icon: Building,
  },
  {
    kind: "AFFORDABLE_RENTAL",
    label: "Affordable Rental",
    blurb: "Private & SHRA social rental — capitalised NOI net of any capital grant.",
    icon: Home,
  },
];

const R = (n: number) =>
  n.toLocaleString("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

const pct = (n: number) => `${n.toFixed(1)}%`;

/** Sensible starting figures (ZAR) tuned to SA greenfield developments. */
const DEFAULTS = {
  housing: {
    numberOfUnits: 120,
    sellingPricePerUnit: 650000,
    landCost: 9000000,
    bulkServicesCost: 6000000,
    internalServicesCost: 7500000,
    constructionCostPerUnit: 420000,
    professionalFeesCost: 4500000,
    statutoryCost: 1200000,
    financeCost: 3500000,
    marketingCost: 1800000,
    contingencyPercent: 8,
    affordablePriceCeiling: 700000,
  },
  commercial: {
    grossLettableAreaSqm: 4500,
    rentPerSqmPerMonth: 160,
    vacancyRatePct: 8,
    operatingExpenseRatioPct: 32,
    exitCapRate: 8.75,
    landCost: 12000000,
    bulkServicesCost: 4000000,
    internalServicesCost: 3000000,
    constructionCost: 34000000,
    professionalFeesCost: 5000000,
    statutoryCost: 1500000,
    financeCost: 2500000,
    marketingCost: 1200000,
    contingencyPercent: 8,
  },
  rental: {
    numberOfUnits: 200,
    rentPerUnitPerMonth: 4800,
    vacancyRatePct: 6,
    operatingCostPerUnitPerMonth: 1700,
    exitCapRate: 9.5,
    landCost: 8000000,
    bulkServicesCost: 5000000,
    internalServicesCost: 6000000,
    constructionCost: 96000000,
    professionalFeesCost: 7000000,
    statutoryCost: 1500000,
    financeCost: 6000000,
    marketingCost: 1000000,
    contingencyPercent: 10,
    capitalGrantPerUnit: 180000,
    rentalBandCeiling: 5400,
  },
};

function NumberField({
  label,
  value,
  onChange,
  suffix,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-400">{label}</span>
      <div className="mt-1 flex items-center rounded-lg border border-navy-700 bg-navy-900/70 focus-within:border-gold-500">
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full bg-transparent px-3 py-2 text-sm text-gray-100 outline-none"
        />
        {suffix && <span className="pr-3 text-xs text-gray-500">{suffix}</span>}
      </div>
      {hint && <span className="mt-0.5 block text-[11px] text-gray-600">{hint}</span>}
    </label>
  );
}

function Metric({
  label,
  value,
  emphasis,
  tone,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: "good" | "bad" | "neutral";
}) {
  const toneClass =
    tone === "good" ? "text-emerald-400" : tone === "bad" ? "text-red-400" : "text-gray-100";
  return (
    <div className="rounded-lg border border-navy-800/70 bg-navy-900/60 p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 font-bold ${emphasis ? "text-2xl" : "text-lg"} ${toneClass}`}>{value}</p>
    </div>
  );
}

function FinancialModelsPage() {
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [kind, setKind] = useState<ModelKind>("SHOPPING_CENTRE");
  const [housing, setHousing] = useState(DEFAULTS.housing);
  const [commercial, setCommercial] = useState(DEFAULTS.commercial);
  const [rental, setRental] = useState(DEFAULTS.rental);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const result: GreenfieldModelResult = useMemo(() => {
    if (kind === "AFFORDABLE_HOUSING") {
      return buildAffordableHousingModel({ ...housing });
    }
    if (kind === "AFFORDABLE_RENTAL") {
      return buildAffordableRentalModel({
        ...rental,
        vacancyRate: rental.vacancyRatePct / 100,
      });
    }
    return buildCommercialInvestmentModel({
      ...commercial,
      vacancyRate: commercial.vacancyRatePct / 100,
      operatingExpenseRatio: commercial.operatingExpenseRatioPct / 100,
    });
  }, [kind, housing, commercial, rental]);

  const isIncomeModel = kind !== "AFFORDABLE_HOUSING";
  const profitTone = result.profit >= 0 ? "good" : "bad";

  if (!user || !authToken) return null;

  const active = MODELS.find((m) => m.kind === kind)!;
  const isManager = ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"].includes(
    (user as { role?: string })?.role ?? "",
  );

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-gold-50 p-3">
            <Calculator className="text-gold-600" size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-100">Development Financial Models</h1>
            <p className="mt-1 text-gray-400">
              Quick pre-acquisition what-if model for greenfield developments. Figures update live as you type.
            </p>
          </div>
        </div>

        {/* Pointer to the full property-bound workflow (managers only) */}
        {isManager && (
          <Link
            to="/admin/development-readiness"
            className="mb-6 flex items-start gap-3 rounded-xl border border-navy-800/70 bg-navy-900/50 p-4 transition hover:border-gold-500/50"
          >
            <HardHat className="mt-0.5 shrink-0 text-gold-500" size={18} />
            <div>
              <p className="text-sm font-semibold text-gray-200">
                Running a real project? Open Project Readiness →
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                Attach the appraisal to a property, manage the professional team (QS, town planner, engineers),
                track statutory approvals and run the 4-gate construction-readiness check.
              </p>
            </div>
          </Link>
        )}

        {/* Model type selector */}
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {MODELS.map((m) => {
            const selected = m.kind === kind;
            return (
              <button
                key={m.kind}
                onClick={() => setKind(m.kind)}
                className={`flex items-start gap-3 rounded-xl border p-4 text-left transition ${
                  selected
                    ? "border-gold-500 bg-gold-500/10"
                    : "border-navy-800/70 bg-navy-900/50 hover:border-navy-600"
                }`}
              >
                <div className={`rounded-lg p-2 ${selected ? "bg-gold-500/20" : "bg-navy-800"}`}>
                  <m.icon className={selected ? "text-gold-500" : "text-gray-400"} size={20} />
                </div>
                <div>
                  <p className={`text-sm font-bold ${selected ? "text-gold-400" : "text-gray-200"}`}>
                    {m.label}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-gray-500">{m.blurb}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Inputs */}
          <div className="lg:col-span-3">
            <div className="rounded-xl border border-navy-800/70 bg-navy-900/40 p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-400">
                <active.icon size={16} /> {active.label} — Inputs
              </h2>

              {kind === "SHOPPING_CENTRE" && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <NumberField label="Gross lettable area" suffix="m²" value={commercial.grossLettableAreaSqm} onChange={(v) => setCommercial({ ...commercial, grossLettableAreaSqm: v })} />
                  <NumberField label="Rental" suffix="R/m²/mo" value={commercial.rentPerSqmPerMonth} onChange={(v) => setCommercial({ ...commercial, rentPerSqmPerMonth: v })} />
                  <NumberField label="Vacancy" suffix="%" value={commercial.vacancyRatePct} onChange={(v) => setCommercial({ ...commercial, vacancyRatePct: v })} />
                  <NumberField label="Operating expense ratio" suffix="%" value={commercial.operatingExpenseRatioPct} onChange={(v) => setCommercial({ ...commercial, operatingExpenseRatioPct: v })} hint="% of effective gross income" />
                  <NumberField label="Exit cap rate" suffix="%" value={commercial.exitCapRate} onChange={(v) => setCommercial({ ...commercial, exitCapRate: v })} hint="Used to capitalise stabilised NOI" />
                  <NumberField label="Land cost" suffix="R" value={commercial.landCost} onChange={(v) => setCommercial({ ...commercial, landCost: v })} />
                  <NumberField label="Bulk services" suffix="R" value={commercial.bulkServicesCost} onChange={(v) => setCommercial({ ...commercial, bulkServicesCost: v })} />
                  <NumberField label="Internal services" suffix="R" value={commercial.internalServicesCost} onChange={(v) => setCommercial({ ...commercial, internalServicesCost: v })} />
                  <NumberField label="Construction cost" suffix="R" value={commercial.constructionCost} onChange={(v) => setCommercial({ ...commercial, constructionCost: v })} />
                  <NumberField label="Professional fees" suffix="R" value={commercial.professionalFeesCost} onChange={(v) => setCommercial({ ...commercial, professionalFeesCost: v })} />
                  <NumberField label="Statutory costs" suffix="R" value={commercial.statutoryCost} onChange={(v) => setCommercial({ ...commercial, statutoryCost: v })} />
                  <NumberField label="Finance costs" suffix="R" value={commercial.financeCost} onChange={(v) => setCommercial({ ...commercial, financeCost: v })} />
                  <NumberField label="Marketing & letting" suffix="R" value={commercial.marketingCost} onChange={(v) => setCommercial({ ...commercial, marketingCost: v })} />
                  <NumberField label="Contingency" suffix="%" value={commercial.contingencyPercent} onChange={(v) => setCommercial({ ...commercial, contingencyPercent: v })} />
                </div>
              )}

              {kind === "AFFORDABLE_HOUSING" && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <NumberField label="Number of units" value={housing.numberOfUnits} onChange={(v) => setHousing({ ...housing, numberOfUnits: v })} />
                  <NumberField label="Selling price / unit" suffix="R" value={housing.sellingPricePerUnit} onChange={(v) => setHousing({ ...housing, sellingPricePerUnit: v })} />
                  <NumberField label="Construction cost / unit" suffix="R" value={housing.constructionCostPerUnit} onChange={(v) => setHousing({ ...housing, constructionCostPerUnit: v })} />
                  <NumberField label="Affordable price ceiling" suffix="R" value={housing.affordablePriceCeiling} onChange={(v) => setHousing({ ...housing, affordablePriceCeiling: v })} hint="FLISP / subsidy band ceiling" />
                  <NumberField label="Land cost" suffix="R" value={housing.landCost} onChange={(v) => setHousing({ ...housing, landCost: v })} />
                  <NumberField label="Bulk services" suffix="R" value={housing.bulkServicesCost} onChange={(v) => setHousing({ ...housing, bulkServicesCost: v })} />
                  <NumberField label="Internal services" suffix="R" value={housing.internalServicesCost} onChange={(v) => setHousing({ ...housing, internalServicesCost: v })} />
                  <NumberField label="Professional fees" suffix="R" value={housing.professionalFeesCost} onChange={(v) => setHousing({ ...housing, professionalFeesCost: v })} />
                  <NumberField label="Statutory costs" suffix="R" value={housing.statutoryCost} onChange={(v) => setHousing({ ...housing, statutoryCost: v })} />
                  <NumberField label="Finance costs" suffix="R" value={housing.financeCost} onChange={(v) => setHousing({ ...housing, financeCost: v })} />
                  <NumberField label="Marketing & sales" suffix="R" value={housing.marketingCost} onChange={(v) => setHousing({ ...housing, marketingCost: v })} />
                  <NumberField label="Contingency" suffix="%" value={housing.contingencyPercent} onChange={(v) => setHousing({ ...housing, contingencyPercent: v })} />
                </div>
              )}

              {kind === "AFFORDABLE_RENTAL" && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <NumberField label="Number of units" value={rental.numberOfUnits} onChange={(v) => setRental({ ...rental, numberOfUnits: v })} />
                  <NumberField label="Rent / unit / month" suffix="R" value={rental.rentPerUnitPerMonth} onChange={(v) => setRental({ ...rental, rentPerUnitPerMonth: v })} />
                  <NumberField label="Operating cost / unit / mo" suffix="R" value={rental.operatingCostPerUnitPerMonth} onChange={(v) => setRental({ ...rental, operatingCostPerUnitPerMonth: v })} hint="Rates, services, mgmt, R&M" />
                  <NumberField label="Vacancy" suffix="%" value={rental.vacancyRatePct} onChange={(v) => setRental({ ...rental, vacancyRatePct: v })} />
                  <NumberField label="Exit cap rate" suffix="%" value={rental.exitCapRate} onChange={(v) => setRental({ ...rental, exitCapRate: v })} />
                  <NumberField label="Capital grant / unit" suffix="R" value={rental.capitalGrantPerUnit} onChange={(v) => setRental({ ...rental, capitalGrantPerUnit: v })} hint="SHRA / institutional subsidy (0 if none)" />
                  <NumberField label="SHRA rental ceiling" suffix="R" value={rental.rentalBandCeiling} onChange={(v) => setRental({ ...rental, rentalBandCeiling: v })} hint="Primary-market band ceiling" />
                  <NumberField label="Land cost" suffix="R" value={rental.landCost} onChange={(v) => setRental({ ...rental, landCost: v })} />
                  <NumberField label="Bulk services" suffix="R" value={rental.bulkServicesCost} onChange={(v) => setRental({ ...rental, bulkServicesCost: v })} />
                  <NumberField label="Internal services" suffix="R" value={rental.internalServicesCost} onChange={(v) => setRental({ ...rental, internalServicesCost: v })} />
                  <NumberField label="Construction cost" suffix="R" value={rental.constructionCost} onChange={(v) => setRental({ ...rental, constructionCost: v })} />
                  <NumberField label="Professional fees" suffix="R" value={rental.professionalFeesCost} onChange={(v) => setRental({ ...rental, professionalFeesCost: v })} />
                  <NumberField label="Statutory costs" suffix="R" value={rental.statutoryCost} onChange={(v) => setRental({ ...rental, statutoryCost: v })} />
                  <NumberField label="Finance costs" suffix="R" value={rental.financeCost} onChange={(v) => setRental({ ...rental, financeCost: v })} />
                  <NumberField label="Marketing & letting" suffix="R" value={rental.marketingCost} onChange={(v) => setRental({ ...rental, marketingCost: v })} />
                  <NumberField label="Contingency" suffix="%" value={rental.contingencyPercent} onChange={(v) => setRental({ ...rental, contingencyPercent: v })} />
                </div>
              )}
            </div>
          </div>

          {/* Results */}
          <div className="lg:col-span-2">
            <div className="sticky top-6 space-y-4">
              <div className="rounded-xl border border-gold-500/30 bg-gradient-to-br from-gold-500/10 to-navy-900/50 p-5">
                <h2 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gold-400">
                  <TrendingUp size={16} /> Profitability
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="Development profit" value={R(result.profit)} emphasis tone={profitTone} />
                  <Metric label="Profit on cost" value={pct(result.profitOnCost)} emphasis tone={profitTone} />
                  <Metric label="Total development cost" value={R(result.totalDevelopmentCost)} />
                  <Metric
                    label={isIncomeModel ? "Capitalised value (GDV)" : "Gross development value"}
                    value={R(result.grossDevelopmentValue)}
                  />
                  <Metric label="Profit on GDV" value={pct(result.profitOnGdv)} />
                  {isIncomeModel && result.stabilisedNOI !== undefined && (
                    <Metric label="Stabilised NOI (p.a.)" value={R(result.stabilisedNOI)} />
                  )}
                  {isIncomeModel && result.developmentYield !== undefined && (
                    <Metric label="Development yield" value={pct(result.developmentYield)} />
                  )}
                  {isIncomeModel && result.yieldSpread !== undefined && (
                    <Metric
                      label="Yield spread vs cap"
                      value={`${result.yieldSpread >= 0 ? "+" : ""}${result.yieldSpread.toFixed(2)}%`}
                      tone={result.yieldSpread > 0 ? "good" : "bad"}
                    />
                  )}
                  {result.capitalGrant !== undefined && result.capitalGrant > 0 && (
                    <Metric label="Capital grant applied" value={R(result.capitalGrant)} />
                  )}
                  {result.netCostAfterGrant !== undefined && result.capitalGrant! > 0 && (
                    <Metric label="Net cost after grant" value={R(result.netCostAfterGrant)} />
                  )}
                </div>
              </div>

              {result.rentWithinBand === false && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  <span>Pricing exceeds the affordability band — subsidy / FLISP eligibility is at risk.</span>
                </div>
              )}

              {result.notes.length > 0 && (
                <div className="rounded-lg border border-navy-800/70 bg-navy-900/40 p-4">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-400">
                    <Info size={14} /> Analyst notes
                  </p>
                  <ul className="space-y-2">
                    {result.notes.map((n, i) => (
                      <li key={i} className="text-xs leading-snug text-gray-400">
                        • {n}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <p className="px-1 text-[11px] leading-snug text-gray-600">
                Indicative feasibility model for due-diligence and investment decisions. Not a formal
                valuation or financial advice. Confirm all figures with the project appraisal before committing capital.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
