import { useMemo } from "react";
import { calculateRentalMetrics, type RentalPropertyInput } from "../financial-calculations";

type FormData = {
  monthlyRent: number;
  propertyPrice: number;
  vacancyRate: number;
  propertyManagement: number;
  maintenanceReserve: number;
  propertyTaxMonthly: number;
  insuranceMonthly: number;
  mortgage: number;
  annualAppreciation: number;
  closingCosts: number;
  downPayment: number;
  loanInterestRate: number;
  loanTermYears: number;
  monthlyHOA: number;
  otherMonthlyExpenses: number;
  annualRentIncrease: number;
  capitalExpenditureReserve: number;
  leaseTermMonths: number;
  turnoverCostPerVacancy: number;
  marketingCost: number;
  legalFees: number;
  accountingFees: number;
  miscExpenses: number;
};

type RentalFormSectionProps = {
  data: FormData;
  onChange: (field: keyof FormData, value: number) => void;
};

const INPUT_CLASS =
  "w-full rounded-md border border-navy-700 bg-navy-800/50 px-3 py-2 text-gray-900 placeholder-gray-500 focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500";
const LABEL_CLASS = "block text-sm font-medium text-gray-600 mb-1";

const fields: { key: keyof FormData; label: string }[] = [
  { key: "monthlyRent", label: "Monthly Rent" },
  { key: "propertyPrice", label: "Property Price" },
  { key: "vacancyRate", label: "Vacancy Rate (%)" },
  { key: "propertyManagement", label: "Property Management" },
  { key: "maintenanceReserve", label: "Maintenance Reserve" },
  { key: "propertyTaxMonthly", label: "Property Tax (monthly)" },
  { key: "insuranceMonthly", label: "Insurance (monthly)" },
  { key: "mortgage", label: "Mortgage (monthly)" },
  { key: "annualAppreciation", label: "Annual Appreciation (%)" },
  { key: "closingCosts", label: "Closing Costs" },
  { key: "downPayment", label: "Down Payment" },
  { key: "loanInterestRate", label: "Loan Interest Rate (%)" },
  { key: "loanTermYears", label: "Loan Term (years)" },
  { key: "monthlyHOA", label: "Monthly HOA" },
  { key: "otherMonthlyExpenses", label: "Other Monthly Expenses" },
  { key: "annualRentIncrease", label: "Annual Rent Increase (%)" },
  { key: "capitalExpenditureReserve", label: "Capital Expenditure Reserve" },
  { key: "leaseTermMonths", label: "Lease Term (months)" },
  { key: "turnoverCostPerVacancy", label: "Turnover Cost per Vacancy" },
  { key: "marketingCost", label: "Marketing Cost" },
  { key: "legalFees", label: "Legal Fees" },
  { key: "accountingFees", label: "Accounting Fees" },
  { key: "miscExpenses", label: "Misc Expenses" },
];

function useRentalCalculations(data: FormData) {
  return useMemo(() => {
    // Route through the shared engine so this form and the investor page agree.
    // Form fields that have no dedicated engine slot (capex reserve and the annual
    // marketing/legal/accounting/misc costs) are folded into the monthly "utilities"
    // bucket as a monthly-equivalent so they are still captured in NOI exactly once.
    const extraMonthlyEquivalent =
      data.otherMonthlyExpenses +
      data.capitalExpenditureReserve +
      (data.marketingCost + data.legalFees + data.accountingFees + data.miscExpenses) / 12;

    const input: RentalPropertyInput = {
      purchasePrice: data.propertyPrice,
      monthlyRent: data.monthlyRent,
      annualPropertyTax: data.propertyTaxMonthly * 12,
      annualInsurance: data.insuranceMonthly * 12,
      monthlyHOAFees: data.monthlyHOA,
      monthlyMaintenanceReserve: data.maintenanceReserve,
      monthlyUtilities: extraMonthlyEquivalent,
      monthlyManagementFee: data.propertyManagement,
      vacancyRate: data.vacancyRate,
      appreciationRate: data.annualAppreciation,
      capRate: 0,
      cashOnCashReturn: 0,
      grossRentMultiplier: 0,
      debtServiceCoverageRatio: 0,
      grossYield: 0,
      netYield: 0,
      downPaymentAmount: data.downPayment,
      loanAmount: 0,
      interestRate: data.loanInterestRate,
      loanTermYears: data.loanTermYears,
      monthlyDebtService: data.mortgage,
      totalInvestmentBudget: 0,
      spentInvestmentBudget: 0,
      closingCosts: data.closingCosts,
    };

    const calc = calculateRentalMetrics(input);
    return {
      noi: calc.noi,
      capRate: calc.calculatedCapRate,
      monthlyCashFlow: calc.monthlyCashFlow,
      cashOnCashReturn: calc.cashOnCashReturn,
    };
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

export function RentalFormSection({ data, onChange }: RentalFormSectionProps) {
  const metrics = useRentalCalculations(data);

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gold-600">
        Rental Analysis Inputs
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
            <p className="text-xs text-gray-500">NOI</p>
            <p
              className={`text-lg font-bold ${metrics.noi >= 0 ? "text-emerald-600" : "text-red-600"}`}
            >
              {fmt(metrics.noi)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Cap Rate</p>
            <p className="text-lg font-bold text-gray-900">
              {metrics.capRate.toFixed(2)}%
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Cash Flow (monthly)</p>
            <p
              className={`text-lg font-bold ${metrics.monthlyCashFlow >= 0 ? "text-emerald-600" : "text-red-600"}`}
            >
              {fmt(metrics.monthlyCashFlow)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Cash-on-Cash Return</p>
            <p
              className={`text-lg font-bold ${metrics.cashOnCashReturn >= 0 ? "text-emerald-600" : "text-red-600"}`}
            >
              {metrics.cashOnCashReturn.toFixed(2)}%
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
