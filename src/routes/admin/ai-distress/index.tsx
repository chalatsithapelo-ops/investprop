import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Activity, ShieldAlert, AlertTriangle, TrendingDown, ArrowRight } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/admin/ai-distress/")({
  component: AdminDistressPage,
});

const ADMIN_ROLES = ["ADMIN", "DEVELOPMENT_MANAGER"];

const BAND_META: Record<string, { cls: string; label: string }> = {
  HIGH: { cls: "border-rose-300 bg-rose-50 text-rose-700", label: "High risk" },
  ELEVATED: { cls: "border-orange-300 bg-orange-50 text-orange-700", label: "Elevated" },
  MODERATE: { cls: "border-amber-300 bg-amber-50 text-amber-700", label: "Moderate" },
  LOW: { cls: "border-emerald-300 bg-emerald-50 text-emerald-700", label: "Low" },
};

function AdminDistressPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const isAdmin = ADMIN_ROLES.includes(user?.role ?? "");

  const q = useQuery({
    ...trpc.listDistressedPortfolio.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isAdmin,
    refetchInterval: 60_000,
  });

  if (!user || !authToken) return null;

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <ShieldAlert className="mx-auto mb-4 text-red-600" size={48} />
          <h1 className="text-2xl font-bold text-gray-900">Admin only</h1>
          <p className="mt-2 text-gray-500">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }

  const rows = (q.data ?? []) as any[];

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400">
            <Activity size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Predictive distress watchlist</h1>
            <p className="text-sm text-gray-400">Deals the AI early-warning engine has flagged as elevated or high risk.</p>
          </div>
        </div>

        {q.isLoading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-rose-500 border-r-transparent" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-12 text-center">
            <TrendingDown className="mx-auto mb-3 text-emerald-500" size={40} />
            <p className="text-lg font-medium text-white">No elevated-risk deals</p>
            <p className="mt-1 text-sm text-gray-400">
              Run the distress engine from a property's timeline to populate this list. Nothing is currently flagged.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const meta = BAND_META[r.band] ?? BAND_META.MODERATE!;
              return (
                <Link
                  key={r.id}
                  to="/properties/$propertyId"
                  params={{ propertyId: String(r.propertyId) }}
                  className={`block rounded-xl border p-4 transition hover:shadow-md ${meta.cls}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <AlertTriangle size={20} />
                      <div>
                        <p className="font-semibold">{r.property?.title ?? `Property #${r.propertyId}`}</p>
                        <p className="text-xs opacity-80">{r.property?.city ?? ""}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-2xl font-bold">{r.score}</p>
                        <p className="text-[10px] font-medium uppercase tracking-wide">{meta.label}</p>
                      </div>
                      <ArrowRight size={18} className="opacity-60" />
                    </div>
                  </div>
                  {r.narrative && <p className="mt-2 text-xs leading-relaxed opacity-90">{r.narrative}</p>}
                  <p className="mt-1 text-[10px] opacity-60">
                    Last assessed {new Date(r.generatedAt).toLocaleString("en-ZA")}
                  </p>
                </Link>
              );
            })}
          </div>
        )}

        <p className="mt-6 text-xs text-gray-500">
          AI early-warning scores are diagnostic signals, not certainties. Confirm with the sponsor before acting.
        </p>
      </div>
    </div>
  );
}
