import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";
import { createAuditLog } from "~/server/trpc/procedures/audit-log";

const COMPLIANCE_PORTAL_ROLES = ["COMPLIANCE_OFFICER", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"] as const;

async function requireCompliance(authToken: string) {
  const user = await getAuthenticatedUser(authToken);
  requireRole(user, [...COMPLIANCE_PORTAL_ROLES], "Compliance access required");
  return user;
}

function advanceDueDate(from: Date, frequency: string): Date {
  const d = new Date(from);
  switch (frequency) {
    case "MONTHLY": d.setMonth(d.getMonth() + 1); break;
    case "QUARTERLY": d.setMonth(d.getMonth() + 3); break;
    case "SEMI_ANNUAL": d.setMonth(d.getMonth() + 6); break;
    case "ANNUAL": d.setFullYear(d.getFullYear() + 1); break;
    default: break; // ONCE — no advance
  }
  return d;
}

// ══════════════════════════════════════════════════════════════
//  Corrective Action Plan (CAP)
// ══════════════════════════════════════════════════════════════

export const getComplianceActions = baseProcedure
  .input(z.object({ authToken: z.string(), status: z.enum(["ALL", "OPEN", "IN_PROGRESS", "RESOLVED", "ACCEPTED_RISK"]).default("ALL") }))
  .query(async ({ input }) => {
    await requireCompliance(input.authToken);
    const rows = await db.complianceAction.findMany({
      where: input.status !== "ALL" ? { status: input.status } : {},
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      take: 300,
    });
    const open = rows.filter((r) => r.status === "OPEN" || r.status === "IN_PROGRESS");
    const overdue = open.filter((r) => r.dueDate && new Date(r.dueDate) < new Date()).length;
    return {
      actions: rows,
      summary: {
        total: rows.length,
        open: open.length,
        overdue,
        blockers: open.filter((r) => r.severity === "BLOCKER").length,
        resolved: rows.filter((r) => r.status === "RESOLVED").length,
      },
    };
  });

export const upsertComplianceAction = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      id: z.number().optional(),
      title: z.string().min(3).max(300),
      area: z.string().min(1).max(100),
      severity: z.enum(["BLOCKER", "MATERIAL", "RECOMMENDED"]).default("MATERIAL"),
      sourceRef: z.string().max(20).optional(),
      status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "ACCEPTED_RISK"]).default("OPEN"),
      owner: z.string().max(120).optional(),
      dueDate: z.string().optional(),
      note: z.string().max(4000).optional(),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await requireCompliance(input.authToken);
    const data: any = {
      title: input.title,
      area: input.area,
      severity: input.severity,
      sourceRef: input.sourceRef ?? null,
      status: input.status,
      owner: input.owner ?? null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      note: input.note ?? null,
      resolvedAt: input.status === "RESOLVED" ? new Date() : null,
    };
    const row = input.id
      ? await db.complianceAction.update({ where: { id: input.id }, data })
      : await db.complianceAction.create({ data: { ...data, createdById: user.id } });
    await createAuditLog(user.id, input.id ? "UPDATE_COMPLIANCE_ACTION" : "CREATE_COMPLIANCE_ACTION", "ComplianceAction", row.id, { status: row.status, severity: row.severity });
    return { id: row.id };
  });

export const deleteComplianceAction = baseProcedure
  .input(z.object({ authToken: z.string(), id: z.number() }))
  .mutation(async ({ input }) => {
    const user = await requireCompliance(input.authToken);
    await db.complianceAction.delete({ where: { id: input.id } }).catch(() => undefined);
    await createAuditLog(user.id, "DELETE_COMPLIANCE_ACTION", "ComplianceAction", input.id, {});
    return { success: true };
  });

// ══════════════════════════════════════════════════════════════
//  Regulatory obligations calendar
// ══════════════════════════════════════════════════════════════

export const getComplianceObligations = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    await requireCompliance(input.authToken);
    const rows = await db.complianceObligation.findMany({
      where: { active: true },
      orderBy: { nextDueDate: "asc" },
      take: 200,
    });
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 86400000);
    const withStatus = rows.map((r) => {
      const due = new Date(r.nextDueDate);
      const status = due < now ? "OVERDUE" : due <= in30 ? "DUE_SOON" : "UPCOMING";
      return { ...r, computedStatus: status };
    });
    return {
      obligations: withStatus,
      summary: {
        total: withStatus.length,
        overdue: withStatus.filter((r) => r.computedStatus === "OVERDUE").length,
        dueSoon: withStatus.filter((r) => r.computedStatus === "DUE_SOON").length,
      },
    };
  });

export const upsertComplianceObligation = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      id: z.number().optional(),
      title: z.string().min(3).max(300),
      regulation: z.string().min(1).max(100),
      frequency: z.enum(["ANNUAL", "SEMI_ANNUAL", "QUARTERLY", "MONTHLY", "ONCE"]).default("ANNUAL"),
      nextDueDate: z.string(),
      responsible: z.string().max(120).optional(),
      notes: z.string().max(2000).optional(),
      active: z.boolean().default(true),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await requireCompliance(input.authToken);
    const data: any = {
      title: input.title,
      regulation: input.regulation,
      frequency: input.frequency,
      nextDueDate: new Date(input.nextDueDate),
      responsible: input.responsible ?? null,
      notes: input.notes ?? null,
      active: input.active,
    };
    const row = input.id
      ? await db.complianceObligation.update({ where: { id: input.id }, data })
      : await db.complianceObligation.create({ data: { ...data, createdById: user.id } });
    await createAuditLog(user.id, input.id ? "UPDATE_COMPLIANCE_OBLIGATION" : "CREATE_COMPLIANCE_OBLIGATION", "ComplianceObligation", row.id, {});
    return { id: row.id };
  });

/** Mark an obligation complete — records the date and rolls the next due date forward by frequency. */
export const completeComplianceObligation = baseProcedure
  .input(z.object({ authToken: z.string(), id: z.number() }))
  .mutation(async ({ input }) => {
    const user = await requireCompliance(input.authToken);
    const existing = await db.complianceObligation.findUnique({ where: { id: input.id } });
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Obligation not found" });
    const next = advanceDueDate(new Date(existing.nextDueDate), existing.frequency);
    await db.complianceObligation.update({
      where: { id: input.id },
      data: {
        lastCompletedAt: new Date(),
        nextDueDate: next,
        active: existing.frequency === "ONCE" ? false : existing.active,
      },
    });
    await createAuditLog(user.id, "COMPLETE_COMPLIANCE_OBLIGATION", "ComplianceObligation", input.id, {});
    return { success: true, nextDueDate: next };
  });

/** One-click: load a standard SA FSP/FIC/POPIA obligations calendar if empty. */
export const seedDefaultObligations = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .mutation(async ({ input }) => {
    const user = await requireCompliance(input.authToken);
    const count = await db.complianceObligation.count();
    if (count > 0) return { created: 0, message: "Calendar already populated." };

    const now = new Date();
    const y = now.getFullYear();
    const defaults = [
      { title: "FSCA annual compliance report submission", regulation: "FAIS / BN", frequency: "ANNUAL", monthsOut: 6, responsible: "Compliance Officer" },
      { title: "FIC risk management & compliance programme (RMCP) review", regulation: "FICA s42", frequency: "ANNUAL", monthsOut: 3, responsible: "Compliance Officer" },
      { title: "FIC annual AML/CFT staff training", regulation: "FICA s43", frequency: "ANNUAL", monthsOut: 4, responsible: "Compliance Officer" },
      { title: "FSCA levies payment", regulation: "FSCA levies", frequency: "ANNUAL", monthsOut: 8, responsible: "Finance" },
      { title: "Professional Indemnity (PI) cover renewal", regulation: "FAIS fit & proper", frequency: "ANNUAL", monthsOut: 5, responsible: "Operations" },
      { title: "Financial soundness / audited financial statements", regulation: "FAIS fit & proper", frequency: "ANNUAL", monthsOut: 9, responsible: "Finance" },
      { title: "Fit & proper CPD hours confirmation (KI & reps)", regulation: "FAIS CPD", frequency: "ANNUAL", monthsOut: 7, responsible: "Compliance Officer" },
      { title: "FICA client due-diligence refresh (high-risk clients)", regulation: "FICA s21", frequency: "QUARTERLY", monthsOut: 3, responsible: "Compliance Officer" },
      { title: "Sanctions / targeted financial sanctions list screening", regulation: "FICA / TFS", frequency: "MONTHLY", monthsOut: 1, responsible: "Compliance Officer" },
      { title: "POPIA data-processing & PAIA manual review", regulation: "POPIA", frequency: "ANNUAL", monthsOut: 10, responsible: "Information Officer" },
      { title: "Conflicts of interest management policy review", regulation: "FAIS General Code", frequency: "ANNUAL", monthsOut: 6, responsible: "Compliance Officer" },
      { title: "Complaints register & TCF outcomes review", regulation: "TCF / FAIS", frequency: "QUARTERLY", monthsOut: 3, responsible: "Compliance Officer" },
    ];

    await db.complianceObligation.createMany({
      data: defaults.map((d) => {
        const due = new Date(y, now.getMonth() + d.monthsOut, 28);
        return {
          title: d.title,
          regulation: d.regulation,
          frequency: d.frequency,
          nextDueDate: due,
          responsible: d.responsible,
          active: true,
          createdById: user.id,
        };
      }),
    });
    await createAuditLog(user.id, "SEED_COMPLIANCE_OBLIGATIONS", "ComplianceObligation", 0, { created: defaults.length });
    return { created: defaults.length, message: `Loaded ${defaults.length} standard obligations.` };
  });

// ══════════════════════════════════════════════════════════════
//  Compliance register — complaints / breaches / STR / incidents
// ══════════════════════════════════════════════════════════════

export const getComplianceCases = baseProcedure
  .input(z.object({ authToken: z.string(), caseType: z.enum(["ALL", "COMPLAINT", "BREACH", "DATA_INCIDENT", "STR", "CONFLICT"]).default("ALL") }))
  .query(async ({ input }) => {
    await requireCompliance(input.authToken);
    const rows = await db.complianceCase.findMany({
      where: input.caseType !== "ALL" ? { caseType: input.caseType } : {},
      orderBy: [{ status: "asc" }, { raisedAt: "desc" }],
      take: 300,
    });
    const openStatuses = ["OPEN", "INVESTIGATING", "REPORTED"];
    return {
      cases: rows,
      summary: {
        total: rows.length,
        open: rows.filter((r) => openStatuses.includes(r.status)).length,
        complaints: rows.filter((r) => r.caseType === "COMPLAINT").length,
        strs: rows.filter((r) => r.caseType === "STR").length,
        breaches: rows.filter((r) => r.caseType === "BREACH" || r.caseType === "DATA_INCIDENT").length,
      },
    };
  });

export const upsertComplianceCase = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      id: z.number().optional(),
      caseType: z.enum(["COMPLAINT", "BREACH", "DATA_INCIDENT", "STR", "CONFLICT"]),
      title: z.string().min(3).max(300),
      description: z.string().min(1).max(5000),
      severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
      status: z.enum(["OPEN", "INVESTIGATING", "REPORTED", "RESOLVED", "CLOSED"]).default("OPEN"),
      subjectName: z.string().max(200).optional(),
      reportedToAuthority: z.string().max(100).optional(),
      dueDate: z.string().optional(),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await requireCompliance(input.authToken);
    const terminal = input.status === "RESOLVED" || input.status === "CLOSED";
    const data: any = {
      caseType: input.caseType,
      title: input.title,
      description: input.description,
      severity: input.severity,
      status: input.status,
      subjectName: input.subjectName ?? null,
      reportedToAuthority: input.reportedToAuthority ?? null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      closedAt: terminal ? new Date() : null,
    };
    const row = input.id
      ? await db.complianceCase.update({ where: { id: input.id }, data })
      : await db.complianceCase.create({ data: { ...data, createdById: user.id } });
    await createAuditLog(user.id, input.id ? "UPDATE_COMPLIANCE_CASE" : "CREATE_COMPLIANCE_CASE", "ComplianceCase", row.id, { caseType: row.caseType, status: row.status });
    return { id: row.id };
  });
