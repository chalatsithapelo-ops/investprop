/**
 * Supported spoken languages for the realtime voice agent.
 *
 * The agent itself is multilingual (the realtime model handles code-switching),
 * so these codes only drive which language the agent LEADS in and persists as
 * the member's preference. isiZulu and Sesotho are the first local languages;
 * English stays the default and the member can switch back at any time.
 */
export const VOICE_LANGUAGES = ["en", "zu", "st"] as const;
export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number];

export const DEFAULT_VOICE_LANGUAGE: VoiceLanguage = "en";

/** Human-readable label for each language, in the language's own name. */
export const VOICE_LANGUAGE_LABELS: Record<VoiceLanguage, string> = {
  en: "English",
  zu: "isiZulu",
  st: "Sesotho",
};

// Accept codes, ISO-639 variants and common spellings the client or the model
// might send, mapped to a canonical code. Anything unknown falls back to English.
const ALIASES: Record<string, VoiceLanguage> = {
  en: "en",
  eng: "en",
  english: "en",
  zu: "zu",
  zul: "zu",
  zulu: "zu",
  isizulu: "zu",
  "isi-zulu": "zu",
  st: "st",
  sot: "st",
  sotho: "st",
  sesotho: "st",
  "southern sotho": "st",
  southernsotho: "st",
};

export function normalizeVoiceLanguage(input: string | null | undefined): VoiceLanguage {
  if (!input) return DEFAULT_VOICE_LANGUAGE;
  return ALIASES[input.trim().toLowerCase()] ?? DEFAULT_VOICE_LANGUAGE;
}
