import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

type Props = { propertyId: number; compact?: boolean };

const BAND_STYLES: Record<string, { label: string; cls: string }> = {
  STRONG_MATCH: { label: "Strong match", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  GOOD_MATCH: { label: "Good match", cls: "bg-teal-50 text-teal-700 border-teal-200" },
  FAIR_MATCH: { label: "Fair match", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  POOR_MATCH: { label: "Poor match", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  MISMATCH: { label: "Mismatch", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

export function AIMatchBadge({ propertyId, compact = false }: Props) {
  const trpc = useTRPC();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);

  const enabled = !!token && (user?.role === "INVESTOR" || user?.role === "ADMIN");

  const q = useQuery({
    ...trpc.getMatchScore.queryOptions({ authToken: token ?? "", propertyId }),
    enabled,
    staleTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  if (!enabled || q.isError || !q.data) return null;
  const cfg = BAND_STYLES[q.data.band] ?? BAND_STYLES.FAIR_MATCH!;

  if (compact) {
    return (
      <span
        title={q.data.justification}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.cls}`}
      >
        <Sparkles className="h-3 w-3" />
        {q.data.score}/100
      </span>
    );
  }

  return (
    <div className={`rounded-lg border p-3 ${cfg.cls}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4" />
          {cfg.label}
        </div>
        <span className="text-lg font-bold">{q.data.score}/100</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed opacity-90">{q.data.justification}</p>
    </div>
  );
}
