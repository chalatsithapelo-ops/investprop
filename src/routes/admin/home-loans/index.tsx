import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Landmark, Loader2, Plus, Send } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

const R = (n: number) =>
  `R${(Number.isFinite(n) ? n : 0).toLocaleString("en-ZA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

export const Route = createFileRoute("/admin/home-loans/")({
  component: AdminHomeLoansPage,
});

const STATUSES = [
  "SUBMITTED",
  "BANKS_REVIEWING",
  "OFFERS_IN",
  "ACCEPTED",
  "DECLINED",
  "WITHDRAWN",
] as const;

type OfferDraft = {
  bankName: string;
  approvedAmount: string;
  annualInterestRate: string;
  monthlyInstalment: string;
  loanTermYears: string;
};

const EMPTY_OFFER: OfferDraft = {
  bankName: "",
  approvedAmount: "",
  annualInterestRate: "",
  monthlyInstalment: "",
  loanTermYears: "20",
};

function AdminHomeLoansPage() {
  const navigate = useNavigate();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [drafts, setDrafts] = useState<Record<number, OfferDraft>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated, navigate]);

  const isManager = user?.role === "ADMIN" || user?.role === "DEVELOPMENT_MANAGER";

  const appsQuery = useQuery({
    ...trpc.getHomeLoanApplicationsAdmin.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isManager,
  });

  const applications = (appsQuery.data?.applications as any[] | undefined) ?? [];

  const draftFor = (id: number) => drafts[id] ?? EMPTY_OFFER;
  const setDraft = (id: number, patch: Partial<OfferDraft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...draftFor(id), ...patch } }));

  const handleStatus = async (id: number, status: string) => {
    if (!authToken) return;
    setBusyId(id);
    try {
      await trpcClient.updateHomeLoanApplicationAdmin.mutate({
        authToken,
        id,
        status: status as any,
      });
      toast.success("Status updated.");
      void appsQuery.refetch();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not update status.");
    } finally {
      setBusyId(null);
    }
  };

  const handleAddOffer = async (id: number) => {
    if (!authToken) return;
    const d = draftFor(id);
    if (!d.bankName.trim()) {
      toast.error("Bank name is required.");
      return;
    }
    setBusyId(id);
    try {
      await trpcClient.updateHomeLoanApplicationAdmin.mutate({
        authToken,
        id,
        offers: [
          {
            bankName: d.bankName.trim(),
            approvedAmount: Number(d.approvedAmount) || 0,
            annualInterestRate: Number(d.annualInterestRate) || 0,
            monthlyInstalment: Number(d.monthlyInstalment) || 0,
            loanTermYears: Number(d.loanTermYears) || 20,
          },
        ],
      });
      toast.success("Offer recorded.");
      setDrafts((prev) => ({ ...prev, [id]: EMPTY_OFFER }));
      void appsQuery.refetch();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not record the offer.");
    } finally {
      setBusyId(null);
    }
  };

  if (!user || !authToken) return null;
  if (!isManager) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="text-xl font-bold text-gray-900">Admin access required</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Navbar />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-teal-100 p-2 text-teal-700">
            <Landmark size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Home-loan applications</h1>
            <p className="text-sm text-gray-500">
              Hand applications to the bond originator and record the banks' offers.
            </p>
          </div>
        </div>

        {appsQuery.isLoading ? (
          <div className="mt-10 flex justify-center">
            <Loader2 className="animate-spin text-teal-600" size={28} />
          </div>
        ) : applications.length === 0 ? (
          <p className="mt-10 text-center text-sm text-gray-400">No applications yet.</p>
        ) : (
          <div className="space-y-5">
            {applications.map((app) => {
              const d = draftFor(app.id);
              const offers = (app.offers as any[]) ?? [];
              return (
                <div
                  key={app.id}
                  className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-gray-500">
                        #{app.id} · {new Date(app.createdAt).toLocaleDateString("en-ZA")}
                      </p>
                      <p className="mt-0.5 font-bold text-gray-900">
                        {app.applicantName ?? "—"}{" "}
                        <span className="font-normal text-gray-500">
                          ({app.applicantEmail})
                        </span>
                      </p>
                      <p className="text-sm text-gray-700">
                        {R(app.requestedBondAmount)} bond
                        {app.propertyPrice > 0 && ` · ${R(app.propertyPrice)} property`} · income{" "}
                        {R(app.grossMonthlyIncome)}/mo
                        {app.applicantPhone && ` · ${app.applicantPhone}`}
                      </p>
                      {app.originatorName && (
                        <p className="text-xs text-gray-500">via {app.originatorName}</p>
                      )}
                    </div>
                    <select
                      value={app.status}
                      onChange={(e) => handleStatus(app.id, e.target.value)}
                      disabled={busyId === app.id}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s.replace(/_/g, " ")}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(app.documents as any[])?.length > 0 && (
                    <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        Submitted documents
                      </p>
                      <ul className="mt-1 flex flex-wrap gap-2">
                        {(app.documents as any[]).map((doc) => (
                          <li key={doc.id}>
                            <a
                              href={doc.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded border border-teal-200 bg-white px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50"
                            >
                              {doc.docType.replace(/_/g, " ")} · {doc.fileName}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {offers.length > 0 && (
                    <div className="mt-4 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-gray-500">
                            <th className="pb-1">Bank</th>
                            <th className="pb-1">Rate</th>
                            <th className="pb-1">Instalment</th>
                            <th className="pb-1">Approved</th>
                            <th className="pb-1">Term</th>
                            <th className="pb-1">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {offers.map((o) => (
                            <tr key={o.id} className="border-t border-gray-100">
                              <td className="py-1 font-medium text-gray-900">{o.bankName}</td>
                              <td className="py-1">{o.annualInterestRate.toFixed(2)}%</td>
                              <td className="py-1">{R(o.monthlyInstalment)}/mo</td>
                              <td className="py-1">{R(o.approvedAmount)}</td>
                              <td className="py-1">{o.loanTermYears}yr</td>
                              <td className="py-1">{o.status}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Add offer */}
                  <div className="mt-4 grid gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:grid-cols-6">
                    <input
                      value={d.bankName}
                      onChange={(e) => setDraft(app.id, { bankName: e.target.value })}
                      placeholder="Bank"
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm sm:col-span-2"
                    />
                    <input
                      value={d.annualInterestRate}
                      onChange={(e) => setDraft(app.id, { annualInterestRate: e.target.value })}
                      type="number"
                      placeholder="Rate %"
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    />
                    <input
                      value={d.monthlyInstalment}
                      onChange={(e) => setDraft(app.id, { monthlyInstalment: e.target.value })}
                      type="number"
                      placeholder="Instalment"
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    />
                    <input
                      value={d.approvedAmount}
                      onChange={(e) => setDraft(app.id, { approvedAmount: e.target.value })}
                      type="number"
                      placeholder="Approved"
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    />
                    <div className="flex gap-2">
                      <input
                        value={d.loanTermYears}
                        onChange={(e) => setDraft(app.id, { loanTermYears: e.target.value })}
                        type="number"
                        placeholder="Yrs"
                        className="w-16 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      />
                      <button
                        onClick={() => handleAddOffer(app.id)}
                        disabled={busyId === app.id}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-md bg-teal-600 px-2 py-1.5 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-60"
                      >
                        {busyId === app.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Plus size={14} />
                        )}
                        Offer
                      </button>
                    </div>
                  </div>

                  <p className="mt-2 flex items-center gap-1 text-xs text-gray-400">
                    <Send size={12} /> Recording an offer moves the application to “Offers in”.
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
