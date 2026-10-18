import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Users, TrendingUp, CreditCard, Repeat, RefreshCw } from "lucide-react";
import toast from "react-hot-toast";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/admin/subscriptions/")({
  component: AdminSubscriptionsPage,
});

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
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const [syncing, setSyncing] = useState(false);

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
          </>
        )}
      </div>
    </div>
  );
}
