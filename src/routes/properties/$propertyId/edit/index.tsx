import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { PropertyForm } from "~/components/PropertyForm";
import { AIListingCoach } from "~/components/AIListingCoach";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

const MANAGER_ROLES = ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "PROPERTY_OWNER", "OWNER"];

export const Route = createFileRoute("/properties/$propertyId/edit/")({
  component: EditPropertyPage,
});

function EditPropertyPage() {
  const { propertyId } = Route.useParams();
  const navigate = useNavigate();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const propertyQuery = useQuery({
    ...trpc.getPropertyById.queryOptions({ authToken: authToken ?? "", propertyId: Number(propertyId) }),
    enabled: !!authToken && !!propertyId,
  });

  const data = propertyQuery.data as any;
  const property = data?.property ?? data;

  if (!user || !authToken) return null;

  const isManager = MANAGER_ROLES.includes(user?.role ?? "");
  if (!isManager) {
    return (
      <div className="min-h-screen bg-navy-950"><Navbar />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <ShieldAlert className="mx-auto mb-4 text-red-600" size={48} />
          <h1 className="text-2xl font-bold text-gray-900">Access Restricted</h1>
          <p className="mt-2 text-gray-500">Only managers and property owners can edit properties.</p>
          <button onClick={() => navigate({ to: "/dashboard" })} className="mt-6 rounded-lg bg-gold-500 px-6 py-2 text-sm font-medium text-white hover:bg-gold-600">Back to Dashboard</button>
        </div>
      </div>
    );
  }

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

  if (propertyQuery.isError || !property) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="mx-auto max-w-4xl px-4 py-8">
          <div className="rounded-lg bg-red-50 p-4 text-red-600">
            Failed to load property for editing. The property may not exist.
          </div>
          <button
            onClick={() => navigate({ to: "/dashboard" })}
            className="mt-4 flex items-center gap-2 text-gold-600 hover:text-gold-500"
          >
            <ArrowLeft size={16} /> Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (formData: any) => {
    if (!authToken) {
      toast.error("You must be logged in to update properties");
      return;
    }

    try {
      await toast.promise(
        trpcClient.updateProperty.mutate({
          authToken,
          propertyId: Number(propertyId),
          ...formData,
        }),
        {
          loading: "Updating property...",
          success: "Property updated successfully!",
          error: (err: any) => `Failed to update property: ${err.message}`,
        }
      );
      navigate({ to: "/properties/$propertyId", params: { propertyId } });
    } catch (error) {
      console.error("Error updating property:", error);
    }
  };

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate({ to: "/properties/$propertyId", params: { propertyId } })}
            className="mb-4 flex items-center gap-2 text-gray-500 hover:text-gray-900"
          >
            <ArrowLeft size={18} />
            <span>Back to Property</span>
          </button>
          <h1 className="text-3xl font-bold text-gray-900">Edit Property</h1>
          <p className="mt-2 text-gray-500">
            Update the details for {property.title || "this property"}
          </p>
        </div>

        <AIListingCoach propertyId={Number(propertyId)} />

        {/* Form */}
        <PropertyForm
          mode="edit"
          defaultPropertyType={property.type || "flip"}
          initialData={property}
          onSubmit={handleSubmit}
          isSubmitting={false}
        />
      </div>
    </div>
  );
}
