import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { errorMessage, type AudioMime } from "./api";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_MS = 50_000;
const formats: { recording: string; mime: AudioMime }[] = [
  { recording: "audio/webm;codecs=opus", mime: "audio/webm" },
  { recording: "audio/mp4", mime: "audio/mp4" },
  { recording: "audio/ogg;codecs=opus", mime: "audio/ogg" },
  { recording: "audio/webm", mime: "audio/webm" },
];

export function VoiceRecorder({ enabled, busy, contextKey, onSend, onError, onRecordingChange }: {
  enabled: boolean;
  busy: boolean;
  contextKey: string;
  onSend: (audioBase64: string, mimeType: AudioMime) => Promise<void>;
  onError: (message: string) => void;
  onRecordingChange: (active: boolean) => void;
}) {
  const [consent, setConsent] = useState(false);
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelled = useRef(false);
  const activeContext = useRef(contextKey);
  activeContext.current = contextKey;

  function discard() {
    cancelled.current = true;
    if (timer.current) clearTimeout(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((track) => track.stop());
  }

  useEffect(() => {
    return () => discard();
  }, []);

  useEffect(() => {
    onRecordingChange(recording || starting);
    return () => onRecordingChange(false);
  }, [recording, starting, onRecordingChange]);

  useEffect(() => {
    discard();
    setRecording(false);
    setConsent(false);
  }, [contextKey, enabled]);

  async function start() {
    if (!consent || !enabled || busy || starting || recording) return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      onError("Voice recording is not supported here. Use text, or a supported browser on HTTPS.");
      return;
    }
    const format = formats.find((item) => MediaRecorder.isTypeSupported(item.recording));
    if (!format) { onError("This browser has no supported audio format. Please use text."); return; }
    setStarting(true);
    cancelled.current = false;
    const capturedContext = contextKey;
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelled.current || capturedContext !== activeContext.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      const instance = new MediaRecorder(media, { mimeType: format.recording, audioBitsPerSecond: 32_000 });
      recorder.current = instance;
      const chunks: Blob[] = [];
      let size = 0;
      instance.ondataavailable = (event) => {
        size += event.data.size;
        if (size > MAX_BYTES) {
          cancelled.current = true;
          onError("Recording exceeded the 2 MiB limit and was discarded. Please record a shorter message.");
          if (instance.state === "recording") instance.stop();
          return;
        }
        chunks.push(event.data);
      };
      instance.onerror = () => { onError("Microphone recording failed. Please use text or try again."); discard(); setRecording(false); };
      instance.onstop = () => {
        if (timer.current) clearTimeout(timer.current);
        media.getTracks().forEach((track) => track.stop());
        setRecording(false);
        if (cancelled.current || capturedContext !== activeContext.current) return;
        const blob = new Blob(chunks, { type: format.mime });
        if (!blob.size || blob.size > MAX_BYTES) { onError("Recording is empty or too large. Please try again."); return; }
        setStarting(true); // Keep other turns locked during encoding and upload.
        const reader = new FileReader();
        reader.onerror = () => { setStarting(false); onError("Could not read the audio recording."); };
        reader.onload = () => {
          if (cancelled.current || capturedContext !== activeContext.current) { setStarting(false); return; }
          if (typeof reader.result !== "string") { setStarting(false); onError("Could not encode the recording."); return; }
          const base64 = reader.result.split(",")[1];
          if (!base64) { setStarting(false); onError("Could not encode the recording."); return; }
          void onSend(base64, format.mime)
            .catch((error: unknown) => onError(errorMessage(error)))
            .finally(() => setStarting(false));
        };
        reader.readAsDataURL(blob);
      };
      instance.start(250);
      setRecording(true);
      timer.current = setTimeout(() => { if (instance.state === "recording") instance.stop(); }, MAX_MS);
    } catch (error) {
      discard();
      onError(errorMessage(error));
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
      <label className="flex items-start gap-2">
        <input type="checkbox" checked={consent} disabled={!enabled || busy || starting} className="mt-0.5 accent-amber-600"
          onChange={(event) => { setConsent(event.target.checked); if (!event.target.checked) { discard(); setRecording(false); } }} />
        <span>I consent to third-party processing: OpenAI receives my recording for transcription and reply text for speech; the configured AI provider processes my transcript and relevant office evidence. Transcripts and answers are saved in office history. Avoid sensitive information. Up to 50 seconds / 2 MiB; no browser speech recognition.</span>
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {recording ? <>
          <button type="button" onClick={() => recorder.current?.stop()} className="flex items-center gap-2 rounded-lg bg-red-700 px-3 py-2 font-semibold text-white"><Square size={14} /> Stop & send recording</button>
          <button type="button" onClick={() => { discard(); setRecording(false); }} className="rounded-lg border border-slate-300 px-3 py-2">Discard</button>
        </> : <button type="button" disabled={!consent || !enabled || busy || starting} onClick={() => { void start(); }} className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 font-semibold disabled:opacity-50"><Mic size={14} />{busy ? "Sending voice turn…" : starting ? "Preparing microphone audio…" : "Record voice message"}</button>}
        <span role="status">{recording ? "Recording • automatically sends at 50 seconds" : !enabled ? "Voice unavailable from the server" : "Microphone off"}</span>
      </div>
    </div>
  );
}
