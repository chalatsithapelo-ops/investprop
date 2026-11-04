import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  Search,
  CheckCircle,
  XCircle,
  Clock,
  User,
  DollarSign,
  Eye,
  X,
  FileText,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Filter,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

const MANAGER_ROLES = ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"];
const FICA_THRESHOLD = 20_000;

const DOC_TYPE_LABELS: Record<string, string> = {
  ID_DOCUMENT: "ID Document / Passport",
  PROOF_OF_ADDRESS: "Proof of Address",
  BANK_STATEMENT: "Bank Confirmation Letter",
  TAX_NUMBER: "Tax Clearance / Number",
  COMPANY_REGISTRATION: "Company Registration",
};
const docLabel = (t: string) => DOC_TYPE_LABELS[t] ?? t.replace(/_/g, " ");

export const Route = createFileRoute("/admin/fica-verification/")({
  component: FicaVerificationPage,
});

function FicaVerificationPage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<
    "ALL" | "VERIFIED" | "UNVERIFIED" | "PENDING_DOCS"
  >("ALL");
  const [selectedInvestor, setSelectedInvestor] = useState<any>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const isManager = MANAGER_ROLES.includes(user?.role);

  const ficaQuery = useQuery({
    ...trpc.getInvestorsFicaStatus.queryOptions({
      authToken: authToken ?? "",
      filter: filterStatus,
    }),
    enabled: !!authToken && isManager,
  });

  const data = ficaQuery.data as any;
  const investors = data?.investors ?? [];
  const stats = data?.stats ?? {};

  const filtered = investors.filter(
    (i: any) =>
      !search ||
      (i.name ?? i.email ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const handleVerify = async (investorId: number) => {
    setActionLoading(investorId);
    try {
      await trpcClient.verifyInvestorFica.mutate({
        authToken: authToken!,
        investorId,
        action: "VERIFY",
      });
      toast.success("FICA verified successfully");
      queryClient.invalidateQueries({
        queryKey: trpc.getInvestorsFicaStatus.queryKey(),
      });
      setSelectedInvestor(null);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to verify FICA");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (investorId: number) => {
    if (!rejectReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }
    setActionLoading(investorId);
    try {
      await trpcClient.verifyInvestorFica.mutate({
        authToken: authToken!,
        investorId,
        action: "REJECT",
        reason: rejectReason,
      });
      toast.success("FICA rejected");
      queryClient.invalidateQueries({
        queryKey: trpc.getInvestorsFicaStatus.queryKey(),
      });
      setSelectedInvestor(null);
      setRejectReason("");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to reject FICA");
    } finally {
      setActionLoading(null);
    }
  };

  if (!user || !authToken) return null;

  if (!isManager) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="flex flex-col items-center justify-center py-32">
          <Shield className="mb-4 text-red-600" size={48} />
          <h2 className="text-xl font-bold text-gray-900">Access Denied</h2>
          <p className="mt-2 text-gray-500">
            Only managers can access FICA verification.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <ShieldCheck className="text-gold-500" size={32} />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              FICA Verification
            </h1>
            <p className="text-gray-500">
              Review and verify investor FICA compliance (R
              {FICA_THRESHOLD.toLocaleString()} threshold)
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">Total Investors</p>
            <p className="text-2xl font-bold text-gray-900">
              {stats.totalInvestors ?? 0}
            </p>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">Verified</p>
            <p className="text-2xl font-bold text-green-600">
              {stats.verified ?? 0}
            </p>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">Unverified</p>
            <p className="text-2xl font-bold text-amber-600">
              {stats.unverified ?? 0}
            </p>
          </div>
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs text-gray-500">
              Urgent (≥R{FICA_THRESHOLD.toLocaleString()})
            </p>
            <p className="text-2xl font-bold text-red-600">
              {stats.requiresFicaUrgent ?? 0}
            </p>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={16}
            />
            <input
              type="text"
              placeholder="Search investors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border bg-white py-2 pl-10 pr-4 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-400" />
            {(
              ["ALL", "VERIFIED", "UNVERIFIED", "PENDING_DOCS"] as const
            ).map((f) => (
              <button
                key={f}
                onClick={() => setFilterStatus(f)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  filterStatus === f
                    ? "bg-gold-500 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {f === "PENDING_DOCS"
                  ? "Pending Docs"
                  : f.charAt(0) + f.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <button
            onClick={() => ficaQuery.refetch()}
            className="flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-600 hover:bg-gray-200"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        {/* Loading */}
        {ficaQuery.isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-gold-500" size={32} />
          </div>
        )}

        {/* Investor List */}
        {!ficaQuery.isLoading && (
          <div className="space-y-3">
            {filtered.length === 0 ? (
              <div className="rounded-xl border bg-white p-8 text-center">
                <User className="mx-auto mb-3 text-gray-300" size={40} />
                <p className="text-gray-500">
                  No investors match your criteria
                </p>
              </div>
            ) : (
              filtered.map((inv: any) => (
                <div
                  key={inv.id}
                  className={`rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md ${
                    inv.requiresFica && !inv.ficaVerified
                      ? "border-l-4 border-l-red-500"
                      : ""
                  }`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full ${
                          inv.ficaVerified
                            ? "bg-green-100"
                            : inv.hasPendingDocs
                              ? "bg-amber-100"
                              : "bg-gray-100"
                        }`}
                      >
                        {inv.ficaVerified ? (
                          <ShieldCheck
                            className="text-green-600"
                            size={20}
                          />
                        ) : inv.hasPendingDocs ? (
                          <Clock className="text-amber-600" size={20} />
                        ) : (
                          <ShieldAlert className="text-gray-400" size={20} />
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">
                          {inv.name}
                        </p>
                        <p className="text-xs text-gray-500">{inv.email}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="flex items-center gap-1">
                        <DollarSign size={12} />R
                        {(inv.totalInvested ?? 0).toLocaleString()}
                      </span>
                      {inv.requiresFica && !inv.ficaVerified && (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">
                          FICA Required
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 ${
                          inv.ficaVerified
                            ? "bg-green-100 text-green-700"
                            : inv.ficaRejectedAt
                              ? "bg-red-100 text-red-700"
                              : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {inv.ficaVerified
                          ? "Verified"
                          : inv.ficaRejectedAt
                            ? "Rejected"
                            : "Unverified"}
                      </span>
                      <span className="text-gray-400">
                        Docs: {inv.documentsApproved} approved,{" "}
                        {inv.documentsPending} pending
                      </span>
                      {inv.missingDocuments?.length > 0 && (
                        <span className="text-amber-600">
                          Missing:{" "}
                          {inv.missingDocuments
                            .map((d: string) => docLabel(d))
                            .join(", ")}
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => setSelectedInvestor(inv)}
                      className="flex items-center gap-1 rounded-lg bg-gold-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-gold-600"
                    >
                      <Eye size={14} />
                      Review
                    </button>
                  </div>

                  {inv.ficaRejectedReason && (
                    <div className="mt-2 rounded bg-red-50 px-3 py-1.5 text-xs text-red-700">
                      <AlertTriangle size={12} className="mr-1 inline" />
                      Rejection reason: {inv.ficaRejectedReason}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Detail Modal */}
        {selectedInvestor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">
                  FICA Review — {selectedInvestor.name}
                </h2>
                <button
                  onClick={() => {
                    setSelectedInvestor(null);
                    setRejectReason("");
                  }}
                >
                  <X
                    size={20}
                    className="text-gray-500 hover:text-gray-700"
                  />
                </button>
              </div>

              {/* Investor Info */}
              <div className="mb-4 space-y-2 rounded-lg bg-gray-50 p-3">
                <p className="text-sm">
                  <span className="font-medium">Email:</span>{" "}
                  {selectedInvestor.email}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Total Invested:</span> R
                  {(selectedInvestor.totalInvested ?? 0).toLocaleString()}
                </p>
                <p className="text-sm">
                  <span className="font-medium">FICA Required:</span>{" "}
                  {selectedInvestor.requiresFica
                    ? "Yes (≥R20,000)"
                    : "No (<R20,000)"}
                </p>
                <p className="text-sm">
                  <span className="font-medium">Status:</span>{" "}
                  {selectedInvestor.ficaVerified ? (
                    <span className="text-green-600">
                      Verified on{" "}
                      {new Date(
                        selectedInvestor.ficaVerifiedAt,
                      ).toLocaleDateString()}
                    </span>
                  ) : selectedInvestor.ficaRejectedAt ? (
                    <span className="text-red-600">
                      Rejected — {selectedInvestor.ficaRejectedReason}
                    </span>
                  ) : (
                    <span className="text-amber-600">
                      Pending verification
                    </span>
                  )}
                </p>
              </div>

              {/* KYC Documents */}
              <h3 className="mb-2 text-sm font-semibold text-gray-700">
                KYC Documents
              </h3>
              {selectedInvestor.kycDocuments?.length === 0 ? (
                <p className="mb-4 text-sm text-gray-400">
                  No documents submitted
                </p>
              ) : (
                <div className="mb-4 space-y-2">
                  {selectedInvestor.kycDocuments?.map((doc: any) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between rounded-lg border px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-gray-400" />
                        <span className="text-sm">
                          {docLabel(doc.documentType)}
                        </span>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs ${
                          doc.status === "APPROVED"
                            ? "bg-green-100 text-green-700"
                            : doc.status === "PENDING"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-red-100 text-red-700"
                        }`}
                      >
                        {doc.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* All docs approved indicator */}
              {selectedInvestor.allDocsApproved && (
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-green-700">
                  <CheckCircle size={16} />
                  <span className="text-sm font-medium">
                    All required documents approved
                  </span>
                </div>
              )}
              {selectedInvestor.missingDocuments?.length > 0 && (
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
                  <AlertTriangle size={16} />
                  <span className="text-sm">
                    Missing:{" "}
                    {selectedInvestor.missingDocuments
                      .map((d: string) => docLabel(d))
                      .join(", ")}
                  </span>
                </div>
              )}

              {/* Actions */}
              {!selectedInvestor.ficaVerified && (
                <div className="space-y-3 border-t pt-4">
                  <button
                    onClick={() => handleVerify(selectedInvestor.id)}
                    disabled={
                      actionLoading === selectedInvestor.id ||
                      !selectedInvestor.allDocsApproved
                    }
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {actionLoading === selectedInvestor.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <ShieldCheck size={16} />
                    )}
                    Verify FICA
                  </button>
                  {!selectedInvestor.allDocsApproved && (
                    <p className="text-center text-xs text-gray-400">
                      All required KYC documents must be approved before FICA
                      verification
                    </p>
                  )}

                  <div className="rounded-lg border p-3">
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Rejection Reason
                    </label>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={2}
                      className="w-full rounded-lg border px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                      placeholder="Reason for rejecting FICA..."
                    />
                    <button
                      onClick={() => handleReject(selectedInvestor.id)}
                      disabled={actionLoading === selectedInvestor.id}
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {actionLoading === selectedInvestor.id ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <ShieldX size={16} />
                      )}
                      Reject FICA
                    </button>
                  </div>
                </div>
              )}

              {selectedInvestor.ficaVerified && (
                <div className="border-t pt-4">
                  <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-green-700">
                    <ShieldCheck size={20} />
                    <span className="font-medium">FICA Verified</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
