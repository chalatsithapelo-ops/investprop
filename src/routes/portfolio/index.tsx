import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Wallet, Building2, DollarSign, TrendingUp, PieChart } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { ReferralCard } from "~/components/ReferralCard";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/portfolio/")({
  component: PortfolioPage,
});

function PortfolioPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const portfolioQuery = useQuery({
    ...trpc.getInvestorPortfolio.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
  });

  const distributionsQuery = useQuery({
    ...trpc.getMyDistributions.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
  });

  const portfolio = portfolioQuery.data as any;
  const distributions = (distributionsQuery.data as any)?.distributions ?? distributionsQuery.data ?? [];
  const distributionsArr = Array.isArray(distributions) ? distributions : [];

  const holdings = portfolio?.holdings ?? portfolio?.investments ?? [];
  const holdingsArr = Array.isArray(holdings) ? holdings : [];

  const totalValue = holdingsArr.reduce((sum: number, h: any) => sum + (Number(h.currentValue ?? h.value ?? 0)), 0);
  const totalDistributions = distributionsArr.reduce((sum: number, d: any) => sum + (Number(d.amount) || 0), 0);
  const avgROI = portfolio?.averageROI ?? (holdingsArr.length > 0 ? holdingsArr.reduce((sum: number, h: any) => sum + (Number(h.roi) || 0), 0) / holdingsArr.length : 0);

  const totalContributed = holdingsArr.reduce((sum: number, h: any) =>
    sum + Number(h.totalInvested ?? h.contributionAmount ?? h.invested ?? 0), 0);
  const distributionsYTD = distributionsArr
    .filter((d: any) => {
      const dt = new Date(d.distributionDate ?? d.paidAt ?? d.createdAt ?? 0);
      return dt.getFullYear() === new Date().getFullYear();
    })
    .reduce((s: number, d: any) => s + Number(d.amount ?? 0), 0);
  const valueGrowth = totalValue - totalContributed;
  const valueGrowthPct = totalContributed > 0 ? (valueGrowth / totalContributed) * 100 : 0;
  const hasPortfolio = totalContributed > 0 || holdingsArr.length > 0;

  if (!user || !authToken) return null;

  if (portfolioQuery.isLoading) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold-500 border-r-transparent"></div>
        </div>
      </div>
    );
  }

  if (portfolioQuery.isError) {
    const errorMessage = (portfolioQuery.error as any)?.message ?? "Unknown error";
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="rounded-lg bg-red-50 p-6 text-center">
            <p className="text-lg font-semibold text-red-600">Failed to load portfolio data</p>
            <p className="mt-2 text-sm text-gray-500">{errorMessage}</p>
            <button
              onClick={() => portfolioQuery.refetch()}
              className="mt-4 rounded-lg bg-gold-500 px-6 py-2 text-sm font-medium text-navy-950 hover:bg-gold-400"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const statCards = [
    { label: "Total Portfolio Value", value: `R${totalValue.toLocaleString()}`, icon: Wallet, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Properties Owned", value: holdingsArr.length, icon: Building2, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Total Distributions", value: `R${totalDistributions.toLocaleString()}`, icon: DollarSign, color: "text-gold-600", bg: "bg-gold-50" },
    { label: "Average ROI", value: `${Number(avgROI).toFixed(1)}%`, icon: TrendingUp, color: "text-purple-600", bg: "bg-purple-50" },
  ];

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <PieChart className="text-gold-600" size={32} />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">My Portfolio</h1>
              <p className="mt-1 text-gray-500">Track your property investments and returns</p>
            </div>
          </div>
        </div>

        {/* Hero KPI story — only when there's something to tell */}
        {hasPortfolio && (
          <div className="mb-8 rounded-2xl border border-gold-200 bg-gradient-to-br from-gold-50 via-white to-emerald-50 p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Your money story</p>
            <div className="mt-3 grid grid-cols-1 items-center gap-4 md:grid-cols-[1fr_auto_1fr_auto_1fr]">
              {/* Contributed */}
              <div>
                <p className="text-xs text-gray-500">You&rsquo;ve put in</p>
                <p className="mt-1 text-3xl font-bold text-gray-900">R{totalContributed.toLocaleString("en-ZA")}</p>
                <p className="mt-0.5 text-xs text-gray-500">across {holdingsArr.length} {holdingsArr.length === 1 ? "property" : "properties"}</p>
              </div>
              <div className="hidden md:block text-2xl text-gray-300">→</div>
              {/* Current value */}
              <div>
                <p className="text-xs text-gray-500">Worth today</p>
                <p className={`mt-1 text-3xl font-bold ${valueGrowth >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  R{totalValue.toLocaleString("en-ZA")}
                </p>
                <p className={`mt-0.5 text-xs font-medium ${valueGrowth >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {valueGrowth >= 0 ? "▲" : "▼"} R{Math.abs(valueGrowth).toLocaleString("en-ZA")} ({valueGrowthPct >= 0 ? "+" : ""}{valueGrowthPct.toFixed(1)}%)
                </p>
              </div>
              <div className="hidden md:block text-2xl text-gray-300">→</div>
              {/* Distributions YTD */}
              <div>
                <p className="text-xs text-gray-500">Cash to your bank ({new Date().getFullYear()})</p>
                <p className="mt-1 text-3xl font-bold text-gold-700">R{distributionsYTD.toLocaleString("en-ZA")}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  R{totalDistributions.toLocaleString("en-ZA")} lifetime distributions
                </p>
              </div>
            </div>
            <p className="mt-4 text-xs text-gray-500">
              Valuations are based on sponsor-reported NAV and recent comparable sales — not a guarantee of resale price. Capital is at risk.
            </p>
          </div>
        )}

        {/* Stats Cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{card.label}</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{card.value}</p>
                </div>
                <div className={`rounded-lg ${card.bg} p-3`}>
                  <card.icon className={card.color} size={24} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Holdings */}
        <div className="mb-8 rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
          <div className="mb-4 flex items-center gap-2">
            <Building2 className="text-gold-600" size={20} />
            <h2 className="text-lg font-semibold text-gray-900">My Holdings</h2>
          </div>

          {holdingsArr.length === 0 ? (
            <div className="py-8 text-center">
              <Building2 className="mx-auto mb-3 text-gray-600" size={40} />
              <p className="text-gray-500">No holdings yet</p>
              <p className="mt-1 text-sm text-gray-500">Invest in a property to see your holdings here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-navy-700">
                    <th className="py-3 pr-4 text-left text-sm font-medium text-gray-500">Property</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Shares Owned</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Share %</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Invested</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Expected Return</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Actual to date</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Variance</th>
                    <th className="pl-4 py-3 text-right text-sm font-medium text-gray-500">Current Value</th>
                  </tr>
                </thead>
                <tbody>
                  {holdingsArr.map((holding: any, idx: number) => {
                    const invested = Number(holding.totalInvested ?? holding.contributionAmount ?? holding.invested ?? 0);
                    const expected = Number(
                      holding.expectedReturnAmount ??
                        holding.expectedReturn ??
                        (invested * Number(holding.expectedReturnRate ?? holding.expectedROI ?? 0)) / 100,
                    );
                    const propId = holding.propertyId ?? holding.property?.id;
                    const actual = distributionsArr
                      .filter((d: any) => (d.propertyId ?? d.property?.id) === propId)
                      .reduce((s: number, d: any) => s + Number(d.amount ?? 0), 0);
                    const variance = actual - expected;
                    const variancePct = expected > 0 ? (variance / expected) * 100 : null;
                    return (
                    <tr key={holding.id ?? idx} className="border-b border-navy-800/50">
                      <td className="py-4 pr-4">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-blue-50 p-2">
                            <Building2 className="text-blue-600" size={16} />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {holding.propertyTitle ?? holding.property?.title ?? `Property #${holding.propertyId}`}
                            </p>
                            <p className="text-sm text-gray-500">
                              {holding.propertyCity ?? holding.property?.city ?? ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right text-gray-900">
                        {holding.sharesOwned ?? holding.shares ?? 0}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className="rounded-full bg-gold-50 px-2 py-0.5 text-sm text-gold-600">
                          {Number(holding.sharePercentage ?? holding.percentage ?? 0).toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right text-sm text-gray-700">
                        R{invested.toLocaleString()}
                      </td>
                      <td className="px-4 py-4 text-right text-sm text-gray-700">
                        R{expected.toLocaleString()}
                      </td>
                      <td className="px-4 py-4 text-right text-sm text-emerald-600">
                        R{actual.toLocaleString()}
                      </td>
                      <td className={`px-4 py-4 text-right text-sm font-medium ${variance >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {variance >= 0 ? "+" : "−"}R{Math.abs(variance).toLocaleString()}
                        {variancePct !== null && (
                          <span className="ml-1 text-xs text-gray-500">
                            ({variance >= 0 ? "+" : ""}{variancePct.toFixed(0)}%)
                          </span>
                        )}
                      </td>
                      <td className="py-4 pl-4 text-right font-semibold text-emerald-600">
                        R{Number(holding.currentValue ?? holding.value ?? 0).toLocaleString()}
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Distribution History */}
        <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
          <div className="mb-4 flex items-center gap-2">
            <DollarSign className="text-gold-600" size={20} />
            <h2 className="text-lg font-semibold text-gray-900">Distribution History</h2>
          </div>

          {distributionsArr.length === 0 ? (
            <div className="py-8 text-center">
              <DollarSign className="mx-auto mb-3 text-gray-600" size={40} />
              <p className="text-gray-500">No distributions received yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-navy-700">
                    <th className="py-3 pr-4 text-left text-sm font-medium text-gray-500">Date</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Property</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Type</th>
                    <th className="px-4 py-3 text-right text-sm font-medium text-gray-500">Amount</th>
                    <th className="pl-4 py-3 text-right text-sm font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {distributionsArr.map((dist: any, idx: number) => (
                    <tr key={dist.id ?? idx} className="border-b border-navy-800/50">
                      <td className="py-3 pr-4 text-sm text-gray-600">
                        {dist.date ?? dist.createdAt
                          ? new Date(dist.date ?? dist.createdAt).toLocaleDateString("en-ZA")
                          : "N/A"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {dist.propertyTitle ?? dist.property?.title ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {dist.type?.replace(/_/g, " ") ?? "Distribution"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-emerald-600">
                        R{Number(dist.amount || 0).toLocaleString()}
                      </td>
                      <td className="py-3 pl-4 text-right">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            dist.status === "EXECUTED" || dist.status === "PAID"
                              ? "bg-emerald-50 text-emerald-600"
                              : "bg-gold-50 text-gold-600"
                          }`}
                        >
                          {dist.status ?? "PENDING"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Invite / referral */}
        <div className="mt-8">
          <ReferralCard />
        </div>
      </div>
    </div>
  );
}
