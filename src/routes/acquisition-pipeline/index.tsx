import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Gavel, Building, ArrowRight, ArrowLeft, Clock, CheckCircle, ShieldAlert, LayoutGrid, Columns3 } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

const MANAGER_ROLES = ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "PROPERTY_OWNER", "OWNER"];

export const Route = createFileRoute("/acquisition-pipeline/")({
  component: AcquisitionPipelinePage,
});

const PIPELINE_STAGES = ["IDENTIFIED", "DUE_DILIGENCE", "AUCTION", "WON", "TRANSFER", "COMPLETE"] as const;

const TRANSFER_STAGES = [
  "AUCTION_WON", "DEPOSIT_PAID", "SPV_ASSIGNED",
  "CESSION_EXECUTED", "CONVEYANCING_IN_PROGRESS",
  "REGISTERED_AT_DEEDS", "TRANSFER_COMPLETE",
] as const;

function AcquisitionPipelinePage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "kanban">("kanban");
  const [createForm, setCreateForm] = useState({
    propertyId: 0,
    spvId: 0,
    auctionDate: "",
    reservePrice: 0,
  });

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
          <p className="mt-2 text-gray-500">Only managers and property owners can access the acquisition pipeline.</p>
          <button onClick={() => navigate({ to: "/dashboard" })} className="mt-6 rounded-lg bg-gold-500 px-6 py-2 text-sm font-medium text-white hover:bg-gold-600">Back to Dashboard</button>
        </div>
      </div>
    );
  }

  const acquisitionsQuery = useQuery({
    ...trpc.getAcquisitions.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
  });

  const spvsQuery = useQuery({
    ...trpc.getSPVs.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
  });

  const propertiesQuery = useQuery({
    ...trpc.getProperties.queryOptions({}),
    enabled: !!authToken,
  });

  const acquisitions = (acquisitionsQuery.data as any)?.acquisitions ?? acquisitionsQuery.data ?? [];
  const acquisitionsArr = Array.isArray(acquisitions) ? acquisitions : [];

  const spvs = (spvsQuery.data as any)?.spvs ?? spvsQuery.data ?? [];
  const spvsArr = Array.isArray(spvs) ? spvs : [];

  const properties = (propertiesQuery.data as any)?.properties ?? propertiesQuery.data ?? [];
  const propertiesArr = Array.isArray(properties) ? properties : [];

  const handleCreate = async () => {
    try {
      await trpcClient.createAcquisition.mutate({
        authToken: authToken ?? "",
        propertyId: createForm.propertyId,
        spvId: createForm.spvId,
        auctionDate: createForm.auctionDate,
        reservePrice: createForm.reservePrice,
      } as any);
      toast.success("Acquisition created");
      queryClient.invalidateQueries({ queryKey: trpc.getAcquisitions.queryKey() });
      setShowCreateForm(false);
      setCreateForm({ propertyId: 0, spvId: 0, auctionDate: "", reservePrice: 0 });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create acquisition");
    }
  };

  const handleAdvanceStage = async (acquisitionId: number, currentTransferStatus: string) => {
    const currentIdx = TRANSFER_STAGES.indexOf(currentTransferStatus as any);
    if (currentIdx < 0 || currentIdx >= TRANSFER_STAGES.length - 1) {
      toast.error("Already at final stage");
      return;
    }
    const nextStatus = TRANSFER_STAGES[currentIdx + 1];
    try {
      await trpcClient.updateAcquisitionStatus.mutate({
        authToken: authToken ?? "",
        acquisitionId,
        transferStatus: nextStatus!,
      });
      toast.success(`Advanced to ${nextStatus!.replace(/_/g, " ")}`);
      queryClient.invalidateQueries({ queryKey: trpc.getAcquisitions.queryKey() });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to advance stage");
    }
  };

  // Kanban move ← (back one column) and → (forward one column)
  const handleMoveStage = async (acquisitionId: number, currentTransferStatus: string, direction: 1 | -1) => {
    const currentIdx = TRANSFER_STAGES.indexOf(currentTransferStatus as any);
    const nextIdx = currentIdx + direction;
    if (currentIdx < 0 || nextIdx < 0 || nextIdx >= TRANSFER_STAGES.length) return;
    const nextStatus = TRANSFER_STAGES[nextIdx];
    try {
      await trpcClient.updateAcquisitionStatus.mutate({
        authToken: authToken ?? "",
        acquisitionId,
        transferStatus: nextStatus!,
      });
      toast.success(`Moved to ${nextStatus!.replace(/_/g, " ")}`);
      queryClient.invalidateQueries({ queryKey: trpc.getAcquisitions.queryKey() });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to move");
    }
  };

  // Plain-language column labels for kanban
  const STAGE_META: Record<string, { label: string; tone: string }> = {
    AUCTION_WON: { label: "1. Auction Won", tone: "border-amber-300 bg-amber-50" },
    DEPOSIT_PAID: { label: "2. Deposit Paid", tone: "border-amber-300 bg-amber-50" },
    SPV_ASSIGNED: { label: "3. SPV Assigned", tone: "border-purple-300 bg-purple-50" },
    CESSION_EXECUTED: { label: "4. Cession Executed", tone: "border-purple-300 bg-purple-50" },
    CONVEYANCING_IN_PROGRESS: { label: "5. Conveyancing", tone: "border-blue-300 bg-blue-50" },
    REGISTERED_AT_DEEDS: { label: "6. Registered at Deeds", tone: "border-blue-300 bg-blue-50" },
    TRANSFER_COMPLETE: { label: "7. Transfer Complete", tone: "border-emerald-300 bg-emerald-50" },
  };

  const stageColor = (stage: string) => {
    const map: Record<string, string> = {
      IDENTIFIED: "bg-blue-500/20 text-blue-600 border-blue-500/30",
      DUE_DILIGENCE: "bg-purple-500/20 text-purple-600 border-purple-500/30",
      AUCTION: "bg-amber-500/20 text-amber-600 border-amber-500/30",
      WON: "bg-emerald-500/20 text-emerald-600 border-emerald-500/30",
      TRANSFER: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
      COMPLETE: "bg-gold-500/20 text-gold-600 border-gold-300",
    };
    return map[stage] ?? "bg-gray-500/20 text-gray-500 border-gray-500/30";
  };

  if (!user || !authToken) return null;

  if (acquisitionsQuery.isLoading) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold-500 border-r-transparent"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Gavel className="text-gold-600" size={32} />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Acquisition Pipeline</h1>
              <p className="mt-1 text-gray-500">Track properties from auction to transfer</p>
            </div>
          </div>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="inline-flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-navy-950 hover:bg-gold-400 transition"
          >
            <Gavel size={16} /> New Acquisition
          </button>
        </div>

        {/* View mode toggle */}
        <div className="mb-4 flex items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-gray-500">View:</span>
          <button
            type="button"
            onClick={() => setViewMode("kanban")}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              viewMode === "kanban"
                ? "border-gold-500 bg-gold-50 text-gold-700"
                : "border-navy-700 bg-navy-900/30 text-gray-400 hover:text-gray-200"
            }`}
          >
            <Columns3 size={14} /> Kanban
          </button>
          <button
            type="button"
            onClick={() => setViewMode("cards")}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              viewMode === "cards"
                ? "border-gold-500 bg-gold-50 text-gold-700"
                : "border-navy-700 bg-navy-900/30 text-gray-400 hover:text-gray-200"
            }`}
          >
            <LayoutGrid size={14} /> Cards
          </button>
        </div>

        {/* Pipeline Stages */}
        <div className="mb-8 flex flex-wrap items-center gap-2 rounded-xl border border-navy-800/50 bg-navy-900/50 p-4">
          {PIPELINE_STAGES.map((stage, i) => (
            <div key={stage} className="flex items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${stageColor(stage)}`}>
                {stage.replace("_", " ")}
              </span>
              <span className="text-xs font-bold text-gray-600">
                {acquisitionsArr.filter((a: any) => (a.status ?? a.stage) === stage).length}
              </span>
              {i < PIPELINE_STAGES.length - 1 && <ArrowRight size={14} className="text-gray-600" />}
            </div>
          ))}
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <div className="mb-6 rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">New Acquisition</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className="mb-1 block text-sm text-gray-500">Property</label>
                <select value={createForm.propertyId} onChange={(e) => setCreateForm({ ...createForm, propertyId: Number(e.target.value) })} className="w-full rounded-lg border border-navy-700 bg-navy-800 px-4 py-2 text-gray-900 focus:border-gold-500 focus:outline-none">
                  <option value={0}>Select Property</option>
                  {propertiesArr.map((p: any) => <option key={p.id} value={p.id}>{p.title ?? p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-500">SPV</label>
                <select value={createForm.spvId} onChange={(e) => setCreateForm({ ...createForm, spvId: Number(e.target.value) })} className="w-full rounded-lg border border-navy-700 bg-navy-800 px-4 py-2 text-gray-900 focus:border-gold-500 focus:outline-none">
                  <option value={0}>Select SPV</option>
                  {spvsArr.map((s: any) => <option key={s.id} value={s.id}>{s.name ?? s.title}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-500">Auction Date</label>
                <input type="date" value={createForm.auctionDate} onChange={(e) => setCreateForm({ ...createForm, auctionDate: e.target.value })} className="w-full rounded-lg border border-navy-700 bg-navy-800 px-4 py-2 text-gray-900 focus:border-gold-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-500">Reserve Price (R)</label>
                <input type="number" value={createForm.reservePrice || ""} onChange={(e) => setCreateForm({ ...createForm, reservePrice: Number(e.target.value) })} className="w-full rounded-lg border border-navy-700 bg-navy-800 px-4 py-2 text-gray-900 focus:border-gold-500 focus:outline-none" placeholder="e.g. 2500000" />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button onClick={() => setShowCreateForm(false)} className="rounded-lg border border-navy-700 px-4 py-2 text-gray-500 hover:text-gray-900 transition">Cancel</button>
              <button onClick={handleCreate} className="rounded-lg bg-gold-500 px-6 py-2 font-semibold text-navy-950 hover:bg-gold-400 transition">Create</button>
            </div>
          </div>
        )}

        {/* Kanban view — columns by TransferStatus */}
        {viewMode === "kanban" && (
          <div className="mb-8 overflow-x-auto pb-2">
            <div className="flex min-w-max gap-3">
              {TRANSFER_STAGES.map((stage) => {
                const meta = STAGE_META[stage]!;
                const inThisColumn = acquisitionsArr.filter(
                  (a: any) => (a.transferStatus ?? "AUCTION_WON") === stage,
                );
                return (
                  <div key={stage} className={`flex w-72 flex-col rounded-xl border ${meta.tone}`}>
                    <div className="border-b border-gray-300/60 px-3 py-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-700">{meta.label}</p>
                      <p className="text-xs text-gray-500">{inThisColumn.length} acquisition{inThisColumn.length === 1 ? "" : "s"}</p>
                    </div>
                    <div className="flex-1 space-y-2 p-2">
                      {inThisColumn.length === 0 ? (
                        <p className="px-2 py-6 text-center text-xs italic text-gray-400">Nothing here</p>
                      ) : (
                        inThisColumn.map((acq: any) => {
                          const idx = TRANSFER_STAGES.indexOf(stage);
                          return (
                            <div
                              key={acq.id}
                              className="rounded-lg border border-white/60 bg-white p-3 shadow-sm"
                            >
                              <p className="text-sm font-semibold text-gray-900">
                                {acq.property?.title ?? acq.propertyTitle ?? `Acquisition #${acq.id}`}
                              </p>
                              {(acq.property?.city || acq.spv?.name) && (
                                <p className="mt-0.5 text-xs text-gray-500">
                                  {acq.property?.city}
                                  {acq.spv?.name && ` · ${acq.spv.name}`}
                                </p>
                              )}
                              {acq.purchasePrice ? (
                                <p className="mt-1 text-xs text-gold-700">R{Number(acq.purchasePrice).toLocaleString()}</p>
                              ) : acq.depositAmount ? (
                                <p className="mt-1 text-xs text-gray-500">Deposit R{Number(acq.depositAmount).toLocaleString()}</p>
                              ) : null}
                              {acq.expectedTransferDate && (
                                <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                                  <Clock size={11} /> Target {new Date(acq.expectedTransferDate).toLocaleDateString("en-ZA")}
                                </p>
                              )}
                              <div className="mt-2 flex items-center justify-between gap-1">
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => handleMoveStage(acq.id, stage, -1)}
                                  className="inline-flex items-center gap-0.5 rounded border border-gray-300 px-2 py-0.5 text-[10px] text-gray-700 hover:bg-gray-100 disabled:opacity-30"
                                  title="Move back one stage"
                                >
                                  <ArrowLeft size={10} /> back
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === TRANSFER_STAGES.length - 1}
                                  onClick={() => handleMoveStage(acq.id, stage, 1)}
                                  className="inline-flex items-center gap-0.5 rounded bg-gold-500 px-2 py-0.5 text-[10px] font-semibold text-navy-950 hover:bg-gold-400 disabled:opacity-30"
                                  title="Advance to next stage"
                                >
                                  next <ArrowRight size={10} />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Acquisition Cards */}
        {viewMode === "cards" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {acquisitionsArr.length > 0 ? acquisitionsArr.map((acq: any, i: number) => {
            const stage = acq.status ?? acq.stage ?? "IDENTIFIED";
            const stageIdx = PIPELINE_STAGES.indexOf(stage as any);
            const progress = stageIdx >= 0 ? ((stageIdx + 1) / PIPELINE_STAGES.length) * 100 : 0;
            return (
              <div key={acq.id ?? i} className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 truncate">{acq.propertyTitle ?? acq.property?.title ?? acq.title ?? `Acquisition #${acq.id}`}</h3>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${stageColor(stage)}`}>
                    {stage.replace("_", " ")}
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  {acq.spvName ?? acq.spv?.name ? (
                    <div className="flex justify-between"><span className="text-gray-500">SPV</span><span className="text-gray-900">{acq.spvName ?? acq.spv?.name}</span></div>
                  ) : null}
                  {acq.auctionDate && (
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Auction Date</span>
                      <span className="flex items-center gap-1 text-gray-900"><Clock size={12} /> {new Date(acq.auctionDate).toLocaleDateString("en-ZA")}</span>
                    </div>
                  )}
                  {acq.reservePrice && (
                    <div className="flex justify-between"><span className="text-gray-500">Reserve Price</span><span className="text-gold-600 font-medium">R{Number(acq.reservePrice).toLocaleString()}</span></div>
                  )}
                  {acq.purchasePrice && (
                    <div className="flex justify-between"><span className="text-gray-500">Purchase Price</span><span className="text-emerald-600 font-medium">R{Number(acq.purchasePrice).toLocaleString()}</span></div>
                  )}
                </div>
                <div className="mt-3">
                  <div className="h-1.5 rounded-full bg-navy-800">
                    <div className="h-1.5 rounded-full bg-gold-500 transition-all" style={{ width: `${progress}%` }}></div>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-gray-500">
                    <span>Stage {stageIdx + 1}/{PIPELINE_STAGES.length}</span>
                    {stage === "COMPLETE" && <span className="flex items-center gap-1 text-emerald-600"><CheckCircle size={10} /> Complete</span>}
                  </div>
                </div>
                {/* Transfer Status & Advance */}
                {acq.transferStatus && (
                  <div className="mt-3 flex items-center justify-between border-t border-navy-800/30 pt-3">
                    <span className="text-xs text-gray-500">Transfer: <span className="font-medium text-gray-700">{(acq.transferStatus as string).replace(/_/g, " ")}</span></span>
                    {acq.transferStatus !== "TRANSFER_COMPLETE" && (
                      <button
                        onClick={() => handleAdvanceStage(acq.id, acq.transferStatus)}
                        className="flex items-center gap-1 rounded-lg bg-gold-500/20 px-2.5 py-1 text-xs font-medium text-gold-600 hover:bg-gold-500/30 transition"
                      >
                        Advance <ArrowRight size={12} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          }) : (
            <div className="col-span-full rounded-xl border border-navy-800/50 bg-navy-900/50 py-12 text-center">
              <Gavel className="mx-auto mb-3 text-gray-600" size={40} />
              <p className="text-gray-500">No acquisitions in the pipeline</p>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
