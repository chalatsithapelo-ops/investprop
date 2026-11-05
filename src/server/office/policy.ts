import { createHash, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Prisma, User } from "@prisma/client";

export type OfficeUser = Pick<User, "id" | "role" | "status">;
export const OFFICE_LIMIT = 200;
export const HISTORY_LIMIT = 40;
export const APPROVAL_TTL_MS = 30 * 60 * 1000;
export const taskKinds = z.enum(["REMINDER", "ACCOUNTANT_PACK", "OWNER_CHECKLIST", "SELL_SHARES"]);
export const personas = z.enum(["ACCOUNTANT", "TAX", "ASSET", "ADMIN"]);
export const parametersSchema = z.object({
  dueAt: z.string().datetime({ offset: true }).optional(),
  notes: z.string().trim().max(4000).optional(),
  // SA individual assessment year: 2027 = [2026-03-01, 2027-03-01) UTC.
  taxYear: z.number().int().min(2000).max(2200).optional(),
  proposalId: z.number().int().positive().optional(),
  // SELL_SHARES: place a limit sell order for the member's own shares.
  propertyId: z.number().int().positive().optional(),
  quantity: z.number().int().min(1).max(100_000_000).optional(),
  limitPricePerShare: z.number().positive().max(1_000_000).optional(),
}).strict();
export type TaskParameters = z.infer<typeof parametersSchema>;
export type TaskKind = z.infer<typeof taskKinds>;

export function assertOfficeUser(user: OfficeUser): void {
  if (user.status !== "ACTIVE" || !["INVESTOR", "PROPERTY_OWNER", "ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"].includes(user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Office requires an active investor, owner or staff account" });
  }
}

export function assertOwnerRole(user: OfficeUser): void {
  if (!["PROPERTY_OWNER", "ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"].includes(user.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Owner checklist requires an owner or staff role and your own proposal" });
  }
}

/** Fields each task kind may carry. `notes` is always permitted. */
const ALLOWED_PARAMETERS: Record<TaskKind, readonly (keyof TaskParameters)[]> = {
  REMINDER: ["dueAt", "notes"],
  ACCOUNTANT_PACK: ["taxYear", "notes"],
  OWNER_CHECKLIST: ["proposalId", "notes"],
  SELL_SHARES: ["propertyId", "quantity", "limitPricePerShare", "notes"],
};

export function validateTaskParameters(kind: TaskKind, parameters: TaskParameters, now: Date): void {
  const allowed = ALLOWED_PARAMETERS[kind];
  for (const key of Object.keys(parameters) as (keyof TaskParameters)[]) {
    if (parameters[key] !== undefined && !allowed.includes(key)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: `${kind} does not accept the "${key}" parameter` });
    }
  }
  if (kind === "REMINDER") {
    if (!parameters.dueAt || new Date(parameters.dueAt).getTime() <= now.getTime()) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Reminder dueAt must be in the future" });
    }
    if (new Date(parameters.dueAt).getTime() - now.getTime() > 366 * 86400000) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Schedule reminders within the next year" });
    }
  } else if (kind === "ACCOUNTANT_PACK") {
    if (!parameters.taxYear) throw new TRPCError({ code: "BAD_REQUEST", message: "Accountant pack requires taxYear" });
  } else if (kind === "OWNER_CHECKLIST") {
    if (!parameters.proposalId) throw new TRPCError({ code: "BAD_REQUEST", message: "Owner checklist requires proposalId" });
  } else {
    if (!parameters.propertyId || !parameters.quantity) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Sell order requires propertyId and quantity" });
    }
  }
}

export function taxYearRange(year: number) {
  const parsed = parametersSchema.shape.taxYear.unwrap().parse(year);
  return { gte: new Date(Date.UTC(parsed - 1, 2, 1)), lt: new Date(Date.UTC(parsed, 2, 1)) };
}

/** Decimal arithmetic before conversion: never sum binary floating-point currency. */
export function toCents(value: number | string, multiplier = 1): bigint {
  if (!Number.isSafeInteger(multiplier)) throw new Error("Invalid money multiplier");
  const decimal = String(value);
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(decimal);
  if (!match) throw new Error("Non-finite or unsupported monetary value");
  const fraction = match[3] ?? "";
  const scale = 10n ** BigInt(fraction.length);
  const numerator = (BigInt(match[2]!) * scale + BigInt(fraction || "0")) * BigInt(multiplier) * 100n;
  const sign = (match[1] ? -1n : 1n) * (numerator < 0n ? -1n : 1n);
  const absolute = numerator < 0n ? -numerator : numerator;
  return sign * ((absolute + scale / 2n) / scale);
}

export function centsNumber(value: bigint): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) throw new Error("Monetary total exceeds safe range");
  return Number(value);
}

export function payoutTotals(rows: readonly { grossAmount: number; netAmount: number; taxWithheld: number }[]) {
  const sum = (key: "grossAmount" | "netAmount" | "taxWithheld") => centsNumber(rows.reduce((total, row) => total + toCents(row[key]), 0n));
  return { gross: sum("grossAmount") / 100, net: sum("netAmount") / 100, withheld: sum("taxWithheld") / 100, count: rows.length };
}

export function canonicalJson(value: Prisma.JsonValue | Prisma.InputJsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, Prisma.JsonValue>)[key]!)}`).join(",")}}`;
}

export function taskDigest(task: { id: string; title: string; userId: number; kind: string; parameters: Prisma.JsonValue | Prisma.InputJsonValue; result: Prisma.JsonValue | Prisma.InputJsonValue; expiresAt: Date }): string {
  return createHash("sha256").update(canonicalJson({ version: 2, id: task.id, title: task.title, userId: task.userId, kind: task.kind, parameters: task.parameters, result: task.result, expiresAt: task.expiresAt.toISOString() })).digest("hex");
}

export function assertPrepared(task: { status: string; expiresAt: Date }, now: Date): void {
  if (task.status !== "PREPARED") throw new TRPCError({ code: "CONFLICT", message: "Task is no longer prepared; replay is not allowed" });
  if (task.expiresAt.getTime() <= now.getTime()) throw new TRPCError({ code: "BAD_REQUEST", message: "Task approval has expired; prepare a new task" });
}

export function assertDigest(expected: string, supplied: string): void {
  if (!/^[a-f0-9]{64}$/.test(expected) || !/^[a-f0-9]{64}$/.test(supplied) || !timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(supplied, "hex"))) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Approval digest does not match the frozen preview" });
  }
}

export function canonicalSourceUrl(value: string): string {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  const allowed = host === "sars.gov.za" || host === "www.sars.gov.za" || host === "gov.za" || host === "www.gov.za" || host === "saflii.org" || host === "www.saflii.org";
  if (!allowed || url.protocol !== "https:" || url.username || url.password || url.port || url.hash || url.search) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Use a canonical HTTPS SARS, gov.za or SAFLII URL without credentials, query or fragment" });
  }
  return url.toString();
}

/** Defence in depth for user-entered chat/history and descriptive metadata. */
export function redactForModel(text: string): string {
  return text.replace(/\bBearer\s+\S+/gi, "[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    .replace(/\b(?:sk-|sk_)[A-Za-z0-9_-]{12,}\b/g, "[REDACTED]")
    .replace(/\b\d{8,}\b/g, "[REDACTED]")
    .replace(/\b(?:authToken|password|bank(?:\s*account)?|account\s*number|passport|id\s*number|tax\s*number)\s*[:=]\s*[^\s,;]+/gi, "[REDACTED]");
}
