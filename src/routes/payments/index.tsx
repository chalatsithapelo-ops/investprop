import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef } from "react";
import {
  CreditCard,
  CheckCircle,
  XCircle,
  Zap,
  AlertTriangle,
  RefreshCw,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  Banknote,
  Shield,
  TrendingUp,
  Wallet,
  Send,
  ExternalLink,
  Search,
  Filter,
  Upload,
  FileText,
  Loader2,
  DollarSign,
  Eye,
  User,
  Building,
  ClipboardCheck,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

export const Route = createFileRoute("/payments/")({
  component: PaymentsPage,
});

type TabKey = "overview" | "pay" | "history" | "payouts" | "review";

function PaymentsPage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const qc = useQueryClient();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const isManager = user?.role === "DEVELOPMENT_MANAGER" || user?.role === "PROJECT_MANAGER" || user?.role === "PROPERTY_OWNER";
  const isInvestor = user?.role === "INVESTOR";

  const [tab, setTab] = useState<TabKey>("overview");
  const [payAmount, setPayAmount] = useState("");
  const [payReference, setPayReference] = useState("");
  const [payDescription, setPayDescription] = useState("");
  const [verifyRef, setVerifyRef] = useState("");
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [payoutResults, setPayoutResults] = useState<any>(null);
  const [historyFilter, setHistoryFilter] = useState<"all" | "incoming" | "outgoing">("all");
  const [payMethodChoice, setPayMethodChoice] = useState<"gateway" | "pop">("gateway");
  const [popFile, setPopFile] = useState<File | null>(null);
  const [popPreview, setPopPreview] = useState<string | null>(null);
  const [popSubmitting, setPopSubmitting] = useState(false);
  const popFileRef = useRef<HTMLInputElement>(null);
  const [reviewingPayment, setReviewingPayment] = useState<any>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  // ─── Queries ────────────────────────────────────────────────
  const gatewayQuery = useQuery({
    ...trpc.getPaymentGatewayStatus.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
  });

  // Fetch awaiting-payment contributions for POP upload
  const awaitingQuery = useQuery({
    ...trpc.getMyAwaitingPayment.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isInvestor,
  });
  const awaitingContributions = (awaitingQuery.data as any[]) ?? [];

  const pendingPaymentsQuery = useQuery({
    ...trpc.getPendingPayments.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isManager,
    refetchInterval: 30000,
  });
  const pendingPayments = (pendingPaymentsQuery.data ?? []) as any[];

  const balanceQuery = useQuery({
    ...trpc.getPaystackBalance.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isManager,
  });

  const distributionsQuery = useQuery({
    ...trpc.getDistributions.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isManager,
  });

  const myDistributionsQuery = useQuery({
    ...trpc.getMyDistributions.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isInvestor,
  });

  const portfolioQuery = useQuery({
    ...trpc.getInvestorPortfolio.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isInvestor,
  });

  const shareLedgerQuery = useQuery({
    ...trpc.getShareLedger.queryOptions({ authToken: authToken ?? "", propertyId: 0 }),
    enabled: false, // We'll use it selectively
  });

  // ─── Mutations ──────────────────────────────────────────────
  const payoutMutation = useMutation(
    trpc.initiateDistributionPayout.mutationOptions({
      onSuccess: (data: any) => {
        toast.success(`Payout initiated — ${data.successful} successful, ${data.failed} failed`);
        setPayoutResults(data);
        qc.invalidateQueries({ queryKey: trpc.getDistributions.queryKey() });
      },
      onError: (e: any) => toast.error(e.message),
    })
  );

  const gateway = gatewayQuery.data as any;
  const balances = (balanceQuery.data ?? []) as any[];
  const distributions = (distributionsQuery.data ?? []) as any[];
  const myDistData = myDistributionsQuery.data as any;
  const myPayouts = (myDistData?.payouts ?? []) as any[];
  const myTotalReceived = myDistData?.totalReceived ?? 0;
  const myTotalPending = myDistData?.totalPending ?? 0;
  const portfolio = portfolioQuery.data as any;
  const pendingDistributions = distributions.filter(
    (d: any) => d.status === "PENDING" || d.status === "APPROVED"
  );

  // ─── Helper: upload file to server ───────────────────────────
  const uploadFile = async (file: File): Promise<string> => {
    const reader = new FileReader();
    const base64: string = await new Promise((resolve) => {
      reader.onload = () =>
        resolve((reader.result as string).split(",")[1] ?? "");
      reader.readAsDataURL(file);
    });
    const result = await (trpcClient as any).uploadFile.mutate({
      authToken: authToken ?? "",
      fileName: file.name,
      fileType: file.type,
      fileBase64: base64,
    });
    return result.publicUrl;
  };

  // ─── Helper: handle POP file selection ──────────────────────
  const handlePopFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large. Max 10MB.");
      return;
    }
    setPopFile(file);
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => setPopPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setPopPreview(null);
    }
  };

  // ─── Helper: submit POP for a specific contribution ─────────
  const handleSubmitPOP = async (contributionId: number) => {
    if (!popFile) {
      toast.error("Please select a proof of payment file");
      return;
    }
    setPopSubmitting(true);
    try {
      const popUrl = await uploadFile(popFile);
      await (trpcClient as any).submitProofOfPayment.mutate({
        authToken: authToken!,
        contributionId,
        proofOfPaymentUrl: popUrl,
        paymentReference: payReference || undefined,
        notes: payDescription || undefined,
      });
      toast.success("Proof of payment submitted! A manager will review it shortly.");
      qc.invalidateQueries({ queryKey: trpc.getMyAwaitingPayment.queryKey() });
      setPopFile(null);
      setPopPreview(null);
      setPayReference("");
      setPayDescription("");
      if (popFileRef.current) popFileRef.current.value = "";
    } catch (e: any) {
      toast.error(e.message ?? "Failed to submit proof of payment");
    } finally {
      setPopSubmitting(false);
    }
  };

  // ─── Helper: review proof of payment (manager) ──────────────
  const handleReviewPayment = async (action: "APPROVE" | "REJECT") => {
    if (!reviewingPayment) return;
    if (action === "REJECT" && !reviewNotes.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }
    setReviewSubmitting(true);
    try {
      await trpcClient.reviewProofOfPayment.mutate({
        authToken: authToken!,
        contributionId: reviewingPayment.id,
        action,
        reviewNotes: reviewNotes || undefined,
      });
      toast.success(
        action === "APPROVE"
          ? "Payment approved! Funding raised has been updated."
          : "Payment rejected. The investor will be notified."
      );
      setReviewingPayment(null);
      setReviewNotes("");
      qc.invalidateQueries({ queryKey: trpc.getPendingPayments.queryKey() });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to review payment");
    } finally {
      setReviewSubmitting(false);
    }
  };

  // ─── Helper: initialize Paystack payment ────────────────────
  async function handleInitiatePayment() {
    if (!payAmount || Number(payAmount) <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    const ref = payReference || `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const result = await (trpcClient as any).initializePayment.mutate({
        authToken: authToken ?? "",
        amount: Number(payAmount),
        email: user?.email ?? "",
        reference: ref,
        metadata: { description: payDescription, userId: user?.id },
        callbackUrl: `${window.location.origin}/payments?verify=${ref}`,
      });
      toast.success("Redirecting to Paystack checkout...");
      window.open(result.authorizationUrl, "_blank");
    } catch (e: any) {
      toast.error(e.message ?? "Payment initiation failed");
    }
  }

  // ─── Helper: verify payment ─────────────────────────────────
  async function handleVerifyPayment() {
    if (!verifyRef) {
      toast.error("Enter a payment reference");
      return;
    }
    try {
      const result = await (trpcClient as any).verifyPayment.query({
        authToken: authToken ?? "",
        reference: verifyRef,
      });
      setVerifyResult(result);
      if (result.status === "success") {
        toast.success("Payment verified successfully!");
      } else {
        toast.error(`Payment status: ${result.status}`);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Verification failed");
    }
  }

  // Compute investor transaction history from payouts
  const investorTransactions = myPayouts.map((p: any) => ({
    id: p.id,
    type: "incoming" as const,
    description: `Distribution: ${p.distribution?.property?.title ?? "Property"} — ${(p.distribution?.type ?? "").replace("_", " ")}`,
    amount: p.netAmount,
    status: p.status,
    date: p.paidAt ?? p.createdAt,
    reference: p.paymentRef,
  }));

  // Format helper
  const fmt = (n: number) => `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });

  const tabs: { key: TabKey; label: string; icon: any; show: boolean }[] = [
    { key: "overview", label: "Overview", icon: CreditCard, show: true },
    { key: "pay", label: "Make Payment", icon: Send, show: true },
    { key: "history", label: "Transaction History", icon: Clock, show: true },
    { key: "payouts", label: "Process Payouts", icon: Banknote, show: isManager },
    { key: "review", label: "Payment Review", icon: ClipboardCheck, show: isManager },
  ];

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 p-3">
              <CreditCard className="h-8 w-8 text-gray-900" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Payment Gateway</h1>
              <p className="text-gray-500">
                Secure payments via Paystack — South Africa&apos;s leading payment processor
              </p>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatBox
            icon={Shield}
            label="Gateway Status"
            value={gateway?.configured ? "Connected" : "Not Configured"}
            color={gateway?.configured ? "green" : "red"}
          />
          <StatBox
            icon={Wallet}
            label="Platform Balance"
            value={balances.length > 0 ? fmt(balances[0].balance) : isManager ? "—" : "N/A"}
            color="blue"
          />
          <StatBox
            icon={ArrowDownLeft}
            label={isInvestor ? "Total Received" : "Total Distributed"}
            value={fmt(
              isInvestor
                ? myTotalReceived
                : distributions.filter((d: any) => d.status === "PAID").reduce((s: number, d: any) => s + (d.totalAmount ?? d.grossAmount ?? 0), 0)
            )}
            color="emerald"
          />
          <StatBox
            icon={Clock}
            label="Pending"
            value={
              isInvestor
                ? (myTotalPending > 0 ? fmt(myTotalPending) : "0")
                : pendingDistributions.length.toString()
            }
            color="amber"
          />
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-navy-800/50 p-1 bg-navy-900/50">
          {tabs
            .filter((t) => t.show)
            .map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                  tab === t.key
                    ? "bg-navy-900/50 text-emerald-600 shadow bg-navy-800"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <t.icon size={16} />
                {t.label}
              </button>
            ))}
        </div>

        {/* ═══ OVERVIEW TAB ═══ */}
        {tab === "overview" && (
          <div className="space-y-6">
            {/* Gateway Card */}
            <div className="rounded-xl border border-navy-800/50 bg-navy-900/50">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-xl ${
                      gateway?.configured
                        ? "bg-emerald-50"
                        : "bg-red-50"
                    }`}
                  >
                    {gateway?.configured ? (
                      <CheckCircle className="h-7 w-7 text-emerald-600" />
                    ) : (
                      <XCircle className="h-7 w-7 text-red-500" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">
                      Paystack Integration
                    </h3>
                    <p className={`text-sm font-medium ${gateway?.configured ? "text-emerald-600" : "text-red-500"}`}>
                      {gateway?.configured ? "Connected & Active" : "Not Configured — Setup Required"}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => gatewayQuery.refetch()}
                  className="rounded-lg border p-2 text-gray-500 hover:bg-navy-800/30">
                  <RefreshCw size={16} />
                </button>
              </div>

              {gateway?.configured && (
                <div className="mt-6">
                  <h4 className="mb-3 text-sm font-semibold text-gray-600">
                    Supported Features
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: "Bank Transfers", enabled: gateway.features?.bankTransfers },
                      { label: "Card Payments", enabled: gateway.features?.cardPayments },
                      { label: "Bulk Transfers", enabled: gateway.features?.bulkTransfers },
                      { label: "Recurring Charges", enabled: gateway.features?.recurringCharges },
                    ].map((f) => (
                      <span
                        key={f.label}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                          f.enabled
                            ? "bg-emerald-50 text-emerald-600"
                            : "bg-navy-800/50 text-gray-500 bg-navy-800"
                        }`}
                      >
                        {f.enabled ? <CheckCircle size={12} /> : <XCircle size={12} />}
                        {f.label}
                      </span>
                    ))}
                  </div>
                  <div className="mt-4">
                    <h4 className="mb-2 text-sm font-semibold text-gray-600">
                      Supported Currencies
                    </h4>
                    <div className="flex gap-2">
                      {(gateway.supportedCurrencies ?? []).map((c: string) => (
                        <span
                          key={c}
                          className={`rounded-full px-3 py-1 text-xs font-bold ${
                            c === "ZAR"
                              ? "bg-emerald-50 text-emerald-600"
                              : "bg-navy-800/50 text-gray-600 bg-navy-800"
                          }`}
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!gateway?.configured && (
                <div className="mt-6 rounded-lg bg-gold-50 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 text-gold-600" />
                    <div>
                      <p className="font-semibold text-gold-600">
                        Payment Gateway Setup Required
                      </p>
                      <p className="mt-1 text-sm text-gold-600">
                        To process payments and distribute investor returns, configure your Paystack API keys:
                      </p>
                      <ol className="mt-3 space-y-2 text-sm text-gold-600">
                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-xs font-bold text-gold-600">1</span>
                          Go to <a href="https://dashboard.paystack.com" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium underline">dashboard.paystack.com <ExternalLink size={12} /></a>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-xs font-bold text-gold-600">2</span>
                          Navigate to Settings → API Keys & Webhooks
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-xs font-bold text-gold-600">3</span>
                          Copy your <strong>Secret Key</strong> and set it as <code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs">PAYSTACK_SECRET_KEY</code> in your <code className="rounded bg-amber-100 px-1.5 py-0.5 text-xs">.env</code> file
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-200 text-xs font-bold text-gold-600">4</span>
                          Restart the server — the gateway will auto-connect
                        </li>
                      </ol>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Platform Balance (managers only) */}
            {isManager && balances.length > 0 && (
              <div className="rounded-xl border border-navy-800/50 bg-navy-900/50">
                <h3 className="mb-4 text-lg font-semibold text-gray-900">
                  Paystack Account Balances
                </h3>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {balances.map((b: any) => (
                    <div
                      key={b.currency}
                      className="rounded-lg bg-gradient-to-br from-emerald-500/10 to-emerald-500/10 p-4">
                      <p className="text-sm text-gray-500">{b.currency}</p>
                      <p className="text-2xl font-bold text-emerald-600">
                        {b.currency === "ZAR" ? "R" : b.currency === "NGN" ? "₦" : "$"}
                        {b.balance.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Actions */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <button
                onClick={() => setTab("pay")}
                className="flex items-center gap-4 rounded-xl border border-navy-800/50 bg-navy-900/50">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gold-50">
                  <Send className="h-6 w-6 text-gold-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Make a Payment</p>
                  <p className="text-sm text-gray-500">
                    Pay via card, EFT, or bank transfer
                  </p>
                </div>
              </button>

              <button
                onClick={() => setTab("history")}
                className="flex items-center gap-4 rounded-xl border border-navy-800/50 bg-navy-900/50">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-50">
                  <Clock className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Transaction History</p>
                  <p className="text-sm text-gray-500">
                    View all your payments and receipts
                  </p>
                </div>
              </button>

              {isManager && (
                <button
                  onClick={() => setTab("payouts")}
                  className="flex items-center gap-4 rounded-xl border border-navy-800/50 bg-navy-900/50">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-emerald-100">
                    <Banknote className="h-6 w-6 text-emerald-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Process Payouts</p>
                    <p className="text-sm text-gray-500">
                      Distribute returns to investors
                    </p>
                  </div>
                </button>
              )}
            </div>
          </div>
        )}

        {/* ═══ MAKE PAYMENT TAB ═══ */}
        {tab === "pay" && (
          <div className="mx-auto max-w-2xl space-y-6">
            {/* Payment Method Chooser */}
            <div className="flex gap-3">
              <button
                onClick={() => setPayMethodChoice("gateway")}
                className={`flex flex-1 flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                  payMethodChoice === "gateway"
                    ? "border-gold-400 bg-gold-50 shadow-md"
                    : "border-gray-200 bg-white hover:border-gold-200 hover:bg-gold-50/50"
                }`}
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  payMethodChoice === "gateway" ? "bg-gold-100" : "bg-gray-100"
                }`}>
                  <CreditCard size={20} className={payMethodChoice === "gateway" ? "text-gold-600" : "text-gray-500"} />
                </div>
                <p className="text-sm font-semibold text-gray-900">Pay via Gateway</p>
                <p className="text-xs text-gray-500 text-center">Card, EFT, or bank transfer via Paystack</p>
              </button>
              <button
                onClick={() => setPayMethodChoice("pop")}
                className={`flex flex-1 flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                  payMethodChoice === "pop"
                    ? "border-blue-400 bg-blue-50 shadow-md"
                    : "border-gray-200 bg-white hover:border-blue-200 hover:bg-blue-50/50"
                }`}
              >
                <div className={`flex h-10 w-10 items-center justify-center rounded-full ${
                  payMethodChoice === "pop" ? "bg-blue-100" : "bg-gray-100"
                }`}>
                  <Banknote size={20} className={payMethodChoice === "pop" ? "text-blue-600" : "text-gray-500"} />
                </div>
                <p className="text-sm font-semibold text-gray-900">Bank Deposit / EFT</p>
                <p className="text-xs text-gray-500 text-center">Upload proof of payment for manual review</p>
              </button>
            </div>

            {/* ── GATEWAY OPTION ── */}
            {payMethodChoice === "gateway" && (
              <>
                {/* Payment Form */}
                <div className="rounded-xl border border-navy-800/50 bg-navy-900/50">
                  <div className="mb-6 flex items-center gap-3">
                    <div className="rounded-lg bg-gold-50 p-2">
                      <CreditCard className="h-5 w-5 text-gold-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        Initiate Payment
                      </h3>
                      <p className="text-sm text-gray-500">
                        Pay securely via Paystack — supports card, EFT, and bank transfer
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-600">
                        Amount (ZAR) <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-semibold text-gray-500">
                          R
                        </span>
                        <input
                          type="number"
                          min="1"
                          step="0.01"
                          value={payAmount}
                          onChange={(e) => setPayAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full rounded-lg border border-navy-700 py-3 pl-8 pr-4 text-lg focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 border-navy-700 bg-navy-800/50"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-600">
                        Description / Purpose
                      </label>
                      <input
                        type="text"
                        value={payDescription}
                        onChange={(e) => setPayDescription(e.target.value)}
                        placeholder="e.g. Share purchase — Property #12"
                        className="w-full rounded-lg border border-navy-700 px-4 py-2.5 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 border-navy-700 bg-navy-800/50"
                      />
                    </div>

                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-600">
                        Reference (optional — auto-generated if blank)
                      </label>
                      <input
                        type="text"
                        value={payReference}
                        onChange={(e) => setPayReference(e.target.value)}
                        placeholder="PAY-xxxx-xxxxx"
                        className="w-full rounded-lg border border-navy-700 px-4 py-2.5 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 border-navy-700 bg-navy-800/50"
                      />
                    </div>

                    <button
                      onClick={handleInitiatePayment}
                      disabled={!gateway?.configured || !payAmount}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-6 py-3 text-base font-semibold text-gray-900 shadow-sm transition-all hover:from-green-700 hover:to-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">
                      <Send size={18} />
                      {gateway?.configured ? "Proceed to Paystack Checkout" : "Gateway Not Configured"}
                    </button>
                  </div>

                  <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
                    <Shield size={14} />
                    <span>Payments are processed securely via Paystack. We never store your card details.</span>
                  </div>
                </div>

                {/* Payment Verification */}
                <div className="rounded-xl border border-navy-800/50 bg-navy-900/50">
                  <h3 className="mb-4 text-lg font-semibold text-gray-900">
                    Verify a Payment
                  </h3>
                  <p className="mb-4 text-sm text-gray-500">
                    Enter a payment reference to check its status
                  </p>
                  <div className="flex gap-3">
                    <input
                      type="text"
                      value={verifyRef}
                      onChange={(e) => setVerifyRef(e.target.value)}
                      placeholder="Payment reference…"
                      className="flex-1 rounded-lg border border-navy-700 px-4 py-2.5 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 border-navy-700 bg-navy-800/50"
                    />
                    <button
                      onClick={handleVerifyPayment}
                      disabled={!verifyRef}
                      className="flex items-center gap-2 rounded-lg bg-gold-500 px-5 py-2.5 font-medium text-white hover:bg-gold-600 disabled:opacity-50">
                      <Search size={16} />
                      Verify
                    </button>
                  </div>

                  {verifyResult && (
                    <div className="mt-4 rounded-lg border p-4 border-navy-700">
                      <div className="flex items-center gap-3 mb-3">
                        {verifyResult.status === "success" ? (
                          <CheckCircle className="h-6 w-6 text-emerald-600" />
                        ) : (
                          <XCircle className="h-6 w-6 text-red-500" />
                        )}
                        <span
                          className={`text-lg font-bold ${
                            verifyResult.status === "success" ? "text-emerald-600" : "text-red-500"
                          }`}
                        >
                          {verifyResult.status === "success" ? "Payment Successful" : `Status: ${verifyResult.status}`}
                        </span>
                      </div>
                      <div className="grid gap-2 text-sm sm:grid-cols-2">
                        <div>
                          <span className="text-gray-500">Amount:</span>{" "}
                          <span className="font-semibold text-gray-900">
                            R{verifyResult.amount?.toLocaleString("en-ZA")}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Currency:</span>{" "}
                          <span className="font-semibold text-gray-900">{verifyResult.currency}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Channel:</span>{" "}
                          <span className="font-semibold text-gray-900">{verifyResult.channel}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Ref:</span>{" "}
                          <span className="font-mono text-xs text-gray-900">{verifyResult.reference}</span>
                        </div>
                        {verifyResult.paidAt && (
                          <div>
                            <span className="text-gray-500">Paid:</span>{" "}
                            <span className="font-semibold text-gray-900">
                              {fmtDate(verifyResult.paidAt)}
                            </span>
                          </div>
                        )}
                        {verifyResult.gatewayResponse && (
                          <div>
                            <span className="text-gray-500">Gateway:</span>{" "}
                            <span className="font-semibold text-gray-900">
                              {verifyResult.gatewayResponse}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── POP UPLOAD OPTION ── */}
            {payMethodChoice === "pop" && (
              <div className="rounded-xl border border-navy-800/50 bg-navy-900/50">
                <div className="mb-6 flex items-center gap-3">
                  <div className="rounded-lg bg-blue-50 p-2">
                    <Upload className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Upload Proof of Payment
                    </h3>
                    <p className="text-sm text-gray-500">
                      For bank deposit or EFT — upload your confirmation and a manager will review it
                    </p>
                  </div>
                </div>

                {/* Select which investment to pay */}
                {awaitingContributions.length === 0 ? (
                  <div className="rounded-lg bg-gray-50 p-6 text-center">
                    <CheckCircle className="mx-auto mb-2 text-green-400" size={36} />
                    <p className="font-medium text-gray-700">No pending investments</p>
                    <p className="mt-1 text-sm text-gray-500">
                      You don't have any approved investments awaiting payment, or all have been paid.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm font-medium text-gray-700">
                      Select the investment you're paying for:
                    </p>

                    {awaitingContributions.map((c: any) => (
                      <div
                        key={c.id}
                        className="rounded-xl border bg-white shadow-sm"
                      >
                        {/* Investment card header */}
                        <div className="flex items-center gap-3 border-b bg-gray-50 p-3 rounded-t-xl">
                          {c.property?.imageUrl && (
                            <img
                              src={c.property.imageUrl}
                              alt={c.property?.title}
                              className="h-10 w-10 rounded-lg object-cover"
                            />
                          )}
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-900">
                              {c.property?.title ?? "Property"}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <DollarSign size={11} />
                              <span>R{c.contributionAmount?.toLocaleString()}</span>
                              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-orange-600">
                                Awaiting Payment
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* POP upload form */}
                        <div className="space-y-3 p-4">
                          {/* Payment Details */}
                          <div className="rounded-lg bg-blue-50 p-3">
                            <p className="text-xs font-medium text-blue-700 mb-1">Payment Details:</p>
                            <div className="grid grid-cols-2 gap-1 text-xs text-blue-600">
                              <span>Property:</span>
                              <span className="font-medium">{c.property?.title ?? "—"}</span>
                              <span>Amount Due:</span>
                              <span className="font-bold">R{c.contributionAmount?.toLocaleString()}</span>
                            </div>
                          </div>

                          {/* File Upload */}
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">
                              Proof of Payment (screenshot, PDF, etc.) *
                            </label>
                            <input
                              ref={popFileRef}
                              type="file"
                              accept="image/*,.pdf"
                              onChange={handlePopFileSelect}
                              className="w-full rounded-lg border bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-blue-100 file:px-3 file:py-1 file:text-xs file:text-blue-700"
                            />
                            {popPreview && (
                              <div className="mt-2">
                                <img
                                  src={popPreview}
                                  alt="POP Preview"
                                  className="max-h-40 rounded-lg border"
                                />
                              </div>
                            )}
                            {popFile && !popPreview && (
                              <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                                <FileText size={14} />
                                {popFile.name} ({(popFile.size / 1024).toFixed(0)} KB)
                              </div>
                            )}
                          </div>

                          {/* Reference */}
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">
                              Payment Reference (optional)
                            </label>
                            <input
                              type="text"
                              value={payReference}
                              onChange={(e) => setPayReference(e.target.value)}
                              placeholder="Bank reference or transaction number"
                              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                            />
                          </div>

                          {/* Notes */}
                          <div>
                            <label className="mb-1 block text-xs font-medium text-gray-600">
                              Notes (optional)
                            </label>
                            <textarea
                              value={payDescription}
                              onChange={(e) => setPayDescription(e.target.value)}
                              rows={2}
                              placeholder="Any additional info about the payment..."
                              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                            />
                          </div>

                          <button
                            onClick={() => handleSubmitPOP(c.id)}
                            disabled={popSubmitting || !popFile}
                            className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {popSubmitting ? (
                              <Loader2 size={16} className="animate-spin" />
                            ) : (
                              <Send size={16} />
                            )}
                            Submit Proof of Payment
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* How Payments Work */}
            <div className="rounded-xl border bg-gradient-to-br from-emerald-500/10 to-emerald-500/10 p-6 border-navy-800/50">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">
                How Payments Work
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {payMethodChoice === "gateway" ? (
                  [
                    {
                      step: "1",
                      title: "Enter Amount",
                      desc: "Specify the amount and purpose of your payment",
                    },
                    {
                      step: "2",
                      title: "Paystack Checkout",
                      desc: "You'll be redirected to Paystack's secure checkout page",
                    },
                    {
                      step: "3",
                      title: "Choose Method",
                      desc: "Pay via card (Visa/Mastercard), EFT, or instant bank transfer",
                    },
                    {
                      step: "4",
                      title: "Confirmation",
                      desc: "Payment is verified and reflected in your account immediately",
                    },
                  ].map((s) => (
                    <div key={s.step} className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600 text-sm font-bold text-white">
                        {s.step}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{s.title}</p>
                        <p className="text-sm text-gray-500">{s.desc}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  [
                    {
                      step: "1",
                      title: "Make Payment",
                      desc: "Transfer the exact amount to Investprop's bank account via EFT or deposit",
                    },
                    {
                      step: "2",
                      title: "Upload Proof",
                      desc: "Upload a screenshot or PDF of your bank confirmation",
                    },
                    {
                      step: "3",
                      title: "Manager Review",
                      desc: "A development manager will verify your payment within 1–2 business days",
                    },
                    {
                      step: "4",
                      title: "Confirmation",
                      desc: "Once confirmed, your investment is activated and share certificate is issued",
                    },
                  ].map((s) => (
                    <div key={s.step} className="flex gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                        {s.step}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">{s.title}</p>
                        <p className="text-sm text-gray-500">{s.desc}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ═══ TRANSACTION HISTORY TAB ═══ */}
        {tab === "history" && (
          <div className="space-y-4">
            {/* Filter */}
            <div className="flex items-center gap-3">
              <Filter size={16} className="text-gray-500" />
              {(["all", "incoming", "outgoing"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setHistoryFilter(f)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    historyFilter === f
                      ? "bg-green-600 text-white"
                      : "bg-navy-800/50 text-gray-600 hover:bg-gray-200 bg-navy-800"
                  }`}
                >
                  {f === "all" ? "All" : f === "incoming" ? "Received" : "Sent"}
                </button>
              ))}
            </div>

            {/* Transactions */}
            <div className="rounded-xl border border-navy-800/50 bg-navy-900/50">
              {investorTransactions.length === 0 && distributions.length === 0 ? (
                <div className="py-16 text-center">
                  <Clock className="mx-auto mb-3 h-12 w-12 text-gray-600" />
                  <p className="text-lg font-medium text-gray-500">
                    No transactions yet
                  </p>
                  <p className="text-sm text-gray-500">
                    Your payment history will appear here
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {/* Investor transactions */}
                  {investorTransactions
                    .filter(
                      (t) =>
                        historyFilter === "all" ||
                        (historyFilter === "incoming" && t.type === "incoming")
                    )
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map((t) => (
                      <div key={`inv-${t.id}`} className="flex items-center justify-between px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div
                            className={`flex h-10 w-10 items-center justify-center rounded-full ${
                              t.type === "incoming"
                                ? "bg-emerald-50"
                                : "bg-red-50"
                            }`}
                          >
                            {t.type === "incoming" ? (
                              <ArrowDownLeft className="h-5 w-5 text-emerald-600" />
                            ) : (
                              <ArrowUpRight className="h-5 w-5 text-red-600" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{t.description}</p>
                            <p className="text-xs text-gray-500">
                              {fmtDate(t.date)}
                              {t.reference && <> · Ref: {t.reference}</>}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p
                            className={`text-lg font-bold ${
                              t.type === "incoming" ? "text-emerald-600" : "text-red-600"
                            }`}
                          >
                            {t.type === "incoming" ? "+" : "-"}
                            {fmt(t.amount)}
                          </p>
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              t.status === "PAID"
                                ? "bg-emerald-50 text-emerald-600"
                                : t.status === "PROCESSING"
                                  ? "bg-gold-50 text-gold-600"
                                  : "bg-gold-50 text-gold-600"
                            }`}
                          >
                            {t.status}
                          </span>
                        </div>
                      </div>
                    ))}

                  {/* Manager distributions as transactions */}
                  {isManager &&
                    distributions
                      .sort(
                        (a: any, b: any) =>
                          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                      )
                      .filter(
                        () => historyFilter === "all" || historyFilter === "outgoing"
                      )
                      .map((d: any) => (
                        <div
                          key={`dist-${d.id}`}
                          className="flex items-center justify-between px-6 py-4">
                          <div className="flex items-center gap-4">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-50">
                              <Banknote className="h-5 w-5 text-purple-600" />
                            </div>
                            <div>
                              <p className="font-medium text-gray-900">
                                Distribution #{d.id} — {d.property?.title ?? "Property"}
                              </p>
                              <p className="text-xs text-gray-500">
                                {fmtDate(d.createdAt)} · {d.type?.replace("_", " ")} ·{" "}
                                {d.payouts?.length ?? 0} investors
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-gray-900">
                              {fmt(d.grossAmount ?? 0)}
                            </p>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                d.status === "PAID"
                                  ? "bg-emerald-50 text-emerald-600"
                                  : d.status === "APPROVED"
                                    ? "bg-gold-50 text-gold-600"
                                    : "bg-gold-50 text-gold-600"
                              }`}
                            >
                              {d.status}
                            </span>
                          </div>
                        </div>
                      ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ PROCESS PAYOUTS TAB (managers only) ═══ */}
        {tab === "payouts" && isManager && (
          <div className="space-y-6">
            <div className="rounded-xl border border-navy-800/50 bg-navy-900/50">
              <div className="border-b px-6 py-4 border-navy-800/50">
                <h3 className="text-lg font-semibold text-gray-900">
                  Distribution Payouts
                </h3>
                <p className="text-sm text-gray-500">
                  Process approved distributions — funds are sent to investors via Paystack bank transfer
                </p>
              </div>

              {distributionsQuery.isLoading ? (
                <div className="flex justify-center py-12">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-green-600 border-r-transparent"></div>
                </div>
              ) : pendingDistributions.length === 0 ? (
                <div className="py-16 text-center">
                  <CheckCircle className="mx-auto mb-3 h-12 w-12 text-green-400" />
                  <p className="text-lg font-medium text-gray-900">
                    All caught up!
                  </p>
                  <p className="text-sm text-gray-500">
                    No pending distributions to process
                  </p>
                </div>
              ) : (
                <div className="divide-y">
                  {pendingDistributions.map((dist: any) => {
                    const amount = dist.grossAmount ?? dist.totalAmount ?? 0;
                    const payoutCount = dist.payouts?.length ?? 0;
                    return (
                      <div
                        key={dist.id}
                        className="flex flex-wrap items-center justify-between gap-4 px-6 py-5">
                        <div className="flex items-center gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100">
                            <Banknote className="h-6 w-6 text-emerald-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">
                              Distribution #{dist.id}
                            </p>
                            <p className="text-sm text-gray-500">
                              {dist.property?.title ?? "Property"} ·{" "}
                              {dist.type?.replace("_", " ")} · {payoutCount} investor
                              {payoutCount !== 1 ? "s" : ""}
                            </p>
                            <p className="text-xs text-gray-500">
                              Created {fmtDate(dist.createdAt)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-xl font-bold text-emerald-600">
                              {fmt(amount)}
                            </p>
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                dist.status === "APPROVED"
                                  ? "bg-gold-50 text-gold-600"
                                  : "bg-gold-50 text-gold-600"
                              }`}
                            >
                              {dist.status}
                            </span>
                          </div>
                          <button
                            onClick={() =>
                              (payoutMutation.mutate as any)({
                                authToken: authToken ?? "",
                                distributionId: dist.id,
                              })
                            }
                            disabled={payoutMutation.isPending || !gateway?.configured}
                            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-green-600 to-emerald-600 px-5 py-2.5 font-medium text-gray-900 shadow-sm hover:from-green-700 hover:to-emerald-700 disabled:opacity-50">
                            {payoutMutation.isPending ? (
                              <>
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-r-transparent"></div>
                                Processing…
                              </>
                            ) : (
                              <>
                                <Send size={16} />
                                Process Payout
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Payout Results */}
            {payoutResults && (
              <div className="rounded-xl border border-navy-800/50 bg-navy-900/50">
                <h3 className="mb-4 text-lg font-semibold text-gray-900">
                  Payout Results
                </h3>
                <div className="mb-6 grid gap-4 sm:grid-cols-3">
                  <div className="rounded-lg bg-emerald-50 p-4 text-center">
                    <p className="text-3xl font-bold text-emerald-600">
                      {payoutResults.successful ?? 0}
                    </p>
                    <p className="text-sm text-emerald-600">Successful</p>
                  </div>
                  <div className="rounded-lg bg-red-50 p-4 text-center">
                    <p className="text-3xl font-bold text-red-600">
                      {payoutResults.failed ?? 0}
                    </p>
                    <p className="text-sm text-red-600">Failed</p>
                  </div>
                  <div className="rounded-lg bg-navy-800/30 p-4 text-center">
                    <p className="text-3xl font-bold text-gold-600">
                      {payoutResults.totalPayouts ?? 0}
                    </p>
                    <p className="text-sm text-gold-600">Total</p>
                  </div>
                </div>

                {payoutResults.results?.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-gray-500 border-navy-700">
                          <th className="pb-3 font-medium">Investor</th>
                          <th className="pb-3 font-medium">Amount</th>
                          <th className="pb-3 font-medium">Status</th>
                          <th className="pb-3 font-medium">Reference</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {payoutResults.results.map((r: any) => (
                          <tr key={r.payoutId}>
                            <td className="py-3 text-gray-900">
                              {r.investorName}
                            </td>
                            <td className="py-3 font-semibold text-emerald-600">
                              {fmt(r.amount)}
                            </td>
                            <td className="py-3">
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                  r.status === "PROCESSING"
                                    ? "bg-gold-50 text-gold-600"
                                    : "bg-red-50 text-red-600"
                                }`}
                              >
                                {r.status}
                              </span>
                            </td>
                            <td className="py-3 font-mono text-xs text-gray-500">
                              {r.transferCode ?? r.error ?? "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ PAYMENT REVIEW TAB (managers only) ═══ */}
        {tab === "review" && isManager && (
          <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-5 flex-1">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      Proof of Payment Review
                    </h3>
                    <p className="text-sm text-gray-500">
                      Review investor payment submissions. Approving will update funding raised and issue certificates.
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {pendingPayments.length > 0 && (
                      <span className="rounded-full bg-orange-100 px-3 py-1 text-sm font-bold text-orange-700">
                        {pendingPayments.length} pending
                      </span>
                    )}
                    <button
                      onClick={() => pendingPaymentsQuery.refetch()}
                      disabled={pendingPaymentsQuery.isFetching}
                      className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <RefreshCw size={14} className={pendingPaymentsQuery.isFetching ? "animate-spin" : ""} />
                      Refresh
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-orange-100 p-2">
                    <Clock className="text-orange-600" size={18} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{pendingPayments.length}</p>
                    <p className="text-xs text-gray-500">Pending Review</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-green-100 p-2">
                    <DollarSign className="text-green-600" size={18} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">
                      R{pendingPayments.reduce((sum: number, p: any) => sum + Number(p.contributionAmount ?? 0), 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">Total Pending Amount</p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-100 p-2">
                    <Building className="text-blue-600" size={18} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-gray-900">
                      {new Set(pendingPayments.map((p: any) => p.propertyId)).size}
                    </p>
                    <p className="text-xs text-gray-500">Properties</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Loading */}
            {pendingPaymentsQuery.isLoading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="animate-spin text-gold-500" size={32} />
              </div>
            )}

            {/* Empty State */}
            {!pendingPaymentsQuery.isLoading && pendingPayments.length === 0 && (
              <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-12 text-center">
                <CheckCircle className="mx-auto mb-3 text-green-400" size={48} />
                <h3 className="text-lg font-semibold text-gray-900">All Caught Up!</h3>
                <p className="mt-1 text-sm text-gray-500">
                  No proof of payment submissions pending review.
                </p>
              </div>
            )}

            {/* Payment Cards */}
            {!pendingPaymentsQuery.isLoading && pendingPayments.length > 0 && (
              <div className="space-y-4">
                {pendingPayments.map((p: any) => (
                  <div key={p.id} className="overflow-hidden rounded-xl border border-navy-800/50 bg-navy-900/50 shadow-sm">
                    <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                      {/* Left side: info */}
                      <div className="flex gap-4">
                        {p.property?.imageUrl && (
                          <img src={p.property.imageUrl} alt={p.property.title} className="h-16 w-16 rounded-xl object-cover" />
                        )}
                        <div>
                          <h4 className="text-base font-semibold text-gray-900">{p.property?.title ?? "Property"}</h4>
                          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
                            <span className="flex items-center gap-1">
                              <User size={13} />
                              {p.investor?.name ?? "Unknown Investor"}
                            </span>
                            <span className="flex items-center gap-1">
                              <DollarSign size={13} />
                              <span className="font-bold text-gold-600">
                                R{Number(p.contributionAmount ?? 0).toLocaleString()}
                              </span>
                            </span>
                            {p.paymentReference && (
                              <span className="flex items-center gap-1 font-mono text-xs">
                                <FileText size={12} />
                                {p.paymentReference}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-gray-400">
                            Submitted {p.paymentSubmittedAt ? new Date(p.paymentSubmittedAt).toLocaleString() : "recently"}
                          </p>
                          {p.notes && (
                            <p className="mt-1 rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 italic">
                              &ldquo;{p.notes}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right side: actions */}
                      <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-700">
                          <Clock size={12} />
                          Pending Review
                        </span>
                        {p.proofOfPaymentUrl && (
                          <a
                            href={p.proofOfPaymentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 transition"
                          >
                            <Eye size={14} /> View Proof of Payment
                          </a>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setReviewingPayment(p); setReviewNotes(""); }}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition"
                          >
                            <CheckCircle size={14} /> Approve
                          </button>
                          <button
                            onClick={() => { setReviewingPayment({ ...p, _rejectMode: true }); setReviewNotes(""); }}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 transition"
                          >
                            <XCircle size={14} /> Reject
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Funding progress */}
                    {p.property?.fundingGoal && (
                      <div className="border-t bg-gray-50 px-5 py-3">
                        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                          <span>Property Funding Progress</span>
                          <span>R{Number(p.property.fundingRaised ?? 0).toLocaleString()} / R{Number(p.property.fundingGoal).toLocaleString()}</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-gray-200">
                          <div
                            className="h-2 rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${Math.min(100, (Number(p.property.fundingRaised ?? 0) / Number(p.property.fundingGoal)) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Review Modal */}
            {reviewingPayment && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setReviewingPayment(null)}>
                <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
                  <div className="border-b px-6 py-4">
                    <h2 className="text-lg font-bold text-gray-900">
                      {reviewingPayment._rejectMode ? "Reject Proof of Payment" : "Confirm Payment Approval"}
                    </h2>
                  </div>
                  <div className="space-y-4 p-6">
                    <div className="rounded-lg bg-gray-50 p-4">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs text-gray-400">Investor</p>
                          <p className="font-medium">{reviewingPayment.investor?.name}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Amount</p>
                          <p className="font-bold text-gold-600">R{Number(reviewingPayment.contributionAmount ?? 0).toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Property</p>
                          <p className="font-medium">{reviewingPayment.property?.title}</p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Reference</p>
                          <p className="font-medium">{reviewingPayment.paymentReference ?? "—"}</p>
                        </div>
                      </div>
                    </div>

                    {reviewingPayment.proofOfPaymentUrl && (
                      <a
                        href={reviewingPayment.proofOfPaymentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex w-full items-center justify-center gap-2 rounded-lg border border-blue-200 bg-blue-50 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
                      >
                        <Eye size={16} /> View Proof of Payment Document
                      </a>
                    )}

                    {reviewingPayment._rejectMode ? (
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-gray-700">Rejection Reason *</label>
                        <textarea
                          value={reviewNotes}
                          onChange={(e) => setReviewNotes(e.target.value)}
                          placeholder="Explain why the proof of payment is being rejected..."
                          rows={3}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm text-gray-600">
                          By approving this payment, the property's funding raised will be incremented by{" "}
                          <span className="font-bold text-gold-600">R{Number(reviewingPayment.contributionAmount ?? 0).toLocaleString()}</span>.
                          This action cannot be undone.
                        </p>
                        <div>
                          <label className="mb-1.5 mt-3 block text-sm font-medium text-gray-700">Notes (optional)</label>
                          <textarea
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                            placeholder="Any notes about this approval..."
                            rows={2}
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-3 border-t px-6 py-4">
                    <button onClick={() => setReviewingPayment(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
                      Cancel
                    </button>
                    <button
                      onClick={() => handleReviewPayment(reviewingPayment._rejectMode ? "REJECT" : "APPROVE")}
                      disabled={reviewSubmitting || (reviewingPayment._rejectMode && !reviewNotes.trim())}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50 ${reviewingPayment._rejectMode ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
                    >
                      {reviewSubmitting ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : reviewingPayment._rejectMode ? (
                        <XCircle size={14} />
                      ) : (
                        <CheckCircle size={14} />
                      )}
                      {reviewingPayment._rejectMode ? "Reject Payment" : "Approve Payment"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stat Box Component ───────────────────────────────────────

function StatBox({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: any;
  label: string;
  value: string;
  color: string;
}) {
  const colors: Record<string, string> = {
    green: "from-green-500 to-emerald-600",
    blue: "from-gold-500 to-gold-600",
    emerald: "from-emerald-500 to-teal-600",
    amber: "from-amber-500 to-orange-600",
    red: "from-red-500 to-rose-600",
    purple: "from-purple-500 to-violet-600",
  };

  return (
    <div
      className={`rounded-xl bg-gradient-to-br ${colors[color] ?? colors.green} p-5 text-gray-900 shadow-md`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium opacity-90">{label}</span>
        <Icon size={20} className="opacity-80" />
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
