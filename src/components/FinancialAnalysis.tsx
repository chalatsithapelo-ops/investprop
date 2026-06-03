import { useState } from "react";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  BarChart,
  PieChart,
  Building,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import {
  calculateRentalMetrics,
  type RentalPropertyInput,
} from "~/financial-calculations";

function fmt(n: number): string {
  return n.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(n: number): string {
  return n.toFixed(2) + "%";
}

export function FinancialAnalysis({ propertyId }: { propertyId: number }) {
  const trpc = useTRPC();
  const authToken = useAuthStore((s) => s.accessToken) ?? "";
  const [activeTab, setActiveTab] = useState<"overview" | "revenue" | "expenses" | "cashflow">("overview");

  const { data: summaryRaw, isLoading: summaryLoading, isError: summaryError } = useQuery({
    ...trpc.getFinancialSummary.queryOptions({ authToken, propertyId }),
    enabled: !!authToken,
  });

  const { data: propertyRaw, isLoading: propertyLoading } = useQuery({
    ...trpc.getPropertyById.queryOptions({ propertyId }),
    enabled: !!authToken,
  });

  const isLoading = summaryLoading || propertyLoading;
  const isError = summaryError;
  const summary = summaryRaw as any;
  const property = propertyRaw as any;
  const data = { ...property, ...summary } as any;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-gold-500 border-t-transparent" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-500/5 p-8 text-center">
        <TrendingDown className="mx-auto mb-3 h-10 w-10 text-red-600" />
        <p className="text-lg font-semibold text-red-600">Failed to load financial data</p>
        <p className="mt-1 text-sm text-gray-500">Please try again later.</p>
      </div>
    );
  }

  const purchasePrice = Number(data.purchasePrice ?? 0);
  const currentValue = Number(data.currentValue ?? data.estimatedValue ?? 0);
  const totalInvestment = Number(data.totalInvestment ?? data.totalInvestmentBudget ?? 0);
  const equity = currentValue - (Number(data.outstandingLoan ?? 0) || (totalInvestment * 0.7));
  const projectedROI = Number(data.projectedROI ?? data.expectedROI ?? 0);
  const capRate = Number(data.capRate ?? 0);

  // Revenue data
  const monthlyRent = Number(data.monthlyRent ?? data.monthlyRentalIncome ?? 0);
  const occupancyRate = Number(data.occupancyRate ?? (100 - (data.vacancyRate ?? 5)));
  const annualGrossRent = monthlyRent * 12;
  const vacancyLoss = annualGrossRent * ((100 - occupancyRate) / 100);
  const effectiveGrossIncome = annualGrossRent - vacancyLoss;

  // Expenses
  const managementFees = Number(data.managementFees ?? data.monthlyManagementFee ?? 0) * 12;
  const maintenance = Number(data.maintenance ?? data.monthlyMaintenanceReserve ?? 0) * 12;
  const insurance = Number(data.insurance ?? data.annualInsurance ?? 0);
  const rates = Number(data.rates ?? data.annualPropertyTax ?? 0);
  const totalExpenses = managementFees + maintenance + insurance + rates;

  // NOI
  const noi = effectiveGrossIncome - totalExpenses;
  const monthlyCashFlow = noi / 12 - Number(data.monthlyDebtService ?? 0);

  // Cash flow projections (5 years)
  const appreciationRate = Number(data.appreciationRate ?? 5);
  const cashFlowProjections = Array.from({ length: 5 }, (_, i) => {
    const year = i + 1;
    const projectedValue = currentValue * Math.pow(1 + appreciationRate / 100, year);
    const projectedRent = monthlyRent * Math.pow(1.05, year) * 12;
    const projectedExpenses = totalExpenses * Math.pow(1.04, year);
    const projectedNOI = projectedRent * (occupancyRate / 100) - projectedExpenses;
    return { year, projectedValue, projectedRent, projectedExpenses, projectedNOI };
  });

  const incomeExpenseMax = Math.max(effectiveGrossIncome, totalExpenses, 1);

  const tabs = [
    { key: "overview" as const, label: "Overview" },
    { key: "revenue" as const, label: "Revenue" },
    { key: "expenses" as const, label: "Expenses" },
    { key: "cashflow" as const, label: "Cash Flow" },
  ];

  return (
    <div className="space-y-6">
      {/* Tab Navigation */}
      <div className="flex gap-1 rounded-lg border border-navy-800/50 bg-navy-900/50 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "bg-gold-500/20 text-gold-600"
                : "text-gray-500 hover:bg-navy-800/50 hover:text-gray-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Key Metrics Cards */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Purchase Price */}
            <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Purchase Price</p>
                  <p className="mt-2 text-2xl font-bold text-gold-600">R{fmt(purchasePrice)}</p>
                </div>
                <div className="rounded-lg bg-gold-50 p-3">
                  <DollarSign className="h-6 w-6 text-gold-600" />
                </div>
              </div>
            </div>

            {/* Current Value */}
            <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Current Value</p>
                  <p className="mt-2 text-2xl font-bold text-emerald-600">R{fmt(currentValue)}</p>
                  {currentValue > purchasePrice && (
                    <p className="mt-1 text-xs text-emerald-600">
                      +{fmtPct(((currentValue - purchasePrice) / purchasePrice) * 100)} appreciation
                    </p>
                  )}
                </div>
                <div className="rounded-lg bg-emerald-50 p-3">
                  <TrendingUp className="h-6 w-6 text-emerald-600" />
                </div>
              </div>
            </div>

            {/* Total Investment */}
            <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Investment</p>
                  <p className="mt-2 text-2xl font-bold text-blue-600">R{fmt(totalInvestment)}</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-3">
                  <Building className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </div>

            {/* Equity */}
            <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Equity</p>
                  <p className={`mt-2 text-2xl font-bold ${equity >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    R{fmt(equity)}
                  </p>
                </div>
                <div className={`rounded-lg p-3 ${equity >= 0 ? "bg-emerald-50" : "bg-red-50"}`}>
                  {equity >= 0 ? (
                    <TrendingUp className="h-6 w-6 text-emerald-600" />
                  ) : (
                    <TrendingDown className="h-6 w-6 text-red-600" />
                  )}
                </div>
              </div>
            </div>

            {/* Projected ROI */}
            <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Projected ROI</p>
                  <p className={`mt-2 text-2xl font-bold ${projectedROI >= 0 ? "text-gold-600" : "text-red-600"}`}>
                    {fmtPct(projectedROI)}
                  </p>
                </div>
                <div className="rounded-lg bg-gold-50 p-3">
                  <BarChart className="h-6 w-6 text-gold-600" />
                </div>
              </div>
            </div>

            {/* Cap Rate */}
            <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Cap Rate</p>
                  <p className="mt-2 text-2xl font-bold text-purple-600">{fmtPct(capRate)}</p>
                </div>
                <div className="rounded-lg bg-purple-50 p-3">
                  <PieChart className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Income vs Expenses Bar Comparison */}
          <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Income vs Expenses (Annual)</h3>
            <div className="space-y-4">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm text-gray-500">Effective Gross Income</span>
                  <span className="text-sm font-medium text-emerald-600">R{fmt(effectiveGrossIncome)}</span>
                </div>
                <div className="h-4 w-full overflow-hidden rounded-full bg-navy-800/50">
                  <div
                    className="h-full rounded-full bg-emerald-500/70 transition-all"
                    style={{ width: `${(effectiveGrossIncome / incomeExpenseMax) * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm text-gray-500">Total Expenses</span>
                  <span className="text-sm font-medium text-red-600">R{fmt(totalExpenses)}</span>
                </div>
                <div className="h-4 w-full overflow-hidden rounded-full bg-navy-800/50">
                  <div
                    className="h-full rounded-full bg-red-500/70 transition-all"
                    style={{ width: `${(totalExpenses / incomeExpenseMax) * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-sm text-gray-500">Net Operating Income</span>
                  <span className={`text-sm font-medium ${noi >= 0 ? "text-gold-600" : "text-red-600"}`}>
                    R{fmt(noi)}
                  </span>
                </div>
                <div className="h-4 w-full overflow-hidden rounded-full bg-navy-800/50">
                  <div
                    className={`h-full rounded-full transition-all ${noi >= 0 ? "bg-gold-500/70" : "bg-red-500/70"}`}
                    style={{ width: `${(Math.abs(noi) / incomeExpenseMax) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Revenue Section */}
      {activeTab === "revenue" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
              <p className="text-sm font-medium text-gray-500">Monthly Rental Income</p>
              <p className="mt-2 text-2xl font-bold text-gold-600">R{fmt(monthlyRent)}</p>
              <p className="mt-1 text-xs text-gray-500">R{fmt(annualGrossRent)}/year gross</p>
            </div>

            <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
              <p className="text-sm font-medium text-gray-500">Occupancy Rate</p>
              <p className="mt-2 text-2xl font-bold text-emerald-600">{occupancyRate.toFixed(1)}%</p>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-navy-800/50">
                <div
                  className="h-full rounded-full bg-emerald-500/70"
                  style={{ width: `${occupancyRate}%` }}
                />
              </div>
            </div>

            <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
              <p className="text-sm font-medium text-gray-500">Net Operating Income</p>
              <p className={`mt-2 text-2xl font-bold ${noi >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                R{fmt(noi)}
              </p>
              <p className="mt-1 text-xs text-gray-500">R{fmt(noi / 12)}/month</p>
            </div>
          </div>

          {/* Revenue Breakdown */}
          <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Revenue Breakdown</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-navy-800/30 px-4 py-3">
                <span className="text-sm text-gray-600">Annual Gross Rent</span>
                <span className="font-medium text-gold-600">R{fmt(annualGrossRent)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-navy-800/30 px-4 py-3">
                <span className="text-sm text-gray-600">Vacancy Loss ({(100 - occupancyRate).toFixed(1)}%)</span>
                <span className="font-medium text-red-600">-R{fmt(vacancyLoss)}</span>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-gold-200 bg-gold-50 px-4 py-3">
                <span className="text-sm font-semibold text-gray-900">Effective Gross Income</span>
                <span className="font-bold text-gold-600">R{fmt(effectiveGrossIncome)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expenses Section */}
      {activeTab === "expenses" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Expense Breakdown (Annual)</h3>
            <div className="space-y-3">
              {[
                { label: "Management Fees", value: managementFees, color: "bg-blue-500/70" },
                { label: "Maintenance & Repairs", value: maintenance, color: "bg-orange-500/70" },
                { label: "Insurance", value: insurance, color: "bg-purple-500/70" },
                { label: "Municipal Rates & Taxes", value: rates, color: "bg-red-500/70" },
              ].map((item) => {
                const pct = totalExpenses > 0 ? (item.value / totalExpenses) * 100 : 0;
                return (
                  <div key={item.label}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm text-gray-600">{item.label}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500">{pct.toFixed(1)}%</span>
                        <span className="text-sm font-medium text-gray-200">R{fmt(item.value)}</span>
                      </div>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-navy-800/50">
                      <div
                        className={`h-full rounded-full ${item.color} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
              <span className="text-sm font-semibold text-gray-900">Total Annual Expenses</span>
              <span className="font-bold text-red-600">R{fmt(totalExpenses)}</span>
            </div>
          </div>

          {/* Expense Ratio */}
          <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
            <h3 className="mb-3 text-lg font-semibold text-gray-900">Expense Ratio</h3>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="h-4 w-full overflow-hidden rounded-full bg-navy-800/50">
                  <div
                    className="h-full rounded-full bg-gold-500/70 transition-all"
                    style={{
                      width: `${effectiveGrossIncome > 0 ? Math.min(100, (totalExpenses / effectiveGrossIncome) * 100) : 0}%`,
                    }}
                  />
                </div>
              </div>
              <span className="text-sm font-medium text-gold-600">
                {effectiveGrossIncome > 0 ? ((totalExpenses / effectiveGrossIncome) * 100).toFixed(1) : "0.0"}%
              </span>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Operating expenses as a percentage of effective gross income
            </p>
          </div>
        </div>
      )}

      {/* Cash Flow Projections */}
      {activeTab === "cashflow" && (
        <div className="space-y-6">
          {/* Monthly Cash Flow Summary */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
              <p className="text-sm font-medium text-gray-500">Monthly Cash Flow</p>
              <p className={`mt-2 text-2xl font-bold ${monthlyCashFlow >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                R{fmt(monthlyCashFlow)}
              </p>
              <p className="mt-1 text-xs text-gray-500">After debt service</p>
            </div>
            <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
              <p className="text-sm font-medium text-gray-500">Annual Cash Flow</p>
              <p className={`mt-2 text-2xl font-bold ${monthlyCashFlow >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                R{fmt(monthlyCashFlow * 12)}
              </p>
              <p className="mt-1 text-xs text-gray-500">Projected annual return</p>
            </div>
          </div>

          {/* 5-Year Projections Table */}
          <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">5-Year Cash Flow Projections</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-navy-800/50">
                    <th className="px-3 py-3 text-left font-medium text-gray-500">Year</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500">Property Value</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500">Annual Revenue</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500">Annual Expenses</th>
                    <th className="px-3 py-3 text-right font-medium text-gray-500">NOI</th>
                  </tr>
                </thead>
                <tbody>
                  {cashFlowProjections.map((proj) => (
                    <tr key={proj.year} className="border-b border-navy-800/30">
                      <td className="px-3 py-3 font-medium text-gray-900">Year {proj.year}</td>
                      <td className="px-3 py-3 text-right text-blue-600">R{fmt(proj.projectedValue)}</td>
                      <td className="px-3 py-3 text-right text-emerald-600">R{fmt(proj.projectedRent)}</td>
                      <td className="px-3 py-3 text-right text-red-600">R{fmt(proj.projectedExpenses)}</td>
                      <td className={`px-3 py-3 text-right font-medium ${proj.projectedNOI >= 0 ? "text-gold-600" : "text-red-600"}`}>
                        R{fmt(proj.projectedNOI)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Projected Value Growth Bar */}
          <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Projected Value Growth</h3>
            <div className="space-y-3">
              {cashFlowProjections.map((proj) => {
                const growthPct = currentValue > 0 ? ((proj.projectedValue - currentValue) / currentValue) * 100 : 0;
                const barWidth = Math.min(100, (proj.projectedValue / (cashFlowProjections[4]?.projectedValue || 1)) * 100);
                return (
                  <div key={proj.year}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-sm text-gray-500">Year {proj.year}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-emerald-600">+{growthPct.toFixed(1)}%</span>
                        <span className="text-sm font-medium text-gray-200">R{fmt(proj.projectedValue)}</span>
                      </div>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-navy-800/50">
                      <div
                        className="h-full rounded-full bg-gold-500/60 transition-all"
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
