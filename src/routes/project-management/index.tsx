import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Target, CheckCircle, Clock, AlertTriangle, Shield, ShieldAlert, Plus, X, Pencil } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

const MANAGER_ROLES = ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "PROPERTY_OWNER", "OWNER"];

export const Route = createFileRoute("/project-management/")({
  component: ProjectManagementPage,
});

function ProjectManagementPage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);
  const [tab, setTab] = useState<"milestones" | "risks">("milestones");
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [showRiskForm, setShowRiskForm] = useState(false);
  const [editingMilestone, setEditingMilestone] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  // Milestone form fields
  const [mName, setMName] = useState("");
  const [mDesc, setMDesc] = useState("");
  const [mStartDate, setMStartDate] = useState("");
  const [mEndDate, setMEndDate] = useState("");
  const [mBudget, setMBudget] = useState("");
  const [mStatus, setMStatus] = useState("PLANNED");

  // Risk form fields
  const [rTitle, setRTitle] = useState("");
  const [rDesc, setRDesc] = useState("");
  const [rSeverity, setRSeverity] = useState("MEDIUM");
  const [rLikelihood, setRLikelihood] = useState("POSSIBLE");
  const [rMitigation, setRMitigation] = useState("");
  const [rImpactCost, setRImpactCost] = useState("");

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
          <p className="mt-2 text-gray-500">Only managers and property owners can access project management.</p>
          <button onClick={() => navigate({ to: "/dashboard" })} className="mt-6 rounded-lg bg-gold-500 px-6 py-2 text-sm font-medium text-white hover:bg-gold-600">Back to Dashboard</button>
        </div>
      </div>
    );
  }

  const propertiesQuery = useQuery({
    ...trpc.getProperties.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
  });

  const milestonesQuery = useQuery({
    ...trpc.getMilestones.queryOptions({ authToken: authToken ?? "", propertyId: selectedPropertyId ?? 0 }),
    enabled: !!authToken && !!selectedPropertyId,
  });

  const risksQuery = useQuery({
    ...trpc.getRisks.queryOptions({ authToken: authToken ?? "", propertyId: selectedPropertyId ?? 0 }),
    enabled: !!authToken && !!selectedPropertyId,
  });

  const properties = (propertiesQuery.data as any)?.properties ?? propertiesQuery.data ?? [];
  const propertiesArr = Array.isArray(properties) ? properties : [];
  const devProperties = propertiesArr.filter((p: any) => p.type === "DEVELOPMENT" || p.type === "FLIP" || true);

  const milestones = (milestonesQuery.data as any)?.milestones ?? milestonesQuery.data ?? [];
  const milestonesArr = Array.isArray(milestones) ? milestones : [];

  const risks = (risksQuery.data as any)?.risks ?? risksQuery.data ?? [];
  const risksArr = Array.isArray(risks) ? risks : [];

  if (!user || !authToken) return null;

  const handleCreateMilestone = async () => {
    if (!selectedPropertyId || !mName || !mDesc || !mStartDate || !mEndDate) { toast.error("Please fill all required fields"); return; }
    setSubmitting(true);
    try {
      await trpcClient.createMilestone.mutate({
        authToken: authToken!,
        propertyId: selectedPropertyId,
        name: mName,
        description: mDesc,
        estimatedStartDate: new Date(mStartDate).toISOString(),
        estimatedCompletionDate: new Date(mEndDate).toISOString(),
        budgetAllocated: mBudget ? Number(mBudget) : 0,
      });
      toast.success("Milestone created");
      setShowMilestoneForm(false);
      setMName(""); setMDesc(""); setMStartDate(""); setMEndDate(""); setMBudget("");
      queryClient.invalidateQueries({ queryKey: trpc.getMilestones.queryKey() });
    } catch (err: any) { toast.error(err.message ?? "Failed to create milestone"); }
    finally { setSubmitting(false); }
  };

  const handleUpdateMilestone = async (milestoneId: number, status: string) => {
    try {
      await trpcClient.updateMilestone.mutate({
        authToken: authToken!,
        milestoneId,
        status: status as any,
        ...(status === "COMPLETED" ? { actualCompletionDate: new Date().toISOString() } : {}),
        ...(status === "IN_PROGRESS" ? { actualStartDate: new Date().toISOString() } : {}),
      });
      toast.success("Milestone updated");
      queryClient.invalidateQueries({ queryKey: trpc.getMilestones.queryKey() });
    } catch (err: any) { toast.error(err.message ?? "Failed to update"); }
  };

  const handleCreateRisk = async () => {
    if (!selectedPropertyId || !rTitle || !rDesc || !rMitigation) { toast.error("Please fill all required fields"); return; }
    setSubmitting(true);
    try {
      await trpcClient.createRisk.mutate({
        authToken: authToken!,
        propertyId: selectedPropertyId,
        title: rTitle,
        description: rDesc,
        severity: rSeverity as any,
        likelihood: rLikelihood as any,
        mitigationPlan: rMitigation,
        impactCost: rImpactCost ? Number(rImpactCost) : 0,
      });
      toast.success("Risk entry created");
      setShowRiskForm(false);
      setRTitle(""); setRDesc(""); setRSeverity("MEDIUM"); setRLikelihood("POSSIBLE"); setRMitigation(""); setRImpactCost("");
      queryClient.invalidateQueries({ queryKey: trpc.getRisks.queryKey() });
    } catch (err: any) { toast.error(err.message ?? "Failed to create risk"); }
    finally { setSubmitting(false); }
  };

  if (propertiesQuery.isLoading) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold-500 border-r-transparent"></div>
        </div>
      </div>
    );
  }

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      PLANNED: "bg-blue-500/20 text-blue-600",
      IN_PROGRESS: "bg-amber-500/20 text-amber-600",
      COMPLETED: "bg-emerald-500/20 text-emerald-600",
    };
    return map[status] ?? "bg-gray-500/20 text-gray-500";
  };

  const severityColor = (severity: string) => {
    const map: Record<string, string> = {
      LOW: "text-emerald-600 bg-emerald-50",
      MEDIUM: "text-amber-600 bg-amber-50",
      HIGH: "text-orange-400 bg-orange-500/10",
      CRITICAL: "text-red-600 bg-red-50",
    };
    return map[severity] ?? "text-gray-500 bg-gray-100";
  };

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Target className="text-gold-600" size={32} />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Project Management</h1>
              <p className="mt-1 text-gray-500">Track milestones, risks and project progress</p>
            </div>
          </div>
          <select
            value={selectedPropertyId ?? ""}
            onChange={(e) => setSelectedPropertyId(e.target.value ? Number(e.target.value) : null)}
            className="rounded-lg border border-navy-700 bg-navy-900 px-4 py-2 text-gray-900 focus:border-gold-500 focus:outline-none"
          >
            <option value="">Select Property</option>
            {devProperties.map((p: any) => (
              <option key={p.id} value={p.id}>{p.title ?? p.name}</option>
            ))}
          </select>
        </div>

        {!selectedPropertyId ? (
          <div className="rounded-xl border-2 border-dashed border-navy-700 py-20 text-center">
            <Target className="mx-auto mb-3 text-gray-600" size={48} />
            <p className="text-lg font-medium text-gray-500">Select a property to manage its project</p>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="mb-6 flex gap-1 rounded-lg bg-navy-900 p-1">
              {(["milestones", "risks"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
                    tab === t ? "bg-gold-500 text-navy-950" : "text-gray-500 hover:text-gold-600"
                  }`}
                >
                  {t === "milestones" ? <CheckCircle size={16} /> : <Shield size={16} />}
                  {t === "milestones" ? "Milestones" : "Risks"}
                </button>
              ))}
            </div>

            {/* Milestones Tab */}
            {tab === "milestones" && (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <button onClick={() => setShowMilestoneForm(true)} className="inline-flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-600">
                    <Plus size={16} /> Add Milestone
                  </button>
                </div>

                {/* Create Milestone Form */}
                {showMilestoneForm && (
                  <div className="rounded-xl border border-gold-300 bg-white p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-lg font-bold text-gray-900">New Milestone</h3>
                      <button onClick={() => setShowMilestoneForm(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-sm font-medium text-gray-700">Name *</label>
                        <input value={mName} onChange={(e) => setMName(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" placeholder="e.g., Foundation Complete" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-sm font-medium text-gray-700">Description *</label>
                        <textarea value={mDesc} onChange={(e) => setMDesc(e.target.value)} rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" placeholder="Describe this milestone..." />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Start Date *</label>
                        <input type="date" value={mStartDate} onChange={(e) => setMStartDate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">End Date *</label>
                        <input type="date" value={mEndDate} onChange={(e) => setMEndDate(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Budget Allocated (R)</label>
                        <input type="number" value={mBudget} onChange={(e) => setMBudget(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" placeholder="0" />
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end gap-3">
                      <button onClick={() => setShowMilestoneForm(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                      <button onClick={handleCreateMilestone} disabled={submitting} className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-600 disabled:opacity-50">
                        {submitting ? "Creating..." : "Create Milestone"}
                      </button>
                    </div>
                  </div>
                )}
                {milestonesQuery.isLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-gold-500 border-r-transparent"></div>
                  </div>
                ) : milestonesArr.length > 0 ? (
                  milestonesArr.map((m: any, i: number) => (
                    <div key={m.id ?? i} className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <div className={`rounded-full p-1.5 ${m.status === "COMPLETED" ? "bg-emerald-500/20" : m.status === "IN_PROGRESS" ? "bg-amber-500/20" : "bg-blue-500/20"}`}>
                              {m.status === "COMPLETED" ? <CheckCircle size={16} className="text-emerald-600" /> : <Clock size={16} className={m.status === "IN_PROGRESS" ? "text-amber-600" : "text-blue-600"} />}
                            </div>
                            <h3 className="font-semibold text-gray-900">{m.title ?? m.name}</h3>
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadge(m.status)}`}>
                              {m.status}
                            </span>
                          </div>
                          {m.description && <p className="mt-2 text-sm text-gray-500">{m.description}</p>}
                          <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
                            {m.dueDate && <span className="flex items-center gap-1"><Clock size={12} /> Due: {new Date(m.dueDate).toLocaleDateString("en-ZA")}</span>}
                            {m.completedDate && <span className="flex items-center gap-1"><CheckCircle size={12} /> Completed: {new Date(m.completedDate).toLocaleDateString("en-ZA")}</span>}
                          </div>
                        </div>
                        {m.percentageComplete != null && (
                          <div className="text-right">
                            <span className="text-2xl font-bold text-gold-600">{m.percentageComplete}%</span>
                            <div className="mt-1 h-2 w-24 rounded-full bg-navy-800">
                              <div className="h-2 rounded-full bg-gold-500" style={{ width: `${m.percentageComplete}%` }}></div>
                            </div>
                          </div>
                        )}
                      </div>
                      {/* Status update buttons */}
                      {m.status !== "COMPLETED" && (
                        <div className="mt-3 flex gap-2 border-t border-navy-800/30 pt-3">
                          {m.status === "PLANNED" && (
                            <button onClick={() => handleUpdateMilestone(m.id, "IN_PROGRESS")} className="rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-500/30">Start</button>
                          )}
                          {m.status === "IN_PROGRESS" && (
                            <button onClick={() => handleUpdateMilestone(m.id, "COMPLETED")} className="rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-500/30">Mark Complete</button>
                          )}
                          <button onClick={() => handleUpdateMilestone(m.id, "DELAYED")} className="rounded-lg bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-500/30">Mark Delayed</button>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 py-12 text-center">
                    <CheckCircle className="mx-auto mb-3 text-gray-600" size={40} />
                    <p className="text-gray-500">No milestones found for this property</p>
                  </div>
                )}
              </div>
            )}

            {/* Risks Tab */}
            {tab === "risks" && (
              <div className="space-y-4">
                <div className="flex justify-end">
                  <button onClick={() => setShowRiskForm(true)} className="inline-flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-600">
                    <Plus size={16} /> Add Risk
                  </button>
                </div>

                {/* Create Risk Form */}
                {showRiskForm && (
                  <div className="rounded-xl border border-gold-300 bg-white p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-lg font-bold text-gray-900">New Risk Entry</h3>
                      <button onClick={() => setShowRiskForm(false)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-sm font-medium text-gray-700">Title *</label>
                        <input value={rTitle} onChange={(e) => setRTitle(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" placeholder="e.g., Supply Chain Delay" />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-sm font-medium text-gray-700">Description *</label>
                        <textarea value={rDesc} onChange={(e) => setRDesc(e.target.value)} rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" placeholder="Describe the risk..." />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Severity</label>
                        <select value={rSeverity} onChange={(e) => setRSeverity(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none">
                          <option value="LOW">Low</option>
                          <option value="MEDIUM">Medium</option>
                          <option value="HIGH">High</option>
                          <option value="CRITICAL">Critical</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Likelihood</label>
                        <select value={rLikelihood} onChange={(e) => setRLikelihood(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none">
                          <option value="RARE">Rare</option>
                          <option value="UNLIKELY">Unlikely</option>
                          <option value="POSSIBLE">Possible</option>
                          <option value="LIKELY">Likely</option>
                          <option value="ALMOST_CERTAIN">Almost Certain</option>
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="mb-1 block text-sm font-medium text-gray-700">Mitigation Plan *</label>
                        <textarea value={rMitigation} onChange={(e) => setRMitigation(e.target.value)} rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" placeholder="How will this risk be mitigated?" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Impact Cost (R)</label>
                        <input type="number" value={rImpactCost} onChange={(e) => setRImpactCost(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" placeholder="0" />
                      </div>
                    </div>
                    <div className="mt-4 flex justify-end gap-3">
                      <button onClick={() => setShowRiskForm(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                      <button onClick={handleCreateRisk} disabled={submitting} className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-600 disabled:opacity-50">
                        {submitting ? "Creating..." : "Create Risk"}
                      </button>
                    </div>
                  </div>
                )}
                {risksQuery.isLoading ? (
                  <div className="flex justify-center py-12">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-gold-500 border-r-transparent"></div>
                  </div>
                ) : risksArr.length > 0 ? (
                  risksArr.map((r: any, i: number) => (
                    <div key={r.id ?? i} className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <AlertTriangle size={18} className={severityColor(r.severity ?? r.level).split(" ")[0]} />
                            <h3 className="font-semibold text-gray-900">{r.title ?? r.name ?? r.description}</h3>
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${severityColor(r.severity ?? r.level)}`}>
                              {r.severity ?? r.level ?? "UNKNOWN"}
                            </span>
                          </div>
                          {r.description && <p className="mt-2 text-sm text-gray-500">{r.description}</p>}
                          {r.mitigation && (
                            <div className="mt-3 rounded-lg bg-navy-800/50 p-3">
                              <p className="text-xs font-medium text-gray-600">Mitigation Strategy</p>
                              <p className="mt-1 text-sm text-gray-500">{r.mitigation}</p>
                            </div>
                          )}
                          <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
                            {r.category && <span>Category: {r.category}</span>}
                            {r.status && <span>Status: {r.status}</span>}
                            {r.impact && <span>Impact: {r.impact}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 py-12 text-center">
                    <Shield className="mx-auto mb-3 text-gray-600" size={40} />
                    <p className="text-gray-500">No risks registered for this property</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
