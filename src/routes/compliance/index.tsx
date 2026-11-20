import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Info,
  FileBarChart,
  Send,
  Loader2,
  Scale,
  Users,
  Landmark,
  ClipboardCheck,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

export const Route = createFileRoute("/compliance/")({
  component: CompliancePortalPage,
});

const ALLOWED = ["COMPLIANCE_OFFICER", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "ADMIN"];
const ADMIN_TEAM = ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "ADMIN"];
const R = (n: number) => `R${Math.round(n ?? 0).toLocaleString("en-ZA")}`;

const SEVERITY: Record<string, { label: string; badge: string; dot: string }> = {
  BLOCKER: { label: "Blocker", badge: "bg-rose-100 text-rose-700", dot: "bg-rose-500" },
  MATERIAL: { label: "Material", badge: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  RECOMMENDED: { label: "Recommended", badge: "bg-sky-100 text-sky-700", dot: "bg-sky-500" },
  PASS: { label: "Pass", badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
};
const STATUS_ICON: Record<string, any> = { PASS: CheckCircle2, PARTIAL: AlertTriangle, FAIL: ShieldAlert };

function CompliancePortalPage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const [tab, setTab] = useState<"audit" | "reports">("audit");
  const [title, setTitle] = useState("");
  const [reportType, setReportType] = useState("FSCA_AUDIT");
  const [summary, setSummary] = useState("");
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) void navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const isAllowed = ALLOWED.includes(user?.role ?? "");
  const isAdminTeam = ADMIN_TEAM.includes(user?.role ?? "");

  const auditQuery = useQuery({
    ...trpc.getComplianceAudit.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isAllowed,
  });
  const reportsQuery = useQuery({
    ...trpc.getComplianceReports.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isAllowed,
  });

  if (!user || !authToken) return null;
  if (!isAllowed) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <ShieldAlert className="mx-auto mb-4 text-red-600" size={48} />
          <h1 className="text-2xl font-bold text-gray-900">Access restricted</h1>
          <p className="mt-2 text-gray-500">This portal is for the compliance officer and admin team.</p>
        </div>
      </div>
    );
  }

  const audit = auditQuery.data;
  const reports = reportsQuery.data ?? [];

  const generate = async () => {
    if (!title.trim()) {
      toast.error("Give the report a title.");
      return;
    }
    setGenerating(true);
    try {
      const res = await trpcClient.generateComplianceReport.mutate({
        authToken: authToken!,
        title: title.trim(),
        reportType: reportType as any,
        summary: summary || undefined,
        sendToAdmin: true,
      });
      toast.success(`Report generated (score ${res.overallScore}%) and sent to the admin team.`);
      setTitle("");
      setSummary("");
      setTab("reports");
      void queryClient.invalidateQueries({ queryKey: trpc.getComplianceReports.queryKey() });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not generate report.");
    } finally {
      setGenerating(false);
    }
  };

  const acknowledge = async (id: number) => {
    try {
      await trpcClient.acknowledgeComplianceReport.mutate({ authToken: authToken!, reportId: id });
      toast.success("Report acknowledged.");
      void queryClient.invalidateQueries({ queryKey: trpc.getComplianceReports.queryKey() });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not acknowledge.");
    }
  };

  const scoreColor = (s: number) => (s >= 80 ? "text-emerald-600" : s >= 50 ? "text-amber-600" : "text-rose-600");

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Navbar />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-rose-100 p-2.5 text-rose-700">
            <ShieldCheck size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Compliance Portal</h1>
            <p className="text-sm text-gray-500">
              FSCA, FICA, POPIA &amp; Companies-Act audit of the live platform — with reports for the admin team.
            </p>
          </div>
        </div>

        {/* Related compliance tools */}
        <div className="mb-6 flex flex-wrap gap-2">
          <Link to="/fsca-readiness" className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"><ClipboardCheck size={14} /> FSCA readiness</Link>
          <Link to="/compliance-dashboard" className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"><Users size={14} /> FICA register</Link>
          <Link to="/admin/audit-log" className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"><Scale size={14} /> Audit log</Link>
          <Link to="/admin/investments" className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"><Landmark size={14} /> Investments</Link>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-2 border-b border-gray-200">
          <button onClick={() => setTab("audit")} className={`px-4 py-2 text-sm font-medium ${tab === "audit" ? "border-b-2 border-rose-600 text-rose-700" : "text-gray-500"}`}>Live audit</button>
          <button onClick={() => setTab("reports")} className={`px-4 py-2 text-sm font-medium ${tab === "reports" ? "border-b-2 border-rose-600 text-rose-700" : "text-gray-500"}`}>Reports ({reports.length})</button>
        </div>

        {tab === "audit" && (
          <>
            {auditQuery.isLoading ? (
              <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-rose-500 border-r-transparent" /></div>
            ) : audit ? (
              <>
                {/* Score + counts */}
                <div className="mb-6 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Compliance score</p>
                    <p className={`text-3xl font-bold ${scoreColor(audit.overallScore)}`}>{audit.overallScore}%</p>
                  </div>
                  <Count label="Blockers" value={audit.counts.blockers} color="text-rose-600" />
                  <Count label="Material" value={audit.counts.material} color="text-amber-600" />
                  <Count label="Passed" value={`${audit.counts.passed}/${audit.counts.total}`} color="text-emerald-600" />
                </div>

                {/* Key metrics */}
                <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Metric label="Investors" value={String(audit.metrics.totalInvestors)} />
                  <Metric label="FICA verified" value={`${audit.metrics.kycCompliancePct}%`} />
                  <Metric label="Tax withheld" value={R(audit.metrics.totalTaxWithheld)} />
                  <Metric label="Audit entries" value={String(audit.metrics.auditLogCount)} />
                </div>

                {/* Findings */}
                <div className="space-y-2">
                  {audit.findings.map((f: any) => {
                    const sev = SEVERITY[f.severity] ?? SEVERITY.RECOMMENDED;
                    const Icon = STATUS_ICON[f.status] ?? Info;
                    return (
                      <div key={f.ref} className="rounded-xl border border-gray-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <Icon size={18} className={f.status === "PASS" ? "text-emerald-600" : f.status === "PARTIAL" ? "text-amber-500" : "text-rose-600"} />
                            <div>
                              <p className="font-semibold text-gray-900">
                                <span className="text-gray-400">{f.ref}.</span> {f.requirement}
                              </p>
                              <p className="mt-0.5 text-sm text-gray-600">{f.note}</p>
                              <p className="mt-1 text-xs text-gray-400">{f.area} · {f.regulation}</p>
                            </div>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${sev.badge}`}>{sev.label}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Generate report */}
                <div className="mt-8 rounded-xl border border-rose-200 bg-rose-50/40 p-5">
                  <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold"><FileBarChart size={18} className="text-rose-700" /> Generate &amp; send a report</h2>
                  <p className="mb-4 text-sm text-gray-600">Snapshots the current audit and delivers it to the admin team with an in-app notification.</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Report title (e.g. Q4 FSCA compliance review)" className="rounded-md border border-gray-300 px-3 py-2 text-sm" />
                    <select value={reportType} onChange={(e) => setReportType(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
                      <option value="FSCA_AUDIT">FSCA audit</option>
                      <option value="FICA_REVIEW">FICA / KYC review</option>
                      <option value="AML_REVIEW">AML / sanctions review</option>
                      <option value="FINANCIAL_REVIEW">Financial controls review</option>
                      <option value="AD_HOC">Ad-hoc</option>
                    </select>
                    <textarea value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Optional analyst summary (leave blank to auto-generate)…" rows={2} className="rounded-md border border-gray-300 px-3 py-2 text-sm sm:col-span-2" />
                  </div>
                  <button onClick={generate} disabled={generating} className="mt-3 inline-flex items-center gap-1 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-60">
                    {generating ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Generate &amp; send to admin
                  </button>
                </div>
              </>
            ) : null}
          </>
        )}

        {tab === "reports" && (
          <div className="space-y-3">
            {reportsQuery.isLoading ? (
              <div className="flex justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-4 border-rose-500 border-r-transparent" /></div>
            ) : reports.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
                <FileBarChart className="mx-auto mb-3 text-gray-300" size={40} />
                <p className="text-lg font-medium">No reports yet</p>
                <p className="mt-1 text-sm text-gray-500">Generate your first compliance report from the Live audit tab.</p>
              </div>
            ) : (
              reports.map((r: any) => (
                <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{r.title}</p>
                      <p className="text-xs text-gray-500">
                        {r.reportType.replace(/_/g, " ")} · by {r.authorName}{r.authorLicense ? ` (${r.authorLicense})` : ""} · {new Date(r.createdAt).toLocaleDateString("en-ZA")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-xl font-bold ${scoreColor(r.overallScore)}`}>{r.overallScore}%</p>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${r.status === "ACKNOWLEDGED" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{r.status}</span>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-gray-600">{r.summary}</p>
                  {Array.isArray(r.findings) && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {r.findings.filter((f: any) => f.status !== "PASS").slice(0, 8).map((f: any, i: number) => (
                        <span key={i} className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${(SEVERITY[f.severity] ?? SEVERITY.RECOMMENDED).badge}`}>
                          {f.ref} {f.area}
                        </span>
                      ))}
                    </div>
                  )}
                  {isAdminTeam && r.status !== "ACKNOWLEDGED" && (
                    <button onClick={() => acknowledge(r.id)} className="mt-3 inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-3 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50">
                      <CheckCircle2 size={14} /> Acknowledge receipt
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Count({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-lg font-bold text-gray-900">{value}</p>
    </div>
  );
}
