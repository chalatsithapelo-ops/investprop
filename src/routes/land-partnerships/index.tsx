import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import {
  Landmark,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  Loader2,
  MapPin,
  FileSignature,
  Building2,
  PenLine,
  Printer,
  Handshake,
  Ban,
  Mail,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/land-partnerships/")({
  component: LandPartnershipsQueuePage,
});

const MANAGER_ROLES = ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"];

const STATUS_CONFIG: Record<
  string,
  { label: string; color: string; icon: React.ElementType }
> = {
  SUBMITTED: { label: "Submitted", color: "bg-amber-100 text-amber-700", icon: Clock },
  UNDER_REVIEW: { label: "Under Review", color: "bg-blue-100 text-blue-700", icon: Eye },
  APPROVED: { label: "Approved", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  AGREEMENT_READY: {
    label: "Ready to Sign",
    color: "bg-gold-100 text-gold-700",
    icon: FileSignature,
  },
  SIGNED: { label: "Owner Signed", color: "bg-indigo-100 text-indigo-700", icon: PenLine },
  COUNTERSIGNED: {
    label: "Executed",
    color: "bg-emerald-100 text-emerald-700",
    icon: CheckCircle2,
  },
  SPV_FORMED: { label: "SPV Formed", color: "bg-teal-100 text-teal-700", icon: Building2 },
  ACTIVE: { label: "Active", color: "bg-emerald-100 text-emerald-700", icon: Handshake },
  REJECTED: { label: "Declined", color: "bg-red-100 text-red-700", icon: XCircle },
  WITHDRAWN: { label: "Withdrawn", color: "bg-gray-100 text-gray-600", icon: Ban },
};

const FILTERS = [
  { key: undefined, label: "All" },
  { key: "SUBMITTED", label: "New" },
  { key: "UNDER_REVIEW", label: "Reviewing" },
  { key: "AGREEMENT_READY", label: "Awaiting Owner" },
  { key: "SIGNED", label: "To Countersign" },
  { key: "COUNTERSIGNED", label: "To Form SPV" },
  { key: "SPV_FORMED", label: "To Activate" },
  { key: "ACTIVE", label: "Live" },
] as const;

const ZAR = (n?: number | null) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-ZA", {
        style: "currency",
        currency: "ZAR",
        maximumFractionDigits: 0,
      }).format(n);

function LandPartnershipsQueuePage() {
  const navigate = useNavigate();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [viewing, setViewing] = useState<any | null>(null);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
    if (user && !MANAGER_ROLES.includes(user.role)) navigate({ to: "/dashboard" });
  }, [user, authToken, hasHydrated]);

  const listQuery = useQuery({
    ...trpc.getAllLandPartnerships.queryOptions({
      authToken: authToken ?? "",
      ...(filter ? { status: filter as any } : {}),
    }),
    enabled: !!authToken && !!user && MANAGER_ROLES.includes(user.role),
  });
  const items = (listQuery.data as any[]) ?? [];

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.getAllLandPartnerships.queryKey() });

  const reviewMutation = useMutation({
    mutationFn: (p: any) => trpcClient.reviewLandPartnership.mutate(p),
    onSuccess: () => {
      toast.success("Updated");
      invalidate();
    },
    onError: (err: any) => toast.error(err?.message ?? "Action failed"),
  });

  const countersignMutation = useMutation({
    mutationFn: (p: any) => trpcClient.countersignLandPartnership.mutate(p),
    onSuccess: () => {
      toast.success("Agreement countersigned");
      invalidate();
    },
    onError: (err: any) => toast.error(err?.message ?? "Action failed"),
  });

  const formSpvMutation = useMutation({
    mutationFn: (p: any) => trpcClient.formSpvForLandPartnership.mutate(p),
    onSuccess: () => {
      toast.success("SPV formed");
      invalidate();
    },
    onError: (err: any) => toast.error(err?.message ?? "Action failed"),
  });

  const activateMutation = useMutation({
    mutationFn: (id: number) =>
      trpcClient.activateLandPartnership.mutate({ authToken: authToken ?? "", id }),
    onSuccess: () => {
      toast.success("Partnership activated");
      invalidate();
    },
    onError: (err: any) => toast.error(err?.message ?? "Action failed"),
  });

  if (!user || !authToken) return null;

  const review = (id: number, action: "UNDER_REVIEW" | "APPROVE" | "REJECT") => {
    let reviewNotes: string | undefined;
    let rejectedReason: string | undefined;
    if (action === "APPROVE") {
      reviewNotes = prompt("Optional note to the owner on approval:") ?? undefined;
    }
    if (action === "REJECT") {
      rejectedReason = prompt("Reason for declining (shown to owner):") ?? undefined;
      if (!rejectedReason) return;
    }
    reviewMutation.mutate({
      authToken: authToken ?? "",
      id,
      action,
      reviewNotes,
      rejectedReason,
    });
  };

  const countersign = (id: number) => {
    const signatoryName = prompt("Countersign as (your full name):", user.name ?? "");
    if (!signatoryName || signatoryName.trim().length < 3) return;
    countersignMutation.mutate({ authToken: authToken ?? "", id, signatoryName: signatoryName.trim() });
  };

  const formSpv = (lp: any) => {
    const spvName = prompt(
      "Name for the ring-fenced SPV:",
      `${lp.city} Development SPV (${lp.referenceCode})`,
    );
    if (!spvName || spvName.trim().length < 3) return;
    const registrationNumber = prompt("SPV registration number (optional):") ?? undefined;
    formSpvMutation.mutate({
      authToken: authToken ?? "",
      id: lp.id,
      spvName: spvName.trim(),
      registrationNumber: registrationNumber || undefined,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-3xl font-bold text-gray-900">
            <Landmark className="text-gold-500" /> Property Partnerships
          </h1>
          <p className="mt-1 text-gray-500">
            Property &amp; land-into-SPV development, renovation and flip partnerships submitted by
            owners.
          </p>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          {FILTERS.map((ft) => (
            <button
              key={ft.label}
              onClick={() => setFilter(ft.key)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium ${
                filter === ft.key
                  ? "bg-gold-500 text-white"
                  : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {ft.label}
            </button>
          ))}
        </div>

        {listQuery.isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-gold-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center text-gray-500">
            No submissions in this view.
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((lp) => {
              const cfg = STATUS_CONFIG[lp.status] ?? STATUS_CONFIG.SUBMITTED;
              const Icon = cfg.icon;
              const busy =
                reviewMutation.isPending ||
                countersignMutation.isPending ||
                formSpvMutation.isPending ||
                activateMutation.isPending;
              return (
                <div key={lp.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-gray-900">{lp.landTitle}</h3>
                        <span className="font-mono text-xs text-gray-400">{lp.referenceCode}</span>
                      </div>
                      <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">
                        <MapPin size={14} /> {lp.address}, {lp.city}, {lp.province}
                      </p>
                      <p className="mt-1 text-sm text-gray-600">
                        <strong>{lp.ownerFullName}</strong>
                        {lp.owner?.email && (
                          <span className="ml-2 inline-flex items-center gap-1 text-gray-400">
                            <Mail size={12} /> {lp.owner.email}
                          </span>
                        )}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-600">
                        <span>
                          Est. land value: <strong>{ZAR(lp.estimatedLandValue)}</strong>
                        </span>
                        <span>
                          Est. GDV: <strong>{ZAR(lp.estimatedGDV)}</strong>
                        </span>
                        <span>
                          Owner equity: <strong>{lp.ownerEquityPct}%</strong>
                        </span>
                        {lp.erfSize && (
                          <span>
                            Erf: <strong>{lp.erfSize} m²</strong>
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${cfg.color}`}
                    >
                      <Icon size={13} /> {cfg.label}
                    </span>
                  </div>

                  <p className="mt-3 text-sm text-gray-600">{lp.landDescription}</p>

                  {(lp.bondStatus === "EXISTING" || lp.ratesStatus === "ARREARS") && (
                    <div className="mt-2 flex flex-wrap gap-3 text-xs">
                      {lp.bondStatus === "EXISTING" && (
                        <span className="rounded bg-amber-50 px-2 py-1 text-amber-700">
                          Bond: {ZAR(lp.bondOutstanding)} {lp.bondBank ? `(${lp.bondBank})` : ""}
                        </span>
                      )}
                      {lp.ratesStatus === "ARREARS" && (
                        <span className="rounded bg-red-50 px-2 py-1 text-red-700">
                          Rates arrears: {ZAR(lp.ratesArrears)}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {lp.status === "SUBMITTED" && (
                      <button
                        disabled={busy}
                        onClick={() => review(lp.id, "UNDER_REVIEW")}
                        className="rounded-lg bg-blue-500 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-600 disabled:opacity-60"
                      >
                        Start Review
                      </button>
                    )}
                    {(lp.status === "SUBMITTED" || lp.status === "UNDER_REVIEW") && (
                      <>
                        <button
                          disabled={busy}
                          onClick={() => review(lp.id, "APPROVE")}
                          className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
                        >
                          Approve &amp; Generate Agreement
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => review(lp.id, "REJECT")}
                          className="rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
                        >
                          Decline
                        </button>
                      </>
                    )}
                    {lp.status === "SIGNED" && (
                      <button
                        disabled={busy}
                        onClick={() => countersign(lp.id)}
                        className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-600 disabled:opacity-60"
                      >
                        Countersign
                      </button>
                    )}
                    {(lp.status === "COUNTERSIGNED" || lp.status === "SIGNED") && !lp.spvId && (
                      <button
                        disabled={busy}
                        onClick={() => formSpv(lp)}
                        className="rounded-lg bg-teal-500 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-60"
                      >
                        Form SPV
                      </button>
                    )}
                    {lp.status === "SPV_FORMED" && (
                      <button
                        disabled={busy}
                        onClick={() => activateMutation.mutate(lp.id)}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        Activate Partnership
                      </button>
                    )}
                    {lp.agreementContent && (
                      <>
                        <button
                          onClick={() => setViewing(lp)}
                          className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          <Eye size={15} /> View Agreement
                        </button>
                        <Link
                          to="/land-partnership/$id/agreement"
                          params={{ id: String(lp.id) }}
                          className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                        >
                          <Printer size={15} /> Print
                        </Link>
                      </>
                    )}
                  </div>

                  {lp.spv?.name && (
                    <p className="mt-3 text-xs text-gray-500">
                      SPV: <strong>{lp.spv.name}</strong>
                      {lp.spv.registrationNumber ? ` · ${lp.spv.registrationNumber}` : ""} ·{" "}
                      {lp.spv.status}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Agreement — {viewing.referenceCode}
              </h2>
              <button
                onClick={() => setViewing(null)}
                className="text-gray-400 hover:text-gray-700"
              >
                <XCircle size={22} />
              </button>
            </div>
            <div className="flex-1 overflow-auto px-5 py-4">
              <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-gray-800">
                {viewing.agreementContent}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
