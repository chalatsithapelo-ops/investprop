import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { BarChart3, TrendingUp, DollarSign, Building, PieChart, Wallet } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/metrics/")({
  component: MetricsPage,
});

const MANAGER_ROLES = ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "PROPERTY_OWNER", "OWNER"];

function MetricsPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const isManager = user ? MANAGER_ROLES.includes(user.role) : false;

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  // Manager queries — platform-wide development metrics
  const metricsQuery = useQuery({
    ...trpc.getDevelopmentMetrics.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isManager,
  });

  const propertiesQuery = useQuery({
    ...trpc.getProperties.queryOptions({}),
    enabled: !!authToken && isManager,
  });

  // Investor queries — personal investment data
  const contributionsQuery = useQuery({
    ...trpc.getMyContributions.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && !isManager,
  });

  if (!user || !authToken) return null;

  // Loading state
  const isLoading = isManager
    ? metricsQuery.isLoading || propertiesQuery.isLoading
    : contributionsQuery.isLoading;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold-500 border-r-transparent"></div>
        </div>
      </div>
    );
  }

  if (isManager) {
    return <ManagerMetrics metricsData={metricsQuery.data} propertiesData={propertiesQuery.data} />;
  }

  return <InvestorMetrics contributionsData={contributionsQuery.data} userName={user.name} />;
}

/* ─── Investor-Specific Metrics ─────────────────────────────── */

function InvestorMetrics({ contributionsData, userName }: { contributionsData: any; userName: string }) {
  const contributions = (contributionsData ?? []) as any[];

  const totalInvested = contributions.reduce((sum: number, c: any) => sum + (Number(c.amount) || 0), 0);
  const propertiesInvested = new Set(contributions.map((c: any) => c.propertyId)).size;
  const avgContribution = contributions.length > 0 ? totalInvested / contributions.length : 0;
  const pendingContributions = contributions.filter((c: any) => c.status === "PENDING").length;
  const approvedContributions = contributions.filter((c: any) => c.status === "APPROVED" || c.status === "CONFIRMED").length;

  // Group by property for breakdown
  const byProperty: Record<string, { name: string; total: number; count: number }> = {};
  contributions.forEach((c: any) => {
    const key = c.propertyId ?? "unknown";
    const name = c.property?.title ?? c.propertyTitle ?? `Property #${key}`;
    if (!byProperty[key]) byProperty[key] = { name, total: 0, count: 0 };
    byProperty[key].total += Number(c.amount) || 0;
    byProperty[key].count += 1;
  });
  const propertyBreakdown = Object.values(byProperty);

  // Group by status
  const byStatus: Record<string, number> = {};
  contributions.forEach((c: any) => {
    const s = c.status ?? "UNKNOWN";
    byStatus[s] = (byStatus[s] || 0) + 1;
  });
  const statusBreakdown = Object.entries(byStatus).map(([status, count]) => ({ status, count }));

  const typeColors = ["bg-gold-500", "bg-emerald-500", "bg-blue-500", "bg-purple-500", "bg-rose-500", "bg-cyan-500"];

  const statCards = [
    { label: "Total Invested", value: `R${totalInvested.toLocaleString()}`, icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Properties", value: propertiesInvested, icon: Building, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Avg. Contribution", value: `R${avgContribution.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, icon: Wallet, color: "text-gold-600", bg: "bg-gold-50" },
    { label: "Contributions", value: contributions.length, icon: BarChart3, color: "text-purple-600", bg: "bg-purple-50" },
  ];

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <TrendingUp className="text-gold-600" size={32} />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">My Investment Metrics</h1>
              <p className="mt-1 text-gray-500">Your personal investment performance for {userName}</p>
            </div>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card) => (
            <div key={card.label} className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
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

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Investment by Property */}
          <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
            <div className="mb-4 flex items-center gap-2">
              <Building className="text-gold-600" size={20} />
              <h2 className="text-lg font-semibold text-gray-900">Investment by Property</h2>
            </div>
            <div className="space-y-4">
              {propertyBreakdown.length > 0 ? propertyBreakdown.map((item, i) => {
                const maxTotal = Math.max(...propertyBreakdown.map((p) => p.total));
                const pct = maxTotal > 0 ? (item.total / maxTotal) * 100 : 0;
                return (
                  <div key={i}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="truncate max-w-[200px] text-gray-600">{item.name}</span>
                      <span className="text-gray-500">R{item.total.toLocaleString()} ({item.count} contributions)</span>
                    </div>
                    <div className="h-3 rounded-full bg-navy-800">
                      <div className="h-3 rounded-full bg-gold-500" style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              }) : (
                <p className="py-8 text-center text-gray-500">No investments yet. Browse opportunities to get started.</p>
              )}
            </div>
          </div>

          {/* Contribution Status */}
          <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
            <div className="mb-4 flex items-center gap-2">
              <PieChart className="text-gold-600" size={20} />
              <h2 className="text-lg font-semibold text-gray-900">Contribution Status</h2>
            </div>
            {statusBreakdown.length > 0 ? (
              <div className="space-y-3">
                {statusBreakdown.map((s, i) => {
                  const total = statusBreakdown.reduce((sum, x) => sum + x.count, 0);
                  const pct = total > 0 ? (s.count / total) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className={`h-4 w-4 rounded ${typeColors[i % typeColors.length]}`}></div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">{s.status.replace(/_/g, " ")}</span>
                          <span className="text-gray-500">{s.count} ({pct.toFixed(0)}%)</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-navy-800">
                          <div className={`h-2 rounded-full ${typeColors[i % typeColors.length]}`} style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-8 text-center text-gray-500">No contribution data available</p>
            )}
          </div>
        </div>

        {/* Summary cards for pending/approved */}
        {contributions.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-amber-50 p-3">
                  <BarChart3 className="text-amber-600" size={24} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Pending Review</p>
                  <p className="text-2xl font-bold text-gray-900">{pendingContributions}</p>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-50 p-3">
                  <TrendingUp className="text-emerald-600" size={24} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Approved</p>
                  <p className="text-2xl font-bold text-gray-900">{approvedContributions}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Manager Platform-Wide Metrics ─────────────────────────── */

function ManagerMetrics({ metricsData, propertiesData }: { metricsData: any; propertiesData: any }) {
  const metrics = metricsData as any;
  const properties = (propertiesData as any)?.properties ?? propertiesData ?? [];
  const propertiesArr = Array.isArray(properties) ? properties : [];

  const totalProperties = propertiesArr.length;
  const avgROI = metrics?.averageROI ?? (propertiesArr.length > 0 ? propertiesArr.reduce((sum: number, p: any) => sum + (Number(p.roi ?? p.expectedReturn ?? 0)), 0) / propertiesArr.length : 0);
  const totalInvestmentValue = metrics?.totalInvestmentValue ?? propertiesArr.reduce((sum: number, p: any) => sum + (Number(p.price ?? p.purchasePrice ?? p.value ?? 0)), 0);
  const activeProjects = metrics?.activeProjects ?? propertiesArr.filter((p: any) => p.status === "ACTIVE" || p.status === "IN_PROGRESS" || p.type === "DEVELOPMENT").length;

  const budgetItems = metrics?.budgetUtilization ?? propertiesArr.slice(0, 6).map((p: any) => ({
    name: p.title ?? p.name ?? "Property",
    budgeted: Number(p.budget ?? p.price ?? 0),
    spent: Number(p.spent ?? p.currentSpend ?? p.budget * 0.6 ?? 0),
  }));
  const budgetArr = Array.isArray(budgetItems) ? budgetItems : [];

  const typeBreakdown = metrics?.typeBreakdown ?? (() => {
    const counts: Record<string, number> = {};
    propertiesArr.forEach((p: any) => {
      const t = p.type ?? "OTHER";
      counts[t] = (counts[t] || 0) + 1;
    });
    return Object.entries(counts).map(([type, count]) => ({ type, count }));
  })();
  const typeArr = Array.isArray(typeBreakdown) ? typeBreakdown : [];

  const typeColors = ["bg-gold-500", "bg-emerald-500", "bg-blue-500", "bg-purple-500", "bg-rose-500", "bg-cyan-500"];

  const statCards = [
    { label: "Total Properties", value: totalProperties, icon: Building, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Average ROI", value: `${Number(avgROI).toFixed(1)}%`, icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Total Investment Value", value: `R${Number(totalInvestmentValue).toLocaleString()}`, icon: DollarSign, color: "text-gold-600", bg: "bg-gold-50" },
    { label: "Active Projects", value: activeProjects, icon: BarChart3, color: "text-purple-600", bg: "bg-purple-50" },
  ];

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <BarChart3 className="text-gold-600" size={32} />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
              <p className="mt-1 text-gray-500">Platform-wide metrics and insights</p>
            </div>
          </div>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card) => (
            <div key={card.label} className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
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

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 className="text-gold-600" size={20} />
              <h2 className="text-lg font-semibold text-gray-900">Budget Utilization</h2>
            </div>
            <div className="space-y-4">
              {budgetArr.length > 0 ? budgetArr.map((item: any, i: number) => {
                const pct = item.budgeted > 0 ? Math.min((item.spent / item.budgeted) * 100, 100) : 0;
                return (
                  <div key={i}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="truncate max-w-[200px] text-gray-600">{item.name}</span>
                      <span className="text-gray-500">R{Number(item.spent).toLocaleString()} / R{Number(item.budgeted).toLocaleString()}</span>
                    </div>
                    <div className="h-3 rounded-full bg-navy-800">
                      <div
                        className={`h-3 rounded-full ${pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                );
              }) : (
                <p className="py-8 text-center text-gray-500">No budget data available</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
            <div className="mb-4 flex items-center gap-2">
              <PieChart className="text-gold-600" size={20} />
              <h2 className="text-lg font-semibold text-gray-900">Property Type Breakdown</h2>
            </div>
            {typeArr.length > 0 ? (
              <div className="space-y-3">
                {typeArr.map((t: any, i: number) => {
                  const total = typeArr.reduce((s: number, x: any) => s + (Number(x.count) || 0), 0);
                  const pct = total > 0 ? ((Number(t.count) || 0) / total) * 100 : 0;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className={`h-4 w-4 rounded ${typeColors[i % typeColors.length]}`}></div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">{t.type}</span>
                          <span className="text-gray-500">{t.count} ({pct.toFixed(0)}%)</span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-navy-800">
                          <div
                            className={`h-2 rounded-full ${typeColors[i % typeColors.length]}`}
                            style={{ width: `${pct}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-8 text-center text-gray-500">No property data available</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
