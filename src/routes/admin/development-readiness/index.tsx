import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Navbar } from "~/components/Navbar";
import { useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";
import { HardHat, CheckCircle2, XCircle, Plus, Gauge } from "lucide-react";

export const Route = createFileRoute("/admin/development-readiness/")({
  component: ReadinessPage,
});

const ZAR = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(n);

const PROFESSIONAL_ROLES = [
  "TOWN_PLANNER", "ARCHITECT", "QUANTITY_SURVEYOR", "CIVIL_ENGINEER", "STRUCTURAL_ENGINEER",
  "ELECTRICAL_ENGINEER", "MECHANICAL_ENGINEER", "WET_SERVICES_ENGINEER", "ENVIRONMENTAL_SPECIALIST",
  "LAND_SURVEYOR", "GEOTECHNICAL_ENGINEER", "TRAFFIC_ENGINEER", "FIRE_CONSULTANT",
  "HEALTH_SAFETY_AGENT", "PROJECT_MANAGER", "CONVEYANCER", "VALUER", "OTHER",
] as const;
const APPOINTMENT_STATUSES = ["NOT_APPOINTED", "SHORTLISTED", "APPOINTED", "TERMINATED"] as const;

interface Professional {
  id: number;
  role: string;
  isRequired: boolean;
  status: string;
  firmName: string | null;
  contactName: string | null;
  feeAmount: number;
}
interface Readiness {
  developmentStage: string;
  grossDevelopmentValue: number;
  profit: number;
  profitOnCost: number;
  projectIRR: number;
  peakFunding: number;
  committedFunding: number;
  readiness: {
    economicsPass: boolean;
    professionalsPass: boolean;
    approvalsPass: boolean;
    fundingPass: boolean;
    constructionReady: boolean;
    missingProfessionals: string[];
    outstandingApprovals: string[];
    fundingShortfall: number;
    readinessScore: number;
    reasons: string[];
  };
}

function ReadinessPage() {
  const trpcClient = useTRPCClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [properties, setProperties] = useState<Array<{ id: number; title: string }>>([]);
  const [propertyId, setPropertyId] = useState<number | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [teamSummary, setTeamSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [newRole, setNewRole] = useState<string>(PROFESSIONAL_ROLES[0]);
  const [newFirm, setNewFirm] = useState("");

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const isManager =
    user?.role === "ADMIN" || user?.role === "DEVELOPMENT_MANAGER" || user?.role === "PROJECT_MANAGER";

  useEffect(() => {
    if (!authToken || !isManager) return;
    (async () => {
      try {
        const res = await trpcClient.getProperties.query({ type: "development", limit: 100 });
        const list = (res.properties as any[]).map((p) => ({ id: p.id, title: p.title }));
        setProperties(list);
        if (list.length > 0 && propertyId === null) setPropertyId(list[0]!.id);
      } catch (e: any) {
        toast.error(e.message ?? "Failed to load projects");
      }
    })();
  }, [authToken, isManager]);

  const load = useCallback(
    async (pid: number) => {
      if (!authToken) return;
      setLoading(true);
      try {
        const [r, team] = await Promise.all([
          trpcClient.getProjectReadiness.query({ authToken, propertyId: pid }),
          trpcClient.getDevelopmentProfessionals.query({ authToken, propertyId: pid }),
        ]);
        setReadiness(r as any);
        setProfessionals((team as any).professionals);
        setTeamSummary((team as any).summary);
      } catch (e: any) {
        setReadiness(null);
        toast.error(e.message ?? "Failed to load readiness");
      } finally {
        setLoading(false);
      }
    },
    [authToken, trpcClient]
  );

  useEffect(() => {
    if (propertyId !== null) load(propertyId);
  }, [propertyId, load]);

  const addProfessional = async () => {
    if (propertyId === null) return;
    try {
      await trpcClient.createDevelopmentProfessional.mutate({
        authToken: authToken!,
        propertyId,
        role: newRole as any,
        firmName: newFirm || undefined,
      });
      toast.success("Professional added");
      setNewFirm("");
      load(propertyId);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to add");
    }
  };

  const updateStatus = async (pro: Professional, status: string) => {
    if (propertyId === null) return;
    try {
      await trpcClient.updateDevelopmentProfessional.mutate({
        authToken: authToken!,
        professionalId: pro.id,
        status: status as any,
      });
      load(propertyId);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update");
    }
  };

  if (!user || !authToken) return null;

  const Gate = ({ pass, label }: { pass: boolean; label: string }) => (
    <div className="flex items-center gap-2 rounded-lg border border-navy-800 bg-navy-950/40 px-3 py-2">
      {pass ? (
        <CheckCircle2 className="h-5 w-5 text-green-400" />
      ) : (
        <XCircle className="h-5 w-5 text-red-400" />
      )}
      <span className="text-sm text-gray-200">{label}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-navy-950 text-gray-900">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <HardHat className="h-7 w-7 text-gold-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Project Readiness</h1>
            <p className="text-sm text-gray-400">
              Economics, professional team, statutory approvals and funding adequacy — all four gates
              must pass before construction.
            </p>
          </div>
        </div>

        {!isManager && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-300">
            Restricted to development managers and administrators.
          </div>
        )}

        {isManager && (
          <>
            <div className="mb-6 flex items-center gap-3">
              <label className="text-sm font-medium text-gray-300">Project</label>
              <select
                value={propertyId ?? ""}
                onChange={(e) => setPropertyId(Number(e.target.value))}
                className="rounded-lg border border-navy-700 bg-navy-900 px-3 py-2 text-sm text-white"
              >
                {properties.length === 0 && <option value="">No development projects</option>}
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
              {loading && <span className="text-sm text-gray-400">Loading…</span>}
            </div>

            {readiness && (
              <>
                <section className="mb-8 rounded-xl border border-navy-800 bg-navy-900/60 p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <Gauge className="h-5 w-5 text-gold-400" />
                    <h2 className="text-lg font-semibold text-white">
                      Readiness Score: {readiness.readiness.readinessScore}/100
                    </h2>
                    <span
                      className={`ml-auto rounded-full px-3 py-1 text-xs font-medium ${
                        readiness.readiness.constructionReady
                          ? "bg-green-500/20 text-green-300"
                          : "bg-amber-500/20 text-amber-300"
                      }`}
                    >
                      {readiness.readiness.constructionReady
                        ? "CONSTRUCTION READY"
                        : `Stage: ${readiness.developmentStage}`}
                    </span>
                  </div>
                  <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <Gate pass={readiness.readiness.economicsPass} label="Economics" />
                    <Gate pass={readiness.readiness.professionalsPass} label="Professional team" />
                    <Gate pass={readiness.readiness.approvalsPass} label="Statutory approvals" />
                    <Gate pass={readiness.readiness.fundingPass} label="Funding adequacy" />
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-5">
                    <div>
                      <p className="text-gray-500">GDV</p>
                      <p className="font-semibold text-white">{ZAR(readiness.grossDevelopmentValue)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Profit</p>
                      <p className="font-semibold text-white">{ZAR(readiness.profit)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Profit on cost</p>
                      <p className="font-semibold text-white">{readiness.profitOnCost.toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Committed funding</p>
                      <p className="font-semibold text-white">{ZAR(readiness.committedFunding)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Peak funding</p>
                      <p className="font-semibold text-white">{ZAR(readiness.peakFunding)}</p>
                    </div>
                  </div>
                  {readiness.readiness.reasons.length > 0 && (
                    <ul className="mt-4 space-y-1 rounded-lg bg-amber-500/5 p-3 text-xs text-amber-200">
                      {readiness.readiness.reasons.map((r, i) => (
                        <li key={i}>• {r}</li>
                      ))}
                    </ul>
                  )}
                </section>

                <section className="rounded-xl border border-navy-800 bg-navy-900/60 p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-white">Professional Team</h2>
                    {teamSummary && (
                      <span className="ml-auto text-sm text-gray-400">
                        {teamSummary.appointed}/{teamSummary.required} appointed · fees{" "}
                        {ZAR(teamSummary.totalFees)}
                      </span>
                    )}
                  </div>

                  <div className="mb-4 flex flex-wrap items-end gap-2">
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value)}
                      className="rounded-lg border border-navy-700 bg-navy-900 px-3 py-2 text-sm text-white"
                    >
                      {PROFESSIONAL_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                    <input
                      value={newFirm}
                      onChange={(e) => setNewFirm(e.target.value)}
                      placeholder="Firm name (optional)"
                      className="rounded-lg border border-navy-700 bg-navy-900 px-3 py-2 text-sm text-white"
                    />
                    <button
                      onClick={addProfessional}
                      className="inline-flex items-center gap-1 rounded-lg bg-gold-500 px-3 py-2 text-sm font-medium text-navy-950 hover:bg-gold-400"
                    >
                      <Plus className="h-4 w-4" /> Add
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-navy-700 text-left text-gray-400">
                          <th className="py-2 pr-4">Role</th>
                          <th className="py-2 pr-4">Firm</th>
                          <th className="py-2 pr-4">Required</th>
                          <th className="py-2 pr-4 text-right">Fee</th>
                          <th className="py-2 pr-4">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {professionals.length ? (
                          professionals.map((p) => (
                            <tr key={p.id} className="border-b border-navy-800/60 text-gray-200">
                              <td className="py-2 pr-4">{p.role.replace(/_/g, " ")}</td>
                              <td className="py-2 pr-4">{p.firmName ?? "—"}</td>
                              <td className="py-2 pr-4">{p.isRequired ? "Yes" : "No"}</td>
                              <td className="py-2 pr-4 text-right">{ZAR(p.feeAmount)}</td>
                              <td className="py-2 pr-4">
                                <select
                                  value={p.status}
                                  onChange={(e) => updateStatus(p, e.target.value)}
                                  className="rounded border border-navy-700 bg-navy-950 px-2 py-1 text-xs text-white"
                                >
                                  {APPOINTMENT_STATUSES.map((s) => (
                                    <option key={s} value={s}>
                                      {s.replace(/_/g, " ")}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="py-4 text-center text-gray-500">
                              No professionals appointed yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}

            {!readiness && !loading && propertyId !== null && (
              <div className="rounded-lg border border-navy-800 bg-navy-900/60 p-6 text-center text-gray-400">
                This project has no development appraisal yet.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
