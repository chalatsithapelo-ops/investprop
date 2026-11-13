import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ClipboardCheck,
  FileText,
  Upload,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Plus,
  ExternalLink,
  ShieldCheck,
  Milestone as MilestoneIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import { useBlockPropertyOwner } from "~/utils/use-require-role";

export const Route = createFileRoute("/developments/$propertyId/manage")({
  component: DevelopmentManagePage,
});

// ── Reference data (mirrors the backend enums) ──────────────────────────────
const APPROVAL_TYPES = [
  "REZONING",
  "TOWNSHIP_ESTABLISHMENT",
  "SUBDIVISION_CONSOLIDATION",
  "SITE_DEVELOPMENT_PLAN",
  "BUILDING_PLANS",
  "ENVIRONMENTAL_AUTHORISATION",
  "WATER_USE_LICENCE",
  "WATER_LICENCE",
  "GEOTECHNICAL_CLEARANCE",
  "TRAFFIC_IMPACT_APPROVAL",
  "HERITAGE_AUTHORISATION",
  "NHBRC_ENROLMENT",
  "BULK_SERVICES_AGREEMENT",
  "ELECTRICAL_SUPPLY_AGREEMENT",
  "FIRE_APPROVAL",
  "HEALTH_APPROVAL",
  "SG_DIAGRAM_APPROVAL",
  "OCCUPANCY_CERTIFICATE",
  "OTHER",
] as const;

const APPROVAL_STATUSES = [
  "NOT_STARTED",
  "SUBMITTED",
  "IN_REVIEW",
  "APPROVED",
  "REJECTED",
  "CONDITIONAL",
] as const;

const DEVELOPMENT_STAGES = [
  "APPRAISAL",
  "LAND_SECURED",
  "PLANNING_APPROVALS",
  "FUNDING",
  "CONSTRUCTION",
  "PRACTICAL_COMPLETION",
  "DEFECTS_LIABILITY",
  "SALES_LETTING",
  "EXITED",
] as const;

type ApprovalType = (typeof APPROVAL_TYPES)[number];
type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
type DevelopmentStage = (typeof DEVELOPMENT_STAGES)[number];

const prettify = (s: string) =>
  s
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const STATUS_STYLES: Record<ApprovalStatus, string> = {
  NOT_STARTED: "bg-gray-500/15 text-gray-500",
  SUBMITTED: "bg-blue-500/15 text-blue-600",
  IN_REVIEW: "bg-amber-500/15 text-amber-600",
  APPROVED: "bg-emerald-500/15 text-emerald-600",
  REJECTED: "bg-red-500/15 text-red-600",
  CONDITIONAL: "bg-purple-500/15 text-purple-600",
};

function fmtR(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return `R${Math.round(n).toLocaleString("en-ZA")}`;
}

function DevelopmentManagePage() {
  const { propertyId } = Route.useParams();
  const propId = Number(propertyId);
  const navigate = useNavigate();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useBlockPropertyOwner();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const isManager = ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"].includes(user?.role ?? "");

  const propertyQuery = useQuery({
    ...trpc.getPropertyById.queryOptions({ propertyId: propId }),
    enabled: !!authToken && Number.isFinite(propId),
  });
  const approvalsQuery = useQuery({
    ...trpc.getDevelopmentApprovals.queryOptions({ authToken: authToken ?? "", propertyId: propId }),
    enabled: !!authToken && Number.isFinite(propId),
  });
  const readinessQuery = useQuery({
    ...trpc.getProjectReadiness.queryOptions({ authToken: authToken ?? "", propertyId: propId }),
    enabled: !!authToken && Number.isFinite(propId),
  });

  const property = propertyQuery.data as any;
  const dev = property?.propertyDevelopment ?? null;
  const currentStage: DevelopmentStage =
    (dev?.developmentStage as DevelopmentStage) ?? "APPRAISAL";

  const approvals = approvalsQuery.data?.approvals ?? [];
  const approvalSummary = approvalsQuery.data?.summary;
  const readiness = readinessQuery.data as any;

  // ── Mutations (imperative client, then refetch) ───────────────────────────
  const [savingStage, setSavingStage] = useState(false);
  const [busyApprovalId, setBusyApprovalId] = useState<number | null>(null);
  const [uploadingId, setUploadingId] = useState<number | "new" | null>(null);
  const [addingApproval, setAddingApproval] = useState(false);
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});

  const refetchAll = async () => {
    await Promise.all([approvalsQuery.refetch(), readinessQuery.refetch(), propertyQuery.refetch()]);
  };

  const changeStage = async (stage: DevelopmentStage) => {
    if (!authToken || stage === currentStage) return;
    setSavingStage(true);
    try {
      await trpcClient.updateDevelopmentStage.mutate({ authToken, propertyId: propId, stage });
      toast.success(`Stage moved to ${prettify(stage)}`);
      await refetchAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not change stage");
    } finally {
      setSavingStage(false);
    }
  };

  const changeApprovalStatus = async (approvalId: number, status: ApprovalStatus) => {
    if (!authToken) return;
    setBusyApprovalId(approvalId);
    try {
      await trpcClient.updateDevelopmentApproval.mutate({ authToken, approvalId, status });
      toast.success("Approval updated");
      await refetchAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update approval");
    } finally {
      setBusyApprovalId(null);
    }
  };

  const toBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const r = reader.result as string;
        resolve(r.includes(",") ? r.split(",")[1] ?? "" : r);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const uploadDocForApproval = async (approvalId: number, file: File) => {
    if (!authToken) return;
    setUploadingId(approvalId);
    try {
      const fileBase64 = await toBase64(file);
      const res = await trpcClient.uploadFile.mutate({
        authToken,
        fileName: file.name,
        fileType: file.type,
        fileBase64,
      });
      await trpcClient.updateDevelopmentApproval.mutate({
        authToken,
        approvalId,
        documentUrl: res.publicUrl,
      });
      toast.success("Document attached to the due-diligence pack");
      await refetchAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setUploadingId(null);
    }
  };

  // ── New approval form ──────────────────────────────────────────────────────
  const [newType, setNewType] = useState<ApprovalType>("REZONING");
  const [newAuthority, setNewAuthority] = useState("");
  const [newReference, setNewReference] = useState("");
  const [newTargetDate, setNewTargetDate] = useState("");
  const [newStatus, setNewStatus] = useState<ApprovalStatus>("NOT_STARTED");

  const addApproval = async () => {
    if (!authToken) return;
    setAddingApproval(true);
    try {
      await trpcClient.createDevelopmentApproval.mutate({
        authToken,
        propertyId: propId,
        type: newType,
        status: newStatus,
        authority: newAuthority || undefined,
        reference: newReference || undefined,
        targetDate: newTargetDate || undefined,
      });
      toast.success("Approval item added");
      setNewAuthority("");
      setNewReference("");
      setNewTargetDate("");
      setNewStatus("NOT_STARTED");
      await refetchAll();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not add approval");
    } finally {
      setAddingApproval(false);
    }
  };

  const ddDocs = useMemo(
    () => approvals.filter((a: any) => !!a.documentUrl),
    [approvals],
  );

  if (!user || !authToken) return null;

  if (propertyQuery.isLoading) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold-500 border-r-transparent" />
        </div>
      </div>
    );
  }

  if (!dev) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="mx-auto max-w-5xl px-4 py-16 text-center">
          <AlertTriangle className="mx-auto mb-3 text-amber-500" size={40} />
          <p className="text-lg font-medium text-gray-300">
            This property is not a greenfield development, so there is no approvals pack to manage.
          </p>
          <Link to="/developments" className="mt-4 inline-block text-gold-500 hover:text-gold-400">
            ← Back to developments
          </Link>
        </div>
      </div>
    );
  }

  const readinessReasons: string[] = readiness?.readiness?.reasons ?? [];
  const isReady = readiness?.readiness?.constructionReady ?? false;

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <Link
          to="/developments"
          className="mb-4 inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gold-500"
        >
          <ArrowLeft size={16} /> Back to developments
        </Link>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-gold-50 p-3">
              <ClipboardCheck className="text-gold-600" size={26} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {dev.projectName ?? property.title} — Approvals & Due Diligence
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Report approval progress, track the development process and upload the due-diligence pack.
              </p>
            </div>
          </div>
          <Link
            to="/properties/$propertyId"
            params={{ propertyId: String(propId) }}
            className="rounded-lg border border-navy-700 px-4 py-2 text-sm font-medium text-gray-300 hover:border-gold-400 hover:text-gold-400"
          >
            View full project
          </Link>
        </div>

        {/* Readiness summary */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Gross Development Value" value={fmtR(readiness?.grossDevelopmentValue)} />
          <StatCard label="Forecast Profit" value={fmtR(readiness?.profit)} />
          <StatCard
            label="Profit on Cost"
            value={
              readiness?.profitOnCost != null ? `${readiness.profitOnCost.toFixed(1)}%` : "—"
            }
          />
          <StatCard
            label="Required Approvals"
            value={
              approvalSummary
                ? `${approvalSummary.approved}/${approvalSummary.required}`
                : "—"
            }
            hint={
              approvalSummary?.constructionReady
                ? "All required approvals in place"
                : `${approvalSummary?.outstanding ?? 0} outstanding`
            }
            tone={approvalSummary?.constructionReady ? "good" : "warn"}
          />
        </div>

        {/* Development process stepper */}
        <section className="mb-6 rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
          <div className="mb-4 flex items-center gap-2">
            <MilestoneIcon className="text-gold-500" size={18} />
            <h2 className="text-lg font-semibold text-gray-900">Development Process</h2>
          </div>
          <ol className="flex flex-wrap gap-2">
            {DEVELOPMENT_STAGES.map((stage, i) => {
              const currentIndex = DEVELOPMENT_STAGES.indexOf(currentStage);
              const done = i < currentIndex;
              const active = i === currentIndex;
              return (
                <li key={stage} className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      active
                        ? "bg-gold-500 text-white"
                        : done
                          ? "bg-emerald-500/15 text-emerald-600"
                          : "bg-navy-800 text-gray-400"
                    }`}
                  >
                    {i + 1}. {prettify(stage)}
                  </span>
                </li>
              );
            })}
          </ol>

          {isManager && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="text-sm text-gray-500">Set current stage:</label>
              <select
                value={currentStage}
                onChange={(e) => changeStage(e.target.value as DevelopmentStage)}
                disabled={savingStage}
                className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-2 text-sm text-gray-200 focus:border-gold-500 focus:outline-none"
              >
                {DEVELOPMENT_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {prettify(s)}
                  </option>
                ))}
              </select>
              {savingStage && <Loader2 className="animate-spin text-gold-500" size={16} />}
              <p className="text-xs text-gray-500">
                Moving to Construction requires all approvals, funding and the professional team in place.
              </p>
            </div>
          )}

          {readiness && (
            <div
              className={`mt-4 flex items-start gap-2 rounded-lg p-3 text-sm ${
                isReady ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
              }`}
            >
              {isReady ? (
                <ShieldCheck size={18} className="mt-0.5" />
              ) : (
                <AlertTriangle size={18} className="mt-0.5" />
              )}
              <div>
                <p className="font-medium">
                  {isReady ? "Project is construction-ready" : "Outstanding items before construction"}
                </p>
                {readinessReasons.length > 0 && (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {readinessReasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Approvals tracker */}
        <section className="mb-6 rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="text-gold-500" size={18} />
              <h2 className="text-lg font-semibold text-gray-900">Statutory Approvals & Consents</h2>
            </div>
            {approvalSummary && (
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  approvalSummary.constructionReady
                    ? "bg-emerald-500/15 text-emerald-600"
                    : "bg-amber-500/15 text-amber-600"
                }`}
              >
                {approvalSummary.approved} of {approvalSummary.required} required approved
              </span>
            )}
          </div>

          {approvals.length === 0 ? (
            <p className="rounded-lg border border-dashed border-navy-700 py-8 text-center text-sm text-gray-500">
              No approval items yet. Add the consents this development needs below.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-navy-800 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="py-2 pr-4 font-medium">Consent</th>
                    <th className="py-2 pr-4 font-medium">Authority / Ref</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Document</th>
                  </tr>
                </thead>
                <tbody>
                  {approvals.map((a: any) => (
                    <tr key={a.id} className="border-b border-navy-800/60">
                      <td className="py-3 pr-4">
                        <span className="font-medium text-gray-900">{prettify(a.type)}</span>
                        {a.isRequired && (
                          <span className="ml-2 rounded bg-navy-800 px-1.5 py-0.5 text-[10px] text-gray-400">
                            REQUIRED
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-gray-400">
                        {a.authority || "—"}
                        {a.reference ? <span className="block text-xs text-gray-500">{a.reference}</span> : null}
                      </td>
                      <td className="py-3 pr-4">
                        {isManager ? (
                          <select
                            value={a.status}
                            disabled={busyApprovalId === a.id}
                            onChange={(e) => changeApprovalStatus(a.id, e.target.value as ApprovalStatus)}
                            className={`rounded-md border-0 px-2 py-1 text-xs font-medium ${STATUS_STYLES[a.status as ApprovalStatus]} focus:outline-none`}
                          >
                            {APPROVAL_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {prettify(s)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLES[a.status as ApprovalStatus]}`}
                          >
                            {prettify(a.status)}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          {a.documentUrl && (
                            <a
                              href={a.documentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-gold-500 hover:text-gold-400"
                            >
                              <FileText size={14} /> View <ExternalLink size={11} />
                            </a>
                          )}
                          {isManager && (
                            <>
                              <input
                                ref={(el) => {
                                  fileInputs.current[a.id] = el;
                                }}
                                type="file"
                                accept=".pdf,.doc,.docx,.xls,.xlsx,image/*"
                                className="hidden"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) void uploadDocForApproval(a.id, f);
                                  e.target.value = "";
                                }}
                              />
                              <button
                                type="button"
                                onClick={() => fileInputs.current[a.id]?.click()}
                                disabled={uploadingId === a.id}
                                className="inline-flex items-center gap-1 rounded-md border border-navy-700 px-2 py-1 text-xs text-gray-300 hover:border-gold-400 hover:text-gold-400"
                              >
                                {uploadingId === a.id ? (
                                  <Loader2 className="animate-spin" size={12} />
                                ) : (
                                  <Upload size={12} />
                                )}
                                {a.documentUrl ? "Replace" : "Upload"}
                              </button>
                            </>
                          )}
                          {!a.documentUrl && !isManager && <span className="text-xs text-gray-500">—</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add approval */}
          {isManager && (
            <div className="mt-5 rounded-lg border border-navy-800 bg-navy-950/60 p-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-300">
                <Plus size={15} /> Add approval item
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as ApprovalType)}
                  className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-2 text-sm text-gray-200 focus:border-gold-500 focus:outline-none"
                >
                  {APPROVAL_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {prettify(t)}
                    </option>
                  ))}
                </select>
                <input
                  value={newAuthority}
                  onChange={(e) => setNewAuthority(e.target.value)}
                  placeholder="Authority (e.g. City of Ekurhuleni)"
                  className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 focus:border-gold-500 focus:outline-none"
                />
                <input
                  value={newReference}
                  onChange={(e) => setNewReference(e.target.value)}
                  placeholder="Reference no."
                  className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-600 focus:border-gold-500 focus:outline-none"
                />
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value as ApprovalStatus)}
                  className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-2 text-sm text-gray-200 focus:border-gold-500 focus:outline-none"
                >
                  {APPROVAL_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {prettify(s)}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={newTargetDate}
                  onChange={(e) => setNewTargetDate(e.target.value)}
                  className="rounded-lg border border-navy-700 bg-navy-950 px-3 py-2 text-sm text-gray-200 focus:border-gold-500 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={addApproval}
                disabled={addingApproval}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600 disabled:opacity-60"
              >
                {addingApproval ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
                Add approval
              </button>
            </div>
          )}
        </section>

        {/* Due diligence pack */}
        <section className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
          <div className="mb-4 flex items-center gap-2">
            <FileText className="text-gold-500" size={18} />
            <h2 className="text-lg font-semibold text-gray-900">Due Diligence Pack</h2>
          </div>
          <p className="mb-4 text-sm text-gray-500">
            Documents attached to each approval item make up the investor-facing due-diligence pack.
            Upload supporting documents against the relevant consent above.
          </p>
          {ddDocs.length === 0 ? (
            <p className="rounded-lg border border-dashed border-navy-700 py-8 text-center text-sm text-gray-500">
              No documents uploaded yet.
            </p>
          ) : (
            <ul className="divide-y divide-navy-800">
              {ddDocs.map((a: any) => (
                <li key={a.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-navy-800 p-2">
                      <FileText className="text-gold-500" size={16} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{prettify(a.type)}</p>
                      <p className="text-xs text-gray-500">
                        {a.authority || "Supporting document"}
                        {a.reference ? ` · ${a.reference}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLES[a.status as ApprovalStatus]}`}
                    >
                      {prettify(a.status)}
                    </span>
                    <a
                      href={a.documentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-gold-500 hover:text-gold-400"
                    >
                      Open <ExternalLink size={12} />
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "warn";
}) {
  return (
    <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-bold text-gray-900">{value}</p>
      {hint && (
        <p
          className={`mt-1 inline-flex items-center gap-1 text-xs ${
            tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-gray-500"
          }`}
        >
          {tone === "good" ? <CheckCircle2 size={12} /> : tone === "warn" ? <AlertTriangle size={12} /> : null}
          {hint}
        </p>
      )}
    </div>
  );
}
