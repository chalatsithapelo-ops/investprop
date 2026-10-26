import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { Navbar } from "~/components/Navbar";
import { useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";
import { BookOpen, RotateCcw, Users, Scale } from "lucide-react";

export const Route = createFileRoute("/admin/ledger/")({
  component: LedgerPage,
});

const ZAR = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 2 }).format(n);

interface TrialBalanceRow {
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
  balance: number;
}
interface CapitalRow {
  investorId: number;
  investorName: string;
  contributed: number;
  returned: number;
  balance: number;
}
interface LedgerLine {
  id: number;
  accountCode: string;
  accountName: string;
  accountType: string;
  debit: number;
  credit: number;
  memo: string | null;
  investorId: number | null;
}
interface LedgerEntry {
  id: number;
  kind: string;
  entryDate: string;
  description: string;
  reference: string | null;
  status: string;
  reversedByEntryId: number | null;
  reversesEntryId: number | null;
  postedBy: { id: number; name: string } | null;
  lines: LedgerLine[];
}

function LedgerPage() {
  const trpcClient = useTRPCClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [properties, setProperties] = useState<Array<{ id: number; title: string }>>([]);
  const [propertyId, setPropertyId] = useState<number | null>(null);
  const [trialBalance, setTrialBalance] = useState<{
    rows: TrialBalanceRow[];
    totalDebit: number;
    totalCredit: number;
    balanced: boolean;
  } | null>(null);
  const [capital, setCapital] = useState<CapitalRow[]>([]);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const isManager =
    user?.role === "ADMIN" || user?.role === "DEVELOPMENT_MANAGER" || user?.role === "PROJECT_MANAGER";

  useEffect(() => {
    if (!authToken || !isManager) return;
    (async () => {
      try {
        const res = await trpcClient.getProperties.query({ type: "development", limit: 100 });
        const list = (res.properties as any[]).map((p) => ({ id: p.id, title: p.title }));
        setProperties(list);
        if (list.length > 0 && propertyId === null) setPropertyId(list[0]!.id);
      } catch (e: any) {
        toast.error(e.message ?? "Failed to load projects");
      }
    })();
  }, [authToken, isManager]);

  const loadLedger = useCallback(
    async (pid: number) => {
      if (!authToken) return;
      setLoading(true);
      try {
        const [tb, caps, ents] = await Promise.all([
          trpcClient.getTrialBalance.query({ authToken, propertyId: pid }),
          trpcClient.getCapitalAccounts.query({ authToken, propertyId: pid }),
          trpcClient.getLedgerEntries.query({ authToken, propertyId: pid }),
        ]);
        setTrialBalance(tb as any);
        setCapital(caps as any);
        setEntries(ents as any);
      } catch (e: any) {
        toast.error(e.message ?? "Failed to load ledger");
      } finally {
        setLoading(false);
      }
    },
    [authToken, trpcClient]
  );

  useEffect(() => {
    if (propertyId !== null) loadLedger(propertyId);
  }, [propertyId, loadLedger]);

  const handleReverse = async (entry: LedgerEntry) => {
    if (propertyId === null) return;
    const reason = window.prompt(`Reason for reversing entry #${entry.id} (${entry.description})?`);
    if (!reason || reason.trim().length < 3) {
      if (reason !== null) toast.error("A reason of at least 3 characters is required");
      return;
    }
    try {
      await trpcClient.reverseJournalEntry.mutate({
        authToken: authToken!,
        propertyId,
        entryId: entry.id,
        reason: reason.trim(),
      });
      toast.success(`Entry #${entry.id} reversed`);
      loadLedger(propertyId);
    } catch (e: any) {
      toast.error(e.message ?? "Reversal failed");
    }
  };

  if (!user || !authToken) return null;

  return (
    <div className="min-h-screen bg-navy-950 text-gray-900">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <BookOpen className="h-7 w-7 text-gold-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">General Ledger</h1>
            <p className="text-sm text-gray-400">
              Immutable double-entry ledger — IFRS 15 revenue, VAT, investor capital accounts and
              provisions per development project.
            </p>
          </div>
        </div>

        {!isManager && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-300">
            The general ledger is restricted to development managers and administrators.
          </div>
        )}

        {isManager && (
          <>
            <div className="mb-6 flex items-center gap-3">
              <label className="text-sm font-medium text-gray-300">Project</label>
              <select
                value={propertyId ?? ""}
                onChange={(e) => setPropertyId(Number(e.target.value))}
                className="rounded-lg border border-navy-700 bg-navy-900 px-3 py-2 text-sm text-white"
              >
                {properties.length === 0 && <option value="">No development projects</option>}
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
              {loading && <span className="text-sm text-gray-400">Loading…</span>}
            </div>

            {/* Trial balance */}
            <section className="mb-8 rounded-xl border border-navy-800 bg-navy-900/60 p-5">
              <div className="mb-4 flex items-center gap-2">
                <Scale className="h-5 w-5 text-gold-400" />
                <h2 className="text-lg font-semibold text-white">Trial Balance</h2>
                {trialBalance && (
                  <span
                    className={`ml-auto rounded-full px-3 py-1 text-xs font-medium ${
                      trialBalance.balanced
                        ? "bg-green-500/20 text-green-300"
                        : "bg-red-500/20 text-red-300"
                    }`}
                  >
                    {trialBalance.balanced ? "Balanced" : "OUT OF BALANCE"}
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-navy-700 text-left text-gray-400">
                      <th className="py-2 pr-4">Code</th>
                      <th className="py-2 pr-4">Account</th>
                      <th className="py-2 pr-4">Type</th>
                      <th className="py-2 pr-4 text-right">Debit</th>
                      <th className="py-2 pr-4 text-right">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trialBalance?.rows.length ? (
                      trialBalance.rows.map((r) => (
                        <tr key={r.code} className="border-b border-navy-800/60 text-gray-200">
                          <td className="py-2 pr-4 font-mono text-gold-400">{r.code}</td>
                          <td className="py-2 pr-4">{r.name}</td>
                          <td className="py-2 pr-4 text-xs text-gray-400">{r.type}</td>
                          <td className="py-2 pr-4 text-right">{r.debit ? ZAR(r.debit) : "—"}</td>
                          <td className="py-2 pr-4 text-right">{r.credit ? ZAR(r.credit) : "—"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-4 text-center text-gray-500">
                          No postings yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {trialBalance && trialBalance.rows.length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-navy-600 font-semibold text-white">
                        <td className="py-2 pr-4" colSpan={3}>
                          Total
                        </td>
                        <td className="py-2 pr-4 text-right">{ZAR(trialBalance.totalDebit)}</td>
                        <td className="py-2 pr-4 text-right">{ZAR(trialBalance.totalCredit)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </section>

            {/* Capital accounts */}
            <section className="mb-8 rounded-xl border border-navy-800 bg-navy-900/60 p-5">
              <div className="mb-4 flex items-center gap-2">
                <Users className="h-5 w-5 text-gold-400" />
                <h2 className="text-lg font-semibold text-white">Investor Capital Accounts</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-navy-700 text-left text-gray-400">
                      <th className="py-2 pr-4">Investor</th>
                      <th className="py-2 pr-4 text-right">Contributed</th>
                      <th className="py-2 pr-4 text-right">Returned</th>
                      <th className="py-2 pr-4 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {capital.length ? (
                      capital.map((c) => (
                        <tr key={c.investorId} className="border-b border-navy-800/60 text-gray-200">
                          <td className="py-2 pr-4">{c.investorName}</td>
                          <td className="py-2 pr-4 text-right">{ZAR(c.contributed)}</td>
                          <td className="py-2 pr-4 text-right">{ZAR(c.returned)}</td>
                          <td className="py-2 pr-4 text-right font-semibold text-white">
                            {ZAR(c.balance)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="py-4 text-center text-gray-500">
                          No capital contributions recorded.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Journal entries */}
            <section className="rounded-xl border border-navy-800 bg-navy-900/60 p-5">
              <h2 className="mb-4 text-lg font-semibold text-white">Journal Entries</h2>
              <div className="space-y-4">
                {entries.length ? (
                  entries.map((e) => (
                    <div
                      key={e.id}
                      className={`rounded-lg border p-4 ${
                        e.status === "REVERSED"
                          ? "border-navy-800 bg-navy-950/50 opacity-70"
                          : "border-navy-700 bg-navy-950/40"
                      }`}
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-gray-500">#{e.id}</span>
                        <span className="rounded bg-navy-800 px-2 py-0.5 text-xs text-gold-400">
                          {e.kind}
                        </span>
                        <span className="text-sm font-medium text-white">{e.description}</span>
                        {e.status === "REVERSED" && (
                          <span className="rounded bg-red-500/20 px-2 py-0.5 text-xs text-red-300">
                            REVERSED → #{e.reversedByEntryId}
                          </span>
                        )}
                        {e.kind === "REVERSAL" && e.reversesEntryId && (
                          <span className="rounded bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">
                            reverses #{e.reversesEntryId}
                          </span>
                        )}
                        <span className="ml-auto text-xs text-gray-500">
                          {new Date(e.entryDate).toLocaleDateString("en-ZA")}
                          {e.postedBy ? ` · ${e.postedBy.name}` : ""}
                        </span>
                        {e.status === "POSTED" && e.kind !== "REVERSAL" && (
                          <button
                            onClick={() => handleReverse(e)}
                            className="inline-flex items-center gap-1 rounded bg-red-500/10 px-2 py-1 text-xs text-red-300 hover:bg-red-500/20"
                          >
                            <RotateCcw className="h-3 w-3" /> Reverse
                          </button>
                        )}
                      </div>
                      <table className="w-full text-xs">
                        <tbody>
                          {e.lines.map((l) => (
                            <tr key={l.id} className="text-gray-300">
                              <td className="py-1 pr-2 font-mono text-gold-400">{l.accountCode}</td>
                              <td className="py-1 pr-2">{l.accountName}</td>
                              <td className="py-1 pr-2 text-gray-500">{l.memo}</td>
                              <td className="py-1 pr-2 text-right">
                                {l.debit ? ZAR(l.debit) : ""}
                              </td>
                              <td className="py-1 pr-2 text-right">
                                {l.credit ? ZAR(l.credit) : ""}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))
                ) : (
                  <p className="py-4 text-center text-gray-500">No journal entries yet.</p>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
