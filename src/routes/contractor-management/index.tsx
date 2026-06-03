import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  HardHat, FileText, ClipboardList, Receipt, Users, Plus,
  Building, ChevronDown, ChevronUp, CheckCircle, XCircle, Clock, Eye,
  Send, DollarSign, AlertTriangle, Calendar, Phone, Mail, MapPin, Download,
  Star, MessageSquare,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";
import { generateWorkOrderPDF, generateInvoicePDF, generateRFQPDF, generateContractorReportPDF } from "~/utils/generate-contractor-pdf";
import type { WorkOrderPDFData, InvoicePDFData, RFQPDFData, ContractorReportPDFData } from "~/utils/generate-contractor-pdf";

export const Route = createFileRoute("/contractor-management/")({
  component: ContractorManagementPage,
});

type Tab = "contractors" | "rfqs" | "work-orders" | "invoices";

function ContractorManagementPage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const [activeTab, setActiveTab] = useState<Tab>("contractors");

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
    if (user && !["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"].includes(user.role)) {
      navigate({ to: "/dashboard" });
    }
  }, [user, authToken, hasHydrated]);

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "contractors", label: "Contractors", icon: Users },
    { key: "rfqs", label: "RFQs", icon: FileText },
    { key: "work-orders", label: "Work Orders", icon: ClipboardList },
    { key: "invoices", label: "Invoices", icon: Receipt },
  ];

  if (!user || !authToken) return null;

  return (
    <div className="min-h-screen bg-navy-950 text-white">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gold-400 flex items-center gap-3">
              <HardHat className="h-8 w-8" /> Contractor Management
            </h1>
            <p className="mt-1 text-gray-400">Review contractor profiles, send RFQs, issue work orders, and manage invoices</p>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="mb-6 flex gap-1 rounded-lg bg-navy-900/50 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-gold-500 text-white"
                  : "text-gray-400 hover:bg-navy-800/50 hover:text-white"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "contractors" && <ContractorsTab authToken={authToken} />}
        {activeTab === "rfqs" && <RFQsTab authToken={authToken} />}
        {activeTab === "work-orders" && <WorkOrdersTab authToken={authToken} />}
        {activeTab === "invoices" && <InvoicesTab authToken={authToken} />}
      </div>
    </div>
  );
}

// ─── Contractors Tab ────────────────────────────────────────────

function ContractorsTab({ authToken }: { authToken: string }) {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [expandedProfile, setExpandedProfile] = useState<number | null>(null);

  const contractorsQuery = useQuery(trpc.getContractors.queryOptions({ authToken }));
  const pendingQuery = useQuery(trpc.getPendingContractorProfiles.queryOptions({ authToken }));

  const handleApprove = async (profileId: number) => {
    try {
      await trpcClient.approveContractorProfile.mutate({ authToken, profileId });
      toast.success("Contractor approved");
      queryClient.invalidateQueries({ queryKey: trpc.getContractors.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.getPendingContractorProfiles.queryKey() });
    } catch (e: any) {
      toast.error(e.message || "Failed to approve");
    }
  };

  const handleReject = async (profileId: number) => {
    if (!rejectReason.trim()) { toast.error("Please provide a rejection reason"); return; }
    try {
      await trpcClient.rejectContractorProfile.mutate({ authToken, profileId, reason: rejectReason });
      toast.success("Contractor rejected");
      setRejectingId(null);
      setRejectReason("");
      queryClient.invalidateQueries({ queryKey: trpc.getContractors.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.getPendingContractorProfiles.queryKey() });
    } catch (e: any) {
      toast.error(e.message || "Failed to reject");
    }
  };

  const statusColors: Record<string, string> = {
    PENDING: "bg-amber-500/20 text-amber-400",
    APPROVED: "bg-green-500/20 text-green-400",
    REJECTED: "bg-red-500/20 text-red-400",
  };

  return (
    <div className="space-y-6">
      {/* Pending Approvals */}
      {(pendingQuery.data?.length ?? 0) > 0 && (
        <div className="space-y-4">
          <h2 className="flex items-center gap-2 text-xl font-semibold text-amber-400">
            <Clock className="h-5 w-5" /> Pending Approvals ({pendingQuery.data?.length})
          </h2>
          {pendingQuery.data?.map((c: any) => (
            <div key={c.id} className="rounded-xl border border-amber-500/30 bg-navy-900/70 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">{c.companyName}</h3>
                  {c.tradingAs && <p className="text-sm text-gray-400">t/a {c.tradingAs}</p>}
                  <p className="mt-1 text-sm text-gray-400">{c.user?.name} • {c.user?.email}</p>
                </div>
                <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-medium text-amber-400">PENDING</span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-300 md:grid-cols-3 lg:grid-cols-4">
                <p className="flex items-center gap-2"><HardHat className="h-3.5 w-3.5 text-gold-400" /> {c.specialty}</p>
                <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-gold-400" /> {c.phone}</p>
                {c.city && <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-gold-400" /> {c.city}{c.province ? `, ${c.province}` : ""}</p>}
                {c.registrationNumber && <p className="text-xs text-gray-400">CIPC: {c.registrationNumber}</p>}
                {c.vatNumber && <p className="text-xs text-gray-400">VAT: {c.vatNumber}</p>}
                {c.beeLevel && <p className="text-xs text-gray-400">BEE Level: {c.beeLevel}</p>}
                {c.cidbGrade && <p className="text-xs text-gray-400">CIDB: {c.cidbGrade}</p>}
                {c.bankName && <p className="text-xs text-gray-400">Bank: {c.bankName}</p>}
              </div>

              {/* Documents */}
              {c.documents?.length > 0 && (
                <div className="mt-3">
                  <p className="mb-2 text-xs font-medium text-gray-400">Supporting Documents ({c.documents.length}):</p>
                  <div className="flex flex-wrap gap-2">
                    {c.documents.map((doc: any) => (
                      <a key={doc.id} href={doc.documentUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg border border-navy-600 bg-navy-800 px-3 py-1.5 text-xs text-gray-300 hover:border-gold-500/50 transition-colors">
                        <FileText className="h-3 w-3 text-gold-400" /> {doc.documentName}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button onClick={() => handleApprove(c.id)} className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors">
                  <CheckCircle className="h-4 w-4" /> Approve
                </button>
                {rejectingId === c.id ? (
                  <div className="flex items-center gap-2">
                    <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Rejection reason..." className="rounded-lg border border-navy-600 bg-navy-800 px-3 py-2 text-sm text-white w-64" />
                    <button onClick={() => handleReject(c.id)} className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700">Reject</button>
                    <button onClick={() => { setRejectingId(null); setRejectReason(""); }} className="rounded-lg bg-navy-700 px-3 py-2 text-sm text-gray-300 hover:bg-navy-600">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setRejectingId(c.id)} className="flex items-center gap-1.5 rounded-lg bg-red-600/80 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors">
                    <XCircle className="h-4 w-4" /> Reject
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* All Contractors List */}
      <div>
        <h2 className="text-xl font-semibold mb-4">All Contractors</h2>
        {contractorsQuery.isLoading ? (
          <p className="text-gray-400">Loading contractors...</p>
        ) : !contractorsQuery.data?.length ? (
          <div className="rounded-xl border border-navy-700 bg-navy-900/50 p-12 text-center">
            <Users className="mx-auto h-12 w-12 text-gray-600 mb-3" />
            <p className="text-gray-400">No contractors registered yet. Contractors will appear here once they submit their profiles.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {contractorsQuery.data.map((c: any) => (
              <div key={c.id} className="rounded-xl border border-navy-700 bg-navy-900/70 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-white">{c.companyName}</h3>
                    {c.tradingAs && <p className="text-sm text-gray-400">t/a {c.tradingAs}</p>}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[c.profileStatus] ?? (c.isActive ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400")}`}>
                    {c.profileStatus ?? (c.isActive ? "Active" : "Inactive")}
                  </span>
                </div>
                <div className="mt-3 space-y-1 text-sm text-gray-300">
                  <p className="flex items-center gap-2"><HardHat className="h-3.5 w-3.5 text-gold-400" /> {c.specialty}</p>
                  <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-gold-400" /> {c.phone}</p>
                  <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-gold-400" /> {c.user.email}</p>
                  {c.city && <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-gold-400" /> {c.city}, {c.province}</p>}
                  {c.beeLevel && <p className="text-xs text-gray-400">BEE Level: {c.beeLevel}</p>}
                  {c.cidbGrade && <p className="text-xs text-gray-400">CIDB Grade: {c.cidbGrade}</p>}
                </div>
                <button
                  onClick={() => {
                    const reportData: ContractorReportPDFData = {
                      companyName: c.companyName,
                      tradingAs: c.tradingAs,
                      userName: c.user?.name ?? "—",
                      email: c.user?.email ?? "—",
                      phone: c.phone,
                      specialty: c.specialty,
                      registrationNumber: c.registrationNumber,
                      vatNumber: c.vatNumber,
                      beeLevel: c.beeLevel,
                      cidbGrade: c.cidbGrade,
                      city: c.city,
                      province: c.province,
                      workOrders: [],
                      invoices: [],
                      totalEarnings: 0,
                      totalOutstanding: 0,
                    };
                    generateContractorReportPDF(reportData);
                    toast.success("Contractor report PDF downloaded");
                  }}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-navy-600 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-navy-800 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" /> Download Report
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── RFQs Tab ───────────────────────────────────────────────────

function RFQsTab({ authToken }: { authToken: string }) {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [expandedRfq, setExpandedRfq] = useState<number | null>(null);
  const [reviewingResponse, setReviewingResponse] = useState<{ id: number; rfqId: number } | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [form, setForm] = useState({
    propertyId: "",
    title: "",
    scopeOfWork: "",
    estimatedBudget: "",
    deadline: "",
  });

  const rfqsQuery = useQuery(trpc.getRFQs.queryOptions({ authToken }));
  const propertiesQuery = useQuery(trpc.getProperties.queryOptions({}));

  const handleCreateRFQ = async () => {
    if (!form.propertyId || !form.title || !form.scopeOfWork || !form.deadline) {
      toast.error("Please fill in all required fields");
      return;
    }
    try {
      await trpcClient.createRFQ.mutate({
        authToken,
        propertyId: Number(form.propertyId),
        title: form.title,
        scopeOfWork: form.scopeOfWork,
        estimatedBudget: form.estimatedBudget ? Number(form.estimatedBudget) : undefined,
        deadline: form.deadline,
      });
      toast.success("RFQ created and sent to contractors");
      setShowForm(false);
      setForm({ propertyId: "", title: "", scopeOfWork: "", estimatedBudget: "", deadline: "" });
      queryClient.invalidateQueries({ queryKey: trpc.getRFQs.queryKey() });
    } catch (e: any) {
      toast.error(e.message || "Failed to create RFQ");
    }
  };

  const handleReviewQuotation = async (responseId: number, status: "ACCEPTED" | "REJECTED") => {
    try {
      await trpcClient.reviewQuotation.mutate({ authToken, responseId, status, reviewNotes: reviewNotes || undefined });
      toast.success(status === "ACCEPTED" ? "Quotation accepted — RFQ awarded!" : "Quotation rejected");
      setReviewingResponse(null);
      setReviewNotes("");
      queryClient.invalidateQueries({ queryKey: trpc.getRFQs.queryKey() });
    } catch (e: any) {
      toast.error(e.message || "Failed to review quotation");
    }
  };

  const statusColors: Record<string, string> = {
    OPEN: "bg-blue-500/20 text-blue-400",
    UNDER_REVIEW: "bg-yellow-500/20 text-yellow-400",
    AWARDED: "bg-green-500/20 text-green-400",
    CLOSED: "bg-gray-500/20 text-gray-400",
    CANCELLED: "bg-red-500/20 text-red-400",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Requests for Quotation</h2>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600 transition-colors">
          <Plus className="h-4 w-4" /> Create RFQ
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-navy-700 bg-navy-900/70 p-6">
          <h3 className="text-lg font-semibold text-gold-400 mb-4">New Request for Quotation</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Property *</label>
              <select value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} className="w-full rounded-lg border border-navy-600 bg-navy-800 px-3 py-2 text-white">
                <option value="">Select property...</option>
                {propertiesQuery.data?.properties?.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.title} — {p.city}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Title *</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Bathroom Renovation" className="w-full rounded-lg border border-navy-600 bg-navy-800 px-3 py-2 text-white" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-1">Scope of Work *</label>
              <textarea value={form.scopeOfWork} onChange={(e) => setForm({ ...form, scopeOfWork: e.target.value })} rows={4} placeholder="Describe in detail the work required..." className="w-full rounded-lg border border-navy-600 bg-navy-800 px-3 py-2 text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Estimated Budget (R)</label>
              <input type="number" value={form.estimatedBudget} onChange={(e) => setForm({ ...form, estimatedBudget: e.target.value })} placeholder="Optional" className="w-full rounded-lg border border-navy-600 bg-navy-800 px-3 py-2 text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Deadline *</label>
              <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className="w-full rounded-lg border border-navy-600 bg-navy-800 px-3 py-2 text-white" />
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <button onClick={handleCreateRFQ} className="flex items-center gap-2 rounded-lg bg-gold-500 px-6 py-2 text-sm font-medium text-white hover:bg-gold-600 transition-colors">
              <Send className="h-4 w-4" /> Send RFQ
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-navy-600 px-6 py-2 text-sm font-medium text-gray-300 hover:bg-navy-800 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {rfqsQuery.isLoading ? (
        <p className="text-gray-400">Loading RFQs...</p>
      ) : !rfqsQuery.data?.length ? (
        <div className="rounded-xl border border-navy-700 bg-navy-900/50 p-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-gray-600 mb-3" />
          <p className="text-gray-400">No RFQs created yet. Send one to get contractor quotes.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {rfqsQuery.data.map((rfq: any) => (
            <div key={rfq.id} className="rounded-xl border border-navy-700 bg-navy-900/70">
              <div className="flex items-center justify-between p-5 cursor-pointer" onClick={() => setExpandedRfq(expandedRfq === rfq.id ? null : rfq.id)}>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-white">{rfq.title}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[rfq.status] || "bg-gray-500/20 text-gray-400"}`}>{rfq.status}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-4 text-sm text-gray-400">
                    <span className="flex items-center gap-1"><Building className="h-3.5 w-3.5" /> {rfq.property.title}</span>
                    <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Deadline: {new Date(rfq.deadline).toLocaleDateString("en-ZA")}</span>
                    <span className="flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> {rfq._count.responses} quote{rfq._count.responses !== 1 ? "s" : ""}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      const pdfData: RFQPDFData = {
                        title: rfq.title,
                        scopeOfWork: rfq.scopeOfWork,
                        estimatedBudget: rfq.estimatedBudget,
                        deadline: rfq.deadline,
                        status: rfq.status,
                        createdAt: rfq.createdAt,
                        property: { title: rfq.property.title, city: rfq.property.city ?? "" },
                        responses: (rfq.responses ?? []).map((r: any) => ({
                          contractor: r.contractorProfile?.user?.name ?? r.contractorProfile?.companyName ?? "—",
                          quotedAmount: r.quotedAmount,
                          proposedTimeline: r.proposedTimeline,
                          status: r.status,
                          notes: r.notes,
                        })),
                      };
                      generateRFQPDF(pdfData);
                      toast.success("RFQ PDF downloaded");
                    }}
                    className="rounded-lg border border-navy-600 p-1.5 text-gray-400 hover:bg-navy-800 hover:text-white transition-colors"
                    title="Download RFQ PDF"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  {expandedRfq === rfq.id ? <ChevronUp className="h-5 w-5 text-gray-400" /> : <ChevronDown className="h-5 w-5 text-gray-400" />}
                </div>
              </div>

              {expandedRfq === rfq.id && (
                <div className="border-t border-navy-700 p-5">
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-300 mb-1">Scope of Work</h4>
                    <p className="text-sm text-gray-400 whitespace-pre-wrap">{rfq.scopeOfWork}</p>
                    {rfq.estimatedBudget && <p className="mt-2 text-sm text-gold-400">Estimated Budget: R {rfq.estimatedBudget.toLocaleString()}</p>}
                  </div>

                  {rfq.responses.length > 0 ? (
                    <div>
                      <h4 className="text-sm font-medium text-gray-300 mb-3">Quotations Received</h4>
                      <div className="space-y-3">
                        {rfq.responses.map((resp: any) => (
                          <div key={resp.id} className="rounded-lg border border-navy-600 bg-navy-800/50 p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-white">{resp.contractorProfile.user.name}</p>
                                <p className="text-lg font-bold text-gold-400">R {resp.quotedAmount.toLocaleString()}</p>
                                {resp.proposedTimeline && <p className="text-sm text-gray-400">Timeline: {resp.proposedTimeline}</p>}
                                {resp.notes && <p className="mt-1 text-sm text-gray-400">{resp.notes}</p>}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                  resp.status === "ACCEPTED" ? "bg-green-500/20 text-green-400" :
                                  resp.status === "REJECTED" ? "bg-red-500/20 text-red-400" :
                                  "bg-blue-500/20 text-blue-400"
                                }`}>{resp.status}</span>
                                {resp.status === "SUBMITTED" && (
                                  <>
                                    <button onClick={() => handleReviewQuotation(resp.id, "ACCEPTED")} className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"><CheckCircle className="h-3.5 w-3.5 inline mr-1" />Accept</button>
                                    <button onClick={() => handleReviewQuotation(resp.id, "REJECTED")} className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"><XCircle className="h-3.5 w-3.5 inline mr-1" />Reject</button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 italic">No quotations received yet</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Work Orders Tab ────────────────────────────────────────────

function WorkOrdersTab({ authToken }: { authToken: string }) {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [expandedWO, setExpandedWO] = useState<number | null>(null);
  const [ratingWO, setRatingWO] = useState<number | null>(null);
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingNotes, setRatingNotes] = useState("");
  const [form, setForm] = useState({
    propertyId: "",
    contractorProfileId: "",
    title: "",
    description: "",
    agreedAmount: "",
    startDate: "",
    expectedEndDate: "",
  });

  const workOrdersQuery = useQuery(trpc.getWorkOrders.queryOptions({ authToken }));
  const propertiesQuery = useQuery(trpc.getProperties.queryOptions({}));
  const contractorsQuery = useQuery(trpc.getContractors.queryOptions({ authToken }));

  const expandedUpdatesQuery = useQuery({
    ...trpc.getWorkOrderUpdates.queryOptions({ authToken, workOrderId: expandedWO ?? 0 }),
    enabled: expandedWO !== null,
  });

  const handleCreateWorkOrder = async () => {
    if (!form.propertyId || !form.contractorProfileId || !form.title || !form.description || !form.agreedAmount || !form.startDate || !form.expectedEndDate) {
      toast.error("Please fill all required fields");
      return;
    }
    try {
      await trpcClient.createWorkOrder.mutate({
        authToken,
        propertyId: Number(form.propertyId),
        contractorProfileId: Number(form.contractorProfileId),
        title: form.title,
        description: form.description,
        agreedAmount: Number(form.agreedAmount),
        startDate: form.startDate,
        expectedEndDate: form.expectedEndDate,
      });
      toast.success("Work order issued");
      setShowForm(false);
      setForm({ propertyId: "", contractorProfileId: "", title: "", description: "", agreedAmount: "", startDate: "", expectedEndDate: "" });
      queryClient.invalidateQueries({ queryKey: trpc.getWorkOrders.queryKey() });
    } catch (e: any) {
      toast.error(e.message || "Failed to create work order");
    }
  };

  const handleStatusChange = async (workOrderId: number, status: string) => {
    try {
      await trpcClient.updateWorkOrderStatus.mutate({ authToken, workOrderId, status: status as any });
      toast.success(`Work order ${status.toLowerCase().replace("_", " ")}`);
      queryClient.invalidateQueries({ queryKey: trpc.getWorkOrders.queryKey() });
    } catch (e: any) {
      toast.error(e.message || "Failed to update status");
    }
  };

  const handleRateWorkOrder = async (workOrderId: number) => {
    if (ratingValue < 1) { toast.error("Please select a rating"); return; }
    try {
      await trpcClient.rateWorkOrder.mutate({ authToken, workOrderId, rating: ratingValue, notes: ratingNotes || undefined });
      toast.success("Work order rated successfully");
      setRatingWO(null);
      setRatingValue(0);
      setRatingNotes("");
      queryClient.invalidateQueries({ queryKey: trpc.getWorkOrders.queryKey() });
    } catch (e: any) {
      toast.error(e.message || "Failed to rate work order");
    }
  };

  const statusColors: Record<string, string> = {
    ISSUED: "bg-blue-500/20 text-blue-400",
    ACCEPTED: "bg-cyan-500/20 text-cyan-400",
    IN_PROGRESS: "bg-yellow-500/20 text-yellow-400",
    ON_HOLD: "bg-orange-500/20 text-orange-400",
    COMPLETED: "bg-green-500/20 text-green-400",
    CANCELLED: "bg-red-500/20 text-red-400",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Work Orders</h2>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600 transition-colors">
          <Plus className="h-4 w-4" /> Issue Work Order
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-navy-700 bg-navy-900/70 p-6">
          <h3 className="text-lg font-semibold text-gold-400 mb-4">Issue Work Order</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Property *</label>
              <select value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} className="w-full rounded-lg border border-navy-600 bg-navy-800 px-3 py-2 text-white">
                <option value="">Select property...</option>
                {propertiesQuery.data?.properties?.map((p: any) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Contractor *</label>
              <select value={form.contractorProfileId} onChange={(e) => setForm({ ...form, contractorProfileId: e.target.value })} className="w-full rounded-lg border border-navy-600 bg-navy-800 px-3 py-2 text-white">
                <option value="">Select contractor...</option>
                {contractorsQuery.data?.map((c: any) => <option key={c.id} value={c.id}>{c.companyName} ({c.user.name})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Title *</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-lg border border-navy-600 bg-navy-800 px-3 py-2 text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Agreed Amount (R) *</label>
              <input type="number" value={form.agreedAmount} onChange={(e) => setForm({ ...form, agreedAmount: e.target.value })} className="w-full rounded-lg border border-navy-600 bg-navy-800 px-3 py-2 text-white" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-1">Description *</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full rounded-lg border border-navy-600 bg-navy-800 px-3 py-2 text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Start Date *</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="w-full rounded-lg border border-navy-600 bg-navy-800 px-3 py-2 text-white" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Expected End Date *</label>
              <input type="date" value={form.expectedEndDate} onChange={(e) => setForm({ ...form, expectedEndDate: e.target.value })} className="w-full rounded-lg border border-navy-600 bg-navy-800 px-3 py-2 text-white" />
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <button onClick={handleCreateWorkOrder} className="rounded-lg bg-gold-500 px-6 py-2 text-sm font-medium text-white hover:bg-gold-600 transition-colors">Issue Order</button>
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-navy-600 px-6 py-2 text-sm font-medium text-gray-300 hover:bg-navy-800 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {workOrdersQuery.isLoading ? (
        <p className="text-gray-400">Loading work orders...</p>
      ) : !workOrdersQuery.data?.length ? (
        <div className="rounded-xl border border-navy-700 bg-navy-900/50 p-12 text-center">
          <ClipboardList className="mx-auto h-12 w-12 text-gray-600 mb-3" />
          <p className="text-gray-400">No work orders yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {workOrdersQuery.data.map((wo: any) => {
            const isExpanded = expandedWO === wo.id;
            const isRating = ratingWO === wo.id;
            return (
              <div key={wo.id} className="rounded-xl border border-navy-700 bg-navy-900/70 overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 cursor-pointer" onClick={() => setExpandedWO(isExpanded ? null : wo.id)}>
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-white">{wo.title}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[wo.status] || "bg-gray-500/20 text-gray-400"}`}>{wo.status.replace("_", " ")}</span>
                        {wo.completionRating && (
                          <span className="flex items-center gap-1 text-xs text-gold-500">
                            <Star className="h-3.5 w-3.5 fill-gold-400 text-gold-400" /> {wo.completionRating}/5
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-4 text-sm text-gray-400">
                        <span><Building className="h-3.5 w-3.5 inline mr-1" />{wo.property.title}</span>
                        <span><HardHat className="h-3.5 w-3.5 inline mr-1" />{wo.contractorProfile.user.name}</span>
                        <span><DollarSign className="h-3.5 w-3.5 inline mr-1" />R {wo.agreedAmount.toLocaleString()}</span>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {new Date(wo.startDate).toLocaleDateString("en-ZA")} → {new Date(wo.expectedEndDate).toLocaleDateString("en-ZA")}
                        {wo._count?.invoices > 0 && <span className="ml-3">{wo._count.invoices} invoice{wo._count.invoices !== 1 ? "s" : ""}</span>}
                        {wo._count?.updates > 0 && <span className="ml-3 text-gold-500 font-medium">{wo._count.updates} update{wo._count.updates !== 1 ? "s" : ""}</span>}
                      </div>
                      {/* Latest progress update preview */}
                      {wo.updates?.[0] && (
                        <div className="mt-2 rounded-lg border border-gold-200 bg-gold-50 p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-gold-700 flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Latest Update</span>
                            <span className="text-xs text-gray-500">{new Date(wo.updates[0].createdAt).toLocaleDateString("en-ZA")} {new Date(wo.updates[0].createdAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                          <p className="text-sm text-black line-clamp-2">{wo.updates[0].description}</p>
                          {wo.updates[0].imageUrls && Array.isArray(wo.updates[0].imageUrls) && wo.updates[0].imageUrls.length > 0 && (
                            <div className="mt-2 flex gap-2">
                              {(wo.updates[0].imageUrls as string[]).slice(0, 3).map((url: string, i: number) => (
                                <a key={i} href={url} target="_blank" rel="noreferrer">
                                  <img src={url} alt={`Photo ${i + 1}`} className="h-12 w-12 rounded object-cover border border-gray-200" />
                                </a>
                              ))}
                              {wo.updates[0].imageUrls.length > 3 && <span className="text-xs text-gray-500 self-end">+{wo.updates[0].imageUrls.length - 3} more</span>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          const pdfData: WorkOrderPDFData = {
                            title: wo.title, description: wo.description ?? "", status: wo.status, agreedAmount: wo.agreedAmount,
                            startDate: wo.startDate, expectedEndDate: wo.expectedEndDate, actualEndDate: wo.actualEndDate, createdAt: wo.createdAt,
                            property: { title: wo.property.title, city: wo.property.city ?? "" },
                            contractor: { companyName: wo.contractorProfile?.companyName ?? "—", userName: wo.contractorProfile?.user?.name ?? "—", phone: wo.contractorProfile?.phone, email: wo.contractorProfile?.user?.email, specialty: wo.contractorProfile?.specialty },
                          };
                          generateWorkOrderPDF(pdfData);
                          toast.success("Work order PDF downloaded");
                        }}
                        className="rounded border border-navy-600 px-2 py-1 text-xs text-gray-300 hover:bg-navy-800"
                        title="Download PDF"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      {wo.status === "IN_PROGRESS" && (
                        <button onClick={() => handleStatusChange(wo.id, "COMPLETED")} className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700">Mark Complete</button>
                      )}
                      {wo.status === "COMPLETED" && !wo.completionRating && (
                        <button onClick={() => { setRatingWO(isRating ? null : wo.id); setRatingValue(0); setRatingNotes(""); }} className="rounded bg-gold-500 px-3 py-1 text-xs font-medium text-white hover:bg-gold-600 flex items-center gap-1">
                          <Star className="h-3 w-3" /> Rate Job
                        </button>
                      )}
                      {["ISSUED", "ACCEPTED", "IN_PROGRESS"].includes(wo.status) && (
                        <button onClick={() => handleStatusChange(wo.id, "ON_HOLD")} className="rounded bg-orange-600 px-3 py-1 text-xs font-medium text-white hover:bg-orange-700">Hold</button>
                      )}
                      {wo.status !== "CANCELLED" && wo.status !== "COMPLETED" && (
                        <button onClick={() => handleStatusChange(wo.id, "CANCELLED")} className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700">Cancel</button>
                      )}
                      <button onClick={() => setExpandedWO(isExpanded ? null : wo.id)} className="rounded border border-gray-300 px-2 py-1 text-black hover:bg-gray-100">
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Rating Form */}
                {isRating && (
                  <div className="border-t border-navy-700 bg-gold-50 p-5">
                    <h4 className="mb-3 text-sm font-semibold text-black flex items-center gap-2"><Star className="h-4 w-4 text-gold-500" /> Rate Contractor's Work</h4>
                    <div className="flex items-center gap-1 mb-3">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button key={s} onClick={() => setRatingValue(s)} className="p-0.5">
                          <Star className={`h-7 w-7 transition-colors ${s <= ratingValue ? "fill-gold-400 text-gold-400" : "text-gray-300 hover:text-gold-300"}`} />
                        </button>
                      ))}
                      {ratingValue > 0 && <span className="ml-2 text-sm font-medium text-black">{ratingValue}/5</span>}
                    </div>
                    <textarea
                      value={ratingNotes}
                      onChange={(e) => setRatingNotes(e.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-navy-600 bg-white px-3 py-2 text-sm text-black"
                      placeholder="Optional notes about the work quality..."
                    />
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => handleRateWorkOrder(wo.id)} className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600">Submit Rating</button>
                      <button onClick={() => { setRatingWO(null); setRatingValue(0); setRatingNotes(""); }} className="rounded-lg border border-navy-600 px-4 py-2 text-sm text-gray-600 hover:bg-navy-800">Cancel</button>
                    </div>
                  </div>
                )}

                {/* Existing Rating Display */}
                {wo.completionRating && !isRating && isExpanded && (
                  <div className="border-t border-navy-700 bg-gold-50 px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-black">Your Rating:</span>
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star key={s} className={`h-4 w-4 ${s <= wo.completionRating ? "fill-gold-400 text-gold-400" : "text-gray-300"}`} />
                        ))}
                      </div>
                      {wo.completionNotes && <span className="ml-2 text-xs text-gray-600 italic">"{wo.completionNotes}"</span>}
                    </div>
                  </div>
                )}

                {/* Expanded: Progress Updates Timeline */}
                {isExpanded && (
                  <div className="border-t border-navy-700 bg-navy-900/30 p-5">
                    <h4 className="mb-3 text-sm font-semibold text-gray-300 flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-gold-400" /> Contractor Progress Updates
                    </h4>
                    {expandedUpdatesQuery.isLoading ? (
                      <p className="text-sm text-gray-400">Loading updates...</p>
                    ) : !expandedUpdatesQuery.data?.length ? (
                      <p className="text-sm text-gray-500 italic">No progress updates from contractor yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {expandedUpdatesQuery.data.map((u: any) => (
                          <div key={u.id} className="rounded-lg border border-navy-600 bg-navy-800/50 p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-white">{u.submittedBy?.name}</span>
                              <span className="text-xs text-gray-400">{new Date(u.createdAt).toLocaleDateString("en-ZA")} {new Date(u.createdAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}</span>
                            </div>
                            <p className="text-sm text-gray-300">{u.description}</p>
                            {u.imageUrls && Array.isArray(u.imageUrls) && u.imageUrls.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {(u.imageUrls as string[]).map((url: string, i: number) => (
                                  <a key={i} href={url} target="_blank" rel="noreferrer">
                                    <img src={url} alt={`Update photo ${i + 1}`} className="h-20 w-20 rounded-lg object-cover border border-navy-600 hover:opacity-80 transition-opacity" />
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {wo.description && (
                      <div className="mt-4 pt-3 border-t border-navy-700">
                        <h5 className="text-xs font-medium text-gray-400 mb-1">Work Order Description</h5>
                        <p className="text-sm text-gray-300">{wo.description}</p>
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

// ─── Invoices Tab ───────────────────────────────────────────────

function InvoicesTab({ authToken }: { authToken: string }) {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();

  const invoicesQuery = useQuery(trpc.getContractorInvoices.queryOptions({ authToken }));

  const handleReviewInvoice = async (invoiceId: number, status: "APPROVED" | "REJECTED" | "PAID") => {
    try {
      await trpcClient.reviewContractorInvoice.mutate({
        authToken,
        invoiceId,
        status,
        paymentReference: status === "PAID" ? `PAY-${Date.now()}` : undefined,
      });
      toast.success(`Invoice ${status.toLowerCase()}`);
      queryClient.invalidateQueries({ queryKey: trpc.getContractorInvoices.queryKey() });
    } catch (e: any) {
      toast.error(e.message || "Failed to review invoice");
    }
  };

  const statusColors: Record<string, string> = {
    SUBMITTED: "bg-blue-500/20 text-blue-400",
    UNDER_REVIEW: "bg-yellow-500/20 text-yellow-400",
    APPROVED: "bg-cyan-500/20 text-cyan-400",
    REJECTED: "bg-red-500/20 text-red-400",
    PAID: "bg-green-500/20 text-green-400",
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Contractor Invoices</h2>

      {invoicesQuery.isLoading ? (
        <p className="text-gray-400">Loading invoices...</p>
      ) : !invoicesQuery.data?.length ? (
        <div className="rounded-xl border border-navy-700 bg-navy-900/50 p-12 text-center">
          <Receipt className="mx-auto h-12 w-12 text-gray-600 mb-3" />
          <p className="text-gray-400">No invoices submitted yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-navy-700">
          <table className="w-full text-sm">
            <thead className="bg-navy-900/80 text-left text-gray-400">
              <tr>
                <th className="px-4 py-3 font-medium">Invoice #</th>
                <th className="px-4 py-3 font-medium">Contractor</th>
                <th className="px-4 py-3 font-medium">Property</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Tax</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-700">
              {invoicesQuery.data.map((inv: any) => (
                <tr key={inv.id} className="bg-navy-900/50 hover:bg-navy-800/50">
                  <td className="px-4 py-3 font-medium text-white">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3 text-gray-300">{inv.contractorProfile.user.name}</td>
                  <td className="px-4 py-3 text-gray-300">{inv.workOrder.property.title}</td>
                  <td className="px-4 py-3 text-gray-300">R {inv.amount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-300">R {inv.taxAmount.toLocaleString()}</td>
                  <td className="px-4 py-3 font-medium text-gold-400">R {inv.totalAmount.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[inv.status]}`}>{inv.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          const pdfData: InvoicePDFData = {
                            invoiceNumber: inv.invoiceNumber,
                            amount: inv.amount,
                            taxAmount: inv.taxAmount,
                            totalAmount: inv.totalAmount,
                            description: inv.description ?? "",
                            status: inv.status,
                            createdAt: inv.createdAt,
                            paymentReference: inv.paymentReference,
                            paidAt: inv.paidAt,
                            contractor: {
                              companyName: inv.contractorProfile?.companyName ?? "—",
                              userName: inv.contractorProfile?.user?.name ?? "—",
                              phone: inv.contractorProfile?.phone,
                              vatNumber: inv.contractorProfile?.vatNumber,
                              registrationNumber: inv.contractorProfile?.registrationNumber,
                              address: inv.contractorProfile?.address,
                              bankName: inv.contractorProfile?.bankName,
                              bankAccountNumber: inv.contractorProfile?.bankAccountNumber,
                              bankBranchCode: inv.contractorProfile?.bankBranchCode,
                            },
                            workOrder: { title: inv.workOrder?.title ?? "—", agreedAmount: inv.workOrder?.agreedAmount ?? 0 },
                            property: { title: inv.workOrder?.property?.title ?? "—", city: inv.workOrder?.property?.city ?? "" },
                          };
                          generateInvoicePDF(pdfData);
                          toast.success("Invoice PDF downloaded");
                        }}
                        className="rounded border border-navy-600 px-2 py-1 text-xs text-gray-300 hover:bg-navy-800"
                        title="Download Invoice PDF"
                      >
                        <Download className="h-3 w-3" />
                      </button>
                      {inv.status === "SUBMITTED" && (
                        <button onClick={() => handleReviewInvoice(inv.id, "APPROVED")} className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700">Approve</button>
                      )}
                      {inv.status === "APPROVED" && (
                        <button onClick={() => handleReviewInvoice(inv.id, "PAID")} className="rounded bg-gold-500 px-2 py-1 text-xs text-white hover:bg-gold-600">Mark Paid</button>
                      )}
                      {["SUBMITTED", "UNDER_REVIEW"].includes(inv.status) && (
                        <button onClick={() => handleReviewInvoice(inv.id, "REJECTED")} className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700">Reject</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
