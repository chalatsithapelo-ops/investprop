import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

type FormData = {
  siteAcquisitionCost: number;
  constructionCostPerUnit: number;
  numberOfUnits: number;
  sellingPricePerUnit: number;
  architectFees: number;
  engineerFees: number;
  projectManagementFees: number;
  legalAndPermitCosts: number;
  marketingCosts: number;
  contingencyPercentage: number;
  financingCosts: number;
  landClearingCost: number;
  infrastructureCost: number;
  landscapingCost: number;
  constructionDurationMonths: number;
  holdingCostsPerMonth: number;
  salesCommissionRate: number;
  transferDutyCost: number;
  municipalContributions: number;
  environmentalImpactCost: number;
  constructionInsurance: number;
  performanceGuarantee: number;
  developmentLevies: number;
  bulkServicesCost: number;
  buildingPlanApproval: number;
};

type DevelopmentFormSectionProps = {
  data: FormData;
  onChange: (field: keyof FormData, value: number) => void;
};

const INPUT_CLASS =
  "w-full rounded-md border border-navy-700 bg-navy-800/50 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";
const LABEL_CLASS = "block text-sm font-medium text-gray-600 mb-1";

const fields: { key: keyof FormData; label: string }[] = [
  { key: "siteAcquisitionCost", label: "Site Acquisition Cost" },
  { key: "constructionCostPerUnit", label: "Construction Cost per Unit" },
  { key: "numberOfUnits", label: "Number of Units" },
  { key: "sellingPricePerUnit", label: "Selling Price per Unit" },
  { key: "architectFees", label: "Architect Fees" },
  { key: "engineerFees", label: "Engineer Fees" },
  { key: "projectManagementFees", label: "Project Management Fees" },
  { key: "legalAndPermitCosts", label: "Legal & Permit Costs" },
  { key: "marketingCosts", label: "Marketing Costs" },
  { key: "contingencyPercentage", label: "Contingency (%)" },
  { key: "financingCosts", label: "Financing Costs" },
  { key: "landClearingCost", label: "Land Clearing Cost" },
  { key: "infrastructureCost", label: "Infrastructure Cost" },
  { key: "landscapingCost", label: "Landscaping Cost" },
  { key: "constructionDurationMonths", label: "Construction Duration (months)" },
  { key: "holdingCostsPerMonth", label: "Holding Costs per Month" },
  { key: "salesCommissionRate", label: "Sales Commission Rate (%)" },
  { key: "transferDutyCost", label: "Transfer Duty Cost" },
  { key: "municipalContributions", label: "Municipal Contributions" },
  { key: "environmentalImpactCost", label: "Environmental Impact Cost" },
  { key: "constructionInsurance", label: "Construction Insurance" },
  { key: "performanceGuarantee", label: "Performance Guarantee" },
  { key: "developmentLevies", label: "Development Levies" },
  { key: "bulkServicesCost", label: "Bulk Services Cost" },
  { key: "buildingPlanApproval", label: "Building Plan Approval" },
];

// Group the 25 inputs into logical accordion sections so the form is
// scannable instead of one long wall of fields.
const fieldGroups: { title: string; keys: (keyof FormData)[] }[] = [
  {
    title: "Land & Site",
    keys: [
      "siteAcquisitionCost",
      "landClearingCost",
      "infrastructureCost",
      "landscapingCost",
      "bulkServicesCost",
    ],
  },
  {
    title: "Construction",
    keys: [
      "constructionCostPerUnit",
      "numberOfUnits",
      "constructionDurationMonths",
      "constructionInsurance",
    ],
  },
  {
    title: "Professional Fees",
    keys: [
      "architectFees",
      "engineerFees",
      "projectManagementFees",
      "legalAndPermitCosts",
    ],
  },
  {
    title: "Statutory & Approvals",
    keys: [
      "transferDutyCost",
      "municipalContributions",
      "environmentalImpactCost",
      "developmentLevies",
      "buildingPlanApproval",
      "performanceGuarantee",
    ],
  },
  {
    title: "Holding, Finance & Sale",
    keys: [
      "financingCosts",
      "holdingCostsPerMonth",
      "marketingCosts",
      "salesCommissionRate",
      "sellingPricePerUnit",
      "contingencyPercentage",
    ],
  },
];

const fieldLabels: Record<keyof FormData, string> = fields.reduce(
  (acc, f) => {
    acc[f.key] = f.label;
    return acc;
  },
  {} as Record<keyof FormData, string>,
);

function useDevelopmentCalculations(data: FormData) {
  return useMemo(() => {
    const constructionCost =
      data.constructionCostPerUnit * data.numberOfUnits;

    const holdingCosts =
      data.holdingCostsPerMonth * data.constructionDurationMonths;

    const baseCost =
      data.siteAcquisitionCost +
      constructionCost +
      data.architectFees +
      data.engineerFees +
      data.projectManagementFees +
      data.legalAndPermitCosts +
      data.marketingCosts +
      data.financingCosts +
      data.landClearingCost +
      data.infrastructureCost +
      data.landscapingCost +
      holdingCosts +
      data.transferDutyCost +
      data.municipalContributions +
      data.environmentalImpactCost +
      data.constructionInsurance +
      data.performanceGuarantee +
      data.developmentLevies +
      data.bulkServicesCost +
      data.buildingPlanApproval;

    const contingency = baseCost * (data.contingencyPercentage / 100);
    const totalCost = baseCost + contingency;

    const gdv = data.sellingPricePerUnit * data.numberOfUnits;
    const salesCommission = gdv * (data.salesCommissionRate / 100);
    const profit = gdv - totalCost - salesCommission;
    const developmentROI =
      totalCost > 0 ? (profit / totalCost) * 100 : 0;

    return { totalCost, gdv, profit, developmentROI };
  }, [data]);
}

function fmt(value: number) {
  return value.toLocaleString("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

export function DevelopmentFormSection({
  data,
  onChange,
}: DevelopmentFormSectionProps) {
  const metrics = useDevelopmentCalculations(data);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    fieldGroups.reduce(
      (acc, g, i) => {
        acc[g.title] = i === 0; // first group expanded by default
        return acc;
      },
      {} as Record<string, boolean>,
    ),
  );

  const toggleGroup = (title: string) =>
    setOpenGroups((prev) => ({ ...prev, [title]: !prev[title] }));

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gold-600">
        Development Analysis Inputs
      </h3>

      <div className="space-y-3">
        {fieldGroups.map((group) => {
          const isOpen = openGroups[group.title];
          return (
            <div
              key={group.title}
              className="overflow-hidden rounded-lg border border-navy-700"
            >
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
                  {group.keys.map((key) => (
                    <div key={key}>
                      <label htmlFor={key} className={LABEL_CLASS}>
                        {fieldLabels[key]}
                      </label>
                      <input
                        id={key}
                        type="number"
                        className={INPUT_CLASS}
                        value={data[key]}
                        onChange={(e) =>
                          onChange(key, parseFloat(e.target.value) || 0)
                        }
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Calculated Results */}
      <div className="mt-6 rounded-lg border border-navy-700 bg-navy-900/60 p-5">
        <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gold-600">
          Calculated Results
        </h4>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs text-gray-500">Total Cost</p>
            <p className="text-lg font-bold text-gray-900">
              {fmt(metrics.totalCost)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">GDV</p>
            <p className="text-lg font-bold text-gray-900">
              {fmt(metrics.gdv)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Profit</p>
            <p
              className={`text-lg font-bold ${metrics.profit >= 0 ? "text-emerald-600" : "text-red-600"}`}
            >
              {fmt(metrics.profit)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Development ROI</p>
            <p
              className={`text-lg font-bold ${metrics.developmentROI >= 0 ? "text-emerald-600" : "text-red-600"}`}
            >
              {metrics.developmentROI.toFixed(2)}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
