import { useMemo } from "react";

type FormData = {
  purchasePrice: number;
  afterRepairValue: number;
  renovationCost: number;
  holdingCosts: number;
  closingCosts: number;
  realtorFees: number;
  financingCosts: number;
  inspectionCosts: number;
  insuranceCosts: number;
  utilityCosts: number;
  holdingPeriodMonths: number;
  monthlyMortgagePayment: number;
  monthlyPropertyTax: number;
  monthlyInsurance: number;
};

type FlipFormSectionProps = {
  data: FormData;
  onChange: (field: keyof FormData, value: number) => void;
};

const INPUT_CLASS =
  "w-full rounded-md border border-navy-700 bg-navy-800/50 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";
const LABEL_CLASS = "block text-sm font-medium text-gray-600 mb-1";

const fields: { key: keyof FormData; label: string }[] = [
  { key: "purchasePrice", label: "Purchase Price" },
  { key: "afterRepairValue", label: "After Repair Value" },
  { key: "renovationCost", label: "Renovation Cost" },
  { key: "holdingCosts", label: "Holding Costs" },
  { key: "closingCosts", label: "Closing Costs" },
  { key: "realtorFees", label: "Realtor Fees" },
  { key: "financingCosts", label: "Financing Costs" },
  { key: "inspectionCosts", label: "Inspection Costs" },
  { key: "insuranceCosts", label: "Insurance Costs" },
  { key: "utilityCosts", label: "Utility Costs" },
  { key: "holdingPeriodMonths", label: "Holding Period (months)" },
  { key: "monthlyMortgagePayment", label: "Monthly Mortgage Payment" },
  { key: "monthlyPropertyTax", label: "Monthly Property Tax" },
  { key: "monthlyInsurance", label: "Monthly Insurance" },
];

function useFlipCalculations(data: FormData) {
  return useMemo(() => {
    const totalInvestment =
      data.purchasePrice +
      data.renovationCost +
      data.holdingCosts +
      data.closingCosts +
      data.realtorFees +
      data.financingCosts +
      data.inspectionCosts +
      data.insuranceCosts +
      data.utilityCosts +
      data.monthlyMortgagePayment * data.holdingPeriodMonths +
      data.monthlyPropertyTax * data.holdingPeriodMonths +
      data.monthlyInsurance * data.holdingPeriodMonths;

    const profit = data.afterRepairValue - totalInvestment;
    const roi = totalInvestment > 0 ? (profit / totalInvestment) * 100 : 0;
    const profitMargin =
      data.afterRepairValue > 0
        ? (profit / data.afterRepairValue) * 100
        : 0;

    return { totalInvestment, profit, roi, profitMargin };
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

export function FlipFormSection({ data, onChange }: FlipFormSectionProps) {
  const metrics = useFlipCalculations(data);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gold-600">
        Flip Analysis Inputs
      </h3>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {fields.map(({ key, label }) => (
          <div key={key}>
            <label htmlFor={key} className={LABEL_CLASS}>
              {label}
            </label>
            <input
              id={key}
              type="number"
              className={INPUT_CLASS}
              value={data[key]}
              onChange={(e) => onChange(key, parseFloat(e.target.value) || 0)}
              placeholder="0"
            />
          </div>
        ))}
      </div>

      {/* Calculated Results */}
      <div className="mt-6 rounded-lg border border-navy-700 bg-navy-900/60 p-5">
        <h4 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gold-600">
          Calculated Results
        </h4>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <p className="text-xs text-gray-500">Total Investment</p>
            <p className="text-lg font-bold text-gray-900">
              {fmt(metrics.totalInvestment)}
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
            <p className="text-xs text-gray-500">ROI</p>
            <p
              className={`text-lg font-bold ${metrics.roi >= 0 ? "text-emerald-600" : "text-red-600"}`}
            >
              {metrics.roi.toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Profit Margin</p>
            <p
              className={`text-lg font-bold ${metrics.profitMargin >= 0 ? "text-emerald-600" : "text-red-600"}`}
            >
              {metrics.profitMargin.toFixed(2)}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
