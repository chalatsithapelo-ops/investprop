import * as React from "react";
import { useQuery } from "@tanstack/react-query";
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

  const roomRef = React.useRef<Room | null>(null);
  const audioContainerRef = React.useRef<HTMLDivElement | null>(null);
  const [state, setState] = React.useState<SessionState>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [agentSpeaking, setAgentSpeaking] = React.useState(false);

  const enabled = Boolean(hydrated && user && authToken);

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
  }, [authToken, teardown]);

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
          <div className="w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">AI Property Office</p>
                <p className="text-xs text-slate-500">
                  {connecting && "Connecting your voice session…"}
                  {live && (agentSpeaking ? "Speaking…" : "Listening…")}
                  {state === "error" && "Could not start voice"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void stop()}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close voice panel"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {live && (
              <div className="mt-3 flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                  <span
                    className={`absolute inline-flex h-full w-full rounded-full ${agentSpeaking ? "animate-ping bg-emerald-400" : "bg-sky-400"} opacity-75`}
                  />
                  <span
                    className={`relative inline-flex h-3 w-3 rounded-full ${agentSpeaking ? "bg-emerald-500" : "bg-sky-500"}`}
                  />
                </span>
                <span className="text-xs text-slate-600">Speak naturally — I can answer and prepare tasks.</span>
              </div>
            )}

            {error && state === "error" && (
              <p className="mt-2 text-xs text-rose-600" role="alert">
                {error}
              </p>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => (live ? void stop() : void start())}
          disabled={connecting}
          className={`flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition focus:outline-none focus:ring-4 focus:ring-sky-300 disabled:opacity-70 ${
            live ? "bg-rose-600 hover:bg-rose-700" : "bg-sky-600 hover:bg-sky-700"
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
