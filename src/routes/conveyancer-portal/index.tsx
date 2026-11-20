import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Scale,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Building2,
  Save,
  Loader2,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

export const Route = createFileRoute("/conveyancer-portal/")({
  component: ConveyancerPortalPage,
});

const ALLOWED = ["CONVEYANCER", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "ADMIN"];
const R = (n: number) => `R${Math.round(n ?? 0).toLocaleString("en-ZA")}`;

const STEP_LABEL: Record<string, string> = {
  AUCTION_WON: "Auction won",
  DEPOSIT_PAID: "Deposit paid",
  SPV_ASSIGNED: "SPV assigned",
  CESSION_EXECUTED: "Cession executed",
  CONVEYANCING_IN_PROGRESS: "Conveyancing in progress",
  REGISTERED_AT_DEEDS: "Registered at Deeds",
  TRANSFER_COMPLETE: "Transfer complete",
};

function ConveyancerPortalPage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const [editId, setEditId] = useState<number | null>(null);
  const [draft, setDraft] = useState<any>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) void navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const isAllowed = ALLOWED.includes(user?.role ?? "");

  const q = useQuery({
    ...trpc.getConveyancingQueue.queryOptions({ authToken: authToken ?? "" }),
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
          <p className="mt-2 text-gray-500">This portal is for conveyancers and managers.</p>
        </div>
      </div>
    );
  }

  const rows = q.data?.rows ?? [];
  const summary = q.data?.summary;
  const steps = q.data?.steps ?? [];

  const startEdit = (row: any) => {
    setEditId(row.id);
    setDraft({
      transferStatus: row.transferStatus,
      deedsOfficeRef: row.deedsOfficeRef ?? "",
      conveyancingFees: row.conveyancingFees ?? 0,
      cessionExecuted: row.cessionExecuted,
      expectedTransferDate: row.expectedTransferDate ? String(row.expectedTransferDate).slice(0, 10) : "",
      notes: row.notes ?? "",
    });
  };

  const save = async (id: number) => {
    setBusy(true);
    try {
      await trpcClient.updateConveyancingMatter.mutate({
        authToken: authToken!,
        acquisitionId: id,
        transferStatus: draft.transferStatus,
        deedsOfficeRef: draft.deedsOfficeRef || undefined,
        conveyancingFees: Number(draft.conveyancingFees) || 0,
        cessionExecuted: draft.cessionExecuted,
        expectedTransferDate: draft.expectedTransferDate || undefined,
        notes: draft.notes || undefined,
      });
      toast.success("Matter updated.");
      setEditId(null);
      void queryClient.invalidateQueries({ queryKey: trpc.getConveyancingQueue.queryKey() });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not update.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Navbar />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-blue-100 p-2.5 text-blue-700">
            <Scale size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Conveyancer Portal</h1>
            <p className="text-sm text-gray-500">
              Transfer &amp; registration matters — advance each property through the Deeds Office pipeline.
            </p>
          </div>
        </div>

        {summary && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total matters" value={summary.total} />
            <Stat label="In progress" value={summary.inProgress} />
            <Stat label="Awaiting cession" value={summary.awaitingCession} />
            <Stat label="Completed" value={summary.completed} />
          </div>
        )}

        {q.isLoading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-r-transparent" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
            <Building2 className="mx-auto mb-3 text-gray-300" size={40} />
            <p className="text-lg font-medium">No transfer matters yet</p>
            <p className="mt-1 text-sm text-gray-500">Acquisitions appear here once recorded by the deal team.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row: any) => (
              <div key={row.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{row.propertyTitle}</p>
                    <p className="text-sm text-gray-500">
                      {row.location || "—"}{row.spvName ? ` · ${row.spvName}` : ""}
                      {row.spvRegistration ? ` (${row.spvRegistration})` : ""}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                      <span>Price {R(row.purchasePrice)}</span>
                      <span>Transfer duty {R(row.transferDuty)}</span>
                      <span>Conveyancing {R(row.conveyancingFees)}</span>
                      {row.deedsOfficeRef && <span>Deeds ref {row.deedsOfficeRef}</span>}
                    </div>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${row.transferStatus === "TRANSFER_COMPLETE" ? "bg-emerald-100 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>
                    {STEP_LABEL[row.transferStatus] ?? row.transferStatus}
                  </span>
                </div>

                {/* Progress tracker */}
                <div className="mt-4 flex items-center gap-1">
                  {steps.map((s: string, i: number) => (
                    <div key={s} className="flex flex-1 items-center">
                      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${i <= row.stepIndex ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-400"}`}>
                        {i < row.stepIndex ? <CheckCircle2 size={13} /> : i + 1}
                      </div>
                      {i < steps.length - 1 && <div className={`h-0.5 flex-1 ${i < row.stepIndex ? "bg-blue-600" : "bg-gray-200"}`} />}
                    </div>
                  ))}
                </div>

                {editId === row.id ? (
                  <div className="mt-4 grid gap-3 rounded-lg border border-blue-200 bg-blue-50/50 p-4 sm:grid-cols-2">
                    <label className="text-xs font-semibold text-gray-600">
                      Transfer status
                      <select
                        value={draft.transferStatus}
                        onChange={(e) => setDraft((d: any) => ({ ...d, transferStatus: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      >
                        {steps.map((s: string) => <option key={s} value={s}>{STEP_LABEL[s] ?? s}</option>)}
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-gray-600">
                      Deeds Office ref
                      <input
                        value={draft.deedsOfficeRef}
                        onChange={(e) => setDraft((d: any) => ({ ...d, deedsOfficeRef: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="text-xs font-semibold text-gray-600">
                      Conveyancing fees (R)
                      <input
                        type="number"
                        value={draft.conveyancingFees}
                        onChange={(e) => setDraft((d: any) => ({ ...d, conveyancingFees: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="text-xs font-semibold text-gray-600">
                      Expected transfer date
                      <input
                        type="date"
                        value={draft.expectedTransferDate}
                        onChange={(e) => setDraft((d: any) => ({ ...d, expectedTransferDate: e.target.value }))}
                        className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                      <input
                        type="checkbox"
                        checked={!!draft.cessionExecuted}
                        onChange={(e) => setDraft((d: any) => ({ ...d, cessionExecuted: e.target.checked }))}
                      />
                      Cession executed
                    </label>
                    <label className="text-xs font-semibold text-gray-600 sm:col-span-2">
                      Notes
                      <textarea
                        value={draft.notes}
                        onChange={(e) => setDraft((d: any) => ({ ...d, notes: e.target.value }))}
                        rows={2}
                        className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      />
                    </label>
                    <div className="flex gap-2 sm:col-span-2">
                      <button
                        onClick={() => save(row.id)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-60"
                      >
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
                      </button>
                      <button onClick={() => setEditId(null)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      {row.cessionExecuted ? <CheckCircle2 size={13} className="text-emerald-600" /> : <Clock size={13} className="text-amber-500" />}
                      {row.cessionExecuted ? "Cession executed" : "Cession pending"}
                    </span>
                    <button onClick={() => startEdit(row)} className="rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-600">
                      Update matter
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
