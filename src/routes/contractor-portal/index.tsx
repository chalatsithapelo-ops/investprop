import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import {
  HardHat, FileText, ClipboardList, Receipt, Upload, Camera, CheckCircle, Plus,
  Clock, Building, X, DollarSign, Send, AlertTriangle,
  Briefcase, BarChart3, Download, User, CalendarClock, ArrowRight,
  TrendingUp, Wallet, Timer, Star, MapPin, Phone, Mail, Shield,
  Pencil, Save, XCircle, ChevronDown, ChevronUp, MessageSquare, Image,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";
import { generateWorkOrderPDF, generateInvoicePDF } from "~/utils/generate-contractor-pdf";
import type { WorkOrderPDFData, InvoicePDFData } from "~/utils/generate-contractor-pdf";

export const Route = createFileRoute("/contractor-portal/")({
  component: ContractorPortalPage,
});

type Tab = "dashboard" | "work-orders" | "rfqs" | "invoices" | "progress" | "profile";

function ContractorPortalPage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
    if (user && user.role !== "CONTRACTOR") {
      if (["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"].includes(user.role)) {
        navigate({ to: "/contractor-management" });
      } else {
        navigate({ to: "/dashboard" });
      }
    }
  }, [user, authToken, hasHydrated]);

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "dashboard", label: "Dashboard", icon: BarChart3 },
    { key: "work-orders", label: "My Work Orders", icon: ClipboardList },
    { key: "rfqs", label: "Available RFQs", icon: FileText },
    { key: "invoices", label: "My Invoices", icon: Receipt },
    { key: "progress", label: "Progress Reports", icon: Upload },
    { key: "profile", label: "My Profile", icon: User },
  ];

  if (!user || !authToken || user.role !== "CONTRACTOR") return null;

  return (
    <div className="min-h-screen bg-navy-950 text-white pb-20 lg:pb-0">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gold-400 flex items-center gap-3">
            <HardHat className="h-8 w-8" /> Contractor Portal
          </h1>
          <p className="mt-1 text-black">Welcome back, {user.name} — manage your work, quotations, and billing</p>
        </div>

        {/* Desktop / tablet tabs */}
        <div className="mb-6 hidden flex-wrap gap-1 rounded-lg bg-navy-900/50 p-1 lg:flex">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-gold-500 text-white"
                  : "text-gray-500 hover:bg-navy-800/50 hover:text-black"
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "dashboard" && <DashboardTab authToken={authToken} onNavigate={setActiveTab} />}
        {activeTab === "work-orders" && <WorkOrdersTab authToken={authToken} />}
        {activeTab === "rfqs" && <RFQsTab authToken={authToken} />}
        {activeTab === "invoices" && <InvoicesTab authToken={authToken} />}
        {activeTab === "progress" && <ProgressTab authToken={authToken} />}
        {activeTab === "profile" && <ProfileTab authToken={authToken} />}
      </div>

      {/* Mobile bottom tab bar — large touch targets, always visible */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-navy-700 bg-navy-900/95 backdrop-blur lg:hidden">
        <div className="mx-auto grid max-w-7xl grid-cols-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                activeTab === tab.key
                  ? "bg-gold-500/20 text-gold-400"
                  : "text-gray-400 hover:text-gold-300"
              }`}
              aria-label={tab.label}
            >
              <tab.icon className="h-5 w-5" />
              <span className="leading-tight">{tab.label.split(" ")[0]}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

// ─── Dashboard Tab ──────────────────────────────────────────────

function DashboardTab({ authToken, onNavigate }: { authToken: string; onNavigate: (tab: Tab) => void }) {
  const trpc = useTRPC();
  const dashboardQuery = useQuery({
    ...trpc.getContractorDashboard.queryOptions({ authToken }),
  });

  if (dashboardQuery.isLoading) return <LoadingSpinner />;
  const data = dashboardQuery.data;

  if (!data || !data.hasProfile) {
    return (
      <div className="rounded-xl border-2 border-dashed border-navy-700 py-16 text-center">
        <HardHat className="mx-auto mb-4 text-black" size={48} />
        <h3 className="text-xl font-semibold text-black">Profile Not Set Up</h3>
        <p className="mt-2 text-black">Go to the <button onClick={() => onNavigate("profile")} className="text-gold-400 underline hover:text-gold-300">My Profile</button> tab to complete your contractor profile and submit it for approval.</p>
      </div>
    );
  }

  const profile = data.profile;
  const stats = data.stats;
  const financials = data.financials;

  // Show pending/rejected banner on dashboard too
  if (profile.profileStatus === "PENDING") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-950/20 p-6">
          <Clock className="h-6 w-6 text-amber-400 flex-shrink-0" />
          <div>
            <p className="text-lg font-semibold text-amber-400">Profile Awaiting Approval</p>
            <p className="text-sm text-black">Your profile has been submitted and is being reviewed by the development manager. You'll be able to access work orders and RFQs once approved.</p>
          </div>
        </div>
      </div>
    );
  }
  if (profile.profileStatus === "REJECTED") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-950/20 p-6">
          <AlertTriangle className="h-6 w-6 text-red-400 flex-shrink-0" />
          <div>
            <p className="text-lg font-semibold text-red-400">Profile Rejected</p>
            <p className="text-sm text-black">Reason: {profile.rejectionReason || "No reason provided"}</p>
            <p className="mt-2 text-sm text-black">Please go to the <button onClick={() => onNavigate("profile")} className="text-gold-400 underline hover:text-gold-300">My Profile</button> tab to update your details and re-submit.</p>
          </div>
        </div>
      </div>
    );
  }

  // Calculate upcoming deadlines (work orders due in next 14 days)
  const now = new Date();
  const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const upcomingDeadlines = data.workOrders
    .filter((wo: any) => ["ACCEPTED", "IN_PROGRESS"].includes(wo.status) && new Date(wo.expectedEndDate) <= twoWeeks)
    .sort((a: any, b: any) => new Date(a.expectedEndDate).getTime() - new Date(b.expectedEndDate).getTime());

  // Orders needing attention (ISSUED = need to accept)
  const pendingAcceptance = data.workOrders.filter((wo: any) => wo.status === "ISSUED");

  // Highest monthly earning for bar chart scaling
  const maxMonthly = Math.max(...(financials.monthlyEarnings.map((m: any) => m.amount)), 1);

  return (
    <div className="space-y-6">
      {/* Welcome & Profile Summary */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-navy-800 bg-gradient-to-br from-navy-900 to-navy-950 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gold-500/20 text-gold-400">
              <HardHat className="h-7 w-7" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-white">{profile.companyName}</h2>
              {profile.tradingAs && <p className="text-sm text-black">t/a {profile.tradingAs}</p>}
              <div className="mt-2 flex flex-wrap gap-3 text-xs text-black">
                <span className="flex items-center gap-1"><Star className="h-3 w-3 text-gold-400" /> {profile.specialty}</span>
                {profile.cidbGrade && <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> CIDB: {profile.cidbGrade}</span>}
                {profile.beeLevel && <span className="flex items-center gap-1">BEE Level {profile.beeLevel}</span>}
                {profile.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {profile.city}{profile.province ? `, ${profile.province}` : ""}</span>}
              </div>
            </div>
          </div>
          {/* Quick actions */}
          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={() => onNavigate("work-orders")} className="flex items-center gap-1.5 rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-black hover:bg-navy-700 transition-colors">
              <ClipboardList className="h-3.5 w-3.5 text-blue-400" /> View Work Orders <ArrowRight className="h-3 w-3" />
            </button>
            <button onClick={() => onNavigate("rfqs")} className="flex items-center gap-1.5 rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-black hover:bg-navy-700 transition-colors">
              <FileText className="h-3.5 w-3.5 text-gold-400" /> Browse RFQs <ArrowRight className="h-3 w-3" />
            </button>
            <button onClick={() => onNavigate("invoices")} className="flex items-center gap-1.5 rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-black hover:bg-navy-700 transition-colors">
              <Receipt className="h-3.5 w-3.5 text-emerald-400" /> Submit Invoice <ArrowRight className="h-3 w-3" />
            </button>
            <button onClick={() => onNavigate("progress")} className="flex items-center gap-1.5 rounded-lg bg-navy-800 px-3 py-2 text-xs font-medium text-black hover:bg-navy-700 transition-colors">
              <Upload className="h-3.5 w-3.5 text-purple-400" /> Report Progress <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Earnings Card */}
        <div className="rounded-xl border border-navy-800 bg-navy-900/50 p-6">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-black uppercase tracking-wider">
            <Wallet className="h-4 w-4 text-emerald-400" /> Earnings Overview
          </h3>
          <p className="mt-4 text-3xl font-bold text-emerald-400">R {stats.totalEarnings.toLocaleString()}</p>
          <p className="text-xs text-black mt-1">Total paid earnings</p>
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between rounded-lg bg-navy-800/50 px-3 py-2">
              <span className="text-xs text-black">Pending Invoices</span>
              <span className="text-sm font-semibold text-orange-400">R {stats.pendingInvoiceAmount.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-navy-800/50 px-3 py-2">
              <span className="text-xs text-black">Active Work Value</span>
              <span className="text-sm font-semibold text-blue-400">R {stats.activeWorkValue.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-navy-800/50 px-3 py-2">
              <span className="text-xs text-black">Total Contract Value</span>
              <span className="text-sm font-semibold text-white">R {stats.totalWorkValue.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Work Performance Metrics */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-6">
        <div className="rounded-xl border border-navy-800 bg-navy-900/50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10">
              <ClipboardList className="h-5 w-5 text-blue-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stats.activeOrders}</p>
              <p className="text-xs text-black">Active Orders</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-navy-800 bg-navy-900/50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
              <CheckCircle className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stats.completedOrders}</p>
              <p className="text-xs text-black">Completed</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-navy-800 bg-navy-900/50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold-500/10">
              <FileText className="h-5 w-5 text-gold-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stats.openRFQs}</p>
              <p className="text-xs text-black">Open RFQs</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-navy-800 bg-navy-900/50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-500/10">
              <Building className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stats.propertiesWorkedOn}</p>
              <p className="text-xs text-black">Properties</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-navy-800 bg-navy-900/50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10">
              <Send className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stats.quotationsSubmitted}</p>
              <p className="text-xs text-black">Quotes Sent</p>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-navy-800 bg-navy-900/50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/10">
              <Receipt className="h-5 w-5 text-rose-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{stats.totalInvoices}</p>
              <p className="text-xs text-black">Invoices</p>
            </div>
          </div>
        </div>
      </div>

      {/* Financial Performance */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Monthly Earnings Chart */}
        <div className="rounded-xl border border-navy-800 bg-navy-900/50 p-6">
          <h3 className="flex items-center gap-2 text-base font-semibold text-emerald-400">
            <TrendingUp className="h-5 w-5" /> Monthly Earnings (Last 6 Months)
          </h3>
          <div className="mt-4 space-y-3">
            {financials.monthlyEarnings.map((m: any) => (
              <div key={m.month} className="flex items-center gap-3">
                <span className="w-16 text-xs text-black text-right">{m.month}</span>
                <div className="relative flex-1 h-6 rounded-full bg-navy-800/50 overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all"
                    style={{ width: `${Math.max((m.amount / maxMonthly) * 100, m.amount > 0 ? 3 : 0)}%` }}
                  />
                </div>
                <span className="w-28 text-right text-xs font-medium text-black">
                  R {m.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Financial KPIs */}
        <div className="rounded-xl border border-navy-800 bg-navy-900/50 p-6">
          <h3 className="flex items-center gap-2 text-base font-semibold text-gold-400">
            <BarChart3 className="h-5 w-5" /> Financial Summary
          </h3>
          <div className="mt-4 space-y-4">
            <div className="rounded-lg bg-navy-800/50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-black">Average Invoice Value</span>
                <span className="text-lg font-bold text-white">R {Math.round(financials.avgInvoiceValue).toLocaleString()}</span>
              </div>
            </div>
            <div className="rounded-lg bg-navy-800/50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-black">Invoice Success Rate</span>
                <span className="text-lg font-bold text-emerald-400">{financials.invoiceSuccessRate.toFixed(0)}%</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-navy-700">
                <div className="h-2 rounded-full bg-emerald-500" style={{ width: `${Math.min(financials.invoiceSuccessRate, 100)}%` }} />
              </div>
              <p className="mt-1 text-xs text-black">{stats.paidInvoiceCount} paid of {stats.totalInvoices} total</p>
            </div>
            <div className="rounded-lg bg-navy-800/50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-black">Quotation Win Rate</span>
                <span className="text-lg font-bold text-gold-400">{financials.winRate.toFixed(0)}%</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-navy-700">
                <div className="h-2 rounded-full bg-gold-500" style={{ width: `${Math.min(financials.winRate, 100)}%` }} />
              </div>
              <p className="mt-1 text-xs text-black">{stats.quotationsAccepted} won of {stats.quotationsSubmitted} submitted</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-navy-800/50 p-3 text-center">
                <p className="text-lg font-bold text-emerald-400">{stats.paidInvoiceCount}</p>
                <p className="text-xs text-black">Paid</p>
              </div>
              <div className="rounded-lg bg-navy-800/50 p-3 text-center">
                <p className="text-lg font-bold text-orange-400">{stats.pendingInvoiceCount}</p>
                <p className="text-xs text-black">Pending</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Required: Pending Acceptance */}
      {pendingAcceptance.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-6">
          <h3 className="flex items-center gap-2 text-base font-semibold text-amber-400">
            <AlertTriangle className="h-5 w-5" /> Action Required — New Work Orders
          </h3>
          <p className="mt-1 text-sm text-black">You have {pendingAcceptance.length} work order{pendingAcceptance.length !== 1 ? "s" : ""} awaiting your acceptance.</p>
          <div className="mt-3 space-y-2">
            {pendingAcceptance.map((wo: any) => (
              <div key={wo.id} className="flex items-center justify-between rounded-lg bg-navy-900/60 p-3">
                <div>
                  <p className="font-medium text-white">{wo.title}</p>
                  <p className="text-xs text-black">{wo.property?.title} • R {wo.agreedAmount.toLocaleString()}</p>
                </div>
                <button onClick={() => onNavigate("work-orders")} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700">
                  Review <ArrowRight className="ml-1 inline h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Deadlines */}
      {upcomingDeadlines.length > 0 && (
        <div className="rounded-xl border border-navy-800 bg-navy-900/50 p-6">
          <h3 className="flex items-center gap-2 text-base font-semibold text-gold-400">
            <CalendarClock className="h-5 w-5" /> Upcoming Deadlines
          </h3>
          <div className="mt-4 space-y-3">
            {upcomingDeadlines.slice(0, 5).map((wo: any) => {
              const dueDate = new Date(wo.expectedEndDate);
              const daysLeft = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              const isUrgent = daysLeft <= 3;
              return (
                <div key={wo.id} className="flex items-center justify-between rounded-lg bg-navy-800/50 p-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${isUrgent ? "bg-red-500/10" : "bg-navy-700"}`}>
                      <Timer className={`h-5 w-5 ${isUrgent ? "text-red-400" : "text-black"}`} />
                    </div>
                    <div>
                      <p className="font-medium text-white">{wo.title}</p>
                      <p className="text-xs text-black">{wo.property?.title} • R {wo.agreedAmount.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${isUrgent ? "text-red-400" : "text-black"}`}>
                      {daysLeft <= 0 ? "Overdue" : `${daysLeft} day${daysLeft !== 1 ? "s" : ""} left`}
                    </p>
                    <p className="text-xs text-black">Due: {dueDate.toLocaleDateString("en-ZA")}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Active Work */}
        <div className="rounded-xl border border-navy-800 bg-navy-900/50 p-6">
          <h3 className="flex items-center gap-2 text-base font-semibold text-blue-400">
            <ClipboardList className="h-5 w-5" /> Active Work
          </h3>
          {data.workOrders.filter((o: any) => ["ACCEPTED", "IN_PROGRESS"].includes(o.status)).length === 0 ? (
            <p className="mt-4 text-sm text-black">No active work orders. Browse available RFQs to find new opportunities.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {data.workOrders
                .filter((o: any) => ["ACCEPTED", "IN_PROGRESS"].includes(o.status))
                .slice(0, 4)
                .map((wo: any) => (
                  <div key={wo.id} className="flex items-center justify-between rounded-lg bg-navy-800/50 p-3">
                    <div>
                      <p className="text-sm font-medium text-white">{wo.title}</p>
                      <p className="text-xs text-black">{wo.property?.title} • R {wo.agreedAmount.toLocaleString()}</p>
                    </div>
                    <StatusBadge status={wo.status} />
                  </div>
                ))}
            </div>
          )}
          {data.workOrders.filter((o: any) => ["ACCEPTED", "IN_PROGRESS"].includes(o.status)).length > 4 && (
            <button onClick={() => onNavigate("work-orders")} className="mt-3 text-xs text-gold-400 hover:text-gold-300">View all work orders →</button>
          )}
        </div>

        {/* Recent Invoices */}
        <div className="rounded-xl border border-navy-800 bg-navy-900/50 p-6">
          <h3 className="flex items-center gap-2 text-base font-semibold text-emerald-400">
            <Receipt className="h-5 w-5" /> Recent Invoices
          </h3>
          {data.recentInvoices.length === 0 ? (
            <p className="mt-4 text-sm text-black">No invoices yet. Submit your first invoice from an active work order.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {data.recentInvoices.slice(0, 5).map((inv: any) => (
                <div key={inv.id} className="flex items-center justify-between rounded-lg bg-navy-800/50 p-3">
                  <div>
                    <p className="text-sm font-medium text-white">{inv.invoiceNumber}</p>
                    <p className="text-xs text-black">{inv.workOrder?.property?.title ?? inv.workOrder?.title ?? ""} • R {inv.totalAmount.toLocaleString()}</p>
                  </div>
                  <StatusBadge status={inv.status} />
                </div>
              ))}
            </div>
          )}
          {data.recentInvoices.length > 5 && (
            <button onClick={() => onNavigate("invoices")} className="mt-3 text-xs text-gold-400 hover:text-gold-300">View all invoices →</button>
          )}
        </div>
      </div>

      {/* Recommendations */}
      <div className="rounded-xl border border-navy-800 bg-navy-900/50 p-6">
        <h3 className="flex items-center gap-2 text-base font-semibold text-gold-400">
          <TrendingUp className="h-5 w-5" /> Recommendations
        </h3>
        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {stats.openRFQs > 0 && (
            <button onClick={() => onNavigate("rfqs")} className="flex items-start gap-3 rounded-lg border border-navy-700 bg-navy-800/30 p-4 text-left hover:border-gold-500/30 transition-colors">
              <FileText className="mt-0.5 h-5 w-5 flex-shrink-0 text-gold-400" />
              <div>
                <p className="text-sm font-medium text-white">New Quotation Opportunities</p>
                <p className="mt-0.5 text-xs text-black">{stats.openRFQs} open RFQ{stats.openRFQs !== 1 ? "s" : ""} available — submit your quotes to win new work.</p>
              </div>
            </button>
          )}
          {data.workOrders.filter((o: any) => ["ACCEPTED", "IN_PROGRESS"].includes(o.status)).length > 0 && data.recentSubmissions?.length === 0 && (
            <button onClick={() => onNavigate("progress")} className="flex items-start gap-3 rounded-lg border border-navy-700 bg-navy-800/30 p-4 text-left hover:border-gold-500/30 transition-colors">
              <Camera className="mt-0.5 h-5 w-5 flex-shrink-0 text-purple-400" />
              <div>
                <p className="text-sm font-medium text-white">Submit Progress Reports</p>
                <p className="mt-0.5 text-xs text-black">Keep your project managers updated with progress photos and descriptions.</p>
              </div>
            </button>
          )}
          {!profile.vatNumber && (
            <button onClick={() => onNavigate("profile")} className="flex items-start gap-3 rounded-lg border border-navy-700 bg-navy-800/30 p-4 text-left hover:border-gold-500/30 transition-colors">
              <Shield className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-400" />
              <div>
                <p className="text-sm font-medium text-white">Complete Your Profile</p>
                <p className="mt-0.5 text-xs text-black">Add your VAT number and banking details for faster invoice processing.</p>
              </div>
            </button>
          )}
          {!profile.bankName && (
            <button onClick={() => onNavigate("profile")} className="flex items-start gap-3 rounded-lg border border-navy-700 bg-navy-800/30 p-4 text-left hover:border-gold-500/30 transition-colors">
              <Wallet className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-400" />
              <div>
                <p className="text-sm font-medium text-white">Add Banking Details</p>
                <p className="mt-0.5 text-xs text-black">Ensure your banking information is up to date for timely payments.</p>
              </div>
            </button>
          )}
          {stats.completedOrders > 0 && stats.activeOrders === 0 && (
            <button onClick={() => onNavigate("rfqs")} className="flex items-start gap-3 rounded-lg border border-navy-700 bg-navy-800/30 p-4 text-left hover:border-gold-500/30 transition-colors">
              <Briefcase className="mt-0.5 h-5 w-5 flex-shrink-0 text-gold-400" />
              <div>
                <p className="text-sm font-medium text-white">Find New Work</p>
                <p className="mt-0.5 text-xs text-black">You have no active orders. Check RFQs for new project opportunities.</p>
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Work Orders Tab ────────────────────────────────────────────

function WorkOrdersTab({ authToken }: { authToken: string }) {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const [expandedWO, setExpandedWO] = useState<number | null>(null);
  const [showUpdateForm, setShowUpdateForm] = useState<number | null>(null);
  const [updateText, setUpdateText] = useState("");
  const [updateImages, setUpdateImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState<number | null>(null);
  const [invoiceForm, setInvoiceForm] = useState({ invoiceNumber: "", amount: "", taxAmount: "0", description: "" });
  // Phase 12 — Variation Orders
  const [showVariationForm, setShowVariationForm] = useState<number | null>(null);
  const [variationForm, setVariationForm] = useState({ title: "", description: "", amountDelta: "", daysDelta: "0" });

  const submitVariation = async (workOrderId: number) => {
    if (!variationForm.title.trim() || variationForm.title.length < 3) {
      toast.error("Provide a short title");
      return;
    }
    if (!variationForm.description.trim() || variationForm.description.length < 10) {
      toast.error("Provide a description (min 10 chars)");
      return;
    }
    try {
      const voNumber = `VO-${workOrderId}-${Date.now().toString(36).toUpperCase()}`;
      await trpcClient.proposeVariation.mutate({
        authToken,
        workOrderId,
        number: voNumber,
        description: `${variationForm.title}\n\n${variationForm.description}`,
        costImpact: parseFloat(variationForm.amountDelta || "0"),
        timeImpactDays: parseInt(variationForm.daysDelta || "0", 10),
      });
      toast.success("Variation order submitted for approval");
      setShowVariationForm(null);
      setVariationForm({ title: "", description: "", amountDelta: "", daysDelta: "0" });
      queryClient.invalidateQueries({ queryKey: trpc.getWorkOrders.queryKey() });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to submit variation");
    }
  };

  const workOrdersQuery = useQuery({
    ...trpc.getWorkOrders.queryOptions({ authToken }),
  });

  const expandedUpdatesQuery = useQuery({
    ...trpc.getWorkOrderUpdates.queryOptions({ authToken, workOrderId: expandedWO ?? 0 }),
    enabled: expandedWO !== null,
  });

  const handleUpdateStatus = async (workOrderId: number, status: "ACCEPTED" | "IN_PROGRESS" | "COMPLETED") => {
    if (status === "COMPLETED" && !confirm("Are you sure this job is complete? This will notify the development manager.")) return;
    try {
      await trpcClient.updateWorkOrderStatus.mutate({ authToken, workOrderId, status });
      const labels: Record<string, string> = { ACCEPTED: "accepted", IN_PROGRESS: "started", COMPLETED: "marked as complete" };
      toast.success(`Work order ${labels[status]}`);
      queryClient.invalidateQueries({ queryKey: trpc.getWorkOrders.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.getContractorDashboard.queryKey() });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update status");
    }
  };

  const handleSubmitUpdate = async (workOrderId: number) => {
    if (!updateText.trim()) { toast.error("Please add a description"); return; }
    try {
      await trpcClient.submitWorkOrderUpdate.mutate({ authToken, workOrderId, description: updateText, imageUrls: updateImages.length > 0 ? updateImages : undefined });
      toast.success("Progress update submitted");
      setShowUpdateForm(null);
      setUpdateText("");
      setUpdateImages([]);
      queryClient.invalidateQueries({ queryKey: trpc.getWorkOrderUpdates.queryKey() });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to submit update");
    }
  };

  const handleUploadPhoto = async (file: File) => {
    setUploading(true);
    try {
      const reader = new FileReader();
      const dataUri = await new Promise<string>((resolve) => { reader.onload = () => resolve(reader.result as string); reader.readAsDataURL(file); });
      const fileBase64 = dataUri.includes(",") ? dataUri.split(",")[1] : dataUri;
      const result = await trpcClient.uploadFile.mutate({ authToken, fileName: file.name, fileType: file.type, fileBase64 });
      setUpdateImages((prev) => [...prev, result.publicUrl]);
    } catch (e: any) {
      toast.error("Failed to upload photo");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmitInvoice = async (workOrderId: number) => {
    if (!invoiceForm.invoiceNumber || !invoiceForm.amount || !invoiceForm.description) { toast.error("Fill in all required fields"); return; }
    try {
      await trpcClient.submitContractorInvoice.mutate({
        authToken,
        workOrderId,
        invoiceNumber: invoiceForm.invoiceNumber,
        amount: Number(invoiceForm.amount),
        taxAmount: Number(invoiceForm.taxAmount) || 0,
        description: invoiceForm.description,
      });
      toast.success("Invoice submitted");
      setShowInvoiceForm(null);
      setInvoiceForm({ invoiceNumber: "", amount: "", taxAmount: "0", description: "" });
      queryClient.invalidateQueries({ queryKey: trpc.getContractorInvoices.queryKey() });
      queryClient.invalidateQueries({ queryKey: trpc.getWorkOrders.queryKey() });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to submit invoice");
    }
  };

  if (workOrdersQuery.isLoading) return <LoadingSpinner />;
  const orders = workOrdersQuery.data ?? [];

  if (orders.length === 0) {
    return <EmptyState icon={ClipboardList} message="No work orders assigned to you yet" />;
  }

  return (
    <div className="space-y-4">
      {orders.map((wo: any) => {
        const isExpanded = expandedWO === wo.id;
        return (
          <div key={wo.id} className="rounded-xl border border-navy-800 bg-navy-900/50 overflow-hidden">
            {/* Header */}
            <div className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 cursor-pointer" onClick={() => setExpandedWO(isExpanded ? null : wo.id)}>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-medium text-black">{wo.title}</h3>
                    <StatusBadge status={wo.status} />
                    {wo.completionRating && (
                      <span className="flex items-center gap-1 text-xs text-gold-500">
                        <Star className="h-3.5 w-3.5 fill-gold-400 text-gold-400" />
                        {wo.completionRating}/5
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-black">{wo.property?.title} — {wo.property?.city}</p>
                  <p className="mt-2 text-sm text-black">{wo.description}</p>
                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-black">
                    <span>Agreed: <span className="text-gold-400 font-medium">R {wo.agreedAmount.toLocaleString()}</span></span>
                    <span>Start: {new Date(wo.startDate).toLocaleDateString()}</span>
                    <span>Due: {new Date(wo.expectedEndDate).toLocaleDateString()}</span>
                    <span>Invoices: {wo._count?.invoices ?? 0}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {wo.status === "ISSUED" && (
                    <button onClick={() => handleUpdateStatus(wo.id, "ACCEPTED")} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
                      Accept
                    </button>
                  )}
                  {wo.status === "ACCEPTED" && (
                    <button onClick={() => handleUpdateStatus(wo.id, "IN_PROGRESS")} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                      Start Work
                    </button>
                  )}
                  {wo.status === "IN_PROGRESS" && (
                    <>
                      <button onClick={() => { setShowUpdateForm(showUpdateForm === wo.id ? null : wo.id); setShowInvoiceForm(null); }} className="rounded-lg bg-accent-600 px-3 py-2 text-sm font-medium text-white hover:bg-accent-700">
                        <Upload className="mr-1 inline h-4 w-4" /> Update Progress
                      </button>
                      <button onClick={() => handleUpdateStatus(wo.id, "COMPLETED")} className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                        <CheckCircle className="mr-1 inline h-4 w-4" /> Mark Complete
                      </button>
                    </>
                  )}
                  {(wo.status === "COMPLETED" || wo.status === "IN_PROGRESS") && (
                    <button onClick={() => { setShowInvoiceForm(showInvoiceForm === wo.id ? null : wo.id); setShowUpdateForm(null); }} className="rounded-lg bg-gold-500 px-3 py-2 text-sm font-medium text-white hover:bg-gold-600">
                      <Receipt className="mr-1 inline h-4 w-4" /> Submit Invoice
                    </button>
                  )}
                  {["ACCEPTED", "IN_PROGRESS"].includes(wo.status) && (
                    <button
                      onClick={() => {
                        setShowVariationForm(showVariationForm === wo.id ? null : wo.id);
                        setShowInvoiceForm(null);
                        setShowUpdateForm(null);
                      }}
                      className="rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700"
                      title="Request a variation order for additional scope or time"
                    >
                      <FileText className="mr-1 inline h-4 w-4" /> Request Variation
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const pdfData: WorkOrderPDFData = {
                        title: wo.title, description: wo.description ?? "", status: wo.status, agreedAmount: wo.agreedAmount,
                        startDate: wo.startDate, expectedEndDate: wo.expectedEndDate, actualEndDate: wo.actualEndDate, createdAt: wo.createdAt,
                        property: { title: wo.property?.title ?? "—", city: wo.property?.city ?? "" },
                        contractor: { companyName: wo.contractorProfile?.companyName ?? "—", userName: wo.contractorProfile?.user?.name ?? "—", phone: wo.contractorProfile?.phone, email: wo.contractorProfile?.user?.email, specialty: wo.contractorProfile?.specialty },
                      };
                      generateWorkOrderPDF(pdfData);
                      toast.success("Work order PDF downloaded");
                    }}
                    className="rounded-lg border border-navy-600 px-3 py-2 text-sm text-black hover:bg-navy-800 transition-colors"
                    title="Download PDF"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button onClick={() => setExpandedWO(isExpanded ? null : wo.id)} className="rounded-lg border border-navy-600 px-2 py-2 text-black hover:bg-navy-800 transition-colors">
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Progress Update Form */}
            {showUpdateForm === wo.id && (
              <div className="border-t border-navy-800 bg-navy-900/30 p-6">
                <h4 className="mb-3 text-sm font-semibold text-gold-400 flex items-center gap-2"><MessageSquare className="h-4 w-4" /> Post Progress Update</h4>
                <textarea
                  value={updateText}
                  onChange={(e) => setUpdateText(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-navy-600 bg-white px-3 py-2 text-sm text-black"
                  placeholder="Describe work completed, current progress, any issues..."
                />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-navy-600 bg-white px-3 py-2 text-xs text-black hover:border-gold-500 transition-colors">
                    <Camera className="h-4 w-4" /> Add Photos
                    <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { Array.from(e.target.files || []).forEach(handleUploadPhoto); e.target.value = ""; }} />
                  </label>
                  {uploading && <span className="text-xs text-gold-400">Uploading...</span>}
                  {updateImages.map((url, i) => (
                    <div key={i} className="relative">
                      <img src={url} alt="" className="h-12 w-12 rounded-lg object-cover border border-navy-600" />
                      <button onClick={() => setUpdateImages(prev => prev.filter((_, j) => j !== i))} className="absolute -right-1 -top-1 rounded-full bg-red-500 p-0.5 text-white"><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => handleSubmitUpdate(wo.id)} className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700">
                    <Send className="mr-1 inline h-4 w-4" /> Submit Update
                  </button>
                  <button onClick={() => { setShowUpdateForm(null); setUpdateText(""); setUpdateImages([]); }} className="rounded-lg bg-navy-700 px-4 py-2 text-sm text-black hover:bg-navy-600">Cancel</button>
                </div>
              </div>
            )}

            {/* Variation Order Form (Phase 12) */}
            {showVariationForm === wo.id && (
              <div className="border-t border-navy-800 bg-purple-50 p-6">
                <h4 className="mb-3 text-sm font-semibold text-purple-700 flex items-center gap-2">
                  <FileText className="h-4 w-4" /> Request Variation Order for: {wo.title}
                </h4>
                <p className="mb-3 text-xs text-purple-700">
                  Use this to request additional scope, time, or cost. The development manager will review and approve or reject.
                </p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label htmlFor={`vo-title-${wo.id}`} className="mb-1 block text-xs text-gray-700">Title *</label>
                    <input
                      id={`vo-title-${wo.id}`}
                      type="text"
                      value={variationForm.title}
                      onChange={(e) => setVariationForm({ ...variationForm, title: e.target.value })}
                      className="w-full rounded-lg border border-purple-300 bg-white px-3 py-2 text-sm text-black"
                      placeholder="e.g. Additional plastering in bedroom 2"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label htmlFor={`vo-desc-${wo.id}`} className="mb-1 block text-xs text-gray-700">Description *</label>
                    <textarea
                      id={`vo-desc-${wo.id}`}
                      rows={3}
                      value={variationForm.description}
                      onChange={(e) => setVariationForm({ ...variationForm, description: e.target.value })}
                      className="w-full rounded-lg border border-purple-300 bg-white px-3 py-2 text-sm text-black"
                      placeholder="Explain the change and why it's needed"
                    />
                  </div>
                  <div>
                    <label htmlFor={`vo-amount-${wo.id}`} className="mb-1 block text-xs text-gray-700">Cost change (R) — can be negative</label>
                    <input
                      id={`vo-amount-${wo.id}`}
                      type="number"
                      step="0.01"
                      value={variationForm.amountDelta}
                      onChange={(e) => setVariationForm({ ...variationForm, amountDelta: e.target.value })}
                      className="w-full rounded-lg border border-purple-300 bg-white px-3 py-2 text-sm text-black"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label htmlFor={`vo-days-${wo.id}`} className="mb-1 block text-xs text-gray-700">Time change (days)</label>
                    <input
                      id={`vo-days-${wo.id}`}
                      type="number"
                      value={variationForm.daysDelta}
                      onChange={(e) => setVariationForm({ ...variationForm, daysDelta: e.target.value })}
                      className="w-full rounded-lg border border-purple-300 bg-white px-3 py-2 text-sm text-black"
                      placeholder="0"
                    />
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={() => submitVariation(wo.id)}
                    className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700"
                  >
                    Submit for approval
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowVariationForm(null)}
                    className="rounded-lg border border-purple-300 bg-white px-4 py-2 text-sm text-purple-700 hover:bg-purple-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Invoice Form */}
            {showInvoiceForm === wo.id && (
              <div className="border-t border-navy-800 bg-navy-900/30 p-6">
                <h4 className="mb-3 text-sm font-semibold text-gold-400 flex items-center gap-2"><Receipt className="h-4 w-4" /> Submit Invoice for: {wo.title}</h4>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs text-black">Invoice Number *</label>
                    <input type="text" value={invoiceForm.invoiceNumber} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceNumber: e.target.value })} className="w-full rounded-lg border border-navy-600 bg-white px-3 py-2 text-sm text-black" placeholder="INV-001" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-black">Amount (excl. VAT) *</label>
                    <input type="number" value={invoiceForm.amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })} className="w-full rounded-lg border border-navy-600 bg-white px-3 py-2 text-sm text-black" placeholder="50000" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-black">VAT Amount</label>
                    <input type="number" value={invoiceForm.taxAmount} onChange={(e) => setInvoiceForm({ ...invoiceForm, taxAmount: e.target.value })} className="w-full rounded-lg border border-navy-600 bg-white px-3 py-2 text-sm text-black" placeholder="7500" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-black">Total</label>
                    <p className="rounded-lg border border-navy-600 bg-navy-900/50 px-3 py-2 text-sm font-medium text-gold-400">R {(Number(invoiceForm.amount || 0) + Number(invoiceForm.taxAmount || 0)).toLocaleString()}</p>
                  </div>
                  <div className="md:col-span-2">
                    <label className="mb-1 block text-xs text-black">Description *</label>
                    <textarea value={invoiceForm.description} onChange={(e) => setInvoiceForm({ ...invoiceForm, description: e.target.value })} rows={2} className="w-full rounded-lg border border-navy-600 bg-white px-3 py-2 text-sm text-black" placeholder="Invoice for painting phase 1..." />
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button onClick={() => handleSubmitInvoice(wo.id)} className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600">Submit Invoice</button>
                  <button onClick={() => { setShowInvoiceForm(null); setInvoiceForm({ invoiceNumber: "", amount: "", taxAmount: "0", description: "" }); }} className="rounded-lg bg-navy-700 px-4 py-2 text-sm text-black hover:bg-navy-600">Cancel</button>
                </div>
              </div>
            )}

            {/* Expanded: Progress Updates Timeline */}
            {isExpanded && (
              <div className="border-t border-navy-800 bg-navy-900/20 p-6">
                <h4 className="mb-4 text-sm font-semibold text-black flex items-center gap-2"><MessageSquare className="h-4 w-4 text-gold-400" /> Progress Updates</h4>
                {expandedUpdatesQuery.isLoading ? (
                  <p className="text-sm text-black">Loading updates...</p>
                ) : !expandedUpdatesQuery.data?.length ? (
                  <p className="text-sm text-black italic">No progress updates yet. {wo.status === "IN_PROGRESS" && "Click \"Update Progress\" to post your first update."}</p>
                ) : (
                  <div className="space-y-4">
                    {expandedUpdatesQuery.data.map((u: any) => (
                      <div key={u.id} className="rounded-lg border border-navy-700 bg-white p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-black">{u.submittedBy?.name}</span>
                          <span className="text-xs text-black">{new Date(u.createdAt).toLocaleDateString("en-ZA")} {new Date(u.createdAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                        <p className="text-sm text-black">{u.description}</p>
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

                {/* Show rating if work order has been rated */}
                {wo.completionRating && (
                  <div className="mt-4 rounded-lg border border-gold-200 bg-gold-50 p-4">
                    <h5 className="text-sm font-semibold text-black flex items-center gap-2">
                      <Star className="h-4 w-4 fill-gold-400 text-gold-400" /> Manager's Rating
                    </h5>
                    <div className="mt-1 flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star key={s} className={`h-5 w-5 ${s <= wo.completionRating ? "fill-gold-400 text-gold-400" : "text-gray-300"}`} />
                      ))}
                      <span className="ml-2 text-sm font-medium text-black">{wo.completionRating}/5</span>
                    </div>
                    {wo.completionNotes && <p className="mt-2 text-sm text-black italic">"{wo.completionNotes}"</p>}
                  </div>
                )}

                {/* Variation Order History (Phase 12) */}
                <div className="mt-6">
                  <h5 className="mb-3 text-sm font-semibold text-black flex items-center gap-2">
                    <FileText className="h-4 w-4 text-purple-500" /> Variation Orders
                    {wo.variations?.length ? (
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                        {wo.variations.length}
                      </span>
                    ) : null}
                  </h5>
                  {!wo.variations?.length ? (
                    <p className="text-sm text-black italic">
                      No variation orders. Use "Request Variation" if scope or time needs to change.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {wo.variations.map((vo: any) => {
                        const statusColor =
                          vo.status === "APPROVED"
                            ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                            : vo.status === "REJECTED"
                              ? "bg-red-100 text-red-700 border-red-200"
                              : vo.status === "WITHDRAWN"
                                ? "bg-gray-100 text-gray-600 border-gray-200"
                                : "bg-amber-100 text-amber-700 border-amber-200";
                        const sign = vo.costImpact >= 0 ? "+" : "−";
                        return (
                          <div key={vo.id} className="rounded-lg border border-purple-200 bg-white p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-black">VO {vo.number}</span>
                                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusColor}`}>
                                    {vo.status}
                                  </span>
                                </div>
                                <p className="mt-1 whitespace-pre-line text-xs text-gray-700">{vo.description}</p>
                                <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600">
                                  <span>Cost: <strong className={vo.costImpact >= 0 ? "text-red-600" : "text-emerald-600"}>{sign} R {Math.abs(vo.costImpact).toLocaleString()}</strong></span>
                                  <span>Time: <strong>{vo.timeImpactDays >= 0 ? "+" : ""}{vo.timeImpactDays} days</strong></span>
                                  <span>Proposed by {vo.proposedBy?.name ?? "—"}</span>
                                  <span>{new Date(vo.createdAt).toLocaleDateString("en-ZA")}</span>
                                </div>
                                {vo.status === "APPROVED" && vo.approvedBy && (
                                  <p className="mt-1 text-xs text-emerald-700">
                                    Approved by {vo.approvedBy.name} on {new Date(vo.approvedAt).toLocaleDateString("en-ZA")}
                                  </p>
                                )}
                                {vo.status === "REJECTED" && (
                                  <p className="mt-1 text-xs text-red-700">
                                    Rejected{vo.approvedBy ? ` by ${vo.approvedBy.name}` : ""}{vo.rejectionReason ? ` — ${vo.rejectionReason}` : ""}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── RFQs Tab (Submit Quotation) ────────────────────────────────

function RFQsTab({ authToken }: { authToken: string }) {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const [expandedRFQ, setExpandedRFQ] = useState<number | null>(null);
  const [quoteForm, setQuoteForm] = useState({ quotedAmount: "", proposedTimeline: "", notes: "" });
  const [quoteFiles, setQuoteFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const rfqsQuery = useQuery({
    ...trpc.getRFQs.queryOptions({ authToken }),
  });

  const uploadQuoteFile = async (file: File): Promise<string> => {
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
    return result.publicUrl;
  };

  const handleSubmitQuote = async (rfqId: number) => {
    if (!quoteForm.quotedAmount) { toast.error("Enter a quoted amount"); return; }
    try {
      setUploading(true);
      const attachmentUrls: string[] = [];
      for (const file of quoteFiles) {
        const url = await uploadQuoteFile(file);
        attachmentUrls.push(url);
      }
      await trpcClient.submitQuotation.mutate({
        authToken,
        rfqId,
        quotedAmount: Number(quoteForm.quotedAmount),
        proposedTimeline: quoteForm.proposedTimeline || undefined,
        notes: quoteForm.notes || undefined,
        attachmentUrls: attachmentUrls.length > 0 ? attachmentUrls : undefined,
      });
      toast.success("Quotation submitted successfully");
      setExpandedRFQ(null);
      setQuoteForm({ quotedAmount: "", proposedTimeline: "", notes: "" });
      setQuoteFiles([]);
      queryClient.invalidateQueries({ queryKey: trpc.getRFQs.queryKey() });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to submit quotation");
    } finally {
      setUploading(false);
    }
  };

  if (rfqsQuery.isLoading) return <LoadingSpinner />;
  const rfqs = rfqsQuery.data ?? [];

  if (rfqs.length === 0) {
    return <EmptyState icon={FileText} message="No open RFQs available at the moment" />;
  }

  return (
    <div className="space-y-4">
      {rfqs.map((rfq: any) => {
        const alreadyQuoted = rfq.responses?.some((r: any) => r.status !== "WITHDRAWN");
        return (
          <div key={rfq.id} className="rounded-xl border border-navy-800 bg-navy-900/50 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-medium text-white">{rfq.title}</h3>
                  <StatusBadge status={rfq.status} />
                </div>
                <p className="mt-1 text-sm text-black">{rfq.property?.title} — {rfq.property?.city}</p>
                <p className="mt-2 text-sm text-black">{rfq.scopeOfWork}</p>
                <div className="mt-3 flex flex-wrap gap-4 text-xs text-black">
                  {rfq.estimatedBudget && <span>Budget: R {rfq.estimatedBudget.toLocaleString()}</span>}
                  <span>Deadline: {new Date(rfq.deadline).toLocaleDateString()}</span>
                  <span>Responses: {rfq._count?.responses ?? 0}</span>
                </div>

                {/* RFQ Images */}
                {Array.isArray(rfq.imageUrls) && rfq.imageUrls.length > 0 && (
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {(rfq.imageUrls as string[]).map((url: string, i: number) => (
                      <img key={i} src={url} alt={`Scope ${i + 1}`} className="h-20 w-20 rounded-lg object-cover border border-navy-700" />
                    ))}
                  </div>
                )}
              </div>

              {rfq.status === "OPEN" && !alreadyQuoted && (
                <button
                  onClick={() => setExpandedRFQ(expandedRFQ === rfq.id ? null : rfq.id)}
                  className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-navy-950 hover:bg-gold-400"
                >
                  <Send className="mr-1 inline h-4 w-4" /> Submit Quote
                </button>
              )}
              {alreadyQuoted && (
                <span className="rounded-full bg-green-900/30 px-3 py-1 text-xs font-medium text-green-400">Quote Submitted</span>
              )}
            </div>

            {/* Quote Form */}
            {expandedRFQ === rfq.id && (
              <div className="mt-4 rounded-lg border border-navy-700 bg-navy-800/50 p-4">
                <h4 className="mb-3 text-sm font-semibold text-gold-400">Your Quotation</h4>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs text-black">Quoted Amount (R) *</label>
                    <input type="number" value={quoteForm.quotedAmount} onChange={(e) => setQuoteForm({ ...quoteForm, quotedAmount: e.target.value })} className="w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-black" placeholder="150000" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-black">Proposed Timeline</label>
                    <input type="text" value={quoteForm.proposedTimeline} onChange={(e) => setQuoteForm({ ...quoteForm, proposedTimeline: e.target.value })} className="w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-black" placeholder="e.g. 6 weeks" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-black">Notes</label>
                    <input type="text" value={quoteForm.notes} onChange={(e) => setQuoteForm({ ...quoteForm, notes: e.target.value })} className="w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-black" placeholder="Additional notes..." />
                  </div>
                </div>
                {/* Quotation Document Upload */}
                <div className="mt-4">
                  <label className="mb-1 block text-xs text-black">Official Quotation Document</label>
                  <div className="flex items-center gap-3">
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-navy-600 bg-navy-900/50 px-4 py-2 text-sm text-black hover:border-gold-500 hover:text-gold-400 transition-colors">
                      <Upload className="h-4 w-4" />
                      <span>Upload Document</span>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 10 * 1024 * 1024) {
                              toast.error("File must be under 10MB");
                              return;
                            }
                            setQuoteFiles((prev) => [...prev, file]);
                          }
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <span className="text-xs text-black">PDF, Word, Excel, or Image (max 10MB)</span>
                  </div>
                  {quoteFiles.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {quoteFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center gap-2 rounded-lg bg-navy-900/50 px-3 py-1.5 text-sm">
                          <FileText className="h-4 w-4 text-gold-400" />
                          <span className="flex-1 truncate text-black">{file.name}</span>
                          <span className="text-xs text-black">{(file.size / 1024).toFixed(0)} KB</span>
                          <button
                            onClick={() => setQuoteFiles((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-black hover:text-red-400"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  <button onClick={() => handleSubmitQuote(rfq.id)} disabled={uploading} className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-navy-950 hover:bg-gold-400 disabled:opacity-50">
                    {uploading ? "Uploading..." : "Submit Quotation"}
                  </button>
                  <button onClick={() => { setExpandedRFQ(null); setQuoteFiles([]); }} className="rounded-lg bg-navy-700 px-4 py-2 text-sm text-black hover:bg-navy-600">Cancel</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Invoices Tab ───────────────────────────────────────────────

function InvoicesTab({ authToken }: { authToken: string }) {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ workOrderId: "", invoiceNumber: "", amount: "", taxAmount: "0", description: "" });

  const invoicesQuery = useQuery({
    ...trpc.getContractorInvoices.queryOptions({ authToken }),
  });
  const workOrdersQuery = useQuery({
    ...trpc.getWorkOrders.queryOptions({ authToken }),
  });

  const handleSubmitInvoice = async () => {
    if (!invoiceForm.workOrderId || !invoiceForm.invoiceNumber || !invoiceForm.amount || !invoiceForm.description) {
      toast.error("Fill in all required fields"); return;
    }
    try {
      await trpcClient.submitContractorInvoice.mutate({
        authToken,
        workOrderId: Number(invoiceForm.workOrderId),
        invoiceNumber: invoiceForm.invoiceNumber,
        amount: Number(invoiceForm.amount),
        taxAmount: Number(invoiceForm.taxAmount) || 0,
        description: invoiceForm.description,
      });
      toast.success("Invoice submitted");
      setShowForm(false);
      setInvoiceForm({ workOrderId: "", invoiceNumber: "", amount: "", taxAmount: "0", description: "" });
      queryClient.invalidateQueries({ queryKey: trpc.getContractorInvoices.queryKey() });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to submit invoice");
    }
  };

  if (invoicesQuery.isLoading) return <LoadingSpinner />;
  const invoices = invoicesQuery.data ?? [];
  const activeOrders = (workOrdersQuery.data ?? []).filter((o: any) => ["ACCEPTED", "IN_PROGRESS"].includes(o.status));

  // Payment tracker totals
  const paid = invoices.filter((i: any) => i.status === "PAID");
  const submitted = invoices.filter((i: any) => i.status === "SUBMITTED" || i.status === "APPROVED");
  const overdue = invoices.filter((i: any) => {
    if (i.status !== "SUBMITTED" && i.status !== "APPROVED") return false;
    const created = new Date(i.createdAt);
    const daysOpen = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24);
    return daysOpen > 30;
  });
  const totalPaid = paid.reduce((s: number, i: any) => s + Number(i.totalAmount ?? i.amount ?? 0), 0);
  const totalOutstanding = submitted.reduce((s: number, i: any) => s + Number(i.totalAmount ?? i.amount ?? 0), 0);
  const totalOverdue = overdue.reduce((s: number, i: any) => s + Number(i.totalAmount ?? i.amount ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Payment tracker — what's been paid vs what's still owed */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-emerald-300/40 bg-emerald-500/10 p-4">
          <p className="text-xs uppercase tracking-wider text-emerald-300">Paid lifetime</p>
          <p className="mt-1 text-xl font-bold text-emerald-300">R{totalPaid.toLocaleString("en-ZA")}</p>
          <p className="mt-0.5 text-[10px] text-emerald-400/80">{paid.length} invoice{paid.length === 1 ? "" : "s"}</p>
        </div>
        <div className="rounded-xl border border-blue-300/40 bg-blue-500/10 p-4">
          <p className="text-xs uppercase tracking-wider text-blue-300">Outstanding</p>
          <p className="mt-1 text-xl font-bold text-blue-300">R{totalOutstanding.toLocaleString("en-ZA")}</p>
          <p className="mt-0.5 text-[10px] text-blue-400/80">{submitted.length} awaiting payment</p>
        </div>
        <div className="rounded-xl border border-red-300/40 bg-red-500/10 p-4">
          <p className="text-xs uppercase tracking-wider text-red-300">Overdue (30d+)</p>
          <p className="mt-1 text-xl font-bold text-red-300">R{totalOverdue.toLocaleString("en-ZA")}</p>
          <p className="mt-0.5 text-[10px] text-red-400/80">{overdue.length} need chasing</p>
        </div>
        <div className="rounded-xl border border-gold-300/40 bg-gold-500/10 p-4">
          <p className="text-xs uppercase tracking-wider text-gold-300">Average pay time</p>
          <p className="mt-1 text-xl font-bold text-gold-300">
            {paid.length > 0
              ? `${Math.round(
                  paid.reduce((s: number, i: any) => {
                    if (!i.paidAt) return s;
                    const d = (new Date(i.paidAt).getTime() - new Date(i.createdAt).getTime()) / (1000 * 60 * 60 * 24);
                    return s + d;
                  }, 0) / paid.length,
                )}d`
              : "—"}
          </p>
          <p className="mt-0.5 text-[10px] text-gold-400/80">submit → cleared</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-navy-950 hover:bg-gold-400">
          <Receipt className="h-4 w-4" /> New Invoice
        </button>
      </div>

      {/* Submit Invoice Form */}
      {showForm && (
        <div className="rounded-xl border border-navy-800 bg-navy-900/50 p-6">
          <h3 className="mb-4 text-lg font-semibold text-gold-400">Submit Invoice</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-black">Work Order *</label>
              <select value={invoiceForm.workOrderId} onChange={(e) => setInvoiceForm({ ...invoiceForm, workOrderId: e.target.value })} className="w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-black">
                <option value="">Select Work Order</option>
                {activeOrders.map((wo: any) => (
                  <option key={wo.id} value={wo.id}>{wo.title} — {wo.property?.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-black">Invoice Number *</label>
              <input type="text" value={invoiceForm.invoiceNumber} onChange={(e) => setInvoiceForm({ ...invoiceForm, invoiceNumber: e.target.value })} className="w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-black" placeholder="INV-001" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-black">Amount (excl. VAT) *</label>
              <input type="number" value={invoiceForm.amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })} className="w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-black" placeholder="50000" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-black">VAT Amount</label>
              <input type="number" value={invoiceForm.taxAmount} onChange={(e) => setInvoiceForm({ ...invoiceForm, taxAmount: e.target.value })} className="w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-black" placeholder="7500" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs text-black">Description *</label>
              <textarea value={invoiceForm.description} onChange={(e) => setInvoiceForm({ ...invoiceForm, description: e.target.value })} rows={2} className="w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-black" placeholder="Invoice for plumbing installation phase 1..." />
            </div>
          </div>
          {invoiceForm.amount && (
            <p className="mt-2 text-sm text-black">Total: <span className="text-gold-400 font-medium">R {(Number(invoiceForm.amount) + Number(invoiceForm.taxAmount || 0)).toLocaleString()}</span></p>
          )}
          <div className="mt-4 flex gap-2">
            <button onClick={handleSubmitInvoice} className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-navy-950 hover:bg-gold-400">Submit Invoice</button>
            <button onClick={() => setShowForm(false)} className="rounded-lg bg-navy-700 px-4 py-2 text-sm text-black hover:bg-navy-600">Cancel</button>
          </div>
        </div>
      )}

      {/* Invoices List */}
      {invoices.length === 0 ? (
        <EmptyState icon={Receipt} message="No invoices submitted yet" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-navy-800">
          <table className="w-full text-sm">
            <thead className="bg-navy-900/80 text-black">
              <tr>
                <th className="px-4 py-3 text-left">Invoice #</th>
                <th className="px-4 py-3 text-left">Work Order</th>
                <th className="px-4 py-3 text-left">Amount</th>
                <th className="px-4 py-3 text-left">VAT</th>
                <th className="px-4 py-3 text-left">Total</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy-800">
              {invoices.map((inv: any) => (
                <tr key={inv.id} className="hover:bg-navy-800/30">
                  <td className="px-4 py-3 font-medium text-white">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3 text-black">{inv.workOrder?.property?.title}</td>
                  <td className="px-4 py-3 text-black">R {inv.amount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-black">R {inv.taxAmount.toLocaleString()}</td>
                  <td className="px-4 py-3 font-medium text-gold-400">R {inv.totalAmount.toLocaleString()}</td>
                  <td className="px-4 py-3"><StatusBadge status={inv.status} /></td>
                  <td className="px-4 py-3 text-black">{new Date(inv.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
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
                      className="rounded border border-navy-600 px-2 py-1 text-xs text-black hover:bg-navy-800"
                      title="Download Invoice PDF"
                    >
                      <Download className="h-3 w-3" />
                    </button>
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

// ─── Progress Reports Tab ───────────────────────────────────────

function ProgressTab({ authToken }: { authToken: string }) {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);
  const [form, setForm] = useState({ description: "", milestoneId: null as number | null, images: [] as string[] });
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [milestoneForm, setMilestoneForm] = useState({ name: "", description: "", estimatedStartDate: "", estimatedCompletionDate: "" });

  const workOrdersQuery = useQuery({
    ...trpc.getWorkOrders.queryOptions({ authToken }),
  });

  // Get unique property IDs from work orders
  const propertyIds = [...new Set((workOrdersQuery.data ?? []).map((wo: any) => wo.propertyId))];
  const properties = (workOrdersQuery.data ?? []).reduce((acc: any, wo: any) => {
    if (!acc.find((p: any) => p.id === wo.propertyId)) acc.push(wo.property);
    return acc;
  }, []);

  const milestonesQuery = useQuery({
    ...trpc.getMilestones.queryOptions({ authToken, propertyId: selectedPropertyId ?? 0 }),
    enabled: !!selectedPropertyId,
  });

  const submissionsQuery = useQuery({
    ...trpc.getProgressSubmissions.queryOptions({ authToken, propertyId: selectedPropertyId ?? 0 }),
    enabled: !!selectedPropertyId,
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const reader = new FileReader();
        const base64: string = await new Promise((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.readAsDataURL(file);
        });
        const result = await (trpcClient as any).uploadFile.mutate({
          authToken,
          fileName: file.name,
          fileType: file.type,
          fileBase64: base64,
        });
        urls.push(result.publicUrl);
      } catch {
        toast.error("Upload failed");
      }
    }
    if (urls.length) setForm({ ...form, images: [...form.images, ...urls] });
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSubmit = async () => {
    if (!selectedPropertyId || !form.description) { toast.error("Select property and describe the work"); return; }
    if (!form.milestoneId) { toast.error("Please select a milestone"); return; }
    try {
      await trpcClient.createProgressSubmission.mutate({
        authToken,
        propertyId: selectedPropertyId,
        description: form.description,
        milestoneId: form.milestoneId,
        imageUrls: form.images.length > 0 ? form.images : undefined,
      } as any);
      toast.success("Progress submitted");
      setShowForm(false);
      setForm({ description: "", milestoneId: null, images: [] });
      queryClient.invalidateQueries({ queryKey: trpc.getProgressSubmissions.queryKey() });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to submit");
    }
  };

  const handleCreateMilestone = async () => {
    if (!selectedPropertyId) return;
    if (!milestoneForm.name || !milestoneForm.description || !milestoneForm.estimatedStartDate || !milestoneForm.estimatedCompletionDate) {
      toast.error("Please fill in all milestone fields");
      return;
    }
    try {
      const result = await trpcClient.createMilestone.mutate({
        authToken,
        propertyId: selectedPropertyId,
        name: milestoneForm.name,
        description: milestoneForm.description,
        estimatedStartDate: milestoneForm.estimatedStartDate,
        estimatedCompletionDate: milestoneForm.estimatedCompletionDate,
      });
      toast.success("Milestone created");
      setShowMilestoneForm(false);
      setMilestoneForm({ name: "", description: "", estimatedStartDate: "", estimatedCompletionDate: "" });
      setForm({ ...form, milestoneId: result.milestone.id });
      queryClient.invalidateQueries({ queryKey: trpc.getMilestones.queryKey() });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to create milestone");
    }
  };

  const milestones = Array.isArray(milestonesQuery.data) ? milestonesQuery.data : [];
  const submissions = Array.isArray(submissionsQuery.data) ? submissionsQuery.data : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          value={selectedPropertyId ?? ""}
          onChange={(e) => setSelectedPropertyId(e.target.value ? Number(e.target.value) : null)}
          className="rounded-lg border border-navy-700 bg-navy-900 px-4 py-2 text-sm text-black"
        >
          <option value="">Select Property</option>
          {properties.map((p: any) => p && (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
        {selectedPropertyId && (
          <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-navy-950 hover:bg-gold-400">
            <Upload className="h-4 w-4" /> Submit Progress
          </button>
        )}
      </div>

      {/* Progress Form */}
      {showForm && selectedPropertyId && (
        <div className="rounded-xl border border-navy-800 bg-navy-900/50 p-6">
          <h3 className="mb-4 text-lg font-semibold text-gold-400">Submit Progress Report</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs text-black">Description *</label>
              <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-black" placeholder="Describe the work completed..." />
            </div>
            <div>
              <label className="mb-1 block text-xs text-black">Milestone *</label>
              <div className="flex gap-2">
                <select value={form.milestoneId ?? ""} onChange={(e) => setForm({ ...form, milestoneId: e.target.value ? Number(e.target.value) : null })} className="w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-black">
                  <option value="">Select Milestone</option>
                  {milestones.map((m: any) => (
                    <option key={m.id} value={m.id}>{m.name ?? m.title}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setShowMilestoneForm(!showMilestoneForm)} className="shrink-0 rounded-lg bg-navy-700 px-3 py-2 text-xs text-gold-400 hover:bg-navy-600" title="Add new milestone">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {showMilestoneForm && (
                <div className="mt-3 rounded-lg border border-navy-700 bg-navy-800/60 p-3 space-y-2">
                  <p className="text-xs font-semibold text-gold-400">New Milestone</p>
                  <input type="text" value={milestoneForm.name} onChange={(e) => setMilestoneForm({ ...milestoneForm, name: e.target.value })} className="w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-black" placeholder="Milestone name *" />
                  <input type="text" value={milestoneForm.description} onChange={(e) => setMilestoneForm({ ...milestoneForm, description: e.target.value })} className="w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-black" placeholder="Description *" />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs text-black">Start Date *</label>
                      <input type="date" value={milestoneForm.estimatedStartDate} onChange={(e) => setMilestoneForm({ ...milestoneForm, estimatedStartDate: e.target.value })} className="w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-black" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-black">End Date *</label>
                      <input type="date" value={milestoneForm.estimatedCompletionDate} onChange={(e) => setMilestoneForm({ ...milestoneForm, estimatedCompletionDate: e.target.value })} className="w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-black" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={handleCreateMilestone} className="rounded-lg bg-gold-500 px-3 py-1.5 text-xs font-medium text-navy-950 hover:bg-gold-400">Add Milestone</button>
                    <button type="button" onClick={() => setShowMilestoneForm(false)} className="rounded-lg bg-navy-700 px-3 py-1.5 text-xs text-black hover:bg-navy-600">Cancel</button>
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs text-black"><Camera className="mr-1 inline h-3 w-3" /> Photos</label>
              <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFileUpload} className="w-full rounded-lg border border-navy-600 bg-navy-900 px-3 py-2 text-sm text-black file:mr-2 file:rounded file:border-0 file:bg-gold-500 file:px-2 file:py-1 file:text-xs file:font-medium file:text-navy-950" />
              {uploading && <p className="mt-1 text-xs text-gold-400">Uploading...</p>}
            </div>
          </div>
          {form.images.length > 0 && (
            <div className="mt-3 flex gap-2 flex-wrap">
              {form.images.map((url, i) => (
                <div key={i} className="relative">
                  <img src={url} alt={`Photo ${i + 1}`} className="h-16 w-16 rounded-lg object-cover" />
                  <button onClick={() => setForm({ ...form, images: form.images.filter((_, j) => j !== i) })} className="absolute -right-1 -top-1 rounded-full bg-red-600 p-0.5 text-white"><X className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <button onClick={handleSubmit} className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-navy-950 hover:bg-gold-400">Submit Progress</button>
            <button onClick={() => setShowForm(false)} className="rounded-lg bg-navy-700 px-4 py-2 text-sm text-black hover:bg-navy-600">Cancel</button>
          </div>
        </div>
      )}

      {/* Submissions List */}
      {!selectedPropertyId ? (
        <EmptyState icon={Building} message="Select a property to view progress reports" />
      ) : submissions.length === 0 ? (
        <EmptyState icon={Upload} message="No progress reports submitted for this property" />
      ) : (
        <div className="space-y-3">
          {submissions.map((s: any) => (
            <div key={s.id} className="rounded-xl border border-navy-800 bg-navy-900/50 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-white">{s.description}</p>
                  <p className="mt-1 text-xs text-black">
                    {s.milestone?.name && <span className="mr-3">Milestone: {s.milestone.name}</span>}
                    {new Date(s.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <StatusBadge status={s.status ?? "SUBMITTED"} />
              </div>
              {Array.isArray(s.imageUrls) && s.imageUrls.length > 0 && (
                <div className="mt-2 flex gap-2 flex-wrap">
                  {(s.imageUrls as string[]).map((url: string, i: number) => (
                    <img key={i} src={url} alt={`Progress ${i + 1}`} className="h-16 w-16 rounded-lg object-cover border border-navy-700" />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Profile Tab ────────────────────────────────────────────────

const DOCUMENT_TYPES = [
  { value: "CIPC_REGISTRATION", label: "CIPC Registration Certificate" },
  { value: "BEE_CERTIFICATE", label: "B-BBEE Certificate" },
  { value: "CIDB_CERTIFICATE", label: "CIDB Certificate" },
  { value: "TAX_CLEARANCE", label: "SARS Tax Clearance" },
  { value: "INSURANCE", label: "Insurance Certificate" },
  { value: "PROOF_OF_BANKING", label: "Proof of Banking / Bank Confirmation" },
  { value: "OTHER", label: "Other Supporting Document" },
];

const PROVINCES = ["Gauteng", "Western Cape", "KwaZulu-Natal", "Eastern Cape", "Free State", "Limpopo", "Mpumalanga", "North West", "Northern Cape"];

function ProfileTab({ authToken }: { authToken: string }) {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docType, setDocType] = useState("CIPC_REGISTRATION");

  const profileQuery = useQuery({
    ...trpc.getMyContractorProfile.queryOptions({ authToken }),
  });

  const emptyForm = {
    companyName: "", tradingAs: "", registrationNumber: "", vatNumber: "",
    beeLevel: "", specialty: "", phone: "", address: "", city: "", province: "",
    bankName: "", bankAccountNumber: "", bankBranchCode: "", cidbGrade: "",
  };

  const [form, setForm] = useState(emptyForm);
  const [pendingDocs, setPendingDocs] = useState<{ documentType: string; documentName: string; documentUrl: string }[]>([]);

  useEffect(() => {
    if (profileQuery.data) {
      const p = profileQuery.data;
      setForm({
        companyName: p.companyName || "",
        tradingAs: p.tradingAs || "",
        registrationNumber: p.registrationNumber || "",
        vatNumber: p.vatNumber || "",
        beeLevel: p.beeLevel || "",
        specialty: p.specialty || "",
        phone: p.phone || "",
        address: p.address || "",
        city: p.city || "",
        province: p.province || "",
        bankName: p.bankName || "",
        bankAccountNumber: p.bankAccountNumber || "",
        bankBranchCode: p.bankBranchCode || "",
        cidbGrade: p.cidbGrade || "",
      });
    }
  }, [profileQuery.data]);

  if (profileQuery.isLoading) return <LoadingSpinner />;

  const profile = profileQuery.data;
  const hasProfile = !!profile;
  const isNewRegistration = !hasProfile;

  // File upload handler for documents
  const handleDocUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      try {
        const reader = new FileReader();
        const base64: string = await new Promise((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(",")[1]);
          reader.readAsDataURL(file);
        });
        const result = await (trpcClient as any).uploadFile.mutate({
          authToken,
          fileName: file.name,
          fileType: file.type,
          fileBase64: base64,
        });
        if (hasProfile) {
          // Upload directly to existing profile
          await trpcClient.uploadContractorDocument.mutate({
            authToken,
            documentType: docType,
            documentName: file.name,
            documentUrl: result.publicUrl,
          });
          await queryClient.invalidateQueries({ queryKey: trpc.getMyContractorProfile.queryKey({ authToken }) });
          toast.success(`Document "${file.name}" uploaded`);
        } else {
          // New registration — queue for submission
          setPendingDocs((prev) => [...prev, { documentType: docType, documentName: file.name, documentUrl: result.publicUrl }]);
        }
      } catch {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDeleteDoc = async (docId: number) => {
    try {
      await trpcClient.deleteContractorDocument.mutate({ authToken, documentId: docId });
      await queryClient.invalidateQueries({ queryKey: trpc.getMyContractorProfile.queryKey({ authToken }) });
      toast.success("Document removed");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to delete document");
    }
  };

  // Submit new profile (self-registration)
  const handleNewSubmit = async () => {
    if (!form.companyName || !form.specialty || !form.phone) {
      toast.error("Please fill in required fields: Company Name, Specialty, and Phone");
      return;
    }
    try {
      await trpcClient.submitContractorSelfProfile.mutate({
        authToken,
        companyName: form.companyName,
        tradingAs: form.tradingAs || undefined,
        registrationNumber: form.registrationNumber || undefined,
        vatNumber: form.vatNumber || undefined,
        beeLevel: form.beeLevel || undefined,
        specialty: form.specialty,
        phone: form.phone,
        address: form.address || undefined,
        city: form.city || undefined,
        province: form.province || undefined,
        bankName: form.bankName || undefined,
        bankAccountNumber: form.bankAccountNumber || undefined,
        bankBranchCode: form.bankBranchCode || undefined,
        cidbGrade: form.cidbGrade || undefined,
        documentUrls: pendingDocs.length ? pendingDocs : undefined,
      });
      toast.success("Profile submitted for approval!");
      setPendingDocs([]);
      await queryClient.invalidateQueries({ queryKey: trpc.getMyContractorProfile.queryKey({ authToken }) });
      await queryClient.invalidateQueries({ queryKey: trpc.getContractorDashboard.queryKey({ authToken }) });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to submit profile");
    }
  };

  // Update existing profile
  const handleUpdate = async () => {
    try {
      await trpcClient.updateMyContractorProfile.mutate({ authToken, ...form });
      await queryClient.invalidateQueries({ queryKey: trpc.getMyContractorProfile.queryKey({ authToken }) });
      await queryClient.invalidateQueries({ queryKey: trpc.getContractorDashboard.queryKey({ authToken }) });
      setIsEditing(false);
      toast.success("Profile updated — sent for re-approval");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update profile");
    }
  };

  const fields: { key: keyof typeof form; label: string; section: string; required?: boolean; type?: string }[] = [
    { key: "companyName", label: "Company Name", section: "Business Details", required: true },
    { key: "tradingAs", label: "Trading As", section: "Business Details" },
    { key: "registrationNumber", label: "CIPC Registration Number", section: "Business Details" },
    { key: "vatNumber", label: "VAT Number", section: "Business Details" },
    { key: "beeLevel", label: "B-BBEE Level", section: "Business Details" },
    { key: "specialty", label: "Specialty / Trade", section: "Business Details", required: true },
    { key: "cidbGrade", label: "CIDB Grade", section: "Business Details" },
    { key: "phone", label: "Phone", section: "Contact & Address", required: true },
    { key: "address", label: "Street Address", section: "Contact & Address" },
    { key: "city", label: "City", section: "Contact & Address" },
    { key: "province", label: "Province", section: "Contact & Address", type: "province" },
    { key: "bankName", label: "Bank Name", section: "Banking Details" },
    { key: "bankAccountNumber", label: "Account Number", section: "Banking Details" },
    { key: "bankBranchCode", label: "Branch Code", section: "Banking Details" },
  ];

  const sections = ["Business Details", "Contact & Address", "Banking Details"];
  const sectionIcons: Record<string, any> = {
    "Business Details": Briefcase,
    "Contact & Address": MapPin,
    "Banking Details": Wallet,
  };

  const completionPct = Math.round(
    (Object.values(form).filter(Boolean).length / Object.values(form).length) * 100
  );

  const isFormMode = isNewRegistration || isEditing;

  return (
    <div className="space-y-6">
      {/* Status banner */}
      {profile?.profileStatus === "PENDING" && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-950/20 p-4">
          <Clock className="h-5 w-5 text-amber-400 flex-shrink-0" />
          <div>
            <p className="font-medium text-amber-400">Profile Pending Approval</p>
            <p className="text-sm text-black">Your profile has been submitted and is awaiting review by the development manager.</p>
          </div>
        </div>
      )}
      {profile?.profileStatus === "REJECTED" && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/30 bg-red-950/20 p-4">
          <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0" />
          <div>
            <p className="font-medium text-red-400">Profile Rejected</p>
            <p className="text-sm text-black">Reason: {profile.rejectionReason || "No reason provided"}</p>
            <p className="mt-1 text-xs text-black">Please update your profile and supporting documents, then save to re-submit for approval.</p>
          </div>
        </div>
      )}
      {profile?.profileStatus === "APPROVED" && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4">
          <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0" />
          <div>
            <p className="font-medium text-emerald-400">Profile Approved</p>
            <p className="text-sm text-black">Your profile is active. You can receive work orders and submit quotations.</p>
          </div>
        </div>
      )}

      {/* New registration intro */}
      {isNewRegistration && (
        <div className="rounded-xl border border-gold-500/30 bg-navy-900/50 p-6">
          <h2 className="text-xl font-bold text-gold-400 flex items-center gap-2">
            <HardHat className="h-6 w-6" /> Complete Your Contractor Profile
          </h2>
          <p className="mt-2 text-sm text-black">
            Fill in your business details, upload supporting documents, and submit for approval.
            Once approved by the development manager, you'll be able to receive work orders and submit quotations.
          </p>
        </div>
      )}

      {/* Profile header (existing profile) */}
      {hasProfile && (
        <div className="flex items-start justify-between rounded-xl border border-navy-800 bg-navy-900/50 p-6">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gold-500/20 text-gold-400">
              <HardHat className="h-8 w-8" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{profile.companyName}</h2>
              {profile.tradingAs && <p className="text-sm text-black">t/a {profile.tradingAs}</p>}
              <div className="mt-1 flex items-center gap-2 text-xs text-black">
                <Mail className="h-3 w-3" /> {profile.user?.email}
                {profile.phone && <><Phone className="ml-2 h-3 w-3" /> {profile.phone}</>}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-2 w-32 rounded-full bg-navy-700">
                  <div className="h-2 rounded-full bg-gold-500 transition-all" style={{ width: `${completionPct}%` }} />
                </div>
                <span className="text-xs text-black">{completionPct}% complete</span>
              </div>
            </div>
          </div>
          <div>
            {isEditing ? (
              <div className="flex gap-2">
                <button onClick={handleUpdate} className="flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
                  <Save className="h-4 w-4" /> Save & Re-submit
                </button>
                <button onClick={() => { setIsEditing(false); if (profileQuery.data) { const p = profileQuery.data; setForm({ companyName: p.companyName || "", tradingAs: p.tradingAs || "", registrationNumber: p.registrationNumber || "", vatNumber: p.vatNumber || "", beeLevel: p.beeLevel || "", specialty: p.specialty || "", phone: p.phone || "", address: p.address || "", city: p.city || "", province: p.province || "", bankName: p.bankName || "", bankAccountNumber: p.bankAccountNumber || "", bankBranchCode: p.bankBranchCode || "", cidbGrade: p.cidbGrade || "" }); } }} className="flex items-center gap-1.5 rounded-lg bg-navy-700 px-4 py-2 text-sm font-medium text-black hover:bg-navy-600">
                  <XCircle className="h-4 w-4" /> Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setIsEditing(true)} className="flex items-center gap-1.5 rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600">
                <Pencil className="h-4 w-4" /> Edit Profile
              </button>
            )}
          </div>
        </div>
      )}

      {/* Form sections */}
      {sections.map((section) => {
        const SectionIcon = sectionIcons[section];
        return (
          <div key={section} className="rounded-xl border border-navy-800 bg-navy-900/50 p-6">
            <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gold-400">
              {SectionIcon && <SectionIcon className="h-5 w-5" />} {section}
            </h3>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {fields.filter((f) => f.section === section).map((f) => (
                <div key={f.key}>
                  <label className="mb-1 block text-xs font-medium text-black">
                    {f.label}{f.required && " *"}
                  </label>
                  {isFormMode ? (
                    f.type === "province" ? (
                      <select
                        value={form[f.key]}
                        onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        className="w-full rounded-lg border border-navy-700 bg-navy-800 px-3 py-2 text-sm text-black focus:border-gold-500 focus:outline-none"
                      >
                        <option value="">Select province...</option>
                        {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={form[f.key]}
                        onChange={(e) => setForm((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        className="w-full rounded-lg border border-navy-700 bg-navy-800 px-3 py-2 text-sm text-black focus:border-gold-500 focus:outline-none"
                        placeholder={f.key === "specialty" ? "e.g. Plumbing, Electrical, General Building" : undefined}
                      />
                    )
                  ) : (
                    <p className="rounded-lg bg-navy-800/50 px-3 py-2 text-sm text-white">
                      {form[f.key] || <span className="text-black italic">Not provided</span>}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Supporting Documents */}
      <div className="rounded-xl border border-navy-800 bg-navy-900/50 p-6">
        <h3 className="mb-4 flex items-center gap-2 text-base font-semibold text-gold-400">
          <FileText className="h-5 w-5" /> Supporting Documents
        </h3>
        <p className="mb-4 text-sm text-black">
          Upload relevant documents such as CIPC registration, B-BBEE certificate, CIDB certificate, tax clearance, insurance, and bank confirmation letter.
        </p>

        {/* Upload controls */}
        {(isFormMode || hasProfile) && (
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-black">Document Type</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                className="rounded-lg border border-navy-700 bg-navy-800 px-3 py-2 text-sm text-black focus:border-gold-500 focus:outline-none"
              >
                {DOCUMENT_TYPES.map((dt) => (
                  <option key={dt.value} value={dt.value}>{dt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-black">Select File</label>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={handleDocUpload}
                className="rounded-lg border border-navy-700 bg-navy-800 px-3 py-2 text-sm text-black file:mr-2 file:rounded file:border-0 file:bg-gold-500 file:px-2 file:py-1 file:text-xs file:font-medium file:text-navy-950"
              />
            </div>
            {uploading && <p className="text-xs text-gold-400">Uploading...</p>}
          </div>
        )}

        {/* Pending docs (new registration, not yet submitted) */}
        {isNewRegistration && pendingDocs.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-xs font-medium text-black">Documents to be submitted:</p>
            <div className="space-y-2">
              {pendingDocs.map((doc, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-navy-800/50 p-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-gold-400" />
                    <div>
                      <p className="text-sm text-white">{doc.documentName}</p>
                      <p className="text-xs text-black">{DOCUMENT_TYPES.find((d) => d.value === doc.documentType)?.label}</p>
                    </div>
                  </div>
                  <button onClick={() => setPendingDocs((prev) => prev.filter((_, j) => j !== i))} className="rounded p-1 text-red-400 hover:bg-red-900/30">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Existing uploaded docs */}
        {hasProfile && profile.documents && profile.documents.length > 0 && (
          <div className="space-y-2">
            {profile.documents.map((doc: any) => (
              <div key={doc.id} className="flex items-center justify-between rounded-lg bg-navy-800/50 p-3">
                <div className="flex items-center gap-3">
                  <FileText className="h-4 w-4 text-gold-400" />
                  <div>
                    <p className="text-sm text-white">{doc.documentName}</p>
                    <p className="text-xs text-black">{DOCUMENT_TYPES.find((d) => d.value === doc.documentType)?.label ?? doc.documentType} • {new Date(doc.createdAt).toLocaleDateString("en-ZA")}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a href={doc.documentUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-navy-700 px-3 py-1.5 text-xs text-black hover:bg-navy-600">View</a>
                  {isFormMode && (
                    <button onClick={() => handleDeleteDoc(doc.id)} className="rounded p-1 text-red-400 hover:bg-red-900/30">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {hasProfile && (!profile.documents || profile.documents.length === 0) && !isFormMode && (
          <p className="text-sm text-black italic">No documents uploaded yet. Click Edit Profile to add supporting documents.</p>
        )}
      </div>

      {/* Submit button for new registration */}
      {isNewRegistration && (
        <div className="flex gap-3">
          <button onClick={handleNewSubmit} className="flex items-center gap-2 rounded-lg bg-gold-500 px-6 py-3 text-sm font-medium text-white hover:bg-gold-600">
            <Send className="h-4 w-4" /> Submit Profile for Approval
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Shared Components ──────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    OPEN: "bg-blue-900/30 text-blue-400",
    ISSUED: "bg-blue-900/30 text-blue-400",
    SUBMITTED: "bg-yellow-900/30 text-yellow-400",
    UNDER_REVIEW: "bg-orange-900/30 text-orange-400",
    ACCEPTED: "bg-green-900/30 text-green-400",
    IN_PROGRESS: "bg-indigo-900/30 text-indigo-400",
    COMPLETED: "bg-emerald-900/30 text-emerald-400",
    APPROVED: "bg-green-900/30 text-green-400",
    REJECTED: "bg-red-900/30 text-red-400",
    PAID: "bg-emerald-900/30 text-emerald-400",
    AWARDED: "bg-gold-900/30 text-gold-400",
    CANCELLED: "bg-gray-200 text-gray-500",
    CLOSED: "bg-gray-200 text-gray-500",
    ON_HOLD: "bg-orange-900/30 text-orange-400",
    WITHDRAWN: "bg-gray-200 text-gray-500",
    PENDING: "bg-yellow-900/30 text-yellow-400",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${colors[status] ?? "bg-navy-700 text-gray-700"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold-500 border-r-transparent"></div>
    </div>
  );
}

function EmptyState({ icon: Icon, message }: { icon: any; message: string }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-navy-700 py-16 text-center">
      <Icon className="mx-auto mb-3 text-black" size={48} />
      <p className="text-lg font-medium text-black">{message}</p>
    </div>
  );
}
