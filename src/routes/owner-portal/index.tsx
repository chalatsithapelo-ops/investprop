import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import {
  Home,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  Send,
  DollarSign,
  MapPin,
  Building2,
  ArrowLeft,
  Loader2,
  Ban,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/owner-portal/")({
  component: OwnerPortalPage,
});

/* ─── Constants ─── */
const PROPERTY_TYPES = [
  "House",
  "Townhouse",
  "Apartment",
  "Commercial",
  "Industrial",
  "Land",
  "Farm",
  "Other",
];

const PROVINCES = [
  "Gauteng",
  "Western Cape",
  "KwaZulu-Natal",
  "Eastern Cape",
  "Free State",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
];

/* ─── Status helpers ─── */
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  PENDING: { label: "Pending", color: "bg-amber-100 text-amber-700", icon: Clock },
  UNDER_REVIEW: { label: "Under Review", color: "bg-blue-100 text-blue-700", icon: Eye },
  ACCEPTED: { label: "Accepted", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  REJECTED: { label: "Declined", color: "bg-red-100 text-red-700", icon: XCircle },
  WITHDRAWN: { label: "Withdrawn", color: "bg-gray-100 text-gray-600", icon: Ban },
};

/* ─── Main Page ─── */
function OwnerPortalPage() {
  const navigate = useNavigate();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
    if (user && user.role !== "PROPERTY_OWNER") navigate({ to: "/dashboard" });
  }, [user, authToken, hasHydrated]);

  // Fetch my proposals
  const proposalsQuery = useQuery({
    ...trpc.getMySaleProposals.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && user?.role === "PROPERTY_OWNER",
  });

  const proposals = (proposalsQuery.data as any[]) ?? [];

  // Withdraw mutation
  const withdrawMutation = useMutation({
    mutationFn: (proposalId: number) =>
      trpcClient.withdrawSaleProposal.mutate({ authToken: authToken ?? "", proposalId }),
    onSuccess: () => {
      toast.success("Proposal withdrawn");
      queryClient.invalidateQueries({ queryKey: trpc.getMySaleProposals.queryKey() });
    },
    onError: (err: any) => toast.error(err.message ?? "Failed to withdraw"),
  });

  // Stats
  const pending = proposals.filter((p: any) => p.status === "PENDING" || p.status === "UNDER_REVIEW").length;
  const accepted = proposals.filter((p: any) => p.status === "ACCEPTED").length;
  const total = proposals.length;

  if (!user || !authToken) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Owner Portal</h1>
            <p className="mt-1 text-gray-500">
              Submit your property for sale — urgent, investment or standard listing
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-gold-600"
          >
            {showForm ? (
              <>
                <ArrowLeft size={16} /> Back to Listings
              </>
            ) : (
              <>
                <Plus size={16} /> New Sale Proposal
              </>
            )}
          </button>
        </div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-50 p-2.5">
                <Clock className="text-amber-600" size={20} />
              </div>
              <div>
                <p className="text-sm text-gray-500">Pending Review</p>
                <p className="text-2xl font-bold text-gray-900">{pending}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-50 p-2.5">
                <CheckCircle2 className="text-emerald-600" size={20} />
              </div>
              <div>
                <p className="text-sm text-gray-500">Accepted</p>
                <p className="text-2xl font-bold text-gray-900">{accepted}</p>
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-50 p-2.5">
                <Home className="text-blue-600" size={20} />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Proposals</p>
                <p className="text-2xl font-bold text-gray-900">{total}</p>
              </div>
            </div>
          </div>
        </div>

        {showForm ? (
          <SaleProposalForm
            authToken={authToken}
            trpcClient={trpcClient}
            queryClient={queryClient}
            trpc={trpc}
            onComplete={() => setShowForm(false)}
          />
        ) : (
          /* ─── Proposals List ─── */
          <div className="space-y-4">
            {proposalsQuery.isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-gold-500" />
              </div>
            ) : proposals.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white py-16 text-center shadow-sm">
                <Home className="mx-auto mb-3 text-gray-300" size={48} />
                <h3 className="text-lg font-medium text-gray-700">No proposals yet</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Submit your first property sale proposal to get started
                </p>
                <button
                  onClick={() => setShowForm(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600"
                >
                  <Plus size={16} /> New Sale Proposal
                </button>
              </div>
            ) : (
              proposals.map((proposal: any) => {
                const cfg = (STATUS_CONFIG[proposal.status] ?? STATUS_CONFIG.PENDING)!;
                const StatusIcon = cfg.icon;
                return (
                  <div
                    key={proposal.id}
                    className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate text-lg font-semibold text-gray-900">
                            {proposal.title}
                          </h3>
                          {proposal.urgencyLevel === "URGENT" && (
                            <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                              <AlertTriangle size={10} /> URGENT
                            </span>
                          )}
                          {proposal.urgencyLevel === "HIGH" && (
                            <span className="flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">
                              ⚡ HIGH
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <MapPin size={14} /> {proposal.city}, {proposal.province}
                          </span>
                          <span className="flex items-center gap-1">
                            <Building2 size={14} /> {proposal.propertyType}
                          </span>
                          <span className="flex items-center gap-1">
                            <DollarSign size={14} /> R{Number(proposal.askingPrice).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-2 text-sm text-gray-600 line-clamp-2">
                          {proposal.description}
                        </p>
                        <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                          <span>
                            Sale Type:{" "}
                            <span className="font-medium text-gray-600">{proposal.saleType}</span>
                          </span>
                          <span>|</span>
                          <span>
                            Submitted{" "}
                            {new Date(proposal.createdAt).toLocaleDateString("en-ZA")}
                          </span>
                          {proposal.reviewedBy && (
                            <>
                              <span>|</span>
                              <span>
                                Reviewed by {proposal.reviewedBy.name}
                              </span>
                            </>
                          )}
                        </div>
                        {proposal.reviewNotes && (
                          <div className="mt-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
                            <span className="font-medium">Review Notes:</span> {proposal.reviewNotes}
                          </div>
                        )}
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${cfg.color}`}
                        >
                          <StatusIcon size={12} />
                          {cfg.label}
                        </span>
                        {(proposal.status === "PENDING" || proposal.status === "UNDER_REVIEW") && (
                          <button
                            onClick={() => {
                              if (confirm("Are you sure you want to withdraw this proposal?")) {
                                withdrawMutation.mutate(proposal.id);
                              }
                            }}
                            disabled={withdrawMutation.isPending}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100"
                          >
                            Withdraw
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Sale Proposal Form ─── */
function SaleProposalForm({
  authToken,
  trpcClient,
  queryClient,
  trpc,
  onComplete,
}: {
  authToken: string;
  trpcClient: any;
  queryClient: any;
  trpc: any;
  onComplete: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [docs, setDocs] = useState<Array<{ kind: string; url: string; name: string }>>([]);
  const [popiaConsent, setPopiaConsent] = useState(false);
  const [form, setForm] = useState({
    title: "",
    description: "",
    address: "",
    city: "",
    province: "Gauteng",
    propertyType: "House",
    askingPrice: "",
    marketValue: "",
    urgencyLevel: "STANDARD" as "URGENT" | "HIGH" | "STANDARD",
    saleType: "CASH" as "CASH" | "BOND" | "INSTALLMENT",
    engagementType: "OUTRIGHT_SALE" as "OUTRIGHT_SALE" | "JOINT_VENTURE" | "LEASE_BACK" | "DEVELOPMENT_PARTNERSHIP",
    reason: "",
    bedrooms: "",
    bathrooms: "",
    squareMeters: "",
    erfSize: "",
    titleDeedNumber: "",
    erfNumber: "",
    bondStatus: "NONE" as "NONE" | "EXISTING",
    bondOutstanding: "",
    bondBank: "",
    ratesStatus: "CURRENT" as "CURRENT" | "ARREARS",
    ratesArrears: "",
    tenancyStatus: "OWNER_OCCUPIED" as "OWNER_OCCUPIED" | "TENANTED" | "VACANT",
    monthlyRent: "",
    leaseEndDate: "",
    conditionRating: "GOOD" as "EXCELLENT" | "GOOD" | "FAIR" | "NEEDS_RENOVATION" | "DISTRESSED",
    estimatedRenoCost: "",
    coOwners: "",
    contactPhone: "",
    contactEmail: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const uploadOne = async (file: File): Promise<string> => {
    const reader = new FileReader();
    const base64: string = await new Promise((resolve) => {
      reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
      reader.readAsDataURL(file);
    });
    const result = await (trpcClient as any).uploadFile.mutate({
      authToken,
      fileName: file.name,
      fileType: file.type,
      fileBase64: base64,
    });
    return result.publicUrl as string;
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const f of files) {
        try { uploaded.push(await uploadOne(f)); } catch (err: any) { toast.error(`${f.name}: ${err.message ?? "upload failed"}`); }
      }
      setImageUrls((prev) => [...prev, ...uploaded]);
      if (uploaded.length > 0) toast.success(`Uploaded ${uploaded.length} image(s)`);
    } finally { setUploading(false); e.target.value = ""; }
  };

  const handleDocUpload = async (kind: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadOne(file);
      setDocs((prev) => [...prev, { kind, url, name: file.name }]);
      toast.success(`${kind.replace(/_/g, " ")} uploaded`);
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally { setUploading(false); e.target.value = ""; }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!popiaConsent) {
      toast.error("Please accept the POPIA consent before submitting");
      return;
    }
    setSubmitting(true);
    try {
      await (trpcClient as any).submitSaleProposal.mutate({
        authToken,
        title: form.title,
        description: form.description,
        address: form.address,
        city: form.city,
        province: form.province,
        propertyType: form.propertyType,
        askingPrice: Number(form.askingPrice),
        marketValue: form.marketValue ? Number(form.marketValue) : undefined,
        urgencyLevel: form.urgencyLevel,
        saleType: form.saleType,
        engagementType: form.engagementType,
        reason: form.reason || undefined,
        bedrooms: form.bedrooms ? Number(form.bedrooms) : undefined,
        bathrooms: form.bathrooms ? Number(form.bathrooms) : undefined,
        squareMeters: form.squareMeters ? Number(form.squareMeters) : undefined,
        erfSize: form.erfSize ? Number(form.erfSize) : undefined,
        titleDeedNumber: form.titleDeedNumber || undefined,
        erfNumber: form.erfNumber || undefined,
        bondStatus: form.bondStatus,
        bondOutstanding: form.bondStatus === "EXISTING" && form.bondOutstanding ? Number(form.bondOutstanding) : undefined,
        bondBank: form.bondStatus === "EXISTING" ? form.bondBank || undefined : undefined,
        ratesStatus: form.ratesStatus,
        ratesArrears: form.ratesStatus === "ARREARS" && form.ratesArrears ? Number(form.ratesArrears) : undefined,
        tenancyStatus: form.tenancyStatus,
        monthlyRent: form.tenancyStatus === "TENANTED" && form.monthlyRent ? Number(form.monthlyRent) : undefined,
        leaseEndDate: form.tenancyStatus === "TENANTED" && form.leaseEndDate ? form.leaseEndDate : undefined,
        conditionRating: form.conditionRating,
        estimatedRenoCost: form.estimatedRenoCost ? Number(form.estimatedRenoCost) : undefined,
        coOwners: form.coOwners || undefined,
        popiaConsent: true,
        imageUrls,
        documentUrls: docs,
        contactPhone: form.contactPhone || undefined,
        contactEmail: form.contactEmail || undefined,
      });
      toast.success("Sale proposal submitted successfully!");
      queryClient.invalidateQueries({ queryKey: trpc.getMySaleProposals.queryKey() });
      onComplete();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to submit proposal");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";
  const labelClass = "mb-1 block text-sm font-medium text-gray-700";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-6 text-xl font-bold text-gray-900">Submit Property Sale Proposal</h2>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Engagement Type */}
        <div className="rounded-lg border border-gold-200 bg-gold-50/40 p-4">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gold-700">
            How do you want to engage with us?
          </h3>
          <p className="mb-3 text-xs text-gray-500">Choose the option that best describes your goal — you can change this with our team later.</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              { v: "OUTRIGHT_SALE", t: "Outright Sale", d: "Sell your property to us for a lump sum" },
              { v: "JOINT_VENTURE", t: "Joint Venture", d: "Contribute the property as equity into an SPV with us" },
              { v: "LEASE_BACK", t: "Sale & Lease-Back", d: "We buy, you keep using it as a tenant" },
              { v: "DEVELOPMENT_PARTNERSHIP", t: "Development Partnership", d: "Co-develop / improve the property and share returns" },
            ].map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setForm((p) => ({ ...p, engagementType: opt.v as any }))}
                className={`rounded-lg border p-3 text-left text-sm transition ${form.engagementType === opt.v ? "border-gold-500 bg-white shadow" : "border-gray-200 bg-white hover:border-gold-300"}`}
              >
                <div className="font-semibold text-gray-900">{opt.t}</div>
                <div className="mt-0.5 text-xs text-gray-500">{opt.d}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Sale Details */}
        <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
            Sale Details
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass}>
                Urgency Level <span className="text-red-400">*</span>
              </label>
              <select
                name="urgencyLevel"
                value={form.urgencyLevel}
                onChange={handleChange}
                className={inputClass}
              >
                <option value="URGENT">🚨 Urgent — Immediate sale needed</option>
                <option value="HIGH">⚡ High — Within 1-2 months</option>
                <option value="STANDARD">Standard — Normal timeline</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>
                Sale Type <span className="text-red-400">*</span>
              </label>
              <select
                name="saleType"
                value={form.saleType}
                onChange={handleChange}
                className={inputClass}
              >
                <option value="CASH">Cash Sale</option>
                <option value="BOND">Bond Sale</option>
                <option value="INSTALLMENT">Installment Sale</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>
                Asking Price (R) <span className="text-red-400">*</span>
              </label>
              <input
                type="number"
                name="askingPrice"
                value={form.askingPrice}
                onChange={handleChange}
                placeholder="500000"
                required
                className={inputClass}
              />
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Market Value (R)</label>
              <input
                type="number"
                name="marketValue"
                value={form.marketValue}
                onChange={handleChange}
                placeholder="Estimated market value"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Reason for Selling</label>
              <input
                type="text"
                name="reason"
                value={form.reason}
                onChange={handleChange}
                placeholder="e.g. Distressed, relocation, downsizing"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Property Information */}
        <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
            Property Information
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelClass}>
                Title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                name="title"
                value={form.title}
                onChange={handleChange}
                placeholder="e.g. 3-Bedroom House in Sandton"
                required
                className={inputClass}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>
                Description <span className="text-red-400">*</span>
              </label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange as any}
                placeholder="Describe the property, its condition, and any notable features..."
                required
                rows={3}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>
                Property Type <span className="text-red-400">*</span>
              </label>
              <select
                name="propertyType"
                value={form.propertyType}
                onChange={handleChange}
                className={inputClass}
              >
                {PROPERTY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>
                Address <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                name="address"
                value={form.address}
                onChange={handleChange}
                placeholder="Street address"
                required
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>
                City <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                name="city"
                value={form.city}
                onChange={handleChange}
                placeholder="e.g. Johannesburg"
                required
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Province</label>
              <select
                name="province"
                value={form.province}
                onChange={handleChange}
                className={inputClass}
              >
                {PROVINCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Property Details */}
        <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
            Property Details (Optional)
          </h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <label className={labelClass}>Bedrooms</label>
              <input
                type="number"
                name="bedrooms"
                value={form.bedrooms}
                onChange={handleChange}
                placeholder="3"
                min="0"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Bathrooms</label>
              <input
                type="number"
                name="bathrooms"
                value={form.bathrooms}
                onChange={handleChange}
                placeholder="2"
                min="0"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Floor Size (m²)</label>
              <input
                type="number"
                name="squareMeters"
                value={form.squareMeters}
                onChange={handleChange}
                placeholder="150"
                min="0"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Erf Size (m²)</label>
              <input
                type="number"
                name="erfSize"
                value={form.erfSize}
                onChange={handleChange}
                placeholder="500"
                min="0"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Contact Info */}
        <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-500">
            Contact Information (Optional)
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Phone</label>
              <input
                type="tel"
                name="contactPhone"
                value={form.contactPhone}
                onChange={handleChange}
                placeholder="+27 82 123 4567"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                name="contactEmail"
                value={form.contactEmail}
                onChange={handleChange}
                placeholder="your@email.com"
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Legal & Financial Disclosures */}
        <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-4">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-blue-700">
            Legal & Financial Disclosures
          </h3>
          <p className="mb-4 text-xs text-gray-500">
            Accurate disclosures speed up offers and avoid surprises at transfer. All amounts in ZAR.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Title Deed Number</label>
              <input type="text" name="titleDeedNumber" value={form.titleDeedNumber} onChange={handleChange} placeholder="T1234/2020" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Erf / Stand Number</label>
              <input type="text" name="erfNumber" value={form.erfNumber} onChange={handleChange} placeholder="Erf 1234, Sandton Ext 12" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Outstanding Bond</label>
              <select name="bondStatus" value={form.bondStatus} onChange={handleChange} className={inputClass}>
                <option value="NONE">No bond — property is paid up</option>
                <option value="EXISTING">Yes — there is an outstanding bond</option>
              </select>
            </div>
            {form.bondStatus === "EXISTING" && (
              <>
                <div>
                  <label className={labelClass}>Bond Outstanding (R) <span className="text-red-400">*</span></label>
                  <input type="number" name="bondOutstanding" value={form.bondOutstanding} onChange={handleChange} placeholder="450000" className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Bond Holder (Bank)</label>
                  <input type="text" name="bondBank" value={form.bondBank} onChange={handleChange} placeholder="e.g. Standard Bank, ABSA, FNB" className={inputClass} />
                </div>
              </>
            )}
            <div>
              <label className={labelClass}>Municipal Rates Status</label>
              <select name="ratesStatus" value={form.ratesStatus} onChange={handleChange} className={inputClass}>
                <option value="CURRENT">Up to date</option>
                <option value="ARREARS">In arrears</option>
              </select>
            </div>
            {form.ratesStatus === "ARREARS" && (
              <div>
                <label className={labelClass}>Rates Arrears (R) <span className="text-red-400">*</span></label>
                <input type="number" name="ratesArrears" value={form.ratesArrears} onChange={handleChange} placeholder="15000" className={inputClass} />
              </div>
            )}
            <div>
              <label className={labelClass}>Occupancy</label>
              <select name="tenancyStatus" value={form.tenancyStatus} onChange={handleChange} className={inputClass}>
                <option value="OWNER_OCCUPIED">Owner occupied</option>
                <option value="TENANTED">Tenanted (lease in place)</option>
                <option value="VACANT">Vacant</option>
              </select>
            </div>
            {form.tenancyStatus === "TENANTED" && (
              <>
                <div>
                  <label className={labelClass}>Monthly Rent (R) <span className="text-red-400">*</span></label>
                  <input type="number" name="monthlyRent" value={form.monthlyRent} onChange={handleChange} placeholder="12000" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Lease End Date</label>
                  <input type="date" name="leaseEndDate" value={form.leaseEndDate} onChange={handleChange} className={inputClass} />
                </div>
              </>
            )}
            <div>
              <label className={labelClass}>Property Condition</label>
              <select name="conditionRating" value={form.conditionRating} onChange={handleChange} className={inputClass}>
                <option value="EXCELLENT">Excellent — move-in ready</option>
                <option value="GOOD">Good — minor cosmetic work</option>
                <option value="FAIR">Fair — moderate work needed</option>
                <option value="NEEDS_RENOVATION">Needs renovation</option>
                <option value="DISTRESSED">Distressed — major work / damaged</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Estimated Renovation Cost (R)</label>
              <input type="number" name="estimatedRenoCost" value={form.estimatedRenoCost} onChange={handleChange} placeholder="Optional" className={inputClass} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Other Registered Owners</label>
              <input type="text" name="coOwners" value={form.coOwners} onChange={handleChange} placeholder="Full names of all other owners listed on the title deed (if any)" className={inputClass} />
              <p className="mt-1 text-[11px] text-gray-400">If the property has more than one owner, all signatories will need to consent before any deal can proceed.</p>
            </div>
          </div>
        </div>

        {/* Images */}
        <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-500">Property Images</h3>
          <p className="mb-3 text-xs text-gray-500">Add at least 3 photos — exterior, main living area, kitchen. Max 5 MB per image.</p>
          <input type="file" accept="image/*" multiple onChange={handleImageUpload} disabled={uploading} className="text-sm" />
          {imageUrls.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {imageUrls.map((u, i) => (
                <div key={i} className="relative">
                  <img src={u} alt="" className="h-24 w-full rounded-md object-cover" />
                  <button type="button" onClick={() => setImageUrls((p) => p.filter((_, idx) => idx !== i))} className="absolute right-1 top-1 rounded-full bg-red-500 px-2 text-xs font-bold text-white">×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Documents */}
        <div className="rounded-lg border border-gray-100 bg-gray-50/50 p-4">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-gray-500">Supporting Documents</h3>
          <p className="mb-3 text-xs text-gray-500">Upload PDFs / images. Title deed + ID are needed before any offer can be made (FICA / Alienation of Land Act).</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              { kind: "TITLE_DEED", label: "Title Deed", req: true },
              { kind: "ID", label: "ID Document (all owners)", req: true },
              { kind: "RATES_ACCOUNT", label: "Latest Rates Account", req: false },
              { kind: "BOND_STATEMENT", label: "Bond Statement", req: form.bondStatus === "EXISTING" },
              { kind: "LEASE", label: "Lease Agreement", req: form.tenancyStatus === "TENANTED" },
              { kind: "OTHER", label: "Other (valuation, plans, …)", req: false },
            ].map((d) => (
              <div key={d.kind} className="rounded-md border border-dashed border-gray-300 bg-white p-3">
                <label className="text-xs font-medium text-gray-700">
                  {d.label} {d.req && <span className="text-red-400">*</span>}
                </label>
                <input type="file" accept="application/pdf,image/*" onChange={(e) => handleDocUpload(d.kind, e)} disabled={uploading} className="mt-1 block w-full text-xs" />
                {docs.filter((x) => x.kind === d.kind).map((x, i) => (
                  <div key={i} className="mt-2 flex items-center justify-between rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                    <span className="truncate">✓ {x.name}</span>
                    <button type="button" onClick={() => setDocs((p) => p.filter((y) => y !== x))} className="ml-2 text-red-500">×</button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* POPIA Consent */}
        <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
          <label className="flex items-start gap-3 text-sm text-gray-700">
            <input type="checkbox" checked={popiaConsent} onChange={(e) => setPopiaConsent(e.target.checked)} className="mt-1 h-4 w-4" />
            <span>
              <strong>POPIA consent.</strong> I confirm I am authorised to disclose the property and personal information above (including any co-owner or tenant information). I consent to Investprop processing this information solely for the purpose of evaluating the proposal, contacting me, and completing any resulting transaction. I have read the <a href="/privacy" className="text-gold-600 underline">Privacy Notice</a> and understand my rights under the Protection of Personal Information Act 4 of 2013.
            </span>
          </label>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onComplete}
            className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 rounded-lg bg-gold-500 px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-gold-600 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send size={16} />
            )}
            Submit Proposal
          </button>
        </div>
      </form>
    </div>
  );
}
