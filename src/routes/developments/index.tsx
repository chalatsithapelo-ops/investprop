import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Building, Hammer, DollarSign, Plus, ArrowRight } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/developments/")({
  component: DevelopmentsPage,
});

function DevelopmentsPage() {
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
  const developments = Array.isArray(allProperties)
    ? allProperties.filter((p: any) => p.type === "development" || p.type === "DEVELOPMENT")
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
            Failed to load development projects. Please try again later.
          </div>
        </div>
      </div>
    );
  }

  const totalBudget = developments.reduce((sum: number, p: any) => sum + (Number(p.developmentTotalBudget || p.price) || 0), 0);
  const totalSpent = developments.reduce((sum: number, p: any) => sum + (Number(p.developmentSpent || p.amountSpent) || 0), 0);
  const totalGDV = developments.reduce((sum: number, p: any) => sum + (Number(p.grossDevelopmentValue || p.gdv) || 0), 0);

  const statCards = [
    { label: "Total Projects", value: developments.length, icon: Building, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Total Budget", value: `R${totalBudget.toLocaleString()}`, icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Total Spent", value: `R${totalSpent.toLocaleString()}`, icon: Hammer, color: "text-gold-600", bg: "bg-gold-50" },
    { label: "Total GDV", value: `R${totalGDV.toLocaleString()}`, icon: DollarSign, color: "text-purple-600", bg: "bg-purple-50" },
  ];

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-gold-50 p-3">
              <Building className="text-gold-600" size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Development Projects</h1>
              <p className="mt-1 text-gray-500">Track budgets, progress, and GDV across your developments</p>
            </div>
          </div>
          {isManager && (
            <Link
              to="/properties/new"
              search={{ type: "development" }}
              className="flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600"
            >
              <Plus size={18} /> Add New Development
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

        {/* Development Cards */}
        {developments.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-navy-700 py-16 text-center">
            <Building className="mx-auto mb-3 text-gray-600" size={48} />
            <p className="text-lg font-medium text-gray-500">No development projects yet</p>
            <p className="mt-1 text-sm text-gray-500">Start your first development project</p>
            {isManager && (
              <Link
                to="/properties/new"
                search={{ type: "development" }}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600"
              >
                <Plus size={16} /> Add New Development
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {developments.map((property: any) => {
              const budget = Number(property.developmentTotalBudget || property.price) || 0;
              const spent = Number(property.developmentSpent || property.amountSpent) || 0;
              const remaining = budget - spent;
              const progress = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
              const units = Number(property.totalUnits || property.units) || 0;
              const gdv = Number(property.grossDevelopmentValue || property.gdv) || 0;

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
                          property.status === "COMPLETED"
                            ? "bg-emerald-500/20 text-emerald-600"
                            : property.status === "IN_PROGRESS"
                              ? "bg-gold-500/20 text-gold-600"
                              : "bg-blue-500/20 text-blue-600"
                        }`}>
                          {property.status?.replace(/_/g, " ") ?? "N/A"}
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
                        <span className="text-sm text-gray-500">Total Budget</span>
                        <span className="font-medium text-gray-900">R{budget.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Spent</span>
                        <span className="font-medium text-orange-400">R{spent.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-500">Remaining</span>
                        <span className={`font-medium ${remaining >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          R{remaining.toLocaleString()}
                        </span>
                      </div>

                      {/* Progress Bar */}
                      <div>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-xs text-gray-500">Progress</span>
                          <span className="text-xs font-medium text-gold-600">{progress.toFixed(0)}%</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-navy-800">
                          <div
                            className="h-2 rounded-full bg-gold-500 transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      <div className="border-t border-navy-700 pt-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-500">Units</span>
                          <span className="font-medium text-gray-900">{units || "—"}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-600">GDV</span>
                          <span className="font-bold text-emerald-600">R{gdv.toLocaleString()}</span>
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
