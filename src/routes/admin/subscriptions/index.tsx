import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Users, TrendingUp, CreditCard, Repeat, RefreshCw, Save } from "lucide-react";
import toast from "react-hot-toast";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/admin/subscriptions/")({
  component: AdminSubscriptionsPage,
});

type PlanDraft = {
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  features: string; // newline-separated in the editor
  active: boolean;
};

const ZAR = (n: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(n ?? 0);

const fmtDate = (d: string | Date | null) =>
  d ? new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short" }) : "—";

function AdminSubscriptionsPage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const [syncing, setSyncing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, PlanDraft>>({});
  const [savingTier, setSavingTier] = useState<string | null>(null);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const isManager = user?.role === "ADMIN" || user?.role === "DEVELOPMENT_MANAGER";

  const statsQuery = useQuery({
    ...trpc.getSubscriptionStats.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isManager,
  });
  const stats = statsQuery.data as any;

  const plansQuery = useQuery({
    ...trpc.getSubscriptionPlans.queryOptions(),
    enabled: !!authToken && isManager,
  });
  const plans = (plansQuery.data as any[]) ?? [];

  // Seed editable drafts once plans load.
  useEffect(() => {
    if (!plans.length) return;
    setDrafts((prev) => {
      if (Object.keys(prev).length) return prev;
      const seeded: Record<string, PlanDraft> = {};
      for (const p of plans) {
        seeded[p.tier] = {
          name: p.name ?? "",
          description: p.description ?? "",
          monthlyPrice: Number(p.monthlyPrice ?? 0),
          annualPrice: Number(p.annualPrice ?? 0),
          features: Array.isArray(p.features) ? p.features.join("\n") : "",
          active: p.active ?? true,
        };
      }
      return seeded;
    });
  }, [plans]);

  const handleSyncPlans = async () => {
    setSyncing(true);
    try {
      const res = await trpcClient.syncPaystackPlans.mutate({ authToken: authToken ?? "" });
      if (res.created.length > 0) {
        toast.success(`Created ${res.created.length} Paystack plan(s). Recurring billing is now active.`);
      } else {
        toast.success("All Paystack plans already synced.");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to sync Paystack plans.");
    } finally {
      setSyncing(false);
    }
  };

  const handleSavePlan = async (tier: string) => {
    const d = drafts[tier];
    if (!d) return;
    setSavingTier(tier);
    try {
      await trpcClient.upsertSubscriptionPlan.mutate({
        authToken: authToken ?? "",
        tier: tier as any,
        name: d.name.trim(),
        description: d.description.trim() || null,
        monthlyPrice: Number(d.monthlyPrice) || 0,
        annualPrice: Number(d.annualPrice) || 0,
        features: d.features.split("\n").map((f) => f.trim()).filter(Boolean),
        active: d.active,
      });
      toast.success(`${d.name} saved. Re-run "Sync Paystack Plans" if you changed a price.`);
      queryClient.invalidateQueries({ queryKey: trpc.getSubscriptionPlans.queryKey() });
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save plan.");
    } finally {
      setSavingTier(null);
    }
  };

  if (!user || !authToken) return null;
  if (!isManager) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="text-xl font-bold text-gray-900">Admin access required</h1>
        </div>
      </div>
    );
  }

  const cards = [
    { label: "Estimated MRR", value: ZAR(stats?.estimatedMRR ?? 0), icon: Repeat, color: "text-emerald-600" },
    { label: "Total paid revenue", value: ZAR(stats?.totalPaidRevenue ?? 0), icon: TrendingUp, color: "text-teal-600" },
    { label: "Paid payments", value: stats?.totalPaidCount ?? 0, icon: CreditCard, color: "text-blue-600" },
    {
      label: "Active subscribers",
      value:
        (stats?.statusCounts?.ACTIVE ?? 0) + (stats?.statusCounts?.TRIALING ?? 0),
      icon: Users,
      color: "text-purple-600",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Subscriptions</h1>
            <p className="text-sm text-gray-500">SaaS plan performance and recurring revenue.</p>
          </div>
          <button
            onClick={handleSyncPlans}
            disabled={syncing}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            <RefreshCw size={16} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Sync Paystack Plans"}
          </button>
        </div>

        {statsQuery.isLoading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
            Loading…
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {cards.map((c) => (
                <div key={c.label} className="rounded-xl border border-gray-200 bg-white p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">{c.label}</span>
                    <c.icon className={c.color} size={18} />
                  </div>
                  <p className="mt-2 text-2xl font-bold text-gray-900">{c.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h2 className="mb-3 font-semibold text-gray-900">Subscribers by tier</h2>
                <div className="space-y-2">
                  {Object.entries(stats?.tierCounts ?? {}).map(([tier, count]) => (
                    <div key={tier} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{tier.replace(/_/g, " ")}</span>
                      <span className="font-semibold text-gray-900">{count as number}</span>
                    </div>
                  ))}
                  {Object.keys(stats?.tierCounts ?? {}).length === 0 && (
                    <p className="text-sm text-gray-400">No subscribers yet.</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h2 className="mb-3 font-semibold text-gray-900">By status</h2>
                <div className="space-y-2">
                  {Object.entries(stats?.statusCounts ?? {}).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">{status}</span>
                      <span className="font-semibold text-gray-900">{count as number}</span>
                    </div>
                  ))}
                  {Object.keys(stats?.statusCounts ?? {}).length === 0 && (
                    <p className="text-sm text-gray-400">No data yet.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-8 rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="mb-3 font-semibold text-gray-900">Recent payments</h2>
              {stats?.recentPayments?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="pb-2">Subscriber</th>
                        <th className="pb-2">Plan</th>
                        <th className="pb-2">Cycle</th>
                        <th className="pb-2 text-right">Amount</th>
                        <th className="pb-2 text-right">Paid</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.recentPayments.map((p: any) => (
                        <tr key={p.id} className="border-t border-gray-100">
                          <td className="py-2">
                            <div className="font-medium text-gray-900">{p.userName}</div>
                            <div className="text-xs text-gray-400">{p.userEmail}</div>
                          </td>
                          <td className="py-2">{p.tier.replace(/_/g, " ")}</td>
                          <td className="py-2">{p.billingCycle}</td>
                          <td className="py-2 text-right font-medium">{ZAR(p.amount)}</td>
                          <td className="py-2 text-right text-gray-500">{fmtDate(p.paidAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-gray-400">No payments yet.</p>
              )}
            </div>

            {/* ── Plan editor ── */}
            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">Plans &amp; pricing</h2>
                  <p className="text-sm text-gray-500">
                    Edit plan names, prices and features. Changes apply instantly to the pricing &amp;
                    checkout pages. After a price change, click <strong>Sync Paystack Plans</strong> so
                    recurring billing matches.
                  </p>
                </div>
              </div>

              {plansQuery.isLoading ? (
                <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-500">
                  Loading plans…
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {plans.map((p: any) => {
                    const d = drafts[p.tier];
                    if (!d) return null;
                    const set = (patch: Partial<PlanDraft>) =>
                      setDrafts((prev) => ({ ...prev, [p.tier]: { ...prev[p.tier], ...patch } }));
                    return (
                      <div key={p.tier} className="rounded-xl border border-gray-200 bg-white p-5">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-gray-600">
                            {p.tier.replace(/_/g, " ")}
                          </span>
                          <label className="flex items-center gap-2 text-sm text-gray-600">
                            <input
                              type="checkbox"
                              checked={d.active}
                              onChange={(e) => set({ active: e.target.checked })}
                              className="h-4 w-4 rounded border-gray-300"
                            />
                            Active
                          </label>
                        </div>

                        <label className="mb-1 block text-xs font-medium text-gray-500">Name</label>
                        <input
                          value={d.name}
                          onChange={(e) => set({ name: e.target.value })}
                          className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none"
                        />

                        <div className="mb-3 grid grid-cols-2 gap-3">
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-500">Monthly (R)</label>
                            <input
                              type="number"
                              min={0}
                              value={d.monthlyPrice}
                              onChange={(e) => set({ monthlyPrice: Number(e.target.value) })}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-500">Annual (R)</label>
                            <input
                              type="number"
                              min={0}
                              value={d.annualPrice}
                              onChange={(e) => set({ annualPrice: Number(e.target.value) })}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none"
                            />
                          </div>
                        </div>

                        <label className="mb-1 block text-xs font-medium text-gray-500">
                          Features (one per line)
                        </label>
                        <textarea
                          value={d.features}
                          onChange={(e) => set({ features: e.target.value })}
                          rows={5}
                          className="mb-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none"
                        />

                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">
                            {p.paystackPlanCodeMonthly || p.paystackPlanCodeAnnual
                              ? "Paystack synced"
                              : "Not synced to Paystack yet"}
                          </span>
                          <button
                            onClick={() => handleSavePlan(p.tier)}
                            disabled={savingTier === p.tier}
                            className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
                          >
                            <Save size={15} />
                            {savingTier === p.tier ? "Saving…" : "Save plan"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
