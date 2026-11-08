import { defineEventHandler, toWebRequest } from "@tanstack/react-start/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./root";
import { createContext } from "./context";
import { startDistressedScheduler } from "~/server/distressed/scheduler";
import { startAiDigestScheduler } from "~/server/ai/digest-scheduler";
import { startAiWatchdogScheduler } from "~/server/ai/watchdog-scheduler";
import { startOfficeReminderScheduler } from "~/server/office/reminders";
import { startOfficeProactiveAlertScheduler } from "~/server/office/proactive-alerts";

// Start the daily distressed pipeline scheduler on first server use (idempotent).
startDistressedScheduler();
// Start the weekly AI deal digest scheduler on first server use (idempotent).
startAiDigestScheduler();
// Start the monthly AI portfolio watchdog scheduler on first server use (idempotent).
startAiWatchdogScheduler();
// Dispatch due office reminders every minute on first server use (idempotent).
startOfficeReminderScheduler();
// Send proactive AI Property Office alerts daily on first server use (idempotent).
startOfficeProactiveAlertScheduler();

export default defineEventHandler(async (event) => {
  const request = toWebRequest(event);
  if (!request) {
    return new Response("No request", { status: 400 });
  }

  return fetchRequestHandler({
    endpoint: "/trpc",
    req: request,
    router: appRouter,
    createContext: (opts) => createContext(opts),
    onError({ error, path }) {
      console.error(`tRPC error on '${path}':`, error);
    },
  });
});
