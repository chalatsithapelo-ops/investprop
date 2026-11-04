import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, Download, Inbox, X } from "lucide-react";
import {
  errorMessage, formatDate, jsonPreview, officeApi, taskKindSchema,
  type OfficeTask, type TaskParameters,
} from "./api";

const field = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500";
const button = "rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50";

function isExpired(task: OfficeTask): boolean {
  if (!task.expiresAt) return true; // No expiry means approval cannot be safely previewed.
  const time = new Date(task.expiresAt).getTime();
  return !Number.isFinite(time) || time <= Date.now();
}

function downloadTask(task: OfficeTask) {
  const content = jsonPreview({
    notice: "Research-only office output. Not a certified statement, tax return or legal document. Professional review required.",
    taskId: task.id, title: task.title, kind: task.kind, status: task.status,
    parameters: task.parameters, result: task.result, createdAt: task.createdAt,
  });
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `office-pack-${task.id.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function TaskInbox({ authToken, accountId, proposalIds }: {
  authToken: string; accountId: number; proposalIds: { id: number; title: string }[];
}) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState("REMINDER");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [taxYear, setTaxYear] = useState("");
  const [proposalId, setProposalId] = useState("");
  const [preview, setPreview] = useState<OfficeTask | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const queryKey = ["ai-office", accountId, authToken, "tasks"];
  const tasks = useQuery({ queryKey, queryFn: () => officeApi.tasks({ authToken }), retry: false });
  const prepare = useMutation({ mutationFn: officeApi.prepare });
  const approve = useMutation({ mutationFn: officeApi.approve });
  const cancel = useMutation({ mutationFn: officeApi.cancel });
  const busy = prepare.isPending || approve.isPending || cancel.isPending;

  function updateTask(task: OfficeTask) {
    queryClient.setQueryData<OfficeTask[]>(queryKey, (old) => [task, ...(old ?? []).filter((item) => item.id !== task.id)]);
    void queryClient.invalidateQueries({ queryKey });
  }

  async function prepareTask() {
    setError(null); setNotice(null);
    try {
      const parameters: TaskParameters = {};
      if (notes.trim()) parameters.notes = notes.trim();
      if (kind === "REMINDER") {
        const date = new Date(dueAt);
        if (!dueAt || !Number.isFinite(date.getTime()) || date.getTime() <= Date.now()) throw new Error("Choose a future reminder date and time.");
        parameters.dueAt = date.toISOString();
      }
      if (kind === "ACCOUNTANT_PACK" && taxYear) {
        const year = Number(taxYear);
        if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error("Tax year must be a whole year between 2000 and 2100.");
        parameters.taxYear = year;
      }
      if (kind === "OWNER_CHECKLIST" && proposalId) parameters.proposalId = Number(proposalId);
      const task = await prepare.mutateAsync({ authToken, kind: taskKindSchema.parse(kind), title: title.trim(), parameters });
      updateTask(task); setPreview(task); setAccepted(false); setTitle("");
      setNotice("Task prepared, not approved. Review the server's exact preview and digest below.");
    } catch (err) { setError(errorMessage(err)); }
  }

  async function approveTask() {
    if (!preview || !accepted || !preview.approvalDigest || busy) return;
    setError(null); setNotice(null);
    try {
      if (preview.status !== "PREPARED" || isExpired(preview)) throw new Error("This preview has expired or is not prepared. Refresh and prepare a new task.");
      const task = await approve.mutateAsync({ authToken, taskId: preview.id, approvalDigest: preview.approvalDigest });
      updateTask(task); setPreview(null); setAccepted(false);
      setNotice(`Server task status: ${task.status}. No financial or legal action was authorised.`);
    } catch (err) { setError(errorMessage(err)); setAccepted(false); void queryClient.invalidateQueries({ queryKey }); }
  }

  async function cancelTask(task: OfficeTask) {
    setError(null); setNotice(null);
    try {
      const result = await cancel.mutateAsync({ authToken, taskId: task.id });
      updateTask(result); if (preview?.id === task.id) { setPreview(null); setAccepted(false); }
      setNotice(`Server task status: ${result.status}.`);
    } catch (err) { setError(errorMessage(err)); }
  }

  return (
    <section aria-labelledby="task-heading" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div><h2 id="task-heading" className="flex items-center gap-2 text-lg font-bold text-slate-900"><Inbox size={20} className="text-amber-700" />Office task inbox</h2><p className="mt-1 text-sm text-slate-500">Prepare → review exact scope → explicitly approve.</p></div>
        <button type="button" onClick={() => { void tasks.refetch(); }} disabled={tasks.isFetching} className="text-sm font-semibold text-amber-800 disabled:opacity-50">Refresh tasks</button>
      </div>
      <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">Only reminders, draft accountant packs and owner checklists are available. Payments, trades, tax submissions, ledger posting, contract signing and other financial/legal actions are unavailable.</p>
      <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void prepareTask(); }}>
        <label className="text-sm font-medium text-slate-700">Task type<select value={kind} onChange={(event) => setKind(event.target.value)} className={field} disabled={busy}>
          <option value="REMINDER">Reminder</option><option value="ACCOUNTANT_PACK">Draft accountant pack</option><option value="OWNER_CHECKLIST">Owner checklist</option>
        </select></label>
        <label className="text-sm font-medium text-slate-700">Title<input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} className={field} placeholder="e.g. Review property records" disabled={busy} /></label>
        {kind === "REMINDER" && <label className="text-sm font-medium text-slate-700">Due date & time (your local time)<input type="datetime-local" required value={dueAt} onChange={(event) => setDueAt(event.target.value)} className={field} disabled={busy} /></label>}
        {kind === "ACCOUNTANT_PACK" && <label className="text-sm font-medium text-slate-700">Tax year (optional)<input type="number" min={2000} max={2100} step={1} value={taxYear} onChange={(event) => setTaxYear(event.target.value)} className={field} disabled={busy} /></label>}
        {kind === "OWNER_CHECKLIST" && <label className="text-sm font-medium text-slate-700">Proposal (optional)<select value={proposalId} onChange={(event) => setProposalId(event.target.value)} className={field} disabled={busy}><option value="">General owner checklist</option>{proposalIds.map((proposal) => <option key={proposal.id} value={proposal.id}>{proposal.title}</option>)}</select></label>}
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">Notes (optional)<textarea rows={2} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} className={field} disabled={busy} /></label>
        <div className="sm:col-span-2"><button type="submit" disabled={busy || !title.trim()} className={button}>{prepare.isPending ? "Preparing…" : "Prepare for review"}</button></div>
      </form>
      {error && <p role="alert" className="mt-4 break-words rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
      {preview && <div className="mt-5 rounded-xl border-2 border-amber-400 bg-amber-50/50 p-4">
        <div className="flex items-start justify-between gap-2"><h3 className="font-bold text-slate-900">Approval preview: {preview.title}</h3><button type="button" aria-label="Close approval preview" disabled={busy} onClick={() => { setPreview(null); setAccepted(false); }}><X size={18} /></button></div>
        <dl className="mt-3 grid gap-2 text-xs text-slate-700"><div><dt className="font-semibold">Task ID / kind / status</dt><dd className="break-all">{preview.id} / {preview.kind} / {preview.status}</dd></div><div><dt className="font-semibold">Created / approval expiry</dt><dd>{formatDate(preview.createdAt)} / {formatDate(preview.expiresAt)}</dd></div><div><dt className="font-semibold">Server approval digest (sent unchanged)</dt><dd className="mt-1 break-all font-mono">{preview.approvalDigest || "Missing — approval unavailable"}</dd></div></dl>
        <h4 className="mt-3 text-xs font-semibold">Exact parameters</h4><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-xs">{jsonPreview(preview.parameters)}</pre>
        <h4 className="mt-3 text-xs font-semibold">Server result / proposed output</h4><pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-xs">{jsonPreview(preview.result)}</pre>
        <label className="mt-4 flex items-start gap-2 text-sm text-slate-800"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} disabled={busy || preview.status !== "PREPARED" || !preview.approvalDigest || isExpired(preview)} className="mt-1 accent-amber-600" /><span>I reviewed these exact parameters, output and digest. I approve only this office task, not financial or legal actions.</span></label>
        {(isExpired(preview) || preview.status !== "PREPARED") && <p className="mt-2 text-xs text-red-800">Approval unavailable: expired, missing expiry or not prepared.</p>}
        <button type="button" disabled={busy || !accepted || !preview.approvalDigest || isExpired(preview) || preview.status !== "PREPARED"} onClick={() => { void approveTask(); }} className={`${button} mt-3 inline-flex items-center gap-2`}><CheckCheck size={16} />{approve.isPending ? "Approving…" : "Approve exact task"}</button>
      </div>}
      {tasks.error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">Task inbox: {errorMessage(tasks.error)}</p>}
      {tasks.isPending && <p role="status" className="mt-5 text-sm text-slate-500">Loading task inbox…</p>}
      {tasks.data?.length === 0 && <p className="mt-5 rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-500">No office tasks yet. Prepare a draft above.</p>}
      <ul className="mt-5 space-y-3">{tasks.data?.map((task) => <li key={task.id} className="rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="text-sm font-semibold text-slate-900">{task.title}</h3><p className="mt-1 text-xs text-slate-500">{task.kind.replaceAll("_", " ")} • {formatDate(task.createdAt)}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{task.status}</span></div>
        <p className="mt-2 text-xs text-slate-500">Approval expires: {formatDate(task.expiresAt)}</p>
        <div className="mt-3 flex flex-wrap gap-3">
          {task.status === "PREPARED" && <><button type="button" disabled={busy} onClick={() => { setPreview(task); setAccepted(false); }} className="text-sm font-semibold text-amber-800">Review preview & digest</button><button type="button" disabled={busy} onClick={() => { void cancelTask(task); }} className="text-sm font-semibold text-red-700">Cancel task</button></>}
          {task.status === "COMPLETED" && task.result != null && <button type="button" onClick={() => { try { downloadTask(task); } catch (err) { setError(errorMessage(err)); } }} className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-800"><Download size={15} />Download research output (JSON)</button>}
        </div>
        {task.result != null && <details className="mt-3 text-xs text-slate-600"><summary className="cursor-pointer font-medium">View server result</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3">{jsonPreview(task.result)}</pre></details>}
      </li>)}</ul>
    </section>
  );
}
