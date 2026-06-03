import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import {
  BookOpen,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowLeftRight,
  ShoppingCart,
  RefreshCw,
  Search,
  Filter,
  Building2,
  User,
  Calendar,
  Hash,
  TrendingUp,
  Wallet,
  BarChart3,
  Clock,
  ChevronDown,
  ChevronUp,
  FileText,
  CheckCircle,
  XCircle,
  CreditCard,
  BadgeCheck,
  Send,
  Shield,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/share-ledger/")({
  component: ShareLedgerPage,
});

type TransactionFilter = "ALL" | "PROPOSAL_SUBMITTED" | "PROPOSAL_APPROVED" | "PROPOSAL_REJECTED" | "PAYMENT_SUBMITTED" | "PAYMENT_CONFIRMED" | "CERTIFICATE_ISSUED" | "PURCHASE" | "TRANSFER_IN" | "TRANSFER_OUT" | "SALE" | "DISTRIBUTION";

function ShareLedgerPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const isManager = user?.role === "DEVELOPMENT_MANAGER" || user?.role === "PROPERTY_OWNER";

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated, navigate]);

  const [txFilter, setTxFilter] = useState<TransactionFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProperty, setSelectedProperty] = useState<number | null>(null);
  const [sortField, setSortField] = useState<"date" | "amount" | "shares">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const ledgerQuery = useQuery({
    ...trpc.getShareLedger.queryOptions({
      authToken: authToken ?? undefined,
      ...(selectedProperty ? { propertyId: selectedProperty } : {}),
      limit: 200,
    }),
    enabled: !!user?.id,
  });

  const portfolioQuery = useQuery({
    ...trpc.getInvestorPortfolio.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && !isManager,
  });

  const ledgerEntries = (ledgerQuery.data ?? []) as any[];
  const portfolio = (portfolioQuery.data ?? []) as any[];

  const filteredEntries = useMemo(() => {
    let entries = ledgerEntries;
    if (txFilter !== "ALL") {
      entries = entries.filter((e: any) => e.transactionType === txFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      entries = entries.filter(
        (e: any) =>
          e.reference?.toLowerCase().includes(q) ||
          e.property?.title?.toLowerCase().includes(q) ||
          e.investor?.name?.toLowerCase().includes(q) ||
          e.investor?.email?.toLowerCase().includes(q) ||
          e.shareClass?.name?.toLowerCase().includes(q)
      );
    }
    entries = [...entries].sort((a: any, b: any) => {
      let cmp = 0;
      if (sortField === "date") cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      else if (sortField === "amount") cmp = a.totalAmount - b.totalAmount;
      else if (sortField === "shares") cmp = a.shares - b.shares;
      return sortDir === "desc" ? -cmp : cmp;
    });
    return entries;
  }, [ledgerEntries, txFilter, searchQuery, sortField, sortDir]);

  const stats = useMemo(() => {
    const proposals = ledgerEntries.filter((e: any) => e.transactionType === "PROPOSAL_SUBMITTED");
    const approved = ledgerEntries.filter((e: any) => e.transactionType === "PROPOSAL_APPROVED");
    const paymentsConfirmed = ledgerEntries.filter((e: any) => e.transactionType === "PAYMENT_CONFIRMED");
    const certificates = ledgerEntries.filter((e: any) => e.transactionType === "CERTIFICATE_ISSUED");
    const totalApproved = approved.reduce((s: number, e: any) => s + (e.totalAmount ?? 0), 0);
    const totalPaid = paymentsConfirmed.reduce((s: number, e: any) => s + (e.totalAmount ?? 0), 0);
    const uniqueProperties = new Set(ledgerEntries.map((e: any) => e.propertyId)).size;
    const uniqueInvestors = new Set(ledgerEntries.map((e: any) => e.investorId)).size;
    return {
      totalTransactions: ledgerEntries.length,
      totalApproved,
      totalPaid,
      certificatesIssued: certificates.length,
      proposalsCount: proposals.length,
      approvedCount: approved.length,
      uniqueProperties,
      uniqueInvestors,
    };
  }, [ledgerEntries]);

  const propertyOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const e of ledgerEntries) {
      if (e.property?.id && e.property?.title) map.set(e.property.id, e.property.title);
    }
    return Array.from(map.entries());
  }, [ledgerEntries]);

  const fmt = (n: number) => `R${Math.abs(n).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const txTypeConfig: Record<string, { label: string; icon: any; color: string; bgColor: string; sign: string }> = {
    PROPOSAL_SUBMITTED: { label: "Proposal Submitted", icon: Send, color: "text-sky-600", bgColor: "bg-sky-100 dark:bg-sky-900/30", sign: "" },
    PROPOSAL_APPROVED: { label: "Proposal Approved", icon: CheckCircle, color: "text-green-600", bgColor: "bg-green-100 dark:bg-green-900/30", sign: "" },
    PROPOSAL_REJECTED: { label: "Proposal Rejected", icon: XCircle, color: "text-red-600", bgColor: "bg-red-100 dark:bg-red-900/30", sign: "" },
    PAYMENT_SUBMITTED: { label: "Payment Submitted", icon: CreditCard, color: "text-amber-600", bgColor: "bg-amber-100 dark:bg-amber-900/30", sign: "" },
    PAYMENT_CONFIRMED: { label: "Payment Confirmed", icon: BadgeCheck, color: "text-emerald-600", bgColor: "bg-emerald-100 dark:bg-emerald-900/30", sign: "+" },
    CERTIFICATE_ISSUED: { label: "Certificate Issued", icon: Shield, color: "text-purple-600", bgColor: "bg-purple-100 dark:bg-purple-900/30", sign: "" },
    PURCHASE: { label: "Purchase", icon: ShoppingCart, color: "text-green-600", bgColor: "bg-green-100 dark:bg-green-900/30", sign: "+" },
    TRANSFER_IN: { label: "Transfer In", icon: ArrowDownLeft, color: "text-blue-600", bgColor: "bg-blue-100 dark:bg-blue-900/30", sign: "+" },
    TRANSFER_OUT: { label: "Transfer Out", icon: ArrowUpRight, color: "text-red-600", bgColor: "bg-red-100 dark:bg-red-900/30", sign: "-" },
    SALE: { label: "Sale", icon: ArrowUpRight, color: "text-orange-600", bgColor: "bg-orange-100 dark:bg-orange-900/30", sign: "-" },
    DISTRIBUTION: { label: "Distribution", icon: Wallet, color: "text-emerald-600", bgColor: "bg-emerald-100 dark:bg-emerald-900/30", sign: "+" },
  };

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortField(field); setSortDir("desc"); }
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return null;
    return sortDir === "desc" ? <ChevronDown size={14} /> : <ChevronUp size={14} />;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 p-3">
              <BookOpen className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Share Ledger</h1>
              <p className="text-gray-500 dark:text-gray-400">
                {isManager
                  ? "Complete record of all share transactions across properties"
                  : "Transparent, real-time record of all share transactions"}
              </p>
            </div>
          </div>
        </div>

        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Hash} label="Total Transactions" value={stats.totalTransactions.toString()} sub={`${stats.uniqueInvestors} investor(s)`} color="indigo" />
          <StatCard icon={Send} label="Proposals" value={stats.proposalsCount.toString()} sub={`${stats.approvedCount} approved`} color="blue" />
          <StatCard icon={BadgeCheck} label="Confirmed Payments" value={fmt(stats.totalPaid)} sub={`${stats.uniqueProperties} properties`} color="green" />
          <StatCard icon={Shield} label="Certificates Issued" value={stats.certificatesIssued.toString()} sub={stats.totalApproved > 0 ? `R${stats.totalApproved.toLocaleString()} approved` : undefined} color="purple" />
        </div>

        {!isManager && portfolio.length > 0 && (
          <div className="mb-8 rounded-xl border bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">Current Holdings Summary</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-gray-500 dark:border-gray-600">
                    <th className="pb-3 font-medium">Property</th>
                    <th className="pb-3 font-medium">Share Class</th>
                    <th className="pb-3 font-medium text-right">Shares</th>
                    <th className="pb-3 font-medium text-right">Ownership</th>
                    <th className="pb-3 font-medium text-right">Invested</th>
                    <th className="pb-3 font-medium text-right">Current Value</th>
                    <th className="pb-3 font-medium text-right">Gain/Loss</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {portfolio.map((h: any) => (
                    <tr key={h.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <td className="py-3 font-medium text-gray-900 dark:text-white">{h.property?.title ?? `Property #${h.propertyId}`}</td>
                      <td className="py-3 text-gray-600 dark:text-gray-400">{h.shareClass?.name ?? "—"}</td>
                      <td className="py-3 text-right font-semibold text-gray-900 dark:text-white">{h.sharesOwned?.toLocaleString()}</td>
                      <td className="py-3 text-right text-gray-600 dark:text-gray-400">{h.ownershipPercentage?.toFixed(1)}%</td>
                      <td className="py-3 text-right text-gray-900 dark:text-white">{fmt(h.investedAmount ?? 0)}</td>
                      <td className="py-3 text-right font-semibold text-gray-900 dark:text-white">{fmt(h.currentValue ?? 0)}</td>
                      <td className={`py-3 text-right font-semibold ${(h.unrealizedGain ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {(h.unrealizedGain ?? 0) >= 0 ? "+" : "-"}{fmt(h.unrealizedGain ?? 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 font-semibold dark:border-gray-600">
                    <td colSpan={4} className="py-3 text-gray-900 dark:text-white">Totals</td>
                    <td className="py-3 text-right text-gray-900 dark:text-white">{fmt(portfolio.reduce((s: number, h: any) => s + (h.investedAmount ?? 0), 0))}</td>
                    <td className="py-3 text-right text-gray-900 dark:text-white">{fmt(portfolio.reduce((s: number, h: any) => s + (h.currentValue ?? 0), 0))}</td>
                    <td className={`py-3 text-right ${portfolio.reduce((s: number, h: any) => s + (h.unrealizedGain ?? 0), 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {portfolio.reduce((s: number, h: any) => s + (h.unrealizedGain ?? 0), 0) >= 0 ? "+" : "-"}
                      {fmt(portfolio.reduce((s: number, h: any) => s + (h.unrealizedGain ?? 0), 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by reference, property, investor..." className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-4 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
          </div>
          <div className="flex gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
            {([
              { key: "ALL", label: "All" },
              { key: "PROPOSAL_SUBMITTED", label: "Proposals" },
              { key: "PROPOSAL_APPROVED", label: "Approved" },
              { key: "PAYMENT_SUBMITTED", label: "Payments" },
              { key: "PAYMENT_CONFIRMED", label: "Confirmed" },
              { key: "CERTIFICATE_ISSUED", label: "Certificates" },
            ] as { key: TransactionFilter; label: string }[]).map((f) => (
              <button key={f.key} onClick={() => setTxFilter(f.key)} className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${txFilter === f.key ? "bg-white text-indigo-700 shadow dark:bg-gray-700 dark:text-indigo-400" : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"}`}>{f.label}</button>
            ))}
          </div>
          {propertyOptions.length > 1 && (
            <div className="flex items-center gap-2">
              <Filter size={14} className="text-gray-500" />
              <select value={selectedProperty ?? ""} onChange={(e) => setSelectedProperty(e.target.value ? Number(e.target.value) : null)} className="rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-indigo-500 focus:outline-none dark:border-gray-600 dark:bg-gray-700 dark:text-white">
                <option value="">All Properties</option>
                {propertyOptions.map(([id, title]) => (<option key={id} value={id}>{title}</option>))}
              </select>
            </div>
          )}
          <button onClick={() => ledgerQuery.refetch()} className="rounded-lg border border-gray-300 p-2.5 text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700" title="Refresh">
            <RefreshCw size={16} className={ledgerQuery.isFetching ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="rounded-xl border bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          {ledgerQuery.isLoading ? (
            <div className="flex justify-center py-16"><div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-r-transparent"></div></div>
          ) : filteredEntries.length === 0 ? (
            <div className="py-16 text-center">
              <BookOpen className="mx-auto mb-3 h-12 w-12 text-gray-300 dark:text-gray-600" />
              <p className="text-lg font-medium text-gray-500 dark:text-gray-400">
                {ledgerEntries.length === 0 ? "No ledger entries yet" : "No entries match your filters"}
              </p>
              <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
                {ledgerEntries.length === 0 ? "Investment proposals, payments, and share transactions will appear here as activity occurs" : "Try adjusting your search or filter criteria"}
              </p>
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-gray-500 dark:border-gray-700 dark:bg-gray-800/50">
                      <th className="px-6 py-3 font-medium">Type</th>
                      <th className="px-6 py-3 font-medium"><button onClick={() => toggleSort("date")} className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-white">Date <SortIcon field="date" /></button></th>
                      <th className="px-6 py-3 font-medium">Tx Hash</th>
                      <th className="px-6 py-3 font-medium">Property</th>
                      <th className="px-6 py-3 font-medium">Investor</th>
                      <th className="px-6 py-3 font-medium text-right"><button onClick={() => toggleSort("amount")} className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-white">Amount <SortIcon field="amount" /></button></th>
                      <th className="px-6 py-3 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-gray-700">
                    {filteredEntries.map((entry: any) => {
                      const cfg = txTypeConfig[entry.transactionType] ?? { label: entry.transactionType, icon: Clock, color: "text-gray-600", bgColor: "bg-gray-100", sign: "" };
                      const TxIcon = cfg.icon;
                      return (
                        <tr key={`${entry.transactionType}-${entry.id}`} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="px-6 py-4"><div className="flex items-center gap-2"><div className={`flex h-8 w-8 items-center justify-center rounded-full ${cfg.bgColor}`}><TxIcon size={14} className={cfg.color} /></div><span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span></div></td>
                          <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{fmtDate(entry.createdAt)}</td>
                          <td className="px-6 py-4"><span className="inline-block max-w-[140px] truncate rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400" title={entry.txHash ?? ""}>{entry.txHash ?? "—"}</span></td>
                          <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{entry.property?.title ?? `#${entry.propertyId}`}</td>
                          <td className="px-6 py-4 text-gray-600 dark:text-gray-400">{entry.investor?.name ?? `#${entry.investorId}`}</td>
                          <td className={`px-6 py-4 text-right font-bold ${cfg.color}`}>{cfg.sign}{fmt(entry.totalAmount ?? 0)}</td>
                          <td className="max-w-[280px] truncate px-6 py-4 text-xs text-gray-500 dark:text-gray-400">{entry.reference ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="divide-y md:hidden dark:divide-gray-700">
                {filteredEntries.map((entry: any) => {
                  const cfg = txTypeConfig[entry.transactionType] ?? { label: entry.transactionType, icon: Clock, color: "text-gray-600", bgColor: "bg-gray-100", sign: "" };
                  const TxIcon = cfg.icon;
                  return (
                    <div key={`m-${entry.transactionType}-${entry.id}`} className="px-4 py-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${cfg.bgColor}`}><TxIcon size={16} className={cfg.color} /></div>
                          <div>
                            <p className={`text-sm font-semibold ${cfg.color}`}>{cfg.label}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{entry.property?.title ?? `Property #${entry.propertyId}`}</p>
                            <p className="text-xs text-gray-400">{entry.investor?.name ?? `Investor #${entry.investorId}`}</p>
                          </div>
                        </div>
                        <div className="text-right"><p className={`text-lg font-bold ${cfg.color}`}>{cfg.sign}{fmt(entry.totalAmount ?? 0)}</p></div>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs text-gray-400"><span>{fmtDate(entry.createdAt)}</span></div>
                      {entry.reference && <p className="mt-1 truncate text-xs text-gray-400">{entry.reference}</p>}
                      {entry.txHash && <p className="mt-1 truncate font-mono text-xs text-gray-400">Tx: {entry.txHash}</p>}
                    </div>
                  );
                })}
              </div>
              <div className="border-t px-6 py-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                Showing {filteredEntries.length} of {ledgerEntries.length} entries
                {txFilter !== "ALL" && ` (filtered by ${txTypeConfig[txFilter]?.label ?? txFilter})`}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub?: string; color: string }) {
  const gradients: Record<string, string> = { indigo: "from-indigo-500 to-purple-600", green: "from-green-500 to-emerald-600", blue: "from-blue-500 to-cyan-600", purple: "from-purple-500 to-violet-600", amber: "from-amber-500 to-orange-600" };
  return (
    <div className={`rounded-xl bg-gradient-to-br ${gradients[color] ?? gradients.indigo} p-5 text-white shadow-md`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium opacity-90">{label}</span>
        <Icon size={20} className="opacity-80" />
      </div>
      <p className="text-xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 text-xs opacity-80">{sub}</p>}
    </div>
  );
}