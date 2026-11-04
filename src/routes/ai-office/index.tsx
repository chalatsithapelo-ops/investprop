import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight, BookOpen, Building2, CheckCircle2, ChevronRight,
  FileText, History, Landmark, Plus, RefreshCw, Send, ShieldCheck,
  Sparkles, Wallet,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { TaskInbox } from "~/components/office/TaskInbox";
import { ScenarioPanel } from "~/components/office/ScenarioPanel";
import { TaxSourceEditor } from "~/components/office/TaxSourceEditor";
import { VoiceRecorder } from "~/components/office/VoiceRecorder";
import {
  errorMessage, formatDate, jsonPreview, officeApi, safeSourceUrl,
  type AudioMime, type Persona,
} from "~/components/office/api";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/ai-office/")({ component: AIOfficePage });

const specialists = [
  { id: "ACCOUNTANT", title: "Accountant", icon: Wallet, subtitle: "Records & reconciliation", intro: "Organise your property records and prepare questions for your accountant.", prompts: ["Summarise my recorded holdings and paid distributions, citing evidence and gaps.", "What records are missing for an accountant review?"] },
  { id: "TAX", title: "Tax researcher", icon: Landmark, subtitle: "Sources & tax questions", intro: "Explore dated tax sources, not personalised tax advice or a filing service.", prompts: ["Which dated tax sources apply to questions about my recorded distributions? Flag uncertainty.", "Prepare questions to ask a registered tax practitioner about my property records."] },
  { id: "ASSET", title: "Asset analyst", icon: Building2, subtitle: "Property evidence & gaps", intro: "Review recorded property exposure without trade recommendations or invented valuations.", prompts: ["Explain my recorded property exposure. Distinguish recorded basis from market value.", "What evidence is missing before reviewing my property portfolio?"] },
  { id: "ADMIN", title: "Office assistant", icon: FileText, subtitle: "Documents & checklists", intro: "Find document gaps and organise next steps; every executable office task needs separate approval.", prompts: ["Summarise my documents and proposals, with missing information clearly marked.", "Suggest an owner document checklist without drafting or signing legal agreements."] },
] as const satisfies readonly { id: Persona; title: string; icon: typeof Wallet; subtitle: string; intro: string; prompts: readonly string[] }[];

const money = (value: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 2 }).format(value);
const panel = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6";

function AIOfficePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const authToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const hydrated = useAuthStore((state) => state._hasHydrated);
  const [persona, setPersona] = useState<Persona>("ACCOUNTANT");
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState<string | null>(null);
  const [audioReply, setAudioReply] = useState<string | null>(null);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const replyPlayer = useRef<HTMLAudioElement>(null);
  const [turnBusy, setTurnBusy] = useState(false);
  const [microphoneBusy, setMicrophoneBusy] = useState(false);
  const turnLock = useRef(false);
  const endOfMessages = useRef<HTMLDivElement>(null);
  const accountId = user?.id;
  const enabled = hydrated && !!user && !!authToken;
  const scope = ["ai-office", accountId, authToken];
  const overview = useQuery({ queryKey: [...scope, "overview"], queryFn: () => officeApi.overview({ authToken: authToken ?? "" }), enabled, retry: false });
  const history = useQuery({ queryKey: [...scope, "conversations"], queryFn: () => officeApi.conversations({ authToken: authToken ?? "" }), enabled, retry: false });
  const conversation = useQuery({ queryKey: [...scope, "conversation", conversationId], queryFn: () => officeApi.conversation({ authToken: authToken ?? "", conversationId: conversationId ?? "" }), enabled: enabled && !!conversationId, retry: false });
  const sources = useQuery({ queryKey: [...scope, "taxSources"], queryFn: () => officeApi.taxSources({ authToken: authToken ?? "" }), enabled, retry: false });
  const chat = useMutation({ mutationFn: officeApi.chat });
  const voice = useMutation({ mutationFn: officeApi.voice });
  const activeAccount = useRef(accountId);
  activeAccount.current = accountId;

  useEffect(() => {
    if (hydrated && (!user || !authToken)) void navigate({ to: "/login" });
  }, [hydrated, user, authToken, navigate]);

  useEffect(() => {
    setConversationId(undefined); setDraft(""); setError(null); setLastTranscript(null); setAudioReply(null); setSpeechError(null);
  }, [accountId]);

  useEffect(() => {
    endOfMessages.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [conversation.data?.messages.length, turnBusy]);

  useEffect(() => {
    return () => { if (audioReply) URL.revokeObjectURL(audioReply); };
  }, [audioReply]);

  if (!enabled || !user || !authToken) return <><Navbar /><main className="mx-auto max-w-7xl p-8 text-slate-600" role="status">{hydrated ? "Redirecting to sign in…" : "Loading your secure office…"}</main></>;

  const specialist = specialists.find((item) => item.id === persona) ?? specialists[0];
  const requestBusy = turnBusy || chat.isPending || voice.isPending;
  const busy = requestBusy || microphoneBusy;
  const textEnabled = overview.data?.capabilities.textAI === true;
  const voiceEnabled = overview.data?.capabilities.voice === true;

  async function sendTurn(audio?: { audioBase64: string; mimeType: AudioMime }) {
    if (!authToken || !user || turnLock.current || (!audio && !draft.trim())) return;
    const sendingAccount = user.id;
    const text = draft.trim();
    turnLock.current = true; setTurnBusy(true); setError(null); setAudioReply(null); setLastTranscript(null); setSpeechError(null);
    try {
      const input = { authToken, conversationId, persona };
      const result = audio
        ? await voice.mutateAsync({ ...input, ...audio, speechConsent: true })
        : await chat.mutateAsync({ ...input, message: text });
      if (activeAccount.current !== sendingAccount) return;
      setConversationId(result.conversationId);
      // Show the server reply immediately, then fetch canonical history (which
      // also includes the persisted user turn). Never fabricate evidence.
      queryClient.setQueryData<Awaited<ReturnType<typeof officeApi.conversation>>>([...scope, "conversation", result.conversationId], (old) => ({
        id: result.conversationId, title: old?.title ?? "Office conversation",
        messages: [...(old?.messages ?? []).filter((message) => message.id !== result.message.id), result.message],
      }));
      if (!audio) setDraft("");
      if ("transcript" in result && typeof result.transcript === "string") setLastTranscript(result.transcript);
      if ("speechError" in result && typeof result.speechError === "string") setSpeechError(result.speechError);
      if ("audioBase64" in result && typeof result.audioBase64 === "string" && "audioMimeType" in result && typeof result.audioMimeType === "string") {
        // The server permits 5 MiB of speech bytes; base64 is larger.
        try {
          if (result.audioBase64.length > Math.ceil(5 * 1024 * 1024 / 3) * 4 || !/^audio\/(webm|mp4|wav|ogg|mpeg)(;|$)/.test(result.audioMimeType)) throw new Error("Reply audio has an unsupported format or exceeds the playback size limit. The complete text reply remains available.");
          const binary = atob(result.audioBase64);
          const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
          setAudioReply(URL.createObjectURL(new Blob([bytes], { type: result.audioMimeType })));
        } catch (err) { setSpeechError(errorMessage(err)); }
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [...scope, "conversation", result.conversationId] }),
        queryClient.invalidateQueries({ queryKey: [...scope, "conversations"] }),
        queryClient.invalidateQueries({ queryKey: [...scope, "overview"] }),
      ]);
    } catch (err) {
      if (activeAccount.current === sendingAccount) setError(errorMessage(err));
    } finally {
      turnLock.current = false; setTurnBusy(false);
    }
  }

  function newConversation() {
    setConversationId(undefined); setError(null); setDraft(""); setLastTranscript(null); setAudioReply(null); setSpeechError(null);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <Navbar />
      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="relative overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-xl sm:p-8">
          <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-32 h-96 w-96 rounded-full bg-amber-400/10 blur-3xl" />
          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-2xl"><p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-300"><Sparkles size={16} />Your property research workspace</p><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">AI Property Office</h1><p className="mt-3 text-sm leading-relaxed text-slate-300 sm:text-base">Four specialist perspectives. Your live records. Clear evidence, honest gaps and office tasks that stay under your control.</p></div>
            <div className="flex flex-col gap-2 text-xs"><span className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-amber-200"><ShieldCheck size={14} />Research only · human review required</span><span className="px-3 text-slate-300">{overview.isPending ? "Checking server capabilities…" : overview.error ? "Capabilities could not be verified" : `Text AI ${textEnabled ? "available" : "unavailable"} · Voice ${voiceEnabled ? "available" : "unavailable"}`}</span></div>
          </div>
        </header>
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950"><ShieldCheck size={20} className="mt-0.5 shrink-0 text-amber-700" /><p><strong>Not financial, tax or legal advice.</strong> This office cannot move money, trade shares, submit tax returns, post accounting entries, certify statements or sign agreements. AI outputs may be incomplete or wrong; consult qualified professionals. Recorded basis is not a market valuation.</p></div>

        <section aria-label="Live account overview" className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold text-slate-700">Grounded in your account records</h2><button type="button" onClick={() => { void overview.refetch(); void history.refetch(); void sources.refetch(); }} disabled={overview.isFetching} className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-800 disabled:opacity-50"><RefreshCw size={14} className={overview.isFetching ? "animate-spin" : ""} />Refresh live evidence</button></div>
          {overview.error && <p role="alert" className="mb-4 break-words rounded-xl bg-red-50 p-4 text-sm text-red-800">Live overview: {errorMessage(overview.error)}</p>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
            { label: "Recorded holdings", value: overview.data ? String(overview.data.holdings.length) : "—", detail: "Properties represented in your records", icon: Building2 },
            { label: "Paid distributions · net", value: overview.data ? money(overview.data.paidDistributions.net) : "—", detail: overview.data ? `${overview.data.paidDistributions.count} paid records · not a forecast` : "Awaiting live records", icon: Wallet },
            { label: "Documents on record", value: overview.data ? String(overview.data.documents.length) : "—", detail: "Availability is not verification", icon: FileText },
            { label: "Evidence gaps", value: overview.data ? String(overview.data.gaps.length) : "—", detail: "Missing information stays visible", icon: BookOpen },
          ].map((stat) => <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between text-xs font-medium text-slate-500"><span>{stat.label}</span><stat.icon size={18} className="text-amber-700" /></div><p className="mt-3 text-2xl font-bold tracking-tight">{stat.value}</p><p className="mt-1 text-xs text-slate-500">{stat.detail}</p></div>)}</div>
          {overview.isPending && <p role="status" className="mt-3 text-sm text-slate-500">Loading live records; no placeholder financial figures are shown.</p>}
        </section>

        <div className="mt-6 grid items-start gap-6 xl:grid-cols-[240px_minmax(0,1fr)_340px]">
          <aside className={`${panel} xl:sticky xl:top-24`} aria-labelledby="history-heading">
            <div className="flex items-center justify-between"><h2 id="history-heading" className="flex items-center gap-2 text-sm font-bold"><History size={16} className="text-amber-700" />Conversations</h2><button type="button" aria-label="Refresh conversations" disabled={history.isFetching} onClick={() => { void history.refetch(); }} className="rounded-lg p-1.5 hover:bg-slate-100"><RefreshCw size={14} /></button></div>
            <button type="button" disabled={busy} onClick={newConversation} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold hover:border-amber-400 disabled:opacity-50"><Plus size={16} />New conversation</button>
            {history.isPending && <p role="status" className="mt-4 text-xs text-slate-500">Loading history…</p>}
            {history.error && <p role="alert" className="mt-4 break-words text-xs text-red-700">{errorMessage(history.error)}</p>}
            {history.data?.length === 0 && <p className="mt-5 text-xs leading-relaxed text-slate-500">Your conversations will appear here after your first message.</p>}
            <ul className="mt-4 max-h-80 space-y-1 overflow-y-auto xl:max-h-[520px]">{history.data?.map((item) => <li key={item.id}><button type="button" disabled={busy} aria-current={conversationId === item.id ? "true" : undefined} onClick={() => { setConversationId(item.id); setError(null); setLastTranscript(null); setAudioReply(null); setSpeechError(null); setDraft(""); }} className={`w-full rounded-xl p-3 text-left transition disabled:opacity-50 ${conversationId === item.id ? "bg-slate-900 text-white" : "hover:bg-slate-50"}`}><span className="block truncate text-sm font-medium">{item.title}</span><span className={`mt-1 block text-[11px] ${conversationId === item.id ? "text-slate-300" : "text-slate-500"}`}>{formatDate(item.createdAt)}</span></button></li>)}</ul>
          </aside>

          <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-label="Specialist research conversation">
            <div role="tablist" aria-label="Office specialists" className="grid grid-cols-2 gap-1 border-b border-slate-200 bg-slate-50 p-2 sm:grid-cols-4">{specialists.map((item, index) => <button key={item.id} type="button" role="tab" id={`specialist-${item.id}`} aria-controls="specialist-panel" aria-selected={persona === item.id} tabIndex={persona === item.id ? 0 : -1} disabled={busy} onClick={() => setPersona(item.id)} onKeyDown={(event) => {
              const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
              const next = event.key === "Home" ? 0 : event.key === "End" ? specialists.length - 1 : direction ? (index + direction + specialists.length) % specialists.length : -1;
              const nextSpecialist = specialists[next];
              if (nextSpecialist) { event.preventDefault(); setPersona(nextSpecialist.id); document.getElementById(`specialist-${nextSpecialist.id}`)?.focus(); }
            }} className={`rounded-xl px-2 py-3 text-left transition disabled:opacity-50 ${persona === item.id ? "bg-slate-900 text-amber-200 shadow-sm" : "text-slate-600 hover:bg-white"}`}><item.icon size={17} className="mb-2" /><span className="block text-xs font-semibold">{item.title}</span><span className={`mt-1 hidden text-[10px] sm:block ${persona === item.id ? "text-slate-300" : "text-slate-500"}`}>{item.subtitle}</span></button>)}</div>
            <div id="specialist-panel" role="tabpanel" aria-labelledby={`specialist-${persona}`} className="p-5 sm:p-6">
              <div className="flex items-center gap-3"><div className="rounded-xl bg-amber-50 p-3 text-amber-700"><specialist.icon size={22} /></div><div><h2 className="font-bold">{specialist.title}</h2><p className="mt-1 text-xs leading-relaxed text-slate-500">{specialist.intro}</p></div></div>
              <p className="mt-3 text-[11px] text-slate-500">Changing specialists sets the next turn’s perspective; this conversation’s history remains shared.</p>
              <div className="mt-5 min-h-64 max-h-[560px] space-y-4 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/70 p-4" role="log" aria-label="Conversation messages" aria-live="polite" aria-busy={busy || conversation.isFetching}>
                {!conversationId && <div className="py-6 text-center"><Sparkles size={28} className="mx-auto text-amber-600" /><h3 className="mt-3 font-semibold">A clearer view starts with a question</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">Ask about your records. Your specialist should cite evidence and flag what cannot be established.</p></div>}
                {conversationId && conversation.isPending && <p role="status" className="text-sm text-slate-500">Loading conversation…</p>}
                {conversation.error && <p role="alert" className="break-words rounded-xl bg-red-50 p-3 text-sm text-red-800">Conversation: {errorMessage(conversation.error)}</p>}
                {conversation.data?.messages.length === 0 && <p className="text-sm text-slate-500">No messages in this conversation yet.</p>}
                {conversation.data?.messages.map((message) => <article key={message.id} className={`rounded-xl border p-4 ${message.role.toLowerCase() === "user" ? "ml-4 border-slate-200 bg-white" : "mr-2 border-amber-100 bg-amber-50/50"}`}><div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold text-slate-500"><span>{message.role.toLowerCase() === "user" ? "You" : `Office · ${message.role}`}</span><time>{formatDate(message.createdAt)}</time></div><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800">{message.content}</p>{message.evidence != null && <details className="mt-3 text-xs text-slate-600"><summary className="cursor-pointer font-semibold text-amber-800">Evidence supplied by server</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-white p-3">{jsonPreview(message.evidence)}</pre></details>}</article>)}
                {requestBusy && <p role="status" className="flex items-center gap-2 text-sm text-slate-500"><Sparkles size={16} className="animate-pulse text-amber-600" />Consulting recorded evidence…</p>}<div ref={endOfMessages} />
              </div>
              {!conversationId && <div className="mt-4 grid gap-2">{specialist.prompts.map((prompt) => <button key={prompt} type="button" disabled={busy || !textEnabled} onClick={() => setDraft(prompt)} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-left text-xs leading-relaxed text-slate-600 hover:border-amber-400 disabled:opacity-50">{prompt}<ChevronRight size={14} className="shrink-0 text-amber-700" /></button>)}</div>}
              {error && <p role="alert" className="mt-4 break-words rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
              {lastTranscript && <div className="mt-4 rounded-xl bg-slate-50 p-3"><h3 className="text-xs font-semibold">Server voice transcript</h3><p className="mt-1 whitespace-pre-wrap text-sm">{lastTranscript}</p></div>}
              {speechError && <p role="alert" className="mt-3 break-words rounded-xl bg-amber-50 p-3 text-sm text-amber-950">Voice playback: {speechError}</p>}
              {audioReply && <div className="mt-3"><p id="reply-audio-label" className="mb-2 text-xs font-semibold">Optional AI-generated voice reply — press play to listen. Complete answer and evidence remain in text above.</p><audio ref={replyPlayer} controls preload="none" aria-labelledby="reply-audio-label" src={audioReply} className="max-w-full" onError={() => setSpeechError("Reply audio could not be played. The text reply remains available.")} /><button type="button" className="mt-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold" onClick={() => { if (replyPlayer.current) { replyPlayer.current.pause(); replyPlayer.current.currentTime = 0; } }}>Stop playback</button></div>}
              <form className="mt-5" onSubmit={(event) => { event.preventDefault(); void sendTurn(); }}><label htmlFor="office-message" className="text-xs font-semibold text-slate-700">Message your {specialist.title.toLowerCase()}</label><textarea id="office-message" rows={3} value={draft} maxLength={2000} disabled={busy || !textEnabled || (!!conversationId && !conversation.data)} onChange={(event) => setDraft(event.target.value)} placeholder="Ask a research question about your property records…" className="mt-2 w-full resize-y rounded-xl border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50" /><div className="mt-2 flex items-center justify-between gap-3"><p className="text-[11px] text-slate-500">{textEnabled ? "Avoid unnecessary personal or sensitive information." : "Text AI unavailable until the server confirms capability."}</p><button type="submit" disabled={busy || !textEnabled || !draft.trim() || (!!conversationId && !conversation.data)} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"><Send size={15} />Send</button></div></form>
              <div className="mt-4"><VoiceRecorder key={accountId} enabled={voiceEnabled && (!conversationId || !!conversation.data)} busy={requestBusy} contextKey={`${accountId}:${persona}:${conversationId ?? "new"}`} onSend={(audioBase64, mimeType) => sendTurn({ audioBase64, mimeType })} onError={setError} onRecordingChange={setMicrophoneBusy} /></div>
            </div>
          </section>

          <aside className="min-w-0 space-y-4" aria-label="Supporting account evidence">
            <section className={panel}><h2 className="flex items-center gap-2 text-sm font-bold"><Building2 size={17} className="text-amber-700" />Recorded holdings</h2><ul className="mt-4 space-y-3">{overview.data?.holdings.map((holding) => <li key={holding.propertyId} className="rounded-xl bg-slate-50 p-3"><p className="text-sm font-semibold">{holding.title}</p><p className="mt-1 text-xs text-slate-500">Property #{holding.propertyId} · {holding.shares.toLocaleString("en-ZA")} shares</p><p className="mt-2 text-sm font-semibold">{money(holding.basisValue)}</p><p className="text-xs text-slate-500">{holding.basisLabel}</p></li>)}</ul>{overview.data?.holdings.length === 0 && <p className="mt-3 text-xs text-slate-500">No recorded holdings returned.</p>}{overview.data && <dl className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-xs"><div className="flex justify-between gap-2"><dt>Paid distributions · gross</dt><dd className="font-semibold">{money(overview.data.paidDistributions.gross)}</dd></div><div className="flex justify-between gap-2"><dt>Recorded withholding</dt><dd className="font-semibold">{money(overview.data.paidDistributions.withheld)}</dd></div><div className="flex justify-between gap-2"><dt>Paid distributions · net</dt><dd className="font-semibold">{money(overview.data.paidDistributions.net)}</dd></div></dl>}</section>
            <section className={panel}><h2 className="flex items-center gap-2 text-sm font-bold"><BookOpen size={17} className="text-amber-700" />Evidence & dates</h2><p className="mt-2 text-xs text-slate-500">Source dates below are supplied by the server, not inferred from refresh time.</p><ul className="mt-3 space-y-3">{overview.data?.evidence.map((item) => <li key={item.id} className="border-l-2 border-amber-300 pl-3"><p className="text-xs font-semibold">{item.label}</p><p className="mt-1 text-[11px] text-slate-500">{item.kind} · As of {formatDate(item.asOf)}</p></li>)}</ul>{overview.data?.evidence.length === 0 && <p className="mt-3 text-xs text-slate-500">No dated evidence returned.</p>}{overview.data && <div className="mt-4 rounded-xl bg-amber-50 p-3"><h3 className="text-xs font-semibold text-amber-900">Known gaps</h3>{overview.data.gaps.length ? <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-amber-900">{overview.data.gaps.map((gap, index) => <li key={`${index}-${gap}`}>{gap}</li>)}</ul> : <p className="mt-1 text-xs text-amber-900">No gaps reported by the server. This is not a completeness assurance.</p>}</div>}</section>
            <section className={panel}><h2 className="flex items-center gap-2 text-sm font-bold"><FileText size={17} className="text-amber-700" />Documents & proposals</h2><ul className="mt-3 space-y-3">{overview.data?.documents.map((doc) => <li key={doc.id} className="flex gap-2 text-xs"><FileText size={14} className="mt-0.5 shrink-0 text-slate-400" /><div><p className="font-medium">{doc.title}</p><p className="mt-1 text-slate-500">{doc.documentType} · ID {doc.id}{doc.propertyId != null ? ` · Property #${doc.propertyId}` : ""}</p></div></li>)}</ul>{overview.data?.documents.length === 0 && <p className="mt-3 text-xs text-slate-500">No documents returned.</p>}<ul className="mt-4 space-y-2 border-t border-slate-100 pt-3">{overview.data?.proposals.map((proposal) => <li key={proposal.id} className="text-xs"><p className="font-medium">{proposal.title}</p><p className="mt-1 text-slate-500">Proposal #{proposal.id} · {proposal.status}</p></li>)}</ul>{overview.data?.proposals.length === 0 && <p className="text-xs text-slate-500">No proposals returned.</p>}</section>
          </aside>
        </div>

        <ScenarioPanel key={`${accountId}:${authToken}`} authToken={authToken} accountId={user.id} holdings={overview.data?.holdings ?? []} />
        {user.role === "ADMIN" && <TaxSourceEditor key={`${accountId}:${authToken}`} authToken={authToken} accountId={user.id} role={user.role} sources={sources.data ?? []} />}

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <TaskInbox key={accountId} authToken={authToken} accountId={user.id} proposalIds={(overview.data?.proposals ?? []).flatMap((proposal) => typeof proposal.id === "number" && Number.isInteger(proposal.id) ? [{ id: proposal.id, title: proposal.title }] : [])} />
          <section className={panel} aria-labelledby="tax-sources-heading"><div className="flex items-start justify-between gap-3"><div><h2 id="tax-sources-heading" className="flex items-center gap-2 text-lg font-bold"><Landmark size={20} className="text-amber-700" />Tax research library</h2><p className="mt-1 text-sm text-slate-500">Authority, effective periods and review status — visible before reliance.</p></div><button type="button" aria-label="Refresh tax sources" disabled={sources.isFetching} onClick={() => { void sources.refetch(); }} className="rounded-lg p-2 hover:bg-slate-100"><RefreshCw size={16} /></button></div>
            {sources.error && <p role="alert" className="mt-4 break-words rounded-xl bg-red-50 p-3 text-sm text-red-800">Tax sources: {errorMessage(sources.error)}</p>}{sources.isPending && <p role="status" className="mt-4 text-sm text-slate-500">Loading source register…</p>}{sources.data?.length === 0 && <p className="mt-4 text-sm text-slate-500">No tax sources returned. Do not infer current tax rules from this office.</p>}
            <ul className="mt-5 space-y-4">{sources.data?.map((source) => { const url = safeSourceUrl(source.url); return <li key={source.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><h3 className="text-sm font-semibold">{source.title}</h3><span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold">{source.status}</span></div><p className="mt-2 text-xs font-medium text-amber-800">{source.authority}</p><dl className="mt-3 space-y-1 text-xs text-slate-500"><div><dt className="inline font-medium">Effective from: </dt><dd className="inline">{formatDate(source.effectiveFrom)}</dd></div><div><dt className="inline font-medium">Effective to: </dt><dd className="inline">{formatDate(source.effectiveTo)}</dd></div><div><dt className="inline font-medium">Reviewed: </dt><dd className="inline">{formatDate(source.reviewedAt)}</dd></div></dl>{url ? <a href={url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-amber-800 underline underline-offset-4">Read source (opens new tab)<ArrowUpRight size={13} /></a> : <p className="mt-3 text-xs text-red-700">Source URL unavailable or unsafe.</p>}</li>; })}</ul>
            <p className="mt-5 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-amber-700" />A listed source is not proof that it applies to your circumstances. Confirm current legislation and professional advice; downloaded office packs are draft JSON, never certified PDFs.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
