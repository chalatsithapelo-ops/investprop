import { db } from "~/server/db";
import { parametersSchema } from "./policy";

/** Durable in-app notification and completion are committed together.
 * Completion means recorded in the app, not delivered by push or confirmed read.
 */
export async function dispatchOfficeReminders(now = new Date()) {
  const candidates = await db.officeTask.findMany({
    where: { kind: "REMINDER", status: "SCHEDULED", user: { status: "ACTIVE" } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 200,
  });
  let recorded = 0;
  for (const task of candidates) {
    const parsed = parametersSchema.safeParse(task.parameters);
    if (!parsed.success || !parsed.data.dueAt || new Date(parsed.data.dueAt) > now) continue;
    recorded += await db.$transaction(async (tx) => {
      const claimed = await tx.officeTask.updateMany({
        where: { id: task.id, userId: task.userId, status: "SCHEDULED", updatedAt: task.updatedAt, user: { status: "ACTIVE" } },
        data: { status: "COMPLETED", completedAt: now },
      });
      if (claimed.count !== 1) return 0;
      const notification = await tx.notification.create({ data: {
        userId: task.userId, title: "Property Office reminder",
        message: task.title.slice(0, 160), type: "INFO", category: "SYSTEM",
      } });
      await tx.officeActionEvent.create({ data: {
        taskId: task.id, userId: task.userId, action: "REMINDER_RECORDED",
        payload: { notificationId: notification.id, recordedAt: now.toISOString(), channel: "IN_APP", deliveryMeaning: "Recorded, not confirmed read" },
      } });
      return 1;
    });
  }
  return { inspected: candidates.length, recorded };
}

declare global {
  // eslint-disable-next-line no-var
  var __officeReminderSchedulerStarted: boolean | undefined;
}
let running = false;
export function startOfficeReminderScheduler() {
  if (process.env.NODE_ENV !== "production" && process.env.OFFICE_REMINDER_SCHEDULER_ENABLED !== "true") return;
  if (globalThis.__officeReminderSchedulerStarted) return;
  globalThis.__officeReminderSchedulerStarted = true;
  const run = async () => {
    if (running) return;
    running = true;
    try { await dispatchOfficeReminders(); }
    catch (error) { console.error("[office-reminders] dispatch failed", error instanceof Error ? error.name : "Error"); }
    finally { running = false; }
  };
  void run();
  setInterval(() => void run(), 60000).unref();
}