import { z } from "zod";

export const audioMimeSchema = z.enum(["audio/webm", "audio/mp4", "audio/wav", "audio/ogg"]);
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
export function decodeAudio(base64: string, mimeType: z.infer<typeof audioMimeSchema>): Buffer {
  audioMimeSchema.parse(mimeType);
  if (!base64 || base64.length > Math.ceil(MAX_AUDIO_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    throw new Error("Invalid or oversized audio; record a shorter message");
  }
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length < 12 || buffer.length > MAX_AUDIO_BYTES || buffer.toString("base64") !== base64) throw new Error("Invalid audio encoding");
  const valid = mimeType === "audio/webm" ? buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
    : mimeType === "audio/mp4" ? buffer.toString("ascii", 4, 8) === "ftyp"
    : mimeType === "audio/wav" ? buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WAVE"
    : buffer.toString("ascii", 0, 4) === "OggS";
  if (!valid) throw new Error("Audio container does not match its declared type");
  return buffer;
}