import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { calculateDevelopmentMetrics, type PropertyDevelopmentInput } from "../financial-calculations";

export type DevelopmentType = "AFFORDABLE_RESALE" | "AFFORDABLE_RENTAL" | "COMMERCIAL_RENTAL";

// A single, type-aware development input model. Not every field is used by every
// development type — the form shows only the relevant ones and the payload mapper
// (in PropertyForm) feeds the shared financial engine the correct cost buckets.
export type DevelopmentFormData = {
  developmentType: DevelopmentType;

  // ── Land & site (all types) ──
  siteAcquisitionCost: number;
  landClearingCost: number;
  infrastructureCost: number;
  landscapingCost: number;
  bulkServicesCost: number;

  // ── Construction & area ──
  numberOfUnits: number; // resale / rental
  avgUnitSizeSqm: number; // resale / rental
  constructionCostPerUnit: number; // resale / rental
  grossLettableAreaSqm: number; // commercial GLA
  constructionCostPerSqm: number; // commercial build cost / m²
  constructionDurationMonths: number;
  constructionInsurance: number;

  // ── Professional fees (all) ──
  architectFees: number;
  engineerFees: number;
  townPlanningFees: number;
  projectManagementFees: number;
  legalAndPermitCosts: number;

  // ── Statutory & approvals ──
  buildingPlanApproval: number;
  municipalContributions: number;
  developmentLevies: number;
  environmentalImpactCost: number;
  nhbrcEnrolment: number; // residential (resale / rental)
  performanceGuarantee: number;
  transferDutyCost: number; // resale only

  // ── Finance & capital stack (all) ──
  equityAmount: number;
  seniorDebtAmount: number;
  seniorDebtRate: number; // annual %
  financingCosts: number; // raising / arrangement fees
  holdingCostsPerMonth: number;
  contingencyPercentage: number;
  vatApplicable: boolean;

  // ── Resale revenue ──
  sellingPricePerUnit: number;
  preSaleUnits: number;
  preSaleThresholdPercent: number;
  salesCommissionRate: number; // %
  marketingCosts: number;

  // ── Rental revenue (affordable rental) ──
  monthlyRentPerUnit: number;
  vacancyRatePct: number;
  annualOperatingExpenses: number;
  exitCapRatePct: number; // market / exit cap rate used to value the stabilised asset

  // ── Commercial revenue (shopping centre) ──
  rentPerSqmPerMonth: number;
  operatingCostPerSqmPerMonth: number;
  recoveryRatePct: number; // % of operating costs recovered from tenants
};

type DevelopmentFormSectionProps = {
  data: DevelopmentFormData;
  onChange: (field: keyof DevelopmentFormData, value: number | string | boolean) => void;
};

const INPUT_CLASS =
  "w-full rounded-md border border-navy-700 bg-navy-800/50 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";
const LABEL_CLASS = "block text-sm font-medium text-gray-600 mb-1";

type FieldKind = "money" | "number" | "percent" | "area" | "months";

type FieldDef = {
  key: keyof DevelopmentFormData;
  label: string;
  kind?: FieldKind;
  hint?: string;
};

type Group = {
  title: string;
  fields: FieldDef[];
};

const groups: Group[] = [
  {
    title: "Land & Site",
    fields: [
      { key: "siteAcquisitionCost", label: "Site / Land Acquisition (R)", kind: "money" },
      { key: "landClearingCost", label: "Land Clearing & Earthworks (R)", kind: "money" },
      { key: "infrastructureCost", label: "Internal Services / Infrastructure (R)", kind: "money" },
      { key: "bulkServicesCost", label: "Bulk Services Contribution (R)", kind: "money" },
      { key: "landscapingCost", label: "Landscaping & External Works (R)", kind: "money" },
    ],
  },
  {
    title: "Construction & Area",
    fields: [
      { key: "numberOfUnits", label: "Number of Units", kind: "number", hint: "Saleable / rentable units" },
      { key: "avgUnitSizeSqm", label: "Average Unit Size (m²)", kind: "area" },
      { key: "constructionCostPerUnit", label: "Construction Cost per Unit (R)", kind: "money" },
      { key: "grossLettableAreaSqm", label: "Gross Lettable Area — GLA (m²)", kind: "area" },
      { key: "constructionCostPerSqm", label: "Construction Cost per m² (R)", kind: "money" },
      { key: "constructionDurationMonths", label: "Construction Duration (months)", kind: "months" },
      { key: "constructionInsurance", label: "Construction / CAR Insurance (R)", kind: "money" },
    ],
  },
  {
    title: "Professional Fees",
    fields: [
      { key: "architectFees", label: "Architect Fees (R)", kind: "money" },
      { key: "engineerFees", label: "Engineering Fees (civil/structural) (R)", kind: "money" },
      { key: "townPlanningFees", label: "Town Planning & Surveyor (R)", kind: "money" },
      { key: "projectManagementFees", label: "Project & Development Management (R)", kind: "money" },
      { key: "legalAndPermitCosts", label: "Legal, Conveyancing & Permits (R)", kind: "money" },
    ],
  },
  {
    title: "Statutory & Approvals",
    fields: [
      { key: "buildingPlanApproval", label: "Building Plan Approval (R)", kind: "money" },
      { key: "municipalContributions", label: "Municipal / Engineering Contributions (R)", kind: "money" },
      { key: "developmentLevies", label: "Development Levies (R)", kind: "money" },
      { key: "environmentalImpactCost", label: "Environmental (EIA) & Geotech (R)", kind: "money" },
      { key: "nhbrcEnrolment", label: "NHBRC Enrolment (R)", kind: "money", hint: "Residential warranty" },
      { key: "performanceGuarantee", label: "Performance Guarantees (R)", kind: "money" },
      { key: "transferDutyCost", label: "Transfer Duty on Land (R)", kind: "money" },
    ],
  },
  {
    title: "Finance & Capital Stack",
    fields: [
      { key: "equityAmount", label: "Equity Contribution (R)", kind: "money" },
      { key: "seniorDebtAmount", label: "Senior Debt / Facility (R)", kind: "money" },
      { key: "seniorDebtRate", label: "Debt Interest Rate (% p.a.)", kind: "percent" },
      { key: "financingCosts", label: "Raising / Arrangement Fees (R)", kind: "money" },
      { key: "holdingCostsPerMonth", label: "Holding Costs per Month (R)", kind: "money" },
      { key: "contingencyPercentage", label: "Contingency (% of costs)", kind: "percent" },
    ],
  },
];

// Revenue groups are rendered per development type.
const resaleRevenue: FieldDef[] = [
  { key: "sellingPricePerUnit", label: "Selling Price per Unit (R)", kind: "money" },
  { key: "preSaleUnits", label: "Pre-sold Units", kind: "number" },
  { key: "preSaleThresholdPercent", label: "Pre-sale Threshold to Draw Debt (%)", kind: "percent" },
  { key: "salesCommissionRate", label: "Sales Commission (% of GDV)", kind: "percent" },
  { key: "marketingCosts", label: "Marketing & Show House (R)", kind: "money" },
];

const rentalRevenue: FieldDef[] = [
  { key: "monthlyRentPerUnit", label: "Monthly Rent per Unit (R)", kind: "money" },
  { key: "vacancyRatePct", label: "Vacancy & Bad Debt (%)", kind: "percent" },
  { key: "annualOperatingExpenses", label: "Annual Operating Expenses (R)", kind: "money" },
  { key: "exitCapRatePct", label: "Market / Exit Cap Rate (%)", kind: "percent", hint: "Used to value the stabilised asset" },
  { key: "marketingCosts", label: "Letting & Marketing (R)", kind: "money" },
];

const commercialRevenue: FieldDef[] = [
  { key: "rentPerSqmPerMonth", label: "Average Rent per m² / month (R)", kind: "money" },
  { key: "vacancyRatePct", label: "Vacancy & Bad Debt (%)", kind: "percent" },
  { key: "operatingCostPerSqmPerMonth", label: "Operating Cost per m² / month (R)", kind: "money" },
  { key: "recoveryRatePct", label: "Operating Cost Recovery from Tenants (%)", kind: "percent" },
  { key: "exitCapRatePct", label: "Market / Exit Cap Rate (%)", kind: "percent", hint: "Used to value the stabilised asset" },
  { key: "marketingCosts", label: "Leasing & Marketing (R)", kind: "money" },
];

// Fields hidden for a given development type (keeps each form lean + relevant).
const hiddenByType: Record<DevelopmentType, (keyof DevelopmentFormData)[]> = {
  AFFORDABLE_RESALE: ["grossLettableAreaSqm", "constructionCostPerSqm"],
  AFFORDABLE_RENTAL: ["grossLettableAreaSqm", "constructionCostPerSqm", "transferDutyCost"],
  COMMERCIAL_RENTAL: [
    "numberOfUnits",
    "avgUnitSizeSqm",
    "constructionCostPerUnit",
    "nhbrcEnrolment",
    "transferDutyCost",
  ],
};

// ── Shared cost + revenue derivation (mirrored exactly by the backend) ──
export function buildDevelopmentEngineInput(d: DevelopmentFormData): PropertyDevelopmentInput {
  const isCommercial = d.developmentType === "COMMERCIAL_RENTAL";

  const landAcquisitionCost =
    d.siteAcquisitionCost + d.landClearingCost + d.infrastructureCost + d.landscapingCost + d.bulkServicesCost;

  const builtArea = isCommercial ? d.grossLettableAreaSqm : d.numberOfUnits * d.avgUnitSizeSqm;

  const constructionBase = isCommercial
    ? d.constructionCostPerSqm * d.grossLettableAreaSqm
    : d.constructionCostPerUnit * d.numberOfUnits;

  const hardCosts =
    constructionBase + d.constructionInsurance + d.holdingCostsPerMonth * d.constructionDurationMonths;

  const gdvForResale = d.sellingPricePerUnit * d.numberOfUnits;
  const salesCommission =
    d.developmentType === "AFFORDABLE_RESALE" ? gdvForResale * (d.salesCommissionRate / 100) : 0;

  const softCosts =
    d.architectFees +
    d.engineerFees +
    d.townPlanningFees +
    d.projectManagementFees +
    d.legalAndPermitCosts +
    d.buildingPlanApproval +
    d.municipalContributions +
    d.developmentLevies +
    d.environmentalImpactCost +
    d.nhbrcEnrolment +
    d.performanceGuarantee +
    d.marketingCosts +
    d.transferDutyCost +
    salesCommission;

  // Income + expense figures per type, fed to the engine as a single "unit".
  let incomeUnits = d.numberOfUnits;
  let monthlyRentPerUnit = 0;
  let annualOperatingExpenses = 0;

  if (d.developmentType === "AFFORDABLE_RENTAL") {
    incomeUnits = d.numberOfUnits;
    monthlyRentPerUnit = d.monthlyRentPerUnit;
    const annualGross = d.numberOfUnits * d.monthlyRentPerUnit * 12;
    const vacancyLoss = annualGross * (d.vacancyRatePct / 100);
    annualOperatingExpenses = d.annualOperatingExpenses + vacancyLoss;
  } else if (d.developmentType === "COMMERCIAL_RENTAL") {
    const annualGross = d.grossLettableAreaSqm * d.rentPerSqmPerMonth * 12;
    const vacancyLoss = annualGross * (d.vacancyRatePct / 100);
    const grossOpex = d.grossLettableAreaSqm * d.operatingCostPerSqmPerMonth * 12;
    const unrecoveredOpex = grossOpex * (1 - d.recoveryRatePct / 100);
    incomeUnits = 1; // the centre is a single income-producing asset
    monthlyRentPerUnit = annualGross / 12;
    annualOperatingExpenses = unrecoveredOpex + vacancyLoss;
  }

  return {
    developmentType: d.developmentType,
    landAcquisitionCost,
    hardCosts,
    softCosts,
    financingCosts: d.financingCosts,
    contingencyPercent: d.contingencyPercentage,
    contingencyAmount: 0,
    expectedSalePricePerUnit: d.sellingPricePerUnit,
    totalExpectedRevenue: gdvForResale,
    expectedProfit: 0,
    expectedMonthlyRentPerUnit: monthlyRentPerUnit,
    annualOperatingExpenses,
    stabilizedCapRate: d.exitCapRatePct,
    expectedGrossYield: 0,
    expectedNetYield: 0,
    expectedROI: 0,
    expectedIRR: 0,
    developmentTimelineMonths: d.constructionDurationMonths,
    preSaleUnits: d.preSaleUnits,
    costPerSquareMeter: 0,
    totalSquareMeters: builtArea,
    numberOfUnits: incomeUnits,
    totalBudget: 0,
  };
}

function useDevelopmentProjections(d: DevelopmentFormData) {
  return useMemo(() => {
    const input = buildDevelopmentEngineInput(d);
    const calc = calculateDevelopmentMetrics(input);
    const totalCost = calc.totalCosts;
    const builtArea = input.totalSquareMeters;
    const costPerSqm = builtArea > 0 ? totalCost / builtArea : 0;
    const ltc = totalCost > 0 ? (d.seniorDebtAmount / totalCost) * 100 : 0;

    if (d.developmentType === "AFFORDABLE_RESALE") {
      const gdv = calc.grossDevelopmentValue ?? 0;
      const profit = calc.derivedProfit ?? 0;
      return {
        mode: "resale" as const,
        totalCost,
        costPerSqm,
        ltc,
        gdv,
        profit,
        profitOnCost: totalCost > 0 ? (profit / totalCost) * 100 : 0,
        marginOnGdv: calc.profitMargin,
        preSalePct: calc.preSalePercentage,
      };
    }

    // Rental / commercial — value the stabilised asset on the exit cap rate.
    const noi = calc.noi ?? 0;
    const exitCap = d.exitCapRatePct;
    const stabilisedValue = exitCap > 0 ? noi / (exitCap / 100) : 0;
    const profit = stabilisedValue - totalCost;
    return {
      mode: "rental" as const,
      totalCost,
      costPerSqm,
      ltc,
      annualGrossIncome: calc.annualGrossRentalIncome ?? 0,
      noi,
      yieldOnCost: calc.calculatedNetYield ?? 0,
      stabilisedValue,
      profit,
      profitOnCost: totalCost > 0 ? (profit / totalCost) * 100 : 0,
    };
  }, [d]);
}

function fmt(value: number) {
  return value.toLocaleString("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function pct(value: number) {
  return `${value.toFixed(1)}%`;
}

const TYPE_OPTIONS: { value: DevelopmentType; title: string; blurb: string }[] = [
  { value: "AFFORDABLE_RESALE", title: "Affordable Resale", blurb: "Build units to sell — profit on GDV" },
  { value: "AFFORDABLE_RENTAL", title: "Affordable Rental", blurb: "Build to hold — income & yield" },
  { value: "COMMERCIAL_RENTAL", title: "Shopping Centre", blurb: "Retail / commercial — rent per m²" },
];

function FieldInput({
  def,
  data,
  onChange,
}: {
  def: FieldDef;
  data: DevelopmentFormData;
  onChange: DevelopmentFormSectionProps["onChange"];
}) {
  const raw = data[def.key];
  const value = typeof raw === "number" ? raw : 0;
  return (
    <div>
      <label htmlFor={def.key} className={LABEL_CLASS}>
        {def.label}
      </label>
      <input
        id={def.key}
        type="number"
        className={INPUT_CLASS}
        value={value || ""}
        onChange={(e) => onChange(def.key, parseFloat(e.target.value) || 0)}
        placeholder="0"
      />
      {def.hint && <p className="mt-1 text-xs text-gray-500">{def.hint}</p>}
    </div>
  );
}

function Metric({ label, value, positive }: { label: string; value: string; positive?: number }) {
  const color =
    positive === undefined ? "text-gray-900" : positive >= 0 ? "text-emerald-600" : "text-red-600";
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  );
}

export function DevelopmentFormSection({ data, onChange }: DevelopmentFormSectionProps) {
  const projections = useDevelopmentProjections(data);
  const hidden = hiddenByType[data.developmentType];

  const revenueFields =
    data.developmentType === "AFFORDABLE_RESALE"
      ? resaleRevenue
      : data.developmentType === "AFFORDABLE_RENTAL"
        ? rentalRevenue
        : commercialRevenue;

  const revenueTitle =
    data.developmentType === "AFFORDABLE_RESALE"
      ? "Sales & Revenue"
      : data.developmentType === "COMMERCIAL_RENTAL"
        ? "Letting & Income"
        : "Rental Income";

  const allGroups: Group[] = [...groups, { title: revenueTitle, fields: revenueFields }];

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    allGroups.reduce(
      (acc, g, i) => {
        acc[g.title] = i === 0;
        return acc;
      },
      {} as Record<string, boolean>,
    ),
  );

  const toggleGroup = (title: string) => setOpenGroups((prev) => ({ ...prev, [title]: !prev[title] }));

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gold-600">Development Analysis Inputs</h3>

      {/* Development type selector — drives which inputs & projections apply. */}
      <div>
        <label className={LABEL_CLASS}>Development Type</label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {TYPE_OPTIONS.map((opt) => {
            const active = data.developmentType === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange("developmentType", opt.value)}
                className={`rounded-lg border p-3 text-left transition ${
                  active
                    ? "border-gold-500 bg-gold-500/10 ring-1 ring-gold-500"
                    : "border-navy-700 bg-navy-900/40 hover:border-gold-300"
                }`}
              >
                <p className={`text-sm font-semibold ${active ? "text-gold-600" : "text-gray-900"}`}>{opt.title}</p>
                <p className="mt-0.5 text-xs text-gray-500">{opt.blurb}</p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        {allGroups.map((group) => {
          const visibleFields = group.fields.filter((f) => !hidden.includes(f.key));
          if (visibleFields.length === 0) return null;
          const isOpen = openGroups[group.title];
          return (
            <div key={group.title} className="overflow-hidden rounded-lg border border-navy-700">
              <button
                type="button"
                onClick={() => toggleGroup(group.title)}
                aria-expanded={isOpen}
                className="flex w-full items-center justify-between bg-navy-900/40 px-4 py-3 text-left text-sm font-semibold text-gray-700 hover:bg-navy-900/60"
              >
                <span>{group.title}</span>
                <ChevronDown
                  size={18}
                  className={`text-gold-600 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isOpen && (
                <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
                  {visibleFields.map((def) => (
                    <FieldInput key={def.key} def={def} data={data} onChange={onChange} />
                  ))}
                  {group.title === "Finance & Capital Stack" && (
                    <label className="flex items-center gap-2 pt-6 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-navy-700 text-gold-500 focus:ring-gold-500"
                        checked={data.vatApplicable}
                        onChange={(e) => onChange("vatApplicable", e.target.checked)}
                      />
                      VAT-vendor sale (15% VAT instead of transfer duty)
                    </label>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Calculated projections — type-aware. */}
      <div className="mt-6 rounded-lg border border-navy-700 bg-navy-900/60 p-5">
        <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gold-600">
          Projected Feasibility
        </h4>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Metric label="Total Development Cost" value={fmt(projections.totalCost)} />
          <Metric label="Cost per m²" value={fmt(projections.costPerSqm)} />
          <Metric label="Loan-to-Cost" value={pct(projections.ltc)} />
          {projections.mode === "resale" ? (
            <>
              <Metric label="Gross Development Value" value={fmt(projections.gdv)} />
              <Metric label="Development Profit" value={fmt(projections.profit)} positive={projections.profit} />
              <Metric label="Profit on Cost" value={pct(projections.profitOnCost)} positive={projections.profitOnCost} />
              <Metric label="Margin on GDV" value={pct(projections.marginOnGdv)} positive={projections.marginOnGdv} />
              <Metric label="Pre-sale Cover" value={pct(projections.preSalePct)} />
            </>
          ) : (
            <>
              <Metric label="Annual Gross Income" value={fmt(projections.annualGrossIncome)} />
              <Metric label="Net Operating Income" value={fmt(projections.noi)} />
              <Metric label="Yield on Cost" value={pct(projections.yieldOnCost)} />
              <Metric label="Stabilised Value" value={fmt(projections.stabilisedValue)} />
              <Metric label="Development Profit" value={fmt(projections.profit)} positive={projections.profit} />
              <Metric label="Profit on Cost" value={pct(projections.profitOnCost)} positive={projections.profitOnCost} />
            </>
          )}
        </div>
        <p className="mt-4 text-xs text-gray-500">
          Figures are indicative and computed live from the shared financial engine. Rental and commercial values are
          capitalised on the market / exit cap rate; IRR, peak funding, rolled-up interest and VAT are finalised on save.
        </p>
      </div>
    </div>
  );
}
