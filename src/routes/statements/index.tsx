import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { FileBarChart, Download, Loader2, Calendar, Info, TrendingUp } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import { downloadInvestorStatementPDF } from "~/utils/generate-statement-pdf";
import toast from "react-hot-toast";

export const Route = createFileRoute("/statements/")({
  component: StatementsPage,
});

type PeriodOption = {
  label: string;
  periodLabel: string;
  start: string;
  end: string;
};

function money(n: number): string {
  return `R ${(Math.round((n + Number.EPSILON) * 100) / 100).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function buildPeriodOptions(): PeriodOption[] {
  const opts: PeriodOption[] = [];
  const now = new Date();
  const year = now.getUTCFullYear();

  // Year-to-date
  opts.push({
    label: `Year to date (${year})`,
    periodLabel: `YTD ${year}`,
    start: new Date(Date.UTC(year, 0, 1)).toISOString(),
    end: now.toISOString(),
  });

  // Last 4 completed calendar quarters + current quarter
  const quarters = [
    { q: 1, sm: 0, em: 2, ed: 31 },
    { q: 2, sm: 3, em: 5, ed: 30 },
    { q: 3, sm: 6, em: 8, ed: 30 },
    { q: 4, sm: 9, em: 11, ed: 31 },
  ];
  for (let yr = year; yr >= year - 1; yr--) {
    for (let i = quarters.length - 1; i >= 0; i--) {
      const q = quarters[i];
      const start = new Date(Date.UTC(yr, q.sm, 1));
      if (start > now) continue;
      const end = new Date(Date.UTC(yr, q.em, q.ed, 23, 59, 59));
      opts.push({
        label: `Q${q.q} ${yr} (${start.toLocaleDateString("en-ZA", { month: "short" })} - ${end.toLocaleDateString("en-ZA", { month: "short" })})`,
        periodLabel: `Q${q.q} ${yr}`,
        start: start.toISOString(),
        end: (end > now ? now : end).toISOString(),
      });
    }
  }

  // Full prior year
  opts.push({
    label: `Full year ${year - 1}`,
    periodLabel: `FY${year - 1}`,
    start: new Date(Date.UTC(year - 1, 0, 1)).toISOString(),
    end: new Date(Date.UTC(year - 1, 11, 31, 23, 59, 59)).toISOString(),
  });

  return opts;
}

function StatementsPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const periods = useMemo(() => buildPeriodOptions(), []);
  const [periodIdx, setPeriodIdx] = useState(0);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const selected = periods[periodIdx];

  const stmtQuery = useQuery({
    ...trpc.generateInvestorStatement.queryOptions({
      authToken: authToken ?? "",
      periodStart: selected.start,
      periodEnd: selected.end,
      periodLabel: selected.periodLabel,
    }),
    enabled: !!authToken,
  });

  const data = stmtQuery.data as any;

  const handleDownload = () => {
    if (!data) return;
    try {
      setDownloading(true);
      downloadInvestorStatementPDF(data);
      toast.success("Statement PDF downloaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to generate PDF");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <FileBarChart className="text-gold-600" size={32} />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Investor Statements</h1>
            <p className="text-gray-500">
              Download a periodic statement of your holdings, distributions and transactions
            </p>
          </div>
        </div>

        {/* Period selector */}
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-navy-800/50 bg-navy-900/50 p-4">
          <Calendar size={18} className="text-gold-500" />
          <label htmlFor="period" className="text-sm font-medium text-gray-700">
            Statement period
          </label>
          <select
            id="period"
            value={periodIdx}
            onChange={(e) => setPeriodIdx(Number(e.target.value))}
            className="rounded-md border border-navy-700 bg-navy-800 px-3 py-2 text-sm text-gray-100 focus:border-gold-500 focus:outline-none"
          >
            {periods.map((p, i) => (
              <option key={i} value={i}>
                {p.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleDownload}
            disabled={!data || downloading}
            className="ml-auto inline-flex items-center gap-2 rounded-md bg-gold-600 px-4 py-2 text-sm font-semibold text-navy-950 transition hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {downloading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            Download PDF
          </button>
        </div>

        {stmtQuery.isLoading ? (
          <div className="flex justify-center py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold-500 border-r-transparent" />
          </div>
        ) : data ? (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-navy-800/50 bg-navy-900/50 p-4">
                <p className="text-xs text-gray-500">Invested (cost)</p>
                <p className="mt-1 text-xl font-bold text-gray-900">{money(data.totalInvested)}</p>
              </div>
              <div className="rounded-lg border border-navy-800/50 bg-navy-900/50 p-4">
                <p className="text-xs text-gray-500">Current value</p>
                <p className="mt-1 text-xl font-bold text-emerald-600">{money(data.totalCurrentValue)}</p>
              </div>
              <div className="rounded-lg border border-navy-800/50 bg-navy-900/50 p-4">
                <p className="text-xs text-gray-500">Unrealised gain/loss</p>
                <p className={`mt-1 text-xl font-bold ${data.totalUnrealizedGain >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {money(data.totalUnrealizedGain)}
                </p>
              </div>
            </div>

            {/* Distributions in period */}
            <div className="rounded-lg border border-navy-800/50 bg-navy-900/50 p-4">
              <div className="mb-2 flex items-center gap-2">
                <TrendingUp size={18} className="text-gold-500" />
                <h3 className="font-semibold text-gray-900">Distribution income this period</h3>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500">Gross</p>
                  <p className="font-bold text-gray-900">{money(data.totalDistributionsGross)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Tax withheld</p>
                  <p className="font-bold text-gray-900">{money(data.totalDistributionsTax)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Net received</p>
                  <p className="font-bold text-emerald-600">{money(data.totalDistributionsNet)}</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-gray-500">
                {data.distributions.length} payout{data.distributions.length === 1 ? "" : "s"} ·{" "}
                {data.transactions.length} share transaction{data.transactions.length === 1 ? "" : "s"} in this period
              </p>
            </div>

            {/* Holdings preview */}
            <div className="overflow-x-auto rounded-lg border border-navy-800/50 bg-navy-900/50">
              <div className="border-b border-navy-800/50 px-4 py-3">
                <h3 className="font-semibold text-gray-900">Current holdings ({data.holdings.length})</h3>
              </div>
              {data.holdings.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">No current holdings.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="border-b border-navy-800/50 text-left text-gray-500">
                    <tr>
                      <th className="px-4 py-2">Property</th>
                      <th className="px-4 py-2">Shares</th>
                      <th className="px-4 py-2">Value</th>
                      <th className="px-4 py-2 text-right">Gain/Loss</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-800/50">
                    {data.holdings.map((h: any, i: number) => (
                      <tr key={i}>
                        <td className="px-4 py-2 text-gray-900">
                          {h.propertyTitle}
                          <span className="block text-xs text-gray-500">{h.shareClassName}</span>
                        </td>
                        <td className="px-4 py-2 text-gray-700">{h.sharesOwned}</td>
                        <td className="px-4 py-2 text-gray-900">{money(h.currentValue)}</td>
                        <td className={`px-4 py-2 text-right font-medium ${h.unrealizedGain >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {money(h.unrealizedGain)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-navy-800/50 bg-navy-900/30 p-4 text-xs text-gray-500">
              <Info size={14} className="mt-0.5 flex-shrink-0 text-gold-500" />
              <p>
                This statement is informational and not a tax certificate. For your annual SARS income
                summary, use the Tax Certificates page. Current values reflect the latest reference price
                per share and may differ from realisable market value.
              </p>
            </div>
          </div>
        ) : (
          <p className="py-16 text-center text-gray-500">No statement data available.</p>
        )}
      </div>
    </div>
  );
}
