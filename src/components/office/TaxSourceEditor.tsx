import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { errorMessage, jsonPreview, officeApi, safeSourceUrl, taxSourceDraftSchema, type TaxSourceReview } from "./api";

const field = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-100";
const button = "rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50";

export function TaxSourceEditor({ authToken, accountId, role, sources = [] }: {
  authToken: string; accountId: number; role: string;
  sources?: Awaited<ReturnType<typeof officeApi.taxSources>>;
}) {
  const queryClient = useQueryClient();
  const create = useMutation({ mutationFn: officeApi.createTaxSource });
  const publish = useMutation({ mutationFn: officeApi.publishTaxSource });
  const [preview, setPreview] = useState<TaxSourceReview | null>(null);
  const [attested, setAttested] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = create.isPending || publish.isPending;

  function refreshSources() {
    void queryClient.invalidateQueries({ queryKey: ["ai-office", accountId, authToken, "taxSources"] });
  }

  async function createDraft(form: HTMLFormElement) {
    if (role !== "ADMIN" || busy || preview) return;
    setError(null); setNotice(null); setAttested(false);
    try {
      const data = new FormData(form);
      const text = (name: string) => {
        const value = data.get(name);
        return typeof value === "string" ? value.trim() : "";
      };
      const iso = (name: string) => {
        const value = text(name);
        const date = new Date(value);
        if (!value || !Number.isFinite(date.getTime())) throw new Error(`Enter a valid ${name} date and time.`);
        return date.toISOString();
      };
      const draft = taxSourceDraftSchema.parse({ title: text("title"), url: text("url"), authority: text("authority"),
        effectiveFrom: iso("effectiveFrom"), ...(text("effectiveTo") ? { effectiveTo: iso("effectiveTo") } : {}),
        applicability: text("applicability"), content: text("content"),
        ...(text("previousSourceId") ? { previousSourceId: text("previousSourceId") } : {}),
      });
      if (draft.effectiveTo && new Date(draft.effectiveTo) <= new Date(draft.effectiveFrom)) throw new Error("Effective to must be after effective from (exclusive).");
      const source = await create.mutateAsync({ authToken, ...draft });
      setPreview(source); refreshSources();
      setNotice("Immutable draft saved, not published. Review the exact server-returned content and digest below. Form edits cannot change this draft.");
    } catch (err) { setError(errorMessage(err)); }
  }

  async function publishDraft() {
    if (role !== "ADMIN" || busy || !preview || !attested) return;
    setError(null); setNotice(null);
    try {
      const source = await publish.mutateAsync({ authToken, sourceId: preview.id, version: preview.version,
        reviewDigest: preview.reviewDigest, reviewedPublishAttestation: true });
      setPreview(null); setAttested(false); refreshSources();
      setNotice(`Source ${source.id}, version ${source.version}: server status ${source.status}. No tax return or personalised advice was authorised.`);
    } catch (err) { setError(errorMessage(err)); setAttested(false); refreshSources(); }
  }

  if (role !== "ADMIN") return null;

  return <section aria-labelledby="tax-editor-heading" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <h2 id="tax-editor-heading" className="flex items-center gap-2 text-lg font-bold"><ShieldCheck size={20} className="text-amber-700" />Admin · human-reviewed tax sources</h2>
    <p className="mt-2 text-sm text-slate-600">Create an immutable draft, inspect its exact content, then explicitly attest before publication. No AI auto-publication. Server ADMIN authorisation is required.</p>
    <p className="mt-2 text-xs leading-relaxed text-slate-500">Use canonical HTTPS sources from SARS, gov.za or SAFLII; authority must match the host. Existing URLs require the latest source ID to create a new version. Approved versions cannot overlap effective periods.</p>
    {sources.length > 0 && <details className="mt-4 rounded-xl bg-slate-50 p-3 text-xs"><summary className="cursor-pointer font-semibold">Source version references from the current register</summary><p className="mt-2 text-slate-500">The register may be limited. The server verifies which previous source ID is latest for each canonical URL.</p><ul className="mt-3 space-y-3">{sources.map((source) => <li key={source.id} className="break-words border-t border-slate-200 pt-2"><p className="font-semibold">{source.title} · v{source.version} · {source.status}</p><p className="mt-1 break-all">Source ID: {source.id}</p><p className="mt-1 break-all">{source.url}</p></li>)}</ul></details>}
    <form className="mt-5 grid gap-3 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void createDraft(event.currentTarget); }}>
      <fieldset disabled={busy || !!preview} className="contents">
        <label className="text-xs font-semibold">Source title<input name="title" required maxLength={200} className={field} /></label>
        <label className="text-xs font-semibold">Authority<select name="authority" required defaultValue="" className={field}><option value="" disabled>Select authority</option><option value="SARS">SARS</option><option value="GOV_ZA">GOV_ZA</option><option value="SAFLII">SAFLII</option></select></label>
        <label className="text-xs font-semibold sm:col-span-2">Canonical source URL<input name="url" type="url" required maxLength={2000} className={field} /></label>
        <label className="text-xs font-semibold">Effective from (local time, sent as UTC)<input name="effectiveFrom" type="datetime-local" step={1} required className={field} /></label>
        <label className="text-xs font-semibold">Effective to (optional, exclusive; local time)<input name="effectiveTo" type="datetime-local" step={1} className={field} /></label>
        <label className="text-xs font-semibold sm:col-span-2">Latest previous source ID (optional for a new URL)<input name="previousSourceId" maxLength={128} className={field} /></label>
        <label className="text-xs font-semibold sm:col-span-2">Applicability<textarea name="applicability" required maxLength={2000} rows={3} className={field} /></label>
        <label className="text-xs font-semibold sm:col-span-2">Exact source content for human review<textarea name="content" required maxLength={20000} rows={8} className={field} /></label>
        <div className="sm:col-span-2"><button type="submit" className={button}>{create.isPending ? "Saving draft…" : "Save immutable draft for review"}</button></div>
      </fieldset>
    </form>
    {error && <p role="alert" className="mt-4 break-words rounded-xl bg-red-50 p-3 text-sm text-red-800">Tax source review: {error}</p>}
    {notice && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    {preview && <div className="mt-5 rounded-xl border-2 border-amber-400 bg-amber-50/50 p-4">
      <h3 className="font-bold">Immutable server draft · {preview.title}</h3>
      <p className="mt-2 text-xs">Read-only preview of the saved version — not the editable form. Changes require creating a new immutable version.</p>
      {safeSourceUrl(preview.url) && <a href={safeSourceUrl(preview.url)} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs font-semibold text-amber-900 underline">Open authoritative source in new tab</a>}
      <h4 className="mt-4 text-xs font-semibold">Exact server content</h4><pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-sm">{preview.content}</pre>
      <h4 className="mt-4 text-xs font-semibold">Exact applicability</h4><p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-sm">{preview.applicability}</p>
      <h4 className="mt-4 text-xs font-semibold">Identity, version, effective dates & content hash</h4><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-xs">{jsonPreview({ id: preview.id, version: preview.version, status: preview.status, title: preview.title, url: preview.url, authority: preview.authority, effectiveFrom: preview.effectiveFrom, effectiveTo: preview.effectiveTo, contentHash: preview.contentHash, reviewedAt: preview.reviewedAt, createdAt: preview.createdAt, updatedAt: preview.updatedAt })}</pre>
      <h4 className="mt-4 text-xs font-semibold">Returned reviewDigest (sent unchanged)</h4><p className="mt-2 break-all rounded-lg bg-white p-3 font-mono text-xs">{preview.reviewDigest}</p>
      <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={attested} disabled={busy} onChange={(event) => setAttested(event.target.checked)} className="mt-1 accent-amber-600" /><span>I personally reviewed this exact immutable source content, applicability, authority, effective dates, version and digest against the authoritative source. I attest to human review and authorise publication of only this draft version.</span></label>
      <div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={!attested || busy} onClick={() => { void publishDraft(); }} className={button}>{publish.isPending ? "Publishing reviewed version…" : "Publish exact reviewed draft"}</button><button type="button" disabled={busy} onClick={() => { setPreview(null); setAttested(false); setError(null); setNotice("Review closed. The immutable draft remains saved and unpublished; use its source ID as the previous ID when creating its next version."); }} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">Close without publishing</button></div>
    </div>}
  </section>;
}