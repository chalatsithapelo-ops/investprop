import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Landmark,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  Building2,
  ArrowRight,
  Info,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import { useBlockPropertyOwner } from "~/utils/use-require-role";
import toast from "react-hot-toast";

const R = (n: number) =>
  `R${(Number.isFinite(n) ? n : 0).toLocaleString("en-ZA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

export const Route = createFileRoute("/finance/home-loan/")({
  component: HomeLoanApplicationsPage,
});

// Lifecycle in order, for a simple progress tracker.
const STATUS_FLOW = ["SUBMITTED", "BANKS_REVIEWING", "OFFERS_IN", "ACCEPTED"] as const;
const STATUS_META: Record<
  string,
  { label: string; badge: string; description: string }
> = {
  SUBMITTED: {
    label: "Submitted",
    badge: "bg-blue-100 text-blue-700",
    description: "Received — being handed to the bond originator.",
  },
  BANKS_REVIEWING: {
    label: "Banks reviewing",
    badge: "bg-amber-100 text-amber-700",
    description: "The originator has submitted your application to the banks.",
  },
  OFFERS_IN: {
    label: "Offers in",
    badge: "bg-teal-100 text-teal-700",
    description: "One or more banks have responded. Compare and choose below.",
  },
  ACCEPTED: {
    label: "Accepted",
    badge: "bg-emerald-100 text-emerald-700",
    description: "You've accepted an offer. The originator will guide you to grant.",
  },
  DECLINED: {
    label: "Declined",
    badge: "bg-rose-100 text-rose-700",
    description: "The banks were unable to approve this application.",
  },
  WITHDRAWN: {
    label: "Withdrawn",
    badge: "bg-gray-100 text-gray-600",
    description: "This application was withdrawn.",
  },
};

function HomeLoanApplicationsPage() {
  const navigate = useNavigate();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const authToken = useAuthStore((s) => s.token);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  useBlockPropertyOwner();

  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    if (hasHydrated && !authToken) navigate({ to: "/login" });
  }, [hasHydrated, authToken, navigate]);

  const appsQuery = useQuery({
    ...trpc.getMyHomeLoanApplications.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
  });

  const applications = (appsQuery.data?.applications as any[] | undefined) ?? [];

  const handleAccept = async (offerId: number) => {
    if (!authToken) return;
    setBusyId(offerId);
    try {
      await trpcClient.acceptHomeLoanOffer.mutate({ authToken, offerId });
      toast.success("Offer accepted. The originator will be in touch.");
      void appsQuery.refetch();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not accept the offer.");
    } finally {
      setBusyId(null);
    }
  };

  const handleWithdraw = async (id: number) => {
    if (!authToken) return;
    setBusyId(id);
    try {
      await trpcClient.withdrawHomeLoanApplication.mutate({ authToken, id });
      toast.success("Application withdrawn.");
      void appsQuery.refetch();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not withdraw the application.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Navbar />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-teal-100 p-2 text-teal-700">
            <Landmark size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Home Loan Applications</h1>
            <p className="text-sm text-gray-600">
              Track your multi-bank applications and compare the offers that come back.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          <Info size={16} className="mt-0.5 shrink-0" />
          <p>
            We submit one application to all major banks through a registered bond originator who
            holds the credit licence. Offers are indicative until the bank issues a formal grant.
          </p>
        </div>

        {appsQuery.isLoading ? (
          <div className="mt-10 flex justify-center">
            <Loader2 className="animate-spin text-teal-600" size={28} />
          </div>
        ) : applications.length === 0 ? (
          <div className="mt-10 rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
            <Building2 className="mx-auto text-gray-300" size={40} />
            <h2 className="mt-3 text-lg font-semibold text-gray-900">No applications yet</h2>
            <p className="mt-1 text-sm text-gray-600">
              Run a prequalification and apply to all major banks in one step.
            </p>
            <Link
              to="/finance/prequalify"
              search={{ propertyId: undefined, propertyPrice: undefined }}
              className="mt-4 inline-flex items-center gap-1 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-500"
            >
              Start a prequalification <ArrowRight size={14} />
            </Link>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            {applications.map((app) => {
              const meta = (STATUS_META[app.status] ?? STATUS_META.SUBMITTED)!;
              const terminal = app.status === "DECLINED" || app.status === "WITHDRAWN";
              const flowIndex = STATUS_FLOW.indexOf(app.status);
              const offers = (app.offers as any[]) ?? [];
              return (
                <div
                  key={app.id}
                  className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-gray-500">
                        Application #{app.id} ·{" "}
                        {new Date(app.createdAt).toLocaleDateString("en-ZA")}
                      </p>
                      <p className="mt-0.5 text-lg font-bold text-gray-900">
                        {R(app.requestedBondAmount)} bond
                        {app.propertyPrice > 0 && ` · ${R(app.propertyPrice)} property`}
                      </p>
                      {app.originatorName && (
                        <p className="text-sm text-gray-600">via {app.originatorName}</p>
                      )}
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${meta.badge}`}
                    >
                      {meta.label}
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-gray-600">{app.statusNote || meta.description}</p>

                  {/* Progress tracker */}
                  {!terminal && (
                    <div className="mt-4 flex items-center gap-2">
                      {STATUS_FLOW.map((s, i) => (
                        <div key={s} className="flex flex-1 items-center">
                          <div
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                              i <= flowIndex
                                ? "bg-teal-600 text-white"
                                : "bg-gray-100 text-gray-400"
                            }`}
                          >
                            {i < flowIndex ? <CheckCircle2 size={16} /> : i + 1}
                          </div>
                          {i < STATUS_FLOW.length - 1 && (
                            <div
                              className={`h-0.5 flex-1 ${
                                i < flowIndex ? "bg-teal-600" : "bg-gray-200"
                              }`}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Bank offers */}
                  {offers.length > 0 && (
                    <div className="mt-5">
                      <h3 className="text-sm font-semibold text-gray-900">
                        Bank offers ({offers.length})
                      </h3>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2">
                        {offers.map((o) => {
                          const accepted = o.status === "ACCEPTED";
                          const declined = o.status === "DECLINED";
                          return (
                            <div
                              key={o.id}
                              className={`rounded-lg border p-4 ${
                                accepted
                                  ? "border-emerald-300 bg-emerald-50"
                                  : declined
                                    ? "border-gray-200 bg-gray-50 opacity-70"
                                    : "border-gray-200 bg-white"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <p className="font-semibold text-gray-900">{o.bankName}</p>
                                {accepted && (
                                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                    <CheckCircle2 size={14} /> Accepted
                                  </span>
                                )}
                                {declined && (
                                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-gray-400">
                                    <XCircle size={14} /> Declined
                                  </span>
                                )}
                              </div>
                              <dl className="mt-2 space-y-1 text-sm">
                                <div className="flex justify-between">
                                  <dt className="text-gray-500">Rate</dt>
                                  <dd className="font-medium text-gray-900">
                                    {o.annualInterestRate.toFixed(2)}%
                                  </dd>
                                </div>
                                <div className="flex justify-between">
                                  <dt className="text-gray-500">Instalment</dt>
                                  <dd className="font-medium text-gray-900">
                                    {R(o.monthlyInstalment)}/mo
                                  </dd>
                                </div>
                                <div className="flex justify-between">
                                  <dt className="text-gray-500">Approved</dt>
                                  <dd className="font-medium text-gray-900">
                                    {R(o.approvedAmount)}
                                  </dd>
                                </div>
                                <div className="flex justify-between">
                                  <dt className="text-gray-500">Term</dt>
                                  <dd className="font-medium text-gray-900">
                                    {o.loanTermYears}yr
                                  </dd>
                                </div>
                              </dl>
                              {app.status !== "ACCEPTED" && o.status === "OFFERED" && (
                                <button
                                  onClick={() => handleAccept(o.id)}
                                  disabled={busyId === o.id}
                                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-60"
                                >
                                  {busyId === o.id && (
                                    <Loader2 size={16} className="animate-spin" />
                                  )}
                                  Accept this offer
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  {!terminal && app.status !== "ACCEPTED" && (
                    <div className="mt-4 flex items-center gap-3 border-t border-gray-100 pt-4">
                      <button
                        onClick={() => handleWithdraw(app.id)}
                        disabled={busyId === app.id}
                        className="inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-rose-600 disabled:opacity-60"
                      >
                        {busyId === app.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Clock size={14} />
                        )}
                        Withdraw application
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-8 text-center">
          <Link
            to="/finance/prequalify"
            search={{ propertyId: undefined, propertyPrice: undefined }}
            className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:text-teal-600"
          >
            Run another prequalification <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
