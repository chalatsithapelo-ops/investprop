import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import Markdown from "markdown-to-jsx";
import { Award, Building2, CheckCircle2, Clock, TrendingUp, ShieldAlert, Loader2, ArrowLeft, Sparkles } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { RiskDisclaimer } from "~/components/RiskDisclaimer";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/sponsors/$sponsorId/")({
  component: SponsorTrackRecordPage,
});

// Below this many completed deals we DON'T publish performance percentages —
// a tiny sample would unfairly flatter or damn a sponsor. Instead we frame it
// as an emerging track record.
const MATURITY_THRESHOLD = 3;

function pct(n: number | null | undefined): string {
  return n == null ? "—" : `${Math.round(n)}%`;
}

function SponsorTrackRecordPage() {
  const { sponsorId } = Route.useParams();
  const trpc = useTRPC();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const isOversight = user?.role === "ADMIN" || user?.role === "DEVELOPMENT_MANAGER";

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !token) navigate({ to: "/login" });
    else if (!isOversight) navigate({ to: "/dashboard" });
  }, [user, token, hasHydrated, isOversight]);

  const q = useQuery({
    ...trpc.getSponsorTrackRecord.queryOptions({ authToken: token ?? "", sponsorUserId: Number(sponsorId) }),
    enabled: !!token && isOversight,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  if (!user || !token || !isOversight) return null;

  const data = q.data;
  const stats = data?.stats;
  const mature = (stats?.completed ?? 0) >= MATURITY_THRESHOLD;

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <button onClick={() => navigate({ to: "/admin/team" })} className="mb-4 inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-200">
          <ArrowLeft size={16} /> Back to team performance
        </button>

        {q.isLoading ? (
          <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-gold-500" /></div>
        ) : q.isError || !stats ? (
          <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-10 text-center">
            <ShieldAlert className="mx-auto mb-3 text-gray-500" size={40} />
            <p className="text-gray-300">Sponsor track record is unavailable.</p>
          </div>
        ) : (
          <>
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold-500 text-navy-950"><Award size={24} /></div>
              <div>
                <h1 className="text-2xl font-bold text-white">{stats.sponsorName}</h1>
                <p className="text-sm text-gray-400">
                  Sponsor on Investprop{stats.memberSince ? ` since ${new Date(stats.memberSince).getFullYear()}` : ""}
                </p>
              </div>
            </div>

            {/* Headline stats */}
            <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatCard icon={Building2} label="Total deals" value={String(stats.totalDeals)} tone="neutral" />
              <StatCard icon={CheckCircle2} label="Completed" value={String(stats.completed)} tone="good" />
              <StatCard icon={Clock} label="In progress" value={String(stats.inProgress)} tone="neutral" />
              <StatCard
                icon={TrendingUp}
                label="Avg target return"
                value={stats.avgPromisedReturn != null ? `${stats.avgPromisedReturn.toFixed(1)}%` : "—"}
                tone="neutral"
              />
            </div>

            {mature ? (
              <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Milestones delivered on time</p>
                  <p className="mt-1 text-3xl font-bold text-emerald-700">{pct(stats.onTimePct)}</p>
                </div>
                <div className="rounded-xl border border-teal-200 bg-teal-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Milestones on or under budget</p>
                  <p className="mt-1 text-3xl font-bold text-teal-700">{pct(stats.onBudgetPct)}</p>
                </div>
              </div>
            ) : (
              <div className="mb-6 rounded-xl border border-gold-300 bg-gold-50 p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-gold-700">
                  <Sparkles size={16} /> Building a track record
                </p>
                <p className="mt-1 text-sm text-gold-800">
                  This sponsor has {stats.totalDeals} deal{stats.totalDeals === 1 ? "" : "s"} on the platform
                  {stats.inProgress > 0 ? `, ${stats.inProgress} currently in progress` : ""}. Delivery percentages are
                  published once {MATURITY_THRESHOLD} or more projects have completed, so the sample is meaningful.
                </p>
              </div>
            )}

            {/* AI narrative profile */}
            {data?.narrative && (
              <div className="mb-6 rounded-xl border border-violet-200 bg-white p-5">
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Sparkles className="h-4 w-4 text-violet-600" /> Independent profile
                </h2>
                <div className="prose prose-sm max-w-none text-slate-700">
                  <Markdown>{data.narrative}</Markdown>
                </div>
                <p className="mt-3 text-[10px] text-slate-400">
                  AI-generated summary based on platform data — research, not financial advice.
                </p>
              </div>
            )}

            <RiskDisclaimer variant="compact" />
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone: "good" | "neutral" }) {
  const cls = tone === "good" ? "text-emerald-600" : "text-gold-600";
  return (
    <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-4">
      <Icon size={18} className={`mb-2 ${cls}`} />
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  );
}
