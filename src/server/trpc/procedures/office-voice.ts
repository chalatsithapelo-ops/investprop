import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser } from "~/server/trpc/auth-helpers";
import { requireFeature } from "~/server/subscriptions/subscription-service";
import { env } from "~/server/env";
import { logAIUsage } from "~/server/ai/client";
import { assertOfficeUser, personas } from "~/server/office/policy";
import { chatOffice, ownConversation } from "~/server/office/chat";
import { audioMimeSchema, decodeAudio, MAX_AUDIO_BYTES } from "~/server/office/audio";

const buckets = new Map<number, number[]>();
const active = new Set<number>();
function reserve(userId: number) {
  const now = Date.now();
  for (const [id, times] of buckets) if (!times.some((time) => now - time < 3600000)) buckets.delete(id);
  const times = (buckets.get(userId) ?? []).filter((time) => now - time < 3600000);
  if (active.has(userId) || times.length >= 20 || times.filter((time) => now - time < 60000).length >= 3 || buckets.size >= 10000 && !buckets.has(userId)) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Voice limit reached or another recording is processing" });
  }
  buckets.set(userId, [...times, now]); active.add(userId);
}

/** Recorded turn pipeline, not an unvalidated realtime agent. Raw audio is never stored. */
export const officeVoiceTurn = baseProcedure.input(z.object({
  authToken: z.string().min(1).max(8192), conversationId: z.string().min(1).max(128).optional(),
  persona: personas, speechConsent: z.literal(true), mimeType: audioMimeSchema,
  audioBase64: z.string().max(Math.ceil(MAX_AUDIO_BYTES / 3) * 4),
}).strict()).mutation(async ({ input }) => {
  const user = await getAuthenticatedUser(input.authToken);
  assertOfficeUser(user);
  await requireFeature(user, user.role === "PROPERTY_OWNER" ? "SELLER_AI_VALUATION" : "AI_COPILOT");
  if (input.conversationId) await ownConversation(user.id, input.conversationId);
  if (env.OFFICE_VOICE_ENABLED !== "true" || !env.OPENAI_API_KEY) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Voice processing is disabled; use text. Provider and privacy configuration must be approved first." });
  }
  let audio: Buffer;
  try { audio = decodeAudio(input.audioBase64, input.mimeType); }
  catch (error) { throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Invalid audio" }); }
  reserve(user.id);
  const started = Date.now();
  try {
    const extension = { "audio/webm": "webm", "audio/mp4": "m4a", "audio/wav": "wav", "audio/ogg": "ogg" }[input.mimeType];
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type: input.mimeType }), `message.${extension}`);
    form.append("model", env.OFFICE_TRANSCRIPTION_MODEL);
    form.append("response_format", "verbose_json");
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST", headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: form,
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) throw new TRPCError({ code: "BAD_GATEWAY", message: "Transcription provider unavailable; use text" });
    const result = z.object({ text: z.string().trim().min(1).max(2000), duration: z.number().nonnegative().max(60) }).safeParse(await response.json());
    if (!result.success) throw new TRPCError({ code: "BAD_REQUEST", message: "Recording was too long, empty, or unsupported; use text or record under one minute" });
    await logAIUsage({ userId: user.id, feature: "chat", model: env.OFFICE_TRANSCRIPTION_MODEL, latencyMs: Date.now() - started,
      metadata: { officeVoice: true, durationSeconds: result.data.duration, inputBytes: audio.length, pricingUnavailable: true } });
    const answer = await chatOffice(user, { conversationId: input.conversationId, persona: input.persona, message: result.data.text });
    // Synthesis uses the already validated, persisted answer, not an independent voice model.
    const spoken = answer.message.content.replace(/\[evidence:[^\]]+\]/g, "").replace(/[*#`]/g, "").slice(0, 1800);
    let output: { audioBase64?: string; audioMimeType?: string; speechError?: string } = {};
    try {
      const speech = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST", headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: env.OFFICE_SPEECH_MODEL, voice: env.OFFICE_SPEECH_VOICE,
          input: `${spoken}\nThe complete answer and evidence are on screen.`, response_format: "mp3" }),
        signal: AbortSignal.timeout(30000),
      });
      if (!speech.ok) throw new Error("Speech unavailable");
      const bytes = Buffer.from(await speech.arrayBuffer());
      if (bytes.length > 5 * 1024 * 1024) throw new Error("Speech response too large");
      output = { audioBase64: bytes.toString("base64"), audioMimeType: "audio/mpeg" };
      await logAIUsage({ userId: user.id, feature: "chat", model: env.OFFICE_SPEECH_MODEL, latencyMs: Date.now() - started,
        metadata: { officeVoice: true, spokenCharacters: spoken.length, pricingUnavailable: true } });
    } catch { output = { speechError: "Spoken playback unavailable; your complete answer is available as text." }; }
    return { ...answer, transcript: result.data.text, ...output };
  } finally { active.delete(user.id); }
});