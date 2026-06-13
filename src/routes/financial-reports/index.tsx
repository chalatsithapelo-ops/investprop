import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import { useState, useEffect } from "react";
import {
  BarChart3,
  FileText,
  Building2,
  Users,
  DollarSign,
  TrendingUp,
  Download,
  Calendar,
  PieChart,
  ArrowUpRight,
  ArrowDownRight,
  Scale,
  ShieldAlert,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";

const MANAGER_ROLES = ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "PROPERTY_OWNER", "OWNER"];

export const Route = createFileRoute("/financial-reports/")({
  component: FinancialReportsPage,
});

function FinancialReportsPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);
  const [selectedSpvId, setSelectedSpvId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"income" | "balance" | "investor" | "tax" | "portfolio">("income");
  const [taxYear, setTaxYear] = useState(new Date().getFullYear());

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const isManager = MANAGER_ROLES.includes(user?.role ?? "");
  if (!user || !authToken) return null;

  // SA tax year: 1 Mar - 28 Feb
  const fromDate = `${taxYear - 1}-03-01`;
  const toDate = `${taxYear}-02-28`;

  const spvsQuery = useQuery({
    ...trpc.getSPVs.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
  });
  const propertiesQuery = useQuery({
    ...trpc.getProperties.queryOptions({}),
  });

  const incomeQuery = useQuery({
    ...trpc.getSPVIncomeStatement.queryOptions({
      authToken: authToken ?? "",
      propertyId: selectedPropertyId ?? 0,
      fromDate,
      toDate,
      taxYear: String(taxYear),
    }),
    enabled: !!selectedPropertyId && activeTab === "income",
  });

  const balanceQuery = useQuery({
    ...trpc.getSPVBalanceSheet.queryOptions({
      authToken: authToken ?? "",
      propertyId: selectedPropertyId ?? 0,
      asAtDate: new Date().toISOString().slice(0, 10),
    }),
    enabled: !!selectedPropertyId && activeTab === "balance",
  });

  const investorQuery = useQuery({
    ...trpc.getInvestorStatement.queryOptions({
      authToken: authToken ?? "",
      fromDate,
      toDate,
    }),
    enabled: activeTab === "investor",
  });

  const taxQuery = useQuery({
    ...trpc.getAnnualTaxReport.queryOptions({
      authToken: authToken ?? "",
      propertyId: selectedPropertyId ?? 0,
      taxYear,
    }),
    enabled: !!selectedPropertyId && activeTab === "tax",
  });

  const portfolioQuery = useQuery({
    ...trpc.getSPVPortfolioSummary.queryOptions({
      authToken: authToken ?? "",
      spvId: selectedSpvId ?? 0,
    }),
    enabled: !!selectedSpvId && activeTab === "portfolio",
  });

  const properties = (propertiesQuery.data as any)?.properties ?? propertiesQuery.data ?? [];
  const spvs = (spvsQuery.data ?? []) as any[];

  const tabs = [
    { key: "income" as const, label: "Income Statement", icon: BarChart3 },
    { key: "balance" as const, label: "Balance Sheet", icon: Scale },
    { key: "investor" as const, label: "My Statement", icon: Users },
    { key: "tax" as const, label: "Tax Report", icon: FileText },
    { key: "portfolio" as const, label: "SPV Portfolio", icon: Building2 },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Financial Reports</h1>
            <p className="mt-1 text-sm text-gray-500">SPV income statements, balance sheets, investor statements & tax reports</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
                activeTab === t.key
                  ? "bg-navy-900 text-white shadow"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <t.icon size={16} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Controls Row */}
        {activeTab !== "investor" && activeTab !== "portfolio" && (
          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-gray-200 bg-white p-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Property</label>
              <select
                value={selectedPropertyId ?? ""}
                onChange={(e) => setSelectedPropertyId(e.target.value ? Number(e.target.value) : null)}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select property...</option>
                {properties.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>
            {(activeTab === "income" || activeTab === "tax") && (
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Tax Year (ending Feb)</label>
                <select
                  value={taxYear}
                  onChange={(e) => setTaxYear(Number(e.target.value))}
                  className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
                >
                  {[2024, 2025, 2026, 2027].map((y) => (
                    <option key={y} value={y}>{y - 1}/{y}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {activeTab === "portfolio" && (
          <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">SPV</label>
              <select
                value={selectedSpvId ?? ""}
                onChange={(e) => setSelectedSpvId(e.target.value ? Number(e.target.value) : null)}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select SPV...</option>
                {spvs.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* ─── Income Statement ──────────────────────── */}
        {activeTab === "income" && selectedPropertyId && incomeQuery.data && (
          <IncomeStatementView data={incomeQuery.data} />
        )}

        {/* ─── Balance Sheet ─────────────────────────── */}
        {activeTab === "balance" && selectedPropertyId && balanceQuery.data && (
          <BalanceSheetView data={balanceQuery.data} />
        )}

        {/* ─── Investor Statement ────────────────────── */}
        {activeTab === "investor" && investorQuery.data && (
          <InvestorStatementView data={investorQuery.data} />
        )}

        {/* ─── Tax Report ────────────────────────────── */}
        {activeTab === "tax" && selectedPropertyId && taxQuery.data && (
          <TaxReportView data={taxQuery.data} />
        )}

        {/* ─── SPV Portfolio ─────────────────────────── */}
        {activeTab === "portfolio" && selectedSpvId && portfolioQuery.data && (
          <PortfolioView data={portfolioQuery.data} />
        )}

        {/* Empty states */}
        {activeTab !== "investor" && activeTab !== "portfolio" && !selectedPropertyId && (
          <EmptyState icon={Building2} text="Select a property to generate the report" />
        )}
        {activeTab === "portfolio" && !selectedSpvId && (
          <EmptyState icon={Building2} text="Select an SPV to view the portfolio summary" />
        )}
        {activeTab === "income" && selectedPropertyId && !incomeQuery.data && !incomeQuery.isLoading && (
          <EmptyState icon={BarChart3} text="No financial data found for this period" />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════ helpers ═══

function Rand({ value, className = "" }: { value: number; className?: string }) {
  const isNeg = value < 0;
  return (
    <span className={`${className} ${isNeg ? "text-red-600" : ""}`}>
      {isNeg ? "-" : ""}R{Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  );
}

function Pct({ value }: { value: number }) {
  return <span>{value.toFixed(2)}%</span>;
}

function Card({ title, icon: Icon, children, className = "" }: { title: string; icon: any; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-gray-200 bg-white p-6 ${className}`}>
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-700 uppercase tracking-wide">
        <Icon size={16} className="text-gold-600" />
        {title}
      </h3>
      {children}
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center">
      <Icon size={48} className="mb-4 text-gray-300" />
      <p className="text-sm text-gray-500">{text}</p>
    </div>
  );
}

function LineRow({ label, value, bold = false, indent = false }: { label: string; value: React.ReactNode; bold?: boolean; indent?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${bold ? "font-semibold text-gray-900 border-t border-gray-200 pt-2" : "text-gray-600"} ${indent ? "pl-4" : ""}`}>
      <span className="text-sm">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════ Income Statement

function IncomeStatementView({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      {/* SPV Header */}
      {data.spv && (
        <div className="rounded-xl border border-gold-200 bg-gold-50/50 p-4 text-center">
          <p className="text-xs uppercase tracking-widest text-gold-700">Income Statement</p>
          <h2 className="text-lg font-bold text-gray-900">{data.spv.name}</h2>
          <p className="text-xs text-gray-500">
            {data.spv.registrationNumber && `Reg: ${data.spv.registrationNumber} | `}
            {data.spv.taxNumber && `Tax: ${data.spv.taxNumber} | `}
            Period: {data.period.from} to {data.period.to}
          </p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard label="Total Revenue" value={data.revenue.total} icon={TrendingUp} color="emerald" />
        <SummaryCard label="Total Expenses" value={data.expenses.total} icon={ArrowDownRight} color="red" />
        <SummaryCard label="Net Operating Income" value={data.netOperatingIncome} icon={DollarSign} color="blue" />
        <SummaryCard label="Gross Yield" value={`${data.yields.grossYield.toFixed(2)}%`} icon={PieChart} color="gold" isText />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue */}
        <Card title="Revenue" icon={TrendingUp}>
          {data.revenue.byCategory.map((c: any) => (
            <LineRow key={c.category} label={formatCategory(c.category)} value={<Rand value={c.amount} />} indent />
          ))}
          <LineRow label="Total Revenue" value={<Rand value={data.revenue.total} className="font-bold" />} bold />
        </Card>

        {/* Expenses */}
        <Card title="Expenses" icon={ArrowDownRight}>
          {data.expenses.byCategory.map((c: any) => (
            <LineRow key={c.category} label={formatCategory(c.category)} value={<Rand value={c.amount} />} indent />
          ))}
          <LineRow label="Total Expenses" value={<Rand value={data.expenses.total} className="font-bold" />} bold />
        </Card>
      </div>

      {/* Tax & Net */}
      <Card title="Tax Calculation" icon={FileText}>
        <LineRow label="Net Operating Income" value={<Rand value={data.netOperatingIncome} />} />
        <LineRow label={`Corporate Tax (${(data.tax.corporateTaxRate * 100).toFixed(0)}%)`} value={<Rand value={data.tax.estimatedCorporateTax} />} indent />
        <LineRow label="Profit After Tax" value={<Rand value={data.tax.profitAfterTax} className="font-bold text-emerald-600" />} bold />
        <div className="mt-3 border-t pt-3">
          <LineRow label="Total Distributed to Investors" value={<Rand value={data.distributions.totalDistributed} />} />
          <LineRow label="Management Fees Collected" value={<Rand value={data.distributions.totalMgmtFees} />} indent />
          <LineRow label="Dividends Withholding Tax" value={<Rand value={data.distributions.totalDWT} />} indent />
        </div>
      </Card>

      {/* Monthly Trend */}
      {data.monthlyTrend.length > 0 && (
        <Card title="Monthly Trend" icon={Calendar}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Month</th>
                  <th className="px-3 py-2 text-right">Revenue</th>
                  <th className="px-3 py-2 text-right">Expenses</th>
                  <th className="px-3 py-2 text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {data.monthlyTrend.map((m: any) => (
                  <tr key={m.month} className="border-b border-gray-100">
                    <td className="px-3 py-2 font-medium">{m.month}</td>
                    <td className="px-3 py-2 text-right text-emerald-600"><Rand value={m.revenue} /></td>
                    <td className="px-3 py-2 text-right text-red-600"><Rand value={m.expenses} /></td>
                    <td className={`px-3 py-2 text-right font-medium ${m.net >= 0 ? "text-emerald-700" : "text-red-700"}`}><Rand value={m.net} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════ Balance Sheet

function BalanceSheetView({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      {data.spv && (
        <div className="rounded-xl border border-gold-200 bg-gold-50/50 p-4 text-center">
          <p className="text-xs uppercase tracking-widest text-gold-700">Balance Sheet</p>
          <h2 className="text-lg font-bold text-gray-900">{data.spv.name}</h2>
          <p className="text-xs text-gray-500">As at {data.asAtDate}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Assets */}
        <Card title="Assets" icon={TrendingUp}>
          <LineRow label="Property (at cost)" value={<Rand value={data.assets.propertyAtCost} />} indent />
          <LineRow label="Cash & Equivalents" value={<Rand value={data.assets.cashAndEquivalents} />} indent />
          <LineRow label="Total Assets" value={<Rand value={data.assets.totalAssets} className="font-bold" />} bold />
        </Card>

        {/* Liabilities & Equity */}
        <Card title="Liabilities & Equity" icon={Scale}>
          <p className="mb-2 text-xs font-semibold uppercase text-gray-400">Liabilities</p>
          <LineRow label="Current Liabilities" value={<Rand value={data.liabilities.currentLiabilities} />} indent />
          <LineRow label="Long-term Debt" value={<Rand value={data.liabilities.longTermDebt} />} indent />
          <LineRow label="Total Liabilities" value={<Rand value={data.liabilities.totalLiabilities} />} bold />
          <div className="mt-3 border-t pt-2">
            <p className="mb-2 text-xs font-semibold uppercase text-gray-400">Equity</p>
            <LineRow label="Share Capital" value={<Rand value={data.equity.shareCapital} />} indent />
            <LineRow label="Retained Earnings" value={<Rand value={data.equity.retainedEarnings} />} indent />
            <LineRow label="Total Equity" value={<Rand value={data.equity.totalEquity} className="font-bold text-emerald-600" />} bold />
          </div>
        </Card>
      </div>

      {/* Shareholders Register */}
      {data.shareholders.length > 0 && (
        <Card title="Shareholders Register" icon={Users}>
          <table className="w-full text-sm">
            <thead className="border-b text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Investor</th>
                <th className="px-3 py-2 text-left">Class</th>
                <th className="px-3 py-2 text-right">Shares</th>
                <th className="px-3 py-2 text-right">Value</th>
                <th className="px-3 py-2 text-right">Ownership</th>
              </tr>
            </thead>
            <tbody>
              {data.shareholders.map((s: any, i: number) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="px-3 py-2 font-medium">{s.investorName}</td>
                  <td className="px-3 py-2">{s.shareClass}</td>
                  <td className="px-3 py-2 text-right">{s.shares.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right"><Rand value={s.value} /></td>
                  <td className="px-3 py-2 text-right"><Pct value={s.percentage} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════ Investor Statement

function InvestorStatementView({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gold-200 bg-gold-50/50 p-4 text-center">
        <p className="text-xs uppercase tracking-widest text-gold-700">Investor Statement</p>
        <h2 className="text-lg font-bold text-gray-900">{data.investor.name}</h2>
        <p className="text-xs text-gray-500">Period: {data.period.from} to {data.period.to}</p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard label="Total Invested" value={data.summary.totalInvested} icon={DollarSign} color="blue" />
        <SummaryCard label="Portfolio Value" value={data.summary.totalCurrentValue} icon={TrendingUp} color="emerald" />
        <SummaryCard label="Dividends Received" value={data.summary.totalDividendsReceived} icon={ArrowUpRight} color="gold" />
        <SummaryCard label="Total Return" value={`${data.summary.totalReturn.toFixed(2)}%`} icon={PieChart} color="purple" isText />
      </div>

      {/* Investments Table */}
      {data.investments.length > 0 && (
        <Card title="Investment Portfolio" icon={Building2}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Property</th>
                  <th className="px-3 py-2 text-left">SPV</th>
                  <th className="px-3 py-2 text-right">Invested</th>
                  <th className="px-3 py-2 text-right">Shares</th>
                  <th className="px-3 py-2 text-right">Ownership</th>
                  <th className="px-3 py-2 text-right">Dividends</th>
                  <th className="px-3 py-2 text-right">Tax Withheld</th>
                </tr>
              </thead>
              <tbody>
                {data.investments.map((inv: any) => (
                  <tr key={inv.propertyId} className="border-b border-gray-100">
                    <td className="px-3 py-2 font-medium">{inv.title}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{inv.spvName ?? "—"}</td>
                    <td className="px-3 py-2 text-right"><Rand value={inv.totalInvested} /></td>
                    <td className="px-3 py-2 text-right">{inv.sharesOwned.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right"><Pct value={inv.ownershipPct} /></td>
                    <td className="px-3 py-2 text-right text-emerald-600"><Rand value={inv.totalDividendsReceived} /></td>
                    <td className="px-3 py-2 text-right text-red-600"><Rand value={inv.totalTaxWithheld} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Recent Payouts */}
      {data.recentPayouts.length > 0 && (
        <Card title="Recent Distributions" icon={DollarSign}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-right">Gross</th>
                  <th className="px-3 py-2 text-right">Tax</th>
                  <th className="px-3 py-2 text-right">Net</th>
                  <th className="px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recentPayouts.map((p: any, i: number) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="px-3 py-2">{new Date(p.date).toLocaleDateString("en-ZA")}</td>
                    <td className="px-3 py-2">{formatCategory(p.type)}</td>
                    <td className="px-3 py-2 text-right"><Rand value={p.gross} /></td>
                    <td className="px-3 py-2 text-right text-red-600"><Rand value={p.taxWithheld} /></td>
                    <td className="px-3 py-2 text-right font-medium"><Rand value={p.net} /></td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.status === "PAID" ? "bg-emerald-50 text-emerald-600" : "bg-yellow-50 text-yellow-600"}`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════ Tax Report

function TaxReportView({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gold-200 bg-gold-50/50 p-4 text-center">
        <p className="text-xs uppercase tracking-widest text-gold-700">Annual Tax Report</p>
        <h2 className="text-lg font-bold text-gray-900">{data.spv?.name ?? "Property Tax Report"}</h2>
        <p className="text-xs text-gray-500">
          Tax Year: {data.taxYear.from} to {data.taxYear.to}
          {data.spv?.taxNumber && ` | Tax No: ${data.spv.taxNumber}`}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* P&L Summary */}
        <Card title="Income Statement Summary" icon={BarChart3}>
          <LineRow label="Total Income" value={<Rand value={data.incomeStatement.totalIncome} />} />
          {data.incomeStatement.deductibleExpenses.map((e: any) => (
            <LineRow key={e.category} label={formatCategory(e.category)} value={<Rand value={e.amount} />} indent />
          ))}
          <LineRow label="Total Deductible Expenses" value={<Rand value={data.incomeStatement.totalExpenses} />} bold />
          <LineRow label="Net Profit / (Loss)" value={<Rand value={data.incomeStatement.netProfit} />} bold />
        </Card>

        {/* Corporate Tax */}
        <Card title="Corporate Income Tax (IT14)" icon={FileText}>
          <LineRow label="Taxable Income" value={<Rand value={data.corporateTax.taxableIncome} />} />
          <LineRow label={`Tax Rate`} value={<Pct value={data.corporateTax.rate * 100} />} indent />
          <LineRow label="Estimated Corporate Tax" value={<Rand value={data.corporateTax.estimatedTax} className="font-bold text-red-600" />} bold />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Dividends Tax */}
        <Card title="Dividends Withholding Tax (s64E)" icon={DollarSign}>
          <LineRow label="Total Dividends Declared" value={<Rand value={data.dividendsTax.totalDividendsDeclared} />} />
          <LineRow label="DWT Rate" value={<Pct value={data.dividendsTax.dwtRate * 100} />} indent />
          <LineRow label="Total DWT Withheld" value={<Rand value={data.dividendsTax.totalDWTWithheld} className="font-bold" />} bold />
          {data.dividendsTax.investorSchedule.length > 0 && (
            <div className="mt-3 border-t pt-2">
              <p className="mb-1 text-xs font-semibold uppercase text-gray-400">IT3(d) Schedule per Investor</p>
              {data.dividendsTax.investorSchedule.map((inv: any) => (
                <div key={inv.investorId} className="flex justify-between text-xs text-gray-600 py-0.5">
                  <span>Investor #{inv.investorId}</span>
                  <span>Div: <Rand value={inv.totalDividends} /> | DWT: <Rand value={inv.dwtWithheld} /></span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* CGT */}
        <Card title="Capital Gains Tax" icon={TrendingUp}>
          <LineRow label="Sale Proceeds" value={<Rand value={data.capitalGains.saleProceeds} />} />
          <LineRow label="Base Cost" value={<Rand value={data.capitalGains.baseCost} />} indent />
          <LineRow label="Capital Gain" value={<Rand value={data.capitalGains.capitalGain} />} />
          <LineRow label={`Inclusion Rate (${(data.capitalGains.inclusionRate * 100).toFixed(0)}%)`} value={<Rand value={data.capitalGains.includedGain} />} indent />
          <LineRow label="CGT Payable" value={<Rand value={data.capitalGains.cgt} className="font-bold" />} bold />
        </Card>
      </div>

      {/* Total */}
      <div className="rounded-xl border-2 border-navy-900 bg-navy-900/5 p-6 text-center">
        <p className="text-xs uppercase tracking-widest text-gray-500">Total Estimated Tax Liability</p>
        <p className="mt-2 text-3xl font-bold text-gray-900"><Rand value={data.totalEstimatedTax} /></p>
        <p className="mt-1 text-xs text-gray-400">(Corporate Tax + Capital Gains Tax — DWT is withheld separately)</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════ Portfolio View

function PortfolioView({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gold-200 bg-gold-50/50 p-4 text-center">
        <p className="text-xs uppercase tracking-widest text-gold-700">SPV Portfolio Summary</p>
        <h2 className="text-lg font-bold text-gray-900">{data.spv.name}</h2>
        <p className="text-xs text-gray-500">
          {data.spv.registrationNumber && `Reg: ${data.spv.registrationNumber} | `}
          Status: {data.spv.status} | Director: {data.spv.director.name}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard label="Properties" value={data.portfolio.propertyCount} icon={Building2} color="blue" isText />
        <SummaryCard label="Portfolio Value" value={data.portfolio.totalPropertyValue} icon={DollarSign} color="emerald" />
        <SummaryCard label="Total Distributed" value={data.financials.totalDistributed} icon={ArrowUpRight} color="gold" />
        <SummaryCard label="Net Income" value={data.financials.netIncome} icon={TrendingUp} color="purple" />
      </div>

      {/* Properties */}
      <Card title="Properties in SPV" icon={Building2}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Property</th>
                <th className="px-3 py-2 text-right">Value</th>
                <th className="px-3 py-2 text-right">Funding</th>
                <th className="px-3 py-2 text-right">Investors</th>
                <th className="px-3 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.properties.map((p: any) => (
                <tr key={p.id} className="border-b border-gray-100">
                  <td className="px-3 py-2">
                    <p className="font-medium">{p.title}</p>
                    <p className="text-xs text-gray-400">{p.address}</p>
                  </td>
                  <td className="px-3 py-2 text-right"><Rand value={p.value} /></td>
                  <td className="px-3 py-2 text-right">
                    <Rand value={p.fundingRaised} /> / <Rand value={p.fundingGoal} />
                  </td>
                  <td className="px-3 py-2 text-right">{p.investorCount}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                      {p.investmentStatus}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Investors across SPV */}
      {data.investors.length > 0 && (
        <Card title="Investors" icon={Users}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Investor</th>
                  <th className="px-3 py-2 text-right">Properties</th>
                  <th className="px-3 py-2 text-right">Total Shares</th>
                </tr>
              </thead>
              <tbody>
                {data.investors.map((inv: any) => (
                  <tr key={inv.id} className="border-b border-gray-100">
                    <td className="px-3 py-2 font-medium">{inv.name}</td>
                    <td className="px-3 py-2 text-right">{inv.properties}</td>
                    <td className="px-3 py-2 text-right">{inv.totalShares.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════ Shared Components

function SummaryCard({
  label, value, icon: Icon, color, isText = false,
}: { label: string; value: number | string; icon: any; color: string; isText?: boolean }) {
  const colors: Record<string, string> = {
    emerald: "text-emerald-600",
    red: "text-red-600",
    blue: "text-blue-600",
    gold: "text-gold-600",
    purple: "text-purple-600",
  };
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 text-gray-500">
        <Icon size={14} />
        <span className="text-xs">{label}</span>
      </div>
      <p className={`mt-2 text-xl font-bold ${colors[color] ?? "text-gray-900"}`}>
        {isText ? value : <Rand value={value as number} />}
      </p>
    </div>
  );
}

function formatCategory(cat: string) {
  return cat
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
