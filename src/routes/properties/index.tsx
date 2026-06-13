import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Building,
  Plus,
  Search,
  Filter,
  MapPin,
  TrendingUp,
  ChevronDown,
  X,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { PropertyCard } from "~/components/PropertyCard";
import { RiskDisclaimer } from "~/components/RiskDisclaimer";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/properties/")({
  component: PropertiesPage,
});

function PropertiesPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "flip" | "rental" | "development">("all");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("createdAt_desc");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const role = user?.role ?? "";
  const isManager = role === "ADMIN" || role === "DEVELOPMENT_MANAGER" || role === "PROJECT_MANAGER";

  const propertiesQuery = useQuery({
    ...trpc.getProperties.queryOptions({
      type: typeFilter,
      searchQuery: searchQuery || undefined,
      investmentStatus: statusFilter ? (statusFilter as any) : undefined,
      sortBy: sortBy as any,
      limit: 50,
    }),
    enabled: !!authToken,
  });

  const properties = (propertiesQuery.data as any)?.properties ?? [];

  if (!user || !authToken) return null;

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <RiskDisclaimer variant="compact" />
        </div>
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Building className="text-gold-500" size={32} />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">All Properties</h1>
              <p className="text-sm text-gray-500">
                {properties.length} {properties.length === 1 ? "property" : "properties"} found
              </p>
            </div>
          </div>
          {isManager && (
            <Link
              to="/properties/new"
              className="inline-flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-gold-600"
            >
              <Plus size={16} /> Add Property
            </Link>
          )}
        </div>

        {/* Search & Filters */}
        <div className="mb-6 space-y-3">
          <div className="flex flex-col gap-3 sm:flex-row">
            {/* Search */}
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search properties by name, location..."
                className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-10 pr-4 text-sm focus:border-gold-500 focus:outline-none focus:ring-1 focus:ring-gold-500"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Type filter tabs */}
            <div className="flex rounded-lg border border-gray-300 bg-white">
              {(["all", "flip", "rental", "development"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTypeFilter(t)}
                  className={`px-4 py-2.5 text-sm font-medium capitalize transition ${typeFilter === t ? "bg-gold-500 text-white" : "text-gray-600 hover:bg-gray-50"} ${t === "all" ? "rounded-l-lg" : ""} ${t === "development" ? "rounded-r-lg" : ""}`}
                >
                  {t === "all" ? "All" : t + "s"}
                </button>
              ))}
            </div>

            {/* Toggle filters */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${showFilters ? "border-gold-500 bg-gold-50 text-gold-700" : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              <Filter size={16} /> Filters <ChevronDown size={14} className={`transition ${showFilters ? "rotate-180" : ""}`} />
            </button>
          </div>

          {/* Expanded filters */}
          {showFilters && (
            <div className="flex flex-wrap gap-3 rounded-lg border border-gray-200 bg-white p-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none"
                >
                  <option value="">All Statuses</option>
                  <option value="PLANNING">Planning</option>
                  <option value="RAISING_FUNDS">Raising Funds</option>
                  <option value="FUNDED">Funded</option>
                  <option value="PROJECT_STARTED">Project Started</option>
                  <option value="COMPLETED">Completed</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Sort By</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none"
                >
                  <option value="createdAt_desc">Newest First</option>
                  <option value="createdAt_asc">Oldest First</option>
                  <option value="price_desc">Price: High to Low</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="roi_desc">ROI: High to Low</option>
                  <option value="roi_asc">ROI: Low to High</option>
                </select>
              </div>
              <button
                onClick={() => { setStatusFilter(""); setSortBy("createdAt_desc"); setSearchQuery(""); setTypeFilter("all"); }}
                className="self-end rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
              >
                Clear All
              </button>
            </div>
          )}
        </div>

        {/* Loading */}
        {propertiesQuery.isLoading && (
          <div className="flex justify-center py-16">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold-500 border-r-transparent"></div>
          </div>
        )}

        {/* Properties Grid */}
        {!propertiesQuery.isLoading && properties.length > 0 && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((property: any) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!propertiesQuery.isLoading && properties.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-gray-300 py-16 text-center">
            <Building className="mx-auto mb-4 text-gray-400" size={48} />
            <h3 className="text-lg font-semibold text-gray-700">No properties found</h3>
            <p className="mb-6 text-sm text-gray-500">
              {searchQuery || typeFilter !== "all" || statusFilter
                ? "Try adjusting your filters"
                : "Get started by adding your first property"}
            </p>
            {isManager && !searchQuery && typeFilter === "all" && !statusFilter && (
              <Link
                to="/properties/new"
                className="inline-flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-600"
              >
                <Plus size={16} /> Add Property
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
