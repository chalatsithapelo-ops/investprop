import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Target,
  DollarSign,
  Users,
  CheckCircle,
  XCircle,
  Send,
  TrendingUp,
  Building,
  ArrowRight,
  X,
  Calendar,
  Mail,
  FileText,
  Clock,
  Eye,
  CreditCard,
  Download,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

const MANAGER_ROLES = [
  "DEVELOPMENT_MANAGER",
  "PROJECT_MANAGER",
  "PROPERTY_OWNER",
  "OWNER",
];

export const Route = createFileRoute("/funding-campaigns/")({
  component: FundingCampaignsPage,
});

function FundingCampaignsPage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const isManager = MANAGER_ROLES.includes(user?.role ?? "");
  const [tab, setTab] = useState<"campaigns" | "proposals" | "payments">("campaigns");
  const [reviewingPayment, setReviewingPayment] = useState<any>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [showPublishForm, setShowPublishForm] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<any>(null);
  const [publishForm, setPublishForm] = useState({
    propertyId: 0,
    fundingGoal: 0,
    minimumInvestment: 0,
    maximumInvestors: 0,
    expectedReturnRate: 0,
  });

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const packagesQuery = useQuery({
    ...trpc.getInvestmentPackages.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
  });

  const propertiesQuery = useQuery({
    ...trpc.getProperties.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isManager,
  });

  const proposalsQuery = useQuery({
    ...trpc.getPendingInvestmentProposals.queryOptions({
      authToken: authToken ?? "",
    }),
    enabled: !!authToken && isManager,
  });

  const pendingPaymentsQuery = useQuery({
    ...trpc.getPendingPayments.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isManager,
  });

  const pendingPayments = (pendingPaymentsQuery.data ?? []) as any[];

  const packages = (packagesQuery.data as any)?.packages ?? packagesQuery.data ?? [];
  const packagesArr = Array.isArray(packages) ? packages : [];

  const properties =
    (propertiesQuery.data as any)?.properties ?? propertiesQuery.data ?? [];
  const propertiesArr = Array.isArray(properties) ? properties : [];

  const proposals =
    (proposalsQuery.data as any)?.proposals ?? proposalsQuery.data ?? [];
  const proposalsArr = Array.isArray(proposals) ? proposals : [];

  const handlePublish = async () => {
    try {
      await (trpcClient as any).publishPropertyForFunding.mutate({
        authToken: authToken ?? "",
        propertyId: publishForm.propertyId,
        fundingGoal: publishForm.fundingGoal,
        minimumInvestment: publishForm.minimumInvestment,
        maximumInvestors: publishForm.maximumInvestors,
        expectedReturnRate: publishForm.expectedReturnRate,
      });
      toast.success("Property published for funding");
      queryClient.invalidateQueries({
        queryKey: trpc.getInvestmentPackages.queryKey(),
      });
      setShowPublishForm(false);
      setPublishForm({
        propertyId: 0,
        fundingGoal: 0,
        minimumInvestment: 0,
        maximumInvestors: 0,
        expectedReturnRate: 0,
      });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to publish");
    }
  };

  const handleReviewProposal = async (
    proposalId: number,
    action: "approve" | "reject",
  ) => {
    try {
      await (trpcClient as any).reviewInvestmentProposal.mutate({
        authToken: authToken ?? "",
        contributionId: proposalId,
        action: action === "approve" ? "APPROVE" : "REJECT",
      });
      toast.success("Proposal " + action + "d");
      setSelectedProposal(null);
      queryClient.invalidateQueries({
        queryKey: trpc.getPendingInvestmentProposals.queryKey(),
      });
    } catch (e: any) {
      toast.error(e.message ?? "Failed to " + action + " proposal");
    }
  };

  if (!user || !authToken) return null;

  if (packagesQuery.isLoading) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold-500 border-r-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Target className="text-gold-600" size={32} />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Funding Campaigns
              </h1>
              <p className="mt-1 text-gray-500">
                {isManager
                  ? "Manage property funding and investment proposals"
                  : "Browse active funding campaigns and invest in properties"}
              </p>
            </div>
          </div>
          {isManager && (
            <button
              onClick={() => setShowPublishForm(!showPublishForm)}
              className="inline-flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-navy-950 hover:bg-gold-400 transition"
            >
              <Send size={16} /> Publish for Funding
            </button>
          )}
        </div>

        {/* Manager Tabs */}
        {isManager && (
          <div className="mb-6 flex gap-1 rounded-lg bg-navy-900 p-1">
            {(["campaigns", "proposals", "payments"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={"flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition " + (tab === t ? "bg-gold-500 text-navy-950" : "text-gray-500 hover:text-gold-600")}
              >
                {t === "campaigns" ? (
                  <DollarSign size={16} />
                ) : t === "proposals" ? (
                  <Users size={16} />
                ) : (
                  <CreditCard size={16} />
                )}
                {t === "campaigns"
                  ? "Campaigns"
                  : t === "proposals"
                    ? "Proposals (" + proposalsArr.length + ")"
                    : "Payments (" + pendingPayments.length + ")"}
              </button>
            ))}
          </div>
        )}

        {/* Manager Publish Form */}
        {isManager && showPublishForm && (
          <div className="mb-6 rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              Publish Property for Funding
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className="mb-1 block text-sm text-gray-500">
                  Property
                </label>
                <select
                  value={publishForm.propertyId}
                  onChange={(e) =>
                    setPublishForm({
                      ...publishForm,
                      propertyId: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-lg border border-navy-700 bg-navy-800 px-4 py-2 text-gray-900 focus:border-gold-500 focus:outline-none"
                >
                  <option value={0}>Select Property</option>
                  {propertiesArr.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.title ?? p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-500">
                  Funding Goal (R)
                </label>
                <input
                  type="number"
                  value={publishForm.fundingGoal || ""}
                  onChange={(e) =>
                    setPublishForm({
                      ...publishForm,
                      fundingGoal: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-lg border border-navy-700 bg-navy-800 px-4 py-2 text-gray-900 focus:border-gold-500 focus:outline-none"
                  placeholder="e.g. 5000000"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-500">
                  Min Investment (R)
                </label>
                <input
                  type="number"
                  value={publishForm.minimumInvestment || ""}
                  onChange={(e) =>
                    setPublishForm({
                      ...publishForm,
                      minimumInvestment: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-lg border border-navy-700 bg-navy-800 px-4 py-2 text-gray-900 focus:border-gold-500 focus:outline-none"
                  placeholder="e.g. 10000"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-500">
                  Max Investors
                </label>
                <input
                  type="number"
                  value={publishForm.maximumInvestors || ""}
                  onChange={(e) =>
                    setPublishForm({
                      ...publishForm,
                      maximumInvestors: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-lg border border-navy-700 bg-navy-800 px-4 py-2 text-gray-900 focus:border-gold-500 focus:outline-none"
                  placeholder="e.g. 50"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-500">
                  Expected Return (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={publishForm.expectedReturnRate || ""}
                  onChange={(e) =>
                    setPublishForm({
                      ...publishForm,
                      expectedReturnRate: Number(e.target.value),
                    })
                  }
                  className="w-full rounded-lg border border-navy-700 bg-navy-800 px-4 py-2 text-gray-900 focus:border-gold-500 focus:outline-none"
                  placeholder="e.g. 12.5"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setShowPublishForm(false)}
                className="rounded-lg border border-navy-700 px-4 py-2 text-gray-500 hover:text-gray-900 transition"
              >
                Cancel
              </button>
              <button
                onClick={handlePublish}
                className="rounded-lg bg-gold-500 px-6 py-2 font-semibold text-navy-950 hover:bg-gold-400 transition"
              >
                Publish
              </button>
            </div>
          </div>
        )}

        {/* Campaigns Grid - visible to ALL users */}
        {tab === "campaigns" && (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {packagesArr.length > 0 ? (
              packagesArr.map((pkg: any, i: number) => {
                const raised = Number(
                  pkg.currentFunding ?? pkg.fundingRaised ?? pkg.investmentMetrics?.totalRaised ?? pkg.raised ?? pkg.totalRaised ?? 0,
                );
                const goal = Number(pkg.investmentMetrics?.fundingGoal || pkg.fundingGoal || 0);
                const pct = goal > 0 ? Math.min((raised / goal) * 100, 100) : 0;
                const minInvestment = Number(
                  pkg.minimumInvestment ?? pkg.minInvestment ?? 0,
                );
                const expectedReturn = Number(
                  pkg.expectedReturnRate ??
                    pkg.expectedReturn ??
                    pkg.expectedROI ??
                    0,
                );
                const propertyId = pkg.propertyId ?? pkg.id;

                return (
                  <div
                    key={pkg.id ?? i}
                    className="group overflow-hidden rounded-xl border border-navy-800/50 bg-navy-900/50 transition-all hover:border-gold-300"
                  >
                    {/* Property Image */}
                    <div className="relative h-40 overflow-hidden bg-navy-800/50">
                      {pkg.imageUrl ?? pkg.image ? (
                        <img
                          src={pkg.imageUrl ?? pkg.image}
                          alt={
                            pkg.propertyTitle ??
                            pkg.title ??
                            pkg.name ??
                            "Property"
                          }
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Building className="text-gray-600" size={48} />
                        </div>
                      )}
                      <span
                        className={
                          "absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-medium " +
                          (pct >= 100
                            ? "bg-emerald-500/20 text-emerald-600"
                            : "bg-gold-500/20 text-gold-600")
                        }
                      >
                        {pct >= 100 ? "Fully Funded" : "Raising Funds"}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="p-5">
                      <h3 className="mb-1 truncate text-lg font-semibold text-gray-900">
                        {pkg.propertyTitle ??
                          pkg.title ??
                          pkg.name ??
                          "Campaign #" + (i + 1)}
                      </h3>
                      <p className="mb-3 text-sm text-gray-500">
                        {pkg.location ?? pkg.city ?? pkg.address ?? "South Africa"}
                      </p>

                      {/* Progress Bar */}
                      <div className="mb-4">
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="text-gray-500">Funding Progress</span>
                          <span className="font-medium text-gold-600">
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-navy-800/50">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-400 transition-all"
                            style={{ width: pct + "%" }}
                          />
                        </div>
                        <div className="mt-1 flex justify-between text-xs text-gray-500">
                          <span>R{raised.toLocaleString()} raised</span>
                          <span>R{goal.toLocaleString()} goal</span>
                        </div>
                      </div>

                      {/* Details */}
                      <div className="mb-4 grid grid-cols-2 gap-3">
                        <div className="rounded-lg bg-navy-800/30 p-2.5">
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <DollarSign size={12} />
                            Min. Investment
                          </div>
                          <p className="mt-0.5 text-sm font-medium text-gray-900">
                            R{minInvestment.toLocaleString()}
                          </p>
                        </div>
                        <div className="rounded-lg bg-navy-800/30 p-2.5">
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <TrendingUp size={12} />
                            Expected Return
                          </div>
                          <p className="mt-0.5 text-sm font-medium text-emerald-600">
                            {expectedReturn.toFixed(1)}%
                          </p>
                        </div>
                        <div className="rounded-lg bg-navy-800/30 p-2.5">
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <Users size={12} />
                            Investors
                          </div>
                          <p className="mt-0.5 text-sm font-medium text-gray-900">
                            {pkg.investorCount ?? pkg.investors ?? 0}
                          </p>
                        </div>
                        <div className="rounded-lg bg-navy-800/30 p-2.5">
                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <Target size={12} />
                            Status
                          </div>
                          <p className="mt-0.5 text-sm font-medium text-gold-600">
                            {pkg.investmentStatus ?? (pct >= 100 ? "Funded" : "Active")}
                          </p>
                        </div>
                      </div>

                      {/* CTA */}
                      {!isManager && pct < 100 && (
                        <Link
                          to={("/investments/opportunities/" + propertyId) as any}
                          className="block w-full rounded-lg bg-gold-500 py-2.5 text-center text-sm font-semibold text-navy-950 transition-colors hover:bg-gold-400"
                        >
                          Invest Now
                        </Link>
                      )}
                      {!isManager && pct >= 100 && (
                        <div className="w-full rounded-lg bg-emerald-50 py-2.5 text-center text-sm font-medium text-emerald-600">
                          Fully Funded
                        </div>
                      )}
                      {isManager && (
                        <Link
                          to={("/properties/" + propertyId) as any}
                          className="flex w-full items-center justify-center gap-2 rounded-lg border border-navy-700 py-2.5 text-sm font-medium text-gray-600 transition hover:border-gold-500/50 hover:text-gray-900"
                        >
                          Manage <ArrowRight size={14} />
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-full rounded-xl border border-navy-800/50 bg-navy-900/50 py-12 text-center">
                <Target className="mx-auto mb-3 text-gray-600" size={40} />
                <p className="text-gray-500">No active funding campaigns</p>
                <p className="mt-1 text-sm text-gray-500">
                  Check back soon for new investment opportunities
                </p>
              </div>
            )}
          </div>
        )}

        {/* Manager: Proposals Tab */}
        {isManager && tab === "proposals" && (
          <div className="space-y-4">
            {proposalsArr.length > 0 ? (
              proposalsArr.map((p: any, i: number) => (
                <div
                  key={p.id ?? i}
                  onClick={() => setSelectedProposal(p)}
                  className="cursor-pointer rounded-xl border border-navy-800/50 bg-navy-900/50 p-5 transition hover:border-gold-500/50 hover:shadow-lg hover:shadow-gold-500/5"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <Users size={18} className="text-blue-600" />
                        <h3 className="font-semibold text-gray-900">
                          {p.investor?.name ?? "Investor #" + p.investorId}
                        </h3>
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                          {p.status ?? "PENDING"}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Building size={14} />
                          {p.property?.title ?? "N/A"}
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign size={14} />
                          <span className="font-medium text-gold-600">
                            R{Number(p.contributionAmount ?? 0).toLocaleString()}
                          </span>
                        </span>
                        {p.expectedReturnRate != null && (
                          <span className="flex items-center gap-1">
                            <TrendingUp size={14} />
                            {p.expectedReturnRate}% return
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar size={14} />
                          {new Date(
                            p.contributionDate ?? p.createdAt,
                          ).toLocaleDateString("en-ZA")}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedProposal(p);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-500/10 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-500/20 transition"
                      >
                        <Eye size={14} /> View
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReviewProposal(p.id, "approve");
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/20 px-3 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-500/30 transition"
                      >
                        <CheckCircle size={14} /> Approve
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReviewProposal(p.id, "reject");
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-red-500/20 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-500/30 transition"
                      >
                        <XCircle size={14} /> Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 py-12 text-center">
                <Users className="mx-auto mb-3 text-gray-600" size={40} />
                <p className="text-gray-500">No pending proposals</p>
              </div>
            )}
          </div>
        )}

        {/* Proposal Detail Modal */}
        {selectedProposal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSelectedProposal(null)}>
            <div
              className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4 rounded-t-2xl">
                <h2 className="text-lg font-bold text-gray-900">
                  Investment Proposal Details
                </h2>
                <button
                  onClick={() => setSelectedProposal(null)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-6 p-6">
                {/* Investor Information */}
                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
                    <Users size={16} /> Investor Information
                  </h3>
                  <div className="rounded-xl border bg-gray-50 p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-700">
                        {(selectedProposal.investor?.name ?? "?").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-gray-900">
                          {selectedProposal.investor?.name ?? "Unknown Investor"}
                        </p>
                        <p className="flex items-center gap-1 text-sm text-gray-500">
                          <Mail size={13} />
                          {selectedProposal.investor?.email ?? "N/A"}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                      <div>
                        <p className="text-xs text-gray-400">Investor ID</p>
                        <p className="text-sm font-medium text-gray-700">
                          #{selectedProposal.investor?.id ?? selectedProposal.investorId}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Proposal Status</p>
                        <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                          {selectedProposal.status ?? "PENDING"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Proposal Details */}
                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
                    <FileText size={16} /> Proposal Details
                  </h3>
                  <div className="rounded-xl border bg-gray-50 p-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-gray-400">Contribution Amount</p>
                        <p className="text-xl font-bold text-gold-600">
                          R{Number(selectedProposal.contributionAmount ?? 0).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Expected Return Rate</p>
                        <p className="text-xl font-bold text-emerald-600">
                          {selectedProposal.expectedReturnRate != null
                            ? selectedProposal.expectedReturnRate + "%"
                            : "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Expected Return Amount</p>
                        <p className="text-lg font-semibold text-gray-800">
                          {selectedProposal.expectedReturnAmount != null
                            ? "R" + Number(selectedProposal.expectedReturnAmount).toLocaleString()
                            : "N/A"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Contribution Date</p>
                        <p className="flex items-center gap-1 text-sm font-medium text-gray-700">
                          <Calendar size={14} />
                          {new Date(
                            selectedProposal.contributionDate ?? selectedProposal.createdAt,
                          ).toLocaleDateString("en-ZA", {
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                    {selectedProposal.notes && (
                      <div className="mt-4 border-t pt-3">
                        <p className="text-xs text-gray-400">Notes</p>
                        <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
                          {selectedProposal.notes}
                        </p>
                      </div>
                    )}
                    <div className="mt-4 grid grid-cols-2 gap-4 border-t pt-3 text-xs text-gray-400">
                      <div className="flex items-center gap-1">
                        <Clock size={12} />
                        Created: {new Date(selectedProposal.createdAt).toLocaleString("en-ZA")}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock size={12} />
                        Updated: {new Date(selectedProposal.updatedAt).toLocaleString("en-ZA")}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Property Information */}
                <div>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-gray-500">
                    <Building size={16} /> Property Information
                  </h3>
                  <div className="rounded-xl border bg-gray-50 p-4">
                    <div className="flex gap-4">
                      {selectedProposal.property?.imageUrl && (
                        <img
                          src={selectedProposal.property.imageUrl}
                          alt={selectedProposal.property.title}
                          className="h-20 w-28 rounded-lg object-cover"
                        />
                      )}
                      <div className="flex-1 space-y-2">
                        <p className="font-semibold text-gray-900">
                          {selectedProposal.property?.title ?? "N/A"}
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-xs text-gray-400">Funding Goal</p>
                            <p className="text-sm font-medium text-gray-700">
                              R{Number(selectedProposal.property?.fundingGoal ?? 0).toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400">Funding Raised</p>
                            <p className="text-sm font-medium text-emerald-600">
                              R{Number(selectedProposal.property?.fundingRaised ?? 0).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        {(selectedProposal.property?.fundingGoal ?? 0) > 0 && (
                          <div>
                            <div className="flex justify-between text-xs text-gray-400 mb-1">
                              <span>Progress</span>
                              <span>
                                {Math.round(
                                  ((selectedProposal.property?.fundingRaised ?? 0) /
                                    (selectedProposal.property?.fundingGoal ?? 1)) *
                                    100,
                                )}%
                              </span>
                            </div>
                            <div className="h-2 w-full rounded-full bg-gray-200">
                              <div
                                className="h-2 rounded-full bg-emerald-500 transition-all"
                                style={{
                                  width: `${Math.min(
                                    100,
                                    ((selectedProposal.property?.fundingRaised ?? 0) /
                                      (selectedProposal.property?.fundingGoal ?? 1)) *
                                      100,
                                  )}%`,
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer Actions */}
              <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t bg-gray-50 px-6 py-4 rounded-b-2xl">
                <button
                  onClick={() => setSelectedProposal(null)}
                  className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 transition"
                >
                  Close
                </button>
                <button
                  onClick={() => handleReviewProposal(selectedProposal.id, "reject")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition"
                >
                  <XCircle size={16} /> Reject Proposal
                </button>
                <button
                  onClick={() => handleReviewProposal(selectedProposal.id, "approve")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition"
                >
                  <CheckCircle size={16} /> Approve Proposal
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Manager: Payments Tab */}
        {isManager && tab === "payments" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-5">
              <h3 className="mb-1 text-lg font-semibold text-gray-900">
                Proof of Payment Review
              </h3>
              <p className="text-sm text-gray-500">
                Review and confirm investor payment submissions. Once approved, funding raised will be updated automatically.
              </p>
            </div>

            {pendingPayments.length > 0 ? (
              pendingPayments.map((p: any) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                          {(p.investor?.name ?? "?").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="font-semibold text-gray-900">
                            {p.investor?.name ?? "Investor"}
                          </h3>
                          <p className="text-sm text-gray-500">
                            {p.investor?.email ?? ""}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div>
                          <p className="text-xs text-gray-400">Property</p>
                          <p className="text-sm font-medium text-gray-800">
                            {p.property?.title ?? "N/A"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Amount</p>
                          <p className="text-lg font-bold text-gold-600">
                            R{Number(p.contributionAmount ?? 0).toLocaleString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Payment Ref</p>
                          <p className="text-sm font-medium text-gray-800">
                            {p.paymentReference ?? "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Submitted</p>
                          <p className="text-sm text-gray-700">
                            {p.paymentSubmittedAt
                              ? new Date(p.paymentSubmittedAt).toLocaleDateString("en-ZA", {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </p>
                        </div>
                      </div>

                      {/* Funding Progress */}
                      {(p.property?.fundingGoal ?? 0) > 0 && (
                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span>Current Funding</span>
                            <span>
                              R{Number(p.property?.fundingRaised ?? 0).toLocaleString()} / R{Number(p.property?.fundingGoal ?? 0).toLocaleString()} ({Math.round(((p.property?.fundingRaised ?? 0) / (p.property?.fundingGoal ?? 1)) * 100)}%)
                            </span>
                          </div>
                          <div className="h-2 w-full rounded-full bg-gray-200">
                            <div
                              className="h-2 rounded-full bg-emerald-500 transition-all"
                              style={{
                                width: `${Math.min(100, ((p.property?.fundingRaised ?? 0) / (p.property?.fundingGoal ?? 1)) * 100)}%`,
                              }}
                            />
                          </div>
                          <p className="mt-1 text-xs text-gray-400">
                            After approval: R{Number((p.property?.fundingRaised ?? 0) + (p.contributionAmount ?? 0)).toLocaleString()} ({Math.round((((p.property?.fundingRaised ?? 0) + (p.contributionAmount ?? 0)) / (p.property?.fundingGoal ?? 1)) * 100)}%)
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      {p.proofOfPaymentUrl && (
                        <a
                          href={p.proofOfPaymentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-100 transition"
                        >
                          <ExternalLink size={14} /> View POP
                        </a>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setReviewingPayment(p);
                            setReviewNotes("");
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/20 px-3 py-2 text-sm font-medium text-emerald-600 hover:bg-emerald-500/30 transition"
                        >
                          <CheckCircle size={14} /> Approve
                        </button>
                        <button
                          onClick={() => {
                            setReviewingPayment({ ...p, _rejectMode: true });
                            setReviewNotes("");
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-red-500/20 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-500/30 transition"
                        >
                          <XCircle size={14} /> Reject
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 py-12 text-center">
                <CreditCard className="mx-auto mb-3 text-gray-600" size={40} />
                <p className="text-gray-500">No pending payment reviews</p>
                <p className="mt-1 text-xs text-gray-400">
                  Investor proof-of-payment submissions will appear here
                </p>
              </div>
            )}
          </div>
        )}

        {/* POP Review Confirmation Modal */}
        {reviewingPayment && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setReviewingPayment(null)}>
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
              <div className="p-6 space-y-4">
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

                {reviewingPayment._rejectMode && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                      Rejection Reason
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

                {!reviewingPayment._rejectMode && (
                  <p className="text-sm text-gray-600">
                    By approving this payment, the property's funding raised will be
                    incremented by{" "}
                    <span className="font-bold text-gold-600">
                      R{Number(reviewingPayment.contributionAmount ?? 0).toLocaleString()}
                    </span>
                    . This action cannot be undone.
                  </p>
                )}
              </div>
              <div className="flex items-center justify-end gap-3 border-t px-6 py-4">
                <button
                  onClick={() => setReviewingPayment(null)}
                  className="rounded-lg border px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const action = reviewingPayment._rejectMode ? "REJECT" : "APPROVE";
                    try {
                      setReviewSubmitting(true);
                      await (trpcClient as any).reviewProofOfPayment.mutate({
                        authToken: authToken ?? "",
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
                      queryClient.invalidateQueries({
                        queryKey: trpc.getPendingPayments.queryKey(),
                      });
                      queryClient.invalidateQueries({
                        queryKey: trpc.getPendingInvestmentProposals.queryKey(),
                      });
                    } catch (e: any) {
                      toast.error(e.message ?? "Failed to review payment");
                    } finally {
                      setReviewSubmitting(false);
                    }
                  }}
                  disabled={reviewSubmitting || (reviewingPayment._rejectMode && !reviewNotes.trim())}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50 ${
                    reviewingPayment._rejectMode
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-emerald-600 hover:bg-emerald-700"
                  }`}
                >
                  {reviewSubmitting ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : reviewingPayment._rejectMode ? (
                    <XCircle size={16} />
                  ) : (
                    <CheckCircle size={16} />
                  )}
                  {reviewingPayment._rejectMode ? "Reject Payment" : "Approve & Update Funding"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
