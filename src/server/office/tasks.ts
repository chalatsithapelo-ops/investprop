import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { loadOwnLedger } from "./context";
import {
  APPROVAL_TTL_MS, OFFICE_LIMIT, assertOfficeUser, assertOwnerRole, assertPrepared,
  assertDigest, parametersSchema, taskKinds, taskDigest, taxYearRange,
  validateTaskParameters, centsNumber, toCents, payoutTotals, type OfficeUser, type TaskKind, type TaskParameters,
} from "./policy";

const notFound = () => new TRPCError({ code: "NOT_FOUND", message: "Office task or proposal not found" });
const conflict = () => new TRPCError({ code: "CONFLICT", message: "Task changed concurrently; refresh before continuing" });
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

async function previewTask(user: OfficeUser, kind: TaskKind, parameters: TaskParameters, tx: Prisma.TransactionClient) {
  if (kind === "REMINDER") return {
    type: kind, dueAt: new Date(parameters.dueAt!).toISOString(), notes: parameters.notes ?? "",
    scope: "Schedule an office reminder only. Delivery is not guaranteed; no financial or legal action.",
  };
  if (kind === "OWNER_CHECKLIST") {
    assertOwnerRole(user);
    const proposal = await tx.ownerSaleProposal.findFirst({
      where: { id: parameters.proposalId!, ownerId: user.id },
      select: { id: true, title: true, status: true, documentUrls: true, bondStatus: true, tenancyStatus: true },
    });
    if (!proposal) throw notFound();
    // Presence only: do not return file URLs, identity records or document contents.
    const present = new Set(Array.isArray(proposal.documentUrls) ? proposal.documentUrls.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      return typeof item.kind === "string" && typeof item.url === "string" && item.url.trim() ? [item.kind] : [];
    }) : []);
    const required = ["TITLE_DEED", "ID", "RATES_ACCOUNT", ...(proposal.bondStatus === "EXISTING" ? ["BOND_STATEMENT"] : []), ...(proposal.tenancyStatus === "TENANTED" ? ["LEASE"] : [])];
    return {
      type: kind, proposal: { id: proposal.id, title: proposal.title, status: proposal.status },
      checklist: required.map((documentType) => ({ documentType, recorded: present.has(documentType), action: present.has(documentType) ? "Have a professional verify validity and completeness" : "Obtain missing document for professional review" })),
      notes: parameters.notes ?? "", scope: "Deterministic document-presence checklist for your own proposal only. Never submits, signs or changes a proposal.",
    };
  }
  const period = taxYearRange(parameters.taxYear!);
  const [payoutRows, ledger, documents] = await Promise.all([
    tx.distributionPayout.findMany({
      where: { investorId: user.id, status: "PAID", paidAt: period, distribution: { deletedAt: null } },
      select: { id: true, grossAmount: true, netAmount: true, taxWithheld: true, paidAt: true,
        distribution: { select: { propertyId: true, taxClassification: true } } },
      orderBy: [{ paidAt: "asc" }, { id: "asc" }], take: OFFICE_LIMIT + 1,
    }), loadOwnLedger(user.id, period, tx),
    tx.legalDocument.findMany({ where: { generatedFor: user.id },
      select: { id: true, title: true, documentType: true, propertyId: true, updatedAt: true },
      orderBy: { id: "asc" }, take: OFFICE_LIMIT + 1 }),
  ]);
  return {
    type: kind, taxYear: parameters.taxYear, period: { gte: period.gte.toISOString(), lt: period.lt.toISOString() },
    scope: "Frozen platform-only JSON draft for independent accountant review; no external records, filing, certification or tax liability estimate.",
    paidDistributions: payoutTotals(payoutRows.slice(0, OFFICE_LIMIT)),
    payouts: payoutRows.slice(0, OFFICE_LIMIT).map((row) => ({ id: row.id, propertyId: row.distribution.propertyId,
      grossCents: centsNumber(toCents(row.grossAmount)), netCents: centsNumber(toCents(row.netAmount)),
      withheldCents: centsNumber(toCents(row.taxWithheld)), paidAt: row.paidAt?.toISOString() ?? null,
      taxClassification: row.distribution.taxClassification })),
    ledger, documents: documents.slice(0, OFFICE_LIMIT).map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
    gaps: ["Platform-only evidence; external income, expenses and tax circumstances are excluded. PAID payouts without paidAt cannot be assigned to this tax year and are excluded.",
      ...ledger.gaps, ...(payoutRows.length > OFFICE_LIMIT ? ["Own payouts truncated; totals and pack incomplete."] : []),
      ...(!payoutRows.length ? ["No dated PAID payouts in the selected period."] : []),
      ...(documents.length > OFFICE_LIMIT ? ["Own document metadata truncated; pack incomplete."] : [])],
    notes: parameters.notes ?? "",
  };
}

export async function prepareOfficeTask(user: OfficeUser, input: { kind: TaskKind; title: string; parameters: TaskParameters }, now = new Date()) {
  assertOfficeUser(user);
  const kind = taskKinds.parse(input.kind);
  const parameters = parametersSchema.parse(input.parameters);
  const title = input.title.trim();
  if (!title || title.length > 160) throw new TRPCError({ code: "BAD_REQUEST", message: "Task title must contain 1–160 characters" });
  validateTaskParameters(kind, parameters, now);
  return db.$transaction(async (tx) => {
    const result = json(await previewTask(user, kind, parameters, tx));
    const data = { id: randomUUID(), userId: user.id, title, kind, parameters: json(parameters), result,
      expiresAt: new Date(now.getTime() + APPROVAL_TTL_MS), status: "PREPARED" };
    const approvalDigest = taskDigest(data);
    const task = await tx.officeTask.create({ data: { ...data, approvalDigest } });
    await tx.officeActionEvent.create({ data: { taskId: task.id, userId: user.id, action: "PREPARED", payload: { approvalDigest, expiresAt: data.expiresAt.toISOString() } } });
    return task;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function approveOfficeTask(user: OfficeUser, taskId: string, approvalDigest: string, now = new Date()) {
  assertOfficeUser(user);
  return db.$transaction(async (tx) => {
    const task = await tx.officeTask.findFirst({ where: { id: taskId, userId: user.id } });
    if (!task) throw notFound();
    assertPrepared(task, now);
    if (task.result === null) throw new TRPCError({ code: "BAD_REQUEST", message: "Frozen preview is missing" });
    assertDigest(taskDigest({ ...task, result: task.result }), task.approvalDigest);
    assertDigest(task.approvalDigest, approvalDigest);
    const kind = taskKinds.parse(task.kind);
    const parameters = parametersSchema.parse(task.parameters);
    validateTaskParameters(kind, parameters, now);
    if (kind === "OWNER_CHECKLIST") {
      assertOwnerRole(user);
      if (!await tx.ownerSaleProposal.findFirst({ where: { id: parameters.proposalId!, ownerId: user.id }, select: { id: true } })) throw notFound();
    }
    // Draft artifacts are already frozen. Approval never regenerates them.
    const status = kind === "REMINDER" ? "SCHEDULED" : "COMPLETED";
    const changed = await tx.officeTask.updateMany({
      where: { id: task.id, userId: user.id, status: "PREPARED", approvalDigest: task.approvalDigest,
        title: task.title, kind: task.kind, updatedAt: task.updatedAt,
        parameters: { equals: json(parameters) }, result: { equals: task.result },
        expiresAt: { equals: task.expiresAt, gt: now } },
      data: { status, approvedAt: now, ...(status === "COMPLETED" ? { completedAt: now } : {}) },
    });
    if (changed.count !== 1) throw conflict();
    await tx.officeActionEvent.create({ data: { taskId: task.id, userId: user.id, action: status, payload: { approvalDigest, ...(kind === "REMINDER" ? { dueAt: parameters.dueAt! } : { artifact: "FROZEN_PLATFORM_JSON" }) } } });
    return tx.officeTask.findFirstOrThrow({ where: { id: task.id, userId: user.id } });
  });
}

export async function cancelOfficeTask(user: OfficeUser, taskId: string) {
  assertOfficeUser(user);
  return db.$transaction(async (tx) => {
    const task = await tx.officeTask.findFirst({ where: { id: taskId, userId: user.id } });
    if (!task) throw notFound();
    if (!["PREPARED", "SCHEDULED"].includes(task.status)) throw conflict();
    const changed = await tx.officeTask.updateMany({ where: { id: task.id, userId: user.id, status: task.status }, data: { status: "CANCELLED" } });
    if (changed.count !== 1) throw conflict();
    await tx.officeActionEvent.create({ data: { taskId: task.id, userId: user.id, action: "CANCELLED", payload: { previousStatus: task.status } } });
    return tx.officeTask.findFirstOrThrow({ where: { id: task.id, userId: user.id } });
  });
}