import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Sparkles, Loader2, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

type Props = { propertyId: number };

const PRIORITY_META: Record<string, string> = {
  HIGH: "bg-rose-100 text-rose-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  LOW: "bg-slate-100 text-slate-600",
};

function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-rose-600";
}

export function AIListingCoach({ propertyId }: Props) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const [open, setOpen] = useState(false);

  const q = useQuery({
    ...trpc.getListingCoachResult.queryOptions({ authToken: token ?? "", propertyId }),
    enabled: !!token,
  });
  const result = q.data as
    | { score: number; feedback: { strengths: string[]; weaknesses: string[]; suggestions: { area: string; suggestion: string; priority: string }[]; generatedAt: string } | null }
    | null
    | undefined;

  const run = useMutation(
    trpc.coachListing.mutationOptions({
      onSuccess: () => {
        toast.success("Listing reviewed");
        void qc.invalidateQueries({ queryKey: trpc.getListingCoachResult.queryKey({ authToken: token ?? "", propertyId }) });
        setOpen(true);
      },
      onError: (e) => toast.error(e.message || "Coach failed"),
    })
  );

  if (!token) return null;

  const fb = result?.feedback;

  return (
    <div className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50/60 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-indigo-600" />
          <h3 className="text-sm font-semibold text-gray-900">AI listing quality coach</h3>
          {result && (
            <span className={`ml-2 text-sm font-bold ${scoreColor(result.score)}`}>{result.score}/100</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {result && (
            <button onClick={() => setOpen((v) => !v)} className="text-gray-500 hover:text-gray-900">
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
          <button
            onClick={() => run.mutate({ authToken: token, propertyId })}
            disabled={run.isPending}
            className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {run.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {run.isPending ? "Reviewing…" : result ? "Re-check" : "Check my listing"}
          </button>
        </div>
      </div>

      {!result && !run.isPending && (
        <p className="mt-2 text-xs text-gray-500">
          Get an honest, investor's-eye score on photos, description, financials and documents before you publish.
        </p>
      )}

      {result && open && fb && (
        <div className="mt-4 space-y-4">
          {fb.strengths.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">Strengths</p>
              <ul className="space-y-1">
                {fb.strengths.map((s, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-gray-900">
                    <CheckCircle2 className="mt-0.5 h-3 w-3 flex-shrink-0 text-emerald-600" /> {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {fb.weaknesses.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-rose-700">Gaps</p>
              <ul className="space-y-1">
                {fb.weaknesses.map((s, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-gray-900">
                    <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0 text-rose-600" /> {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {fb.suggestions.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Recommended actions</p>
              <ul className="space-y-2">
                {fb.suggestions.map((s, i) => (
                  <li key={i} className="rounded-lg border border-navy-700 bg-white/60 p-2">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${PRIORITY_META[s.priority] ?? PRIORITY_META.MEDIUM}`}>
                        {s.priority}
                      </span>
                      <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{s.area}</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-900">{s.suggestion}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {fb.generatedAt && (
            <p className="text-[10px] text-gray-500">Last reviewed {new Date(fb.generatedAt).toLocaleString("en-ZA")}</p>
          )}
        </div>
      )}
    </div>
  );
}
