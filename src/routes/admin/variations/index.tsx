import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { FileText, CheckCircle, XCircle, Clock } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { QueryState } from "~/components/QueryState";
import { ConfirmModal } from "~/components/ConfirmModal";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/admin/variations/")({
  component: VariationsAdminPage,
});

type Filter = "PROPOSED" | "APPROVED" | "REJECTED" | "ALL";

function VariationsAdminPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const [filter, setFilter] = useState<Filter>("PROPOSED");
  const [confirmAction, setConfirmAction] = useState<{ id: number; action: "APPROVE" | "REJECT" } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
    else if (!["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "ADMIN"].includes(user.role)) {
      navigate({ to: "/dashboard" });
    }
  }, [user, authToken, hasHydrated]);

  const listQuery = useQuery({
    ...trpc.listVariations.queryOptions({ authToken: authToken ?? "", status: filter }),
    enabled: !!authToken,
  });

  const respondMut = useMutation(
    trpc.respondToVariation.mutationOptions({
      onSuccess: () => {
        toast.success("Variation updated");
        qc.invalidateQueries({ queryKey: trpc.listVariations.queryKey() });
        setConfirmAction(null);
        setRejectReason("");
      },
      onError: (e) => toast.error(e.message),
    })
  );

  if (!user || !authToken) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <FileText className="text-purple-600" size={32} />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Variation Orders</h1>
            <p className="text-sm text-gray-600">Review and approve contractor variation requests</p>
          </div>
        </div>

        <div className="mb-4 flex gap-2" role="tablist" aria-label="Variation status filter">
          {(["PROPOSED", "APPROVED", "REJECTED", "ALL"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                filter === f
                  ? "bg-purple-600 text-white"
                  : "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <QueryState
          query={listQuery}
          loadingLabel="Loading variations…"
          emptyLabel="No variations"
          emptyHint={filter === "PROPOSED" ? "No pending variations to review." : "Try a different filter."}
          isEmpty={(d: any) => !d?.variations?.length}
        >
          {(data: any) => (
            <div className="space-y-3">
              {data.variations.map((v: any) => (
                <div key={v.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">
                          {v.number}
                        </span>
                        <StatusBadge status={v.status} />
                      </div>
                      <h3 className="mt-2 text-base font-semibold text-gray-900">
                        WO #{v.workOrder.id}: {v.workOrder.title}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {v.workOrder.property.title} — {v.workOrder.property.city}
                      </p>
                      <p className="text-xs text-gray-500">
                        Contractor: {v.workOrder.contractorProfile?.companyName ?? v.workOrder.contractorProfile?.user?.name}
                      </p>
                      <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">{v.description}</p>
                      <div className="mt-3 flex flex-wrap gap-4 text-sm">
                        <span className={`font-medium ${v.costImpact >= 0 ? "text-red-600" : "text-green-600"}`}>
                          Cost: {v.costImpact >= 0 ? "+" : ""}R {Number(v.costImpact).toLocaleString()}
                        </span>
                        <span className="text-gray-600">
                          Time: {v.timeImpactDays >= 0 ? "+" : ""}{v.timeImpactDays} days
                        </span>
                      </div>
                      {v.rejectionReason && (
                        <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">
                          Rejection reason: {v.rejectionReason}
                        </p>
                      )}
                    </div>
                    {v.status === "PROPOSED" && (
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmAction({ id: v.id, action: "APPROVE" })}
                          className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
                        >
                          <CheckCircle className="h-4 w-4" /> Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmAction({ id: v.id, action: "REJECT" })}
                          className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                        >
                          <XCircle className="h-4 w-4" /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </QueryState>
      </div>

      <ConfirmModal
        open={confirmAction?.action === "APPROVE"}
        onClose={() => setConfirmAction(null)}
        onConfirm={() =>
          confirmAction &&
          respondMut.mutate({
            authToken: authToken!,
            variationId: confirmAction.id,
            action: "APPROVE",
          })
        }
        title="Approve variation?"
        message="This will update the work order's agreed amount and expected end date."
        confirmLabel="Approve"
        tone="info"
        loading={respondMut.isPending}
      />

      {confirmAction?.action === "REJECT" && (
        <ConfirmModal
          open
          onClose={() => {
            setConfirmAction(null);
            setRejectReason("");
          }}
          onConfirm={() => {
            if (rejectReason.trim().length < 5) {
              toast.error("Provide a reason (min 5 chars)");
              return;
            }
            respondMut.mutate({
              authToken: authToken!,
              variationId: confirmAction.id,
              action: "REJECT",
              reason: rejectReason,
            });
          }}
          title="Reject variation?"
          message={
            <div>
              <p className="mb-3 text-sm">The contractor will be notified.</p>
              <label htmlFor="reject-reason" className="mb-1 block text-xs font-medium text-gray-700">
                Reason *
              </label>
              <textarea
                id="reject-reason"
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                placeholder="Why is this variation being rejected?"
              />
            </div>
          }
          confirmLabel="Reject"
          tone="danger"
          loading={respondMut.isPending}
        />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; icon: any }> = {
    PROPOSED: { bg: "bg-amber-100", text: "text-amber-700", icon: Clock },
    APPROVED: { bg: "bg-green-100", text: "text-green-700", icon: CheckCircle },
    REJECTED: { bg: "bg-red-100", text: "text-red-700", icon: XCircle },
  };
  const cfg = map[status] ?? { bg: "bg-gray-100", text: "text-gray-700", icon: Clock };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <Icon className="h-3 w-3" /> {status}
    </span>
  );
}
