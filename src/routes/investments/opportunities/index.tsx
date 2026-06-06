import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Building,
  DollarSign,
  TrendingUp,
  Users,
  Search,
  Filter,
  FileSearch,
  Wallet,
  CheckCircle2,
  PiggyBank,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import { RiskBadge } from "~/components/RiskBadge";

export const Route = createFileRoute("/investments/opportunities/")({
  component: InvestmentOpportunitiesPage,
});

function InvestmentOpportunitiesPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const [searchTerm, setSearchTerm] = useState("");
  const [propertyTypeFilter, setPropertyTypeFilter] = useState("ALL");

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const opportunitiesQuery = useQuery({
    ...trpc.getInvestmentOpportunities.queryOptions({
      authToken: authToken ?? "",
    }),
    enabled: !!authToken,
  });

  const opportunities =
    (opportunitiesQuery.data as any)?.opportunities ??
    (opportunitiesQuery.data as any) ??
    [];
  const opportunitiesArr = Array.isArray(opportunities) ? opportunities : [];

  const propertyTypes = [
    "ALL",
    ...new Set(
      opportunitiesArr.map(
        (o: any) => o.propertyType ?? o.type ?? "Unknown",
      ),
    ),
  ] as string[];

  const filtered = opportunitiesArr.filter((o: any) => {
    const matchesSearch =
      !searchTerm ||
      (o.title ?? o.name ?? "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      (o.location ?? o.address ?? "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
    const matchesType =
      propertyTypeFilter === "ALL" ||
      (o.propertyType ?? o.type) === propertyTypeFilter;
    return matchesSearch && matchesType;
  });

  if (!user || !authToken) return null;

  if (opportunitiesQuery.isLoading) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold-500 border-r-transparent" />
        </div>
      </div>
    );
  }

  if (opportunitiesQuery.isError) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="rounded-lg bg-red-50 p-4 text-red-600">
            Failed to load investment opportunities. Please try again later.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <TrendingUp className="text-gold-600" size={32} />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Investment Opportunities
              </h1>
              <p className="mt-1 text-gray-500">
                Browse and invest in fractional property shares across South
                Africa
              </p>
            </div>
          </div>
        </div>

        {/* How it works strip */}
        <div className="mb-8 rounded-xl border border-gold-200/30 bg-gradient-to-r from-gold-950/20 via-navy-900/40 to-navy-900/40 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gold-500">How investing here works</h2>
            <span className="text-xs text-gray-500">~5 minutes to your first share</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <div className="flex items-start gap-3 rounded-lg bg-navy-900/60 p-3">
              <FileSearch className="mt-0.5 flex-shrink-0 text-gold-400" size={20} />
              <div>
                <p className="text-sm font-semibold text-gray-100">1. Review the deal</p>
                <p className="mt-0.5 text-xs text-gray-400">Open the offer pack, financials, risk rating and exit plan.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg bg-navy-900/60 p-3">
              <CheckCircle2 className="mt-0.5 flex-shrink-0 text-gold-400" size={20} />
              <div>
                <p className="text-sm font-semibold text-gray-100">2. Confirm suitability</p>
                <p className="mt-0.5 text-xs text-gray-400">Pass FICA + quick appropriateness questionnaire (once).</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg bg-navy-900/60 p-3">
              <Wallet className="mt-0.5 flex-shrink-0 text-gold-400" size={20} />
              <div>
                <p className="text-sm font-semibold text-gray-100">3. Fund &amp; commit</p>
                <p className="mt-0.5 text-xs text-gray-400">EFT into the ring-fenced trust account. 5-day cooling-off period.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg bg-navy-900/60 p-3">
              <PiggyBank className="mt-0.5 flex-shrink-0 text-gold-400" size={20} />
              <div>
                <p className="text-sm font-semibold text-gray-100">4. Earn &amp; track</p>
                <p className="mt-0.5 text-xs text-gray-400">Distributions paid to your bank. Sell on the secondary market.</p>
              </div>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            <strong className="text-gray-400">Heads-up:</strong> property is illiquid and returns aren't guaranteed. Read each deal's risk warning before investing.
          </p>
        </div>

        {/* Search & Filter */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row">
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
              size={18}
            />
            <input
              type="text"
              placeholder="Search by property name or location..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-navy-800/50 bg-navy-900/50 py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-500 focus:border-gold-500/50 focus:outline-none focus:ring-1 focus:ring-gold-500/50"
            />
          </div>
          <div className="relative">
            <Filter
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500"
              size={18}
            />
            <select
              value={propertyTypeFilter}
              onChange={(e) => setPropertyTypeFilter(e.target.value)}
              className="appearance-none rounded-lg border border-navy-800/50 bg-navy-900/50 py-2.5 pl-10 pr-8 text-sm text-gray-900 focus:border-gold-500/50 focus:outline-none focus:ring-1 focus:ring-gold-500/50"
            >
              {propertyTypes.map((type) => (
                <option key={type} value={type}>
                  {type === "ALL" ? "All Property Types" : type}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Results Count */}
        <p className="mb-4 text-sm text-gray-500">
          Showing {filtered.length} of {opportunitiesArr.length} opportunities
        </p>

        {/* Opportunity Cards */}
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-12 text-center">
            <Building className="mx-auto mb-3 text-gray-600" size={48} />
            <p className="text-gray-500">
              No investment opportunities match your criteria.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filtered.map((opp: any) => {
              const fundingGoal = Number(opp.fundingGoal ?? opp.price ?? 0);
              const amountRaised = Number(opp.fundingRaised ?? opp.amountRaised ?? opp.funded ?? 0);
              const fundingPct =
                fundingGoal > 0
                  ? Math.min((amountRaised / fundingGoal) * 100, 100)
                  : 0;
              const minInvestment = Number(
                opp.minimumInvestment ?? opp.minInvestment ?? 0,
              );
              const maxInvestors = opp.maxInvestors ?? opp.targetInvestors ?? "—";
              const expectedReturns =
                opp.expectedReturns ?? opp.projectedReturn ?? opp.roi ?? 0;
              const propertyId = opp.id ?? opp.propertyId;

              return (
                <div
                  key={propertyId}
                  className="group overflow-hidden rounded-xl border border-navy-800/50 bg-navy-900/50 transition-all hover:border-gold-300"
                >
                  {/* Image */}
                  <div className="relative h-48 overflow-hidden bg-navy-800/50">
                    {opp.image ?? opp.imageUrl ?? opp.images?.[0] ? (
                      <img
                        src={
                          opp.image ?? opp.imageUrl ?? opp.images?.[0] ?? ""
                        }
                        alt={opp.title ?? opp.name ?? "Property"}
                        className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Building className="text-gray-600" size={48} />
                      </div>
                    )}
                    {opp.propertyType && (
                      <span className="absolute left-3 top-3 rounded-full bg-navy-900/80 px-3 py-1 text-xs font-medium text-gold-600">
                        {opp.propertyType}
                      </span>
                    )}
                    <span className="absolute right-3 top-3">
                      <RiskBadge rating={opp.riskRating ?? "MEDIUM"} />
                    </span>
                  </div>

                  {/* Content */}
                  <div className="p-5">
                    <h3 className="mb-1 text-lg font-semibold text-gray-900">
                      {opp.title ?? opp.name ?? "Untitled Property"}
                    </h3>
                    <p className="mb-4 text-sm text-gray-500">
                      {opp.location ?? opp.address ?? "South Africa"}
                    </p>

                    {/* Funding Progress */}
                    <div className="mb-4">
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-gray-500">Funding Progress</span>
                        <span className="font-medium text-gold-600">
                          {fundingPct.toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-navy-800/50">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-gold-500 to-gold-400 transition-all"
                          style={{ width: `${fundingPct}%` }}
                        />
                      </div>
                      <div className="mt-1 flex justify-between text-xs text-gray-500">
                        <span>R{amountRaised.toLocaleString()} raised</span>
                        <span>R{fundingGoal.toLocaleString()} goal</span>
                      </div>
                    </div>

                    {/* Details Grid */}
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
                          <Users size={12} />
                          Max Investors
                        </div>
                        <p className="mt-0.5 text-sm font-medium text-gray-900">
                          {maxInvestors}
                        </p>
                      </div>
                      <div className="col-span-2 rounded-lg bg-navy-800/30 p-2.5">
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <TrendingUp size={12} />
                          Expected Returns
                        </div>
                        <p className="mt-0.5 text-sm font-medium text-emerald-600">
                          {Number(expectedReturns).toFixed(1)}%
                        </p>
                      </div>
                    </div>

                    {/* CTA */}
                    <Link
                      to={`/investments/opportunities/${propertyId}` as any}
                      className="block w-full rounded-lg bg-gold-500 py-2.5 text-center text-sm font-semibold text-navy-950 transition-colors hover:bg-gold-400"
                    >
                      View Details
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
