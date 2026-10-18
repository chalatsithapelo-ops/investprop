import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  DollarSign,
  TrendingUp,
  Receipt,
  Settings,
  Save,
  Banknote,
  ArrowLeftRight,
  Building2,
  PiggyBank,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

export const Route = createFileRoute("/admin/revenue/")({
  component: RevenuePage,
});

const ZAR = (n: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 2,
  }).format(n ?? 0);

const FEE_TYPE_META: Record<string, { label: string; icon: any; color: string }> = {
  CAPITAL_RAISE: { label: "Capital Raise", icon: Banknote, color: "text-emerald-600" },
  DISTRIBUTION: { label: "Distributions", icon: PiggyBank, color: "text-blue-600" },
  SECONDARY_TRADE: { label: "Secondary Trades", icon: ArrowLeftRight, color: "text-purple-600" },
  SOURCING: { label: "Deal Sourcing", icon: Building2, color: "text-amber-600" },
};

function RevenuePage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const isManager = user?.role === "ADMIN" || user?.role === "DEVELOPMENT_MANAGER";

  const summaryQuery = useQuery({
    ...trpc.getPlatformRevenueSummary.queryOptions({ months: 12 }),
    enabled: !!authToken && isManager,
  });

  const summary = summaryQuery.data as any;

  // ── Fee config editor state ──
  const [savingConfig, setSavingConfig] = useState(false);
  const [cfg, setCfg] = useState<{
    capitalRaiseFeeBps: number;
    distributionFeeBps: number;
    secondaryTradeFeeBps: number;
    sourcingFeeBps: number;
    sourcingFlatFee: number;
    enabled: boolean;
  } | null>(null);

  useEffect(() => {
    if (summary?.config && !cfg) {
      setCfg({
        capitalRaiseFeeBps: summary.config.capitalRaiseFeeBps,
        distributionFeeBps: summary.config.distributionFeeBps,
        secondaryTradeFeeBps: summary.config.secondaryTradeFeeBps,
        sourcingFeeBps: summary.config.sourcingFeeBps,
        sourcingFlatFee: summary.config.sourcingFlatFee,
        enabled: summary.config.enabled,
      });
    }
  }, [summary, cfg]);

  if (!user || !authToken) return null;
  if (!isManager) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="text-xl font-bold text-gray-900">Admin access required</h1>
          <p className="mt-2 text-gray-500">You do not have permission to view platform revenue.</p>
        </div>
      </div>
    );
  }

  const handleSaveConfig = async () => {
    if (!cfg) return;
    setSavingConfig(true);
    try {
      await trpcClient.updatePlatformFeeConfig.mutate(cfg);
      toast.success("Fee configuration updated");
      queryClient.invalidateQueries({ queryKey: trpc.getPlatformRevenueSummary.queryKey() });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update fee configuration");
    } finally {
      setSavingConfig(false);
    }
  };

  const maxMonthly = Math.max(1, ...((summary?.monthly ?? []).map((m: any) => m.total)));

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-emerald-100 p-2">
            <DollarSign className="text-emerald-600" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Platform Revenue</h1>
            <p className="text-sm text-gray-500">
              Live view of every fee the platform has earned across the app.
            </p>
          </div>
        </div>

        {summaryQuery.isLoading && (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
            Loading revenue…
          </div>
        )}

        {summaryQuery.isError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
            Failed to load revenue: {(summaryQuery.error as any)?.message}
          </div>
        )}

        {summary && (
          <div className="space-y-6">
            {/* Headline stats */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard
                icon={TrendingUp}
                label="Total revenue (all-time)"
                value={ZAR(summary.totalRevenue)}
                tone="emerald"
              />
              <StatCard
                icon={DollarSign}
                label="This month"
                value={ZAR(summary.monthToDate)}
                tone="blue"
              />
              <StatCard
                icon={Receipt}
                label="Fees captured"
                value={String(summary.totalFees)}
                tone="gray"
              />
            </div>

            {/* By fee type */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {Object.keys(FEE_TYPE_META).map((type) => {
                const meta = FEE_TYPE_META[type]!;
                const row = (summary.byType ?? []).find((t: any) => t.feeType === type);
                const Icon = meta.icon;
                return (
                  <div key={type} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Icon className={meta.color} size={18} />
                      <span className="text-sm font-medium text-gray-700">{meta.label}</span>
                    </div>
                    <p className="mt-2 text-xl font-bold text-gray-900">
                      {ZAR(row?.total ?? 0)}
                    </p>
                    <p className="text-xs text-gray-400">{row?.count ?? 0} fees</p>
                  </div>
                );
              })}
            </div>

            {/* Monthly trend */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-sm font-semibold text-gray-700">
                Monthly revenue (last 12 months)
              </h2>
              <div className="flex h-40 items-end gap-2">
                {(summary.monthly ?? []).map((m: any) => (
                  <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-emerald-500 transition-all"
                      style={{ height: `${Math.max(2, (m.total / maxMonthly) * 140)}px` }}
                      title={ZAR(m.total)}
                    />
                    <span className="text-[10px] text-gray-400">{m.month.slice(5)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Fee configuration */}
            {cfg && (
              <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <Settings className="text-gray-500" size={18} />
                  <h2 className="text-sm font-semibold text-gray-700">Fee configuration</h2>
                </div>
                <p className="mb-4 text-xs text-gray-400">
                  Rates are in basis points (100 bps = 1%). Changes apply to all future fee captures.
                </p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <BpsField
                    label="Capital-raise fee"
                    value={cfg.capitalRaiseFeeBps}
                    onChange={(v) => setCfg({ ...cfg, capitalRaiseFeeBps: v })}
                  />
                  <BpsField
                    label="Distribution fee"
                    value={cfg.distributionFeeBps}
                    onChange={(v) => setCfg({ ...cfg, distributionFeeBps: v })}
                  />
                  <BpsField
                    label="Secondary-trade fee"
                    value={cfg.secondaryTradeFeeBps}
                    onChange={(v) => setCfg({ ...cfg, secondaryTradeFeeBps: v })}
                  />
                  <BpsField
                    label="Sourcing fee"
                    value={cfg.sourcingFeeBps}
                    onChange={(v) => setCfg({ ...cfg, sourcingFeeBps: v })}
                  />
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Sourcing flat fee (ZAR, overrides %)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={cfg.sourcingFlatFee}
                      onChange={(e) =>
                        setCfg({ ...cfg, sourcingFlatFee: Number(e.target.value) || 0 })
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={cfg.enabled}
                        onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-emerald-600"
                      />
                      Fee capture enabled
                    </label>
                  </div>
                </div>
                <button
                  onClick={handleSaveConfig}
                  disabled={savingConfig}
                  className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Save size={16} />
                  {savingConfig ? "Saving…" : "Save configuration"}
                </button>
              </div>
            )}

            {/* Recent ledger */}
            <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <h2 className="border-b border-gray-100 p-5 text-sm font-semibold text-gray-700">
                Recent fees
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs uppercase text-gray-400">
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Type</th>
                      <th className="px-5 py-3">Property</th>
                      <th className="px-5 py-3 text-right">Base</th>
                      <th className="px-5 py-3 text-right">Fee</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(summary.recent ?? []).length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-5 py-8 text-center text-gray-400">
                          No fees captured yet.
                        </td>
                      </tr>
                    )}
                    {(summary.recent ?? []).map((r: any) => (
                      <tr key={r.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-5 py-3 text-gray-500">
                          {new Date(r.createdAt).toLocaleDateString("en-ZA")}
                        </td>
                        <td className="px-5 py-3">
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                            {FEE_TYPE_META[r.feeType]?.label ?? r.feeType}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-gray-700">{r.property?.title ?? "—"}</td>
                        <td className="px-5 py-3 text-right text-gray-500">{ZAR(r.baseAmount)}</td>
                        <td className="px-5 py-3 text-right font-semibold text-emerald-600">
                          {ZAR(r.feeAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: any;
  label: string;
  value: string;
  tone: "emerald" | "blue" | "gray";
}) {
  const toneMap = {
    emerald: "bg-emerald-50 text-emerald-600",
    blue: "bg-blue-50 text-blue-600",
    gray: "bg-gray-100 text-gray-600",
  };
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`rounded-lg p-2 ${toneMap[tone]}`}>
          <Icon size={20} />
        </div>
        <div>
          <p className="text-xs text-gray-400">{label}</p>
          <p className="text-xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

function BpsField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">
        {label} <span className="text-gray-400">({(value / 100).toFixed(2)}%)</span>
      </label>
      <input
        type="number"
        min={0}
        max={5000}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
      />
    </div>
  );
}
