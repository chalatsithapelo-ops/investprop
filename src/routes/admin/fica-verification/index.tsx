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
  MapPin,
  Phone,
  Calendar,
  Hash,
  Building,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

const MANAGER_ROLES = ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"];
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
  const [docActionLoading, setDocActionLoading] = useState<number | null>(null);
  const [docRejectNotes, setDocRejectNotes] = useState<Record<number, string>>({});
  const [showRejectSection, setShowRejectSection] = useState(false);

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

  // ── Actions ──────────────────────────────────────────────────

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
      setShowRejectSection(false);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to reject FICA");
    } finally {
      setActionLoading(null);
    }
  };

  const handleDocReview = async (
    docId: number,
    status: "APPROVED" | "REJECTED",
  ) => {
    setDocActionLoading(docId);
    try {
      await trpcClient.reviewKYCDocument.mutate({
        authToken: authToken!,
        documentId: docId,
        status,
        reviewNotes:
          status === "REJECTED" ? docRejectNotes[docId] : undefined,
      });
      toast.success(
        `Document ${status === "APPROVED" ? "approved" : "rejected"}`,
      );
      // Refresh data so the modal updates
      const result = await ficaQuery.refetch();
      // Update selectedInvestor from refreshed data
      if (selectedInvestor && result.data) {
        const updated = (result.data as any).investors?.find(
          (i: any) => i.id === selectedInvestor.id,
        );
        if (updated) setSelectedInvestor(updated);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Failed to review document");
    } finally {
      setDocActionLoading(null);
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
              Review and verify investor FICA compliance
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
              Urgent ({"\u2265"}R{FICA_THRESHOLD.toLocaleString()})
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
              placeholder="Search by name or email..."
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
                  : f === "ALL"
                    ? "All"
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
                          <ShieldCheck className="text-green-600" size={20} />
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
                      {inv.kycSubmittedAt && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">
                          KYC Submitted
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 ${
                          inv.ficaVerified
                            ? "bg-green-100 text-green-700"
                            : inv.ficaRejectedAt
                              ? "bg-red-100 text-red-700"
                              : inv.hasPendingDocs
                                ? "bg-amber-100 text-amber-700"
                                : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {inv.ficaVerified
                          ? "Verified"
                          : inv.ficaRejectedAt
                            ? "Rejected"
                            : inv.hasPendingDocs
                              ? "Pending"
                              : "Unverified"}
                      </span>
                      <span className="flex items-center gap-1">
                        <DollarSign size={12} />R
                        {(inv.totalInvested ?? 0).toLocaleString()} invested
                      </span>
                      <span className="text-gray-400">
                        {inv.documentsApproved} approved, {inv.documentsPending}{" "}
                        pending
                      </span>
                    </div>

                    <button
                      onClick={() => {
                        setSelectedInvestor(inv);
                        setRejectReason("");
                        setShowRejectSection(false);
                        setDocRejectNotes({});
                      }}
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

        {/* ═══ REVIEW MODAL ═══════════════════════════════════════ */}
        {selectedInvestor && (
          <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-10">
            <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
              {/* Modal Header */}
              <div className="mb-5 flex items-center justify-between border-b pb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    KYC / FICA Review
                  </h2>
                  <p className="text-sm text-gray-500">
                    {selectedInvestor.name} &mdash; {selectedInvestor.email}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedInvestor(null);
                    setRejectReason("");
                    setShowRejectSection(false);
                  }}
                >
                  <X size={20} className="text-gray-500 hover:text-gray-700" />
                </button>
              </div>

              {/* ── Status Banner ─────────────────────────────── */}
              {selectedInvestor.ficaVerified && (
                <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-green-700">
                  <ShieldCheck size={20} />
                  <span className="font-medium">
                    FICA Verified on{" "}
                    {new Date(selectedInvestor.ficaVerifiedAt).toLocaleDateString()}
                  </span>
                </div>
              )}
              {selectedInvestor.ficaRejectedAt &&
                !selectedInvestor.ficaVerified && (
                  <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-red-700">
                    <ShieldX size={20} className="mt-0.5" />
                    <div>
                      <p className="font-medium">Previously Rejected</p>
                      <p className="text-xs">
                        {selectedInvestor.ficaRejectedReason}
                      </p>
                    </div>
                  </div>
                )}

              {/* ── Personal Details ──────────────────────────── */}
              <div className="mb-5 rounded-xl border bg-gray-50 p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <User size={16} className="text-gold-500" />
                  Personal Details
                  {!selectedInvestor.kycSubmittedAt && (
                    <span className="ml-auto rounded bg-gray-200 px-2 py-0.5 text-[10px] text-gray-500">
                      NOT SUBMITTED
                    </span>
                  )}
                </h3>

                {selectedInvestor.kycSubmittedAt ? (
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <span className="text-xs font-medium text-gray-400">
                        Full Name
                      </span>
                      <p className="text-gray-900">
                        {selectedInvestor.name ?? "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-400">
                        ID / Passport Number
                      </span>
                      <p className="text-gray-900">
                        {selectedInvestor.idNumber ?? "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-400">
                        Date of Birth
                      </span>
                      <p className="text-gray-900">
                        {selectedInvestor.dateOfBirth
                          ? new Date(
                              selectedInvestor.dateOfBirth,
                            ).toLocaleDateString()
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-400">
                        Contact Number
                      </span>
                      <p className="text-gray-900">
                        {selectedInvestor.phoneNumber ?? "—"}
                      </p>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-xs font-medium text-gray-400">
                        Residential Address
                      </span>
                      <p className="text-gray-900">
                        {[
                          selectedInvestor.residentialAddress,
                          selectedInvestor.city,
                          selectedInvestor.province,
                          selectedInvestor.postalCode,
                        ]
                          .filter(Boolean)
                          .join(", ") || "—"}
                      </p>
                    </div>
                    {selectedInvestor.taxNumber && (
                      <div>
                        <span className="text-xs font-medium text-gray-400">
                          Tax Number
                        </span>
                        <p className="text-gray-900">
                          {selectedInvestor.taxNumber}
                        </p>
                      </div>
                    )}
                    {selectedInvestor.companyName && (
                      <div>
                        <span className="text-xs font-medium text-gray-400">
                          Company
                        </span>
                        <p className="text-gray-900">
                          {selectedInvestor.companyName}
                          {selectedInvestor.companyRegNumber &&
                            ` (${selectedInvestor.companyRegNumber})`}
                        </p>
                      </div>
                    )}
                    <div className="sm:col-span-2">
                      <span className="text-xs font-medium text-gray-400">
                        Total Invested
                      </span>
                      <p className="text-gray-900">
                        R{(selectedInvestor.totalInvested ?? 0).toLocaleString()}
                        {selectedInvestor.requiresFica && (
                          <span className="ml-2 text-xs text-red-600">
                            (FICA Required)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">
                    This investor has not submitted their KYC profile yet.
                  </p>
                )}
              </div>

              {/* ── Supporting Documents ──────────────────────── */}
              <div className="mb-5 rounded-xl border bg-gray-50 p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
                  <FileText size={16} className="text-gold-500" />
                  Supporting Documents
                </h3>

                {selectedInvestor.kycDocuments?.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    No documents submitted yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {selectedInvestor.kycDocuments?.map((doc: any) => (
                      <div
                        key={doc.id}
                        className={`rounded-lg border bg-white p-3 ${
                          doc.status === "APPROVED"
                            ? "border-green-200"
                            : doc.status === "REJECTED"
                              ? "border-red-200"
                              : "border-amber-200"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText
                              size={16}
                              className={
                                doc.status === "APPROVED"
                                  ? "text-green-600"
                                  : doc.status === "REJECTED"
                                    ? "text-red-600"
                                    : "text-amber-600"
                              }
                            />
                            <span className="text-sm font-medium text-gray-900">
                              {docLabel(doc.documentType)}
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                doc.status === "APPROVED"
                                  ? "bg-green-100 text-green-700"
                                  : doc.status === "REJECTED"
                                    ? "bg-red-100 text-red-700"
                                    : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {doc.status}
                            </span>
                          </div>

                          {/* View link */}
                          {doc.documentUrl && (
                            <a
                              href={doc.documentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100"
                            >
                              <ExternalLink size={12} />
                              View Document
                            </a>
                          )}
                        </div>

                        {doc.reviewNotes && (
                          <p className="mt-1 text-xs text-gray-500">
                            Review notes: {doc.reviewNotes}
                          </p>
                        )}

                        {/* Approve / Reject individual document */}
                        {doc.status === "PENDING" && (
                          <div className="mt-2 flex items-center gap-2 border-t pt-2">
                            <button
                              onClick={() =>
                                handleDocReview(doc.id, "APPROVED")
                              }
                              disabled={docActionLoading === doc.id}
                              className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              {docActionLoading === doc.id ? (
                                <Loader2
                                  size={12}
                                  className="animate-spin"
                                />
                              ) : (
                                <ThumbsUp size={12} />
                              )}
                              Approve
                            </button>
                            <div className="flex flex-1 items-center gap-1">
                              <input
                                type="text"
                                value={docRejectNotes[doc.id] ?? ""}
                                onChange={(e) =>
                                  setDocRejectNotes((prev) => ({
                                    ...prev,
                                    [doc.id]: e.target.value,
                                  }))
                                }
                                placeholder="Reason (optional)..."
                                className="flex-1 rounded border px-2 py-1 text-xs focus:border-red-400 focus:outline-none"
                              />
                              <button
                                onClick={() =>
                                  handleDocReview(doc.id, "REJECTED")
                                }
                                disabled={docActionLoading === doc.id}
                                className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                              >
                                {docActionLoading === doc.id ? (
                                  <Loader2
                                    size={12}
                                    className="animate-spin"
                                  />
                                ) : (
                                  <ThumbsDown size={12} />
                                )}
                                Reject
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Missing documents warning */}
                {selectedInvestor.missingDocuments?.length > 0 && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-amber-700">
                    <AlertTriangle size={14} />
                    <span className="text-xs">
                      Missing required:{" "}
                      {selectedInvestor.missingDocuments
                        .map((d: string) => docLabel(d))
                        .join(", ")}
                    </span>
                  </div>
                )}

                {selectedInvestor.allDocsApproved && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-green-700">
                    <CheckCircle size={14} />
                    <span className="text-xs font-medium">
                      All required documents approved
                    </span>
                  </div>
                )}
              </div>

              {/* ── FICA Actions ──────────────────────────────── */}
              {!selectedInvestor.ficaVerified && (
                <div className="space-y-3 border-t pt-4">
                  <button
                    onClick={() => handleVerify(selectedInvestor.id)}
                    disabled={
                      actionLoading === selectedInvestor.id ||
                      !selectedInvestor.allDocsApproved
                    }
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
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
                      All required KYC documents must be approved before
                      FICA can be verified
                    </p>
                  )}

                  {!showRejectSection ? (
                    <button
                      onClick={() => setShowRejectSection(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                    >
                      <ShieldX size={16} />
                      Reject FICA...
                    </button>
                  ) : (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                      <label className="mb-1 block text-xs font-medium text-red-700">
                        Rejection Reason *
                      </label>
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        rows={2}
                        className="w-full rounded-lg border px-3 py-2 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                        placeholder="Explain why the FICA verification is being rejected..."
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => handleReject(selectedInvestor.id)}
                          disabled={actionLoading === selectedInvestor.id}
                          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {actionLoading === selectedInvestor.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <ShieldX size={14} />
                          )}
                          Confirm Rejection
                        </button>
                        <button
                          onClick={() => {
                            setShowRejectSection(false);
                            setRejectReason("");
                          }}
                          className="rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-100"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}