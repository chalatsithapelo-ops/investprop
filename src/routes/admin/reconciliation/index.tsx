import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Navbar } from "~/components/Navbar";
import { useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";
import { CheckCircle2, AlertTriangle, XCircle, Upload } from "lucide-react";

export const Route = createFileRoute("/admin/reconciliation/")({
  component: ReconciliationPage,
});

interface MatchRow {
  reference: string;
  csvAmount: number;
  payoutId: number;
  payoutNet: number;
  delta: number;
  investorName: string | null;
  currentStatus: string;
  paidAt: string | null;
}
interface Unmatched {
  reference: string;
  amount: number;
  paidAt?: string;
}

function parseCsv(text: string): Array<{ reference: string; amount: number; paidAt?: string }> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  // Skip header if first line contains 'reference' or 'ref' (case-insensitive)
  const hasHeader = /reference|ref/i.test(lines[0]!) && /amount/i.test(lines[0]!);
  const dataLines = hasHeader ? lines.slice(1) : lines;
  const rows: Array<{ reference: string; amount: number; paidAt?: string }> = [];
  for (const line of dataLines) {
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cols.length < 2) continue;
    const [reference, amountStr, paidAt] = cols;
    const amount = Number(amountStr);
    if (!reference || !Number.isFinite(amount)) continue;
    rows.push({ reference, amount, paidAt: paidAt || undefined });
  }
  return rows;
}

function ReconciliationPage() {
  const trpcClient = useTRPCClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [csv, setCsv] = useState("");
  const [matched, setMatched] = useState<MatchRow[]>([]);
  const [unmatched, setUnmatched] = useState<Unmatched[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [notesByPayout, setNotesByPayout] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const isAdmin = user?.role === "ADMIN" || user?.role === "DEVELOPMENT_MANAGER";

  if (!user || !authToken) return null;

  const handleRun = async () => {
    const rows = parseCsv(csv);
    if (rows.length === 0) {
      toast.error("No valid rows found. CSV format: reference,amount[,paidAt]");
      return;
    }
    setSubmitting(true);
    try {
      const result = await trpcClient.reconcilePayouts.mutate({ authToken: authToken!, rows });
      setMatched(result.matched);
      setUnmatched(result.unmatched);
      toast.success(`${result.matched.length} matched, ${result.unmatched.length} unmatched, ${result.mismatchCount} mismatched`);
    } catch (e: any) {
      toast.error(e.message ?? "Reconciliation failed");
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkPaid = async (row: MatchRow) => {
    const notes = notesByPayout[row.payoutId] ?? "";
    setSubmitting(true);
    try {
      await trpcClient.markPayoutReconciled.mutate({
        authToken: authToken!,
        payoutId: row.payoutId,
        csvAmount: row.csvAmount,
        paidAt: row.paidAt ?? undefined,
        notes: notes || undefined,
      });
      toast.success(`Payout #${row.payoutId} marked PAID`);
      setMatched((m) => m.filter((r) => r.payoutId !== row.payoutId));
    } catch (e: any) {
      toast.error(e.message ?? "Failed to mark paid");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy-950 text-gray-900">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="mb-2 text-2xl font-bold text-white">Payout Reconciliation</h1>
        <p className="mb-6 text-sm text-gray-400">
          Paste a CSV exported from Paystack / your bank. Format:{" "}
          <code className="rounded bg-navy-900 px-1 text-gold-400">reference,amount,paidAt</code>{" "}
          (paidAt optional, ISO 8601). Header row is auto-detected.
        </p>

        {!isAdmin && (
          <div className="mb-6 rounded-lg border border-red-500/50 bg-red-500/10 p-4 text-red-300">
            Reconciliation is restricted to administrators.
          </div>
        )}

        {isAdmin && (
          <>
            <textarea
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              rows={10}
              placeholder={`reference,amount,paidAt\nPAYREF-001,1250.00,2026-06-01\nPAYREF-002,840.50,2026-06-01`}
              className="w-full rounded-xl border border-navy-700 bg-navy-900 p-3 font-mono text-sm text-white placeholder-gray-500 focus:border-gold-500 focus:outline-none"
            />
            <div className="mt-3 flex gap-3">
              <button
                onClick={handleRun}
                disabled={submitting || !csv.trim()}
                className="inline-flex items-center gap-2 rounded-lg bg-gold-600 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-700 disabled:opacity-50"
              >
                <Upload size={16} /> {submitting ? "Matching..." : "Run reconciliation"}
              </button>
              <button
                onClick={() => { setCsv(""); setMatched([]); setUnmatched([]); }}
                className="rounded-lg border border-navy-700 px-4 py-2 text-sm text-gray-300 hover:bg-navy-800"
              >
                Clear
              </button>
            </div>

            {matched.length > 0 && (
              <div className="mt-8">
                <h2 className="mb-3 text-lg font-semibold text-white">Matched ({matched.length})</h2>
                <div className="overflow-x-auto rounded-xl border border-navy-800/50">
                  <table className="w-full text-sm">
                    <thead className="bg-navy-900/80 text-xs uppercase text-gray-400">
                      <tr>
                        <th className="px-3 py-2 text-left">Reference</th>
                        <th className="px-3 py-2 text-left">Investor</th>
                        <th className="px-3 py-2 text-right">CSV amount</th>
                        <th className="px-3 py-2 text-right">Expected</th>
                        <th className="px-3 py-2 text-right">Δ</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2 text-left">Notes (required if Δ ≠ 0)</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-navy-800/50">
                      {matched.map((r) => {
                        const mismatch = Math.abs(r.delta) > 0.01;
                        return (
                          <tr key={r.payoutId} className="bg-navy-900/30 text-white">
                            <td className="px-3 py-2 font-mono text-xs">{r.reference}</td>
                            <td className="px-3 py-2">{r.investorName ?? "—"}</td>
                            <td className="px-3 py-2 text-right">R{r.csvAmount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</td>
                            <td className="px-3 py-2 text-right">R{r.payoutNet.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</td>
                            <td className={`px-3 py-2 text-right font-semibold ${mismatch ? "text-red-400" : "text-emerald-400"}`}>
                              {mismatch ? <span className="inline-flex items-center gap-1"><AlertTriangle size={12} /> {r.delta.toFixed(2)}</span> : <span className="inline-flex items-center gap-1"><CheckCircle2 size={12} /> match</span>}
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-400">{r.currentStatus}</td>
                            <td className="px-3 py-2">
                              {mismatch && (
                                <input
                                  value={notesByPayout[r.payoutId] ?? ""}
                                  onChange={(e) => setNotesByPayout({ ...notesByPayout, [r.payoutId]: e.target.value })}
                                  placeholder="Reason for override"
                                  className="w-full rounded border border-red-500/50 bg-navy-900 px-2 py-1 text-xs text-white"
                                />
                              )}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                onClick={() => handleMarkPaid(r)}
                                disabled={submitting || r.currentStatus === "PAID"}
                                className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                              >
                                Mark PAID
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {unmatched.length > 0 && (
              <div className="mt-8">
                <h2 className="mb-3 text-lg font-semibold text-white">Unmatched ({unmatched.length})</h2>
                <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3">
                  <p className="mb-3 flex items-center gap-2 text-sm text-red-300">
                    <XCircle size={14} /> These CSV references do not correspond to any DistributionPayout.paymentRef in the database.
                  </p>
                  <ul className="space-y-1 text-xs font-mono text-gray-300">
                    {unmatched.map((u, i) => (
                      <li key={i}>{u.reference} — R{u.amount.toFixed(2)} {u.paidAt ? `(${u.paidAt})` : ""}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
