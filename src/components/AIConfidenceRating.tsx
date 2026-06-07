import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Sparkles, ChevronDown, ChevronUp, Loader2, Info } from "lucide-react";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

type Props = { propertyId: number };

const MANAGER_ROLES = ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"];

// Constructive, non-alarming framing. The rating is an independent second
// opinion, deliberately worded to inform rather than discourage.
const RATING_META: Record<string, { label: string; blurb: string; cls: string; ring: string }> = {
  A: { label: "A — Strong", blurb: "Numbers look conservative and consistent with platform comparables.", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", ring: "ring-emerald-200" },
  B: { label: "B — Solid", blurb: "Broadly sound with minor optimism; stress tests stay positive.", cls: "bg-teal-50 text-teal-700 border-teal-200", ring: "ring-teal-200" },
  C: { label: "C — Fair", blurb: "Reasonable, with a few assumptions worth understanding before you invest.", cls: "bg-amber-50 text-amber-700 border-amber-200", ring: "ring-amber-200" },
  D: { label: "D — Cautious", blurb: "Several factors deserve closer attention — read the detail carefully.", cls: "bg-orange-50 text-orange-700 border-orange-200", ring: "ring-orange-200" },
  E: { label: "E — High scrutiny", blurb: "Significant factors to consider. Review all documents and seek advice.", cls: "bg-rose-50 text-rose-700 border-rose-200", ring: "ring-rose-200" },
};

interface StressRow { scenario: string; baseValue: string; stressedValue: string; impact: string }
interface DeviationRow { metric: string; sponsorValue: string; platformView: string; severity: "LOW" | "MEDIUM" | "HIGH" }

export function AIConfidenceRating({ propertyId }: Props) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);

  const isManager = MANAGER_ROLES.includes(user?.role ?? "");

  const q = useQuery({
    ...trpc.getUnderwriting.queryOptions({ authToken: token ?? "", propertyId }),
    enabled: !!token,
    staleTime: 12 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const run = useMutation(
    trpc.runUnderwriting.mutationOptions({
      onSuccess: () => {
        toast.success("Independent underwriting complete");
        qc.invalidateQueries({ queryKey: trpc.getUnderwriting.queryKey({ authToken: token ?? "", propertyId }) });
      },
      onError: (e: any) => toast.error(e?.message ?? "Underwriting failed"),
    })
  );

  if (!token) return null;

  // No rating yet: investors see nothing; managers see a run button.
  if (!q.data) {
    if (!isManager) return null;
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <ShieldCheck className="h-4 w-4 text-indigo-600" />
          Investprop Confidence Rating
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Run an independent, sponsor-agnostic second opinion before publishing this deal.
        </p>
        <button
          type="button"
          onClick={() => run.mutate({ authToken: token, propertyId })}
          disabled={run.isPending}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1 text-xs font-medium text-white disabled:bg-slate-300"
        >
          {run.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          {run.isPending ? "Underwriting…" : "Run underwriting"}
        </button>
      </div>
    );
  }

  const rating = q.data.confidenceRating ?? "C";
  const meta = RATING_META[rating] ?? RATING_META.C!;
  const uw = (q.data.underwriting ?? {}) as {
    comparableAnalysis?: string;
    stressTest?: StressRow[];
    deviations?: DeviationRow[];
    recommendations?: string[];
  };

  return (
    <div className={`rounded-xl border ${meta.cls}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-2 px-4 py-3">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4" />
          Investprop Confidence Rating
        </span>
        <span className="inline-flex items-center gap-2">
          <span className={`inline-flex items-center rounded-full border bg-white/70 px-2 py-0.5 text-sm font-bold ring-2 ${meta.ring}`}>{meta.label}</span>
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      <div className="px-4 pb-3">
        <p className="text-xs font-medium opacity-90">{meta.blurb}</p>
      </div>

      {open && (
        <div className="space-y-3 border-t border-white/60 bg-white/50 px-4 py-3 text-xs text-slate-700">
          <div className="flex items-start gap-2 rounded-lg bg-white px-3 py-2">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
            <p>
              An <strong>independent</strong> assessment generated by Investprop — separate from the sponsor — that
              stress-tests the deal and compares it to similar opportunities. It is <strong>research, not advice</strong>,
              and a lower letter means &ldquo;ask more questions&rdquo;, not &ldquo;avoid&rdquo;.
            </p>
          </div>

          {q.data.summary && <p className="leading-relaxed">{q.data.summary}</p>}

          {uw.comparableAnalysis && (
            <div>
              <h4 className="mb-1 font-semibold uppercase tracking-wide text-slate-500">Versus comparable deals</h4>
              <p className="leading-relaxed">{uw.comparableAnalysis}</p>
            </div>
          )}

          {Array.isArray(uw.stressTest) && uw.stressTest.length > 0 && (
            <div>
              <h4 className="mb-1 font-semibold uppercase tracking-wide text-slate-500">Stress tests</h4>
              <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full text-[11px]">
                  <thead className="bg-slate-50 text-left text-slate-500">
                    <tr><th className="px-2 py-1">Scenario</th><th className="px-2 py-1">Base</th><th className="px-2 py-1">Stressed</th><th className="px-2 py-1">Impact</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {uw.stressTest.map((s, i) => (
                      <tr key={i}><td className="px-2 py-1 font-medium">{s.scenario}</td><td className="px-2 py-1">{s.baseValue}</td><td className="px-2 py-1">{s.stressedValue}</td><td className="px-2 py-1 text-slate-600">{s.impact}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {Array.isArray(uw.recommendations) && uw.recommendations.length > 0 && (
            <div>
              <h4 className="mb-1 font-semibold uppercase tracking-wide text-slate-500">Questions worth asking</h4>
              <ul className="list-inside list-disc space-y-0.5">
                {uw.recommendations.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between pt-1">
            <p className="text-[10px] text-slate-400">
              AI underwriting — not financial advice. {q.data.generatedAt ? `Generated ${new Date(q.data.generatedAt).toLocaleDateString("en-ZA")}.` : ""}
            </p>
            {isManager && (
              <button
                type="button"
                onClick={() => run.mutate({ authToken: token, propertyId, force: true })}
                disabled={run.isPending}
                className="text-[10px] text-indigo-600 hover:underline disabled:opacity-50"
              >
                {run.isPending ? "Re-running…" : "Re-run"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
