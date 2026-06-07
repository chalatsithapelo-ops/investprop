import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, Sparkles, Loader2, Send, Save, Clock, CheckCircle2 } from "lucide-react";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

type Props = { propertyId: number };

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function AIInvestorUpdateEditor({ propertyId }: Props) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);

  const [activeId, setActiveId] = useState<number | null>(null);
  const [subject, setSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [confirmSend, setConfirmSend] = useState(false);

  const listQ = useQuery({
    ...trpc.listInvestorUpdates.queryOptions({ authToken: token ?? "", propertyId }),
    enabled: !!token,
  });
  const drafts = (listQ.data ?? []) as any[];
  const active = drafts.find((d) => d.id === activeId) ?? null;

  function loadDraft(d: any) {
    setActiveId(d.id);
    setSubject(d.subject);
    setBodyHtml(d.bodyHtml);
    setBodyText(d.bodyText);
    setConfirmSend(false);
  }

  const genM = useMutation(
    trpc.generateInvestorUpdate.mutationOptions({
      onSuccess: (d: any) => {
        toast.success("Draft generated");
        qc.invalidateQueries({ queryKey: trpc.listInvestorUpdates.queryKey({ authToken: token ?? "", propertyId }) });
        loadDraft(d);
      },
      onError: (e: any) => toast.error(e?.message ?? "Generation failed"),
    })
  );

  const saveM = useMutation(
    trpc.updateInvestorDraft.mutationOptions({
      onSuccess: () => {
        toast.success("Draft saved");
        qc.invalidateQueries({ queryKey: trpc.listInvestorUpdates.queryKey({ authToken: token ?? "", propertyId }) });
      },
      onError: (e: any) => toast.error(e?.message ?? "Save failed"),
    })
  );

  const sendM = useMutation(
    trpc.sendInvestorUpdate.mutationOptions({
      onSuccess: (r: any) => {
        toast.success(`Sent to ${r.sent} investor${r.sent === 1 ? "" : "s"}${r.failed ? ` (${r.failed} failed)` : ""}`);
        qc.invalidateQueries({ queryKey: trpc.listInvestorUpdates.queryKey({ authToken: token ?? "", propertyId }) });
        setConfirmSend(false);
      },
      onError: (e: any) => toast.error(e?.message ?? "Send failed"),
    })
  );

  if (!token) return null;
  const period = currentPeriod();
  const alreadySent = active?.status === "SENT";

  return (
    <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Mail className="h-4 w-4 text-indigo-600" /> Investor update emails
        </h3>
        <button
          onClick={() => genM.mutate({ authToken: token, propertyId, period })}
          disabled={genM.isPending}
          className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1 text-xs font-medium text-white disabled:bg-slate-300"
        >
          {genM.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          {genM.isPending ? "Drafting…" : `Draft ${period}`}
        </button>
      </div>

      {drafts.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {drafts.map((d) => (
            <button
              key={d.id}
              onClick={() => loadDraft(d)}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                activeId === d.id ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-navy-700 text-gray-400 hover:text-gray-200"
              }`}
            >
              {d.status === "SENT" ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <Clock className="h-3 w-3" />}
              {d.period}
            </button>
          ))}
        </div>
      )}

      {!active ? (
        <p className="py-6 text-center text-xs text-gray-500">
          No drafts yet. Generate a monthly update from milestones, budget and distributions.
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={alreadySent}
              className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2 text-sm text-gray-900 disabled:opacity-60"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Preview</label>
            <div
              className="max-h-72 overflow-y-auto rounded-lg border border-navy-700 bg-white p-4 text-sm text-slate-800"
              dangerouslySetInnerHTML={{ __html: bodyHtml }}
            />
          </div>
          <details className="rounded-lg bg-navy-800/30 px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-gray-400">Edit HTML body</summary>
            <textarea
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              disabled={alreadySent}
              rows={8}
              className="mt-2 w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2 font-mono text-xs text-gray-900 disabled:opacity-60"
            />
            <label className="mt-2 mb-1 block text-xs text-gray-500">Plain-text fallback</label>
            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              disabled={alreadySent}
              rows={5}
              className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2 font-mono text-xs text-gray-900 disabled:opacity-60"
            />
          </details>

          {alreadySent ? (
            <p className="flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Sent {active.sentAt ? new Date(active.sentAt).toLocaleString("en-ZA") : ""}
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => saveM.mutate({ authToken: token, draftId: active.id, subject, bodyHtml, bodyText })}
                disabled={saveM.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg border border-navy-700 px-3 py-2 text-xs font-medium text-gray-300 hover:bg-navy-800 disabled:opacity-50"
              >
                {saveM.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
              </button>
              {confirmSend ? (
                <button
                  onClick={() => sendM.mutate({ authToken: token, draftId: active.id })}
                  disabled={sendM.isPending}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {sendM.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Confirm send to all investors
                </button>
              ) : (
                <button
                  onClick={() => setConfirmSend(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700"
                >
                  <Send className="h-3 w-3" /> Send…
                </button>
              )}
            </div>
          )}
          <p className="text-[10px] text-gray-500">
            Review every draft before sending — AI can misread data. Save edits, then send to all investors in this deal.
          </p>
        </div>
      )}
    </div>
  );
}
