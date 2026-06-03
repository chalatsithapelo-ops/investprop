import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Home, DollarSign, TrendingUp, Plus, ArrowRight } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/rentals/")({
  component: RentalsPage,
});

function RentalsPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const propertiesQuery = useQuery({
    ...trpc.getProperties.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
  });

  const data = propertiesQuery.data as any;
  const allProperties = data?.properties ?? data ?? [];
  const rentals = Array.isArray(allProperties)
    ? allProperties.filter((p: any) => p.type === "rental" || p.type === "RENTAL")
    : [];

  if (!user || !authToken) return null;

  const isManager = ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "PROPERTY_OWNER", "OWNER"].includes(user?.role ?? "");

  if (propertiesQuery.isLoading) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold-500 border-r-transparent"></div>
        </div>
      </div>
    );
  }

  if (propertiesQuery.isError) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="rounded-lg bg-red-50 p-4 text-red-600">
            Failed to load rental properties. Please try again later.
          </div>
        </div>
      </div>
    );
  }

  const totalMonthlyRent = rentals.reduce((sum: number, p: any) => sum + (Number(p.monthlyRent) || 0), 0);
  const occupiedCount = rentals.filter((p: any) => p.status === "RENTED" || p.tenantName).length;
  const occupancyRate = rentals.length > 0 ? ((occupiedCount / rentals.length) * 100) : 0;
  const avgCapRate = rentals.length > 0
    ? rentals.reduce((sum: number, p: any) => sum + (Number(p.capRate) || 0), 0) / rentals.length
    : 0;

  const statCards = [
    { label: "Total Rentals", value: rentals.length, icon: Home, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Monthly Income", value: `R${totalMonthlyRent.toLocaleString()}`, icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Occupancy Rate", value: `${occupancyRate.toFixed(0)}%`, icon: TrendingUp, color: "text-gold-600", bg: "bg-gold-50" },
    { label: "Avg Cap Rate", value: `${avgCapRate.toFixed(1)}%`, icon: TrendingUp, color: "text-purple-600", bg: "bg-purple-50" },
  ];

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-gold-50 p-3">
              <Home className="text-gold-600" size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Rental Properties</h1>
              <p className="mt-1 text-gray-500">Manage your rental portfolio and track income</p>
            </div>
          </div>
          {isManager && (
            <Link
              to="/properties/new"
              search={{ type: "rental" }}
              className="flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600"
            >
              <Plus size={18} /> Add New Rental
            </Link>
          )}
        </div>

        {/* Stats */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card) => (
            <div key={card.label} className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
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

        {/* Rental Cards */}
        {rentals.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-navy-700 py-16 text-center">
            <Home className="mx-auto mb-3 text-gray-600" size={48} />
            <p className="text-lg font-medium text-gray-500">No rental properties yet</p>
            <p className="mt-1 text-sm text-gray-500">Add your first rental to start tracking income</p>
            {isManager && (
              <Link
                to="/properties/new"
                search={{ type: "rental" }}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600"
              >
                <Plus size={16} /> Add New Rental
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {rentals.map((property: any) => {
              const monthlyRent = Number(property.monthlyRent) || 0;
              const annualRent = monthlyRent * 12;
              const purchasePrice = Number(property.rentalPurchasePrice || property.price) || 0;
              const annualExpenses = (Number(property.annualPropertyTax) || 0) +
                (Number(property.annualInsurance) || 0) +
                ((Number(property.monthlyHOAFees) || 0) * 12) +
                ((Number(property.monthlyMaintenanceReserve) || 0) * 12);
              const noi = annualRent - annualExpenses;
              const capRate = purchasePrice > 0 ? ((noi / purchasePrice) * 100) : 0;
              const isOccupied = property.status === "RENTED" || !!property.tenantName;

              return (
                <Link
                  key={property.id}
                  to="/properties/$propertyId"
                  params={{ propertyId: String(property.id) }}
                  className="group rounded-xl border border-navy-800/50 bg-navy-900/50 transition hover:border-gold-300"
                >
                  {/* Image */}
                  {property.imageUrl && (
                    <div className="relative h-48 w-full overflow-hidden rounded-t-xl">
                      <img
                        src={property.imageUrl}
                        alt={property.title}
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                      <div className="absolute right-2 top-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                          isOccupied
                            ? "bg-emerald-500/20 text-emerald-600"
                            : "bg-orange-500/20 text-orange-400"
                        }`}>
                          {isOccupied ? "Occupied" : "Vacant"}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="p-5">
                    <h3 className="text-lg font-semibold text-gray-900 group-hover:text-gold-600">
                      {property.title}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {property.city}{property.city && property.state ? ", " : ""}{property.state}
                    </p>

                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Monthly Rent</span>
                        <span className="font-medium text-emerald-600">R{monthlyRent.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Occupancy</span>
                        <span className={`font-medium ${isOccupied ? "text-emerald-600" : "text-orange-400"}`}>
                          {isOccupied ? "100%" : "0%"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Cap Rate</span>
                        <span className="font-medium text-gold-600">{capRate.toFixed(1)}%</span>
                      </div>
                      <div className="border-t border-navy-700 pt-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-600">NOI</span>
                          <span className={`font-bold ${noi >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            R{noi.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-end text-sm text-gold-600 group-hover:text-gold-500">
                      View Details <ArrowRight size={14} className="ml-1" />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
