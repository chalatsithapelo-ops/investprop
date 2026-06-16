import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import {
  HardHat, FileText, ClipboardList, Receipt, Users, Plus,
  Building, ChevronDown, ChevronUp, CheckCircle, XCircle, Clock, Eye,
  Send, DollarSign, AlertTriangle, Calendar, Phone, Mail, MapPin, Download,
  Star, MessageSquare, BarChart3, Award, TrendingUp, CheckSquare,
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

type Tab = "contractors" | "performance" | "rfqs" | "work-orders" | "invoices";

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
    if (user && !["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER"].includes(user.role)) {
      navigate({ to: "/dashboard" });
    }
  }, [user, authToken, hasHydrated]);

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "contractors", label: "Contractors", icon: Users },
    { key: "performance", label: "Performance", icon: BarChart3 },
    { key: "rfqs", label: "RFQs", icon: FileText },
    { key: "work-orders", label: "Work Orders", icon: ClipboardList },
    { key: "invoices", label: "Invoices", icon: Receipt },
  ];

  if (!user || !authToken) return null;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gold-600 flex items-center gap-3">
              <HardHat className="h-8 w-8" /> Contractor Management
            </h1>
            <p className="mt-1 text-gray-600">Onboard and approve contractors, track KPI performance, send RFQs, issue work orders, and manage invoices</p>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="mb-6 flex flex-wrap gap-1 rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-gold-500 text-white"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "contractors" && <ContractorsTab authToken={authToken} />}
        {activeTab === "performance" && <PerformanceTab authToken={authToken} />}
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
    PENDING: "bg-amber-100 text-amber-700",
    APPROVED: "bg-green-100 text-green-700",
    REJECTED: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-6">
      {/* Pending Approvals — Contractor Onboarding */}
      <div className="space-y-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold text-amber-600">
            <Clock className="h-5 w-5" /> Onboarding &mdash; Pending Approvals ({pendingQuery.data?.length ?? 0})
          </h2>
          <p className="mt-1 text-sm text-gray-600">Review submitted contractor profiles and supporting documents, then approve to onboard or reject with a reason.</p>
        </div>
        {(pendingQuery.data?.length ?? 0) === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <CheckCircle className="mx-auto h-10 w-10 text-green-500 mb-2" />
            <p className="text-gray-600">No contractors awaiting approval. New submissions will appear here for onboarding.</p>
          </div>
        ) : (
          pendingQuery.data?.map((c: any) => (
            <div key={c.id} className="rounded-xl border border-amber-300 bg-amber-50 p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{c.companyName}</h3>
                  {c.tradingAs && <p className="text-sm text-gray-600">t/a {c.tradingAs}</p>}
                  <p className="mt-1 text-sm text-gray-600">{c.user?.name} • {c.user?.email}</p>
                </div>
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">PENDING</span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-700 md:grid-cols-3 lg:grid-cols-4">
                <p className="flex items-center gap-2"><HardHat className="h-3.5 w-3.5 text-gold-600" /> {c.specialty}</p>
                <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-gold-600" /> {c.phone}</p>
                {c.city && <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-gold-600" /> {c.city}{c.province ? `, ${c.province}` : ""}</p>}
                {c.registrationNumber && <p className="text-xs text-gray-600">CIPC: {c.registrationNumber}</p>}
                {c.vatNumber && <p className="text-xs text-gray-600">VAT: {c.vatNumber}</p>}
                {c.beeLevel && <p className="text-xs text-gray-600">BEE Level: {c.beeLevel}</p>}
                {c.cidbGrade && <p className="text-xs text-gray-600">CIDB: {c.cidbGrade}</p>}
                {c.bankName && <p className="text-xs text-gray-600">Bank: {c.bankName}</p>}
              </div>

              {/* Documents */}
              {c.documents?.length > 0 && (
                <div className="mt-3">
                  <p className="mb-2 text-xs font-medium text-gray-600">Supporting Documents ({c.documents.length}):</p>
                  <div className="flex flex-wrap gap-2">
                    {c.documents.map((doc: any) => (
                      <a key={doc.id} href={doc.documentUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:border-gold-500 transition-colors">
                        <FileText className="h-3 w-3 text-gold-600" /> {doc.documentName}
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
                    <input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Rejection reason..." className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 w-64" />
                    <button onClick={() => handleReject(c.id)} className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700">Reject</button>
                    <button onClick={() => { setRejectingId(null); setRejectReason(""); }} className="rounded-lg bg-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-300">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setRejectingId(c.id)} className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors">
                    <XCircle className="h-4 w-4" /> Reject
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* All Contractors List */}
      <div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900">All Contractors</h2>
        {contractorsQuery.isLoading ? (
          <p className="text-gray-600">Loading contractors...</p>
        ) : !contractorsQuery.data?.length ? (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
            <Users className="mx-auto h-12 w-12 text-gray-300 mb-3" />
            <p className="text-gray-500">No contractors registered yet. Contractors will appear here once they submit their profiles.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {contractorsQuery.data.map((c: any) => (
              <div key={c.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{c.companyName}</h3>
                    {c.tradingAs && <p className="text-sm text-gray-600">t/a {c.tradingAs}</p>}
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[c.profileStatus] ?? (c.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700")}`}>
                    {c.profileStatus ?? (c.isActive ? "Active" : "Inactive")}
                  </span>
                </div>
                <div className="mt-3 space-y-1 text-sm text-gray-700">
                  <p className="flex items-center gap-2"><HardHat className="h-3.5 w-3.5 text-gold-600" /> {c.specialty}</p>
                  <p className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-gold-600" /> {c.phone}</p>
                  <p className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-gold-600" /> {c.user.email}</p>
                  {c.city && <p className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 text-gold-600" /> {c.city}, {c.province}</p>}
                  {c.beeLevel && <p className="text-xs text-gray-600">BEE Level: {c.beeLevel}</p>}
                  {c.cidbGrade && <p className="text-xs text-gray-600">CIDB Grade: {c.cidbGrade}</p>}
                </div>
                {c.documents?.length > 0 && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <p className="mb-1.5 text-xs font-medium text-gray-600">Documents ({c.documents.length}):</p>
                    <div className="flex flex-wrap gap-1.5">
                      {c.documents.map((doc: any) => (
                        <a key={doc.id} href={doc.documentUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] text-gray-700 hover:border-gold-500 transition-colors">
                          <FileText className="h-3 w-3 text-gold-600" /> {doc.documentName}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
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
                      documents: (c.documents ?? []).map((d: any) => ({
                        documentName: d.documentName,
                        documentType: d.documentType,
                        documentUrl: d.documentUrl,
                      })),
                      totalEarnings: 0,
                      totalOutstanding: 0,
                    };
                    generateContractorReportPDF(reportData);
                    toast.success("Contractor report PDF downloaded");
                  }}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
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

// ─── Performance / KPI Tab ──────────────────────────────────────

function PerformanceTab({ authToken }: { authToken: string }) {
  const trpc = useTRPC();
  const contractorsQuery = useQuery(trpc.getContractors.queryOptions({ authToken }));
  const workOrdersQuery = useQuery(trpc.getWorkOrders.queryOptions({ authToken }));
  const invoicesQuery = useQuery(trpc.getContractorInvoices.queryOptions({ authToken }));

  const isLoading = contractorsQuery.isLoading || workOrdersQuery.isLoading || invoicesQuery.isLoading;

  // Aggregate KPIs per contractor profile
  const scorecards = useMemo(() => {
    const contractors = contractorsQuery.data ?? [];
    const workOrders = workOrdersQuery.data ?? [];
    const invoices = invoicesQuery.data ?? [];

    return contractors.map((c: any) => {
      const cWOs = workOrders.filter((wo: any) => wo.contractorProfile?.id === c.id);
      const completed = cWOs.filter((wo: any) => wo.status === "COMPLETED");
      const active = cWOs.filter((wo: any) => ["ISSUED", "ACCEPTED", "IN_PROGRESS", "ON_HOLD"].includes(wo.status));

      const rated = completed.filter((wo: any) => typeof wo.completionRating === "number" && wo.completionRating > 0);
      const avgRating = rated.length
        ? rated.reduce((s: number, wo: any) => s + wo.completionRating, 0) / rated.length
        : 0;

      const withDates = completed.filter((wo: any) => wo.actualEndDate && wo.expectedEndDate);
      const onTime = withDates.filter((wo: any) => new Date(wo.actualEndDate) <= new Date(wo.expectedEndDate));
      const onTimePct = withDates.length ? Math.round((onTime.length / withDates.length) * 100) : null;

      const contractValue = cWOs.reduce((s: number, wo: any) => s + (wo.agreedAmount ?? 0), 0);

      const cInvoices = invoices.filter((inv: any) => inv.contractorProfile?.id === c.id);
      const paid = cInvoices.filter((inv: any) => inv.status === "PAID").reduce((s: number, inv: any) => s + (inv.totalAmount ?? 0), 0);
      const outstanding = cInvoices.filter((inv: any) => ["SUBMITTED", "UNDER_REVIEW", "APPROVED"].includes(inv.status)).reduce((s: number, inv: any) => s + (inv.totalAmount ?? 0), 0);

      return {
        id: c.id,
        companyName: c.companyName,
        specialty: c.specialty,
        userName: c.user?.name,
        totalJobs: cWOs.length,
        completedJobs: completed.length,
        activeJobs: active.length,
        avgRating,
        ratedCount: rated.length,
        onTimePct,
        contractValue,
        paid,
        outstanding,
      };
    }).sort((a, b) => b.avgRating - a.avgRating || b.completedJobs - a.completedJobs);
  }, [contractorsQuery.data, workOrdersQuery.data, invoicesQuery.data]);

  // Portfolio-level summary
  const summary = useMemo(() => {
    const totalContractors = scorecards.length;
    const activeContractors = scorecards.filter((s) => s.activeJobs > 0).length;
    const ratedCards = scorecards.filter((s) => s.ratedCount > 0);
    const portfolioRating = ratedCards.length
      ? ratedCards.reduce((s, c) => s + c.avgRating, 0) / ratedCards.length
      : 0;
    const onTimeCards = scorecards.filter((s) => s.onTimePct !== null);
    const portfolioOnTime = onTimeCards.length
      ? Math.round(onTimeCards.reduce((s, c) => s + (c.onTimePct ?? 0), 0) / onTimeCards.length)
      : null;
    const totalPaid = scorecards.reduce((s, c) => s + c.paid, 0);
    return { totalContractors, activeContractors, portfolioRating, portfolioOnTime, totalPaid };
  }, [scorecards]);

  const ratingColor = (r: number) =>
    r >= 4 ? "text-green-600" : r >= 3 ? "text-amber-600" : r > 0 ? "text-red-600" : "text-gray-400";
  const onTimeColor = (p: number | null) =>
    p === null ? "text-gray-400" : p >= 80 ? "text-green-600" : p >= 50 ? "text-amber-600" : "text-red-600";

  if (isLoading) return <p className="text-gray-600">Loading performance data...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold text-gray-900">
          <BarChart3 className="h-5 w-5 text-gold-600" /> Contractor KPI &amp; Performance
        </h2>
        <p className="mt-1 text-sm text-gray-600">Track delivery quality, on-time completion, workload, and payments across your contractor panel.</p>
      </div>

      {/* Portfolio summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-600"><Users className="h-4 w-4 text-gold-600" /><span className="text-xs font-medium">Contractors</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900">{summary.totalContractors}</p>
          <p className="text-xs text-gray-500">{summary.activeContractors} with active jobs</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-600"><Star className="h-4 w-4 text-gold-600" /><span className="text-xs font-medium">Avg Rating</span></div>
          <p className={`mt-2 text-2xl font-bold ${ratingColor(summary.portfolioRating)}`}>{summary.portfolioRating ? summary.portfolioRating.toFixed(1) : "—"}<span className="text-sm font-normal text-gray-400">/5</span></p>
          <p className="text-xs text-gray-500">across rated jobs</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-600"><TrendingUp className="h-4 w-4 text-gold-600" /><span className="text-xs font-medium">On-Time</span></div>
          <p className={`mt-2 text-2xl font-bold ${onTimeColor(summary.portfolioOnTime)}`}>{summary.portfolioOnTime === null ? "—" : `${summary.portfolioOnTime}%`}</p>
          <p className="text-xs text-gray-500">completed on schedule</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-gray-600"><DollarSign className="h-4 w-4 text-gold-600" /><span className="text-xs font-medium">Paid to Date</span></div>
          <p className="mt-2 text-2xl font-bold text-gray-900">R {summary.totalPaid.toLocaleString()}</p>
          <p className="text-xs text-gray-500">total disbursed</p>
        </div>
      </div>

      {/* Per-contractor scorecards */}
      {scorecards.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <BarChart3 className="mx-auto h-12 w-12 text-gray-300 mb-3" />
          <p className="text-gray-500">No contractor performance data yet. KPIs appear once contractors are onboarded and work orders are issued.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-left text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">Contractor</th>
                <th className="px-4 py-3 font-medium text-center">Rating</th>
                <th className="px-4 py-3 font-medium text-center">On-Time</th>
                <th className="px-4 py-3 font-medium text-center">Total Jobs</th>
                <th className="px-4 py-3 font-medium text-center">Completed</th>
                <th className="px-4 py-3 font-medium text-center">Active</th>
                <th className="px-4 py-3 font-medium text-right">Contract Value</th>
                <th className="px-4 py-3 font-medium text-right">Paid</th>
                <th className="px-4 py-3 font-medium text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {scorecards.map((s, idx) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {idx === 0 && s.avgRating > 0 && <Award className="h-4 w-4 text-gold-500" aria-label="Top performer" />}
                      <div>
                        <p className="font-medium text-gray-900">{s.companyName}</p>
                        <p className="text-xs text-gray-500">{s.specialty}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {s.ratedCount > 0 ? (
                      <span className={`inline-flex items-center gap-1 font-semibold ${ratingColor(s.avgRating)}`}>
                        <Star className="h-3.5 w-3.5 fill-current" /> {s.avgRating.toFixed(1)}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-center font-semibold ${onTimeColor(s.onTimePct)}`}>
                    {s.onTimePct === null ? "—" : `${s.onTimePct}%`}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-700">{s.totalJobs}</td>
                  <td className="px-4 py-3 text-center text-gray-700">
                    <span className="inline-flex items-center gap-1"><CheckSquare className="h-3.5 w-3.5 text-green-600" /> {s.completedJobs}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-700">{s.activeJobs}</td>
                  <td className="px-4 py-3 text-right text-gray-700">R {s.contractValue.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-medium text-green-600">R {s.paid.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-amber-600">R {s.outstanding.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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
    OPEN: "bg-blue-100 text-blue-700",
    UNDER_REVIEW: "bg-yellow-100 text-yellow-700",
    AWARDED: "bg-green-100 text-green-700",
    CLOSED: "bg-gray-100 text-gray-600",
    CANCELLED: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Requests for Quotation</h2>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600 transition-colors">
          <Plus className="h-4 w-4" /> Create RFQ
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gold-600 mb-4">New Request for Quotation</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Property *</label>
              <select value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900">
                <option value="">Select property...</option>
                {propertiesQuery.data?.properties?.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.title} — {p.city}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Bathroom Renovation" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Scope of Work *</label>
              <textarea value={form.scopeOfWork} onChange={(e) => setForm({ ...form, scopeOfWork: e.target.value })} rows={4} placeholder="Describe in detail the work required..." className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estimated Budget (R)</label>
              <input type="number" value={form.estimatedBudget} onChange={(e) => setForm({ ...form, estimatedBudget: e.target.value })} placeholder="Optional" className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Deadline *</label>
              <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900" />
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <button onClick={handleCreateRFQ} className="flex items-center gap-2 rounded-lg bg-gold-500 px-6 py-2 text-sm font-medium text-white hover:bg-gold-600 transition-colors">
              <Send className="h-4 w-4" /> Send RFQ
            </button>
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {rfqsQuery.isLoading ? (
        <p className="text-gray-600">Loading RFQs...</p>
      ) : !rfqsQuery.data?.length ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <FileText className="mx-auto h-12 w-12 text-gray-300 mb-3" />
          <p className="text-gray-500">No RFQs created yet. Send one to get contractor quotes.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {rfqsQuery.data.map((rfq: any) => (
            <div key={rfq.id} className="rounded-xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between p-5 cursor-pointer" onClick={() => setExpandedRfq(expandedRfq === rfq.id ? null : rfq.id)}>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-gray-900">{rfq.title}</h3>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[rfq.status] || "bg-gray-100 text-gray-600"}`}>{rfq.status}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-4 text-sm text-gray-600">
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
                    className="rounded-lg border border-gray-300 p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                    title="Download RFQ PDF"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  {expandedRfq === rfq.id ? <ChevronUp className="h-5 w-5 text-gray-500" /> : <ChevronDown className="h-5 w-5 text-gray-500" />}
                </div>
              </div>

              {expandedRfq === rfq.id && (
                <div className="border-t border-gray-200 p-5">
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Scope of Work</h4>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{rfq.scopeOfWork}</p>
                    {rfq.estimatedBudget && <p className="mt-2 text-sm text-gold-600 font-medium">Estimated Budget: R {rfq.estimatedBudget.toLocaleString()}</p>}
                  </div>

                  {rfq.responses.length > 0 ? (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-3">Quotations Received</h4>
                      <div className="space-y-3">
                        {rfq.responses.map((resp: any) => (
                          <div key={resp.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium text-gray-900">{resp.contractorProfile.user.name}</p>
                                <p className="text-lg font-bold text-gold-600">R {resp.quotedAmount.toLocaleString()}</p>
                                {resp.proposedTimeline && <p className="text-sm text-gray-600">Timeline: {resp.proposedTimeline}</p>}
                                {resp.notes && <p className="mt-1 text-sm text-gray-600">{resp.notes}</p>}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                  resp.status === "ACCEPTED" ? "bg-green-100 text-green-700" :
                                  resp.status === "REJECTED" ? "bg-red-100 text-red-700" :
                                  "bg-blue-100 text-blue-700"
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
    ISSUED: "bg-blue-100 text-blue-700",
    ACCEPTED: "bg-cyan-100 text-cyan-700",
    IN_PROGRESS: "bg-yellow-100 text-yellow-700",
    ON_HOLD: "bg-orange-100 text-orange-700",
    COMPLETED: "bg-green-100 text-green-700",
    CANCELLED: "bg-red-100 text-red-700",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900">Work Orders</h2>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600 transition-colors">
          <Plus className="h-4 w-4" /> Issue Work Order
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gold-600 mb-4">Issue Work Order</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Property *</label>
              <select value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900">
                <option value="">Select property...</option>
                {propertiesQuery.data?.properties?.map((p: any) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contractor *</label>
              <select value={form.contractorProfileId} onChange={(e) => setForm({ ...form, contractorProfileId: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900">
                <option value="">Select contractor...</option>
                {contractorsQuery.data?.map((c: any) => <option key={c.id} value={c.id}>{c.companyName} ({c.user.name})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Agreed Amount (R) *</label>
              <input type="number" value={form.agreedAmount} onChange={(e) => setForm({ ...form, agreedAmount: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date *</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expected End Date *</label>
              <input type="date" value={form.expectedEndDate} onChange={(e) => setForm({ ...form, expectedEndDate: e.target.value })} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900" />
            </div>
          </div>
          <div className="mt-6 flex gap-3">
            <button onClick={handleCreateWorkOrder} className="rounded-lg bg-gold-500 px-6 py-2 text-sm font-medium text-white hover:bg-gold-600 transition-colors">Issue Order</button>
            <button onClick={() => setShowForm(false)} className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {workOrdersQuery.isLoading ? (
        <p className="text-gray-600">Loading work orders...</p>
      ) : !workOrdersQuery.data?.length ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <ClipboardList className="mx-auto h-12 w-12 text-gray-300 mb-3" />
          <p className="text-gray-500">No work orders yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {workOrdersQuery.data.map((wo: any) => {
            const isExpanded = expandedWO === wo.id;
            const isRating = ratingWO === wo.id;
            return (
              <div key={wo.id} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                <div className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 cursor-pointer" onClick={() => setExpandedWO(isExpanded ? null : wo.id)}>
                      <div className="flex items-center gap-3">
                        <h3 className="font-semibold text-gray-900">{wo.title}</h3>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[wo.status] || "bg-gray-100 text-gray-600"}`}>{wo.status.replace("_", " ")}</span>
                        {wo.completionRating && (
                          <span className="flex items-center gap-1 text-xs text-gold-600">
                            <Star className="h-3.5 w-3.5 fill-gold-400 text-gold-400" /> {wo.completionRating}/5
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-4 text-sm text-gray-600">
                        <span><Building className="h-3.5 w-3.5 inline mr-1" />{wo.property.title}</span>
                        <span><HardHat className="h-3.5 w-3.5 inline mr-1" />{wo.contractorProfile.user.name}</span>
                        <span><DollarSign className="h-3.5 w-3.5 inline mr-1" />R {wo.agreedAmount.toLocaleString()}</span>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {new Date(wo.startDate).toLocaleDateString("en-ZA")} → {new Date(wo.expectedEndDate).toLocaleDateString("en-ZA")}
                        {wo._count?.invoices > 0 && <span className="ml-3">{wo._count.invoices} invoice{wo._count.invoices !== 1 ? "s" : ""}</span>}
                        {wo._count?.updates > 0 && <span className="ml-3 text-gold-600 font-medium">{wo._count.updates} update{wo._count.updates !== 1 ? "s" : ""}</span>}
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
                        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
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
                  <div className="border-t border-gray-200 bg-gold-50 p-5">
                    <h4 className="mb-3 text-sm font-semibold text-gray-900 flex items-center gap-2"><Star className="h-4 w-4 text-gold-500" /> Rate Contractor's Work</h4>
                    <div className="flex items-center gap-1 mb-3">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <button key={s} onClick={() => setRatingValue(s)} className="p-0.5">
                          <Star className={`h-7 w-7 transition-colors ${s <= ratingValue ? "fill-gold-400 text-gold-400" : "text-gray-300 hover:text-gold-300"}`} />
                        </button>
                      ))}
                      {ratingValue > 0 && <span className="ml-2 text-sm font-medium text-gray-900">{ratingValue}/5</span>}
                    </div>
                    <textarea
                      value={ratingNotes}
                      onChange={(e) => setRatingNotes(e.target.value)}
                      rows={2}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
                      placeholder="Optional notes about the work quality..."
                    />
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => handleRateWorkOrder(wo.id)} className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600">Submit Rating</button>
                      <button onClick={() => { setRatingWO(null); setRatingValue(0); setRatingNotes(""); }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
                    </div>
                  </div>
                )}

                {/* Existing Rating Display */}
                {wo.completionRating && !isRating && isExpanded && (
                  <div className="border-t border-gray-200 bg-gold-50 px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-900">Your Rating:</span>
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
                  <div className="border-t border-gray-200 bg-gray-50 p-5">
                    <h4 className="mb-3 text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-gold-600" /> Contractor Progress Updates
                    </h4>
                    {expandedUpdatesQuery.isLoading ? (
                      <p className="text-sm text-gray-600">Loading updates...</p>
                    ) : !expandedUpdatesQuery.data?.length ? (
                      <p className="text-sm text-gray-500 italic">No progress updates from contractor yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {expandedUpdatesQuery.data.map((u: any) => (
                          <div key={u.id} className="rounded-lg border border-gray-200 bg-white p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-gray-900">{u.submittedBy?.name}</span>
                              <span className="text-xs text-gray-500">{new Date(u.createdAt).toLocaleDateString("en-ZA")} {new Date(u.createdAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}</span>
                            </div>
                            <p className="text-sm text-gray-700">{u.description}</p>
                            {u.imageUrls && Array.isArray(u.imageUrls) && u.imageUrls.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {(u.imageUrls as string[]).map((url: string, i: number) => (
                                  <a key={i} href={url} target="_blank" rel="noreferrer">
                                    <img src={url} alt={`Update photo ${i + 1}`} className="h-20 w-20 rounded-lg object-cover border border-gray-200 hover:opacity-80 transition-opacity" />
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {wo.description && (
                      <div className="mt-4 pt-3 border-t border-gray-200">
                        <h5 className="text-xs font-medium text-gray-500 mb-1">Work Order Description</h5>
                        <p className="text-sm text-gray-700">{wo.description}</p>
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
    SUBMITTED: "bg-blue-100 text-blue-700",
    UNDER_REVIEW: "bg-yellow-100 text-yellow-700",
    APPROVED: "bg-cyan-100 text-cyan-700",
    REJECTED: "bg-red-100 text-red-700",
    PAID: "bg-green-100 text-green-700",
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-gray-900">Contractor Invoices</h2>

      {invoicesQuery.isLoading ? (
        <p className="text-gray-600">Loading invoices...</p>
      ) : !invoicesQuery.data?.length ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center shadow-sm">
          <Receipt className="mx-auto h-12 w-12 text-gray-300 mb-3" />
          <p className="text-gray-500">No invoices submitted yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-left text-gray-600">
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
            <tbody className="divide-y divide-gray-100">
              {invoicesQuery.data.map((inv: any) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3 text-gray-700">{inv.contractorProfile.user.name}</td>
                  <td className="px-4 py-3 text-gray-700">{inv.workOrder.property.title}</td>
                  <td className="px-4 py-3 text-gray-700">R {inv.amount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-700">R {inv.taxAmount.toLocaleString()}</td>
                  <td className="px-4 py-3 font-medium text-gold-600">R {inv.totalAmount.toLocaleString()}</td>
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
                        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
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
