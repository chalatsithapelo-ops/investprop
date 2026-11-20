import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  DollarSign,
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  Search,
  Users,
  Building2,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/admin/investments/")({
  component: AdminInvestmentsPage,
});

const OVERSIGHT_ROLES = ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "COMPLIANCE_OFFICER"];
const R = (n: number) => `R${Math.round(n ?? 0).toLocaleString("en-ZA")}`;

const STATUS_BADGE: Record<string, string> = {
  PAID: "bg-emerald-100 text-emerald-700",
  APPROVED: "bg-teal-100 text-teal-700",
  PENDING: "bg-amber-100 text-amber-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};

function AdminInvestmentsPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"ALL" | "PENDING" | "APPROVED" | "PAID" | "CANCELLED">("ALL");
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) void navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const isAllowed = OVERSIGHT_ROLES.includes(user?.role ?? "");

  const q = useQuery({
    ...trpc.getAllInvestmentsOverview.queryOptions({ search: search || undefined, status }),
    enabled: !!authToken && isAllowed,
  });

  if (!user || !authToken) return null;
  if (!isAllowed) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <ShieldAlert className="mx-auto mb-4 text-red-600" size={48} />
          <h1 className="text-2xl font-bold text-gray-900">Access restricted</h1>
          <p className="mt-2 text-gray-500">Only the admin team can view platform-wide investments.</p>
        </div>
      </div>
    );
  }

  const data = q.data;
  const properties = data?.properties ?? [];
  const summary = data?.summary;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Navbar />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-gold-500/20 p-2.5 text-gold-600">
            <DollarSign size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Investments by property</h1>
            <p className="text-sm text-gray-500">
              Every investor commitment across the platform — who invested in what, for how much.
            </p>
          </div>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label="Total invested" value={R(summary.totalInvested)} icon={DollarSign} />
            <SummaryCard label="Commitments" value={String(summary.totalContributions)} icon={CheckCircle2} />
            <SummaryCard label="Unique investors" value={String(summary.uniqueInvestors)} icon={Users} />
            <SummaryCard label="Funded properties" value={String(summary.propertiesWithInvestment)} icon={Building2} />
          </div>
        )}

        {/* Controls */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search investor, email, code or property…"
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-gold-500 focus:outline-none"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as any)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {["ALL", "PENDING", "APPROVED", "PAID", "CANCELLED"].map((s) => (
              <option key={s} value={s}>{s === "ALL" ? "All statuses" : s}</option>
            ))}
          </select>
        </div>

        {q.isLoading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gold-500 border-r-transparent" />
          </div>
        ) : properties.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-12 text-center">
            <Building2 className="mx-auto mb-3 text-gray-300" size={40} />
            <p className="text-lg font-medium">No investments found</p>
            <p className="mt-1 text-sm text-gray-500">Try a different search or status filter.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {properties.map((p: any) => {
              const open = openId === p.propertyId;
              return (
                <div key={p.propertyId} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                  <button
                    onClick={() => setOpenId(open ? null : p.propertyId)}
                    className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-gray-50"
                  >
                    <div className="flex items-center gap-3">
                      {open ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
                      <div>
                        <p className="font-semibold">{p.propertyTitle}</p>
                        <p className="text-xs text-gray-500">
                          {p.location || "—"} · <span className="capitalize">{p.propertyType}</span>
                          {p.spvName ? ` · ${p.spvName}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gold-700">{R(p.totalInvested)}</p>
                      <p className="text-xs text-gray-500">
                        {p.investorCount} investor{p.investorCount === 1 ? "" : "s"}
                        {p.fundingGoal > 0 ? ` · ${Math.round((p.totalInvested / p.fundingGoal) * 100)}% of goal` : ""}
                      </p>
                    </div>
                  </button>

                  {open && (
                    <div className="border-t border-gray-100">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-gray-50 text-left text-xs text-gray-500">
                            <th className="px-4 py-2 font-medium">Investor</th>
                            <th className="px-4 py-2 font-medium">Code</th>
                            <th className="px-4 py-2 text-right font-medium">Amount</th>
                            <th className="px-4 py-2 text-right font-medium">Exp. return</th>
                            <th className="px-4 py-2 font-medium">Status</th>
                            <th className="px-4 py-2 font-medium">FICA</th>
                            <th className="px-4 py-2 font-medium">Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.investors.map((inv: any) => (
                            <tr key={inv.contributionId} className="border-t border-gray-50">
                              <td className="px-4 py-2">
                                <p className="font-medium text-gray-900">{inv.investorName}</p>
                                <p className="text-xs text-gray-500">{inv.investorEmail}</p>
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-500">{inv.investorCode ?? "—"}</td>
                              <td className="px-4 py-2 text-right font-semibold">{R(inv.amount)}</td>
                              <td className="px-4 py-2 text-right text-gray-600">
                                {R(inv.expectedReturnAmount)}
                                <span className="ml-1 text-xs text-gray-400">({inv.expectedReturnRate}%)</span>
                              </td>
                              <td className="px-4 py-2">
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[inv.status] ?? "bg-gray-100 text-gray-500"}`}>
                                  {inv.status}
                                </span>
                              </td>
                              <td className="px-4 py-2">
                                {inv.ficaVerified ? (
                                  <CheckCircle2 size={16} className="text-emerald-600" />
                                ) : (
                                  <Clock size={16} className="text-amber-500" />
                                )}
                              </td>
                              <td className="px-4 py-2 text-xs text-gray-500">
                                {new Date(inv.contributionDate).toLocaleDateString("en-ZA")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-1 flex items-center gap-2 text-gray-400">
        <Icon size={15} />
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
