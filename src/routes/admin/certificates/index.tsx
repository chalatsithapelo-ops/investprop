import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Search,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Eye,
  X,
  FileText,
  Hash,
  Fingerprint,
  Globe,
  Clock,
  User,
  Building,
  DollarSign,
  Loader2,
  RefreshCw,
  Ban,
  StickyNote,
  Filter,
  Download,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import { downloadCertificatePDF } from "~/utils/generate-certificate-pdf";
import toast from "react-hot-toast";

const MANAGER_ROLES = ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"];

export const Route = createFileRoute("/admin/certificates/")({
  component: CertificateManagementPage,
});

function CertificateManagementPage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [search, setSearch] = useState("");
  const [showValidOnly, setShowValidOnly] = useState<boolean | undefined>(
    undefined,
  );
  const [selectedCert, setSelectedCert] = useState<any>(null);
  const [validateNumber, setValidateNumber] = useState("");
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<any>(null);
  const [revokeId, setRevokeId] = useState<number | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [revokeNotes, setRevokeNotes] = useState("");
  const [revoking, setRevoking] = useState(false);
  const [editNotesId, setEditNotesId] = useState<number | null>(null);
  const [editNotesValue, setEditNotesValue] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [tab, setTab] = useState<"list" | "validate">("list");
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const handleDownloadPDF = async (certId: number) => {
    try {
      setDownloadingId(certId);
      const pdfData = await trpcClient.getCertificatePDFData.mutate({
        authToken: authToken!,
        certificateId: certId,
      });
      await downloadCertificatePDF(pdfData as any);
      toast.success("Certificate PDF downloaded");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to download PDF");
    } finally {
      setDownloadingId(null);
    }
  };

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const isManager = MANAGER_ROLES.includes(user?.role);

  const certsQuery = useQuery({
    ...trpc.getAllCertificates.queryOptions({
      authToken: authToken ?? "",
      validOnly: showValidOnly,
    }),
    enabled: !!authToken && isManager,
  });

  const certs = (certsQuery.data as any[]) ?? [];

  const filtered = certs.filter(
    (c: any) =>
      !search ||
      (c.certificateNumber ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (c.investorName ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (c.propertyTitle ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const handleValidate = async () => {
    if (!validateNumber.trim()) {
      toast.error("Enter a certificate number");
      return;
    }
    setValidating(true);
    setValidationResult(null);
    try {
      const result = await trpcClient.validateCertificate.mutate({
        authToken: authToken!,
        certificateNumber: validateNumber.trim(),
      });
      setValidationResult(result);
    } catch (e: any) {
      toast.error(e.message ?? "Validation failed");
    } finally {
      setValidating(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeId || !revokeReason.trim()) {
      toast.error("Please provide a revocation reason");
      return;
    }
    setRevoking(true);
    try {
      await trpcClient.revokeCertificate.mutate({
        authToken: authToken!,
        certificateId: revokeId,
        reason: revokeReason,
        internalNotes: revokeNotes || undefined,
      });
      toast.success("Certificate revoked");
      queryClient.invalidateQueries({
        queryKey: trpc.getAllCertificates.queryKey(),
      });
      setRevokeId(null);
      setRevokeReason("");
      setRevokeNotes("");
      setSelectedCert(null);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to revoke");
    } finally {
      setRevoking(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!editNotesId) return;
    setSavingNotes(true);
    try {
      await trpcClient.updateCertificateNotes.mutate({
        authToken: authToken!,
        certificateId: editNotesId,
        internalNotes: editNotesValue,
      });
      toast.success("Notes saved");
      queryClient.invalidateQueries({
        queryKey: trpc.getAllCertificates.queryKey(),
      });
      setEditNotesId(null);
      setEditNotesValue("");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to save notes");
    } finally {
      setSavingNotes(false);
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
            Only managers can access certificate management.
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
              Certificate Management
            </h1>
            <p className="text-gray-500">
              View, validate, and manage share certificates
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-2">
          <button
            onClick={() => setTab("list")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === "list"
                ? "bg-gold-500 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            All Certificates
          </button>
          <button
            onClick={() => setTab("validate")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === "validate"
                ? "bg-gold-500 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Validate Certificate
          </button>
        </div>

        {/* Validate Tab */}
        {tab === "validate" && (
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Validate Certificate Authenticity
            </h2>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Enter certificate number (e.g. CERT-1-0001-2026)"
                value={validateNumber}
                onChange={(e) => setValidateNumber(e.target.value)}
                className="flex-1 rounded-lg border px-4 py-2 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
              />
              <button
                onClick={handleValidate}
                disabled={validating}
                className="flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600 disabled:opacity-50"
              >
                {validating ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Fingerprint size={16} />
                )}
                Validate
              </button>
            </div>

            {validationResult && (
              <div
                className={`mt-4 rounded-lg border p-4 ${
                  validationResult.valid
                    ? "border-green-200 bg-green-50"
                    : "border-red-200 bg-red-50"
                }`}
              >
                <div className="flex items-center gap-2">
                  {validationResult.valid ? (
                    <CheckCircle className="text-green-600" size={20} />
                  ) : (
                    <XCircle className="text-red-600" size={20} />
                  )}
                  <span
                    className={`font-semibold ${
                      validationResult.valid
                        ? "text-green-700"
                        : "text-red-700"
                    }`}
                  >
                    {validationResult.message}
                  </span>
                </div>

                {validationResult.exists && validationResult.certificate && (
                  <div className="mt-3 space-y-1 text-sm">
                    <p>
                      <span className="font-medium">Certificate:</span>{" "}
                      {validationResult.certificate.certificateNumber}
                    </p>
                    <p>
                      <span className="font-medium">Investor:</span>{" "}
                      {validationResult.certificate.investorName}
                    </p>
                    <p>
                      <span className="font-medium">Property:</span>{" "}
                      {validationResult.certificate.property?.title}
                    </p>
                    <p>
                      <span className="font-medium">Shares:</span>{" "}
                      {validationResult.certificate.numberOfShares?.toLocaleString()}{" "}
                      (
                      {validationResult.certificate.ownershipPercentage?.toFixed(
                        2,
                      )}
                      %)
                    </p>
                    <p>
                      <span className="font-medium">Value:</span> R
                      {validationResult.certificate.totalValue?.toLocaleString()}
                    </p>
                    <p>
                      <span className="font-medium">Hash Integrity:</span>{" "}
                      {validationResult.hashIntegrity ? (
                        <span className="text-green-600">PASSED</span>
                      ) : (
                        <span className="text-red-600">
                          FAILED — Possible tampering
                        </span>
                      )}
                    </p>
                    <p>
                      <span className="font-medium">Fraud Flags:</span>{" "}
                      {validationResult.certificate.fraudFlags ?? 0}
                    </p>
                    <p>
                      <span className="font-medium">Verification Count:</span>{" "}
                      {validationResult.certificate.verificationCount ?? 0}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* List Tab */}
        {tab === "list" && (
          <>
            {/* Summary Stats */}
            <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <p className="text-xs text-gray-500">Total Certificates</p>
                <p className="text-2xl font-bold text-gray-900">
                  {certs.length}
                </p>
              </div>
              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <p className="text-xs text-gray-500">Valid</p>
                <p className="text-2xl font-bold text-green-600">
                  {certs.filter((c: any) => c.isValid).length}
                </p>
              </div>
              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <p className="text-xs text-gray-500">Revoked</p>
                <p className="text-2xl font-bold text-red-600">
                  {certs.filter((c: any) => !c.isValid).length}
                </p>
              </div>
              <div className="rounded-xl border bg-white p-4 shadow-sm">
                <p className="text-xs text-gray-500">Total Value</p>
                <p className="text-2xl font-bold text-gray-900">
                  R
                  {certs
                    .filter((c: any) => c.isValid)
                    .reduce((s: number, c: any) => s + (c.totalValue ?? 0), 0)
                    .toLocaleString()}
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
                  placeholder="Search by certificate number, investor, or property..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg border bg-white py-2 pl-10 pr-4 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter size={16} className="text-gray-400" />
                {[
                  { label: "All", value: undefined },
                  { label: "Valid", value: true },
                  { label: "Revoked", value: false },
                ].map((f) => (
                  <button
                    key={String(f.value)}
                    onClick={() => setShowValidOnly(f.value)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                      showValidOnly === f.value
                        ? "bg-gold-500 text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => certsQuery.refetch()}
                className="flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-600 hover:bg-gray-200"
              >
                <RefreshCw size={14} />
                Refresh
              </button>
            </div>

            {/* Loading */}
            {certsQuery.isLoading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="animate-spin text-gold-500" size={32} />
              </div>
            )}

            {/* Certificate List */}
            {!certsQuery.isLoading && (
              <div className="space-y-3">
                {filtered.length === 0 ? (
                  <div className="rounded-xl border bg-white p-8 text-center">
                    <FileText
                      className="mx-auto mb-3 text-gray-300"
                      size={40}
                    />
                    <p className="text-gray-500">No certificates found</p>
                  </div>
                ) : (
                  filtered.map((cert: any) => (
                    <div
                      key={cert.id}
                      className={`rounded-xl border bg-white p-4 shadow-sm transition hover:shadow-md ${
                        !cert.isValid ? "border-l-4 border-l-red-500" : ""
                      }`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex h-10 w-10 items-center justify-center rounded-full ${
                              cert.isValid ? "bg-green-100" : "bg-red-100"
                            }`}
                          >
                            {cert.isValid ? (
                              <ShieldCheck
                                className="text-green-600"
                                size={20}
                              />
                            ) : (
                              <ShieldAlert
                                className="text-red-600"
                                size={20}
                              />
                            )}
                          </div>
                          <div>
                            <p className="font-mono text-sm font-semibold text-gray-900">
                              {cert.certificateNumber}
                            </p>
                            <p className="text-xs text-gray-500">
                              {cert.investorName} — {cert.property?.title}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs">
                          <span className="flex items-center gap-1 text-gray-600">
                            <Hash size={12} />
                            {cert.numberOfShares?.toLocaleString()} shares
                          </span>
                          <span className="flex items-center gap-1 text-gray-600">
                            <DollarSign size={12} />R
                            {cert.totalValue?.toLocaleString()}
                          </span>
                          <span className="flex items-center gap-1 text-gray-600">
                            <Globe size={12} />
                            {cert.ownershipPercentage?.toFixed(2)}%
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 ${
                              cert.isValid
                                ? "bg-green-100 text-green-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {cert.isValid ? "Valid" : "Revoked"}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setSelectedCert(cert)}
                            className="flex items-center gap-1 rounded-lg bg-gold-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-gold-600"
                          >
                            <Eye size={14} />
                            Details
                          </button>
                          <button
                            onClick={() => handleDownloadPDF(cert.id)}
                            disabled={downloadingId === cert.id}
                            className="flex items-center gap-1 rounded-lg border border-gold-300 bg-gold-50 px-3 py-1.5 text-xs font-medium text-gold-700 hover:bg-gold-100 disabled:opacity-50"
                          >
                            {downloadingId === cert.id ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                            PDF
                          </button>
                          {cert.isValid && (
                            <button
                              onClick={() => {
                                setRevokeId(cert.id);
                                setRevokeReason("");
                                setRevokeNotes("");
                              }}
                              className="flex items-center gap-1 rounded-lg bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200"
                            >
                              <Ban size={14} />
                              Revoke
                            </button>
                          )}
                        </div>
                      </div>

                      {!cert.isValid && cert.revokedReason && (
                        <div className="mt-2 rounded bg-red-50 px-3 py-1.5 text-xs text-red-700">
                          <AlertTriangle size={12} className="mr-1 inline" />
                          Revoked: {cert.revokedReason}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}

        {/* Detail Modal */}
        {selectedCert && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">
                  Certificate Details
                </h2>
                <button onClick={() => setSelectedCert(null)}>
                  <X
                    size={20}
                    className="text-gray-500 hover:text-gray-700"
                  />
                </button>
              </div>

              <div className="space-y-2 text-sm">
                <p>
                  <span className="font-medium">Certificate #:</span>{" "}
                  <span className="font-mono">
                    {selectedCert.certificateNumber}
                  </span>
                </p>
                <p>
                  <span className="font-medium">Investor:</span>{" "}
                  {selectedCert.investorName} ({selectedCert.investor?.email})
                </p>
                <p>
                  <span className="font-medium">Property:</span>{" "}
                  {selectedCert.propertyTitle ?? selectedCert.property?.title}
                </p>
                <p>
                  <span className="font-medium">Share Class:</span>{" "}
                  {selectedCert.shareClassName}
                </p>
                <p>
                  <span className="font-medium">Shares:</span>{" "}
                  {selectedCert.numberOfShares?.toLocaleString()} @R
                  {selectedCert.sharePrice?.toFixed(2)}/share
                </p>
                <p>
                  <span className="font-medium">Total Value:</span> R
                  {selectedCert.totalValue?.toLocaleString()}
                </p>
                <p>
                  <span className="font-medium">Ownership:</span>{" "}
                  {selectedCert.ownershipPercentage?.toFixed(4)}%
                </p>
                <p>
                  <span className="font-medium">Issued:</span>{" "}
                  {new Date(selectedCert.issueDate).toLocaleDateString()}
                </p>
                <p>
                  <span className="font-medium">Status:</span>{" "}
                  {selectedCert.isValid ? (
                    <span className="text-green-600">Valid</span>
                  ) : (
                    <span className="text-red-600">
                      Revoked — {selectedCert.revokedReason}
                    </span>
                  )}
                </p>
                {selectedCert.contribution && (
                  <p>
                    <span className="font-medium">Payment:</span>{" "}
                    {selectedCert.contribution.paymentMethod} —{" "}
                    {selectedCert.contribution.paymentStatus}
                  </p>
                )}
                {selectedCert.internalFingerprint && (
                  <p>
                    <span className="font-medium">Fingerprint:</span>{" "}
                    <span className="font-mono text-xs">
                      {selectedCert.internalFingerprint}
                    </span>
                  </p>
                )}
                {selectedCert.fraudFlags > 0 && (
                  <p className="text-red-600">
                    <span className="font-medium">Fraud Flags:</span>{" "}
                    {selectedCert.fraudFlags}
                  </p>
                )}
                {selectedCert.verificationCount !== undefined && (
                  <p>
                    <span className="font-medium">Verification Count:</span>{" "}
                    {selectedCert.verificationCount}
                  </p>
                )}
              </div>

              {/* Internal Notes */}
              <div className="mt-4 border-t pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">
                    Internal Notes
                  </h3>
                  <button
                    onClick={() => {
                      setEditNotesId(selectedCert.id);
                      setEditNotesValue(selectedCert.internalNotes ?? "");
                    }}
                    className="text-xs text-gold-600 hover:underline"
                  >
                    <StickyNote size={12} className="mr-1 inline" />
                    Edit
                  </button>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  {selectedCert.internalNotes || "No notes"}
                </p>
              </div>

              {/* Download PDF button */}
              <button
                onClick={() => handleDownloadPDF(selectedCert.id)}
                disabled={downloadingId === selectedCert.id}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-navy-800 py-2.5 text-sm font-medium text-white hover:bg-navy-700 disabled:opacity-50"
              >
                {downloadingId === selectedCert.id ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                Download Share Certificate (PDF)
              </button>
            </div>
          </div>
        )}

        {/* Revoke Modal */}
        {revokeId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h2 className="mb-4 text-lg font-bold text-red-700">
                Revoke Certificate
              </h2>
              <p className="mb-4 text-sm text-gray-600">
                This action cannot be undone. The investor will be notified.
              </p>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Reason *
              </label>
              <input
                type="text"
                value={revokeReason}
                onChange={(e) => setRevokeReason(e.target.value)}
                className="mb-3 w-full rounded-lg border px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
                placeholder="Reason for revocation..."
              />
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Internal Notes (optional)
              </label>
              <textarea
                value={revokeNotes}
                onChange={(e) => setRevokeNotes(e.target.value)}
                rows={2}
                className="mb-4 w-full rounded-lg border px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
                placeholder="Internal notes..."
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setRevokeId(null)}
                  className="flex-1 rounded-lg bg-gray-100 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRevoke}
                  disabled={revoking || !revokeReason.trim()}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {revoking ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Ban size={16} />
                  )}
                  Revoke
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Notes Modal */}
        {editNotesId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h2 className="mb-4 text-lg font-bold text-gray-900">
                Edit Internal Notes
              </h2>
              <textarea
                value={editNotesValue}
                onChange={(e) => setEditNotesValue(e.target.value)}
                rows={4}
                className="mb-4 w-full rounded-lg border px-3 py-2 text-sm focus:border-gold-500 focus:outline-none"
                placeholder="Internal notes for this certificate..."
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setEditNotesId(null)}
                  className="flex-1 rounded-lg bg-gray-100 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveNotes}
                  disabled={savingNotes}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gold-500 py-2 text-sm font-medium text-white hover:bg-gold-600 disabled:opacity-50"
                >
                  {savingNotes ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <StickyNote size={16} />
                  )}
                  Save Notes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
