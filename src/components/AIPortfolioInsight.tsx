import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Loader2, TrendingUp, AlertCircle, X } from "lucide-react";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

interface Insight {
  type: string;
  severity: "INFO" | "ATTENTION" | "WARNING";
  message: string;
  action?: string;
}

const SEVERITY_CLS: Record<string, string> = {
  INFO: "border-slate-200 bg-white",
  ATTENTION: "border-amber-200 bg-amber-50",
  WARNING: "border-rose-200 bg-rose-50",
};

export function AIPortfolioInsight() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);

  const period = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

  const q = useQuery({
    ...trpc.getPortfolioInsight.queryOptions({ authToken: token ?? "", period }),
    enabled: !!token,
    refetchOnWindowFocus: false,
  });

  const m = useMutation(
    trpc.generatePortfolioInsight.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.getPortfolioInsight.queryKey({ authToken: token ?? "", period }) });
      },
    })
  );

  const dismiss = useMutation(
    trpc.dismissPortfolioInsight.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.getPortfolioInsight.queryKey({ authToken: token ?? "", period }) });
      },
    })
  );

  if (!token) return null;

  const insight = q.data;
  const isDismissed = insight?.dismissedAt;

  return (
    <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="rounded-full bg-violet-100 p-2">
            <Sparkles className="h-4 w-4 text-violet-700" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Your AI portfolio brief</h3>
            <p className="text-xs text-slate-500">{period}</p>
          </div>
        </div>
        {insight && !isDismissed && (
          <button
            type="button"
            onClick={() => dismiss.mutate({ authToken: token, period: insight.period })}
            className="text-slate-400 hover:text-slate-600"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {!insight && (
        <div className="mt-4 space-y-2">
          <p className="text-sm text-slate-600">Get a personalised AI brief on your portfolio: concentration risk, gap-filler ideas, distribution timing.</p>
          <button
            type="button"
            onClick={() => m.mutate({ authToken: token })}
            disabled={m.isPending}
            className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-3 py-1.5 text-sm text-white disabled:bg-slate-300"
          >
            {m.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <TrendingUp className="h-3 w-3" />}
            Generate brief
          </button>
          {m.isError && (
            <p className="flex items-start gap-1 text-xs text-rose-600">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              {m.error.message}
            </p>
          )}
        </div>
      )}

      {insight && (
        <div className="mt-4 space-y-3">
          <p className="text-sm leading-relaxed text-slate-700">{insight.summary}</p>
          {Array.isArray(insight.insights) && (insight.insights as unknown as Insight[]).length > 0 && (
            <ul className="space-y-2">
              {(insight.insights as unknown as Insight[]).map((it, i) => (
                <li key={i} className={`rounded-lg border p-3 text-sm ${SEVERITY_CLS[it.severity] ?? SEVERITY_CLS.INFO}`}>
                  <div className="font-semibold text-slate-800">{it.type}</div>
                  <p className="mt-0.5 text-xs text-slate-600">{it.message}</p>
                  {it.action && <p className="mt-1 text-xs font-medium text-violet-700">→ {it.action}</p>}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[10px] text-slate-400">
            Research only — not financial advice. Consult a registered financial planner before acting.
          </p>
        </div>
      )}
    </div>
  );
}
