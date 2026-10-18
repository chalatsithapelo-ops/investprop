import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Handshake, Plus, Loader2 } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

export const Route = createFileRoute("/admin/referrals/")({
  component: AdminReferralsPage,
});

const ZAR = (n: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(n ?? 0);

const PARTNER_TYPES = ["BOND_ORIGINATOR", "CONVEYANCER", "AUCTION_HOUSE", "INSURANCE", "OTHER"];
const LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "CONVERTED", "LOST"];

function AdminReferralsPage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("BOND_ORIGINATOR");
  const [contactEmail, setContactEmail] = useState("");
  const [commissionBps, setCommissionBps] = useState("0");
  const [commissionFlat, setCommissionFlat] = useState("0");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const isManager = user?.role === "ADMIN" || user?.role === "DEVELOPMENT_MANAGER";
  const token = authToken ?? "";

  const summaryQuery = useQuery({
    ...trpc.getReferralSummary.queryOptions({ authToken: token }),
    enabled: !!authToken && isManager,
  });
  const partnersQuery = useQuery({
    ...trpc.getReferralPartners.queryOptions({ authToken: token }),
    enabled: !!authToken && isManager,
  });
  const leadsQuery = useQuery({
    ...trpc.getReferralLeads.queryOptions({ authToken: token }),
    enabled: !!authToken && isManager,
  });

  const summary = summaryQuery.data as any;
  const partners = (partnersQuery.data as any[] | undefined) ?? [];
  const leads = (leadsQuery.data as any[] | undefined) ?? [];

  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: trpc.getReferralSummary.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.getReferralPartners.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.getReferralLeads.queryKey() });
  };

  const handleCreatePartner = async () => {
    if (!authToken || !name.trim()) {
      toast.error("Partner name is required.");
      return;
    }
    setSaving(true);
    try {
      await trpcClient.upsertReferralPartner.mutate({
        authToken,
        name: name.trim(),
        type: type as any,
        contactEmail: contactEmail || undefined,
        commissionBps: Number(commissionBps) || 0,
        commissionFlat: Number(commissionFlat) || 0,
        active: true,
      });
      toast.success("Partner saved.");
      setShowForm(false);
      setName("");
      setContactEmail("");
      setCommissionBps("0");
      setCommissionFlat("0");
      refetchAll();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save partner.");
    } finally {
      setSaving(false);
    }
  };

  const handleLeadStatus = async (id: number, status: string) => {
    if (!authToken) return;
    try {
      await trpcClient.updateReferralLead.mutate({ authToken, id, status: status as any });
      toast.success("Lead updated.");
      refetchAll();
    } catch (err: any) {
      toast.error(err?.message ?? "Could not update lead.");
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
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-teal-100 p-2">
            <Handshake className="text-teal-600" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Referral partners</h1>
            <p className="text-sm text-gray-500">Commission ledger for distressed-deal introductions.</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Commission earned" value={ZAR(summary?.totalCommissionEarned ?? 0)} />
          <StatCard label="Converted leads" value={summary?.convertedCount ?? 0} />
          <StatCard label="Total leads" value={summary?.totalLeads ?? 0} />
          <StatCard label="Active partners" value={summary?.activePartners ?? 0} />
        </div>

        {/* Partners */}
        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Partners</h2>
            <button
              onClick={() => setShowForm((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-700"
            >
              <Plus size={16} /> Add partner
            </button>
          </div>

          {showForm && (
            <div className="mb-4 grid gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:grid-cols-2 lg:grid-cols-3">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Partner name"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                {PARTNER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <input
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="Contact email"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                value={commissionBps}
                onChange={(e) => setCommissionBps(e.target.value)}
                type="number"
                placeholder="Commission bps (100 = 1%)"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                value={commissionFlat}
                onChange={(e) => setCommissionFlat(e.target.value)}
                type="number"
                placeholder="Flat fee (R)"
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                onClick={handleCreatePartner}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
              >
                {saving && <Loader2 className="animate-spin" size={16} />} Save
              </button>
            </div>
          )}

          {partners.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="pb-2">Name</th>
                    <th className="pb-2">Type</th>
                    <th className="pb-2">Commission</th>
                    <th className="pb-2 text-right">Leads</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((p) => (
                    <tr key={p.id} className="border-t border-gray-100">
                      <td className="py-2 font-medium text-gray-900">{p.name}</td>
                      <td className="py-2">{p.type.replace(/_/g, " ")}</td>
                      <td className="py-2">
                        {p.commissionBps / 100}% {p.commissionFlat > 0 && `+ ${ZAR(p.commissionFlat)}`}
                      </td>
                      <td className="py-2 text-right">{p.leadCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No partners yet.</p>
          )}
        </div>

        {/* Leads */}
        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-4 font-semibold text-gray-900">Leads</h2>
          {leads.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="pb-2">Contact</th>
                    <th className="pb-2">Partner</th>
                    <th className="pb-2 text-right">Commission</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.id} className="border-t border-gray-100">
                      <td className="py-2">
                        <div className="font-medium text-gray-900">{l.contactName ?? "—"}</div>
                        <div className="text-xs text-gray-400">{l.contactEmail}</div>
                      </td>
                      <td className="py-2">{l.partnerName}</td>
                      <td className="py-2 text-right">{ZAR(l.commissionAmount)}</td>
                      <td className="py-2">
                        <select
                          value={l.status}
                          onChange={(e) => handleLeadStatus(l.id, e.target.value)}
                          className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
                        >
                          {LEAD_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No leads yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <span className="text-sm text-gray-500">{label}</span>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
