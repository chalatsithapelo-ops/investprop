import { z } from "zod";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import {
  getAuthenticatedUser,
  requireAuthenticatedUser,
} from "~/server/trpc/auth-helpers";
import { runWeeklyDigestCore } from "~/server/ai/insights-digest";

/** Read the current investor's weekly-digest email/notification preference. */
export const getAiDigestPrefs = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    const row = await db.user.findUnique({
      where: { id: user.id },
      select: { aiDigestOptOut: true, aiDigestLastSentAt: true },
    });
    return {
      optedOut: row?.aiDigestOptOut ?? false,
      lastSentAt: row?.aiDigestLastSentAt ?? null,
    };
  });

/** Toggle the current investor's weekly AI deal digest on or off. */
export const setAiDigestOptOut = baseProcedure
  .input(z.object({ authToken: z.string(), optOut: z.boolean() }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    await db.user.update({
      where: { id: user.id },
      data: { aiDigestOptOut: input.optOut },
    });
    return { success: true, optedOut: input.optOut };
  });

/** Admin/dev trigger to run (or dry-run) the weekly digest immediately. */
export const runAiDigestNow = baseProcedure
  .input(z.object({ authToken: z.string(), dryRun: z.boolean().optional() }))
  .mutation(async ({ input }) => {
    await requireAuthenticatedUser(
      input.authToken,
      ["ADMIN", "DEVELOPMENT_MANAGER"],
      "Only admins can trigger the AI digest",
    );
    const summary = await runWeeklyDigestCore({ dryRun: input.dryRun ?? false });
    return { success: true, summary };
  });
