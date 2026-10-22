/**
 * Secure cron endpoint — triggers the monthly AI portfolio watchdog on demand.
 *   POST /api/cron/ai-watchdog
 * Auth: `Authorization: Bearer <CRON_SECRET>` or `?key=<CRON_SECRET>`.
 * Returns 503 until CRON_SECRET is configured. Pass `?dryRun=1` to preview.
 */

import { defineEventHandler, toWebRequest } from "@tanstack/react-start/server";
import { env } from "~/server/env";
import { runPortfolioWatchdogCore } from "~/server/ai/portfolio-watchdog";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export default defineEventHandler(async (event) => {
  const request = toWebRequest(event);
  if (!request) return json({ ok: false, reason: "no request" }, 400);
  if (request.method !== "POST") return json({ ok: false, reason: "method not allowed" }, 405);

  const secret = env.CRON_SECRET?.trim();
  if (!secret) return json({ ok: false, reason: "cron not configured" }, 503);

  const header = request.headers.get("authorization") ?? "";
  const bearer = header.replace(/^Bearer\s+/i, "").trim();
  const url = new URL(request.url);
  const key = url.searchParams.get("key")?.trim();
  if (bearer !== secret && key !== secret) {
    return json({ ok: false, reason: "unauthorized" }, 401);
  }

  const dryRun = url.searchParams.get("dryRun") === "1";

  try {
    const summary = await runPortfolioWatchdogCore({ dryRun });
    return json({ ok: true, summary }, 200);
  } catch (e) {
    return json({ ok: false, reason: e instanceof Error ? e.message : "watchdog failed" }, 500);
  }
});
