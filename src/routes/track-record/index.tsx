import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Building2, CheckCircle2, Clock, Banknote, Users, Award, Loader2, ArrowLeft, TrendingUp } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { RiskDisclaimer } from "~/components/RiskDisclaimer";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/track-record/")({
  component: PlatformTrackRecordPage,
});

// Below this many completed deals we don't publish delivery percentages — a tiny
// sample would mislead. Mirrors the sponsor scorecard maturity guard.
const MATURITY_THRESHOLD = 3;

function pct(n: number | null | undefined): string {
  return n == null ? "—" : `${Math.round(n)}%`;
}

function rand(n: number): string {
  return "R" + Math.round(n).toLocaleString("en-ZA");
}

function PlatformTrackRecordPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !token) navigate({ to: "/login" });
  }, [user, token, hasHydrated]);

  const q = useQuery({
    ...trpc.getPlatformTrackRecord.queryOptions({ authToken: token ?? "" }),
    enabled: !!token,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (!user || !token) return null;

  const s = q.data;
  const mature = (s?.completed ?? 0) >= MATURITY_THRESHOLD;

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <button onClick={() => navigate({ to: "/investments" })} className="mb-4 inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200">
          <ArrowLeft size={16} /> Back to opportunities
        </button>

        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold-500 text-navy-950">
            <Award size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Investprop track record</h1>
            <p className="text-sm text-gray-400">
              How every deal on our platform has performed
              {s?.since ? ` since ${new Date(s.since).getFullYear()}` : ""}.
            </p>
          </div>
        </div>

        {q.isLoading ? (
          <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-gold-500" /></div>
        ) : !s ? (
          <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-10 text-center text-gray-300">
            Track record is unavailable right now.
          </div>
        ) : (
          <>
            {/* Headline stats */}
            <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard icon={Building2} label="Deals on platform" value={String(s.totalDeals)} />
              <StatCard icon={CheckCircle2} label="Completed" value={String(s.completed)} tone="good" />
              <StatCard icon={Clock} label="In progress" value={String(s.inProgress)} />
              <StatCard icon={TrendingUp} label="Raising now" value={String(s.raising)} />
            </div>

            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <StatCard icon={Banknote} label="Returned to investors" value={rand(s.totalDistributed)} tone="good" wide />
              <StatCard icon={Users} label="Investors on platform" value={String(s.totalInvestors)} wide />
            </div>

            {/* Delivery performance */}
            {mature ? (
              <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Milestones delivered on time</p>
                  <p className="mt-1 text-3xl font-bold text-emerald-700">{pct(s.onTimePct)}</p>
                  <p className="mt-1 text-xs text-emerald-700/70">across {s.milestonesTracked} tracked milestones</p>
                </div>
                <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Milestones on or under budget</p>
                  <p className="mt-1 text-3xl font-bold text-teal-700">{pct(s.onBudgetPct)}</p>
                </div>
              </div>
            ) : (
              <div className="mb-6 rounded-xl border border-gold-300 bg-gold-50 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-gold-700">
                  <Award size={16} /> A growing platform
                </p>
                <p className="mt-1 text-sm text-gold-800">
                  Investprop has {s.totalDeals} deal{s.totalDeals === 1 ? "" : "s"} on the platform
                  {s.inProgress > 0 ? `, ${s.inProgress} currently in progress` : ""}. Delivery percentages are
                  published once {MATURITY_THRESHOLD} or more projects have completed, so the numbers are meaningful
                  rather than based on a tiny sample.
                </p>
              </div>
            )}

            {s.capitalRaised > 0 && (
              <div className="mb-6 rounded-xl border border-navy-800/50 bg-navy-900/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Total capital deployed by investors</p>
                <p className="mt-1 text-2xl font-bold text-white">{rand(s.capitalRaised)}</p>
              </div>
            )}

            <RiskDisclaimer variant="compact" />
            <p className="mt-3 text-[11px] text-gray-500">
              Past performance of the platform is not a guarantee of future results. Each opportunity carries its own
              risks — read the deal documents and risk rating before investing.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = "neutral",
  wide = false,
}: {
  icon: any;
  label: string;
  value: string;
  tone?: "good" | "neutral";
  wide?: boolean;
}) {
  const cls = tone === "good" ? "text-emerald-600" : "text-gold-600";
  return (
    <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-4">
      <Icon size={18} className={`mb-2 ${cls}`} />
      <p className={`font-bold text-white ${wide ? "text-2xl" : "text-2xl"}`}>{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}
