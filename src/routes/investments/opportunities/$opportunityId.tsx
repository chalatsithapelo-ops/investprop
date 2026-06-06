import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Building,
  DollarSign,
  TrendingUp,
  ArrowLeft,
  Shield,
  Clock,
  AlertTriangle,
  FileText,
  Layers,
  CheckCircle,
  BarChart3,
  Wallet,
  PiggyBank,
  Home,
  PieChart,
  ShieldAlert,
  XCircle,
  Building2,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { AICopilotChat } from "~/components/AICopilotChat";
import { AIMatchBadge } from "~/components/AIMatchBadge";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import { calculateFlipMetrics, calculateRentalMetrics, calculateDevelopmentMetrics } from "~/financial-calculations";
import type { PropertyFlipInput, RentalPropertyInput, PropertyDevelopmentInput } from "~/financial-calculations";

export const Route = createFileRoute(
  "/investments/opportunities/$opportunityId",
)({
  component: OpportunityDetailPage,
});

function OpportunityDetailPage() {
  const { opportunityId } = Route.useParams();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [investmentAmount, setInvestmentAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [termsAccepted, setTermsAccepted] = useState({
    feeStructure: false,
    governanceRules: false,
    coolingOff: false,
    riskDisclosure: false,
    dataConsent: false,
  });
  const [expandedTerm, setExpandedTerm] = useState<string | null>(null);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const role = (user as any)?.role ?? "INVESTOR";
  const isInvestor = role === "INVESTOR";

  const propertyQuery = useQuery({
    ...trpc.getPropertyById.queryOptions({
      propertyId: Number(opportunityId),
    }),
    enabled: !!authToken && !!opportunityId,
  });

  const shareInfoQuery = useQuery({
    ...trpc.getShareInfo.queryOptions({
      propertyId: Number(opportunityId),
    }),
    enabled: !!authToken && !!opportunityId,
  });

  const myInvestmentsQuery = useQuery({
    ...trpc.getMyPropertyInvestments.queryOptions({
      authToken: authToken ?? "",
      propertyId: Number(opportunityId),
    }),
    enabled: !!authToken && !!opportunityId && isInvestor,
  });

  const myInvestments = (myInvestmentsQuery.data ?? []) as any[];

  // Real-time share preview when investor enters investment amount
  const sharePreviewQuery = useQuery({
    ...trpc.calculateSharePreview.queryOptions({
      propertyId: Number(opportunityId),
      amount: Number(investmentAmount) || 0,
    }),
    enabled: !!investmentAmount && Number(investmentAmount) > 0,
  });
  const sharePreview = sharePreviewQuery.data as any;

  // FICA verification status for the current investor
  const ficaQuery = useQuery({
    ...trpc.getMyFicaStatus.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isInvestor,
  });
  const ficaStatus = ficaQuery.data as any;

  // Appropriateness questionnaire status (hard gate per FAIS)
  const appropriatenessQuery = useQuery({
    ...trpc.getAppropriatenessStatus.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isInvestor,
  });
  const appropriatenessCompleted = !!(appropriatenessQuery.data as any)?.completed;

  // Documents pack for this opportunity (Phase 9)
  const docsPackQuery = useQuery({
    ...trpc.getLegalDocuments.queryOptions({
      authToken: authToken ?? "",
      propertyId: Number(opportunityId),
    }),
    enabled: !!authToken && !!opportunityId,
  });
  const docsPack: any[] = (docsPackQuery.data as any[]) ?? [];

  // Whether FICA is required for the current investment amount
  const FICA_THRESHOLD = 20_000;
  const currentAmount = Number(investmentAmount) || 0;
  const existingTotal = myInvestments.reduce(
    (sum: number, inv: any) => sum + (inv.contributionAmount ?? 0),
    0,
  );
  const totalAfterInvestment = existingTotal + currentAmount;
  const ficaRequired = currentAmount >= FICA_THRESHOLD || totalAfterInvestment >= FICA_THRESHOLD;
  const ficaVerified = ficaStatus?.ficaVerified === true;
  const ficaBlocked = ficaRequired && !ficaVerified;
  // FAIS hard gate — appropriateness must be done before ANY investment goes through.
  const appropriatenessBlocked = isInvestor && !appropriatenessCompleted;

  const property = propertyQuery.data as any;
  const shareInfo = shareInfoQuery.data as any;

  const allTermsAccepted = Object.values(termsAccepted).every(Boolean);
  const remainingTerms =
    5 - Object.values(termsAccepted).filter(Boolean).length;

  const handleToggleTerm = (key: keyof typeof termsAccepted) => {
    setTermsAccepted((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSubmitInvestment = async () => {
    if (!allTermsAccepted || !investmentAmount || submitting) return;
    if (appropriatenessBlocked) {
      setSubmitError("Please complete the suitability questionnaire first.");
      return;
    }
    if (ficaBlocked) {
      setSubmitError("Please complete FICA verification before investing this amount.");
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      await (trpcClient as any).submitInvestmentProposal.mutate({
        authToken: authToken ?? "",
        propertyId: Number(opportunityId),
        contributionAmount: Number(investmentAmount),
        notes,
      });
      setSubmitSuccess(true);
      setInvestmentAmount("");
      setNotes("");
      queryClient.invalidateQueries();
    } catch (err: any) {
      setSubmitError(
        err?.message ?? "Failed to submit investment. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditInvestment = async (contributionId: number) => {
    if (!editAmount || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      await (trpcClient as any).updateInvestmentProposal.mutate({
        authToken: authToken ?? "",
        contributionId,
        contributionAmount: Number(editAmount),
        notes: editNotes,
      });
      setEditingId(null);
      setEditAmount("");
      setEditNotes("");
      queryClient.invalidateQueries();
    } catch (err: any) {
      setSubmitError(
        err?.message ?? "Failed to update investment.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelInvestment = async (contributionId: number) => {
    if (!confirm("Are you sure you want to cancel this investment proposal?")) return;
    setSubmitting(true);
    try {
      await (trpcClient as any).cancelInvestmentProposal.mutate({
        authToken: authToken ?? "",
        contributionId,
      });
      queryClient.invalidateQueries();
    } catch (err: any) {
      setSubmitError(
        err?.message ?? "Failed to cancel investment.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!user || !authToken) return null;

  if (propertyQuery.isLoading) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold-500 border-r-transparent" />
        </div>
      </div>
    );
  }

  if (propertyQuery.isError || !property) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="rounded-lg bg-red-50 p-4 text-red-600">
            Failed to load opportunity details. Please try again later.
          </div>
        </div>
      </div>
    );
  }

  const fundingGoal = Number(
    property.fundingGoal ?? property.price ?? 0,
  );
  const amountRaised = Number(
    property.fundingRaised ?? property.amountRaised ?? property.funded ?? 0,
  );
  const fundingPct =
    fundingGoal > 0
      ? Math.min((amountRaised / fundingGoal) * 100, 100)
      : 0;
  const minInvestment = Number(
    property.minimumInvestment ?? property.minInvestment ?? 0,
  );
  const expectedReturns =
    property.expectedReturns ?? property.projectedReturn ?? property.roi ?? 0;

  // shareInfo is an array of share classes — aggregate for display
  const shareInfoArr = Array.isArray(shareInfo) ? shareInfo : [];
  const aggregatedShareInfo = shareInfoArr.length > 0
    ? {
        totalShares: shareInfoArr.reduce((s: number, sc: any) => s + (sc.totalShares ?? 0), 0),
        availableShares: shareInfoArr.reduce((s: number, sc: any) => s + (sc.availableShares ?? 0), 0),
        sharePrice: shareInfoArr[0]?.pricePerShare ?? null,
        shareClass: shareInfoArr.map((sc: any) => sc.name).join(", "),
        percentageSold: shareInfoArr.reduce((s: number, sc: any) => s + (sc.percentageSold ?? 0), 0) / shareInfoArr.length,
      }
    : null;

  const termsConfig = [
    {
      key: "feeStructure" as const,
      label: "Fee Structure & Profit Distribution (Waterfall)",
      icon: Layers,
      content: (
        <div className="space-y-3 text-sm text-gray-600">
          <p className="font-medium text-gray-900">
            Profit Distribution Waterfall:
          </p>
          <ol className="list-inside list-decimal space-y-2 text-gray-500">
            <li>
              <span className="font-medium text-gray-600">Capital Return</span>{" "}
              — All investor capital is returned first before any profit split.
            </li>
            <li>
              <span className="font-medium text-gray-600">
                Deposit Recovery
              </span>{" "}
              — Initial deposits and transaction costs are recovered.
            </li>
            <li>
              <span className="font-medium text-gray-600">
                Preferred Return (8–12%)
              </span>{" "}
              — Investors receive a preferred return on their capital before the
              manager participates in profits.
            </li>
            <li>
              <span className="font-medium text-gray-600">
                50/50 Profit Split
              </span>{" "}
              — Remaining profits after the preferred return are split 50/50
              between investors and the fund manager.
            </li>
          </ol>
          <div className="mt-3 rounded-lg bg-navy-800/50 p-3">
            <p className="mb-2 text-xs font-medium text-gold-600">
              Key Disclosures:
            </p>
            <ul className="list-inside list-disc space-y-1 text-xs text-gray-500">
              <li>
                For flip properties, a management fee is charged per property (not annually). Properties are targeted for sale within a maximum of 6 months, renovation included.
              </li>
              <li>
                For rental and development properties, management fees of 1–2% per annum may apply during the investment period.
              </li>
              <li>
                Promote/carry is only paid after the preferred return hurdle is
                met.
              </li>
              <li>
                Past performance is not indicative of future results. Returns
                are not guaranteed.
              </li>
            </ul>
          </div>
          <div className="mt-3 rounded-lg bg-navy-800/50 p-3">
            <p className="mb-2 text-xs font-medium text-gold-600">
              Illustrative Example — Flip (R1,000,000 property):
            </p>
            <ul className="space-y-1 text-xs text-gray-500">
              <li>Total investment: R1,000,000</li>
              <li>Sale price after 6 months: R1,350,000</li>
              <li>Gross profit: R350,000</li>
              <li>
                Capital returned: R1,000,000 → returned to investors first
              </li>
              <li>
                Preferred return (10% × 0.5yr): R50,000 → paid to investors
              </li>
              <li>
                Remaining R300,000 → R150,000 to investors, R150,000 to manager
              </li>
              <li className="font-medium text-gray-600">
                Total investor payout: R1,200,000 (capital + R50,000 + R150,000)
              </li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      key: "governanceRules" as const,
      label: "Governance & Voting Rights",
      icon: Shield,
      content: (
        <div className="space-y-2 text-sm text-gray-500">
          <p>
            As a fractional owner, you may have voting rights proportional to
            your share. Major decisions (sale, refinancing, capital
            improvements above 10% of property value) require majority
            approval from investors holding &gt;50% of shares.
          </p>
          <p>
            Day-to-day management is delegated to the appointed property
            manager. Annual general meetings will be held virtually, and
            all investors will receive advance notice and relevant
            documentation.
          </p>
        </div>
      ),
    },
    {
      key: "coolingOff" as const,
      label: "Cooling-Off Period",
      icon: Clock,
      content: (
        <div className="space-y-2 text-sm text-gray-500">
          <p>
            In accordance with the Consumer Protection Act and FSCA
            guidelines, you have a{" "}
            <span className="font-medium text-gray-900">
              5 business day cooling-off period
            </span>{" "}
            from the date of your investment commitment.
          </p>
          <p>
            During this period, you may withdraw your investment without
            penalty. After the cooling-off period, withdrawal is subject to
            the terms of the investment agreement and available liquidity.
          </p>
        </div>
      ),
    },
    {
      key: "riskDisclosure" as const,
      label: "Risk Disclosure",
      icon: AlertTriangle,
      content: (
        <div className="space-y-2 text-sm text-gray-500">
          <p>
            Property investment carries inherent risks including but not
            limited to: market value fluctuations, vacancy risk, interest
            rate changes, regulatory changes, and illiquidity. The value of
            your investment may go down as well as up.
          </p>
          <p>
            Fractional property shares are not listed on any exchange and may
            be difficult to sell. You should only invest money you can afford
            to lock away for the expected investment term (typically 3–7
            years).
          </p>
        </div>
      ),
    },
    {
      key: "dataConsent" as const,
      label: "Data Processing Consent",
      icon: FileText,
      content: (
        <div className="space-y-2 text-sm text-gray-500">
          <p>
            By proceeding, you consent to the collection, processing, and
            storage of your personal data in accordance with the Protection
            of Personal Information Act (POPIA). Your data will be used for
            KYC/AML compliance, investment processing, and regulatory
            reporting.
          </p>
          <p>
            Your information will not be shared with third parties except as
            required by law or for the purposes of administering your
            investment.
          </p>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back Link */}
        <Link
          to="/investments/opportunities"
          className="mb-6 inline-flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-gold-600"
        >
          <ArrowLeft size={16} />
          Back to Opportunities
        </Link>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left Column — Property Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Image */}
            <div className="overflow-hidden rounded-xl border border-navy-800/50 bg-navy-900/50">
              <div className="relative h-64 overflow-hidden bg-navy-800/50 sm:h-80">
                {property.image ??
                property.imageUrl ??
                property.images?.[0] ? (
                  <img
                    src={
                      property.image ??
                      property.imageUrl ??
                      property.images?.[0] ??
                      ""
                    }
                    alt={property.title ?? property.name ?? "Property"}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <Building className="text-gray-600" size={64} />
                  </div>
                )}
              </div>

              <div className="p-6">
                <h1 className="mb-2 text-2xl font-bold text-gray-900">
                  {property.title ?? property.name ?? "Untitled Property"}
                </h1>
                <p className="mb-4 text-gray-500">
                  {property.location ?? property.address ?? "South Africa"}
                </p>
                <p className="text-sm leading-relaxed text-gray-600">
                  {property.description ??
                    "No description available for this property."}
                </p>
              </div>
            </div>

            {/* Financials */}
            <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
              <h2 className="mb-4 text-lg font-semibold text-gray-900">
                Financial Details
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-lg bg-navy-800/30 p-4">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <DollarSign size={12} />
                    Funding Goal
                  </div>
                  <p className="mt-1 text-lg font-semibold text-gray-900">
                    R{fundingGoal.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg bg-navy-800/30 p-4">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <DollarSign size={12} />
                    Amount Raised
                  </div>
                  <p className="mt-1 text-lg font-semibold text-emerald-600">
                    R{amountRaised.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg bg-navy-800/30 p-4">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <DollarSign size={12} />
                    Min. Investment
                  </div>
                  <p className="mt-1 text-lg font-semibold text-gray-900">
                    R{minInvestment.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg bg-navy-800/30 p-4">
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <TrendingUp size={12} />
                    Expected Returns
                  </div>
                  <p className="mt-1 text-lg font-semibold text-gold-600">
                    {Number(expectedReturns).toFixed(1)}%
                  </p>
                </div>
              </div>

              {/* Funding Progress */}
              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="text-gray-500">Funding Progress</span>
                  <span className="font-medium text-gold-600">
                    {fundingPct.toFixed(1)}%
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-navy-800/50">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-400 transition-all"
                    style={{ width: `${fundingPct}%` }}
                  />
                </div>
              </div>
            </div>

            {/* SPV (Legal Entity) Information */}
            {property.spv && (
              <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-900">
                  <Building2 size={20} className="text-gold-500" />
                  Legal Entity (SPV)
                </h2>
                <p className="mb-4 text-xs text-gray-500">
                  This property is held by a Special Purpose Vehicle (SPV). Your investment purchases shares in this SPV, which owns the property on behalf of all investors.
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-lg bg-navy-800/30 p-3">
                    <p className="text-xs text-gray-500">SPV Name</p>
                    <p className="mt-1 text-sm font-semibold text-gray-900">{property.spv.name}</p>
                  </div>
                  {property.spv.registrationNumber && (
                    <div className="rounded-lg bg-navy-800/30 p-3">
                      <p className="text-xs text-gray-500">CIPC Registration</p>
                      <p className="mt-1 text-sm font-medium text-gray-900">{property.spv.registrationNumber}</p>
                    </div>
                  )}
                  <div className="rounded-lg bg-navy-800/30 p-3">
                    <p className="text-xs text-gray-500">Status</p>
                    <p className={`mt-1 text-sm font-medium ${property.spv.status === "ACTIVE" ? "text-emerald-600" : "text-gold-600"}`}>
                      {property.spv.status}
                    </p>
                  </div>
                  {property.spv.bankName && (
                    <div className="rounded-lg bg-navy-800/30 p-3">
                      <p className="text-xs text-gray-500">Banking Details</p>
                      <p className="mt-1 text-sm font-medium text-gray-900">{property.spv.bankName}</p>
                      {property.spv.bankAccountNumber && (
                        <p className="text-xs text-gray-500">Acc: ****{property.spv.bankAccountNumber.slice(-4)}</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-3 rounded-lg bg-gold-50/30 border border-gold-500/20 p-3">
                  <p className="text-xs text-gray-600">
                    <span className="font-semibold text-gold-700">Important:</span> All investment payments are made to the SPV's bank account. Your share certificate will reference this SPV as the legal entity holding the property.
                  </p>
                </div>
              </div>
            )}

            {/* In-Depth Financial Analysis */}
            <InvestorFinancialDetails property={property} preferredReturn={expectedReturns} />

            {/* Share Info */}
            {aggregatedShareInfo && (
              <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
                <h2 className="mb-4 text-lg font-semibold text-gray-900">
                  Share Information
                </h2>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {aggregatedShareInfo.totalShares != null && (
                    <div className="rounded-lg bg-navy-800/30 p-3">
                      <p className="text-xs text-gray-500">Total Shares</p>
                      <p className="mt-1 text-sm font-medium text-gray-900">
                        {Number(aggregatedShareInfo.totalShares).toLocaleString()}
                      </p>
                    </div>
                  )}
                  {aggregatedShareInfo.availableShares != null && (
                    <div className="rounded-lg bg-navy-800/30 p-3">
                      <p className="text-xs text-gray-500">Available Shares</p>
                      <p className="mt-1 text-sm font-medium text-emerald-600">
                        {Number(aggregatedShareInfo.availableShares).toLocaleString()}
                      </p>
                    </div>
                  )}
                  {aggregatedShareInfo.sharePrice != null && (
                    <div className="rounded-lg bg-navy-800/30 p-3">
                      <p className="text-xs text-gray-500">Price per Share</p>
                      <p className="mt-1 text-sm font-medium text-gold-600">
                        R{Number(aggregatedShareInfo.sharePrice).toLocaleString()}
                      </p>
                    </div>
                  )}
                  {aggregatedShareInfo.shareClass && (
                    <div className="rounded-lg bg-navy-800/30 p-3">
                      <p className="text-xs text-gray-500">Share Class</p>
                      <p className="mt-1 text-sm font-medium text-gray-900">
                        {aggregatedShareInfo.shareClass}
                      </p>
                    </div>
                  )}
                  {aggregatedShareInfo.percentageSold != null && (
                    <div className="rounded-lg bg-navy-800/30 p-3">
                      <p className="text-xs text-gray-500">Shares Sold</p>
                      <p className="mt-1 text-sm font-medium text-gold-600">
                        {aggregatedShareInfo.percentageSold.toFixed(1)}%
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Documents Pack (Phase 9) */}
            <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">
                  Documents Pack
                </h2>
                <span className="rounded-full bg-gold-100 px-2 py-0.5 text-xs font-medium text-gold-700">
                  {docsPack.length}
                </span>
              </div>
              <p className="mb-4 text-sm text-gray-500">
                Legal disclosures, SPV agreements, and supporting documents for this
                opportunity. Please review before investing.
              </p>
              {docsPackQuery.isLoading ? (
                <p className="text-sm text-gray-500">Loading documents…</p>
              ) : docsPack.length === 0 ? (
                <p className="rounded-lg border border-dashed border-navy-700 bg-navy-800/30 p-4 text-sm text-gray-400">
                  No documents have been published yet. Documents are typically added
                  before the funding round closes.
                </p>
              ) : (
                <ul className="divide-y divide-navy-800/50 rounded-lg border border-navy-800/50 bg-navy-900/30">
                  {docsPack.map((d: any) => (
                    <li
                      key={d.id}
                      className="flex items-center justify-between gap-3 p-3 text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <FileText className="h-4 w-4 shrink-0 text-gold-500" />
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-900">
                            {d.title ?? d.documentType ?? `Document #${d.id}`}
                          </p>
                          <p className="text-xs text-gray-500">
                            {d.documentType ?? "—"}
                            {d.createdAt
                              ? ` · ${new Date(d.createdAt).toLocaleDateString("en-ZA")}`
                              : ""}
                          </p>
                        </div>
                      </div>
                      {d.fileUrl ? (
                        <a
                          href={d.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 rounded-lg border border-gold-500 px-3 py-1.5 text-xs font-medium text-gold-600 hover:bg-gold-50"
                        >
                          View
                        </a>
                      ) : (
                        <span className="text-xs text-gray-500">Pending</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-4 border-t border-navy-800/50 pt-3">
                <Link
                  to="/investments/opportunities/$opportunityId/cap-table"
                  params={{ opportunityId }}
                  className="inline-flex items-center gap-2 text-sm font-medium text-gold-500 hover:text-gold-400"
                >
                  View live cap table →
                </Link>
              </div>
            </div>

            {/* Terms & Conditions */}
            {isInvestor && (
              <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
                <h2 className="mb-2 text-lg font-semibold text-gray-900">
                  Terms & Conditions
                </h2>
                <p className="mb-4 text-sm text-gray-500">
                  You must accept all {5} terms below before you can invest.
                  {remainingTerms > 0 && (
                    <span className="ml-1 text-gold-600">
                      ({remainingTerms} remaining)
                    </span>
                  )}
                </p>

                <div className="space-y-3">
                  {termsConfig.map((term) => {
                    const isExpanded = expandedTerm === term.key;
                    const isChecked = termsAccepted[term.key];
                    return (
                      <div
                        key={term.key}
                        className={`rounded-lg border transition-all ${
                          isChecked
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : "border-navy-800/50 bg-navy-800/20"
                        }`}
                      >
                        <div className="flex items-center gap-3 p-4">
                          <button
                            type="button"
                            onClick={() => handleToggleTerm(term.key)}
                            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
                              isChecked
                                ? "border-emerald-500 bg-emerald-500 text-white"
                                : "border-gray-600 hover:border-gold-500"
                            }`}
                          >
                            {isChecked && <CheckCircle size={14} />}
                          </button>
                          <term.icon
                            size={18}
                            className={
                              isChecked ? "text-emerald-600" : "text-gray-500"
                            }
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedTerm(isExpanded ? null : term.key)
                            }
                            className="flex-1 text-left text-sm font-medium text-gray-900 hover:text-gold-600 transition-colors"
                          >
                            {term.label}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedTerm(isExpanded ? null : term.key)
                            }
                            className="text-xs text-gray-500 hover:text-gold-600"
                          >
                            {isExpanded ? "Hide" : "View"}
                          </button>
                        </div>
                        {isExpanded && (
                          <div className="border-t border-navy-800/50 px-4 pb-4 pt-3">
                            {term.content}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right Column — Investment Form */}
          <div className="space-y-6">
            <AIMatchBadge propertyId={Number(opportunityId)} />
            <AICopilotChat propertyId={Number(opportunityId)} />
            {isInvestor && (
              <div className="sticky top-8 space-y-4">
                {/* Payment Reminder Banner — for approved but unpaid investments */}
                {(() => {
                  const unpaid = myInvestments.filter(
                    (inv: any) =>
                      inv.status === "APPROVED" &&
                      inv.paymentStatus !== "PAID" &&
                      inv.paymentStatus !== "POP_SUBMITTED"
                  );
                  if (unpaid.length === 0) return null;
                  const totalUnpaid = unpaid.reduce(
                    (sum: number, inv: any) => sum + (inv.contributionAmount ?? 0),
                    0
                  );
                  // Calculate overdue days (more than 7 days since approval)
                  const oldestApproval = unpaid.reduce(
                    (oldest: Date, inv: any) =>
                      new Date(inv.reviewedAt ?? inv.updatedAt ?? inv.createdAt) < oldest
                        ? new Date(inv.reviewedAt ?? inv.updatedAt ?? inv.createdAt)
                        : oldest,
                    new Date()
                  );
                  const daysSinceApproval = Math.floor(
                    (Date.now() - oldestApproval.getTime()) / (1000 * 60 * 60 * 24)
                  );
                  const isOverdue = daysSinceApproval > 7;

                  return (
                    <div
                      className={`rounded-xl border-2 p-5 ${
                        isOverdue
                          ? "animate-pulse border-red-400 bg-red-50"
                          : "border-amber-400 bg-amber-50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${
                            isOverdue ? "bg-red-100" : "bg-amber-100"
                          }`}
                        >
                          <Wallet
                            size={20}
                            className={isOverdue ? "text-red-600" : "text-amber-600"}
                          />
                        </div>
                        <div className="flex-1">
                          <h3
                            className={`text-sm font-bold ${
                              isOverdue ? "text-red-800" : "text-amber-800"
                            }`}
                          >
                            {isOverdue
                              ? "OVERDUE: Payment Required!"
                              : "Payment Required"}
                          </h3>
                          <p
                            className={`mt-1 text-xs ${
                              isOverdue ? "text-red-700" : "text-amber-700"
                            }`}
                          >
                            You have {unpaid.length} approved investment
                            {unpaid.length > 1 ? "s" : ""} totalling{" "}
                            <span className="font-bold">
                              R{totalUnpaid.toLocaleString()}
                            </span>{" "}
                            awaiting payment.
                            {isOverdue && (
                              <span className="ml-1 font-semibold">
                                ({daysSinceApproval} days since approval — please pay urgently!)
                              </span>
                            )}
                          </p>
                          <Link
                            to="/investments/payments"
                            className={`mt-3 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:shadow-lg ${
                              isOverdue
                                ? "bg-red-600 hover:bg-red-700"
                                : "bg-amber-600 hover:bg-amber-700"
                            }`}
                          >
                            <Wallet size={16} />
                            Submit Payment Now
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Existing Investments */}
                {myInvestments.length > 0 && (
                  <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-5">
                    <h3 className="mb-3 text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <Layers size={16} className="text-gold-500" />
                      Your Investments ({myInvestments.length})
                    </h3>
                    <div className="space-y-3">
                      {myInvestments.map((inv: any) => (
                        <div key={inv.id} className="rounded-lg border border-navy-800/50 bg-navy-800/20 p-3">
                          {editingId === inv.id ? (
                            /* Edit Mode */
                            <div className="space-y-3">
                              <div>
                                <label className="mb-1 block text-xs font-medium text-gray-500">Amount (R)</label>
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">R</span>
                                  <input
                                    type="number"
                                    value={editAmount}
                                    onChange={(e) => setEditAmount(e.target.value)}
                                    min={0}
                                    className="w-full rounded-lg border border-navy-800/50 bg-navy-800/30 py-2 pl-7 pr-3 text-sm text-gray-900 focus:border-gold-500/50 focus:outline-none focus:ring-1 focus:ring-gold-500/50"
                                  />
                                </div>
                              </div>
                              <div>
                                <label className="mb-1 block text-xs font-medium text-gray-500">Notes</label>
                                <textarea
                                  value={editNotes}
                                  onChange={(e) => setEditNotes(e.target.value)}
                                  rows={2}
                                  className="w-full rounded-lg border border-navy-800/50 bg-navy-800/30 p-2 text-xs text-gray-900 focus:border-gold-500/50 focus:outline-none focus:ring-1 focus:ring-gold-500/50"
                                />
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleEditInvestment(inv.id)}
                                  disabled={submitting || !editAmount}
                                  className="flex-1 rounded-lg bg-gold-500 py-2 text-xs font-semibold text-navy-950 hover:bg-gold-400 disabled:opacity-50"
                                >
                                  {submitting ? "Saving..." : "Save Changes"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setEditingId(null); setSubmitError(""); }}
                                  className="rounded-lg border border-navy-700 px-3 py-2 text-xs text-gray-500 hover:text-gray-900"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* Display Mode */
                            <>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-sm font-semibold text-gray-900">
                                  R{inv.contributionAmount.toLocaleString()}
                                </span>
                                <div className="flex gap-1.5">
                                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                    inv.status === "PENDING" ? "bg-amber-50 text-amber-600" :
                                    inv.status === "APPROVED" ? "bg-emerald-50 text-emerald-600" :
                                    inv.status === "REJECTED" ? "bg-red-50 text-red-600" :
                                    "bg-gray-100 text-gray-600"
                                  }`}>
                                    {inv.status}
                                  </span>
                                  {inv.status === "APPROVED" && inv.paymentStatus && inv.paymentStatus !== "PAID" && (
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                      inv.paymentStatus === "NOT_PAID" ? "bg-red-50 text-red-600" :
                                      inv.paymentStatus === "POP_SUBMITTED" ? "bg-blue-50 text-blue-600" :
                                      inv.paymentStatus === "POP_REJECTED" ? "bg-orange-50 text-orange-600" :
                                      "bg-gray-100 text-gray-600"
                                    }`}>
                                      {inv.paymentStatus === "NOT_PAID" ? "Unpaid" :
                                       inv.paymentStatus === "POP_SUBMITTED" ? "POP Under Review" :
                                       inv.paymentStatus === "POP_REJECTED" ? "POP Rejected" :
                                       inv.paymentStatus}
                                    </span>
                                  )}
                                  {inv.paymentStatus === "PAID" && (
                                    <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-600">
                                      Paid
                                    </span>
                                  )}
                                </div>
                              </div>
                              <p className="text-xs text-gray-500 mb-1">
                                Submitted: {new Date(inv.contributionDate).toLocaleDateString("en-ZA")}
                              </p>
                              {inv.numberOfShares != null && (
                                <div className="flex flex-wrap gap-2 text-[11px] mb-1">
                                  <span className="rounded bg-gold-50 px-1.5 py-0.5 text-gold-700">
                                    {Number(inv.numberOfShares).toLocaleString(undefined, {maximumFractionDigits: 2})} shares
                                  </span>
                                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700">
                                    {Number(inv.ownershipPercentage).toFixed(2)}% ownership
                                  </span>
                                </div>
                              )}
                              {inv.notes && (
                                <p className="text-xs text-gray-400 mb-2 italic">"{inv.notes}"</p>
                              )}
                              {inv.isWithinGracePeriod && (
                                <div className="mb-2">
                                  <p className="text-xs text-blue-500">
                                    <Clock size={12} className="inline mr-1" />
                                    {inv.graceDaysRemaining} day{inv.graceDaysRemaining !== 1 ? "s" : ""} left to edit/cancel
                                  </p>
                                </div>
                              )}
                              {inv.isWithinGracePeriod && (
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingId(inv.id);
                                      setEditAmount(String(inv.contributionAmount));
                                      setEditNotes(inv.notes ?? "");
                                      setSubmitError("");
                                    }}
                                    className="flex-1 rounded-lg border border-gold-500/50 py-1.5 text-xs font-medium text-gold-600 hover:bg-gold-500/10"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleCancelInvestment(inv.id)}
                                    disabled={submitting}
                                    className="flex-1 rounded-lg border border-red-500/30 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10 disabled:opacity-50"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )}
                              {/* Pay Now CTA for approved but unpaid investments */}
                              {inv.status === "APPROVED" && (inv.paymentStatus === "NOT_PAID" || inv.paymentStatus === "POP_REJECTED") && (
                                <Link
                                  to="/investments/payments"
                                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-gold-500 py-2 text-xs font-bold text-navy-950 transition hover:bg-gold-400"
                                >
                                  <Wallet size={14} />
                                  {inv.paymentStatus === "POP_REJECTED" ? "Re-submit Payment" : "Pay Now"}
                                </Link>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                    {submitError && editingId && (
                      <div className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-600">
                        {submitError}
                      </div>
                    )}
                  </div>
                )}

                {/* New Investment Form */}
                <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
                  <h2 className="mb-4 text-lg font-semibold text-gray-900">
                    {myInvestments.length > 0 ? "Add Another Investment" : "Make an Investment"}
                  </h2>

                  {submitSuccess ? (
                    <div className="rounded-lg bg-emerald-50 p-4 text-center">
                      <CheckCircle className="mx-auto mb-2 text-emerald-600" size={32} />
                      <p className="font-medium text-emerald-600">
                        Investment Submitted!
                      </p>
                      <p className="mt-1 text-sm text-gray-500">
                        Your investment proposal has been submitted for review. You
                        will be notified once it is processed.
                      </p>
                      <button
                        type="button"
                        onClick={() => setSubmitSuccess(false)}
                        className="mt-3 text-sm text-gold-600 hover:text-gold-500"
                      >
                        Make another investment
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="mb-4">
                        <label className="mb-1.5 block text-sm font-medium text-gray-600">
                          Investment Amount (R)
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                            R
                          </span>
                          <input
                            type="number"
                            value={investmentAmount}
                            onChange={(e) => setInvestmentAmount(e.target.value)}
                            placeholder={`Min R${minInvestment.toLocaleString()}`}
                            min={minInvestment}
                            className="w-full rounded-lg border border-navy-800/50 bg-navy-800/30 py-2.5 pl-8 pr-4 text-sm text-gray-900 placeholder-gray-500 focus:border-gold-500/50 focus:outline-none focus:ring-1 focus:ring-gold-500/50"
                          />
                        </div>
                      </div>

                      {/* Real-time Share Preview */}
                      {investmentAmount && Number(investmentAmount) > 0 && sharePreview && (
                        <div className="mb-4 rounded-xl border border-gold-500/30 bg-gold-50/50 p-4">
                          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gold-800">
                            <PieChart size={14} />
                            Your Share Breakdown
                          </h4>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg bg-white/70 p-2.5">
                              <p className="text-[11px] text-gray-500">Shares You'll Own</p>
                              <p className="text-sm font-bold text-gray-900">
                                {Number(sharePreview.numberOfShares).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                              </p>
                            </div>
                            <div className="rounded-lg bg-white/70 p-2.5">
                              <p className="text-[11px] text-gray-500">Price per Share</p>
                              <p className="text-sm font-bold text-gray-900">
                                R{Number(sharePreview.sharePrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                              </p>
                            </div>
                            <div className="rounded-lg bg-white/70 p-2.5">
                              <p className="text-[11px] text-gray-500">Ownership %</p>
                              <p className="text-sm font-bold text-gold-700">
                                {Number(sharePreview.ownershipPercentage).toFixed(2)}%
                              </p>
                            </div>
                            <div className="rounded-lg bg-white/70 p-2.5">
                              <p className="text-[11px] text-gray-500">Share Class</p>
                              <p className="text-sm font-bold text-gray-900">
                                {sharePreview.shareClassName}
                              </p>
                            </div>
                          </div>
                          <p className="mt-2 text-[11px] text-gray-500">
                            A share certificate will be issued once your proposal is approved and payment confirmed.
                          </p>
                        </div>
                      )}

                      {/* FICA Verification Warning */}
                      {ficaRequired && (
                        <div className={`mb-4 rounded-xl border p-4 ${
                          ficaVerified
                            ? "border-emerald-500/30 bg-emerald-50/50"
                            : "border-orange-500/40 bg-orange-50/50"
                        }`}>
                          <div className="flex items-start gap-3">
                            <ShieldAlert
                              size={20}
                              className={ficaVerified ? "text-emerald-600 mt-0.5" : "text-orange-600 mt-0.5"}
                            />
                            <div>
                              <p className={`text-sm font-semibold ${
                                ficaVerified ? "text-emerald-800" : "text-orange-800"
                              }`}>
                                {ficaVerified
                                  ? "FICA Verified"
                                  : "FICA Verification Required"}
                              </p>
                              {ficaVerified ? (
                                <p className="mt-1 text-xs text-emerald-700">
                                  Your identity has been verified. You can invest in amounts of R20,000 and above.
                                </p>
                              ) : (
                                <>
                                  <p className="mt-1 text-xs text-orange-700">
                                    Investments of R{FICA_THRESHOLD.toLocaleString()} or more require FICA verification
                                    under South African law. Your{currentAmount >= FICA_THRESHOLD ? "" : " cumulative"}
                                    {" "}investment amount{currentAmount < FICA_THRESHOLD ? ` (R${totalAfterInvestment.toLocaleString()} total)` : ""}
                                    {" "}meets this threshold.
                                  </p>
                                  <p className="mt-2 text-xs text-orange-700">
                                    Please submit the following documents in{" "}
                                    <Link to="/kyc-compliance" className="font-semibold text-orange-900 underline hover:text-orange-700">
                                      KYC Compliance
                                    </Link>:
                                  </p>
                                  <ul className="mt-1 space-y-0.5 text-xs text-orange-600">
                                    <li className="flex items-center gap-1.5">
                                      {ficaStatus?.missingDocuments?.includes("ID_DOCUMENT")
                                        ? <XCircle size={11} className="text-red-500" />
                                        : ficaStatus?.pendingDocuments?.includes("ID_DOCUMENT")
                                          ? <Clock size={11} className="text-amber-500" />
                                          : <CheckCircle size={11} className="text-emerald-500" />
                                      }
                                      ID Document / Passport
                                    </li>
                                    <li className="flex items-center gap-1.5">
                                      {ficaStatus?.missingDocuments?.includes("PROOF_OF_ADDRESS")
                                        ? <XCircle size={11} className="text-red-500" />
                                        : ficaStatus?.pendingDocuments?.includes("PROOF_OF_ADDRESS")
                                          ? <Clock size={11} className="text-amber-500" />
                                          : <CheckCircle size={11} className="text-emerald-500" />
                                      }
                                      Proof of Address
                                    </li>

                                  </ul>
                                  {ficaStatus?.allDocumentsApproved && (
                                    <p className="mt-2 text-xs font-medium text-emerald-700">
                                      All documents approved — awaiting manager FICA verification.
                                    </p>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="mb-4">
                        <label className="mb-1.5 block text-sm font-medium text-gray-600">
                          Notes (Optional)
                        </label>
                        <textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Any preferences or notes for your investment..."
                          rows={3}
                          className="w-full rounded-lg border border-navy-800/50 bg-navy-800/30 p-3 text-sm text-gray-900 placeholder-gray-500 focus:border-gold-500/50 focus:outline-none focus:ring-1 focus:ring-gold-500/50"
                        />
                      </div>

                      {submitError && !editingId && (
                        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                          {submitError}
                        </div>
                      )}

                      {/* Terms Status */}
                      <div className="mb-4 rounded-lg bg-navy-800/30 p-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">
                            Terms & Conditions
                          </span>
                          <span
                            className={
                              allTermsAccepted
                                ? "text-emerald-600"
                                : "text-gold-600"
                            }
                          >
                            {allTermsAccepted
                              ? "All accepted"
                              : `${remainingTerms} remaining`}
                          </span>
                        </div>
                        <div className="mt-2 flex gap-1">
                          {Object.entries(termsAccepted).map(
                            ([key, accepted]) => (
                              <div
                                key={key}
                                className={`h-1.5 flex-1 rounded-full ${
                                  accepted ? "bg-emerald-500" : "bg-navy-700"
                                }`}
                              />
                            ),
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleSubmitInvestment}
                        disabled={
                          !allTermsAccepted ||
                          !investmentAmount ||
                          submitting ||
                          ficaBlocked ||
                          appropriatenessBlocked
                        }
                        className="w-full rounded-lg bg-gold-500 py-3 text-sm font-semibold text-navy-950 transition-colors hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {submitting
                          ? "Submitting..."
                          : appropriatenessBlocked
                            ? "Complete suitability questionnaire to invest"
                            : ficaBlocked
                              ? "Complete FICA verification to invest"
                              : allTermsAccepted
                                ? "Submit Investment"
                                : `Accept all T&Cs to invest (${remainingTerms} left)`}
                      </button>
                      {appropriatenessBlocked && (
                        <p className="mt-2 text-xs text-amber-700">
                          Required by FAIS: a 2-minute questionnaire helps confirm this product is appropriate for you.{" "}
                          <Link to="/dashboard" className="font-semibold underline hover:text-amber-800">
                            Complete it now
                          </Link>
                        </p>
                      )}
                      {!appropriatenessBlocked && ficaBlocked && (
                        <p className="mt-2 text-xs text-amber-700">
                          You&rsquo;re above the R20 000 threshold and need FICA verification before investing.{" "}
                          <Link to="/kyc-compliance" className="font-semibold underline hover:text-amber-800">
                            Upload documents
                          </Link>
                        </p>
                      )}
                      {!appropriatenessBlocked && !ficaBlocked && (
                        <p className="mt-2 text-xs text-gray-500">
                          You have a <strong>5-business-day cooling-off period</strong> after submitting — you can cancel for any reason and receive a full refund.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Quick Stats */}
            <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
              <h3 className="mb-3 text-sm font-semibold text-gray-900">
                Quick Summary
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Property Type</span>
                  <span className="text-gray-900">
                    {property.propertyType ?? property.type ?? "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Status</span>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-600">
                    {property.status ?? "Active"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Funding</span>
                  <span className="text-gold-600">{fundingPct.toFixed(0)}%</span>
                </div>
                {property.bedrooms && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Bedrooms</span>
                    <span className="text-gray-900">{property.bedrooms}</span>
                  </div>
                )}
                {property.bathrooms && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Bathrooms</span>
                    <span className="text-gray-900">{property.bathrooms}</span>
                  </div>
                )}
                {property.size && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Size</span>
                    <span className="text-gray-900">{property.size} m²</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Investor-Focused Financial Details Component
// ============================================================================

const R = (n: number) => `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const pct = (n: number) => `${n.toFixed(1)}%`;

function InvMetric({ label, value, color = "text-gray-900", sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-navy-800/30 p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-gray-500">{sub}</p>}
    </div>
  );
}

function InvestorFinancialDetails({ property, preferredReturn }: { property: any; preferredReturn: number }) {
  const isFlip = !!property.propertyFlip || property.type === "flip" || property.type === "FLIP";
  const isRental = !!property.rentalBond || property.type === "rental" || property.type === "RENTAL";
  const isDevelopment = !!property.propertyDevelopment || property.type === "development" || property.type === "DEVELOPMENT";

  // ── Flip ─────────────────────────────────────────────────────────────────
  if (isFlip) {
    const flip = property.propertyFlip ?? property;
    const input: PropertyFlipInput = {
      purchasePrice: Number(flip.purchasePrice ?? property.price ?? 0),
      renovationBudget: Number(flip.renovationBudget ?? 0),
      estimatedValue: Number(flip.estimatedValue ?? 0),
      holdingCosts: Number(flip.holdingCosts ?? 0),
      closingCostsPurchase: Number(flip.closingCostsPurchase ?? 0),
      closingCostsSale: Number(flip.closingCostsSale ?? 0),
      estimatedRepairCosts: Number(flip.estimatedRepairCosts ?? 0),
      afterRepairValue: Number(flip.afterRepairValue ?? 0),
      maxOfferPrice: Number(flip.maxOfferPrice ?? 0),
      expectedROI: Number(flip.expectedROI ?? 0),
      expectedProfitMargin: Number(flip.expectedProfitMargin ?? 0),
      daysToComplete: Number(flip.daysToComplete ?? 0),
      totalInvestmentBudget: Number(flip.totalInvestmentBudget ?? 0),
      spentInvestmentBudget: Number(flip.spentInvestmentBudget ?? 0),
    };

    const calc = calculateFlipMetrics(input);
    const managementFee = calc.totalInvestment > 0 ? calc.totalInvestment * 0.02 : 0;
    const profitAfterFees = calc.expectedProfit - managementFee;

    return (
      <div className="space-y-5 rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
        {/* Strategy Overview */}
        <div className="rounded-lg bg-gradient-to-r from-orange-500/10 to-gold-500/10 border border-orange-500/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="text-orange-500" size={18} />
            <h3 className="text-sm font-bold text-gray-900">Fix & Flip — Investment Analysis</h3>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            This property follows a <span className="font-semibold text-orange-600">buy, renovate, and sell</span> strategy.
            The goal is a quick turnaround — not a long-term hold.
            {input.daysToComplete > 0 && ` Estimated project timeline: ${input.daysToComplete} days.`}
          </p>
        </div>

        {/* Key Investment Metrics */}
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-600">
            <BarChart3 size={14} className="text-gold-500" /> Investment Metrics
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <InvMetric label="Total Investment Required" value={R(calc.totalInvestment)} sub="Purchase + renovation + costs" />
            <InvMetric label="After Repair Value (ARV)" value={R(input.afterRepairValue || input.estimatedValue)} color="text-emerald-600" sub="Estimated sale price" />
            <InvMetric label="Expected Profit" value={R(calc.expectedProfit)} color={calc.expectedProfit >= 0 ? "text-emerald-600" : "text-red-500"} />
            <InvMetric label="Return on Investment" value={pct(calc.displayROI)} color="text-gold-600" />
            <InvMetric label="Break-Even Price" value={R(calc.breakEvenPrice)} sub="Minimum sale price" />
            {input.daysToComplete > 0 && <InvMetric label="Target Timeline" value={`${input.daysToComplete} days`} color="text-blue-600" />}
          </div>
        </div>

        {/* Cost Transparency */}
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-600">
            <Wallet size={14} className="text-gold-500" /> Cost Breakdown
          </h4>
          <div className="space-y-1.5 text-sm">
            {[
              { label: "Purchase Price", value: input.purchasePrice },
              { label: "Renovation Budget", value: input.renovationBudget },
              { label: "Holding Costs", value: input.holdingCosts },
              { label: "Closing Costs (Purchase)", value: input.closingCostsPurchase },
              { label: "Closing Costs (Sale)", value: input.closingCostsSale },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-md bg-navy-800/20 px-3 py-2">
                <span className="text-gray-500">{row.label}</span>
                <span className="font-medium text-gray-900">{R(row.value)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-md bg-gold-500/10 border border-gold-500/20 px-3 py-2 font-semibold">
              <span className="text-gray-900">Total Investment</span>
              <span className="text-gold-600">{R(calc.totalInvestment)}</span>
            </div>
          </div>
        </div>

        {/* Fees & Net Returns */}
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-600">
            <PiggyBank size={14} className="text-gold-500" /> Fees & Net Returns
          </h4>
          <div className="rounded-lg bg-navy-800/20 p-3 space-y-2 text-sm">
            <p className="text-gray-600">
              A <span className="font-semibold text-gray-900">2% management fee</span> ({R(managementFee)}) is charged per property
              to cover project management and admin costs.
            </p>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <InvMetric label="Net Profit After Fees" value={R(profitAfterFees)} color={profitAfterFees >= 0 ? "text-emerald-600" : "text-red-500"} />
              <InvMetric label="Preferred Return" value={preferredReturn > 0 ? pct(preferredReturn) : "8–10%"} color="text-gold-600" sub="Per property" />
            </div>
          </div>
        </div>

        {/* Profit Distribution Waterfall */}
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-600">
            <Layers size={14} className="text-gold-500" /> Profit Distribution Waterfall
          </h4>
          <ol className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-500/20 text-[10px] font-bold text-gold-600">1</span>
              <span className="text-gray-600"><span className="font-semibold text-gray-900">Capital Return</span> — All investor capital is returned first before any profit split.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-500/20 text-[10px] font-bold text-gold-600">2</span>
              <span className="text-gray-600"><span className="font-semibold text-gray-900">Deposit Recovery</span> — Initial deposits and transaction costs are recovered.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-500/20 text-[10px] font-bold text-gold-600">3</span>
              <span className="text-gray-600"><span className="font-semibold text-gray-900">Preferred Return ({preferredReturn > 0 ? pct(preferredReturn) : "8–12%"})</span> — Investors receive a preferred return on their capital before the manager participates in profits.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-500/20 text-[10px] font-bold text-gold-600">4</span>
              <span className="text-gray-600"><span className="font-semibold text-gray-900">50/50 Profit Split</span> — Remaining profits after the preferred return are split 50/50 between investors and the fund manager.</span>
            </li>
          </ol>

          {/* Key Disclosures */}
          <div className="mt-4 rounded-lg border border-navy-700 bg-navy-800/10 p-4">
            <p className="mb-2 text-xs font-semibold text-gold-600">Key Disclosures:</p>
            <ul className="list-inside list-disc space-y-1 text-xs text-gray-500">
              <li>A management fee is charged per property (not annually). Properties are targeted for sale within a maximum of 6 months, renovation included.</li>
              <li>Promote/carry is only paid after the preferred return hurdle is met.</li>
              <li>Past performance is not indicative of future results. Returns are not guaranteed.</li>
            </ul>
          </div>

          {/* Illustrative Example */}
          <div className="mt-3 rounded-lg border border-navy-700 bg-navy-800/10 p-4">
            <p className="mb-2 text-xs font-semibold text-gold-600">Illustrative Example — Flip (R1,000,000 property):</p>
            <ul className="space-y-1 text-xs text-gray-500">
              <li>Total investment: R1,000,000</li>
              <li>Sale price after 6 months: R1,350,000</li>
              <li>Gross profit: R350,000</li>
              <li>Capital returned: R1,000,000 → returned to investors first</li>
              <li>Preferred return (10% × 0.5yr): R50,000 → paid to investors</li>
              <li>Remaining R300,000 → R150,000 to investors, R150,000 to manager</li>
              <li className="font-medium text-gray-600">Total investor payout: R1,200,000 (capital + R50,000 + R150,000)</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // ── Rental ───────────────────────────────────────────────────────────────
  if (isRental) {
    const rental = property.rentalBond ?? property;
    const input: RentalPropertyInput = {
      purchasePrice: Number(rental.purchasePrice ?? property.price ?? 0),
      monthlyRent: Number(rental.monthlyRent ?? 0),
      annualPropertyTax: Number(rental.annualPropertyTax ?? 0),
      annualInsurance: Number(rental.annualInsurance ?? 0),
      monthlyHOAFees: Number(rental.monthlyHOAFees ?? 0),
      monthlyMaintenanceReserve: Number(rental.monthlyMaintenanceReserve ?? 0),
      monthlyUtilities: Number(rental.monthlyUtilities ?? 0),
      monthlyManagementFee: Number(rental.monthlyManagementFee ?? 0),
      vacancyRate: Number(rental.vacancyRate ?? 5),
      appreciationRate: Number(rental.appreciationRate ?? 3),
      capRate: Number(rental.capRate ?? 0),
      cashOnCashReturn: Number(rental.cashOnCashReturn ?? 0),
      grossRentMultiplier: Number(rental.grossRentMultiplier ?? 0),
      debtServiceCoverageRatio: Number(rental.debtServiceCoverageRatio ?? 0),
      grossYield: Number(rental.grossYield ?? 0),
      netYield: Number(rental.netYield ?? 0),
      downPaymentAmount: Number(rental.downPaymentAmount ?? 0),
      loanAmount: Number(rental.loanAmount ?? rental.bondAmount ?? 0),
      interestRate: Number(rental.interestRate ?? 0),
      loanTermYears: Number(rental.loanTermYears ?? 0),
      monthlyDebtService: Number(rental.monthlyDebtService ?? 0),
      totalInvestmentBudget: Number(rental.totalInvestmentBudget ?? 0),
      spentInvestmentBudget: Number(rental.spentInvestmentBudget ?? 0),
    };

    const calc = calculateRentalMetrics(input);

    return (
      <div className="space-y-5 rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
        {/* Strategy Overview */}
        <div className="rounded-lg bg-gradient-to-r from-blue-500/10 to-gold-500/10 border border-blue-500/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Home className="text-blue-500" size={18} />
            <h3 className="text-sm font-bold text-gray-900">Rental Property — Investment Analysis</h3>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            This is a <span className="font-semibold text-blue-600">buy-and-hold rental</span> generating monthly income.
            {input.monthlyRent > 0 && ` Monthly rent: ${R(input.monthlyRent)}.`}
            {input.appreciationRate > 0 && ` Expected annual appreciation: ${pct(input.appreciationRate)}.`}
          </p>
        </div>

        {/* Key Metrics */}
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-600">
            <BarChart3 size={14} className="text-gold-500" /> Income & Returns
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <InvMetric label="Monthly Rental Income" value={R(input.monthlyRent)} color="text-emerald-600" />
            <InvMetric label="Annual Gross Rent" value={R(calc.annualGrossRent)} color="text-emerald-600" />
            <InvMetric label="Net Operating Income" value={R(calc.noi)} color={calc.noi >= 0 ? "text-emerald-600" : "text-red-500"} sub="Annual, after expenses" />
            <InvMetric label="Monthly Cash Flow" value={R(calc.monthlyCashFlow)} color={calc.monthlyCashFlow >= 0 ? "text-emerald-600" : "text-red-500"} sub="After debt service" />
          </div>
        </div>

        {/* Yield Analysis */}
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-600">
            <TrendingUp size={14} className="text-gold-500" /> Yield & Return Analysis
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <InvMetric label="Gross Yield" value={pct(calc.grossYield)} color="text-gold-600" sub="Annual rent ÷ purchase price" />
            <InvMetric label="Net Yield" value={pct(calc.netYield)} color="text-gold-600" sub="NOI ÷ purchase price" />
            <InvMetric label="Cap Rate" value={pct(calc.displayCapRate)} color="text-gold-600" sub="NOI ÷ property value" />
            <InvMetric label="Cash-on-Cash Return" value={pct(calc.cashOnCashReturn)} color="text-emerald-600" sub="Cash flow ÷ cash invested" />
            {preferredReturn > 0 && <InvMetric label="Preferred Return" value={pct(preferredReturn)} color="text-gold-600" sub="Target investor return" />}
            {input.vacancyRate > 0 && <InvMetric label="Vacancy Rate" value={pct(input.vacancyRate)} color="text-orange-500" sub={`Annual loss: ${R(calc.vacancyLoss)}`} />}
          </div>
        </div>

        {/* Expenses Summary */}
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-600">
            <Wallet size={14} className="text-gold-500" /> Annual Expenses
          </h4>
          <div className="space-y-1.5 text-sm">
            {[
              { label: "Property Tax", value: input.annualPropertyTax },
              { label: "Insurance", value: input.annualInsurance },
              { label: "HOA Fees", value: input.monthlyHOAFees * 12 },
              { label: "Maintenance Reserve", value: input.monthlyMaintenanceReserve * 12 },
              { label: "Utilities", value: input.monthlyUtilities * 12 },
              { label: "Management Fee", value: input.monthlyManagementFee * 12 },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-md bg-navy-800/20 px-3 py-2">
                <span className="text-gray-500">{row.label}</span>
                <span className="font-medium text-gray-900">{R(row.value)}/yr</span>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-md bg-gold-500/10 border border-gold-500/20 px-3 py-2 font-semibold">
              <span className="text-gray-900">Total Operating Expenses</span>
              <span className="text-gold-600">{R(calc.annualOperatingExpenses)}/yr</span>
            </div>
          </div>
        </div>

        {/* Financing */}
        {input.loanAmount > 0 && (
          <div>
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-600">
              <PiggyBank size={14} className="text-gold-500" /> Financing
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <InvMetric label="Loan Amount" value={R(input.loanAmount)} color="text-orange-500" />
              <InvMetric label="Monthly Payment" value={R(input.monthlyDebtService)} color="text-orange-500" />
              {input.interestRate > 0 && <InvMetric label="Interest Rate" value={pct(input.interestRate)} />}
              {input.loanTermYears > 0 && <InvMetric label="Loan Term" value={`${input.loanTermYears} years`} />}
            </div>
          </div>
        )}

        {/* Profit Distribution Waterfall */}
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-600">
            <TrendingUp size={14} className="text-gold-500" /> Profit Distribution Waterfall
          </h4>
          <div className="rounded-lg border border-navy-700 bg-navy-800/10 p-4">
            <p className="text-xs text-gray-600 mb-3">
              Profits are distributed according to the following waterfall structure:
            </p>
            <ol className="space-y-2 text-xs">
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-500/20 text-xs font-bold text-gold-600">1</span>
                <span className="text-gray-600"><span className="font-semibold text-gray-900">Capital Return</span> — All investor capital is returned first before any profit split.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-500/20 text-xs font-bold text-gold-600">2</span>
                <span className="text-gray-600"><span className="font-semibold text-gray-900">Deposit Recovery</span> — Initial deposits and transaction costs are recovered.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-500/20 text-xs font-bold text-gold-600">3</span>
                <span className="text-gray-600"><span className="font-semibold text-gray-900">Preferred Return ({preferredReturn > 0 ? pct(preferredReturn) : "8–12%"})</span> — Investors receive a preferred return on their capital before the manager participates in profits.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-500/20 text-xs font-bold text-gold-600">4</span>
                <span className="text-gray-600"><span className="font-semibold text-gray-900">50/50 Profit Split</span> — Remaining profits after the preferred return are split 50/50 between investors and the fund manager.</span>
              </li>
            </ol>
          </div>

          {/* Key Disclosures */}
          <div className="mt-3 rounded-lg border border-navy-700 bg-navy-800/10 p-4">
            <p className="mb-2 text-xs font-semibold text-gold-600">Key Disclosures:</p>
            <ul className="list-inside list-disc space-y-1 text-xs text-gray-500">
              <li>Management fees of 1–2% per annum may apply during the investment period.</li>
              <li>Promote/carry is only paid after the preferred return hurdle is met.</li>
              <li>Past performance is not indicative of future results. Returns are not guaranteed.</li>
            </ul>
          </div>

          {/* Illustrative Example */}
          <div className="mt-3 rounded-lg border border-navy-700 bg-navy-800/10 p-4">
            <p className="mb-2 text-xs font-semibold text-gold-600">Illustrative Example (R1,000,000 property):</p>
            <ul className="space-y-1 text-xs text-gray-500">
              <li>Total investment: R1,000,000</li>
              <li>Sale price after 3 years: R1,500,000</li>
              <li>Gross profit: R500,000</li>
              <li>Capital returned: R1,000,000 → returned to investors first</li>
              <li>Preferred return (10% × 3yr): R300,000 → paid to investors</li>
              <li>Remaining R200,000 → R100,000 to investors, R100,000 to manager</li>
              <li className="font-medium text-gray-600">Total investor payout: R1,400,000 (capital + R300,000 + R100,000)</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // ── Development ──────────────────────────────────────────────────────────
  if (isDevelopment) {
    const dev = property.propertyDevelopment ?? property;
    const devType = dev.developmentType ?? "AFFORDABLE_RESALE";
    const input: PropertyDevelopmentInput = {
      developmentType: devType,
      landAcquisitionCost: Number(dev.landAcquisitionCost ?? 0),
      hardCosts: Number(dev.hardCosts ?? 0),
      softCosts: Number(dev.softCosts ?? 0),
      financingCosts: Number(dev.financingCosts ?? 0),
      contingencyPercent: Number(dev.contingencyPercent ?? 10),
      contingencyAmount: Number(dev.contingencyAmount ?? 0),
      expectedSalePricePerUnit: Number(dev.expectedSalePricePerUnit ?? 0),
      totalExpectedRevenue: Number(dev.totalExpectedRevenue ?? 0),
      expectedProfit: Number(dev.expectedProfit ?? 0),
      expectedMonthlyRentPerUnit: Number(dev.expectedMonthlyRentPerUnit ?? 0),
      annualOperatingExpenses: Number(dev.annualOperatingExpenses ?? 0),
      stabilizedCapRate: Number(dev.stabilizedCapRate ?? 0),
      expectedGrossYield: Number(dev.expectedGrossYield ?? 0),
      expectedNetYield: Number(dev.expectedNetYield ?? 0),
      expectedROI: Number(dev.expectedROI ?? 0),
      expectedIRR: Number(dev.expectedIRR ?? 0),
      developmentTimelineMonths: Number(dev.developmentTimelineMonths ?? 0),
      preSaleUnits: Number(dev.preSaleUnits ?? 0),
      costPerSquareMeter: Number(dev.costPerSquareMeter ?? 0),
      totalSquareMeters: Number(dev.totalSquareMeters ?? 0),
      numberOfUnits: Number(dev.numberOfUnits ?? 0),
      totalBudget: Number(dev.totalBudget ?? 0),
    };

    const calc = calculateDevelopmentMetrics(input);
    const isResale = devType === "AFFORDABLE_RESALE";
    const devLabel = isResale ? "Affordable Resale" : devType === "AFFORDABLE_RENTAL" ? "Affordable Rental" : "Commercial Rental";

    return (
      <div className="space-y-5 rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
        {/* Strategy Overview */}
        <div className="rounded-lg bg-gradient-to-r from-purple-500/10 to-gold-500/10 border border-purple-500/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Building className="text-purple-500" size={18} />
            <h3 className="text-sm font-bold text-gray-900">{devLabel} Development — Investment Analysis</h3>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            {input.numberOfUnits > 0 && `${input.numberOfUnits} unit `}development project
            {input.totalSquareMeters > 0 && ` spanning ${input.totalSquareMeters.toLocaleString()} m²`}.
            {input.developmentTimelineMonths > 0 && ` Estimated completion: ${input.developmentTimelineMonths} months.`}
          </p>
        </div>

        {/* Key Metrics */}
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-600">
            <BarChart3 size={14} className="text-gold-500" /> Key Investment Metrics
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <InvMetric label="Total Development Cost" value={R(calc.totalCosts)} />
            {isResale && <InvMetric label="Expected Revenue" value={R(input.totalExpectedRevenue)} color="text-emerald-600" />}
            {isResale && <InvMetric label="Expected Profit" value={R(input.expectedProfit)} color={input.expectedProfit >= 0 ? "text-emerald-600" : "text-red-500"} />}
            <InvMetric label="Profit Margin" value={pct(calc.profitMargin)} color="text-gold-600" />
            {input.expectedROI > 0 && <InvMetric label="Expected ROI" value={pct(input.expectedROI)} color="text-emerald-600" />}
            {input.expectedIRR > 0 && <InvMetric label="Expected IRR" value={pct(input.expectedIRR)} color="text-emerald-600" sub="Internal Rate of Return" />}
            {input.numberOfUnits > 0 && <InvMetric label="Cost per Unit" value={R(calc.costPerUnit)} />}
            {preferredReturn > 0 && <InvMetric label="Preferred Return" value={pct(preferredReturn)} color="text-gold-600" sub="Per property" />}
          </div>
        </div>

        {/* Cost Breakdown */}
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-600">
            <Wallet size={14} className="text-gold-500" /> Cost Breakdown
          </h4>
          <div className="space-y-1.5 text-sm">
            {[
              { label: "Land Acquisition", value: input.landAcquisitionCost },
              { label: "Construction (Hard Costs)", value: input.hardCosts },
              { label: "Professional Fees (Soft Costs)", value: input.softCosts },
              { label: "Financing Costs", value: input.financingCosts },
              { label: `Contingency (${input.contingencyPercent}%)`, value: input.contingencyAmount },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between rounded-md bg-navy-800/20 px-3 py-2">
                <span className="text-gray-500">{row.label}</span>
                <span className="font-medium text-gray-900">{R(row.value)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-md bg-gold-500/10 border border-gold-500/20 px-3 py-2 font-semibold">
              <span className="text-gray-900">Total Development Cost</span>
              <span className="text-gold-600">{R(calc.totalCosts)}</span>
            </div>
          </div>
        </div>

        {/* Revenue / Rental Projections */}
        {isResale ? (
          <div>
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-600">
              <TrendingUp size={14} className="text-gold-500" /> Revenue Projections
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <InvMetric label="Sale Price per Unit" value={R(input.expectedSalePricePerUnit)} />
              <InvMetric label="Total Revenue" value={R(input.totalExpectedRevenue)} color="text-emerald-600" />
              {input.preSaleUnits > 0 && <InvMetric label="Pre-Sold Units" value={`${input.preSaleUnits} of ${input.numberOfUnits}`} sub={`${calc.preSalePercentage.toFixed(0)}%`} />}
            </div>
          </div>
        ) : (
          <div>
            <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-600">
              <TrendingUp size={14} className="text-gold-500" /> Rental Projections
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <InvMetric label="Monthly Rent per Unit" value={R(input.expectedMonthlyRentPerUnit)} />
              {calc.annualGrossRentalIncome != null && <InvMetric label="Annual Gross Rental" value={R(calc.annualGrossRentalIncome)} color="text-emerald-600" />}
              {calc.noi != null && <InvMetric label="NOI" value={R(calc.noi)} color={calc.noi >= 0 ? "text-emerald-600" : "text-red-500"} />}
              {calc.calculatedCapRate != null && <InvMetric label="Cap Rate" value={pct(calc.calculatedCapRate)} color="text-gold-600" />}
            </div>
          </div>
        )}

        {/* Profit Distribution Waterfall */}
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-600">
            <TrendingUp size={14} className="text-gold-500" /> Profit Distribution Waterfall
          </h4>
          <div className="rounded-lg border border-navy-700 bg-navy-800/10 p-4">
            <p className="text-xs text-gray-600 mb-3">
              Profits are distributed according to the following waterfall structure:
            </p>
            <ol className="space-y-2 text-xs">
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-500/20 text-xs font-bold text-gold-600">1</span>
                <span className="text-gray-600"><span className="font-semibold text-gray-900">Capital Return</span> — All investor capital is returned first before any profit split.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-500/20 text-xs font-bold text-gold-600">2</span>
                <span className="text-gray-600"><span className="font-semibold text-gray-900">Deposit Recovery</span> — Initial deposits and transaction costs are recovered.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-500/20 text-xs font-bold text-gold-600">3</span>
                <span className="text-gray-600"><span className="font-semibold text-gray-900">Preferred Return ({preferredReturn > 0 ? pct(preferredReturn) : "8–12%"})</span> — Investors receive a preferred return on their capital before the manager participates in profits.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gold-500/20 text-xs font-bold text-gold-600">4</span>
                <span className="text-gray-600"><span className="font-semibold text-gray-900">50/50 Profit Split</span> — Remaining profits after the preferred return are split 50/50 between investors and the fund manager.</span>
              </li>
            </ol>
          </div>

          {/* Key Disclosures */}
          <div className="mt-3 rounded-lg border border-navy-700 bg-navy-800/10 p-4">
            <p className="mb-2 text-xs font-semibold text-gold-600">Key Disclosures:</p>
            <ul className="list-inside list-disc space-y-1 text-xs text-gray-500">
              <li>Management fees of 1–2% per annum may apply during the investment period.</li>
              <li>Promote/carry is only paid after the preferred return hurdle is met.</li>
              <li>Past performance is not indicative of future results. Returns are not guaranteed.</li>
            </ul>
          </div>

          {/* Illustrative Example */}
          <div className="mt-3 rounded-lg border border-navy-700 bg-navy-800/10 p-4">
            <p className="mb-2 text-xs font-semibold text-gold-600">Illustrative Example (R1,000,000 property):</p>
            <ul className="space-y-1 text-xs text-gray-500">
              <li>Total investment: R1,000,000</li>
              <li>Sale price after 3 years: R1,500,000</li>
              <li>Gross profit: R500,000</li>
              <li>Capital returned: R1,000,000 → returned to investors first</li>
              <li>Preferred return (10% × 3yr): R300,000 → paid to investors</li>
              <li>Remaining R200,000 → R100,000 to investors, R100,000 to manager</li>
              <li className="font-medium text-gray-600">Total investor payout: R1,400,000 (capital + R300,000 + R100,000)</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // ── Fallback ─────────────────────────────────────────────────────────────
  return null;
}
