import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  Inbox,
  ShieldAlert,
  AlertTriangle,
  Clock,
  FileText,
  CreditCard,
  Building,
  Wrench,
  Banknote,
  RefreshCw,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/admin/action-required/")({
  component: AdminActionRequiredPage,
});

const ADMIN_ROLES = ["ADMIN", "DEVELOPMENT_MANAGER"];

function AdminActionRequiredPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const isAdmin = ADMIN_ROLES.includes(user?.role ?? "");

  const inboxQuery = useQuery({
    ...trpc.getAdminActionInbox.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isAdmin,
    refetchInterval: 30_000,
  });

  if (!user || !authToken) return null;

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <ShieldAlert className="mx-auto mb-4 text-red-600" size={48} />
          <h1 className="text-2xl font-bold text-gray-900">Admin only</h1>
          <p className="mt-2 text-gray-500">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }

  const inbox = inboxQuery.data as any;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-amber-100 p-2.5">
              <Inbox className="text-amber-700" size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Action required</h1>
              <p className="text-sm text-gray-500">
                Everything that needs an admin's attention, in one place. Auto-refreshes every 30s.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => inboxQuery.refetch()}
            disabled={inboxQuery.isFetching}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={14} className={inboxQuery.isFetching ? "animate-spin" : ""} /> Refresh
          </button>
        </div>

        {inboxQuery.isLoading ? (
          <div className="flex items-center justify-center py-32">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-amber-500 border-r-transparent"></div>
          </div>
        ) : inboxQuery.isError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-700">
            Failed to load action inbox: {(inboxQuery.error as any)?.message ?? "unknown error"}
          </div>
        ) : !inbox ? (
          <div className="py-16 text-center text-gray-500">No data available</div>
        ) : (
          <>
            {/* Stat strip */}
            <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <StatTile label="KYC docs" count={inbox.counts.pendingKyc} icon={FileText} tone="purple" />
              <StatTile label="Payment proofs" count={inbox.counts.pendingPaymentProofs} icon={CreditCard} tone="blue" />
              <StatTile label="Sale proposals" count={inbox.counts.openProposals} icon={Building} tone="emerald" />
              <StatTile label="Cooling-off" count={inbox.counts.coolingOff} icon={Clock} tone="amber" />
              <StatTile label="Variations" count={inbox.counts.pendingVariations} icon={Wrench} tone="orange" />
              <StatTile label="Distributions" count={inbox.counts.pendingDistributions} icon={Banknote} tone="gold" />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* FICA / KYC */}
              <Section
                title="KYC documents awaiting review"
                icon={FileText}
                count={inbox.counts.pendingKyc}
                linkTo="/admin/fica-verification"
                linkLabel="Open FICA queue"
                empty="Nothing in the KYC queue 🎉"
              >
                {inbox.pendingKyc.slice(0, 6).map((d: any) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 border-b border-gray-100 py-2 last:border-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{d.userName ?? "(no name)"}</p>
                      <p className="truncate text-xs text-gray-500">
                        {d.documentType?.replace(/_/g, " ").toLowerCase()} · {d.userEmail}
                      </p>
                    </div>
                    <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${d.daysWaiting > 3 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>
                      {d.daysWaiting}d
                    </span>
                  </li>
                ))}
              </Section>

              {/* Payment proofs */}
              <Section
                title="Payment proofs to verify"
                icon={CreditCard}
                count={inbox.counts.pendingPaymentProofs}
                linkTo="/admin/payment-review"
                linkLabel="Open payment review"
                empty="No payment proofs waiting"
              >
                {inbox.pendingPaymentProofs.slice(0, 6).map((p: any) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 border-b border-gray-100 py-2 last:border-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{p.investorName}</p>
                      <p className="truncate text-xs text-gray-500">{p.propertyTitle}</p>
                    </div>
                    <span className="flex-shrink-0 text-sm font-semibold text-gray-900">
                      R{Number(p.amount).toLocaleString("en-ZA")}
                    </span>
                  </li>
                ))}
              </Section>

              {/* Sale proposals */}
              <Section
                title="Sale proposals to triage"
                icon={Building}
                count={inbox.counts.openProposals}
                linkTo="/sale-proposals"
                linkLabel="Open proposals"
                empty="No proposals awaiting triage"
              >
                {inbox.openProposals.slice(0, 6).map((p: any) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 border-b border-gray-100 py-2 last:border-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{p.title}</p>
                      <p className="truncate text-xs text-gray-500">{p.ownerName}</p>
                    </div>
                    <span className="flex-shrink-0 text-sm font-semibold text-emerald-700">
                      R{Number(p.askingPrice).toLocaleString("en-ZA")}
                    </span>
                  </li>
                ))}
              </Section>

              {/* Cooling-off (informational — refunds expected) */}
              <Section
                title="Cooling-off windows still open"
                icon={Clock}
                count={inbox.counts.coolingOff}
                linkTo="/admin/payment-review"
                linkLabel="Open payment review"
                empty="No active cooling-off contracts"
                tone="info"
              >
                {inbox.coolingOff.slice(0, 6).map((c: any) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 border-b border-gray-100 py-2 last:border-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{c.investorName}</p>
                      <p className="truncate text-xs text-gray-500">{c.propertyTitle}</p>
                    </div>
                    <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${c.hoursRemaining <= 24 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
                      {c.hoursRemaining}h left
                    </span>
                  </li>
                ))}
              </Section>

              {/* Variations */}
              <Section
                title="Variation orders pending approval"
                icon={Wrench}
                count={inbox.counts.pendingVariations}
                linkTo="/admin/variations"
                linkLabel="Open variations queue"
                empty="No variations to approve"
              >
                {inbox.pendingVariations.slice(0, 6).map((v: any) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 border-b border-gray-100 py-2 last:border-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{v.number}</p>
                      <p className="truncate text-xs text-gray-500">{v.workOrderTitle} · {v.propertyTitle}</p>
                    </div>
                    <span className={`flex-shrink-0 text-sm font-semibold ${v.costImpact >= 0 ? "text-red-700" : "text-emerald-700"}`}>
                      {v.costImpact >= 0 ? "+" : "−"}R{Math.abs(v.costImpact).toLocaleString("en-ZA")}
                    </span>
                  </li>
                ))}
              </Section>

              {/* Distributions to release */}
              <Section
                title="Distributions awaiting release"
                icon={Banknote}
                count={inbox.counts.pendingDistributions}
                linkTo="/distributions"
                linkLabel="Open distribution centre"
                empty="No distributions waiting"
              >
                {inbox.pendingDistributions.slice(0, 6).map((d: any) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 border-b border-gray-100 py-2 last:border-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{d.propertyTitle}</p>
                      <p className="truncate text-xs text-gray-500">{d.type} · {d.status}</p>
                    </div>
                    <span className="flex-shrink-0 text-sm font-semibold text-gray-900">
                      R{Number(d.amount).toLocaleString("en-ZA")}
                    </span>
                  </li>
                ))}
              </Section>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatTile({
  label,
  count,
  icon: Icon,
  tone,
}: {
  label: string;
  count: number;
  icon: any;
  tone: "purple" | "blue" | "emerald" | "amber" | "orange" | "gold";
}) {
  const toneMap: Record<typeof tone, string> = {
    purple: "border-purple-200 bg-purple-50 text-purple-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    orange: "border-orange-200 bg-orange-50 text-orange-800",
    gold: "border-gold-200 bg-gold-50 text-gold-800",
  } as const;
  return (
    <div className={`rounded-xl border ${toneMap[tone]} p-3`}>
      <div className="flex items-center justify-between">
        <Icon size={18} />
        <span className="text-2xl font-bold">{count}</span>
      </div>
      <p className="mt-1 text-xs font-medium uppercase tracking-wider">{label}</p>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  count,
  children,
  linkTo,
  linkLabel,
  empty,
  tone = "default",
}: {
  title: string;
  icon: any;
  count: number;
  children: React.ReactNode;
  linkTo: any;
  linkLabel: string;
  empty: string;
  tone?: "default" | "info";
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className={`flex items-center justify-between border-b border-gray-100 px-5 py-3 ${tone === "info" ? "bg-amber-50" : ""}`}>
        <div className="flex items-center gap-2">
          <Icon size={16} className="text-gray-600" />
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {count > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">{count}</span>
          )}
        </div>
        <Link to={linkTo} className="text-xs font-semibold text-blue-700 hover:text-blue-900">
          {linkLabel} →
        </Link>
      </div>
      <div className="px-5 py-2">
        {count === 0 ? (
          <p className="py-3 text-sm italic text-gray-400">{empty}</p>
        ) : (
          <ul className="divide-y divide-gray-100">{children}</ul>
        )}
      </div>
    </div>
  );
}
