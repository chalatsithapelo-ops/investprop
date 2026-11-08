import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Activity,
  Clock,
  DollarSign,
  AlertTriangle,
  PhoneCall,
  Wrench,
  RefreshCw,
  Mic,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/admin/voice-ops/")({
  component: VoiceOpsPage,
});

const USD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n ?? 0);
const NUM = (n: number) => new Intl.NumberFormat("en-ZA").format(n ?? 0);

function VoiceOpsPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const [days, setDays] = useState(30);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const isAdmin = user?.role === "ADMIN";

  const query = useQuery({
    ...trpc.getVoiceAgentOps.queryOptions({ days }),
    enabled: !!authToken && isAdmin,
  });
  const data = query.data as any;

  if (!user || !authToken) return null;
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="mx-auto max-w-3xl px-4 py-20 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Admin access required</h1>
          <p className="mt-2 text-gray-600">The voice cost &amp; ops dashboard is only available to administrators.</p>
        </div>
      </div>
    );
  }

  const totals = data?.totals;
  const maxTrend = Math.max(1, ...((data?.dailyTrend ?? []).map((d: any) => d.sessions) as number[]));

  const cards = [
    { label: "Calls", value: totals ? NUM(totals.sessions) : "—", icon: PhoneCall, color: "text-indigo-600" },
    { label: "Total minutes", value: totals ? NUM(totals.totalMinutes) : "—", icon: Clock, color: "text-blue-600" },
    { label: "Avg call (min)", value: totals ? NUM(totals.avgMinutes) : "—", icon: Activity, color: "text-cyan-600" },
    { label: "Est. cost", value: totals ? USD(totals.estCostUsd) : "—", icon: DollarSign, color: "text-emerald-600" },
    { label: "Tool calls", value: totals ? NUM(totals.toolCalls) : "—", icon: Wrench, color: "text-amber-600" },
    { label: "Error rate", value: totals ? `${totals.errorRatePct}%` : "—", icon: AlertTriangle, color: "text-rose-600" },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
              <Mic className="text-indigo-600" size={24} />
              Voice agent — cost &amp; ops
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Admin-only. Per-call usage from the realtime office agent. Costs are estimates for internal ops visibility, not billed amounts.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
            >
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button
              type="button"
              onClick={() => query.refetch()}
              disabled={query.isFetching}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw size={15} className={query.isFetching ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        {query.isPending && <p className="mt-10 text-center text-gray-500">Loading voice ops…</p>}
        {query.error && (
          <p className="mt-10 rounded-xl bg-red-50 p-4 text-center text-red-800">
            {query.error instanceof Error ? query.error.message : "Could not load voice ops."}
          </p>
        )}

        {data && (
          <>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((c) => (
                <div key={c.label} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-500">{c.label}</span>
                    <c.icon size={18} className={c.color} />
                  </div>
                  <p className="mt-2 text-2xl font-bold text-gray-900">{c.value}</p>
                </div>
              ))}
            </div>

            {data.totals?.sessions === 0 && (
              <p className="mt-6 rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
                No voice-agent calls recorded in this window yet.
              </p>
            )}

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900">By provider</h2>
                <div className="mt-4 space-y-3">
                  {(data.byProvider ?? []).length === 0 && <p className="text-sm text-gray-500">No data.</p>}
                  {(data.byProvider ?? []).map((p: any) => (
                    <div key={p.provider} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                      <div>
                        <p className="font-semibold capitalize text-gray-900">{p.provider}</p>
                        <p className="text-xs text-gray-500">
                          {NUM(p.sessions)} calls • {NUM(p.minutes)} min • {NUM(p.errorSessions)} with errors
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-emerald-700">{USD(p.estCostUsd)}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-bold text-gray-900">Calls per day</h2>
                <div className="mt-4 flex h-40 items-end gap-1">
                  {(data.dailyTrend ?? []).map((d: any) => (
                    <div key={d.date} className="group relative flex flex-1 flex-col items-center">
                      <div
                        className="w-full rounded-t bg-indigo-500/80 transition group-hover:bg-indigo-600"
                        style={{ height: `${(d.sessions / maxTrend) * 100}%` }}
                        title={`${d.date}: ${d.sessions} calls, ${d.minutes} min, ${USD(d.costUsd)}`}
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-center text-xs text-gray-400">
                  {data.windowDays} days • hover a bar for details
                </p>
              </section>
            </div>

            <section className="mt-8 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-gray-900">Recent calls</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="py-2 pr-4">When</th>
                      <th className="py-2 pr-4">Member</th>
                      <th className="py-2 pr-4">Provider / model</th>
                      <th className="py-2 pr-4">Duration</th>
                      <th className="py-2 pr-4">Tools</th>
                      <th className="py-2 pr-4">Errors</th>
                      <th className="py-2 pr-4">Est. cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.recent ?? []).length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-gray-500">No recent calls.</td>
                      </tr>
                    )}
                    {(data.recent ?? []).map((r: any) => (
                      <tr key={r.id} className="border-b border-gray-100 last:border-0">
                        <td className="py-2 pr-4 text-gray-500">{new Date(r.at).toLocaleString("en-ZA", { dateStyle: "short", timeStyle: "short" })}</td>
                        <td className="py-2 pr-4 text-gray-900">{r.userLabel}{r.userRole ? ` (${r.userRole})` : ""}</td>
                        <td className="py-2 pr-4 text-gray-700">{r.model}</td>
                        <td className="py-2 pr-4 text-gray-700">{Math.round(r.durationSeconds / 6) / 10} min</td>
                        <td className="py-2 pr-4 text-gray-700">{NUM(r.toolCalls)}</td>
                        <td className="py-2 pr-4">
                          {r.toolErrors + r.sessionErrors > 0 ? (
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                              {r.toolErrors + r.sessionErrors}
                            </span>
                          ) : (
                            <span className="text-gray-400">0</span>
                          )}
                        </td>
                        <td className="py-2 pr-4 font-medium text-emerald-700">{USD(r.costUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
