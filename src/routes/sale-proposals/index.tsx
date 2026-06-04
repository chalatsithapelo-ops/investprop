import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import {
  Home,
  Clock,
  CheckCircle2,
  XCircle,
  Eye,
  AlertTriangle,
  DollarSign,
  MapPin,
  Building2,
  Loader2,
  User,
  Phone,
  Mail,
  Ban,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import { downloadLOI as downloadLOIPdf, downloadOTP as downloadOTPPdf } from "~/utils/generate-investor-pdf";

export const Route = createFileRoute("/sale-proposals/")({
  component: SaleProposalsPage,
});

/* ─── Status config ─── */
const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  PENDING: { label: "Pending", color: "bg-amber-100 text-amber-700", icon: Clock },
  UNDER_REVIEW: { label: "Under Review", color: "bg-blue-100 text-blue-700", icon: Eye },
  ACCEPTED: { label: "Accepted", color: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 },
  REJECTED: { label: "Declined", color: "bg-red-100 text-red-700", icon: XCircle },
  WITHDRAWN: { label: "Withdrawn", color: "bg-gray-100 text-gray-600", icon: Ban },
};

const URGENCY_CONFIG: Record<string, { label: string; color: string }> = {
  URGENT: { label: "🚨 URGENT", color: "bg-red-100 text-red-700 border-red-200" },
  HIGH: { label: "⚡ HIGH", color: "bg-orange-100 text-orange-700 border-orange-200" },
  STANDARD: { label: "Standard", color: "bg-gray-100 text-gray-600 border-gray-200" },
};

function SaleProposalsPage() {
  const navigate = useNavigate();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [counterOfferFor, setCounterOfferFor] = useState<any>(null);
  const [counterAmount, setCounterAmount] = useState("");
  const [counterTerms, setCounterTerms] = useState("");

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
    if (user && !["DEVELOPMENT_MANAGER", "PROJECT_MANAGER"].includes(user.role)) {
      navigate({ to: "/dashboard" });
    }
  }, [user, authToken, hasHydrated]);

  const proposalsQuery = useQuery({
    ...trpc.getSaleProposals.queryOptions({
      authToken: authToken ?? "",
      ...(statusFilter !== "all" ? { status: statusFilter as any } : {}),
    }),
    enabled: !!authToken,
  });

  const reviewMutation = useMutation({
    mutationFn: (params: {
      proposalId: number;
      action: "UNDER_REVIEW" | "ACCEPTED" | "REJECTED";
      reviewNotes?: string;
    }) =>
      trpcClient.reviewSaleProposal.mutate({
        authToken: authToken ?? "",
        ...params,
      }),
    onSuccess: (_, vars) => {
      toast.success(
        vars.action === "ACCEPTED"
          ? "Proposal accepted!"
          : vars.action === "UNDER_REVIEW"
            ? "Marked as under review"
            : "Proposal declined"
      );
      queryClient.invalidateQueries({ queryKey: trpc.getSaleProposals.queryKey() });
    },
    onError: (err: any) => toast.error(err.message ?? "Action failed"),
  });

  const counterOfferMutation = useMutation({
    mutationFn: (params: { proposalId: number; counterOfferAmount: number; counterOfferTerms: string }) =>
      (trpcClient as any).counterOfferSaleProposal.mutate({
        authToken: authToken ?? "",
        ...params,
      }),
    onSuccess: () => {
      toast.success("Counter-offer sent to owner");
      setCounterOfferFor(null);
      setCounterAmount("");
      setCounterTerms("");
      queryClient.invalidateQueries({ queryKey: trpc.getSaleProposals.queryKey() });
    },
    onError: (err: any) => toast.error(err.message ?? "Counter-offer failed"),
  });

  const downloadLOI = async (proposalId: number) => {
    try {
      const loi = await (trpcClient as any).generateLetterOfIntent.query({
        authToken: authToken ?? "",
        proposalId,
      });
      downloadLOIPdf({
        proposalId,
        propertyAddress: loi.propertyAddress,
        sellerName: loi.to,
        sellerEmail: loi.ownerEmail,
        offerAmount: Number(loi.offerAmount) || 0,
        engagementType:
          loi.engagementType === "JOINT_VENTURE"
            ? "JOINT_VENTURE"
            : loi.engagementType === "SECTIONAL_SALE"
              ? "SECTIONAL_SALE"
              : "OUTRIGHT_PURCHASE",
        counterOfferAmount: loi.counterOfferAmount ? Number(loi.counterOfferAmount) : null,
        counterOfferTerms: loi.counterOfferTerms ?? null,
        managerName: loi.managerName,
        signedDate: loi.date ? new Date(loi.date) : new Date(),
      });
    } catch (err: any) {
      toast.error(err.message ?? "Could not generate LOI");
    }
  };

  const downloadOTP = async (proposal: any) => {
    try {
      const loi = await (trpcClient as any).generateLetterOfIntent.query({
        authToken: authToken ?? "",
        proposalId: proposal.id,
      });
      const purchasePrice =
        Number(proposal.counterOfferAmount) ||
        Number(loi.counterOfferAmount) ||
        Number(loi.offerAmount) ||
        Number(proposal.askingPrice) ||
        0;
      downloadOTPPdf({
        proposalId: proposal.id,
        propertyTitle: proposal.propertyTitle ?? loi.propertyAddress ?? "Property",
        propertyAddress: loi.propertyAddress ?? proposal.propertyAddress ?? "",
        sellerName: loi.to ?? proposal.ownerName ?? "Seller",
        sellerEmail: loi.ownerEmail ?? proposal.ownerEmail ?? "",
        sellerIdNumber: proposal.ownerIdNumber,
        purchasePrice,
        depositAmount: Math.round(purchasePrice * 0.1),
        managerName: loi.managerName,
        signedDate: new Date(),
      });
      toast.success("OTP downloaded");
    } catch (err: any) {
      toast.error(err.message ?? "Could not generate OTP");
    }
  };

  const data = proposalsQuery.data as any;
  const proposals = data?.proposals ?? [];
  const statusCounts = data?.statusCounts ?? {};

  const totalPending = (statusCounts.PENDING ?? 0) + (statusCounts.UNDER_REVIEW ?? 0);

  if (!user || !authToken) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Owner Sale Proposals</h1>
          <p className="mt-1 text-gray-500">
            Review property sale submissions from property owners — distressed, investment, and standard sales
          </p>
        </div>

        {/* Stats bar */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(
            [
              { key: "all", label: "All", count: proposals.length },
              { key: "PENDING", label: "Pending", count: statusCounts.PENDING ?? 0 },
              { key: "UNDER_REVIEW", label: "Under Review", count: statusCounts.UNDER_REVIEW ?? 0 },
              { key: "ACCEPTED", label: "Accepted", count: statusCounts.ACCEPTED ?? 0 },
              { key: "REJECTED", label: "Declined", count: statusCounts.REJECTED ?? 0 },
            ] as const
          ).map((s) => (
            <button
              key={s.key}
              onClick={() => setStatusFilter(s.key)}
              className={`rounded-lg border px-3 py-2 text-center transition ${
                statusFilter === s.key
                  ? "border-gold-500 bg-gold-50 text-gold-700"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              <span className="block text-lg font-bold">{s.count}</span>
              <span className="text-xs">{s.label}</span>
            </button>
          ))}
        </div>

        {/* Proposals */}
        {proposalsQuery.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-gold-500" />
          </div>
        ) : proposals.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white py-16 text-center shadow-sm">
            <FileText className="mx-auto mb-3 text-gray-300" size={48} />
            <h3 className="text-lg font-medium text-gray-700">No proposals found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {statusFilter !== "all"
                ? "No proposals with this status"
                : "No sale proposals have been submitted yet"}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {proposals.map((proposal: any) => {
              const cfg = (STATUS_CONFIG[proposal.status] ?? STATUS_CONFIG.PENDING)!;
              const urgCfg = (URGENCY_CONFIG[proposal.urgencyLevel] ?? URGENCY_CONFIG.STANDARD)!;
              const StatusIcon = cfg.icon;
              const isExpanded = expandedId === proposal.id;

              return (
                <div
                  key={proposal.id}
                  className={`rounded-xl border bg-white shadow-sm transition ${
                    proposal.urgencyLevel === "URGENT"
                      ? "border-red-200"
                      : proposal.urgencyLevel === "HIGH"
                        ? "border-orange-200"
                        : "border-gray-200"
                  }`}
                >
                  {/* Header row */}
                  <div
                    className="flex cursor-pointer items-center gap-4 p-5"
                    onClick={() => setExpandedId(isExpanded ? null : proposal.id)}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold text-gray-900">
                          {proposal.title}
                        </h3>
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${urgCfg.color}`}
                        >
                          {urgCfg.label}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cfg.color}`}
                        >
                          <StatusIcon size={10} />
                          {cfg.label}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <MapPin size={13} /> {proposal.city}
                        </span>
                        <span className="flex items-center gap-1">
                          <Building2 size={13} /> {proposal.propertyType}
                        </span>
                        <span className="flex items-center gap-1">
                          <DollarSign size={13} /> R{Number(proposal.askingPrice).toLocaleString()}
                        </span>
                        <span className="font-medium text-gold-600">
                          {proposal.saleType} Sale
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right text-xs text-gray-400">
                        <User size={12} className="mb-0.5 inline" />{" "}
                        {proposal.owner?.name ?? "Unknown"}
                        <br />
                        {new Date(proposal.createdAt).toLocaleDateString("en-ZA")}
                      </div>
                      {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 px-5 pb-5 pt-4">
                      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                        {/* Details */}
                        <div className="lg:col-span-2 space-y-4">
                          <div>
                            <h4 className="text-xs font-semibold uppercase text-gray-400">
                              Description
                            </h4>
                            <p className="mt-1 text-sm text-gray-700">{proposal.description}</p>
                          </div>
                          {proposal.reason && (
                            <div>
                              <h4 className="text-xs font-semibold uppercase text-gray-400">
                                Reason for Selling
                              </h4>
                              <p className="mt-1 text-sm text-gray-700">{proposal.reason}</p>
                            </div>
                          )}
                          <div>
                            <h4 className="text-xs font-semibold uppercase text-gray-400">
                              Address
                            </h4>
                            <p className="mt-1 text-sm text-gray-700">
                              {proposal.address}, {proposal.city}, {proposal.province}
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {proposal.bedrooms != null && (
                              <div className="rounded-lg bg-gray-50 p-2.5 text-center">
                                <span className="text-lg font-bold text-gray-800">
                                  {proposal.bedrooms}
                                </span>
                                <p className="text-[10px] text-gray-400">Bedrooms</p>
                              </div>
                            )}
                            {proposal.bathrooms != null && (
                              <div className="rounded-lg bg-gray-50 p-2.5 text-center">
                                <span className="text-lg font-bold text-gray-800">
                                  {proposal.bathrooms}
                                </span>
                                <p className="text-[10px] text-gray-400">Bathrooms</p>
                              </div>
                            )}
                            {proposal.squareMeters != null && (
                              <div className="rounded-lg bg-gray-50 p-2.5 text-center">
                                <span className="text-lg font-bold text-gray-800">
                                  {proposal.squareMeters}
                                </span>
                                <p className="text-[10px] text-gray-400">m² Floor</p>
                              </div>
                            )}
                            {proposal.erfSize != null && (
                              <div className="rounded-lg bg-gray-50 p-2.5 text-center">
                                <span className="text-lg font-bold text-gray-800">
                                  {Number(proposal.erfSize).toLocaleString()}
                                </span>
                                <p className="text-[10px] text-gray-400">m² Erf</p>
                              </div>
                            )}
                          </div>

                          {/* Phase 8 disclosures block */}
                          <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
                            <h4 className="text-xs font-semibold uppercase text-amber-700">
                              Deal-Critical Disclosures
                            </h4>
                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                              <Disclosure label="Engagement" value={proposal.engagementType} />
                              <Disclosure label="Title Deed" value={proposal.titleDeedNumber} />
                              <Disclosure label="Erf Number" value={proposal.erfNumber} />
                              <Disclosure label="Bond" value={proposal.bondStatus} />
                              {proposal.bondBank && (
                                <Disclosure label="Bondholder" value={proposal.bondBank} />
                              )}
                              {proposal.bondOutstanding != null && (
                                <Disclosure
                                  label="Bond Outstanding"
                                  value={`R${Number(proposal.bondOutstanding).toLocaleString()}`}
                                />
                              )}
                              <Disclosure label="Rates" value={proposal.ratesStatus} />
                              {proposal.ratesArrears != null && (
                                <Disclosure
                                  label="Rates Arrears"
                                  value={`R${Number(proposal.ratesArrears).toLocaleString()}`}
                                />
                              )}
                              <Disclosure label="Tenancy" value={proposal.tenancyStatus} />
                              <Disclosure label="Condition" value={proposal.propertyCondition} />
                              {proposal.schemeName && (
                                <Disclosure label="Scheme" value={proposal.schemeName} />
                              )}
                              {proposal.monthlyLevy != null && (
                                <Disclosure
                                  label="Monthly Levy"
                                  value={`R${Number(proposal.monthlyLevy).toLocaleString()}`}
                                />
                              )}
                              <Disclosure label="Electrical CoC" value={proposal.electricalCoC} />
                              <Disclosure label="Gas CoC" value={proposal.gasCoC} />
                              <Disclosure label="Beetle" value={proposal.beetleCert} />
                              <Disclosure label="Plumbing CoC" value={proposal.plumbingCoC} />
                            </div>
                            {proposal.counterOfferAmount != null && (
                              <div className="mt-3 rounded border border-blue-300 bg-blue-50 p-2 text-xs text-blue-800">
                                <strong>Counter-offer sent:</strong> R{Number(proposal.counterOfferAmount).toLocaleString()}
                                {proposal.counterOfferTerms && (
                                  <p className="mt-1">{proposal.counterOfferTerms}</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Sidebar */}
                        <div className="space-y-4">
                          {/* Price card */}
                          <div className="rounded-lg bg-gray-50 p-4">
                            <h4 className="text-xs font-semibold uppercase text-gray-400">
                              Pricing
                            </h4>
                            <p className="mt-2 text-2xl font-bold text-gray-900">
                              R{Number(proposal.askingPrice).toLocaleString()}
                            </p>
                            {proposal.marketValue && (
                              <p className="text-sm text-gray-500">
                                Market Value: R{Number(proposal.marketValue).toLocaleString()}
                                {proposal.askingPrice < proposal.marketValue && (
                                  <span className="ml-1 font-medium text-emerald-600">
                                    ({Math.round(
                                      ((proposal.marketValue - proposal.askingPrice) /
                                        proposal.marketValue) *
                                        100
                                    )}
                                    % below market)
                                  </span>
                                )}
                              </p>
                            )}
                          </div>

                          {/* Contact */}
                          <div className="rounded-lg bg-gray-50 p-4">
                            <h4 className="mb-2 text-xs font-semibold uppercase text-gray-400">
                              Owner Contact
                            </h4>
                            <p className="flex items-center gap-2 text-sm text-gray-700">
                              <User size={14} /> {proposal.owner?.name}
                            </p>
                            {proposal.contactEmail && (
                              <p className="mt-1 flex items-center gap-2 text-sm text-gray-700">
                                <Mail size={14} /> {proposal.contactEmail}
                              </p>
                            )}
                            {proposal.contactPhone && (
                              <p className="mt-1 flex items-center gap-2 text-sm text-gray-700">
                                <Phone size={14} /> {proposal.contactPhone}
                              </p>
                            )}
                          </div>

                          {/* Actions */}
                          {(proposal.status === "PENDING" ||
                            proposal.status === "UNDER_REVIEW") && (
                            <div className="space-y-3">
                              <textarea
                                placeholder="Review notes (optional)"
                                value={reviewNotes[proposal.id] ?? ""}
                                onChange={(e) =>
                                  setReviewNotes((prev) => ({
                                    ...prev,
                                    [proposal.id]: e.target.value,
                                  }))
                                }
                                rows={2}
                                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm placeholder-gray-400 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20"
                              />
                              <div className="flex gap-2">
                                {proposal.status === "PENDING" && (
                                  <button
                                    onClick={() =>
                                      reviewMutation.mutate({
                                        proposalId: proposal.id,
                                        action: "UNDER_REVIEW",
                                        reviewNotes: reviewNotes[proposal.id] || undefined,
                                      })
                                    }
                                    disabled={reviewMutation.isPending}
                                    className="flex-1 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                                  >
                                    <Eye size={12} className="mr-1 inline" />
                                    Mark Reviewing
                                  </button>
                                )}
                                <button
                                  onClick={() =>
                                    reviewMutation.mutate({
                                      proposalId: proposal.id,
                                      action: "ACCEPTED",
                                      reviewNotes: reviewNotes[proposal.id] || undefined,
                                    })
                                  }
                                  disabled={reviewMutation.isPending}
                                  className="flex-1 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-600"
                                >
                                  <CheckCircle2 size={12} className="mr-1 inline" />
                                  Accept
                                </button>
                                <button
                                  onClick={() =>
                                    reviewMutation.mutate({
                                      proposalId: proposal.id,
                                      action: "REJECTED",
                                      reviewNotes: reviewNotes[proposal.id] || undefined,
                                    })
                                  }
                                  disabled={reviewMutation.isPending}
                                  className="flex-1 rounded-lg bg-red-500 px-3 py-2 text-xs font-semibold text-white hover:bg-red-600"
                                >
                                  <XCircle size={12} className="mr-1 inline" />
                                  Decline
                                </button>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    setCounterOfferFor(proposal);
                                    setCounterAmount(String(proposal.askingPrice));
                                    setCounterTerms("Cash offer subject to Investprop standard due diligence and FICA compliance.");
                                  }}
                                  className="flex-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                                >
                                  Counter-Offer
                                </button>
                                <button
                                  onClick={() => downloadLOI(proposal.id)}
                                  className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                                >
                                  <FileText size={12} className="mr-1 inline" />
                                  Draft LOI
                                </button>
                              </div>
                            </div>
                          )}

                          {/* OTP button (accepted proposals) */}
                          {proposal.status === "ACCEPTED" && (
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                              <p className="mb-2 text-xs font-medium text-emerald-900">
                                Proposal accepted — issue binding Offer to Purchase
                              </p>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => downloadOTP(proposal)}
                                  className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                                >
                                  <FileText size={12} className="mr-1 inline" />
                                  Download OTP (PDF)
                                </button>
                                <button
                                  onClick={() => downloadLOI(proposal.id)}
                                  className="flex-1 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                                >
                                  Re-download LOI
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Review info */}
                          {proposal.reviewedBy && (
                            <div className="rounded-lg border border-gray-100 p-3 text-xs text-gray-500">
                              Reviewed by {proposal.reviewedBy.name}
                              {proposal.reviewedAt && (
                                <> on {new Date(proposal.reviewedAt).toLocaleDateString("en-ZA")}</>
                              )}
                              {proposal.reviewNotes && (
                                <p className="mt-1 text-gray-600">{proposal.reviewNotes}</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Counter-Offer Modal */}
      {counterOfferFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">
              Counter-Offer for "{counterOfferFor.title}"
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              Owner asking R{Number(counterOfferFor.askingPrice).toLocaleString()}
              {counterOfferFor.marketValue && (
                <> — market R{Number(counterOfferFor.marketValue).toLocaleString()}</>
              )}
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700">Counter Amount (ZAR)</label>
                <input
                  type="number"
                  value={counterAmount}
                  onChange={(e) => setCounterAmount(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700">Terms / Conditions</label>
                <textarea
                  value={counterTerms}
                  onChange={(e) => setCounterTerms(e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setCounterOfferFor(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  counterOfferMutation.mutate({
                    proposalId: counterOfferFor.id,
                    counterOfferAmount: Number(counterAmount),
                    counterOfferTerms: counterTerms,
                  })
                }
                disabled={
                  counterOfferMutation.isPending ||
                  !counterAmount ||
                  counterTerms.length < 10
                }
                className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
              >
                {counterOfferMutation.isPending ? "Sending…" : "Send Counter-Offer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Disclosure({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === "") return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="font-medium text-gray-800">{String(value)}</p>
    </div>
  );
}
