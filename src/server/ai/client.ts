/**
 * Shared AI client + helpers for all AI Strategy features.
 *
 * Responsibilities:
 *  - Single OpenRouter provider instance
 *  - Model picker (cheap vs. premium vs. vision)
 *  - Per-user, per-feature rate-limiting (sliding window in-memory)
 *  - Usage logging to AIUsageLog
 *  - Cost estimation (rough, kept in code so we don't depend on external pricing API)
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { db } from "~/server/db";
import { env } from "~/server/env";

export type AIFeature =
  | "chat"
  | "analyze-property"
  | "underwriting"
  | "doc-summary"
  | "listing-coach"
  | "portfolio"
  | "photo-check"
  | "distress"
  | "sponsor-track"
  | "update-draft"
  | "onboarding";

export type AITier = "cheap" | "premium" | "vision";

const MODELS: Record<AITier, string> = {
  cheap: "openai/gpt-4o-mini",
  premium: "google/gemini-flash-1.5",
  vision: "google/gemini-flash-1.5",
};

// Per-1M-token cost in USD (input, output) — used for ballpark accounting only.
const COST_PER_M_TOKENS: Record<string, { input: number; output: number }> = {
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
  "openai/gpt-4o": { input: 2.5, output: 10 },
  "google/gemini-2.0-flash-001": { input: 0.1, output: 0.4 },
  "google/gemini-flash-1.5": { input: 0.075, output: 0.3 },
  "openai/dall-e-3": { input: 0, output: 0 },
};

// ─── Provider ──────────────────────────────────────────────────────────

let _openrouter: ReturnType<typeof createOpenRouter> | null = null;

export function getOpenRouter() {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error("AI features are not configured (OPENROUTER_API_KEY missing).");
  }
  if (!_openrouter) {
    _openrouter = createOpenRouter({ apiKey: env.OPENROUTER_API_KEY });
  }
  return _openrouter;
}

export function getModel(tier: AITier = "cheap"): LanguageModel {
  return getOpenRouter()(MODELS[tier]) as LanguageModel;
}

export function getModelId(tier: AITier = "cheap"): string {
  return MODELS[tier];
}

// ─── Rate limiter (sliding window, in-memory per process) ──────────────

interface RateLimitConfig {
  perMinute: number;
  perHour: number;
}

const FEATURE_LIMITS: Record<AIFeature, RateLimitConfig> = {
  chat: { perMinute: 12, perHour: 120 },
  "analyze-property": { perMinute: 3, perHour: 20 },
  underwriting: { perMinute: 2, perHour: 12 },
  "doc-summary": { perMinute: 6, perHour: 60 },
  "listing-coach": { perMinute: 4, perHour: 30 },
  portfolio: { perMinute: 2, perHour: 10 },
  "photo-check": { perMinute: 4, perHour: 30 },
  distress: { perMinute: 4, perHour: 30 },
  "sponsor-track": { perMinute: 6, perHour: 60 },
  "update-draft": { perMinute: 3, perHour: 20 },
  onboarding: { perMinute: 20, perHour: 200 },
};

const buckets = new Map<string, number[]>();

function key(userId: number | null, feature: AIFeature) {
  return `${userId ?? "anon"}:${feature}`;
}

export function checkRateLimit(
  userId: number | null,
  feature: AIFeature
): { ok: true } | { ok: false; reason: string; retryAfterSec: number } {
  const cfg = FEATURE_LIMITS[feature];
  const k = key(userId, feature);
  const now = Date.now();
  const arr = (buckets.get(k) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  buckets.set(k, arr);

  const lastMinute = arr.filter((t) => now - t < 60 * 1000).length;
  const lastHour = arr.length;

  if (lastMinute >= cfg.perMinute) {
    return {
      ok: false,
      reason: `Rate limit: ${cfg.perMinute}/minute for ${feature}`,
      retryAfterSec: 60,
    };
  }
  if (lastHour >= cfg.perHour) {
    return {
      ok: false,
      reason: `Rate limit: ${cfg.perHour}/hour for ${feature}`,
      retryAfterSec: 3600,
    };
  }
  return { ok: true };
}

export function recordRateLimitHit(userId: number | null, feature: AIFeature) {
  const k = key(userId, feature);
  const arr = buckets.get(k) ?? [];
  arr.push(Date.now());
  buckets.set(k, arr);
}

// ─── Usage logging ─────────────────────────────────────────────────────

export interface LogAIUsageParams {
  userId: number | null;
  feature: AIFeature;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs: number;
  status?: "OK" | "ERROR" | "RATE_LIMITED";
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export async function logAIUsage(p: LogAIUsageParams): Promise<void> {
  const promptTokens = p.promptTokens ?? 0;
  const completionTokens = p.completionTokens ?? 0;
  const totalTokens = promptTokens + completionTokens;
  const cost =
    ((COST_PER_M_TOKENS[p.model]?.input ?? 0) * promptTokens) / 1_000_000 +
    ((COST_PER_M_TOKENS[p.model]?.output ?? 0) * completionTokens) / 1_000_000;

  try {
    await db.aIUsageLog.create({
      data: {
        userId: p.userId ?? null,
        feature: p.feature,
        model: p.model,
        promptTokens,
        completionTokens,
        totalTokens,
        costUsd: Number(cost.toFixed(6)),
        latencyMs: p.latencyMs,
        status: p.status ?? "OK",
        errorMessage: p.errorMessage,
        metadata: p.metadata ? (p.metadata as object) : undefined,
      },
    });
  } catch (err) {
    // Logging must never break the user flow.
    console.error("[ai/logAIUsage] failed:", err);
  }
}

/**
 * Wrap an AI call to enforce rate-limit + log usage + measure latency.
 * The inner function returns the raw result; pass `extractUsage` to pull tokens.
 */
export async function runAIWithGuard<T>(opts: {
  userId: number | null;
  feature: AIFeature;
  model: string;
  metadata?: Record<string, unknown>;
  run: () => Promise<T>;
  extractUsage?: (result: T) => { promptTokens?: number; completionTokens?: number };
}): Promise<T> {
  const limit = checkRateLimit(opts.userId, opts.feature);
  if (!limit.ok) {
    await logAIUsage({
      userId: opts.userId,
      feature: opts.feature,
      model: opts.model,
      latencyMs: 0,
      status: "RATE_LIMITED",
      errorMessage: limit.reason,
      metadata: opts.metadata,
    });
    const err: Error & { retryAfterSec?: number } = new Error(limit.reason);
    err.retryAfterSec = limit.retryAfterSec;
    throw err;
  }
  recordRateLimitHit(opts.userId, opts.feature);

  const t0 = Date.now();
  try {
    const result = await opts.run();
    const usage = opts.extractUsage?.(result) ?? {};
    await logAIUsage({
      userId: opts.userId,
      feature: opts.feature,
      model: opts.model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      latencyMs: Date.now() - t0,
      status: "OK",
      metadata: opts.metadata,
    });
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logAIUsage({
      userId: opts.userId,
      feature: opts.feature,
      model: opts.model,
      latencyMs: Date.now() - t0,
      status: "ERROR",
      errorMessage: msg,
      metadata: opts.metadata,
    });
    throw err;
  }
}

/**
 * Safely extract a JSON object from an LLM response that may include code fences
 * or trailing chatter. Returns null on failure.
 */
export function safeParseJson<T = unknown>(text: string): T | null {
  if (!text) return null;
  // Strip ```json ... ``` fences if present.
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : text) ?? "";
  // Find the first { ... } or [ ... ] block by braces.
  const start = candidate.search(/[{[]/);
  if (start < 0) return null;
  let depth = 0;
  let end = -1;
  for (let i = start; i < candidate.length; i++) {
    const c = candidate[i];
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) return null;
  try {
    return JSON.parse(candidate.slice(start, end)) as T;
  } catch {
    return null;
  }
}
