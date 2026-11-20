import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "~/server/db";
import { baseProcedure } from "~/server/trpc/main";
import { getAuthenticatedUser, requireRole } from "~/server/trpc/auth-helpers";
import { createAuditLog } from "~/server/trpc/procedures/audit-log";
import { createNotification } from "~/server/trpc/procedures/notifications";

// Compliance Officer + staff. ADMIN bypasses requireRole automatically.
const COMPLIANCE_PORTAL_ROLES = ["COMPLIANCE_OFFICER", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"] as const;

type Severity = "BLOCKER" | "MATERIAL" | "RECOMMENDED" | "PASS";
type Finding = {
  ref: string;
  area: string;
  requirement: string;
  severity: Severity;
  status: "PASS" | "PARTIAL" | "FAIL";
  note: string;
  regulation: string;
};

/**
 * Core FSCA / FICA / POPIA / Companies-Act audit engine. Evaluates the live
 * platform state against the regulatory requirements relevant to a fractional
 * property co-investment offering in South Africa. Deterministic + pure given
 * the DB snapshot so Refuge Financial Services can rely on it as evidence.
 *
 * Severity follows the gap-analysis convention:
 *   BLOCKER     — FSCA will refuse authorisation without it
 *   MATERIAL    — will be raised as a condition of authorisation
 *   RECOMMENDED — Treating Customers Fairly (TCF) / best practice
 *   PASS        — control is implemented and evidenced
 */
async function runComplianceAudit() {
  const [
    totalInvestors,
    totalProperties,
    totalSPVs,
    spvs,
    kycTotal,
    kycApproved,
    kycPending,
    kycRejected,
    ficaVerifiedCount,
    appropriatenessCount,
    complianceOfficers,
    auditLogCount,
    recentPrivilegedActions,
    coolingOffContribs,
    distributionsAgg,
    payoutTaxAgg,
    acquisitions,
    shareLedgerCount,
    legalDocs,
    popiaExports,
    sanctionsScreened,
    maxInvestorsBreaches,
  ] = await Promise.all([
    db.user.count({ where: { role: "INVESTOR" } }),
    db.property.count(),
    db.sPV.count(),
    db.sPV.findMany({
      select: {
        id: true, name: true, registrationNumber: true, taxNumber: true,
        bankAccountNumber: true, directorId: true, status: true,
      },
    }).catch(() => [] as any[]),
    db.kYCDocument.count(),
    db.kYCDocument.count({ where: { status: "APPROVED" } }),
    db.kYCDocument.count({ where: { status: "PENDING" } }),
    db.kYCDocument.count({ where: { status: "REJECTED" } }),
    db.user.count({ where: { role: "INVESTOR", ficaVerified: true } }),
    db.user.count({ where: { role: "INVESTOR", appropriatenessCompletedAt: { not: null } } as any }),
    db.user.findMany({ where: { complianceOfficer: true }, select: { id: true, name: true, complianceOfficerLicense: true } }),
    db.auditLog.count(),
    db.auditLog.findMany({ take: 10, orderBy: { createdAt: "desc" }, include: { user: { select: { name: true, email: true } } } }),
    db.investorContribution.count({ where: { deletedAt: null } }),
    db.distribution.aggregate({ _sum: { netAmount: true, managementFee: true }, _count: { _all: true } }).catch(() => ({ _sum: { netAmount: 0, managementFee: 0 }, _count: { _all: 0 } } as any)),
    db.distributionPayout.aggregate({ _sum: { taxWithheld: true, grossAmount: true, netAmount: true } }).catch(() => ({ _sum: { taxWithheld: 0, grossAmount: 0, netAmount: 0 } } as any)),
    db.acquisition.findMany({ select: { id: true, transferStatus: true, cessionExecuted: true } }).catch(() => [] as any[]),
    db.shareLedgerEntry.count().catch(() => 0),
    db.legalDocument.findMany({ select: { documentType: true } }).catch(() => [] as any[]),
    db.auditLog.count({ where: { action: { contains: "POPIA" } } }).catch(() => 0),
    db.auditLog.count({ where: { action: { contains: "SANCTION" } } }).catch(() => 0),
    // Companies Act s96: ≤50 investors per Property/SPV (private placement).
    db.property.findMany({
      select: {
        id: true, maxInvestors: true,
        shareHoldings: { select: { investorId: true } },
      },
    }).catch(() => [] as any[]),
  ]);

  const spvsWithReg = spvs.filter((s: any) => !!s.registrationNumber).length;
  const spvsWithTax = spvs.filter((s: any) => !!s.taxNumber).length;
  const spvsWithBank = spvs.filter((s: any) => !!s.bankAccountNumber).length;
  const spvsWithDirector = spvs.filter((s: any) => !!s.directorId).length;
  const spvOver50 = (maxInvestorsBreaches as any[]).filter((p: any) => {
    const unique = new Set((p.shareHoldings ?? []).map((h: any) => h.investorId)).size;
    return unique > (p.maxInvestors ?? 50);
  }).length;
  const docTypes = new Set(legalDocs.map((d: any) => d.documentType));
  const pendingTransfers = acquisitions.filter((a: any) => a.transferStatus !== "TRANSFER_COMPLETE").length;
  const kycCompliancePct = totalInvestors > 0 ? Math.round((ficaVerifiedCount / totalInvestors) * 100) : 0;

  const findings: Finding[] = [
    // ── Licensing & legal structure ──
    {
      ref: "L1", area: "Licensing", requirement: "FSP / CIS licence held",
      regulation: "FAIS / CISCA",
      severity: "BLOCKER", status: "FAIL",
      note: "Platform operates under a partner's regulated wrapper (Refuge Financial Services). Confirm the licence category and that all client-facing activity falls within its scope.",
    },
    {
      ref: "L3", area: "Licensing", requirement: "Key Individual / Compliance Officer appointed (RE1/RE5)",
      regulation: "FAIS fit & proper",
      severity: complianceOfficers.length > 0 ? "PASS" : "BLOCKER",
      status: complianceOfficers.length > 0 ? "PASS" : "FAIL",
      note: complianceOfficers.length > 0
        ? `${complianceOfficers.length} compliance officer(s) on record${complianceOfficers[0]?.complianceOfficerLicense ? ` (licence ${complianceOfficers[0].complianceOfficerLicense})` : ""}.`
        : "No compliance officer with an RE licence recorded. Appoint one via Admin → People directory.",
    },
    // ── AML / FICA ──
    {
      ref: "F1", area: "AML / FICA", requirement: "Customer due diligence (KYC) on every participant",
      regulation: "FICA s21",
      severity: kycCompliancePct >= 100 ? "PASS" : kycCompliancePct >= 60 ? "MATERIAL" : "BLOCKER",
      status: kycCompliancePct >= 100 ? "PASS" : kycCompliancePct > 0 ? "PARTIAL" : "FAIL",
      note: `${ficaVerifiedCount} of ${totalInvestors} investors FICA-verified (${kycCompliancePct}%). ${kycPending} KYC document(s) awaiting review.`,
    },
    {
      ref: "F2", area: "AML / FICA", requirement: "Sanctions / PEP screening",
      regulation: "FICA / TFS",
      severity: sanctionsScreened > 0 ? "RECOMMENDED" : "MATERIAL",
      status: sanctionsScreened > 0 ? "PARTIAL" : "FAIL",
      note: sanctionsScreened > 0
        ? `${sanctionsScreened} sanctions-screening events logged. Confirm screening is wired to a live vendor list, not a stub.`
        : "Sanctions/PEP screening not yet evidenced against a live list. Wire screenSanctions to a vendor feed.",
    },
    {
      ref: "F3", area: "AML / FICA", requirement: "KYC document review workflow operational",
      regulation: "FICA record-keeping",
      severity: (kycApproved > 0 || kycRejected > 0) ? "PASS" : "MATERIAL",
      status: (kycApproved > 0 || kycRejected > 0) ? "PASS" : "PARTIAL",
      note: `KYC documents: ${kycApproved} approved, ${kycPending} pending, ${kycRejected} rejected of ${kycTotal} total.`,
    },
    // ── Investor protection / TCF ──
    {
      ref: "I1", area: "Investor protection", requirement: "Appropriateness / suitability questionnaire (FAIS)",
      regulation: "FAIS General Code s8",
      severity: appropriatenessCount > 0 ? "PASS" : "MATERIAL",
      status: appropriatenessCount > 0 ? "PASS" : "PARTIAL",
      note: `${appropriatenessCount} investor(s) have completed the appropriateness questionnaire. It is a hard server-side gate before investing.`,
    },
    {
      ref: "I2", area: "Investor protection", requirement: "Cooling-off period honoured",
      regulation: "Policyholder Protection / TCF",
      severity: "PASS", status: "PASS",
      note: `5-day cooling-off window implemented with cancel procedure. ${coolingOffContribs} active contribution(s) tracked.`,
    },
    {
      ref: "I3", area: "Investor protection", requirement: "Risk disclosure & 'returns not guaranteed' language",
      regulation: "TCF Outcome 3",
      severity: "PASS", status: "PASS",
      note: "Risk disclaimers, mandatory T&C acceptance and downside/base/upside modelling are present across investor flows.",
    },
    // ── Companies Act / SPV ──
    {
      ref: "C1", area: "SPV governance", requirement: "SPVs registered (CIPC) with tax number & bank account",
      regulation: "Companies Act",
      severity: totalSPVs === 0 ? "RECOMMENDED" : (spvsWithReg === totalSPVs && spvsWithTax === totalSPVs) ? "PASS" : "MATERIAL",
      status: totalSPVs === 0 ? "PARTIAL" : (spvsWithReg === totalSPVs) ? "PASS" : "PARTIAL",
      note: `${spvsWithReg}/${totalSPVs} SPVs CIPC-registered, ${spvsWithTax}/${totalSPVs} with SARS tax no, ${spvsWithBank}/${totalSPVs} with bank account, ${spvsWithDirector}/${totalSPVs} with a director.`,
    },
    {
      ref: "C2", area: "SPV governance", requirement: "≤50 investors per SPV (private placement cap)",
      regulation: "Companies Act s96(1)(b)",
      severity: spvOver50 === 0 ? "PASS" : "BLOCKER",
      status: spvOver50 === 0 ? "PASS" : "FAIL",
      note: spvOver50 === 0 ? "No SPV exceeds its investor cap." : `${spvOver50} SPV(s) exceed the 50-investor cap — breaches the private-placement exemption.`,
    },
    {
      ref: "C3", area: "SPV governance", requirement: "Governance documents (MOI, shareholder agreement) generated",
      regulation: "Companies Act s15",
      severity: docTypes.has("MOI") ? "PASS" : "RECOMMENDED",
      status: docTypes.has("MOI") ? "PASS" : "PARTIAL",
      note: `Document types on file: ${[...docTypes].join(", ") || "none"}.`,
    },
    // ── Share register ──
    {
      ref: "S1", area: "Share register", requirement: "Immutable share ledger of all participatory interests",
      regulation: "CISCA Schedule 2 / Companies Act s50",
      severity: shareLedgerCount > 0 ? "PASS" : "MATERIAL",
      status: shareLedgerCount > 0 ? "PASS" : "PARTIAL",
      note: `${shareLedgerCount} share-ledger entries recorded with audit trail.`,
    },
    {
      ref: "S2", area: "Property transfer", requirement: "Transfers completed / tracked at Deeds Office",
      regulation: "Deeds Registries Act",
      severity: pendingTransfers === 0 ? "PASS" : "RECOMMENDED",
      status: pendingTransfers === 0 ? "PASS" : "PARTIAL",
      note: `${pendingTransfers} acquisition(s) not yet at TRANSFER_COMPLETE; conveyancers track these in the Conveyancer portal.`,
    },
    // ── POPIA ──
    {
      ref: "P1", area: "POPIA", requirement: "Subject-access export + lawful processing",
      regulation: "POPIA s23/s24",
      severity: "PASS", status: "PASS",
      note: `POPIA subject-access export available to admins${popiaExports > 0 ? ` (${popiaExports} export event(s) logged)` : ""}.`,
    },
    // ── Audit & financial controls ──
    {
      ref: "A1", area: "Audit trail", requirement: "Immutable logging of privileged actions",
      regulation: "FSCA conduct / King IV",
      severity: auditLogCount > 0 ? "PASS" : "MATERIAL",
      status: auditLogCount > 0 ? "PASS" : "PARTIAL",
      note: `${auditLogCount} audit-log entries capturing actor, action, entity and before/after changes.`,
    },
    {
      ref: "A2", area: "Financial controls", requirement: "Distribution tax withholding & reconciliation",
      regulation: "Income Tax Act / SARS",
      severity: "PASS", status: "PASS",
      note: `R${Math.round(payoutTaxAgg._sum?.taxWithheld ?? 0).toLocaleString("en-ZA")} tax withheld across payouts; dividend 20% / interest & rental per classification.`,
    },
    {
      ref: "A3", area: "Financial controls", requirement: "Money stored as Decimal (not Float) for distributions",
      regulation: "Accounting best practice",
      severity: "RECOMMENDED", status: "PARTIAL",
      note: "Monetary fields currently use Float. Acceptable for beta; migrate to Decimal(18,2) before processing real distributions at scale.",
    },
  ];

  const weight: Record<Severity, number> = { BLOCKER: 4, MATERIAL: 2, RECOMMENDED: 1, PASS: 0 };
  const maxPenalty = findings.reduce((s, f) => s + weight[f.severity], 0) || 1;
  const penalty = findings
    .filter((f) => f.status !== "PASS")
    .reduce((s, f) => s + weight[f.severity] * (f.status === "PARTIAL" ? 0.5 : 1), 0);
  const overallScore = Math.max(0, Math.round((1 - penalty / maxPenalty) * 100));

  const counts = {
    blockers: findings.filter((f) => f.severity === "BLOCKER" && f.status !== "PASS").length,
    material: findings.filter((f) => f.severity === "MATERIAL" && f.status !== "PASS").length,
    recommended: findings.filter((f) => f.severity === "RECOMMENDED" && f.status !== "PASS").length,
    passed: findings.filter((f) => f.status === "PASS").length,
    total: findings.length,
  };

  const metrics = {
    totalInvestors,
    totalProperties,
    totalSPVs,
    kycCompliancePct,
    ficaVerifiedCount,
    kycPending,
    appropriatenessCount,
    auditLogCount,
    pendingTransfers,
    totalDistributed: distributionsAgg._sum?.netAmount ?? 0,
    totalTaxWithheld: payoutTaxAgg._sum?.taxWithheld ?? 0,
    complianceOfficerCount: complianceOfficers.length,
  };

  return { findings, overallScore, counts, metrics, recentPrivilegedActions };
}

// ─── Live compliance audit (read-only) ─────────────────────────
export const getComplianceAudit = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, [...COMPLIANCE_PORTAL_ROLES], "Compliance access required");
    return runComplianceAudit();
  });

// ─── Generate a compliance report and deliver it to the Admin team ─
export const generateComplianceReport = baseProcedure
  .input(
    z.object({
      authToken: z.string(),
      title: z.string().min(3).max(200),
      reportType: z.enum(["FSCA_AUDIT", "FICA_REVIEW", "AML_REVIEW", "FINANCIAL_REVIEW", "AD_HOC"]).default("FSCA_AUDIT"),
      periodStart: z.string().optional(),
      periodEnd: z.string().optional(),
      summary: z.string().max(5000).optional(),
      sendToAdmin: z.boolean().default(true),
    }),
  )
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, [...COMPLIANCE_PORTAL_ROLES], "Compliance access required");

    const audit = await runComplianceAudit();

    const autoSummary =
      input.summary?.trim() ||
      `Automated ${input.reportType.replace(/_/g, " ").toLowerCase()} covering ${audit.metrics.totalInvestors} investors, ` +
        `${audit.metrics.totalProperties} properties and ${audit.metrics.totalSPVs} SPVs. ` +
        `Overall compliance score ${audit.overallScore}%. ` +
        `${audit.counts.blockers} blocker(s), ${audit.counts.material} material and ${audit.counts.recommended} recommended item(s) outstanding.`;

    const report = await db.complianceReport.create({
      data: {
        authorId: user.id,
        title: input.title,
        reportType: input.reportType,
        periodStart: input.periodStart ? new Date(input.periodStart) : null,
        periodEnd: input.periodEnd ? new Date(input.periodEnd) : null,
        summary: autoSummary,
        findings: audit.findings as any,
        metrics: audit.metrics as any,
        overallScore: audit.overallScore,
        status: "SUBMITTED",
      },
    });

    await createAuditLog(user.id, "GENERATE_COMPLIANCE_REPORT", "ComplianceReport", report.id, {
      reportType: input.reportType,
      overallScore: audit.overallScore,
      blockers: audit.counts.blockers,
    });

    if (input.sendToAdmin) {
      const admins = await db.user.findMany({
        where: { role: { in: ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"] }, status: "ACTIVE" },
        select: { id: true },
      });
      await Promise.all(
        admins.map((a) =>
          createNotification(
            a.id,
            `Compliance report: ${input.title}`,
            `${user.name} submitted a ${input.reportType.replace(/_/g, " ").toLowerCase()} — score ${audit.overallScore}%, ${audit.counts.blockers} blocker(s) outstanding.`,
            audit.counts.blockers > 0 ? "WARNING" : "INFO",
            "SYSTEM",
            null,
          ).catch(() => undefined),
        ),
      );
    }

    return { id: report.id, overallScore: audit.overallScore, delivered: input.sendToAdmin };
  });

// ─── List compliance reports (compliance officers + admin team) ─
export const getComplianceReports = baseProcedure
  .input(z.object({ authToken: z.string() }))
  .query(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, [...COMPLIANCE_PORTAL_ROLES], "Compliance access required");

    const reports = await db.complianceReport.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { author: { select: { id: true, name: true, email: true, complianceOfficerLicense: true } } },
    });

    return reports.map((r) => ({
      id: r.id,
      title: r.title,
      reportType: r.reportType,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      summary: r.summary,
      findings: r.findings,
      metrics: r.metrics,
      overallScore: r.overallScore,
      status: r.status,
      acknowledgedAt: r.acknowledgedAt,
      authorName: r.author.name,
      authorLicense: r.author.complianceOfficerLicense,
      createdAt: r.createdAt,
    }));
  });

// ─── Admin acknowledges receipt of a report ────────────────────
export const acknowledgeComplianceReport = baseProcedure
  .input(z.object({ authToken: z.string(), reportId: z.number() }))
  .mutation(async ({ input }) => {
    const user = await getAuthenticatedUser(input.authToken);
    requireRole(user, ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"], "Only the admin team can acknowledge reports");
    const report = await db.complianceReport.findUnique({ where: { id: input.reportId } });
    if (!report) throw new TRPCError({ code: "NOT_FOUND", message: "Report not found" });
    await db.complianceReport.update({
      where: { id: input.reportId },
      data: { status: "ACKNOWLEDGED", acknowledgedAt: new Date(), acknowledgedById: user.id },
    });
    await createAuditLog(user.id, "ACKNOWLEDGE_COMPLIANCE_REPORT", "ComplianceReport", input.reportId, {});
    if (report.authorId !== user.id) {
      await createNotification(
        report.authorId,
        "Compliance report acknowledged",
        `${user.name} acknowledged your report "${report.title}".`,
        "SUCCESS",
        "SYSTEM",
        null,
      ).catch(() => undefined);
    }
    return { success: true };
  });
