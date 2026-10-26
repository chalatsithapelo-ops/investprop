import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  ShieldCheck,
  Building2,
  Layers,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  AlertTriangle,
  RefreshCw,
  PieChart,
  FileText,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import { useBlockPropertyOwner } from "~/utils/use-require-role";

export const Route = createFileRoute("/share-integrity/")({
  component: ShareIntegrityPage,
});

const fmt = (n: number) =>
  `R${(n ?? 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${(n ?? 0).toFixed(2)}%`;

const SOURCE_LABEL: Record<string, string> = {
  ISSUE: "Primary issuance",
  ISSUANCE: "Primary issuance",
  PURCHASE: "Market purchase",
  BUY: "Market purchase",
  TRANSFER_IN: "Transfer in",
  TRANSFER_OUT: "Transfer out",
  SALE: "Market sale",
  SELL: "Market sale",
  DISTRIBUTION: "Distribution",
};

const VALUATION_LABEL: Record<string, string> = {
  NAV: "Net asset value",
  LAST_TRADE: "Last traded price",
  ISSUE_PRICE: "Issue price",
};

function ShareIntegrityPage() {
  const trpc = useTRPC();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const isManager =
    user?.role === "DEVELOPMENT_MANAGER" ||
    user?.role === "PROJECT_MANAGER" ||
    user?.role === "ADMIN";
  useBlockPropertyOwner();

  const [tab, setTab] = useState<"provenance" | "audit">(isManager ? "audit" : "provenance");

  const provenanceQuery = useQuery({
    ...trpc.getShareProvenance.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
  });
  const provenance = provenanceQuery.data as any;

  const auditQuery = useQuery({
    ...trpc.auditShareConservation.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isManager,
  });
  const audit = auditQuery.data as any;

  const holdings = (provenance?.holdings ?? []) as any[];
  const auditClasses = (audit?.classes ?? []) as any[];

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 p-3">
            <ShieldCheck className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Share Integrity &amp; Provenance</h1>
            <p className="text-gray-500">
              Trace every share back to its property and SPV, see how it was valued, and prove no
              duplicate or phantom shares exist.
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex flex-wrap gap-2 border-b border-gray-200/10">
          <button
            onClick={() => setTab("provenance")}
            className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === "provenance"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            <PieChart className="h-4 w-4" /> My Holdings Provenance
          </button>
          {isManager && (
            <button
              onClick={() => setTab("audit")}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition ${
                tab === "audit"
                  ? "border-emerald-500 text-emerald-400"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              <ShieldCheck className="h-4 w-4" /> Conservation Audit
            </button>
          )}
        </div>

        {/* ─── Provenance ─── */}
        {tab === "provenance" && (
          <div>
            <div className="mb-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-gray-200/10 bg-navy-900 p-5">
                <div className="text-sm text-gray-500">Holdings</div>
                <div className="mt-1 text-2xl font-bold text-gray-900">{provenance?.holdingCount ?? 0}</div>
              </div>
              <div className="rounded-2xl border border-gray-200/10 bg-navy-900 p-5">
                <div className="text-sm text-gray-500">Total invested</div>
                <div className="mt-1 text-2xl font-bold text-gray-900">{fmt(provenance?.totalInvested ?? 0)}</div>
              </div>
              <div className="rounded-2xl border border-gray-200/10 bg-navy-900 p-5">
                <div className="text-sm text-gray-500">Current value</div>
                <div className="mt-1 text-2xl font-bold text-gray-900">{fmt(provenance?.totalCurrentValue ?? 0)}</div>
              </div>
            </div>

            {provenanceQuery.isLoading ? (
              <p className="text-sm text-gray-500">Loading your holdings…</p>
            ) : holdings.length === 0 ? (
              <div className="rounded-2xl border border-gray-200/10 bg-navy-900 p-8 text-center text-gray-500">
                You don&apos;t hold any shares yet.
              </div>
            ) : (
              <div className="space-y-4">
                {holdings.map((h) => {
                  const gain = h.unrealizedGain ?? 0;
                  return (
                    <div key={h.holdingId} className="rounded-2xl border border-gray-200/10 bg-navy-900 p-6">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        {/* Property → SPV chain */}
                        <div>
                          <div className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                            <Building2 className="h-5 w-5 text-emerald-400" />
                            {h.property?.title}
                          </div>
                          <div className="mt-1 text-sm text-gray-500">
                            {h.property?.address}
                            {h.property?.city ? `, ${h.property.city}` : ""}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            <span className="flex items-center gap-1 rounded-lg border border-gray-200/10 bg-navy-950 px-2 py-1 text-gray-400">
                              <Layers className="h-3 w-3" /> {h.shareClass?.name}
                            </span>
                            {h.spv && (
                              <span className="flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-2 py-1 text-emerald-400">
                                <FileText className="h-3 w-3" /> SPV: {h.spv.name}
                                {h.spv.registrationNumber ? ` (${h.spv.registrationNumber})` : ""}
                                {h.spv.status ? ` • ${h.spv.status}` : ""}
                              </span>
                            )}
                          </div>
                        </div>
                        {/* Valuation */}
                        <div className="text-right">
                          <div className="text-2xl font-bold text-gray-900">{fmt(h.currentValue)}</div>
                          <div
                            className={`flex items-center justify-end gap-1 text-sm ${
                              gain >= 0 ? "text-green-400" : "text-red-400"
                            }`}
                          >
                            {gain >= 0 ? (
                              <TrendingUp className="h-4 w-4" />
                            ) : (
                              <TrendingDown className="h-4 w-4" />
                            )}
                            {gain >= 0 ? "+" : ""}
                            {fmt(gain)}
                          </div>
                        </div>
                      </div>

                      {/* Metrics grid */}
                      <div className="mt-4 grid gap-3 border-t border-gray-200/10 pt-4 text-sm sm:grid-cols-4">
                        <div>
                          <div className="text-xs text-gray-500">Shares owned</div>
                          <div className="font-semibold text-gray-900">
                            {h.sharesOwned.toLocaleString()} / {h.totalShares.toLocaleString()}
                          </div>
                          <div className="text-xs text-gray-500">{pct(h.ownershipPercentage)} of class</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Avg. cost / share</div>
                          <div className="font-semibold text-gray-900">{fmt(h.averageCostPerShare)}</div>
                          <div className="text-xs text-gray-500">Invested {fmt(h.investedAmount)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Current value / share</div>
                          <div className="font-semibold text-gray-900">{fmt(h.valuationPerShare)}</div>
                          <div className="text-xs text-gray-500">
                            via {VALUATION_LABEL[h.valuationSource] ?? h.valuationSource}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500">Ledger entries</div>
                          <div className="font-semibold text-gray-900">{h.ledgerEntryCount}</div>
                          <div className="text-xs text-gray-500">provenance records</div>
                        </div>
                      </div>

                      {/* How shares were acquired */}
                      {h.acquiredBySource && Object.keys(h.acquiredBySource).length > 0 && (
                        <div className="mt-4 border-t border-gray-200/10 pt-4">
                          <div className="mb-2 text-xs font-medium text-gray-500">How these shares were acquired</div>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(h.acquiredBySource).map(([src, qty]) => (
                              <span
                                key={src}
                                className="rounded-lg border border-gray-200/10 bg-navy-950 px-3 py-1 text-xs text-gray-300"
                              >
                                {SOURCE_LABEL[src] ?? src}:{" "}
                                <span className="font-semibold">{Number(qty).toLocaleString()}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── Conservation Audit (manager) ─── */}
        {tab === "audit" && isManager && (
          <div>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div
                className={`flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium ${
                  audit?.overallBalanced
                    ? "border-green-500/30 bg-green-500/10 text-green-400"
                    : "border-red-500/30 bg-red-500/10 text-red-400"
                }`}
              >
                {audit?.overallBalanced ? (
                  <>
                    <CheckCircle className="h-4 w-4" /> All {audit?.classCount ?? 0} share classes balance — no
                    duplicate or phantom shares
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4" /> Integrity issues detected — review flagged classes
                    below
                  </>
                )}
              </div>
              <button
                onClick={() => auditQuery.refetch()}
                className="flex items-center gap-1 text-sm text-gray-400 hover:text-emerald-400"
              >
                <RefreshCw className="h-4 w-4" /> Re-run audit
              </button>
            </div>

            {auditQuery.isLoading ? (
              <p className="text-sm text-gray-500">Running conservation audit…</p>
            ) : auditClasses.length === 0 ? (
              <div className="rounded-2xl border border-gray-200/10 bg-navy-900 p-8 text-center text-gray-500">
                No share classes to audit.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-gray-200/10 bg-navy-900">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200/10 text-left text-gray-500">
                      <th className="px-4 py-3">Share class</th>
                      <th className="px-4 py-3">SPV</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Issued</th>
                      <th className="px-4 py-3 text-right">Available</th>
                      <th className="px-4 py-3 text-right">Reserved</th>
                      <th className="px-4 py-3 text-right">Holders</th>
                      <th className="px-4 py-3 text-right">Value/share</th>
                      <th className="px-4 py-3 text-right">Market cap</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditClasses.map((c) => (
                      <tr key={c.shareClassId} className="border-b border-gray-200/5">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{c.shareClassName}</div>
                          <div className="text-xs text-gray-500">{c.property?.title}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-400">
                          {c.spv?.name ?? "—"}
                          {c.spv?.registrationNumber && (
                            <span className="block text-xs text-gray-500">{c.spv.registrationNumber}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300">{c.totalShares.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-gray-300">{c.issued.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-gray-300">{c.available.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-gray-300">
                          {c.reservedInSettlements.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300">{c.holders}</td>
                        <td className="px-4 py-3 text-right text-gray-300">
                          {fmt(c.valuationPerShare)}
                          <span className="block text-xs text-gray-500">
                            {VALUATION_LABEL[c.valuationSource] ?? c.valuationSource}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-300">{fmt(c.marketCap)}</td>
                        <td className="px-4 py-3">
                          {c.balanced ? (
                            <span className="inline-flex items-center gap-1 rounded border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-xs text-green-400">
                              <CheckCircle className="h-3 w-3" /> Balanced
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs text-red-400"
                              title={
                                c.overIssued
                                  ? `Over-issued by ${c.overIssued}`
                                  : !c.ledgerBalanced
                                    ? `${c.ledgerDiscrepancies?.length ?? 0} ledger discrepancy(ies)`
                                    : "Unbalanced"
                              }
                            >
                              <AlertTriangle className="h-3 w-3" />
                              {c.overIssued ? `Over-issued ${c.overIssued}` : "Discrepancy"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-4 flex items-start gap-2 rounded-xl border border-gray-200/10 bg-navy-900 p-3 text-xs text-gray-500">
              <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
              <span>
                &quot;Balanced&quot; means issued shares never exceed the class total (no phantom/duplicate
                shares) and every holding reconciles exactly to its signed ledger history. Reserved shares are
                locked in open trade settlements awaiting payment.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
