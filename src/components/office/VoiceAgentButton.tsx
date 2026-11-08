import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Mic, PhoneOff, Loader2, X } from "lucide-react";
import {
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
} from "livekit-client";
import { useAuthStore } from "~/stores/authStore";
import { officeApi, errorMessage } from "~/components/office/api";

type SessionState = "idle" | "connecting" | "live" | "error";

interface TranscriptLine {
  id: number;
  role: "user" | "assistant";
  text: string;
  final: boolean;
}

/**
 * Maps the agent's canonical page names (see NAV_PAGES in the worker) to the
 * web app's routes. Entries returning params carry a numeric property/listing
 * id. Names the web app has no screen for are simply omitted (the packet is
 * ignored). Keep in sync with the Flutter overlay's navigation map.
 */
const WEB_NAV: Record<string, (id?: number) => { to: string; params?: Record<string, string> }> = {
  dashboard: () => ({ to: "/dashboard" }),
  opportunities: () => ({ to: "/investments/opportunities" }),
  property: (id) => ({ to: "/investments/opportunities/$opportunityId", params: { opportunityId: String(id ?? "") } }),
  invest: (id) => ({ to: "/investments/opportunities/$opportunityId", params: { opportunityId: String(id ?? "") } }),
  portfolio: () => ({ to: "/portfolio" }),
  wallet: () => ({ to: "/wallet" }),
  deposit: () => ({ to: "/wallet" }),
  withdraw: () => ({ to: "/wallet" }),
  transactions: () => ({ to: "/wallet" }),
  distributions: () => ({ to: "/distributions" }),
  contributions: () => ({ to: "/investments/my-contributions" }),
  payments: () => ({ to: "/investments/payments" }),
  marketplace: () => ({ to: "/share-marketplace" }),
  ledger: () => ({ to: "/share-ledger" }),
  shareIntegrity: () => ({ to: "/share-integrity" }),
  metrics: () => ({ to: "/metrics" }),
  documents: () => ({ to: "/my-documents" }),
  taxCertificates: () => ({ to: "/tax-certificates" }),
  certificates: () => ({ to: "/investments/certificates" }),
  statements: () => ({ to: "/statements" }),
  trackRecord: () => ({ to: "/track-record" }),
  kyc: () => ({ to: "/kyc-compliance" }),
  distressedDeals: () => ({ to: "/distressed-deals" }),
  distressedAlerts: () => ({ to: "/distressed-alerts" }),
  distressedFinder: () => ({ to: "/distressed-finder" }),
  landPartnership: () => ({ to: "/land-partnership" }),
  resaleMarket: () => ({ to: "/resale-market" }),
  saleProposals: () => ({ to: "/sale-proposals" }),
  subscription: () => ({ to: "/billing" }),
  pricing: () => ({ to: "/pricing" }),
  preferences: () => ({ to: "/investments/preferences" }),
  prequalify: () => ({ to: "/finance/prequalify" }),
  homeLoan: () => ({ to: "/finance/home-loan" }),
  aiOffice: () => ({ to: "/ai-office" }),
};


/**
 * Floating realtime voice-agent button. Appears for signed-in, office-eligible
 * members when the agent is configured on the server. Pressing it opens a live
 * LiveKit room, dispatches the office agent, streams the member's mic, and plays
 * the agent's audio. All office actions still run server-side under the member's
 * own token with the existing guard rails.
 */
export function VoiceAgentButton() {
  const authToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const hydrated = useAuthStore((state) => state._hasHydrated);
  const navigate = useNavigate();

  const roomRef = React.useRef<Room | null>(null);
  const audioContainerRef = React.useRef<HTMLDivElement | null>(null);
  const transcriptEndRef = React.useRef<HTMLDivElement | null>(null);
  const transcriptSeq = React.useRef(0);
  const [state, setState] = React.useState<SessionState>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [agentSpeaking, setAgentSpeaking] = React.useState(false);
  const [transcript, setTranscript] = React.useState<TranscriptLine[]>([]);
  const [showTranscript, setShowTranscript] = React.useState(true);

  const enabled = Boolean(hydrated && user && authToken);

  // Keep the newest transcript line in view.
  React.useEffect(() => {
    if (showTranscript) transcriptEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [transcript, showTranscript]);

  // Merge an incoming transcript packet. Non-final lines are "live" and get
  // replaced in place until their final version lands, so the member sees text
  // stream in without the panel flickering duplicate rows.
  const appendTranscript = React.useCallback((role: "user" | "assistant", text: string, final: boolean) => {
    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === role && !last.final) {
        const updated = prev.slice(0, -1);
        updated.push({ ...last, text, final });
        return updated.slice(-50);
      }
      return [...prev, { id: transcriptSeq.current++, role, text, final }].slice(-50);
    });
  }, []);

  // Only reveal the button when the agent is actually configured + permitted.
  const status = useQuery({
    queryKey: ["voice-agent-status", user?.id, authToken],
    queryFn: () => officeApi.voiceAgentStatus({ authToken: authToken ?? "" }),
    enabled,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const teardown = React.useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      try {
        await room.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    if (audioContainerRef.current) audioContainerRef.current.replaceChildren();
    setAgentSpeaking(false);
  }, []);
  React.useEffect(() => {
    // Ensure we never leak a live mic/room if the component unmounts.
    return () => {
      void teardown();
    };
  }, [teardown]);

  const start = React.useCallback(async () => {
    if (!authToken) return;
    setError(null);
    setTranscript([]);
    setState("connecting");
    try {
      const session = await officeApi.voiceAgentSession({ authToken });
      const room = new Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication, _p: RemoteParticipant) => {
          if (track.kind === Track.Kind.Audio && audioContainerRef.current) {
            const element = track.attach();
            element.setAttribute("data-office-agent-audio", "true");
            audioContainerRef.current.appendChild(element);
          }
        })
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach().forEach((element) => element.remove());
        })
        .on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          // Anyone speaking who is not the local participant is the agent.
          setAgentSpeaking(speakers.some((speaker) => speaker.identity !== session.identity));
        })
        .on(RoomEvent.DataReceived, (payload: Uint8Array, _p, _kind, topic?: string) => {
          // The agent drives the member's screen (office-agent-ui) and streams a
          // live transcript (office-agent-transcript) over the data channel.
          try {
            const message = JSON.parse(new TextDecoder().decode(payload)) as {
              type?: string;
              page?: string;
              id?: number;
              role?: string;
              text?: string;
              final?: boolean;
            };
            if (topic === "office-agent-transcript" || message.type === "transcript") {
              if (typeof message.text !== "string" || !message.text.trim()) return;
              const role = message.role === "assistant" ? "assistant" : "user";
              appendTranscript(role, message.text, message.final !== false);
              return;
            }
            if (topic && topic !== "office-agent-ui") return;
            if (message.type !== "navigate" || !message.page) return;
            const entry = WEB_NAV[message.page];
            if (!entry) return;
            void navigate(entry(message.id) as never);
          } catch {
            /* ignore malformed packets */
          }
        })
        .on(RoomEvent.Disconnected, () => {
          setState("idle");
          void teardown();
        });

      await room.connect(session.url, session.token);
      await room.localParticipant.setMicrophoneEnabled(true);
      setState("live");
    } catch (caught) {
      setError(errorMessage(caught));
      setState("error");
      await teardown();
    }
  }, [authToken, teardown, navigate, appendTranscript]);


  const stop = React.useCallback(async () => {
    setState("idle");
    await teardown();
  }, [teardown]);

  if (!enabled || !status.data?.available) return null;

  const live = state === "live";
  const connecting = state === "connecting";

  return (
    <>
      {/* Hidden sink for the agent's audio tracks. */}
      <div ref={audioContainerRef} className="sr-only" aria-hidden="true" />

      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {(live || connecting || state === "error") && (
          <div className="w-80 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl ring-1 ring-slate-900/5">
            <div className="flex items-center gap-3 px-4 pb-3 pt-4">
              <span
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full transition ${
                  live ? (agentSpeaking ? "bg-emerald-50 text-emerald-600" : "bg-gold-50 text-gold-600") : "bg-slate-100 text-slate-500"
                }`}
              >
                {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900">AI Property Office</p>
                <p className="truncate text-xs text-slate-500">
                  {connecting && "Connecting…"}
                  {live && (agentSpeaking ? "Speaking" : "Listening")}
                  {state === "error" && "Couldn’t start voice"}
                </p>
              </div>
              {live && (
                <div className="flex items-end gap-0.5" aria-hidden="true">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={`w-1 rounded-full animate-voice-bar ${agentSpeaking ? "bg-emerald-500" : "bg-gold-500"}`}
                      style={{ height: "0.75rem", animationDelay: `${i * 0.12}s` }}
                    />
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => void stop()}
                className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close voice panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {live && (
              <div className="border-t border-slate-100 px-4 py-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Transcript</p>
                  <button
                    type="button"
                    onClick={() => setShowTranscript((v) => !v)}
                    className="text-[11px] font-medium text-gold-600 hover:text-gold-700"
                  >
                    {showTranscript ? "Hide" : "Show"}
                  </button>
                </div>
                {showTranscript && (
                  <div className="mt-1.5 max-h-48 space-y-1.5 overflow-y-auto pr-1">
                    {transcript.length === 0 ? (
                      <p className="text-xs leading-relaxed text-slate-500">
                        Speak naturally — ask about any listing, your portfolio, tax or payments. Your conversation appears here.
                      </p>
                    ) : (
                      transcript.map((line) => (
                        <div
                          key={line.id}
                          className={line.role === "assistant" ? "text-left" : "text-right"}
                        >
                          <span
                            className={`inline-block max-w-[90%] rounded-2xl px-2.5 py-1.5 text-xs leading-snug ${
                              line.role === "assistant"
                                ? "bg-slate-100 text-slate-700"
                                : "bg-gold-500/90 text-white"
                            } ${line.final ? "" : "opacity-70"}`}
                          >
                            {line.text}
                          </span>
                        </div>
                      ))
                    )}
                    <div ref={transcriptEndRef} />
                  </div>
                )}
              </div>
            )}

            {error && state === "error" && (
              <div className="border-t border-slate-100 px-4 py-2.5">
                <p className="text-xs text-rose-600" role="alert">
                  {error}
                </p>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => (live ? void stop() : void start())}
          disabled={connecting}
          className={`flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition focus:outline-none focus:ring-4 disabled:opacity-70 ${
            live
              ? "bg-rose-600 hover:bg-rose-700 focus:ring-rose-300/40"
              : "bg-gold-500 hover:bg-gold-600 focus:ring-gold-300/50"
          }`}
          aria-label={live ? "End voice session" : "Talk to the AI Property Office"}
          title={live ? "End voice session" : "Talk to the AI Property Office"}
        >
          {connecting ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : live ? (
            <PhoneOff className="h-6 w-6" />
          ) : (
            <Mic className="h-6 w-6" />
          )}
        </button>
      </div>
    </>
  );
}
