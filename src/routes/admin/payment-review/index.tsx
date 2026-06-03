import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  CreditCard,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Loader2,
  DollarSign,
  User,
  Building,
  AlertTriangle,
  FileText,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

export const Route = createFileRoute("/admin/payment-review/")({
  component: PaymentReviewPage,
});

function PaymentReviewPage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [reviewingPayment, setReviewingPayment] = useState<any>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) {
      navigate({ to: "/login" });
      return;
    }
    const allowed = ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"];
    if (!allowed.includes(user.role)) {
      navigate({ to: "/dashboard" });
    }
  }, [user, authToken, hasHydrated]);

  const pendingQuery = useQuery({
    ...trpc.getPendingPayments.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
    refetchInterval: 30000,
  });

  const payments = (pendingQuery.data ?? []) as any[];

  const handleReview = async (action: "APPROVE" | "REJECT") => {
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
      queryClient.invalidateQueries({
        queryKey: trpc.getPendingPayments.queryKey(),
      });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to review payment");
    } finally {
      setReviewSubmitting(false);
    }
  };

  if (!user || !authToken) return null;

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gold-100 p-2.5">
              <CreditCard className="text-gold-600" size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Payment Review
              </h1>
              <p className="text-sm text-gray-500">
                Review and approve investor proof of payment submissions
              </p>
            </div>
          </div>
          <button
            onClick={() => pendingQuery.refetch()}
            disabled={pendingQuery.isFetching}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw
              size={14}
              className={pendingQuery.isFetching ? "animate-spin" : ""}
            />
            Refresh
          </button>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-orange-100 p-2">
                <Clock className="text-orange-600" size={18} />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {payments.length}
                </p>
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
                  R
                  {payments
                    .reduce(
                      (sum: number, p: any) =>
                        sum + Number(p.contributionAmount ?? 0),
                      0
                    )
                    .toLocaleString()}
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
                  {new Set(payments.map((p: any) => p.propertyId)).size}
                </p>
                <p className="text-xs text-gray-500">Properties</p>
              </div>
            </div>
          </div>
        </div>

        {/* Loading */}
        {pendingQuery.isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-gold-500" size={32} />
          </div>
        )}

        {/* Empty State */}
        {!pendingQuery.isLoading && payments.length === 0 && (
          <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-12 text-center">
            <CheckCircle
              className="mx-auto mb-3 text-green-400"
              size={48}
            />
            <h3 className="text-lg font-semibold text-gray-900">
              All Caught Up!
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              No proof of payment submissions pending review.
            </p>
          </div>
        )}

        {/* Payment Cards */}
        {!pendingQuery.isLoading && payments.length > 0 && (
          <div className="space-y-4">
            {payments.map((p: any) => (
              <div
                key={p.id}
                className="overflow-hidden rounded-xl border border-navy-800/50 bg-navy-900/50 shadow-sm"
              >
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                  {/* Left: Info */}
                  <div className="flex gap-4">
                    {p.property?.imageUrl && (
                      <img
                        src={p.property.imageUrl}
                        alt={p.property.title}
                        className="h-16 w-16 rounded-xl object-cover"
                      />
                    )}
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">
                        {p.property?.title ?? "Property"}
                      </h3>
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
                      <div className="mt-1 text-xs text-gray-400">
                        Submitted{" "}
                        {p.paymentSubmittedAt
                          ? new Date(p.paymentSubmittedAt).toLocaleString()
                          : "recently"}
                      </div>
                      {p.notes && (
                        <p className="mt-1 rounded bg-gray-100 px-2 py-1 text-xs text-gray-600 italic">
                          "{p.notes}"
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-700">
                      <Clock size={12} />
                      Pending Review
                    </span>

                    {/* View POP */}
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

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setReviewingPayment(p);
                          setReviewNotes("");
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition"
                      >
                        <CheckCircle size={14} /> Approve
                      </button>
                      <button
                        onClick={() => {
                          setReviewingPayment({ ...p, _rejectMode: true });
                          setReviewNotes("");
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 transition"
                      >
                        <XCircle size={14} /> Reject
                      </button>
                    </div>
                  </div>
                </div>

                {/* Funding Progress Bar */}
                {p.property?.fundingGoal && (
                  <div className="border-t bg-gray-50 px-5 py-3">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>Property Funding Progress</span>
                      <span>
                        R{Number(p.property.fundingRaised ?? 0).toLocaleString()} / R{Number(p.property.fundingGoal).toLocaleString()}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gray-200">
                      <div
                        className="h-2 rounded-full bg-emerald-500 transition-all"
                        style={{
                          width: `${Math.min(100, (Number(p.property.fundingRaised ?? 0) / Number(p.property.fundingGoal)) * 100)}%`,
                        }}
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
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setReviewingPayment(null)}
          >
            <div
              className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-b px-6 py-4">
                <h2 className="text-lg font-bold text-gray-900">
                  {reviewingPayment._rejectMode
                    ? "Reject Proof of Payment"
                    : "Confirm Payment Approval"}
                </h2>
              </div>
              <div className="space-y-4 p-6">
                {/* Summary */}
                <div className="rounded-lg bg-gray-50 p-4">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-400">Investor</p>
                      <p className="font-medium">
                        {reviewingPayment.investor?.name}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Amount</p>
                      <p className="font-bold text-gold-600">
                        R
                        {Number(
                          reviewingPayment.contributionAmount ?? 0
                        ).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Property</p>
                      <p className="font-medium">
                        {reviewingPayment.property?.title}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">Reference</p>
                      <p className="font-medium">
                        {reviewingPayment.paymentReference ?? "\u2014"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* View POP link */}
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

                {/* Reject: require reason */}
                {reviewingPayment._rejectMode && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                      Rejection Reason *
                    </label>
                    <textarea
                      value={reviewNotes}
                      onChange={(e) => setReviewNotes(e.target.value)}
                      placeholder="Explain why the proof of payment is being rejected..."
                      rows={3}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                )}

                {/* Approve confirmation text */}
                {!reviewingPayment._rejectMode && (
                  <div>
                    <p className="text-sm text-gray-600">
                      By approving this payment, the property's funding raised
                      will be incremented by{" "}
                      <span className="font-bold text-gold-600">
                        R
                        {Number(
                          reviewingPayment.contributionAmount ?? 0
                        ).toLocaleString()}
                      </span>
                      . This action cannot be undone.
                    </p>
                    <div>
                      <label className="mb-1.5 mt-3 block text-sm font-medium text-gray-700">
                        Notes (optional)
                      </label>
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

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 border-t px-6 py-4">
                <button
                  onClick={() => setReviewingPayment(null)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={() =>
                    handleReview(
                      reviewingPayment._rejectMode ? "REJECT" : "APPROVE"
                    )
                  }
                  disabled={
                    reviewSubmitting ||
                    (reviewingPayment._rejectMode && !reviewNotes.trim())
                  }
                  className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50 ${reviewingPayment._rejectMode ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
                >
                  {reviewSubmitting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : reviewingPayment._rejectMode ? (
                    <XCircle size={14} />
                  ) : (
                    <CheckCircle size={14} />
                  )}
                  {reviewingPayment._rejectMode
                    ? "Reject Payment"
                    : "Approve Payment"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
