import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import {
  Wallet,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Banknote,
  RefreshCw,
  ExternalLink,
  ClipboardCheck,
  AlertTriangle,
  TrendingUp,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import { useBlockPropertyOwner } from "~/utils/use-require-role";
import toast from "react-hot-toast";

export const Route = createFileRoute("/wallet/")({
  component: WalletPage,
});

type TabKey = "overview" | "transactions" | "withdraw" | "queue";

const fmt = (n: number) =>
  `R${(n ?? 0).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const TXN_META: Record<string, { label: string; incoming: boolean }> = {
  DEPOSIT: { label: "Wallet funding", incoming: true },
  TRADE_CREDIT: { label: "Trade proceeds", incoming: true },
  REFUND: { label: "Refund", incoming: true },
  WITHDRAWAL: { label: "Withdrawal", incoming: false },
  TRADE_DEBIT: { label: "Trade settlement", incoming: false },
  FEE: { label: "Platform fee", incoming: false },
  ADJUSTMENT: { label: "Adjustment", incoming: true },
};

function statusBadge(status: string) {
  const map: Record<string, string> = {
    COMPLETED: "bg-green-500/10 text-green-400 border-green-500/30",
    PAID: "bg-green-500/10 text-green-400 border-green-500/30",
    PENDING: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    REQUESTED: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    APPROVED: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    PROCESSING: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    FAILED: "bg-red-500/10 text-red-400 border-red-500/30",
    REJECTED: "bg-red-500/10 text-red-400 border-red-500/30",
    REVERSED: "bg-gray-500/10 text-gray-400 border-gray-500/30",
  };
  return map[status] ?? "bg-gray-500/10 text-gray-400 border-gray-500/30";
}

function WalletPage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const qc = useQueryClient();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const isManager =
    user?.role === "DEVELOPMENT_MANAGER" ||
    user?.role === "PROJECT_MANAGER" ||
    user?.role === "ADMIN";
  useBlockPropertyOwner();

  const [tab, setTab] = useState<TabKey>("overview");
  const [fundAmount, setFundAmount] = useState("");
  const [funding, setFunding] = useState(false);

  // Withdrawal form
  const [wdAmount, setWdAmount] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [branchCode, setBranchCode] = useState("");
  const [wdSubmitting, setWdSubmitting] = useState(false);

  // Manager review
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // ─── Queries ────────────────────────────────────────────────
  const walletQuery = useQuery({
    ...trpc.getMyWallet.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
    refetchInterval: 20000,
  });
  const wallet = walletQuery.data as any;

  const withdrawalsQuery = useQuery({
    ...trpc.getMyWithdrawals.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
  });
  const myWithdrawals = (withdrawalsQuery.data ?? []) as any[];

  const queueQuery = useQuery({
    ...trpc.getPendingWithdrawals.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isManager,
    refetchInterval: 30000,
  });
  const queue = (queueQuery.data ?? []) as any[];

  const feeScheduleQuery = useQuery({
    ...trpc.getOwnerFeeSchedule.queryOptions(),
    enabled: !!authToken,
  });
  const feeSchedule = feeScheduleQuery.data as any;

  // ─── Paystack callback auto-verify ──────────────────────────
  useEffect(() => {
    if (!authToken) return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("reference") ?? params.get("trxref") ?? params.get("verify");
    if (!ref) return;
    (async () => {
      try {
        const result = (await (trpcClient as any).verifyWalletDeposit.mutate({
          authToken,
          reference: ref,
        })) as any;
        if (result.confirmed) {
          toast.success(
            result.alreadyProcessed
              ? "Deposit already credited."
              : `Wallet funded! ${result.tradesAutoSettled > 0 ? `${result.tradesAutoSettled} trade(s) auto-settled.` : ""}`,
          );
          qc.invalidateQueries({ queryKey: trpc.getMyWallet.queryKey() });
        } else {
          toast.error(`Deposit not completed (status: ${result.status}).`);
        }
      } catch (e: any) {
        toast.error(e.message ?? "Could not verify deposit");
      } finally {
        // Clean the URL so refreshes don't re-trigger.
        window.history.replaceState({}, "", "/wallet");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  // ─── Fund wallet ────────────────────────────────────────────
  async function handleFund() {
    const amt = Number(fundAmount);
    if (!amt || amt < 10) {
      toast.error("Minimum deposit is R10");
      return;
    }
    setFunding(true);
    try {
      const result = (await (trpcClient as any).initiateWalletDeposit.mutate({
        authToken: authToken ?? "",
        amountRands: amt,
        callbackUrl: `${window.location.origin}/wallet`,
      })) as any;
      toast.success("Redirecting to Paystack checkout…");
      window.location.href = result.authorizationUrl;
    } catch (e: any) {
      toast.error(e.message ?? "Could not start deposit");
    } finally {
      setFunding(false);
    }
  }

  // ─── Request withdrawal ─────────────────────────────────────
  async function handleWithdraw() {
    const amt = Number(wdAmount);
    if (!amt || amt < 100) {
      toast.error("Minimum withdrawal is R100");
      return;
    }
    if (wallet && amt > wallet.balanceRands) {
      toast.error("Amount exceeds your available balance");
      return;
    }
    if (!bankName.trim() || !accountNumber.trim() || !accountName.trim()) {
      toast.error("Enter your bank name, account number and account holder name");
      return;
    }
    setWdSubmitting(true);
    try {
      await (trpcClient as any).requestWithdrawal.mutate({
        authToken: authToken ?? "",
        amountRands: amt,
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        accountName: accountName.trim(),
        branchCode: branchCode.trim() || undefined,
      });
      toast.success("Withdrawal requested. A manager will process your payout.");
      setWdAmount("");
      setBankName("");
      setAccountNumber("");
      setAccountName("");
      setBranchCode("");
      qc.invalidateQueries({ queryKey: trpc.getMyWallet.queryKey() });
      qc.invalidateQueries({ queryKey: trpc.getMyWithdrawals.queryKey() });
    } catch (e: any) {
      toast.error(e.message ?? "Withdrawal request failed");
    } finally {
      setWdSubmitting(false);
    }
  }

  // ─── Review withdrawal (manager) ────────────────────────────
  async function handleReview(withdrawalId: number, action: "MARK_PAID" | "REJECT") {
    if (action === "REJECT" && !reviewNotes.trim()) {
      toast.error("Provide a reason for rejection");
      return;
    }
    setReviewSubmitting(true);
    try {
      await (trpcClient as any).reviewWithdrawal.mutate({
        authToken: authToken ?? "",
        withdrawalId,
        action,
        reviewNotes: reviewNotes.trim() || undefined,
      });
      toast.success(action === "MARK_PAID" ? "Marked as paid." : "Withdrawal rejected, funds returned.");
      setReviewingId(null);
      setReviewNotes("");
      qc.invalidateQueries({ queryKey: trpc.getPendingWithdrawals.queryKey() });
    } catch (e: any) {
      toast.error(e.message ?? "Could not process withdrawal");
    } finally {
      setReviewSubmitting(false);
    }
  }

  const balanceRands = wallet?.balanceRands ?? 0;
  const pendingWithdrawalRands = (wallet?.pendingWithdrawalCents ?? 0) / 100;
  const transactions = (wallet?.transactions ?? []) as any[];

  const tabs: { key: TabKey; label: string; icon: any; show: boolean }[] = [
    { key: "overview", label: "Overview", icon: Wallet, show: true },
    { key: "transactions", label: "Transactions", icon: Clock, show: true },
    { key: "withdraw", label: "Withdraw", icon: ArrowUpRight, show: true },
    { key: "queue", label: "Withdrawal Queue", icon: ClipboardCheck, show: isManager },
  ];

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <div className="rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 p-3">
            <Wallet className="h-8 w-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Wallet</h1>
            <p className="text-gray-500">
              Fund by EFT or card, settle share trades instantly, and withdraw your proceeds.
            </p>
          </div>
        </div>

        {/* Balance card */}
        <div className="mb-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-600/10 to-violet-600/10 p-6">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Banknote className="h-4 w-4" /> Available balance
            </div>
            <div className="mt-2 text-3xl font-bold text-gray-900">
              {walletQuery.isLoading ? "…" : fmt(balanceRands)}
            </div>
            <div className="mt-1 text-xs text-gray-500">{wallet?.currency ?? "ZAR"}</div>
          </div>
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-6">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Clock className="h-4 w-4" /> Pending withdrawals
            </div>
            <div className="mt-2 text-3xl font-bold text-gray-900">{fmt(pendingWithdrawalRands)}</div>
            <div className="mt-1 text-xs text-gray-500">Reserved, awaiting payout</div>
          </div>
          <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-6">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <TrendingUp className="h-4 w-4" /> Recent activity
            </div>
            <div className="mt-2 text-3xl font-bold text-gray-900">{transactions.length}</div>
            <div className="mt-1 text-xs text-gray-500">transactions shown</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex flex-wrap gap-2 border-b border-gray-200/10">
          {tabs
            .filter((t) => t.show)
            .map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition ${
                  tab === t.key
                    ? "border-indigo-500 text-indigo-400"
                    : "border-transparent text-gray-500 hover:text-gray-300"
                }`}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
                {t.key === "queue" && queue.length > 0 && (
                  <span className="ml-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400">
                    {queue.length}
                  </span>
                )}
              </button>
            ))}
        </div>

        {/* ─── Overview / Fund ─── */}
        {tab === "overview" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-gray-200/10 bg-navy-900 p-6">
              <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <Plus className="h-5 w-5 text-indigo-400" /> Fund your wallet
              </h2>
              <p className="mb-4 text-sm text-gray-500">
                Pay by instant EFT or card via Paystack. Your balance is credited automatically once
                payment clears — any matched trades awaiting payment settle instantly.
              </p>
              <label className="mb-1 block text-sm font-medium text-gray-400">Amount (ZAR)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={10}
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  placeholder="e.g. 5000"
                  className="flex-1 rounded-xl border border-gray-200/10 bg-navy-950 px-4 py-3 text-gray-900 outline-none focus:border-indigo-500"
                />
                <button
                  onClick={handleFund}
                  disabled={funding}
                  className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
                >
                  {funding ? <Loader2 className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
                  Fund
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {[1000, 5000, 10000, 25000].map((v) => (
                  <button
                    key={v}
                    onClick={() => setFundAmount(String(v))}
                    className="rounded-lg border border-gray-200/10 px-3 py-1 text-sm text-gray-400 hover:border-indigo-500 hover:text-indigo-400"
                  >
                    {fmt(v)}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200/10 bg-navy-900 p-6">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <Clock className="h-5 w-5 text-indigo-400" /> Latest transactions
              </h2>
              {transactions.length === 0 ? (
                <p className="text-sm text-gray-500">No transactions yet. Fund your wallet to get started.</p>
              ) : (
                <div className="space-y-2">
                  {transactions.slice(0, 6).map((t) => {
                    const meta = TXN_META[t.type] ?? { label: t.type, incoming: t.amountRands >= 0 };
                    const incoming = t.amountRands >= 0;
                    return (
                      <div
                        key={t.id}
                        className="flex items-center justify-between rounded-xl border border-gray-200/5 bg-navy-950 px-4 py-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`rounded-lg p-2 ${incoming ? "bg-green-500/10" : "bg-red-500/10"}`}>
                            {incoming ? (
                              <ArrowDownLeft className="h-4 w-4 text-green-400" />
                            ) : (
                              <ArrowUpRight className="h-4 w-4 text-red-400" />
                            )}
                          </div>
                          <div>
                            <div className="text-sm font-medium text-gray-900">{meta.label}</div>
                            <div className="text-xs text-gray-500">{fmtDate(t.createdAt)}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-sm font-semibold ${incoming ? "text-green-400" : "text-red-400"}`}>
                            {incoming ? "+" : ""}
                            {fmt(t.amountRands)}
                          </div>
                          <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] ${statusBadge(t.status)}`}>
                            {t.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Transactions ─── */}
        {tab === "transactions" && (
          <div className="rounded-2xl border border-gray-200/10 bg-navy-900 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">All transactions</h2>
              <button
                onClick={() => walletQuery.refetch()}
                className="flex items-center gap-1 text-sm text-gray-400 hover:text-indigo-400"
              >
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
            </div>
            {transactions.length === 0 ? (
              <p className="text-sm text-gray-500">No transactions yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200/10 text-left text-gray-500">
                      <th className="py-2 pr-4">Type</th>
                      <th className="py-2 pr-4">Description</th>
                      <th className="py-2 pr-4 text-right">Amount</th>
                      <th className="py-2 pr-4 text-right">Balance</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => {
                      const meta = TXN_META[t.type] ?? { label: t.type, incoming: t.amountRands >= 0 };
                      const incoming = t.amountRands >= 0;
                      return (
                        <tr key={t.id} className="border-b border-gray-200/5">
                          <td className="py-2 pr-4 text-gray-300">{meta.label}</td>
                          <td className="py-2 pr-4 text-gray-500">{t.description}</td>
                          <td className={`py-2 pr-4 text-right font-medium ${incoming ? "text-green-400" : "text-red-400"}`}>
                            {incoming ? "+" : ""}
                            {fmt(t.amountRands)}
                          </td>
                          <td className="py-2 pr-4 text-right text-gray-300">{fmt(t.balanceAfterRands)}</td>
                          <td className="py-2 pr-4">
                            <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] ${statusBadge(t.status)}`}>
                              {t.status}
                            </span>
                          </td>
                          <td className="py-2 text-gray-500">{fmtDate(t.createdAt)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ─── Withdraw ─── */}
        {tab === "withdraw" && (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-gray-200/10 bg-navy-900 p-6">
              <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <ArrowUpRight className="h-5 w-5 text-indigo-400" /> Request a withdrawal
              </h2>
              <p className="mb-4 text-sm text-gray-500">
                Cash out your wallet balance to your bank account. Funds are reserved immediately and a
                manager processes the payout. Minimum R100.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-400">Amount (ZAR)</label>
                  <input
                    type="number"
                    min={100}
                    value={wdAmount}
                    onChange={(e) => setWdAmount(e.target.value)}
                    placeholder={`Available: ${fmt(balanceRands)}`}
                    className="w-full rounded-xl border border-gray-200/10 bg-navy-950 px-4 py-3 text-gray-900 outline-none focus:border-indigo-500"
                  />
                </div>
                {feeSchedule?.enabled &&
                  Number(wdAmount) >= 100 &&
                  (() => {
                    const gross = Number(wdAmount);
                    const rawFee =
                      (feeSchedule.withdrawalFlatFee ?? 0) +
                      (gross * (feeSchedule.withdrawalFeePct ?? 0)) / 100;
                    const fee = Math.min(gross, rawFee);
                    const net = Math.max(0, gross - fee);
                    return (
                      <div className="rounded-xl border border-gray-200/10 bg-navy-950 px-4 py-3 text-sm">
                        <div className="flex justify-between text-gray-400">
                          <span>Withdrawal fee</span>
                          <span>− {fmt(fee)}</span>
                        </div>
                        <div className="mt-1 flex justify-between font-semibold text-gray-900">
                          <span>Paid to your bank</span>
                          <span>{fmt(net)}</span>
                        </div>
                      </div>
                    );
                  })()}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-400">Bank name</label>
                    <input
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      placeholder="e.g. FNB"
                      className="w-full rounded-xl border border-gray-200/10 bg-navy-950 px-4 py-3 text-gray-900 outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-400">Branch code</label>
                    <input
                      value={branchCode}
                      onChange={(e) => setBranchCode(e.target.value)}
                      placeholder="optional"
                      className="w-full rounded-xl border border-gray-200/10 bg-navy-950 px-4 py-3 text-gray-900 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-400">Account holder name</label>
                  <input
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    placeholder="As it appears on your bank account"
                    className="w-full rounded-xl border border-gray-200/10 bg-navy-950 px-4 py-3 text-gray-900 outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-400">Account number</label>
                  <input
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    className="w-full rounded-xl border border-gray-200/10 bg-navy-950 px-4 py-3 text-gray-900 outline-none focus:border-indigo-500"
                  />
                </div>
                <button
                  onClick={handleWithdraw}
                  disabled={wdSubmitting}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
                >
                  {wdSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                  Request withdrawal
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200/10 bg-navy-900 p-6">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                <Clock className="h-5 w-5 text-indigo-400" /> My withdrawals
              </h2>
              {myWithdrawals.length === 0 ? (
                <p className="text-sm text-gray-500">No withdrawal requests yet.</p>
              ) : (
                <div className="space-y-2">
                  {myWithdrawals.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center justify-between rounded-xl border border-gray-200/5 bg-navy-950 px-4 py-3"
                    >
                      <div>
                        <div className="text-sm font-medium text-gray-900">{fmt(w.amountRands)}</div>
                        <div className="text-xs text-gray-500">
                          {w.bankName} • {fmtDate(w.createdAt)}
                        </div>
                        {w.reviewNotes && (
                          <div className="mt-1 text-xs text-amber-400">Note: {w.reviewNotes}</div>
                        )}
                      </div>
                      <span className={`inline-block rounded border px-2 py-0.5 text-xs ${statusBadge(w.status)}`}>
                        {w.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── Manager withdrawal queue ─── */}
        {tab === "queue" && isManager && (
          <div className="rounded-2xl border border-gray-200/10 bg-navy-900 p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Pending withdrawals</h2>
              <button
                onClick={() => queueQuery.refetch()}
                className="flex items-center gap-1 text-sm text-gray-400 hover:text-indigo-400"
              >
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
            </div>
            {queue.length === 0 ? (
              <p className="text-sm text-gray-500">No withdrawals awaiting payout.</p>
            ) : (
              <div className="space-y-3">
                {queue.map((w) => (
                  <div key={w.id} className="rounded-xl border border-gray-200/10 bg-navy-950 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold text-gray-900">{fmt(w.amountRands)}</div>
                        <div className="text-sm text-gray-400">
                          {w.investor?.name}{" "}
                          {w.investor?.investorCode && (
                            <span className="text-gray-500">({w.investor.investorCode})</span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {w.bankName} • {w.accountName} • {w.accountNumber}
                          {w.branchCode ? ` • Branch ${w.branchCode}` : ""}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">Requested {fmtDate(w.createdAt)}</div>
                      </div>
                      <span className={`inline-block rounded border px-2 py-0.5 text-xs ${statusBadge(w.status)}`}>
                        {w.status}
                      </span>
                    </div>

                    {reviewingId === w.id ? (
                      <div className="mt-3 space-y-2">
                        <textarea
                          value={reviewNotes}
                          onChange={(e) => setReviewNotes(e.target.value)}
                          placeholder="Notes (required to reject — e.g. payout reference or reason)"
                          rows={2}
                          className="w-full rounded-lg border border-gray-200/10 bg-navy-900 px-3 py-2 text-sm text-gray-900 outline-none focus:border-indigo-500"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => handleReview(w.id, "MARK_PAID")}
                            disabled={reviewSubmitting}
                            className="flex items-center gap-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
                          >
                            <CheckCircle className="h-4 w-4" /> Mark as paid
                          </button>
                          <button
                            onClick={() => handleReview(w.id, "REJECT")}
                            disabled={reviewSubmitting}
                            className="flex items-center gap-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
                          >
                            <XCircle className="h-4 w-4" /> Reject & refund
                          </button>
                          <button
                            onClick={() => {
                              setReviewingId(null);
                              setReviewNotes("");
                            }}
                            className="rounded-lg border border-gray-200/10 px-4 py-2 text-sm text-gray-400 hover:text-gray-200"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3">
                        <button
                          onClick={() => {
                            setReviewingId(w.id);
                            setReviewNotes("");
                          }}
                          className="flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
                        >
                          <ClipboardCheck className="h-4 w-4" /> Process
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>
                Funds are already reserved (debited) when the investor requests a withdrawal. Make the bank
                payout manually, then mark it paid. Rejecting refunds the full amount to the investor&apos;s
                wallet.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
