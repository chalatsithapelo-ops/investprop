import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Sparkles, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

type Props = { documentId: number };

interface KeyClause {
  clause: string;
  plainEnglish: string;
  severity: "INFO" | "ATTENTION" | "WARNING";
}
interface GlossaryItem {
  term: string;
  definition: string;
}

const SEVERITY_CLS: Record<string, string> = {
  INFO: "border-slate-200 bg-slate-50",
  ATTENTION: "border-amber-200 bg-amber-50",
  WARNING: "border-rose-200 bg-rose-50",
};

export function AIDocSummary({ documentId }: Props) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const [open, setOpen] = useState(true);

  const q = useQuery({
    ...trpc.getLegalDocumentSummary.queryOptions({ authToken: token ?? "", documentId }),
    enabled: !!token,
  });

  const m = useMutation(
    trpc.summariseLegalDocument.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.getLegalDocumentSummary.queryKey({ authToken: token ?? "", documentId }) });
      },
    })
  );

  if (!token) return null;
  const summary = q.data;

  return (
    <div className="rounded-xl border border-violet-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Sparkles className="h-4 w-4 text-violet-600" />
          AI plain-English summary
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="space-y-3 border-t border-violet-100 px-4 py-3 text-sm">
          {!summary && (
            <div className="space-y-2">
              <p className="text-slate-600">No summary yet.</p>
              <button
                type="button"
                onClick={() => m.mutate({ authToken: token, documentId })}
                disabled={m.isPending}
                className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-3 py-1 text-xs text-white disabled:bg-slate-300"
              >
                {m.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                Generate summary
              </button>
              {m.isError && <p className="text-xs text-rose-600">{m.error.message}</p>}
            </div>
          )}

          {summary && (
            <>
              <p className="leading-relaxed text-slate-700">{summary.summary}</p>

              {Array.isArray(summary.keyClauses) && summary.keyClauses.length > 0 && (
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Watch out for</h4>
                  <ul className="space-y-2">
                    {(summary.keyClauses as unknown as KeyClause[]).map((c, i) => (
                      <li key={i} className={`rounded-lg border px-3 py-2 text-xs ${SEVERITY_CLS[c.severity] ?? SEVERITY_CLS.INFO}`}>
                        <div className="font-medium text-slate-800">{c.clause}</div>
                        <div className="mt-0.5 text-slate-600">{c.plainEnglish}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {Array.isArray(summary.glossary) && summary.glossary.length > 0 && (
                <details className="rounded-lg bg-slate-50 px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-600">Glossary</summary>
                  <dl className="mt-2 space-y-1 text-xs">
                    {(summary.glossary as unknown as GlossaryItem[]).map((g, i) => (
                      <div key={i}>
                        <dt className="font-semibold text-slate-700">{g.term}</dt>
                        <dd className="text-slate-600">{g.definition}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              )}

              <div className="flex items-center justify-between pt-1">
                <p className="text-[10px] text-slate-400">
                  AI summary — not legal advice. Read the full document before signing.
                </p>
                <button
                  type="button"
                  onClick={() => m.mutate({ authToken: token, documentId, force: true })}
                  disabled={m.isPending}
                  className="text-[10px] text-violet-600 hover:underline disabled:opacity-50"
                >
                  Regenerate
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
