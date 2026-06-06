import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  Building2,
  DollarSign,
  TrendingUp,
  Users,
  Plus,
  Bell,
  ArrowRight,
  Building,
  Briefcase,
  PieChart,
  Wallet,
  BarChart3,
  ClipboardList,
  HardHat,
  Home,
  Send,
  Clock,
  CheckCircle2,
  Gavel,
  Sparkles,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import { VerifyEmailBanner } from "~/components/VerifyEmailBanner";
import { FicaBadge } from "~/components/FicaBadge";
import { AppropriatenessQuestionnaireModal } from "~/components/AppropriatenessQuestionnaireModal";
import { InvestorOnboardingRibbon } from "~/components/InvestorOnboardingRibbon";

export const Route = createFileRoute("/dashboard/")({
  component: DashboardPage,
});

function DashboardPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
    if (user?.role === "CONTRACTOR") navigate({ to: "/contractor-portal" });
  }, [user, authToken, hasHydrated]);

  // Contractors should never see the general dashboard
  if (user?.role === "CONTRACTOR") {
    window.location.href = "/contractor-portal";
    return null;
  }

  const role = user?.role ?? "";
  const isInvestor = role === "INVESTOR";
  const isManager = role === "DEVELOPMENT_MANAGER" || role === "PROJECT_MANAGER";
  const isOwner = role === "PROPERTY_OWNER";
  const isContractor = role === "CONTRACTOR";

  // Shared queries
  const propertiesQuery = useQuery({
    ...trpc.getProperties.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
    placeholderData: keepPreviousData,
  });

  const notificationsQuery = useQuery({
    ...trpc.getNotifications.queryOptions({}),
    enabled: !!authToken,
    placeholderData: keepPreviousData,
  });

  // Investor-specific queries
  const myContributionsQuery = useQuery({
    ...trpc.getMyContributions.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isInvestor,
    placeholderData: keepPreviousData,
  });

  const appropriatenessQuery = useQuery({
    ...trpc.getAppropriatenessStatus.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isInvestor,
  });

  const ficaStatusQuery = useQuery({
    ...trpc.getMyFicaStatus.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isInvestor,
  });

  // Manager-specific queries
  const metricsQuery = useQuery({
    ...trpc.getDevelopmentMetrics.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isManager,
    placeholderData: keepPreviousData,
  });

  const distressedSummaryQuery = useQuery({
    ...trpc.getDistressedDashboardSummary.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isManager,
    placeholderData: keepPreviousData,
  });

  // Owner-specific queries
  const ownerProposalsQuery = useQuery({
    ...trpc.getMySaleProposals.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isOwner,
    placeholderData: keepPreviousData,
  });

  const properties = (propertiesQuery.data as any)?.properties ?? propertiesQuery.data ?? [];
  const notifications = (notificationsQuery.data as any)?.notifications ?? notificationsQuery.data ?? [];
  const myContributions = myContributionsQuery.data as any;
  const metrics = metricsQuery.data as any;
  const ownerProposals = (ownerProposalsQuery.data as any[]) ?? [];

  const propertiesArr = Array.isArray(properties) ? properties : [];
  const notificationsArr = Array.isArray(notifications) ? notifications : [];
  const contributionsArr = Array.isArray(myContributions?.contributions) ? myContributions.contributions : [];

  const isLoading =
    propertiesQuery.isLoading ||
    (isInvestor && myContributionsQuery.isLoading) ||
    (isManager && metricsQuery.isLoading) ||
    (isOwner && ownerProposalsQuery.isLoading);

  // Don't render until auth state is known
  if (!user || !authToken) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold-500 border-r-transparent" />
        </div>
      </div>
    );
  }

  // ─── Investor dashboard data ───
  const investorTotalInvested = myContributions?.totalContributions ?? 0;
  const investorExpectedReturns = myContributions?.totalExpectedReturns ?? 0;
  const investorAvgReturn = myContributions?.averageReturnRate ?? 0;
  const investorPropertyCount = new Set(contributionsArr.map((c: any) => c.propertyId ?? c.property?.id)).size;

  // ─── Manager dashboard data ───
  const totalValue = propertiesArr.reduce((sum: number, p: any) => sum + (Number(p.price) || 0), 0);
  const activeProjects = propertiesArr.filter((p: any) => p.status === "ACTIVE" || p.status === "IN_PROGRESS").length;
  const totalInvestors = metrics?.totalInvestors ?? 0;

  const recentProperties = propertiesArr.slice(0, 5);

  // ─── Owner dashboard data ───
  const ownerPending = ownerProposals.filter((p: any) => p.status === "PENDING" || p.status === "UNDER_REVIEW").length;
  const ownerAccepted = ownerProposals.filter((p: any) => p.status === "ACCEPTED").length;

  // ─── Role-specific stat cards ───
  const investorStats = [
    { label: "Total Invested", value: `R${investorTotalInvested.toLocaleString()}`, icon: Wallet, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Expected Returns", value: `R${investorExpectedReturns.toLocaleString()}`, icon: TrendingUp, color: "text-gold-600", bg: "bg-gold-50" },
    { label: "Avg Return Rate", value: `${investorAvgReturn.toFixed(1)}%`, icon: BarChart3, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Properties Invested", value: investorPropertyCount, icon: Building2, color: "text-purple-600", bg: "bg-purple-50" },
  ];

  const managerStats = [
    { label: "Total Properties", value: propertiesArr.length, icon: Building2, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Portfolio Value", value: `R${totalValue.toLocaleString()}`, icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Active Projects", value: activeProjects, icon: TrendingUp, color: "text-gold-600", bg: "bg-gold-50" },
    { label: "Total Investors", value: totalInvestors, icon: Users, color: "text-purple-600", bg: "bg-purple-50" },
  ];

  const contractorStats = [
    { label: "Assigned Projects", value: activeProjects, icon: HardHat, color: "text-gold-600", bg: "bg-gold-50" },
    { label: "Total Properties", value: propertiesArr.length, icon: Building2, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Active Tasks", value: activeProjects, icon: ClipboardList, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Portfolio Value", value: `R${totalValue.toLocaleString()}`, icon: DollarSign, color: "text-purple-600", bg: "bg-purple-50" },
  ];

  const ownerStats = [
    { label: "Total Proposals", value: ownerProposals.length, icon: Home, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Pending Review", value: ownerPending, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
    { label: "Accepted", value: ownerAccepted, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Total Value", value: `R${ownerProposals.reduce((s: number, p: any) => s + Number(p.askingPrice || 0), 0).toLocaleString()}`, icon: DollarSign, color: "text-gold-600", bg: "bg-gold-50" },
  ];

  const statCards = isInvestor ? investorStats : isOwner ? ownerStats : isContractor ? contractorStats : managerStats;

  // Role label
  const roleLabel = isInvestor
    ? "Here's your investment portfolio overview."
    : isOwner
      ? "Manage your property sale proposals."
      : isContractor
        ? "Here's your project assignments."
        : "Here's your property management overview.";

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {isInvestor && <VerifyEmailBanner />}
        {isInvestor && (
          <InvestorOnboardingRibbon
            emailVerified={!!(user as any).emailVerified || !!(user as any).emailVerifiedAt}
            ficaVerified={!!(user as any).ficaVerified}
            ficaDocsSubmitted={(((ficaStatusQuery.data as any)?.documentsSubmitted) ?? 0) > 0}
            appropriatenessCompleted={!!(appropriatenessQuery.data as any)?.completed}
            hasInvested={contributionsArr.length > 0}
          />
        )}
        {isInvestor && appropriatenessQuery.data && !(appropriatenessQuery.data as any).completed && (
          <AppropriatenessQuestionnaireModal
            open
            onClose={() => { /* gated — stays open until completed */ }}
            onComplete={() => appropriatenessQuery.refetch()}
          />
        )}
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
            <p className="mt-1 text-gray-500">
              Welcome back, {user.name}. {roleLabel}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <span className="inline-block rounded bg-gold-50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-gold-600">
                {role.replace(/_/g, " ")}
              </span>
              {isInvestor && <FicaBadge ficaVerified={(user as any).ficaVerified} />}
            </div>
          </div>
          {isManager && (
            <Link
              to="/properties/new"
              className="flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600"
            >
              <Plus size={18} /> Add Property
            </Link>
          )}
          {isOwner && (
            <Link
              to="/owner-portal"
              className="flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600"
            >
              <Send size={18} /> New Sale Proposal
            </Link>
          )}
          {isInvestor && (
            <Link
              to="/investments/opportunities"
              className="flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600"
            >
              <Briefcase size={18} /> Browse Opportunities
            </Link>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-32">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold-500 border-r-transparent" />
          </div>
        ) : (
        <>
        {/* Stats Cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{card.label}</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{card.value}</p>
                </div>
                <div className={`rounded-lg ${card.bg} p-3`}>
                  <card.icon className={card.color} size={24} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ─── Distressed Finder live tile (managers only) ─── */}
        {isManager && (() => {
          const ds = distressedSummaryQuery.data as any;
          const lastScrapeAt = ds?.lastScrape?.scrapedAt ? new Date(ds.lastScrape.scrapedAt) : null;
          const minsAgo = lastScrapeAt ? Math.round((Date.now() - lastScrapeAt.getTime()) / 60000) : null;
          const fmtAgo = minsAgo === null ? "no scrapes yet" :
            minsAgo < 60 ? `${minsAgo} min ago` :
            minsAgo < 1440 ? `${Math.round(minsAgo / 60)}h ago` :
            `${Math.round(minsAgo / 1440)}d ago`;
          return (
            <Link
              to="/distressed-finder"
              className="mb-8 block rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 via-white to-white p-5 shadow-sm transition hover:border-amber-300 hover:shadow"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4">
                  <div className="rounded-lg bg-amber-100 p-3">
                    <Gavel className="text-amber-700" size={24} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-gray-900">Distressed Property Finder</h2>
                      <span className="rounded-full bg-amber-200/60 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-800">LIVE</span>
                    </div>
                    <p className="mt-0.5 text-sm text-gray-500">
                      Scans 14+ SA auction / distress sites · last scan {fmtAgo}
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 text-center text-sm">
                  <div>
                    <p className="text-2xl font-bold text-gray-900">{ds?.totalActive ?? "—"}</p>
                    <p className="text-xs text-gray-500">Active</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-600">{ds?.upcomingThisWeek ?? "—"}</p>
                    <p className="text-xs text-gray-500">Auctions ≤7d</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-emerald-600 flex items-center justify-center gap-1">
                      <Sparkles size={16} /> {ds?.gradedA_B ?? "—"}
                    </p>
                    <p className="text-xs text-gray-500">AI A/B grade</p>
                  </div>
                  <div className="flex items-center">
                    <ArrowRight className="text-amber-700" size={20} />
                  </div>
                </div>
              </div>
              {ds?.newest && (
                <p className="mt-3 text-xs text-gray-600 border-t border-amber-100 pt-2">
                  <strong className="text-gray-700">Newest:</strong>{" "}
                  {ds.newest.aiGrade && <span className="font-bold text-emerald-700">AI {ds.newest.aiGrade} ·</span>}{" "}
                  {ds.newest.title} ({ds.newest.city}) · R{Number(ds.newest.askingPrice).toLocaleString("en-ZA")}
                </p>
              )}
            </Link>
          );
        })()}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* ─── Investor: My Investments ─── */}
          {isInvestor && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PieChart className="text-gold-600" size={20} />
                  <h2 className="text-lg font-semibold text-gray-900">My Investments</h2>
                </div>
                <Link
                  to="/investments/my-contributions"
                  className="flex items-center gap-1 text-sm text-gold-600 hover:text-gold-500"
                >
                  View All <ArrowRight size={14} />
                </Link>
              </div>

              {contributionsArr.length === 0 ? (
                <div className="py-8 text-center">
                  <Wallet className="mx-auto mb-3 text-gray-600" size={40} />
                  <p className="text-gray-500">No investments yet</p>
                  <Link
                    to="/investments/opportunities"
                    className="mt-2 inline-flex items-center gap-1 text-sm text-gold-600 hover:text-gold-500"
                  >
                    <Briefcase size={14} /> Browse investment opportunities
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {contributionsArr.slice(0, 5).map((contribution: any, idx: number) => {
                    const prop = contribution.property;
                    return (
                      <div
                        key={contribution.id ?? idx}
                        className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 p-4"
                      >
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-emerald-50 p-2">
                            <DollarSign className="text-emerald-600" size={20} />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">
                              {prop?.title ?? "Property Investment"}
                            </p>
                            <p className="text-sm text-gray-500">
                              {prop?.city ?? ""}{prop?.city ? " · " : ""}
                              {new Date(contribution.contributionDate).toLocaleDateString("en-ZA")}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-emerald-600">
                            R{Number(contribution.contributionAmount || 0).toLocaleString()}
                          </p>
                          <p className="text-xs text-gray-500">
                            {contribution.expectedReturnRate?.toFixed(1)}% return
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ─── Owner: My Sale Proposals ─── */}
          {isOwner && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Home className="text-gold-600" size={20} />
                  <h2 className="text-lg font-semibold text-gray-900">My Sale Proposals</h2>
                </div>
                <Link
                  to="/owner-portal"
                  className="flex items-center gap-1 text-sm text-gold-600 hover:text-gold-500"
                >
                  View All <ArrowRight size={14} />
                </Link>
              </div>

              {ownerProposals.length === 0 ? (
                <div className="py-8 text-center">
                  <Home className="mx-auto mb-3 text-gray-300" size={40} />
                  <p className="text-gray-500">No proposals yet</p>
                  <Link
                    to="/owner-portal"
                    className="mt-2 inline-flex items-center gap-1 text-sm text-gold-600 hover:text-gold-500"
                  >
                    <Send size={14} /> Submit your first sale proposal
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {ownerProposals.slice(0, 5).map((proposal: any) => {
                    const statusColors: Record<string, string> = {
                      PENDING: "bg-amber-50 text-amber-600",
                      UNDER_REVIEW: "bg-blue-50 text-blue-600",
                      ACCEPTED: "bg-emerald-50 text-emerald-600",
                      REJECTED: "bg-red-50 text-red-600",
                      WITHDRAWN: "bg-gray-100 text-gray-500",
                    };
                    return (
                      <div
                        key={proposal.id}
                        className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 p-4"
                      >
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-blue-50 p-2">
                            <Home className="text-blue-600" size={20} />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{proposal.title}</p>
                            <p className="text-sm text-gray-500">
                              {proposal.city} · {proposal.saleType} Sale
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">
                            R{Number(proposal.askingPrice || 0).toLocaleString()}
                          </p>
                          <span
                            className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[proposal.status] ?? "bg-gray-100 text-gray-500"}`}
                          >
                            {proposal.status?.replace(/_/g, " ")}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ─── Manager/Contractor: Recent Properties ─── */}
          {(isManager || isContractor) && (
            <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building className="text-gold-600" size={20} />
                  <h2 className="text-lg font-semibold text-gray-900">Recent Properties</h2>
                </div>
                <Link
                  to="/properties"
                  className="flex items-center gap-1 text-sm text-gold-600 hover:text-gold-500"
                >
                  View All <ArrowRight size={14} />
                </Link>
              </div>

              {recentProperties.length === 0 ? (
                <div className="py-8 text-center">
                  <Building2 className="mx-auto mb-3 text-gray-600" size={40} />
                  <p className="text-gray-500">No properties yet</p>
                  <Link
                    to="/properties/new"
                    className="mt-2 inline-flex items-center gap-1 text-sm text-gold-600 hover:text-gold-500"
                  >
                    <Plus size={14} /> Add your first property
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentProperties.map((property: any) => (
                    <Link
                      key={property.id}
                      to="/properties/$propertyId"
                      params={{ propertyId: String(property.id) }}
                      className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 p-4 transition hover:border-gold-300"
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-blue-50 p-2">
                          <Building2 className="text-blue-600" size={20} />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{property.title}</p>
                          <p className="text-sm text-gray-500">
                            {property.city}
                            {property.city && property.type ? " · " : ""}
                            {property.type?.replace(/_/g, " ")}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">
                          R{Number(property.price || 0).toLocaleString()}
                        </p>
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            property.status === "ACTIVE"
                              ? "bg-emerald-50 text-emerald-600"
                              : property.status === "IN_PROGRESS"
                                ? "bg-gold-50 text-gold-600"
                                : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {property.status?.replace(/_/g, " ") ?? "N/A"}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Notifications */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Bell className="text-gold-600" size={20} />
              <h2 className="text-lg font-semibold text-gray-900">Notifications</h2>
            </div>

            {notificationsArr.length === 0 ? (
              <div className="py-8 text-center">
                <Bell className="mx-auto mb-3 text-gray-600" size={32} />
                <p className="text-sm text-gray-500">No new notifications</p>
              </div>
            ) : (
              <div className="space-y-3">
                {notificationsArr.slice(0, 8).map((notification: any, idx: number) => (
                  <div
                    key={notification.id ?? idx}
                    className={`rounded-lg border p-3 ${
                      notification.read
                        ? "border-gray-100 bg-gray-50"
                        : "border-gold-200 bg-gold-50"
                    }`}
                  >
                    <p className="text-sm font-medium text-gray-900">
                      {notification.title ?? notification.message}
                    </p>
                    {notification.body && (
                      <p className="mt-1 text-xs text-gray-500">{notification.body}</p>
                    )}
                    <p className="mt-1 text-xs text-gray-500">
                      {notification.createdAt
                        ? new Date(notification.createdAt).toLocaleDateString("en-ZA")
                        : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        </>
        )}
      </div>
    </div>
  );
}
