import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Landmark, FileText, CheckCircle2, Clock, Plus, X, Send, AlertTriangle,
  Loader2, Phone, Mail, Paperclip, Scale,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

export const Route = createFileRoute("/partner-portal/")({
  component: PartnerPortalPage,
});

const R = (n: number) => `R${Math.round(n).toLocaleString("en-ZA")}`;

type OfferDraft = {
  bankName: string;
  approvedAmount: number;
  annualInterestRate: number;
  monthlyInstalment: number;
  loanTermYears: number;
  notes: string;
};

function emptyOffer(): OfferDraft {
  return { bankName: "", approvedAmount: 0, annualInterestRate: 11.75, monthlyInstalment: 0, loanTermYears: 20, notes: "" };
}

function PartnerPortalPage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const isOriginator = user?.role === "BOND_ORIGINATOR";
  const isConveyancer = user?.role === "CONVEYANCER";

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
    else if (!isOriginator && !isConveyancer) navigate({ to: "/dashboard" });
  }, [user, authToken, hasHydrated, isOriginator, isConveyancer]);

  const appsQuery = useQuery({
    ...trpc.getOriginatorApplications.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isOriginator,
  });
  const leadsQuery = useQuery({
    ...trpc.getMyPartnerLeads.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && (isConveyancer || isOriginator),
  });

  const [openId, setOpenId] = useState<number | null>(null);
  const [offers, setOffers] = useState<OfferDraft[]>([emptyOffer()]);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: trpc.getOriginatorApplications.queryKey() });
    void queryClient.invalidateQueries({ queryKey: trpc.getMyPartnerLeads.queryKey() });
  };

  const acknowledge = async (id: number) => {
    setBusy(true);
    try {
      await trpcClient.originatorAcknowledgeApplication.mutate({ authToken: authToken!, id });
      toast.success("Application acknowledged — status set to Banks reviewing.");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not acknowledge.");
    } finally {
      setBusy(false);
    }
  };

  const submitOffers = async (id: number) => {
    const clean = offers.filter((o) => o.bankName.trim() && o.approvedAmount > 0);
    if (!clean.length) {
      toast.error("Add at least one bank offer with a bank name and amount.");
      return;
    }
    setBusy(true);
    try {
      await trpcClient.originatorSubmitOffers.mutate({ authToken: authToken!, id, offers: clean });
      toast.success("Offers submitted — the applicant has been notified.");
      setOpenId(null);
      setOffers([emptyOffer()]);
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not submit offers.");
    } finally {
      setBusy(false);
    }
  };

  const decline = async (id: number) => {
    setBusy(true);
    try {
      await trpcClient.originatorSubmitOffers.mutate({ authToken: authToken!, id, decline: true });
      toast.success("Application marked declined — the applicant has been notified.");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "Could not decline.");
    } finally {
      setBusy(false);
    }
  };

  if (!user || !authToken || (!isOriginator && !isConveyancer)) return null;

  const apps = appsQuery.data?.applications ?? [];
  const leads = leadsQuery.data?.leads ?? [];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Navbar />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-teal-100 p-2 text-teal-700">
            {isConveyancer ? <Scale size={22} /> : <Landmark size={22} />}
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              {isConveyancer ? "Conveyancer Portal" : "Bond Originator Portal"}
            </h1>
            <p className="text-sm text-gray-600">
              {isConveyancer
                ? "Referral leads routed to your firm."
                : "Applications routed to you — acknowledge, submit bank offers, keep everyone in sync."}
            </p>
          </div>
        </div>

        {/* Originator: application queue */}
        {isOriginator && (
          <section className="mt-6">
            <h2 className="mb-3 text-lg font-semibold">Application queue</h2>
            {appsQuery.isLoading ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : apps.length === 0 ? (
              <p className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
                No applications routed to you yet.
              </p>
            ) : (
              <div className="space-y-3">
                {apps.map((a: any) => (
                  <div key={a.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{a.applicantName ?? "Applicant"}</p>
                        <p className="text-sm text-gray-500">
                          Ref {a.referralReference ?? "—"} · requested {R(a.requestedBondAmount)}
                        </p>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                          {a.applicantEmail && (
                            <span className="inline-flex items-center gap-1"><Mail size={12} />{a.applicantEmail}</span>
                          )}
                          {a.applicantPhone && (
                            <span className="inline-flex items-center gap-1"><Phone size={12} />{a.applicantPhone}</span>
                          )}
                          <span>Income {R(a.grossMonthlyIncome)}/mo</span>
                          <span>Deposit {R(a.depositAmount)}</span>
                        </div>
                      </div>
                      <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
                        {a.status}
                      </span>
                    </div>

                    {/* Documents */}
                    {a.documents?.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {a.documents.map((d: any) => (
                          <a
                            key={d.id}
                            href={d.fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 hover:bg-gray-100"
                          >
                            <Paperclip size={12} /> {d.docType}
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Existing offers */}
                    {a.offers?.length > 0 && (
                      <ul className="mt-3 space-y-1 text-sm">
                        {a.offers.map((o: any) => (
                          <li key={o.id} className="flex items-center justify-between rounded border border-gray-100 bg-gray-50 px-2 py-1">
                            <span>{o.bankName} — {R(o.approvedAmount)} @ {o.annualInterestRate}%</span>
                            <span className="text-xs text-gray-400">{o.status}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Actions */}
                    {!["ACCEPTED", "WITHDRAWN", "DECLINED"].includes(a.status) && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {a.status === "SUBMITTED" && (
                          <button
                            onClick={() => acknowledge(a.id)}
                            disabled={busy}
                            className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-500 disabled:opacity-60"
                          >
                            <Clock size={14} /> Acknowledge
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setOpenId(openId === a.id ? null : a.id);
                            setOffers([emptyOffer()]);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-600"
                        >
                          <Plus size={14} /> Submit offers
                        </button>
                        <button
                          onClick={() => decline(a.id)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60"
                        >
                          <AlertTriangle size={14} /> Decline
                        </button>
                      </div>
                    )}

                    {/* Offer entry form */}
                    {openId === a.id && (
                      <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50/50 p-4">
                        {offers.map((o, i) => (
                          <div key={i} className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                            <input
                              placeholder="Bank"
                              value={o.bankName}
                              onChange={(e) => setOffers((p) => p.map((x, j) => (j === i ? { ...x, bankName: e.target.value } : x)))}
                              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                            />
                            <input
                              type="number"
                              placeholder="Approved amount"
                              value={o.approvedAmount || ""}
                              onChange={(e) => setOffers((p) => p.map((x, j) => (j === i ? { ...x, approvedAmount: Number(e.target.value) } : x)))}
                              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                            />
                            <input
                              type="number"
                              step="0.01"
                              placeholder="Rate %"
                              value={o.annualInterestRate || ""}
                              onChange={(e) => setOffers((p) => p.map((x, j) => (j === i ? { ...x, annualInterestRate: Number(e.target.value) } : x)))}
                              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                            />
                            <input
                              type="number"
                              placeholder="Instalment /mo"
                              value={o.monthlyInstalment || ""}
                              onChange={(e) => setOffers((p) => p.map((x, j) => (j === i ? { ...x, monthlyInstalment: Number(e.target.value) } : x)))}
                              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                            />
                            <input
                              type="number"
                              placeholder="Term (yrs)"
                              value={o.loanTermYears || ""}
                              onChange={(e) => setOffers((p) => p.map((x, j) => (j === i ? { ...x, loanTermYears: Number(e.target.value) } : x)))}
                              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                            />
                            {offers.length > 1 && (
                              <button
                                onClick={() => setOffers((p) => p.filter((_, j) => j !== i))}
                                className="inline-flex items-center justify-center rounded-md border border-gray-300 text-gray-400 hover:text-rose-500"
                                aria-label="Remove offer"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setOffers((p) => [...p, emptyOffer()])}
                            className="inline-flex items-center gap-1 rounded-md border border-teal-300 px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-100"
                          >
                            <Plus size={12} /> Add another bank
                          </button>
                          <button
                            onClick={() => submitOffers(a.id)}
                            disabled={busy}
                            className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-600 disabled:opacity-60"
                          >
                            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Submit to applicant
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Referral leads (conveyancer + originator) */}
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold">Referral leads</h2>
          {leadsQuery.isLoading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : leads.length === 0 ? (
            <p className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
              No referral leads yet.
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-2">Ref</th>
                    <th className="px-4 py-2">Contact</th>
                    <th className="px-4 py-2">Value</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l: any) => (
                    <tr key={l.id} className="border-t border-gray-100">
                      <td className="px-4 py-2 font-mono text-xs">{l.reference ?? "—"}</td>
                      <td className="px-4 py-2">
                        <div>{l.contactName ?? "—"}</div>
                        <div className="text-xs text-gray-400">{l.contactEmail}</div>
                      </td>
                      <td className="px-4 py-2">{l.estimatedValue ? R(l.estimatedValue) : "—"}</td>
                      <td className="px-4 py-2">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{l.status}</span>
                      </td>
                      <td className="px-4 py-2">{new Date(l.createdAt).toLocaleDateString("en-ZA")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
