import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  Building,
  DollarSign,
  TrendingUp,
  PieChart,
  ArrowRight,
  Users,
  CreditCard,
  Clock,
  CheckCircle,
  FileText,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/investments/my-contributions/")({
  component: MyContributionsPage,
});

function MyContributionsPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const contributionsQuery = useQuery({
    ...trpc.getMyContributions.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
  });

  const data = contributionsQuery.data as any;
  const contributions = data?.contributions ?? data ?? [];
  const contributionsArr = Array.isArray(contributions) ? contributions : [];
  const summary = data?.summary ?? {};

  const totalProperties =
    summary.totalProperties ?? contributionsArr.length;
  const totalContributions =
    summary.totalContributions ??
    contributionsArr.reduce(
      (sum: number, c: any) => sum + (Number(c.amount ?? c.invested ?? 0)),
      0,
    );
  const totalExpectedReturns =
    summary.totalExpectedReturns ??
    contributionsArr.reduce(
      (sum: number, c: any) =>
        sum + (Number(c.expectedReturn ?? c.expectedReturns ?? 0)),
      0,
    );
  const totalExpectedPayout =
    summary.totalExpectedPayout ?? totalContributions + totalExpectedReturns;

  if (!user || !authToken) return null;

  if (contributionsQuery.isLoading) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold-500 border-r-transparent" />
        </div>
      </div>
    );
  }

  if (contributionsQuery.isError) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="rounded-lg bg-red-50 p-4 text-red-600">
            Failed to load contributions. Please try again later.
          </div>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: "Properties Invested",
      value: totalProperties,
      icon: Building,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Total Invested",
      value: `R${Number(totalContributions).toLocaleString()}`,
      icon: DollarSign,
      color: "text-gold-600",
      bg: "bg-gold-50",
    },
    {
      label: "Expected Returns",
      value: `R${Number(totalExpectedReturns).toLocaleString()}`,
      icon: TrendingUp,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      label: "Total Payout",
      value: `R${Number(totalExpectedPayout).toLocaleString()}`,
      icon: PieChart,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
  ];

  const statusColor = (status: string) => {
    const s = (status ?? "").toUpperCase();
    if (s === "ACTIVE" || s === "APPROVED" || s === "CONFIRMED")
      return "bg-emerald-50 text-emerald-600";
    if (s === "PENDING" || s === "SUBMITTED")
      return "bg-gold-50 text-gold-600";
    if (s === "COMPLETED" || s === "MATURED")
      return "bg-blue-50 text-blue-600";
    if (s === "REJECTED" || s === "CANCELLED")
      return "bg-red-50 text-red-600";
    return "bg-gray-100 text-gray-500";
  };

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <PieChart className="text-gold-600" size={32} />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                My Contributions
              </h1>
              <p className="mt-1 text-gray-500">
                Track your property investments, returns, and portfolio
                performance
              </p>
            </div>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{card.label}</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {card.value}
                  </p>
                </div>
                <div className={`rounded-lg ${card.bg} p-3`}>
                  <card.icon className={card.color} size={22} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Status Breakdown */}
        {summary.propertiesByStatus && (
          <div className="mb-6 rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Investment Status Breakdown
            </h2>
            <div className="flex flex-wrap gap-3">
              {Object.entries(summary.propertiesByStatus).map(
                ([status, count]: any) => (
                  <div
                    key={status}
                    className="rounded-lg bg-navy-800/30 px-4 py-2"
                  >
                    <p className="text-xs text-gray-500">{status}</p>
                    <p className="text-lg font-semibold text-gray-900">{count}</p>
                  </div>
                ),
              )}
            </div>
          </div>
        )}

        {/* Contributions List */}
        <div className="rounded-xl border border-navy-800/50 bg-navy-900/50">
          <div className="border-b border-navy-800/50 p-6">
            <h2 className="text-lg font-semibold text-gray-900">
              All Contributions ({contributionsArr.length})
            </h2>
          </div>

          {contributionsArr.length === 0 ? (
            <div className="p-12 text-center">
              <Building className="mx-auto mb-3 text-gray-600" size={48} />
              <p className="text-gray-500">
                You haven't made any investments yet.
              </p>
              <Link
                to="/investments/opportunities"
                className="mt-4 inline-flex items-center gap-2 text-sm text-gold-600 hover:text-gold-500"
              >
                Browse Opportunities
                <ArrowRight size={14} />
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-navy-800/50">
              {contributionsArr.map((contribution: any, idx: number) => {
                const propertyId =
                  contribution.propertyId ?? contribution.id;
                const amount = Number(
                  contribution.amount ?? contribution.invested ?? 0,
                );
                const expectedReturn = Number(
                  contribution.expectedReturn ??
                    contribution.expectedReturns ??
                    0,
                );
                const status =
                  contribution.status ??
                  contribution.investmentStatus ??
                  "ACTIVE";
                const propertyName =
                  contribution.propertyName ??
                  contribution.property?.name ??
                  contribution.property?.title ??
                  `Property #${propertyId}`;
                const sharePercent =
                  contribution.sharePercentage ??
                  contribution.sharePercent ??
                  null;
                const roi = contribution.roi ?? null;

                return (
                  <div key={idx} className="p-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-4">
                        <div className="rounded-lg bg-blue-50 p-2.5">
                          <Building className="text-blue-600" size={20} />
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            {propertyName}
                          </h3>
                          <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                            <span>
                              Invested: R{amount.toLocaleString()}
                            </span>
                            {expectedReturn > 0 && (
                              <span className="text-emerald-600">
                                Return: R{expectedReturn.toLocaleString()}
                              </span>
                            )}
                            {sharePercent != null && (
                              <span className="text-gold-600">
                                Share: {Number(sharePercent).toFixed(2)}%
                              </span>
                            )}
                            {roi != null && (
                              <span className="text-purple-600">
                                ROI: {Number(roi).toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${statusColor(status)}`}
                        >
                          {status}
                        </span>
                        {/* Payment Status Badge */}
                        {contribution.paymentStatus && contribution.paymentStatus !== "NOT_PAID" && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              contribution.paymentStatus === "PAID"
                                ? "bg-emerald-100 text-emerald-700"
                                : contribution.paymentStatus === "POP_SUBMITTED" || contribution.paymentStatus === "PROCESSING"
                                  ? "bg-blue-100 text-blue-700"
                                  : contribution.paymentStatus === "AWAITING_PAYMENT" || contribution.paymentStatus === "POP_REJECTED"
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {contribution.paymentStatus === "PAID" && <><CheckCircle size={11} /> Paid</>}
                            {contribution.paymentStatus === "AWAITING_PAYMENT" && <><Clock size={11} /> Payment Due</>}
                            {contribution.paymentStatus === "POP_SUBMITTED" && <><FileText size={11} /> POP Under Review</>}
                            {contribution.paymentStatus === "POP_REJECTED" && <><Clock size={11} /> POP Rejected</>}
                            {contribution.paymentStatus === "PROCESSING" && <><Clock size={11} /> Processing</>}
                          </span>
                        )}
                        {/* Make Payment Button */}
                        {(contribution.paymentStatus === "AWAITING_PAYMENT" || contribution.paymentStatus === "POP_REJECTED") && (
                          <Link
                            to="/investments/payments"
                            className="inline-flex items-center gap-1 rounded-lg bg-gold-500 px-3 py-1.5 text-xs font-semibold text-navy-950 hover:bg-gold-400 transition"
                          >
                            <CreditCard size={12} /> Make Payment
                          </Link>
                        )}
                        {propertyId && (
                          <Link
                            to={`/investments/opportunities/${propertyId}`}
                            className="flex items-center gap-1 text-sm text-gold-600 hover:text-gold-500"
                          >
                            View
                            <ArrowRight size={14} />
                          </Link>
                        )}
                      </div>
                    </div>

                    {/* Real-time metrics if available */}
                    {(contribution.budgetProgress != null ||
                      contribution.estimatedValue != null) && (
                      <div className="mt-3 flex flex-wrap gap-3">
                        {contribution.budgetProgress != null && (
                          <div className="rounded bg-navy-800/30 px-3 py-1.5 text-xs">
                            <span className="text-gray-500">Budget: </span>
                            <span className="text-gray-900">
                              {Number(contribution.budgetProgress).toFixed(0)}%
                            </span>
                          </div>
                        )}
                        {contribution.estimatedValue != null && (
                          <div className="rounded bg-navy-800/30 px-3 py-1.5 text-xs">
                            <span className="text-gray-500">Est. Value: </span>
                            <span className="text-emerald-600">
                              R
                              {Number(
                                contribution.estimatedValue,
                              ).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
