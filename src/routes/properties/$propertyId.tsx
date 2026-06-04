import { createFileRoute, Link, useNavigate, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Building, MapPin, DollarSign, Users, BarChart3, Calendar, Edit, ArrowLeft, ChevronLeft, ChevronRight, TrendingUp, AlertTriangle, Clock, Wallet, PiggyBank, Home, Percent, Plus, Trash2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useTRPCClient, useTRPC } from "~/trpc/react";
import toast from "react-hot-toast";
import { Navbar } from "~/components/Navbar";
import { ConfirmModal } from "~/components/ConfirmModal";
import { useAuthStore } from "~/stores/authStore";
import { calculateFlipMetrics, calculateRentalMetrics, calculateDevelopmentMetrics } from "~/financial-calculations";
import type { PropertyFlipInput, RentalPropertyInput, PropertyDevelopmentInput } from "~/financial-calculations";

export const Route = createFileRoute("/properties/$propertyId")({
  component: PropertyLayoutPage,
});

function PropertyLayoutPage() {
  const matchRoute = useMatchRoute();
  const isEditRoute = matchRoute({ to: "/properties/$propertyId/edit" });

  if (isEditRoute) {
    return <Outlet />;
  }

  return <PropertyDetailPage />;
}

function PropertyDetailPage() {
  const { propertyId } = Route.useParams();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const [activeTab, setActiveTab] = useState<"overview" | "financials" | "investors" | "budget" | "timeline">("overview");
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [budgetForm, setBudgetForm] = useState({ category: "", description: "", amount: "" });
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const deletePropertyMutation = useMutation({
    mutationFn: async () => trpcClient.deleteProperty.mutate({ authToken: authToken!, propertyId: Number(propertyId) }),
    onSuccess: () => {
      toast.success("Property deleted");
      queryClient.invalidateQueries({ queryKey: trpc.getProperties.queryKey() });
      navigate({ to: "/dashboard" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete property"),
  });

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const propertyQuery = useQuery({
    ...trpc.getPropertyById.queryOptions({ propertyId: Number(propertyId) }),
    enabled: !!authToken && !!propertyId,
  });

  const data = propertyQuery.data as any;

  if (!user || !authToken) return null;

  if (propertyQuery.isLoading) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold-500 border-r-transparent"></div>
        </div>
      </div>
    );
  }

  if (propertyQuery.isError || !data) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="mx-auto max-w-7xl px-4 py-8">
          <div className="rounded-lg bg-red-50 p-4 text-red-600">
            Failed to load property details. The property may not exist.
          </div>
          <Link to="/dashboard" className="mt-4 inline-flex items-center gap-2 text-gold-600 hover:text-gold-500">
            <ArrowLeft size={16} /> Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const property = data.property ?? data;
  const images: string[] = property.imageUrls?.length ? property.imageUrls : property.imageUrl ? [property.imageUrl] : [];
  const budgetEntries = property.budgetEntries ?? property.budget ?? [];
  const milestones = property.milestones ?? property.timeline ?? [];
  const investors = property.investorContributions ?? property.investors ?? property.contributions ?? [];
  const fundingGoal = Number(property.fundingGoal || property.price) || 0;
  const amountRaised = Number(property.fundingRaised ?? property.amountRaised ?? property.totalRaised ?? 0);
  const fundingProgress = fundingGoal > 0 ? Math.min((amountRaised / fundingGoal) * 100, 100) : 0;

  const isManager = ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "PROPERTY_OWNER", "OWNER"].includes(user?.role ?? "");

  const tabs = [
    { key: "overview" as const, label: "Overview", icon: Building },
    { key: "financials" as const, label: "Financials", icon: BarChart3 },
    { key: "investors" as const, label: "Investors", icon: Users },
    { key: "budget" as const, label: "Budget", icon: DollarSign },
    { key: "timeline" as const, label: "Timeline", icon: Calendar },
  ];

  // Derive property type from related models
  const derivedType = property.propertyFlip ? "flip" : property.rentalBond ? "rental" : property.propertyDevelopment ? "development" : "unknown";

  const typeBadgeColor = derivedType === "flip"
    ? "bg-orange-500/20 text-orange-400"
    : derivedType === "rental"
      ? "bg-blue-500/20 text-blue-600"
      : "bg-purple-500/20 text-purple-600";

  const statusBadgeColor = property.status === "COMPLETED" || property.status === "SOLD"
    ? "bg-emerald-500/20 text-emerald-600"
    : property.status === "IN_PROGRESS"
      ? "bg-gold-500/20 text-gold-600"
      : property.status === "RENTED"
        ? "bg-blue-500/20 text-blue-600"
        : "bg-gray-500/20 text-gray-500";

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back + Edit */}
        <div className="mb-6 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2 text-gray-500 hover:text-gray-900">
            <ArrowLeft size={18} /> Back
          </Link>
          {isManager && (
            <div className="flex items-center gap-2">
              <Link
                to="/properties/$propertyId/edit"
                params={{ propertyId }}
                className="flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600"
              >
                <Edit size={16} /> Edit Property
              </Link>
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="flex items-center gap-2 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
              >
                <Trash2 size={16} /> Delete
              </button>
            </div>
          )}
        </div>
        <ConfirmModal
          open={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={() => deletePropertyMutation.mutate()}
          title="Delete this property?"
          message={<span>This permanently removes <strong>{property.title}</strong>, its financials, milestones, and budget entries. Any active investors will be notified. This cannot be undone.</span>}
          confirmLabel="Delete permanently"
          tone="danger"
          loading={deletePropertyMutation.isPending}
        />

        {/* Image Carousel */}
        {images.length > 0 && (
          <div className="relative mb-8 h-72 w-full overflow-hidden rounded-xl sm:h-96">
            <img
              src={images[currentImageIndex]}
              alt={property.title}
              className="h-full w-full object-cover"
            />
            {images.length > 1 && (
              <>
                <button
                  onClick={() => setCurrentImageIndex((i) => (i === 0 ? images.length - 1 : i - 1))}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-gray-900 hover:bg-black/70"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => setCurrentImageIndex((i) => (i === images.length - 1 ? 0 : i + 1))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 text-gray-900 hover:bg-black/70"
                >
                  <ChevronRight size={20} />
                </button>
                <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
                  {images.map((_: string, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentImageIndex(idx)}
                      className={`h-2 w-2 rounded-full transition ${idx === currentImageIndex ? "bg-gold-500" : "bg-white/50"}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* Title + Badges */}
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold text-gray-900">{property.title}</h1>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${typeBadgeColor}`}>
              {derivedType.toUpperCase()}
            </span>
            <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusBadgeColor}`}>
              {(property.status || "N/A").replace(/_/g, " ")}
            </span>
          </div>
          {(property.city || property.address) && (
            <div className="mt-2 flex items-center gap-1 text-gray-500">
              <MapPin size={16} />
              <span>{[property.address, property.city, property.state].filter(Boolean).join(", ")}</span>
            </div>
          )}
          <p className="mt-2 text-2xl font-bold text-gold-600">R{Number(property.price || 0).toLocaleString()}</p>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 overflow-x-auto rounded-lg bg-navy-900/50 p-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition ${
                activeTab === tab.key
                  ? "bg-gold-500 text-white"
                  : "text-gray-500 hover:bg-navy-800/50 hover:text-gray-900"
              }`}
            >
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
          {activeTab === "overview" && (
            <div className="space-y-6">
              {property.description && (
                <div>
                  <h3 className="mb-2 text-lg font-semibold text-gray-900">Description</h3>
                  <p className="text-gray-500 leading-relaxed">{property.description}</p>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {property.bedrooms != null && (
                  <div className="rounded-lg border border-navy-700 p-4">
                    <p className="text-sm text-gray-500">Bedrooms</p>
                    <p className="mt-1 text-xl font-bold text-gray-900">{property.bedrooms}</p>
                  </div>
                )}
                {property.bathrooms != null && (
                  <div className="rounded-lg border border-navy-700 p-4">
                    <p className="text-sm text-gray-500">Bathrooms</p>
                    <p className="mt-1 text-xl font-bold text-gray-900">{property.bathrooms}</p>
                  </div>
                )}
                {property.squareMeters != null && (
                  <div className="rounded-lg border border-navy-700 p-4">
                    <p className="text-sm text-gray-500">Size</p>
                    <p className="mt-1 text-xl font-bold text-gray-900">{property.squareMeters} m²</p>
                  </div>
                )}
                <div className="rounded-lg border border-navy-700 p-4">
                  <p className="text-sm text-gray-500">Type</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{derivedType.charAt(0).toUpperCase() + derivedType.slice(1)}</p>
                </div>
                <div className="rounded-lg border border-navy-700 p-4">
                  <p className="text-sm text-gray-500">Status</p>
                  <p className="mt-1 text-xl font-bold text-gray-900">{(property.status || "N/A").replace(/_/g, " ")}</p>
                </div>
                {property.investmentStatus && (
                  <div className="rounded-lg border border-navy-700 p-4">
                    <p className="text-sm text-gray-500">Investment Status</p>
                    <p className="mt-1 text-xl font-bold text-gray-900">{property.investmentStatus.replace(/_/g, " ")}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "financials" && (
            <FinancialsTab property={property} />
          )}

          {activeTab === "investors" && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900">Investor Contributions</h3>

              {/* Funding Progress */}
              <div className="rounded-lg border border-navy-700 p-5">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-gray-500">Funding Goal</span>
                  <span className="text-lg font-bold text-gray-900">R{fundingGoal.toLocaleString()}</span>
                </div>
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-gray-500">Amount Raised</span>
                  <span className="text-lg font-bold text-emerald-600">R{amountRaised.toLocaleString()}</span>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs text-gray-500">Progress</span>
                    <span className="text-xs font-medium text-gold-600">{fundingProgress.toFixed(1)}%</span>
                  </div>
                  <div className="h-3 w-full rounded-full bg-navy-800">
                    <div
                      className="h-3 rounded-full bg-gold-500 transition-all"
                      style={{ width: `${fundingProgress}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Investor List */}
              {Array.isArray(investors) && investors.length > 0 ? (
                <div className="space-y-3">
                  {investors.map((investor: any, idx: number) => (
                    <div key={investor.id ?? idx} className="flex items-center justify-between rounded-lg border border-navy-700 p-4">
                      <div>
                        <p className="font-medium text-gray-900">{investor.investor?.name || investor.name || investor.investorName || `Investor ${idx + 1}`}</p>
                        <p className="text-sm text-gray-500">{investor.investor?.email || investor.email || investor.investorEmail || ""}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-emerald-600">R{Number(investor.contributionAmount || investor.amount || investor.contribution || 0).toLocaleString()}</p>
                        {investor.date || investor.createdAt ? (
                          <p className="text-xs text-gray-500">{new Date(investor.date || investor.createdAt).toLocaleDateString("en-ZA")}</p>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <Users className="mx-auto mb-3 text-gray-600" size={40} />
                  <p className="text-gray-500">No investor contributions yet</p>
                </div>
              )}
            </div>
          )}

          {activeTab === "budget" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Budget Entries</h3>
                {isManager && (
                  <button onClick={() => setShowBudgetForm(!showBudgetForm)} className="flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-medium text-white hover:bg-gold-600 transition-colors">
                    <Plus className="h-4 w-4" /> Add Entry
                  </button>
                )}
              </div>

              {showBudgetForm && (
                <div className="rounded-xl border border-gray-200 bg-white p-5">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                      <select value={budgetForm.category} onChange={(e) => setBudgetForm({ ...budgetForm, category: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-black">
                        <option value="">Select category...</option>
                        <option value="MATERIALS">Materials</option>
                        <option value="LABOUR">Labour</option>
                        <option value="PERMITS">Permits</option>
                        <option value="LEGAL">Legal</option>
                        <option value="MARKETING">Marketing</option>
                        <option value="TRANSFER_COSTS">Transfer Costs</option>
                        <option value="RENOVATION">Renovation</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                      <input value={budgetForm.description} onChange={(e) => setBudgetForm({ ...budgetForm, description: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-black" placeholder="Brief description" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Amount (R) *</label>
                      <input type="number" value={budgetForm.amount} onChange={(e) => setBudgetForm({ ...budgetForm, amount: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-black" placeholder="0" />
                    </div>
                  </div>
                  <div className="mt-4 flex gap-3">
                    <button
                      onClick={async () => {
                        if (!budgetForm.category || !budgetForm.description || !budgetForm.amount) { toast.error("Please fill all fields"); return; }
                        try {
                          await trpcClient.createBudgetEntry.mutate({ authToken: authToken!, propertyId: Number(propertyId), category: budgetForm.category, description: budgetForm.description, amount: Number(budgetForm.amount) });
                          toast.success("Budget entry added");
                          setBudgetForm({ category: "", description: "", amount: "" });
                          setShowBudgetForm(false);
                          queryClient.invalidateQueries({ queryKey: trpc.getPropertyById.queryKey() });
                        } catch (e: any) { toast.error(e.message || "Failed to add budget entry"); }
                      }}
                      className="rounded-lg bg-gold-500 px-6 py-2 text-sm font-medium text-white hover:bg-gold-600"
                    >Save</button>
                    <button onClick={() => setShowBudgetForm(false)} className="rounded-lg border border-gray-300 px-6 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
                  </div>
                </div>
              )}

              {Array.isArray(budgetEntries) && budgetEntries.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-navy-700">
                        <th className="pb-3 text-left text-sm font-medium text-gray-500">Category</th>
                        <th className="pb-3 text-left text-sm font-medium text-gray-500">Description</th>
                        <th className="pb-3 text-left text-sm font-medium text-gray-500">Recorded By</th>
                        <th className="pb-3 text-left text-sm font-medium text-gray-500">Date</th>
                        <th className="pb-3 text-right text-sm font-medium text-gray-500">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-navy-800">
                      {budgetEntries.map((entry: any, idx: number) => (
                        <tr key={entry.id ?? idx}>
                          <td className="py-3 text-sm text-gray-900">
                            <span className="inline-block rounded bg-gold-50 px-2 py-0.5 text-xs font-medium text-gold-700">
                              {(entry.category || "Uncategorised").replace(/_/g, " ")}
                            </span>
                          </td>
                          <td className="py-3 text-sm text-gray-500">
                            {entry.description || "—"}
                            {entry.milestone?.name && (
                              <span className="ml-2 text-xs text-blue-500">({entry.milestone.name})</span>
                            )}
                          </td>
                          <td className="py-3 text-sm text-gray-500">{entry.recordedBy?.name || "—"}</td>
                          <td className="py-3 text-sm text-gray-500">
                            {entry.dateRecorded ? new Date(entry.dateRecorded).toLocaleDateString("en-ZA") : "—"}
                          </td>
                          <td className="py-3 text-right text-sm font-medium text-gray-900">
                            R{Number(entry.amount || 0).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-navy-700">
                        <td colSpan={4} className="pt-3 text-sm font-semibold text-gray-600">Total</td>
                        <td className="pt-3 text-right text-sm font-bold text-gold-600">
                          R{budgetEntries.reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0).toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center">
                  <DollarSign className="mx-auto mb-3 text-gray-600" size={40} />
                  <p className="text-gray-500">No budget entries yet</p>
                </div>
              )}
            </div>
          )}

          {activeTab === "timeline" && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-gray-900">Project Timeline</h3>

              {Array.isArray(milestones) && milestones.length > 0 ? (
                <div className="relative space-y-0">
                  {milestones.map((milestone: any, idx: number) => {
                    const isCompleted = milestone.status === "COMPLETED" || milestone.completed;
                    const isInProgress = milestone.status === "IN_PROGRESS";

                    return (
                      <div key={milestone.id ?? idx} className="relative flex gap-4 pb-8 last:pb-0">
                        {/* Vertical line */}
                        {idx < milestones.length - 1 && (
                          <div className="absolute left-[15px] top-8 h-full w-0.5 bg-navy-700" />
                        )}
                        {/* Status dot */}
                        <div className={`relative z-10 mt-1 h-8 w-8 shrink-0 rounded-full border-2 flex items-center justify-center ${
                          isCompleted
                            ? "border-emerald-500 bg-emerald-500/20"
                            : isInProgress
                              ? "border-gold-500 bg-gold-500/20"
                              : "border-gray-600 bg-navy-800"
                        }`}>
                          <div className={`h-2.5 w-2.5 rounded-full ${
                            isCompleted ? "bg-emerald-400" : isInProgress ? "bg-gold-400" : "bg-gray-500"
                          }`} />
                        </div>
                        {/* Content */}
                        <div className="flex-1 rounded-lg border border-navy-700 p-4">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-gray-900">{milestone.title || milestone.name}</p>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              isCompleted
                                ? "bg-emerald-500/20 text-emerald-600"
                                : isInProgress
                                  ? "bg-gold-500/20 text-gold-600"
                                  : "bg-gray-500/20 text-gray-500"
                            }`}>
                              {isCompleted ? "Completed" : isInProgress ? "In Progress" : "Pending"}
                            </span>
                          </div>
                          {milestone.description && (
                            <p className="mt-1 text-sm text-gray-500">{milestone.description}</p>
                          )}
                          {(milestone.estimatedStartDate || milestone.estimatedCompletionDate) && (
                            <p className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                              <Calendar size={12} />
                              {milestone.estimatedStartDate && new Date(milestone.estimatedStartDate).toLocaleDateString("en-ZA")}
                              {milestone.estimatedStartDate && milestone.estimatedCompletionDate && " → "}
                              {milestone.estimatedCompletionDate && new Date(milestone.estimatedCompletionDate).toLocaleDateString("en-ZA")}
                            </p>
                          )}
                          {milestone.budgetAllocated > 0 && (
                            <p className="mt-1 text-xs text-gray-500">
                              Budget: R{Number(milestone.budgetAllocated).toLocaleString()}
                              {milestone.budgetSpent > 0 && ` (R${Number(milestone.budgetSpent).toLocaleString()} spent)`}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <Calendar className="mx-auto mb-3 text-gray-600" size={40} />
                  <p className="text-gray-500">No milestones yet</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Reusable helpers for the financials tab
// ============================================================================

function MetricCard({ label, value, color = "text-gray-900", sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-navy-700 bg-navy-800/20 p-4">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-bold ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

function SectionHeading({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-navy-700 pb-2">
      <Icon size={18} className="text-gold-500" />
      <h4 className="text-sm font-semibold uppercase tracking-wider text-gray-600">{title}</h4>
    </div>
  );
}

const R = (n: number) => `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const pct = (n: number) => `${n.toFixed(1)}%`;

// ============================================================================
// Comprehensive Financials Tab
// ============================================================================

function FinancialsTab({ property }: { property: any }) {
  // Derive type from presence of related models (Property model doesn't have a type field)
  const isFlip = !!property.propertyFlip;
  const isRental = !!property.rentalBond;
  const isDevelopment = !!property.propertyDevelopment;

  const preferredReturn = Number(property.expectedReturns ?? 0);

  // ── Flip Financials ──────────────────────────────────────────────────────
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
    const roiAfterFees = calc.totalInvestment > 0 ? (profitAfterFees / calc.totalInvestment) * 100 : 0;

    return (
      <div className="space-y-8">
        {/* Overview Banner */}
        <div className="rounded-xl bg-gradient-to-r from-orange-500/10 to-gold-500/10 border border-orange-500/20 p-5">
          <div className="flex items-center gap-3 mb-3">
            <TrendingUp className="text-orange-500" size={22} />
            <h3 className="text-lg font-bold text-gray-900">Flip Investment Summary</h3>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            This is a <span className="font-semibold text-orange-600">fix-and-flip</span> property.
            The strategy is to purchase, renovate, and sell as soon as possible — not a long-term hold.
            {input.daysToComplete > 0 && ` Target turnaround: ${input.daysToComplete} days.`}
            {preferredReturn > 0 && ` Preferred investor return: ${pct(preferredReturn)}.`}
          </p>
        </div>

        {/* Key Headline Metrics */}
        <div>
          <SectionHeading icon={BarChart3} title="Key Metrics" />
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <MetricCard label="Total Investment" value={R(calc.totalInvestment)} color="text-gray-900" sub="All-in cost to acquire & renovate" />
            <MetricCard label="After Repair Value (ARV)" value={R(input.afterRepairValue || input.estimatedValue)} color="text-emerald-600" sub="Estimated market value after renovation" />
            <MetricCard label="Expected Profit" value={R(calc.expectedProfit)} color={calc.expectedProfit >= 0 ? "text-emerald-600" : "text-red-500"} sub="ARV − Total Investment − Selling Costs" />
            <MetricCard label="Return on Investment" value={pct(calc.displayROI)} color="text-gold-600" sub="Profit ÷ Total Investment" />
            <MetricCard label="Break-Even Price" value={R(calc.breakEvenPrice)} color="text-gray-900" sub="Minimum sale price to break even" />
            {input.daysToComplete > 0 && (
              <MetricCard label="Target Timeline" value={`${input.daysToComplete} days`} color="text-blue-600" sub="Expected project duration" />
            )}
            {preferredReturn > 0 && (
              <MetricCard label="Preferred Return" value={pct(preferredReturn)} color="text-gold-600" sub="Target return for investors" />
            )}
            {input.expectedProfitMargin > 0 && (
              <MetricCard label="Profit Margin" value={pct(input.expectedProfitMargin)} color="text-emerald-600" sub="Profit as % of sale price" />
            )}
          </div>
        </div>

        {/* Cost Breakdown */}
        <div>
          <SectionHeading icon={Wallet} title="Cost Breakdown" />
          <div className="mt-3 overflow-hidden rounded-lg border border-navy-700">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-navy-800/50">
                <tr className="bg-navy-800/10">
                  <td className="px-4 py-3 text-gray-600">Purchase Price</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{R(input.purchasePrice)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-gray-600">Renovation Budget</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{R(input.renovationBudget)}</td>
                </tr>
                {input.estimatedRepairCosts > 0 && input.estimatedRepairCosts !== input.renovationBudget && (
                  <tr className="bg-navy-800/10">
                    <td className="px-4 py-3 text-gray-600">Estimated Repair Costs</td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{R(input.estimatedRepairCosts)}</td>
                  </tr>
                )}
                <tr>
                  <td className="px-4 py-3 text-gray-600">Holding Costs</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{R(input.holdingCosts)}</td>
                </tr>
                <tr className="bg-navy-800/10">
                  <td className="px-4 py-3 text-gray-600">Closing Costs (Purchase)</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{R(input.closingCostsPurchase)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-gray-600">Closing Costs (Sale)</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{R(input.closingCostsSale)}</td>
                </tr>
                <tr className="border-t-2 border-navy-700 bg-navy-800/30">
                  <td className="px-4 py-3 font-semibold text-gray-900">Total Investment</td>
                  <td className="px-4 py-3 text-right font-bold text-gold-600">{R(calc.totalInvestment)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Management Fee & Net Returns */}
        <div>
          <SectionHeading icon={PiggyBank} title="Management Fee & Net Returns" />
          <div className="mt-3 rounded-lg border border-navy-700 bg-navy-800/10 p-4 space-y-3">
            <p className="text-sm text-gray-600">
              A <span className="font-semibold text-gray-900">2% management fee</span> is charged per property (flat fee on total investment, not annual).
              This covers project management, contractor oversight, and administrative costs.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <MetricCard label="Management Fee (2%)" value={R(managementFee)} color="text-orange-500" sub="Per-property flat fee" />
              <MetricCard label="Net Profit After Fees" value={R(profitAfterFees)} color={profitAfterFees >= 0 ? "text-emerald-600" : "text-red-500"} />
              <MetricCard label="Net ROI After Fees" value={pct(roiAfterFees)} color={roiAfterFees >= 0 ? "text-emerald-600" : "text-red-500"} />
            </div>
          </div>
        </div>

        {/* Max Offer Analysis */}
        {input.maxOfferPrice > 0 && (
          <div>
            <SectionHeading icon={AlertTriangle} title="Offer Analysis" />
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <MetricCard label="Maximum Offer Price" value={R(input.maxOfferPrice)} color="text-orange-500" sub="Highest price to maintain target returns" />
              <MetricCard label="Current Purchase Price" value={R(input.purchasePrice)} color={input.purchasePrice <= input.maxOfferPrice ? "text-emerald-600" : "text-red-500"} sub={input.purchasePrice <= input.maxOfferPrice ? "Within target — good deal" : "Above max offer — review needed"} />
            </div>
          </div>
        )}

        {/* Budget Tracker */}
        {input.totalInvestmentBudget > 0 && (
          <div>
            <SectionHeading icon={DollarSign} title="Budget Tracker" />
            <div className="mt-3 rounded-lg border border-navy-700 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500">Budget Spent</span>
                <span className="text-sm font-medium text-gray-900">{R(input.spentInvestmentBudget)} / {R(input.totalInvestmentBudget)}</span>
              </div>
              <div className="h-3 rounded-full bg-navy-800">
                <div
                  className={`h-3 rounded-full transition-all ${input.spentInvestmentBudget > input.totalInvestmentBudget ? "bg-red-500" : "bg-gold-500"}`}
                  style={{ width: `${Math.min((input.spentInvestmentBudget / input.totalInvestmentBudget) * 100, 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {((input.spentInvestmentBudget / input.totalInvestmentBudget) * 100).toFixed(1)}% utilised
                {input.spentInvestmentBudget > input.totalInvestmentBudget && " — over budget!"}
              </p>
            </div>
          </div>
        )}

        {/* Investor Waterfall */}
        <div>
          <SectionHeading icon={TrendingUp} title="Profit Distribution Waterfall" />
          <div className="mt-3 rounded-lg border border-navy-700 bg-navy-800/10 p-4">
            <p className="text-sm text-gray-600 mb-3">
              Profits are distributed according to the following waterfall structure:
            </p>
            <ol className="space-y-2 text-sm">
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

  // ── Rental Financials ────────────────────────────────────────────────────
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
      <div className="space-y-8">
        {/* Overview Banner */}
        <div className="rounded-xl bg-gradient-to-r from-blue-500/10 to-gold-500/10 border border-blue-500/20 p-5">
          <div className="flex items-center gap-3 mb-3">
            <Home className="text-blue-500" size={22} />
            <h3 className="text-lg font-bold text-gray-900">Rental Investment Summary</h3>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            This is a <span className="font-semibold text-blue-600">buy-and-hold rental</span> property generating monthly income.
            {input.monthlyRent > 0 && ` Current monthly rent: ${R(input.monthlyRent)}.`}
            {preferredReturn > 0 && ` Preferred investor return: ${pct(preferredReturn)}.`}
            {input.appreciationRate > 0 && ` Expected annual appreciation: ${pct(input.appreciationRate)}.`}
          </p>
        </div>

        {/* Key Metrics */}
        <div>
          <SectionHeading icon={BarChart3} title="Key Performance Metrics" />
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <MetricCard label="Monthly Rent" value={R(input.monthlyRent)} color="text-emerald-600" sub="Gross rental income" />
            <MetricCard label="Annual Gross Rent" value={R(calc.annualGrossRent)} color="text-emerald-600" />
            <MetricCard label="Vacancy Loss" value={R(calc.vacancyLoss)} color="text-red-400" sub={`At ${input.vacancyRate}% vacancy rate`} />
            <MetricCard label="Effective Gross Income" value={R(calc.effectiveGrossIncome)} color="text-gray-900" sub="After vacancy adjustment" />
            <MetricCard label="Operating Expenses" value={R(calc.annualOperatingExpenses)} color="text-orange-500" sub="Annual total" />
            <MetricCard label="Net Operating Income (NOI)" value={R(calc.noi)} color={calc.noi >= 0 ? "text-emerald-600" : "text-red-500"} sub="EGI minus operating expenses" />
            <MetricCard label="Cap Rate" value={pct(calc.displayCapRate)} color="text-gold-600" sub="NOI ÷ Purchase Price" />
            <MetricCard label="Monthly Cash Flow" value={R(calc.monthlyCashFlow)} color={calc.monthlyCashFlow >= 0 ? "text-emerald-600" : "text-red-500"} sub="After debt service" />
          </div>
        </div>

        {/* Yield & Return Analysis */}
        <div>
          <SectionHeading icon={TrendingUp} title="Yield & Return Analysis" />
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MetricCard label="Gross Yield" value={pct(calc.grossYield)} color="text-gold-600" sub="Annual rent ÷ purchase price" />
            <MetricCard label="Net Yield" value={pct(calc.netYield)} color="text-gold-600" sub="NOI ÷ purchase price" />
            <MetricCard label="Cash-on-Cash Return" value={pct(calc.cashOnCashReturn)} color="text-emerald-600" sub="Cash flow ÷ cash invested" />
            {preferredReturn > 0 && (
              <MetricCard label="Preferred Return" value={pct(preferredReturn)} color="text-gold-600" sub="Target investor return" />
            )}
            {input.appreciationRate > 0 && (
              <MetricCard label="Appreciation Rate" value={pct(input.appreciationRate)} color="text-blue-600" sub="Expected annual growth" />
            )}
            {input.grossRentMultiplier > 0 && (
              <MetricCard label="Gross Rent Multiplier" value={input.grossRentMultiplier.toFixed(1)} color="text-gray-900" sub="Purchase price ÷ annual rent" />
            )}
          </div>
        </div>

        {/* Operating Expenses Breakdown */}
        <div>
          <SectionHeading icon={Wallet} title="Operating Expenses Breakdown" />
          <div className="mt-3 overflow-hidden rounded-lg border border-navy-700">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-navy-800/50">
                <tr className="bg-navy-800/10">
                  <td className="px-4 py-3 text-gray-600">Annual Property Tax</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{R(input.annualPropertyTax)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-gray-600">Annual Insurance</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{R(input.annualInsurance)}</td>
                </tr>
                <tr className="bg-navy-800/10">
                  <td className="px-4 py-3 text-gray-600">HOA Fees</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{R(input.monthlyHOAFees)}/mo ({R(input.monthlyHOAFees * 12)}/yr)</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-gray-600">Maintenance Reserve</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{R(input.monthlyMaintenanceReserve)}/mo ({R(input.monthlyMaintenanceReserve * 12)}/yr)</td>
                </tr>
                <tr className="bg-navy-800/10">
                  <td className="px-4 py-3 text-gray-600">Utilities</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{R(input.monthlyUtilities)}/mo ({R(input.monthlyUtilities * 12)}/yr)</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-gray-600">Property Management Fee</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{R(input.monthlyManagementFee)}/mo ({R(input.monthlyManagementFee * 12)}/yr)</td>
                </tr>
                <tr className="border-t-2 border-navy-700 bg-navy-800/30">
                  <td className="px-4 py-3 font-semibold text-gray-900">Total Annual Operating Expenses</td>
                  <td className="px-4 py-3 text-right font-bold text-gold-600">{R(calc.annualOperatingExpenses)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Financing Details */}
        {input.loanAmount > 0 && (
          <div>
            <SectionHeading icon={PiggyBank} title="Financing Details" />
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <MetricCard label="Purchase Price" value={R(input.purchasePrice)} />
              <MetricCard label="Down Payment" value={R(input.downPaymentAmount)} sub={input.purchasePrice > 0 ? `${((input.downPaymentAmount / input.purchasePrice) * 100).toFixed(0)}% of purchase price` : undefined} />
              <MetricCard label="Loan Amount" value={R(input.loanAmount)} color="text-orange-500" />
              {input.interestRate > 0 && <MetricCard label="Interest Rate" value={pct(input.interestRate)} />}
              {input.loanTermYears > 0 && <MetricCard label="Loan Term" value={`${input.loanTermYears} years`} />}
              {input.monthlyDebtService > 0 && <MetricCard label="Monthly Bond Payment" value={R(input.monthlyDebtService)} color="text-orange-500" sub="Principal & Interest" />}
              {input.debtServiceCoverageRatio > 0 && <MetricCard label="DSCR" value={input.debtServiceCoverageRatio.toFixed(2)} color={input.debtServiceCoverageRatio >= 1.25 ? "text-emerald-600" : "text-red-500"} sub={input.debtServiceCoverageRatio >= 1.25 ? "Healthy coverage" : "Below 1.25 — review risk"} />}
            </div>
          </div>
        )}

        {/* Tenant Info */}
        {(rental.tenantName || rental.leaseStartDate) && (
          <div>
            <SectionHeading icon={Users} title="Tenant Information" />
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {rental.tenantName && <MetricCard label="Tenant Name" value={rental.tenantName} />}
              {rental.tenantEmail && <MetricCard label="Tenant Email" value={rental.tenantEmail} />}
              {rental.leaseStartDate && <MetricCard label="Lease Start" value={new Date(rental.leaseStartDate).toLocaleDateString("en-ZA")} />}
              {rental.leaseEndDate && <MetricCard label="Lease End" value={new Date(rental.leaseEndDate).toLocaleDateString("en-ZA")} />}
            </div>
          </div>
        )}

        {/* Profit Distribution Waterfall */}
        <div>
          <SectionHeading icon={TrendingUp} title="Profit Distribution Waterfall" />
          <div className="mt-3 rounded-lg border border-navy-700 bg-navy-800/10 p-4">
            <p className="text-sm text-gray-600 mb-3">
              Profits are distributed according to the following waterfall structure:
            </p>
            <ol className="space-y-2 text-sm">
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

  // ── Development Financials ───────────────────────────────────────────────
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
      <div className="space-y-8">
        {/* Overview Banner */}
        <div className="rounded-xl bg-gradient-to-r from-purple-500/10 to-gold-500/10 border border-purple-500/20 p-5">
          <div className="flex items-center gap-3 mb-3">
            <Building className="text-purple-500" size={22} />
            <h3 className="text-lg font-bold text-gray-900">Development Investment Summary</h3>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            This is a <span className="font-semibold text-purple-600">{devLabel.toLowerCase()}</span> development
            {input.numberOfUnits > 0 && ` comprising ${input.numberOfUnits} units`}
            {input.totalSquareMeters > 0 && ` across ${input.totalSquareMeters.toLocaleString()} m²`}.
            {input.developmentTimelineMonths > 0 && ` Estimated timeline: ${input.developmentTimelineMonths} months.`}
            {preferredReturn > 0 && ` Preferred investor return: ${pct(preferredReturn)}.`}
          </p>
        </div>

        {/* Key Metrics */}
        <div>
          <SectionHeading icon={BarChart3} title="Key Metrics" />
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <MetricCard label="Total Development Cost" value={R(calc.totalCosts)} color="text-gray-900" />
            <MetricCard label="Total Budget" value={R(input.totalBudget)} />
            {isResale && <MetricCard label="Total Expected Revenue" value={R(input.totalExpectedRevenue)} color="text-emerald-600" />}
            {isResale && <MetricCard label="Expected Profit" value={R(input.expectedProfit)} color={input.expectedProfit >= 0 ? "text-emerald-600" : "text-red-500"} />}
            <MetricCard label="Profit Margin" value={pct(calc.profitMargin)} color="text-gold-600" />
            {input.expectedROI > 0 && <MetricCard label="Expected ROI" value={pct(input.expectedROI)} color="text-emerald-600" />}
            {input.expectedIRR > 0 && <MetricCard label="Expected IRR" value={pct(input.expectedIRR)} color="text-emerald-600" sub="Internal Rate of Return" />}
            {input.numberOfUnits > 0 && <MetricCard label="Cost per Unit" value={R(calc.costPerUnit)} />}
            {input.costPerSquareMeter > 0 && <MetricCard label="Cost per m²" value={R(input.costPerSquareMeter)} />}
            {input.developmentTimelineMonths > 0 && <MetricCard label="Timeline" value={`${input.developmentTimelineMonths} months`} color="text-blue-600" />}
            {preferredReturn > 0 && <MetricCard label="Preferred Return" value={pct(preferredReturn)} color="text-gold-600" />}
          </div>
        </div>

        {/* Cost Breakdown */}
        <div>
          <SectionHeading icon={Wallet} title="Cost Breakdown" />
          <div className="mt-3 overflow-hidden rounded-lg border border-navy-700">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-navy-800/50">
                <tr className="bg-navy-800/10">
                  <td className="px-4 py-3 text-gray-600">Land Acquisition</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{R(input.landAcquisitionCost)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-gray-600">Hard Costs (Construction)</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{R(input.hardCosts)}</td>
                </tr>
                <tr className="bg-navy-800/10">
                  <td className="px-4 py-3 text-gray-600">Soft Costs (Professional Fees)</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{R(input.softCosts)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-gray-600">Financing Costs</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{R(input.financingCosts)}</td>
                </tr>
                <tr className="bg-navy-800/10">
                  <td className="px-4 py-3 text-gray-600">Contingency ({input.contingencyPercent}%)</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">{R(input.contingencyAmount)}</td>
                </tr>
                <tr className="border-t-2 border-navy-700 bg-navy-800/30">
                  <td className="px-4 py-3 font-semibold text-gray-900">Total Development Cost</td>
                  <td className="px-4 py-3 text-right font-bold text-gold-600">{R(calc.totalCosts)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Revenue / Rental Income */}
        {isResale ? (
          <div>
            <SectionHeading icon={TrendingUp} title="Revenue Projections" />
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <MetricCard label="Sale Price per Unit" value={R(input.expectedSalePricePerUnit)} />
              <MetricCard label="Total Expected Revenue" value={R(input.totalExpectedRevenue)} color="text-emerald-600" />
              <MetricCard label="Expected Profit" value={R(input.expectedProfit)} color="text-emerald-600" />
              {input.preSaleUnits > 0 && <MetricCard label="Pre-Sale Units" value={`${input.preSaleUnits} of ${input.numberOfUnits}`} sub={`${calc.preSalePercentage.toFixed(0)}% pre-sold`} />}
            </div>
          </div>
        ) : (
          <div>
            <SectionHeading icon={TrendingUp} title="Rental Income Projections" />
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <MetricCard label="Monthly Rent per Unit" value={R(input.expectedMonthlyRentPerUnit)} />
              {calc.annualGrossRentalIncome != null && <MetricCard label="Annual Gross Rental Income" value={R(calc.annualGrossRentalIncome)} color="text-emerald-600" />}
              <MetricCard label="Annual Operating Expenses" value={R(input.annualOperatingExpenses)} color="text-orange-500" />
              {calc.noi != null && <MetricCard label="Net Operating Income (NOI)" value={R(calc.noi)} color={calc.noi >= 0 ? "text-emerald-600" : "text-red-500"} />}
              {calc.calculatedCapRate != null && <MetricCard label="Cap Rate" value={pct(calc.calculatedCapRate)} color="text-gold-600" />}
              {calc.calculatedGrossYield != null && <MetricCard label="Gross Yield" value={pct(calc.calculatedGrossYield)} />}
              {calc.calculatedNetYield != null && <MetricCard label="Net Yield" value={pct(calc.calculatedNetYield)} />}
            </div>
          </div>
        )}

        {/* Budget Tracker */}
        {input.totalBudget > 0 && (
          <div>
            <SectionHeading icon={DollarSign} title="Budget Tracker" />
            <div className="mt-3 rounded-lg border border-navy-700 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500">Budget Spent</span>
                <span className="text-sm font-medium text-gray-900">{R(Number(dev.spentBudget ?? 0))} / {R(input.totalBudget)}</span>
              </div>
              <div className="h-3 rounded-full bg-navy-800">
                <div
                  className={`h-3 rounded-full transition-all ${Number(dev.spentBudget ?? 0) > input.totalBudget ? "bg-red-500" : "bg-gold-500"}`}
                  style={{ width: `${Math.min((Number(dev.spentBudget ?? 0) / input.totalBudget) * 100, 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {((Number(dev.spentBudget ?? 0) / input.totalBudget) * 100).toFixed(1)}% utilised
              </p>
            </div>
          </div>
        )}

        {/* Profit Distribution Waterfall */}
        <div>
          <SectionHeading icon={TrendingUp} title="Profit Distribution Waterfall" />
          <div className="mt-3 rounded-lg border border-navy-700 bg-navy-800/10 p-4">
            <p className="text-sm text-gray-600 mb-3">
              Profits are distributed according to the following waterfall structure:
            </p>
            <ol className="space-y-2 text-sm">
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

  // ── Fallback for unknown types ───────────────────────────────────────────
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">Financial Overview</h3>
      <MetricCard label="Property Value" value={R(Number(property.price || 0))} color="text-gold-600" />
      {preferredReturn > 0 && (
        <MetricCard label="Expected Returns" value={pct(preferredReturn)} color="text-gold-600" />
      )}
    </div>
  );
}
