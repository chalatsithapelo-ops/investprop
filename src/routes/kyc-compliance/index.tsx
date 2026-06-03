import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import {
  Shield,
  Upload,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  FileCheck,
  Eye,
  User,
  MapPin,
  Phone,
  FileText,
  Loader2,
  Trash2,
  ShieldCheck,
  ShieldX,
  Paperclip,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

export const Route = createFileRoute("/kyc-compliance/")({
  component: KYCCompliancePage,
});

const PROVINCES = [
  "Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal",
  "Limpopo", "Mpumalanga", "Northern Cape", "North West", "Western Cape",
];

const DOC_TYPES = [
  { value: "ID_DOCUMENT", label: "ID Document / Passport", required: true, description: "Certified copy of your SA ID or valid passport" },
  { value: "PROOF_OF_ADDRESS", label: "Proof of Address", required: true, description: "Utility bill, bank statement, or municipal account (not older than 3 months)" },
  { value: "BANK_STATEMENT", label: "Bank Confirmation Letter", required: false, description: "Letter from your bank confirming your account details" },
  { value: "TAX_NUMBER", label: "Tax Clearance / Number", required: false, description: "SARS tax clearance certificate or tax number" },
  { value: "COMPANY_REGISTRATION", label: "Company Registration", required: false, description: "CIPC registration documents (if investing as entity)" },
] as const;

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  APPROVED: { color: "text-green-700", bg: "bg-green-50 border-green-200", label: "Approved" },
  PENDING: { color: "text-amber-700", bg: "bg-amber-50 border-amber-200", label: "Pending Review" },
  REJECTED: { color: "text-red-700", bg: "bg-red-50 border-red-200", label: "Rejected" },
  EXPIRED: { color: "text-orange-700", bg: "bg-orange-50 border-orange-200", label: "Expired" },
};

const docLabel = (t: string) =>
  DOC_TYPES.find((d) => d.value === t)?.label ?? t.replace(/_/g, " ");

type AttachedDoc = {
  documentType: string;
  file: File | null;
  documentUrl: string;
  fileName: string;
  uploading: boolean;
};

// ═══════════════════════════════════════════════════════════════
//  Main Component
// ═══════════════════════════════════════════════════════════════

function KYCCompliancePage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated, navigate]);

  const isManager =
    user?.role === "DEVELOPMENT_MANAGER" ||
    user?.role === "PROJECT_MANAGER" ||
    user?.role === "ADMIN";

  // Managers default to review mode
  const [view, setView] = useState<"my" | "review">(isManager ? "review" : "my");
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});

  // ─── Form state (investor only) ───────────────────────────
  const [form, setForm] = useState({
    fullName: "", idNumber: "", dateOfBirth: "", phoneNumber: "",
    residentialAddress: "", city: "", province: "", postalCode: "",
    taxNumber: "", companyName: "", companyRegNumber: "",
  });
  const [attachedDocs, setAttachedDocs] = useState<AttachedDoc[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // ─── Queries ───────────────────────────────────────────────
  const profileQuery = useQuery({
    ...trpc.getKYCProfile.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && !isManager,
  });

  const complianceQuery = useQuery({
    ...trpc.checkKYCCompliance.queryOptions({
      authToken: authToken ?? "",
      investorId: user?.id ?? 0,
    }),
    enabled: !!authToken && !!user?.id && !isManager,
  });

  // Manager review queue
  const ficaQuery = useQuery({
    ...trpc.getInvestorsFicaStatus.queryOptions({
      authToken: authToken ?? "",
      filter: "ALL" as const,
    }),
    enabled: !!authToken && isManager && view === "review",
  });

  const reviewMutation = useMutation(
    trpc.reviewKYCDocument.mutationOptions({
      onSuccess: () => {
        toast.success("Document reviewed");
        qc.invalidateQueries({ queryKey: trpc.getKYCDocuments.queryKey() });
        qc.invalidateQueries({ queryKey: trpc.getKYCProfile.queryKey() });
        qc.invalidateQueries({ queryKey: trpc.getInvestorsFicaStatus.queryKey() });
      },
      onError: (e: any) => toast.error(e.message),
    }),
  );

  const profileData = profileQuery.data as any;
  const profile = profileData?.profile;
  const existingDocs = (profileData?.documents ?? []) as any[];
  const compliance = complianceQuery.data as any;

  const hasSubmitted = !!profile?.kycSubmittedAt;

  // Pre-fill form
  const [formPopulated, setFormPopulated] = useState(false);
  if (profile && !formPopulated) {
    setForm({
      fullName: profile.name ?? "",
      idNumber: profile.idNumber ?? "",
      dateOfBirth: profile.dateOfBirth
        ? new Date(profile.dateOfBirth).toISOString().split("T")[0]!
        : "",
      phoneNumber: profile.phoneNumber ?? "",
      residentialAddress: profile.residentialAddress ?? "",
      city: profile.city ?? "",
      province: profile.province ?? "",
      postalCode: profile.postalCode ?? "",
      taxNumber: profile.taxNumber ?? "",
      companyName: profile.companyName ?? "",
      companyRegNumber: profile.companyRegNumber ?? "",
    });
    setFormPopulated(true);
  }

  // ─── File helpers ──────────────────────────────────────────
  const handleFileSelect = (docType: string, file: File) => {
    setAttachedDocs((prev) => {
      const filtered = prev.filter((d) => d.documentType !== docType);
      return [...filtered, { documentType: docType, file, documentUrl: "", fileName: file.name, uploading: false }];
    });
  };
  const removeAttachedDoc = (docType: string) => {
    setAttachedDocs((prev) => prev.filter((d) => d.documentType !== docType));
  };
  const uploadSingleFile = async (file: File): Promise<{ publicUrl: string }> => {
    const reader = new FileReader();
    const base64: string = await new Promise((resolve) => {
      reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
      reader.readAsDataURL(file);
    });
    return (trpcClient as any).uploadFile.mutate({
      authToken: authToken ?? "", fileName: file.name, fileType: file.type, fileBase64: base64,
    });
  };

  // ─── Submit KYC ────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.fullName.trim()) return toast.error("Full legal name is required");
    if (!form.idNumber.trim()) return toast.error("ID / passport number is required");
    if (!form.dateOfBirth) return toast.error("Date of birth is required");
    if (!form.phoneNumber.trim()) return toast.error("Contact number is required");
    if (!form.residentialAddress.trim()) return toast.error("Residential address is required");
    if (!form.city.trim()) return toast.error("City / town is required");
    if (!form.province) return toast.error("Province is required");
    if (!form.postalCode.trim()) return toast.error("Postal code is required");

    const requiredTypes = ["ID_DOCUMENT", "PROOF_OF_ADDRESS"];
    const attachedTypes = attachedDocs.map((d) => d.documentType);
    const existingApproved = existingDocs.filter((d: any) => d.status === "APPROVED").map((d: any) => d.documentType);
    for (const rt of requiredTypes) {
      if (!attachedTypes.includes(rt) && !existingApproved.includes(rt)) {
        return toast.error(`Required: ${DOC_TYPES.find((d) => d.value === rt)?.label ?? rt}`);
      }
    }

    setSubmitting(true);
    try {
      const uploadedDocs: { documentType: string; documentUrl: string; fileName: string }[] = [];
      for (const doc of attachedDocs) {
        if (doc.file) {
          const result = await uploadSingleFile(doc.file);
          uploadedDocs.push({ documentType: doc.documentType, documentUrl: result.publicUrl, fileName: doc.fileName });
        }
      }
      if (uploadedDocs.length === 0 && existingDocs.length === 0) {
        toast.error("Please attach at least one supporting document");
        setSubmitting(false);
        return;
      }
      await (trpcClient as any).submitKYCProfile.mutate({
        authToken: authToken ?? "",
        fullName: form.fullName.trim(), idNumber: form.idNumber.trim(),
        dateOfBirth: form.dateOfBirth, phoneNumber: form.phoneNumber.trim(),
        residentialAddress: form.residentialAddress.trim(), city: form.city.trim(),
        province: form.province, postalCode: form.postalCode.trim(),
        taxNumber: form.taxNumber.trim() || undefined,
        companyName: form.companyName.trim() || undefined,
        companyRegNumber: form.companyRegNumber.trim() || undefined,
        documents: uploadedDocs.length > 0 ? uploadedDocs : existingDocs.map((d: any) => ({
          documentType: d.documentType, documentUrl: d.documentUrl, fileName: d.documentType,
        })),
      });
      toast.success("KYC submission successful! Your documents are pending review.");
      setAttachedDocs([]);
      setEditMode(false);
      qc.invalidateQueries({ queryKey: trpc.getKYCProfile.queryKey() });
      qc.invalidateQueries({ queryKey: trpc.checkKYCCompliance.queryKey() });
    } catch (e: any) {
      toast.error(e.message ?? "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const ficaVerified = profile?.ficaVerified === true;
  const ficaRejected = !!profile?.ficaRejectedAt;
  const [editMode, setEditMode] = useState(false);
  const showForm = !hasSubmitted || editMode || ficaRejected;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="text-blue-600" size={32} />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">KYC Compliance</h1>
              <p className="text-gray-500">
                {isManager
                  ? "Review investor KYC submissions and approve documents"
                  : "FICA identity verification & document submission"}
              </p>
            </div>
          </div>
          {isManager && (
            <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
              <button
                onClick={() => setView("review")}
                className={`rounded-md px-4 py-2 text-sm font-medium ${view === "review" ? "bg-white shadow" : "text-gray-500"}`}
              >
                Review Submissions
              </button>
              <button
                onClick={() => setView("my")}
                className={`rounded-md px-4 py-2 text-sm font-medium ${view === "my" ? "bg-white shadow" : "text-gray-500"}`}
              >
                My KYC
              </button>
            </div>
          )}
        </div>

        {/* ══════════ INVESTOR VIEW ══════════════════════════════ */}
        {view === "my" && (
          <>
            {ficaVerified && (
              <div className="mb-6 flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
                <ShieldCheck className="text-green-600" size={24} />
                <div>
                  <p className="font-semibold text-green-800">FICA Verified</p>
                  <p className="text-sm text-green-600">
                    Verified on {new Date(profile.ficaVerifiedAt).toLocaleDateString("en-ZA")}.
                    You are cleared for all investment amounts.
                  </p>
                </div>
              </div>
            )}
            {ficaRejected && !ficaVerified && (
              <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
                <ShieldX className="text-red-600" size={24} />
                <div>
                  <p className="font-semibold text-red-800">FICA Verification Rejected</p>
                  <p className="text-sm text-red-600">
                    {profile.ficaRejectedReason ?? "Please re-submit your details and documents."}
                  </p>
                </div>
              </div>
            )}
            {hasSubmitted && !ficaVerified && !ficaRejected && (
              <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <Clock className="text-amber-600" size={24} />
                <div>
                  <p className="font-semibold text-amber-800">KYC Under Review</p>
                  <p className="text-sm text-amber-600">
                    Submitted on {new Date(profile.kycSubmittedAt).toLocaleDateString("en-ZA")}.
                    Our team is reviewing your documents.
                  </p>
                </div>
              </div>
            )}

            {/* Submitted summary or form */}
            {hasSubmitted && !showForm ? (
              <>
                <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                      <User size={20} className="text-blue-500" /> Your KYC Details
                    </h2>
                    {!ficaVerified && (
                      <button onClick={() => setEditMode(true)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
                        Edit & Resubmit
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <InfoRow label="Full Legal Name" value={profile.name} />
                    <InfoRow label="ID / Passport Number" value={profile.idNumber} />
                    <InfoRow label="Date of Birth" value={profile.dateOfBirth ? new Date(profile.dateOfBirth).toLocaleDateString("en-ZA") : "-"} />
                    <InfoRow label="Contact Number" value={profile.phoneNumber} />
                    <InfoRow label="Residential Address" value={profile.residentialAddress} span />
                    <InfoRow label="City / Town" value={profile.city} />
                    <InfoRow label="Province" value={profile.province} />
                    <InfoRow label="Postal Code" value={profile.postalCode} />
                    {profile.taxNumber && <InfoRow label="Tax Number" value={profile.taxNumber} />}
                    {profile.companyName && <InfoRow label="Company Name" value={profile.companyName} />}
                    {profile.companyRegNumber && <InfoRow label="Registration No." value={profile.companyRegNumber} />}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-6">
                  <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                    <FileText size={20} className="text-blue-500" /> Supporting Documents
                  </h2>
                  <div className="space-y-3">
                    {existingDocs.map((doc: any) => {
                      const dt = DOC_TYPES.find((t) => t.value === doc.documentType);
                      const sc = STATUS_CONFIG[doc.status];
                      return (
                        <div key={doc.id} className={`flex items-center justify-between rounded-lg border p-4 ${sc?.bg ?? "bg-gray-50 border-gray-200"}`}>
                          <div className="flex items-center gap-3">
                            <Paperclip size={16} className="text-gray-400" />
                            <div>
                              <p className="text-sm font-medium text-gray-900">{dt?.label ?? doc.documentType}</p>
                              <p className="text-xs text-gray-500">Uploaded {new Date(doc.createdAt).toLocaleDateString("en-ZA")}</p>
                              {doc.reviewNotes && <p className="mt-0.5 text-xs text-red-600">Note: {doc.reviewNotes}</p>}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sc?.color ?? "text-gray-500"}`}>{sc?.label ?? doc.status}</span>
                            {doc.documentUrl && (
                              <a href={doc.documentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                                <Eye size={12} /> View
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {existingDocs.length === 0 && <p className="py-4 text-center text-sm text-gray-400">No documents found</p>}
                  </div>
                </div>
              </>
            ) : view === "my" ? (
              <div className="space-y-6">
                {editMode && (
                  <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 p-3">
                    <p className="text-sm text-blue-700">Editing your KYC submission. Update your details and re-attach documents.</p>
                    <button onClick={() => setEditMode(false)} className="text-sm text-blue-600 underline hover:text-blue-800">Cancel</button>
                  </div>
                )}
                {/* Personal Details */}
                <div className="rounded-xl border border-gray-200 bg-white p-6">
                  <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-gray-900">
                    <User size={20} className="text-blue-500" /> Personal Details
                  </h2>
                  <p className="mb-5 text-sm text-gray-500">Enter your information as it appears on your official documents.</p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField label="Full Legal Name *" value={form.fullName} onChange={(v) => setForm({ ...form, fullName: v })} placeholder="e.g. Thabo James Mokoena" />
                    <FormField label="SA ID / Passport Number *" value={form.idNumber} onChange={(v) => setForm({ ...form, idNumber: v })} placeholder="e.g. 9501015800082" />
                    <FormField label="Date of Birth *" type="date" value={form.dateOfBirth} onChange={(v) => setForm({ ...form, dateOfBirth: v })} />
                    <FormField label="Contact Number *" value={form.phoneNumber} onChange={(v) => setForm({ ...form, phoneNumber: v })} placeholder="e.g. 082 123 4567" />
                  </div>
                </div>
                {/* Address */}
                <div className="rounded-xl border border-gray-200 bg-white p-6">
                  <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-gray-900">
                    <MapPin size={20} className="text-blue-500" /> Residential Address
                  </h2>
                  <p className="mb-5 text-sm text-gray-500">Your current physical address (must match your proof of address document).</p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <FormField label="Street Address *" value={form.residentialAddress} onChange={(v) => setForm({ ...form, residentialAddress: v })} placeholder="e.g. 15 Rivonia Road, Sandton" />
                    </div>
                    <FormField label="City / Town *" value={form.city} onChange={(v) => setForm({ ...form, city: v })} placeholder="e.g. Johannesburg" />
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">Province *</label>
                      <select value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                        <option value="">Select province</option>
                        {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <FormField label="Postal Code *" value={form.postalCode} onChange={(v) => setForm({ ...form, postalCode: v })} placeholder="e.g. 2196" />
                  </div>
                </div>
                {/* Tax & Company */}
                <div className="rounded-xl border border-gray-200 bg-white p-6">
                  <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-gray-900">
                    <FileText size={20} className="text-blue-500" /> Tax & Company Details
                    <span className="text-xs font-normal text-gray-400">(optional)</span>
                  </h2>
                  <p className="mb-5 text-sm text-gray-500">Only required if you have a tax number or are investing via a company.</p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <FormField label="SARS Tax Number" value={form.taxNumber} onChange={(v) => setForm({ ...form, taxNumber: v })} placeholder="e.g. 0123456789" />
                    <FormField label="Company Name" value={form.companyName} onChange={(v) => setForm({ ...form, companyName: v })} placeholder="e.g. Mokoena Investments (Pty) Ltd" />
                    <FormField label="CIPC Registration Number" value={form.companyRegNumber} onChange={(v) => setForm({ ...form, companyRegNumber: v })} placeholder="e.g. 2024/123456/07" />
                  </div>
                </div>
                {/* Documents */}
                <div className="rounded-xl border border-gray-200 bg-white p-6">
                  <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-gray-900">
                    <Upload size={20} className="text-blue-500" /> Supporting Documents
                  </h2>
                  <p className="mb-5 text-sm text-gray-500">
                    Attach certified copies or clear scans. Items marked with <span className="font-semibold text-red-500">*</span> are required.
                  </p>
                  <div className="space-y-4">
                    {DOC_TYPES.map((dt) => {
                      const attached = attachedDocs.find((d) => d.documentType === dt.value);
                      const existing = existingDocs.find((d: any) => d.documentType === dt.value);
                      const existingSc = existing ? STATUS_CONFIG[existing.status] : null;
                      return (
                        <div key={dt.value} className={`rounded-lg border p-4 ${attached ? "border-blue-200 bg-blue-50" : existing ? existingSc?.bg ?? "border-gray-200" : "border-dashed border-gray-300"}`}>
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-gray-900">{dt.label}{dt.required && <span className="ml-1 text-red-500">*</span>}</p>
                                {existing && !attached && <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${existingSc?.color}`}>{existingSc?.label}</span>}
                              </div>
                              <p className="mt-0.5 text-xs text-gray-500">{dt.description}</p>
                              {existing?.reviewNotes && !attached && <p className="mt-1 text-xs text-red-600">Review note: {existing.reviewNotes}</p>}
                            </div>
                            <div className="ml-4 flex items-center gap-2">
                              {attached ? (
                                <>
                                  <span className="max-w-[150px] truncate text-xs text-blue-700">{attached.fileName}</span>
                                  <button type="button" onClick={() => removeAttachedDoc(dt.value)} className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                                </>
                              ) : (
                                <>
                                  {existing?.documentUrl && <a href={existing.documentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"><Eye size={12} /> View</a>}
                                  <button type="button" onClick={() => fileInputRefs.current[dt.value]?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"><Upload size={12} />{existing ? "Replace" : "Attach"}</button>
                                </>
                              )}
                              <input type="file" ref={(el) => { fileInputRefs.current[dt.value] = el; }} className="hidden" accept="image/*,.pdf,.doc,.docx" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileSelect(dt.value, file); e.target.value = ""; }} />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Submit */}
                <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-6">
                  <div>
                    <p className="text-sm text-gray-600">By submitting, you confirm that all information is accurate and the documents provided are genuine.</p>
                    <p className="mt-1 text-xs text-gray-400">False declarations may result in account suspension under FICA regulations.</p>
                  </div>
                  <button onClick={handleSubmit} disabled={submitting} className="ml-4 inline-flex min-w-[160px] items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                    {submitting ? (<><Loader2 size={16} className="animate-spin" /> Submitting...</>) : (<><ShieldCheck size={16} />{hasSubmitted ? "Resubmit KYC" : "Submit KYC"}</>)}
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}

        {/* ══════════ MANAGER REVIEW VIEW ═══════════════════════ */}
        {view === "review" && isManager && (
          <ManagerReviewView
            ficaQuery={ficaQuery}
            authToken={authToken}
            trpcClient={trpcClient}
            reviewMutation={reviewMutation}
            reviewNotes={reviewNotes}
            setReviewNotes={setReviewNotes}
          />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  Manager Review View — grouped by investor
// ═══════════════════════════════════════════════════════════════

function ManagerReviewView({
  ficaQuery,
  authToken,
  trpcClient,
  reviewMutation,
  reviewNotes,
  setReviewNotes,
}: {
  ficaQuery: any;
  authToken: string | null;
  trpcClient: any;
  reviewMutation: any;
  reviewNotes: Record<number, string>;
  setReviewNotes: (n: Record<number, string>) => void;
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [expandedInvestor, setExpandedInvestor] = useState<number | null>(null);
  const [docActionLoading, setDocActionLoading] = useState<number | null>(null);
  const [filterTab, setFilterTab] = useState<"pending" | "all">("pending");

  const data = ficaQuery.data as any;
  const allInvestors = (data?.investors ?? []) as any[];

  // Filter: investors with pending docs first
  const pendingInvestors = allInvestors.filter((inv: any) => inv.hasPendingDocs);
  const displayInvestors = filterTab === "pending" ? pendingInvestors : allInvestors;

  const handleDocReview = async (docId: number, status: "APPROVED" | "REJECTED") => {
    setDocActionLoading(docId);
    try {
      await trpcClient.reviewKYCDocument.mutate({
        authToken: authToken ?? "",
        documentId: docId,
        status,
        reviewNotes: status === "REJECTED" ? reviewNotes[docId] : undefined,
      });
      toast.success(`Document ${status === "APPROVED" ? "approved" : "rejected"}`);
      ficaQuery.refetch();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to review document");
    } finally {
      setDocActionLoading(null);
    }
  };

  return (
    <div>
      {/* Filter tabs */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => setFilterTab("pending")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${filterTab === "pending" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600"}`}
        >
          Pending Review ({pendingInvestors.length})
        </button>
        <button
          onClick={() => setFilterTab("all")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${filterTab === "all" ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-600"}`}
        >
          All Investors ({allInvestors.length})
        </button>
        <button
          onClick={() => ficaQuery.refetch()}
          className="ml-auto flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200"
        >
          <Loader2 size={14} className={ficaQuery.isFetching ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {ficaQuery.isLoading && (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-blue-500" size={32} />
        </div>
      )}

      {!ficaQuery.isLoading && displayInvestors.length === 0 && (
        <div className="rounded-xl border bg-white py-16 text-center">
          <CheckCircle className="mx-auto mb-3 text-green-500" size={48} />
          <p className="text-lg font-medium text-gray-900">All caught up!</p>
          <p className="text-sm text-gray-400">No investors with pending documents</p>
        </div>
      )}

      {!ficaQuery.isLoading && displayInvestors.length > 0 && (
        <div className="space-y-4">
          {displayInvestors.map((inv: any) => {
            const isExpanded = expandedInvestor === inv.id;
            const pendingCount = inv.kycDocuments?.filter((d: any) => d.status === "PENDING").length ?? 0;

            return (
              <div key={inv.id} className="rounded-xl border bg-white shadow-sm">
                {/* Investor header row */}
                <button
                  onClick={() => setExpandedInvestor(isExpanded ? null : inv.id)}
                  className="flex w-full items-center justify-between p-4 text-left hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${inv.ficaVerified ? "bg-green-100" : inv.hasPendingDocs ? "bg-amber-100" : "bg-gray-100"}`}>
                      {inv.ficaVerified ? <ShieldCheck className="text-green-600" size={20} /> : inv.hasPendingDocs ? <Clock className="text-amber-600" size={20} /> : <User className="text-gray-400" size={20} />}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">{inv.name}</p>
                      <p className="text-xs text-gray-500">{inv.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {inv.kycSubmittedAt && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">KYC Submitted</span>}
                    {pendingCount > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{pendingCount} pending</span>}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${inv.ficaVerified ? "bg-green-100 text-green-700" : inv.ficaRejectedAt ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>
                      {inv.ficaVerified ? "Verified" : inv.ficaRejectedAt ? "Rejected" : "Unverified"}
                    </span>
                    <svg className={`h-5 w-5 text-gray-400 transition ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </button>

                {/* Expanded: personal details + documents */}
                {isExpanded && (
                  <div className="border-t px-4 pb-4 pt-3">
                    {/* Personal Details */}
                    {inv.kycSubmittedAt ? (
                      <div className="mb-4 rounded-lg bg-gray-50 p-4">
                        <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
                          <User size={14} className="text-blue-500" /> Personal Details
                        </h4>
                        <div className="grid gap-2 text-sm sm:grid-cols-2">
                          <div><span className="text-xs text-gray-400">Full Name</span><p className="font-medium text-gray-900">{inv.name ?? "—"}</p></div>
                          <div><span className="text-xs text-gray-400">ID / Passport</span><p className="font-medium text-gray-900">{inv.idNumber ?? "—"}</p></div>
                          <div><span className="text-xs text-gray-400">Date of Birth</span><p className="font-medium text-gray-900">{inv.dateOfBirth ? new Date(inv.dateOfBirth).toLocaleDateString("en-ZA") : "—"}</p></div>
                          <div><span className="text-xs text-gray-400">Contact Number</span><p className="font-medium text-gray-900">{inv.phoneNumber ?? "—"}</p></div>
                          <div className="sm:col-span-2"><span className="text-xs text-gray-400">Address</span><p className="font-medium text-gray-900">{[inv.residentialAddress, inv.city, inv.province, inv.postalCode].filter(Boolean).join(", ") || "—"}</p></div>
                          {inv.taxNumber && <div><span className="text-xs text-gray-400">Tax Number</span><p className="font-medium text-gray-900">{inv.taxNumber}</p></div>}
                          {inv.companyName && <div><span className="text-xs text-gray-400">Company</span><p className="font-medium text-gray-900">{inv.companyName}{inv.companyRegNumber ? ` (${inv.companyRegNumber})` : ""}</p></div>}
                          <div><span className="text-xs text-gray-400">Total Invested</span><p className="font-medium text-gray-900">R{(inv.totalInvested ?? 0).toLocaleString()}</p></div>
                          <div><span className="text-xs text-gray-400">KYC Submitted</span><p className="font-medium text-gray-900">{new Date(inv.kycSubmittedAt).toLocaleDateString("en-ZA")}</p></div>
                        </div>
                      </div>
                    ) : (
                      <div className="mb-4 flex items-center gap-2 rounded-lg bg-gray-50 p-4 text-sm text-gray-400">
                        <AlertTriangle size={14} /> This investor has not submitted their KYC profile yet.
                      </div>
                    )}

                    {/* Documents */}
                    <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
                      <FileText size={14} className="text-blue-500" /> Supporting Documents
                    </h4>
                    {(!inv.kycDocuments || inv.kycDocuments.length === 0) ? (
                      <p className="text-sm text-gray-400">No documents submitted.</p>
                    ) : (
                      <div className="space-y-2">
                        {inv.kycDocuments.map((doc: any) => {
                          const sc = STATUS_CONFIG[doc.status];
                          return (
                            <div key={doc.id} className={`rounded-lg border p-3 ${sc?.bg ?? "border-gray-200 bg-gray-50"}`}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <FileText size={14} className={sc?.color ?? "text-gray-400"} />
                                  <span className="text-sm font-medium text-gray-900">{docLabel(doc.documentType)}</span>
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${sc?.color ?? "text-gray-500"}`}>{sc?.label ?? doc.status}</span>
                                </div>
                                {doc.documentUrl && (
                                  <a href={doc.documentUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100">
                                    <ExternalLink size={12} /> View Document
                                  </a>
                                )}
                              </div>
                              {doc.reviewNotes && <p className="mt-1 text-xs text-gray-500">Notes: {doc.reviewNotes}</p>}

                              {/* Approve/Reject controls for PENDING */}
                              {doc.status === "PENDING" && (
                                <div className="mt-2 flex items-center gap-2 border-t pt-2">
                                  <button
                                    onClick={() => handleDocReview(doc.id, "APPROVED")}
                                    disabled={docActionLoading === doc.id}
                                    className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                                  >
                                    {docActionLoading === doc.id ? <Loader2 size={12} className="animate-spin" /> : <ThumbsUp size={12} />} Approve
                                  </button>
                                  <input
                                    type="text"
                                    value={reviewNotes[doc.id] ?? ""}
                                    onChange={(e) => setReviewNotes({ ...reviewNotes, [doc.id]: e.target.value })}
                                    placeholder="Rejection reason..."
                                    className="flex-1 rounded border px-2 py-1 text-xs focus:border-red-400 focus:outline-none"
                                  />
                                  <button
                                    onClick={() => {
                                      if (!reviewNotes[doc.id]) { toast.error("Add a rejection reason"); return; }
                                      handleDocReview(doc.id, "REJECTED");
                                    }}
                                    disabled={docActionLoading === doc.id}
                                    className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                                  >
                                    {docActionLoading === doc.id ? <Loader2 size={12} className="animate-spin" /> : <ThumbsDown size={12} />} Reject
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Missing docs warning */}
                    {inv.missingDocuments?.length > 0 && (
                      <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        <AlertTriangle size={14} /> Missing required: {inv.missingDocuments.map((d: string) => docLabel(d)).join(", ")}
                      </div>
                    )}
                    {inv.allDocsApproved && (
                      <div className="mt-3 flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
                        <CheckCircle size={14} /> All required documents approved — ready for FICA verification
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────

function FormField({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
    </div>
  );
}

function InfoRow({ label, value, span }: { label: string; value?: string | null; span?: boolean }) {
  return (
    <div className={span ? "sm:col-span-2" : ""}>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-900">{value || "-"}</p>
    </div>
  );
}