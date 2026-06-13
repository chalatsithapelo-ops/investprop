import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Shield, Users, CheckCircle, XCircle, Clock, Building2, FileText, AlertTriangle, Search, ShieldAlert } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

const MANAGER_ROLES = ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "PROPERTY_OWNER", "OWNER"];

export const Route = createFileRoute("/compliance-dashboard/")({
  component: ComplianceDashboardPage,
});

function ComplianceDashboardPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const isManager = MANAGER_ROLES.includes(user?.role ?? "");
  if (!user || !authToken) return null;
  if (!isManager) {
    return (
      <div className="min-h-screen bg-navy-950"><Navbar />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <ShieldAlert className="mx-auto mb-4 text-red-600" size={48} />
          <h1 className="text-2xl font-bold text-gray-900">Access Restricted</h1>
          <p className="mt-2 text-gray-500">Only managers and property owners can access the compliance dashboard.</p>
          <button onClick={() => navigate({ to: "/dashboard" })} className="mt-6 rounded-lg bg-gold-500 px-6 py-2 text-sm font-medium text-white hover:bg-gold-600">Back to Dashboard</button>
        </div>
      </div>
    );
  }

  const dashboardQuery = useQuery({
    ...trpc.getComplianceDashboard.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
  });

  const propertiesQuery = useQuery({
    ...trpc.getProperties.queryOptions({}),
    enabled: !!authToken,
  });

  const checklistQuery = useQuery({
    ...trpc.getRegulatoryChecklist.queryOptions({ authToken: authToken ?? "", propertyId: selectedPropertyId ?? 0 }),
    enabled: !!authToken && !!selectedPropertyId,
  });

  const ficaQuery = useQuery({
    ...trpc.getFICAStatus.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
  });

  const dashboard = dashboardQuery.data as any;
  const properties = (propertiesQuery.data as any)?.properties ?? propertiesQuery.data ?? [];
  const checklist = checklistQuery.data as any;
  const ficaData = (ficaQuery.data ?? []) as any[];

  const stats = [
    { label: "Total Investors", value: dashboard?.investorStats?.total ?? 0, icon: Users, color: "blue" },
    { label: "KYC Approved", value: dashboard?.investorStats?.kycApproved ?? 0, icon: CheckCircle, color: "green" },
    { label: "KYC Pending", value: dashboard?.investorStats?.kycPending ?? 0, icon: Clock, color: "yellow" },
    { label: "KYC Rejected", value: dashboard?.investorStats?.kycRejected ?? 0, icon: XCircle, color: "red" },
  ];

  const colorMap: Record<string, string> = {
    blue: "bg-navy-800/30 text-gold-600",
    green: "bg-emerald-50 text-emerald-600",
    yellow: "bg-gold-50 text-gold-600",
    red: "bg-red-50 text-red-600",
  };

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <Shield className="text-gold-600" size={32} />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Compliance Dashboard</h1>
            <p className="text-gray-500">Regulatory oversight &amp; KYC management</p>
          </div>
        </div>

        {dashboardQuery.isLoading ? (
          <div className="flex justify-center py-16"><div className="h-10 w-10 animate-spin rounded-full border-4 border-gold-500 border-r-transparent"></div></div>
        ) : (
          <>
            {/* KPI Stats */}
            <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              {stats.map((s) => (
                <div key={s.label} className={`rounded-xl p-5 ${colorMap[s.color]}`}>
                  <div className="flex items-center justify-between">
                    <s.icon size={24} />
                    <span className="text-3xl font-bold">{s.value}</span>
                  </div>
                  <p className="mt-2 text-sm font-medium opacity-80">{s.label}</p>
                </div>
              ))}
            </div>

            {/* SPV & Financial Stats */}
            <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="rounded-lg border border-navy-800/50 bg-navy-900/50">
                <div className="mb-3 flex items-center gap-2">
                  <Building2 size={20} className="text-indigo-500" />
                  <h3 className="font-semibold text-gray-900">SPV Overview</h3>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Total SPVs</span><span className="font-medium text-gray-900">{dashboard?.spvStats?.total ?? 0}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Active SPVs</span><span className="font-medium text-emerald-600">{dashboard?.spvStats?.active ?? 0}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Properties</span><span className="font-medium text-gray-900">{dashboard?.propertyStats?.total ?? 0}</span></div>
                </div>
              </div>

              <div className="rounded-lg border border-navy-800/50 bg-navy-900/50">
                <div className="mb-3 flex items-center gap-2">
                  <FileText size={20} className="text-purple-500" />
                  <h3 className="font-semibold text-gray-900">Distributions</h3>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Total Distributions</span><span className="font-medium text-gray-900">{dashboard?.financialStats?.totalDistributions ?? 0}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Total Amount</span><span className="font-medium text-emerald-600">R{Number(dashboard?.financialStats?.totalDistributionAmount ?? 0).toLocaleString()}</span></div>
                </div>
              </div>

              <div className="rounded-lg border border-navy-800/50 bg-navy-900/50">
                <div className="mb-3 flex items-center gap-2">
                  <AlertTriangle size={20} className="text-orange-500" />
                  <h3 className="font-semibold text-gray-900">Compliance Risk</h3>
                </div>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">Non-compliant investors</span><span className="font-medium text-red-600">{dashboard?.investorStats?.kycRejected ?? 0}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Pending review</span><span className="font-medium text-yellow-600">{dashboard?.investorStats?.kycPending ?? 0}</span></div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Compliance rate</span>
                    <span className="font-medium text-emerald-600">{dashboard?.investorStats?.total ? `${((dashboard.investorStats.kycApproved / dashboard.investorStats.total) * 100).toFixed(1)}%` : "—"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* FICA Status Table */}
            <div className="mb-6 rounded-lg border border-navy-800/50 bg-navy-900/50">
              <div className="flex items-center justify-between border-b px-6 py-4 border-navy-800/50">
                <div className="flex items-center gap-2">
                  <Search size={20} className="text-gray-500" />
                  <h3 className="font-semibold text-gray-900">FICA Status Lookup</h3>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-navy-800/30 text-left text-gray-500 border-navy-800/50 bg-navy-950">
                    <tr>
                      <th className="px-6 py-3">Investor</th>
                      <th className="px-6 py-3">ID Document</th>
                      <th className="px-6 py-3">Proof of Address</th>
                      <th className="px-6 py-3">Bank Confirmation Letter</th>
                      <th className="px-6 py-3">Tax Number</th>
                      <th className="px-6 py-3">Overall</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {ficaData.map((f: any) => (
                      <tr key={f.investorId}>
                        <td className="px-6 py-3 font-medium text-gray-900">{f.name ?? `Investor #${f.investorId}`}</td>
                        {["idDocument", "proofOfAddress", "bankStatement", "taxNumber"].map((k) => (
                          <td key={k} className="px-6 py-3"><StatusBadge status={f[k]} /></td>
                        ))}
                        <td className="px-6 py-3"><StatusBadge status={f.overall} /></td>
                      </tr>
                    ))}
                    {ficaData.length === 0 && (
                      <tr><td colSpan={6} className="py-8 text-center text-gray-500">No FICA data available</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Regulatory Checklist */}
            <div className="rounded-lg border border-navy-800/50 bg-navy-900/50">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4 border-navy-800/50">
                <h3 className="font-semibold text-gray-900">Regulatory Checklist</h3>
                <select value={selectedPropertyId ?? ""} onChange={(e) => setSelectedPropertyId(e.target.value ? Number(e.target.value) : null)} className="rounded-lg border px-3 py-2 text-sm border-navy-700 bg-navy-800/50">
                  <option value="">Select a property</option>
                  {(Array.isArray(properties) ? properties : []).map((p: any) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>
              {selectedPropertyId ? (
                checklistQuery.isLoading ? (
                  <div className="flex justify-center py-8"><div className="h-8 w-8 animate-spin rounded-full border-4 border-gold-500 border-r-transparent"></div></div>
                ) : (
                  <div className="p-6">
                    {checklist?.overallCompliance != null && (
                      <div className="mb-4 flex items-center gap-3">
                        <div className="h-3 flex-1 rounded-full bg-gray-200 bg-navy-800">
                          <div className="h-3 rounded-full bg-green-500" style={{ width: `${checklist.overallCompliance}%` }} />
                        </div>
                        <span className="text-sm font-medium text-gray-900">{checklist.overallCompliance}%</span>
                      </div>
                    )}
                    <div className="space-y-2">
                      {(checklist?.checklist ?? []).map((item: any, i: number) => (
                        <div key={i} className="flex items-center gap-3 rounded-lg border p-3 border-navy-800/50">
                          {item.completed ? <CheckCircle className="text-green-500" size={20} /> : <XCircle className="text-red-600" size={20} />}
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">{item.item}</p>
                            {item.description && <p className="text-xs text-gray-500">{item.description}</p>}
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${item.completed ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>{item.completed ? "Complete" : "Pending"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              ) : (
                <p className="py-8 text-center text-gray-500">Select a property to view its regulatory checklist</p>
              )}
            </div>

            {/* Recent Audit Logs */}
            {dashboard?.recentAuditLogs?.length > 0 && (
              <div className="mt-6 rounded-lg border border-navy-800/50 bg-navy-900/50">
                <div className="border-b px-6 py-4 border-navy-800/50">
                  <h3 className="font-semibold text-gray-900">Recent Audit Logs</h3>
                </div>
                <div className="divide-y">
                  {dashboard.recentAuditLogs.map((log: any) => (
                    <div key={log.id} className="flex items-center gap-4 px-6 py-3">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{log.action}</p>
                        <p className="text-xs text-gray-500">{log.entity} • {log.details}</p>
                      </div>
                      <span className="text-xs text-gray-500">{new Date(log.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <span className="text-gray-500">—</span>;
  const cfg: Record<string, string> = {
    APPROVED: "bg-emerald-50 text-emerald-600",
    PENDING: "bg-gold-50 text-gold-600",
    REJECTED: "bg-red-50 text-red-600",
    MISSING: "bg-navy-800/50 text-gray-600",
    COMPLIANT: "bg-emerald-50 text-emerald-600",
    "NON-COMPLIANT": "bg-red-50 text-red-600",
  };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cfg[status] ?? "bg-navy-800/50 text-gray-800"}`}>{status}</span>;
}
