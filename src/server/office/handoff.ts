/**
 * Voice-agent human handoff.
 *
 * When the member asks for a person — or raises a dispute, suspected account
 * error, complaint or legal/contractual question the agent should not decide —
 * the worker calls the office bridge (`action: "requestHandoff"`). This logs a
 * follow-up request for the Investprop team and confirms it to the member.
 *
 * It is deliberately NON-mutating to anything financial: it only writes an audit
 * entry and in-app notifications (to every admin, and a confirmation to the
 * member). No money moves and no account state changes.
 */

import { db } from "~/server/db";
import type { OfficeUser } from "~/server/office/policy";
import { createNotification } from "~/server/trpc/procedures/notifications";
import { createAuditLog } from "~/server/trpc/procedures/audit-log";

export interface HandoffRequest {
  reason: string;
  summary: string;
}

export interface HandoffResult {
  logged: true;
  notifiedAdmins: number;
}

export async function requestHandoff(user: OfficeUser, input: HandoffRequest): Promise<HandoffResult> {
  const reason = input.reason.trim().slice(0, 120) || "requested a person";
  const summary = input.summary.trim().slice(0, 1500);

  // Audit trail for compliance — best-effort, never throws.
  await createAuditLog(user.id, "VOICE_AGENT_HANDOFF_REQUESTED", "User", user.id, {
    reason,
    summary,
    channel: "voice_agent",
  });

  // Fetch the member's display name for the admin alert (OfficeUser is a thin
  // pick without the name), falling back gracefully.
  const member = await db.user
    .findUnique({ where: { id: user.id }, select: { name: true, email: true } })
    .catch(() => null);
  const who = member?.name?.trim() || member?.email?.trim() || `Member #${user.id}`;

  const admins = await db.user
    .findMany({ where: { role: "ADMIN" }, select: { id: true } })
    .catch(() => [] as { id: number }[]);

  for (const admin of admins) {
    await createNotification(
      admin.id,
      `Voice office: follow-up needed (${reason})`,
      `${who} asked the AI Property Office for a human. ${summary || "No further detail given."}`,
      "WARNING",
      "SYSTEM",
      user.id,
    );
  }

  // Confirm to the member so they see it in their own in-app notifications.
  await createNotification(
    user.id,
    "We'll have someone follow up",
    `Your request to the AI Property Office has been flagged for our team${reason ? ` (${reason})` : ""}. We'll be in touch.`,
    "INFO",
    "SYSTEM",
    null,
  );

  return { logged: true, notifiedAdmins: admins.length };
}
