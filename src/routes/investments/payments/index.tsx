import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useRef } from "react";
import {
  CreditCard,
  Upload,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Loader2,
  Building,
  DollarSign,
  ExternalLink,
  FileText,
  Eye,
  X,
  RefreshCw,
  Send,
  Image,
  ChevronDown,
  ChevronUp,
  Banknote,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

export const Route = createFileRoute("/investments/payments/")({
  component: InvestmentPaymentsPage,
});

function InvestmentPaymentsPage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [payingId, setPayingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [payMethod, setPayMethod] = useState<"paystack" | "pop">("paystack");
  const [popFile, setPopFile] = useState<File | null>(null);
  const [popRef, setPopRef] = useState("");
  const [popNotes, setPopNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [verifyingRef, setVerifyingRef] = useState<string | null>(null);
  const [popPreview, setPopPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const awaitingQuery = useQuery({
    ...trpc.getMyAwaitingPayment.queryOptions({
      authToken: authToken ?? "",
    }),
    enabled: !!authToken,
  });

  const contributions = (awaitingQuery.data as any[]) ?? [];

  // Upload file to server
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

  // Paystack Flow
  const handlePaystack = async (contributionId: number) => {
    setSubmitting(true);
    try {
      const result = await trpcClient.initiateInvestmentPayment.mutate({
        authToken: authToken!,
        contributionId,
        callbackUrl: window.location.href,
      });

      toast.success("Redirecting to payment gateway...");
      window.open(result.authorizationUrl, "_blank");

      setVerifyingRef(result.reference);
      setPayingId(contributionId);
    } catch (e: any) {
      toast.error(e.message ?? "Failed to initiate payment");
    } finally {
      setSubmitting(false);
    }
  };

  // Verify Paystack Payment
  const handleVerify = async (contributionId: number, reference: string) => {
    setSubmitting(true);
    try {
      const result = await trpcClient.verifyInvestmentPayment.mutate({
        authToken: authToken!,
        contributionId,
        reference,
      });

      if (result.success) {
        toast.success(
          "Payment verified! Your certificate will be issued shortly.",
        );
        queryClient.invalidateQueries({
          queryKey: trpc.getMyAwaitingPayment.queryKey(),
        });
        setVerifyingRef(null);
        setPayingId(null);
      } else {
        toast.error(
          `Payment status: ${result.status}. Please complete payment first.`,
        );
      }
    } catch (e: any) {
      toast.error(e.message ?? "Verification failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Submit POP
  const handleSubmitPOP = async (contributionId: number) => {
    if (!popFile) {
      toast.error("Please select a proof of payment file");
      return;
    }

    setSubmitting(true);
    try {
      const popUrl = await uploadFile(popFile);

      await trpcClient.submitProofOfPayment.mutate({
        authToken: authToken!,
        contributionId,
        proofOfPaymentUrl: popUrl,
        paymentReference: popRef || undefined,
        notes: popNotes || undefined,
      });

      toast.success(
        "Proof of payment submitted! A manager will review it shortly.",
      );
      queryClient.invalidateQueries({
        queryKey: trpc.getMyAwaitingPayment.queryKey(),
      });
      resetPopForm();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to submit proof of payment");
    } finally {
      setSubmitting(false);
    }
  };

  const resetPopForm = () => {
    setPopFile(null);
    setPopRef("");
    setPopNotes("");
    setPopPreview(null);
    setPayingId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const getStatusBadge = (c: any) => {
    if (c.paymentStatus === "POP_REJECTED") {
      return (
        <span className="flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
          <XCircle size={12} />
          POP Rejected
        </span>
      );
    }
    if (c.paymentStatus === "POP_SUBMITTED") {
      return (
        <span className="flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">
          <Clock size={12} />
          Under Review
        </span>
      );
    }
    if (c.paymentStatus === "PROCESSING") {
      return (
        <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
          <Loader2 size={12} className="animate-spin" />
          Processing
        </span>
      );
    }
    return (
      <span className="flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">
        <Clock size={12} />
        Awaiting Payment
      </span>
    );
  };

  if (!user || !authToken) return null;

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <CreditCard className="text-gold-500" size={32} />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Investment Payments
            </h1>
            <p className="text-gray-500">
              Complete payment for your approved investments
            </p>
          </div>
        </div>

        {/* Info Banner */}
        {contributions.length > 0 && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-gold-200 bg-gold-50 p-4">
            <AlertTriangle className="mt-0.5 text-gold-600" size={18} />
            <div className="text-sm text-gold-800">
              <p className="font-medium">
                You have {contributions.length} approved investment
                {contributions.length > 1 ? "s" : ""} awaiting payment.
              </p>
              <p className="mt-1 text-gold-700">
                You can pay via Paystack (instant) or upload proof of payment
                (manual review).
              </p>
            </div>
          </div>
        )}

        {/* Loading */}
        {awaitingQuery.isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-gold-500" size={32} />
          </div>
        )}

        {/* Empty State */}
        {!awaitingQuery.isLoading && contributions.length === 0 && (
          <div className="rounded-xl border bg-white p-8 text-center">
            <CheckCircle className="mx-auto mb-3 text-green-400" size={48} />
            <h3 className="text-lg font-semibold text-gray-900">
              No Payments Due
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              All your approved investments have been paid, or you don't have
              any approved investments yet.
            </p>
            <button
              onClick={() => navigate({ to: "/investments" })}
              className="mt-4 rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600"
            >
              View My Investments
            </button>
          </div>
        )}

        {/* Contribution Cards */}
        {!awaitingQuery.isLoading && contributions.length > 0 && (
          <div className="space-y-4">
            {contributions.map((c: any) => {
              const isExpanded = expandedId === c.id;
              const isPayingThis = payingId === c.id;

              return (
              <div
                key={c.id}
                className="overflow-hidden rounded-xl border bg-white shadow-sm"
              >
                {/* Clickable Card Header */}
                <button
                  type="button"
                  onClick={() => {
                    if (isExpanded) {
                      setExpandedId(null);
                      setPayingId(null);
                      resetPopForm();
                    } else {
                      setExpandedId(c.id);
                    }
                  }}
                  className="flex w-full items-center gap-4 bg-gray-50 p-4 text-left transition-colors hover:bg-gray-100"
                >
                  {c.property?.imageUrl && (
                    <img
                      src={c.property.imageUrl}
                      alt={c.property.title}
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">
                      {c.property?.title ?? "Property"}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <DollarSign size={12} />R
                        {c.contributionAmount?.toLocaleString()}
                      </span>
                      <span>
                        Approved{" "}
                        {c.reviewedAt
                          ? new Date(c.reviewedAt).toLocaleDateString()
                          : ""}
                      </span>
                    </div>
                  </div>
                  {getStatusBadge(c)}
                  <div className="ml-2 text-gray-400">
                    {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </button>

                {/* Expanded Payment Section */}
                {isExpanded && (
                  <div className="border-t">
                    {/* POP Rejected Warning */}
                    {c.paymentStatus === "POP_REJECTED" && (
                      <div className="flex items-start gap-2 border-b bg-red-50 px-4 py-3 text-sm text-red-700">
                        <XCircle className="mt-0.5" size={16} />
                        <div>
                          <p className="font-medium">
                            Your proof of payment was rejected.
                          </p>
                          {c.paymentReviewNotes && (
                            <p className="mt-1">Reason: {c.paymentReviewNotes}</p>
                          )}
                          <p className="mt-1">
                            Please submit a new proof of payment below.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Payment Method Selection */}
                    {(c.paymentStatus === "NOT_PAID" ||
                      c.paymentStatus === "AWAITING_PAYMENT" ||
                      c.paymentStatus === "POP_REJECTED") && (
                      <div className="p-4">
                        <p className="mb-3 text-sm font-medium text-gray-700">
                          Choose your payment method:
                        </p>

                        {!isPayingThis ? (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <button
                              onClick={() => {
                                setPayingId(c.id);
                                setPayMethod("paystack");
                              }}
                              className="flex flex-col items-center gap-2 rounded-xl border-2 border-gold-200 bg-gold-50 p-5 transition-all hover:border-gold-400 hover:shadow-md"
                            >
                              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold-100">
                                <CreditCard size={24} className="text-gold-600" />
                              </div>
                              <p className="text-sm font-semibold text-gray-900">Pay via Gateway</p>
                              <p className="text-xs text-gray-500 text-center">
                                Card, EFT, or instant bank transfer via Paystack
                              </p>
                              <span className="mt-1 rounded-full bg-gold-100 px-3 py-0.5 text-xs font-medium text-gold-700">
                                Instant
                              </span>
                            </button>

                            <button
                              onClick={() => {
                                setPayingId(c.id);
                                setPayMethod("pop");
                              }}
                              className="flex flex-col items-center gap-2 rounded-xl border-2 border-blue-200 bg-blue-50 p-5 transition-all hover:border-blue-400 hover:shadow-md"
                            >
                              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
                                <Banknote size={24} className="text-blue-600" />
                              </div>
                              <p className="text-sm font-semibold text-gray-900">Bank Deposit / EFT</p>
                              <p className="text-xs text-gray-500 text-center">
                                Upload proof of payment for manual review
                              </p>
                              <span className="mt-1 rounded-full bg-blue-100 px-3 py-0.5 text-xs font-medium text-blue-700">
                                1-2 Business Days
                              </span>
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="mb-4 flex gap-2">
                              <button
                                onClick={() => setPayMethod("paystack")}
                                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                                  payMethod === "paystack"
                                    ? "bg-gold-500 text-white"
                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                }`}
                              >
                                <CreditCard size={12} />
                                Paystack Gateway
                              </button>
                              <button
                                onClick={() => setPayMethod("pop")}
                                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                                  payMethod === "pop"
                                    ? "bg-gold-500 text-white"
                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                }`}
                              >
                                <Upload size={12} />
                                Upload POP
                              </button>
                              <button
                                onClick={() => {
                                  setPayingId(null);
                                  resetPopForm();
                                }}
                                className="ml-auto text-xs text-gray-400 hover:text-gray-600"
                              >
                                &#8592; Back
                              </button>
                            </div>

                            {payMethod === "paystack" && (
                              <div className="rounded-lg border bg-gray-50 p-4">
                                <p className="mb-3 text-sm text-gray-600">
                                  You'll be redirected to Paystack to complete
                                  your payment of{" "}
                                  <span className="font-bold">
                                    R{c.contributionAmount?.toLocaleString()}
                                  </span>
                                  . Payment is processed securely in ZAR.
                                </p>
                                <button
                                  onClick={() => handlePaystack(c.id)}
                                  disabled={submitting}
                                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-gold-500 py-2.5 text-sm font-medium text-white hover:bg-gold-600 disabled:opacity-50"
                                >
                                  {submitting ? (
                                    <Loader2
                                      size={16}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <ExternalLink size={16} />
                                  )}
                                  Pay R{c.contributionAmount?.toLocaleString()}{" "}
                                  via Paystack
                                </button>
                              </div>
                            )}

                            {payMethod === "pop" && (
                              <div className="space-y-3 rounded-lg border bg-gray-50 p-4">
                                <p className="text-sm text-gray-600">
                                  Upload your proof of payment (bank transfer
                                  screenshot, EFT confirmation, etc.). A manager
                                  will review and confirm your payment.
                                </p>

                                <div className="rounded-lg bg-blue-50 p-3">
                                  <p className="text-xs font-medium text-blue-700 mb-1">Payment Details:</p>
                                  <div className="grid grid-cols-2 gap-1 text-xs text-blue-600">
                                    <span>Property:</span>
                                    <span className="font-medium">{c.property?.title ?? "&#8212;"}</span>
                                    <span>Amount:</span>
                                    <span className="font-bold">R{c.contributionAmount?.toLocaleString()}</span>
                                  </div>
                                </div>

                                <div>
                                  <label className="mb-1 block text-xs font-medium text-gray-600">
                                    Proof of Payment *
                                  </label>
                                  <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*,.pdf"
                                    onChange={handleFileSelect}
                                    className="w-full rounded-lg border bg-white px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-gold-100 file:px-3 file:py-1 file:text-xs file:text-gold-700"
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
                                      {popFile.name} (
                                      {(popFile.size / 1024).toFixed(0)} KB)
                                    </div>
                                  )}
                                </div>

                                <div>
                                  <label className="mb-1 block text-xs font-medium text-gray-600">
                                    Payment Reference (optional)
                                  </label>
                                  <input
                                    type="text"
                                    value={popRef}
                                    onChange={(e) => setPopRef(e.target.value)}
                                    placeholder="Bank reference or transaction number"
                                    className="w-full rounded-lg border px-3 py-2 text-sm focus:border-gold-500 focus:outline-none"
                                  />
                                </div>

                                <div>
                                  <label className="mb-1 block text-xs font-medium text-gray-600">
                                    Notes (optional)
                                  </label>
                                  <textarea
                                    value={popNotes}
                                    onChange={(e) => setPopNotes(e.target.value)}
                                    rows={2}
                                    placeholder="Any additional info about the payment..."
                                    className="w-full rounded-lg border px-3 py-2 text-sm focus:border-gold-500 focus:outline-none"
                                  />
                                </div>

                                <button
                                  onClick={() => handleSubmitPOP(c.id)}
                                  disabled={submitting || !popFile}
                                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-gold-500 py-2.5 text-sm font-medium text-white hover:bg-gold-600 disabled:opacity-50"
                                >
                                  {submitting ? (
                                    <Loader2
                                      size={16}
                                      className="animate-spin"
                                    />
                                  ) : (
                                    <Send size={16} />
                                  )}
                                  Submit Proof of Payment
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {c.paymentStatus === "PROCESSING" && (
                      <div className="m-4 rounded-lg border bg-blue-50 p-4 text-sm text-blue-700">
                        <p className="mb-2 font-medium">
                          Payment initiated via Paystack
                        </p>
                        <p className="mb-3">
                          Completed the payment? Click below to verify.
                        </p>
                        <button
                          onClick={() =>
                            handleVerify(c.id, c.paymentReference ?? "")
                          }
                          disabled={submitting}
                          className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {submitting ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <RefreshCw size={16} />
                          )}
                          Verify Payment
                        </button>
                      </div>
                    )}

                    {c.paymentStatus === "POP_SUBMITTED" && (
                      <div className="m-4 flex items-center gap-3 rounded-lg border bg-yellow-50 p-4 text-sm text-yellow-700">
                        <Clock size={20} />
                        <div>
                          <p className="font-medium">
                            Proof of payment under review
                          </p>
                          <p className="text-xs">
                            A manager will review your payment shortly. You'll
                            receive a notification once confirmed.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}

        {verifyingRef && payingId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl text-center">
              <CreditCard
                className="mx-auto mb-3 text-gold-500"
                size={40}
              />
              <h3 className="text-lg font-bold text-gray-900">
                Verify Payment
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                Have you completed the payment on Paystack?
              </p>
              <p className="mt-1 font-mono text-xs text-gray-400">
                Ref: {verifyingRef}
              </p>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => {
                    setVerifyingRef(null);
                    setPayingId(null);
                  }}
                  className="flex-1 rounded-lg bg-gray-100 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200"
                >
                  Not Yet
                </button>
                <button
                  onClick={() => handleVerify(payingId, verifyingRef)}
                  disabled={submitting}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gold-500 py-2 text-sm font-medium text-white hover:bg-gold-600 disabled:opacity-50"
                >
                  {submitting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <CheckCircle size={16} />
                  )}
                  Verify
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}