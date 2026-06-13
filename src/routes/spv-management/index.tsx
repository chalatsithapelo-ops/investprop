import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Building2, Plus, Edit2, Trash2, LinkIcon, X, ShieldAlert } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

const MANAGER_ROLES = ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "PROPERTY_OWNER", "OWNER"];

export const Route = createFileRoute("/spv-management/")({
  component: SPVManagementPage,
});

const emptyForm = { name: "", registrationNumber: "", taxNumber: "", bankName: "", bankAccountNumber: "", bankBranchCode: "", notes: "" };

function SPVManagementPage() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const isManager = MANAGER_ROLES.includes(user?.role ?? "");

  if (!user || !authToken) return null;

  if (!isManager) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <ShieldAlert className="mx-auto mb-4 text-red-600" size={48} />
          <h1 className="text-2xl font-bold text-gray-900">Access Restricted</h1>
          <p className="mt-2 text-gray-500">Only managers and property owners can access SPV management.</p>
          <button onClick={() => navigate({ to: "/dashboard" })} className="mt-6 rounded-lg bg-gold-500 px-6 py-2 text-sm font-medium text-white hover:bg-gold-600">Back to Dashboard</button>
        </div>
      </div>
    );
  }

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({ ...emptyForm });
  const [editingSPV, setEditingSPV] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState({ ...emptyForm });
  const [assigningSPV, setAssigningSPV] = useState<number | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: trpc.getSPVs.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.getProperties.queryKey() });
  };

  const spvsQuery = useQuery(trpc.getSPVs.queryOptions({ authToken: authToken ?? "" }));
  const propertiesQuery = useQuery(trpc.getProperties.queryOptions({}));

  const createMutation = useMutation(
    trpc.createSPV.mutationOptions({
      onSuccess: () => {
        toast.success("SPV created successfully");
        invalidateAll();
        setShowCreateForm(false);
        setFormData({ ...emptyForm });
      },
      onError: (e: any) => toast.error(e.message),
    })
  );

  const updateMutation = useMutation(
    trpc.updateSPV.mutationOptions({
      onSuccess: () => {
        toast.success("SPV updated");
        invalidateAll();
        setEditingSPV(null);
      },
      onError: (e: any) => toast.error(e.message),
    })
  );

  const assignMutation = useMutation(
    trpc.assignPropertyToSPV.mutationOptions({
      onSuccess: () => {
        toast.success("Property assigned to SPV");
        invalidateAll();
        setAssigningSPV(null);
        setSelectedPropertyId(null);
      },
      onError: (e: any) => toast.error(e.message),
    })
  );

  const removeMutation = useMutation(
    trpc.removePropertyFromSPV.mutationOptions({
      onSuccess: () => {
        toast.success("Property removed from SPV");
        invalidateAll();
      },
      onError: (e: any) => toast.error(e.message),
    })
  );

  const statusColors: Record<string, string> = {
    PENDING_REGISTRATION: "bg-gold-50 text-gold-600",
    REGISTERED: "bg-gold-50 text-gold-600",
    ACTIVE: "bg-emerald-50 text-emerald-600",
    DORMANT: "bg-navy-800/50 text-gray-800",
    DEREGISTERED: "bg-red-50 text-red-600",
  };

  const statusLabels: Record<string, string> = {
    PENDING_REGISTRATION: "Pending Registration",
    REGISTERED: "Registered",
    ACTIVE: "Active",
    DORMANT: "Dormant",
    DEREGISTERED: "Deregistered",
  };

  // Properties available for assignment (not already assigned to any SPV)
  const availableProperties = propertiesQuery.data?.properties?.filter((p: any) => !p.spvId) ?? [];

  const openEdit = (spv: any) => {
    setEditingSPV(spv.id);
    setEditFormData({
      name: spv.name ?? "",
      registrationNumber: spv.registrationNumber ?? "",
      taxNumber: spv.taxNumber ?? "",
      bankName: spv.bankName ?? "",
      bankAccountNumber: spv.bankAccountNumber ?? "",
      bankBranchCode: spv.bankBranchCode ?? "",
      notes: spv.notes ?? "",
    });
  };

  const FormFields = ({ data, setData }: { data: typeof emptyForm; setData: (d: typeof emptyForm) => void }) => (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-600">Company Name *</label>
        <input type="text" value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} placeholder="e.g. Investprop SPV 001 (Pty) Ltd" className="w-full rounded-lg border p-2 border-navy-700 bg-navy-800/50" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-600">CIPC Registration No.</label>
        <input type="text" value={data.registrationNumber} onChange={(e) => setData({ ...data, registrationNumber: e.target.value })} className="w-full rounded-lg border p-2 border-navy-700 bg-navy-800/50" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-600">SARS Tax Number</label>
        <input type="text" value={data.taxNumber} onChange={(e) => setData({ ...data, taxNumber: e.target.value })} className="w-full rounded-lg border p-2 border-navy-700 bg-navy-800/50" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-600">Bank Name</label>
        <input type="text" value={data.bankName} onChange={(e) => setData({ ...data, bankName: e.target.value })} className="w-full rounded-lg border p-2 border-navy-700 bg-navy-800/50" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-600">Account Number</label>
        <input type="text" value={data.bankAccountNumber} onChange={(e) => setData({ ...data, bankAccountNumber: e.target.value })} className="w-full rounded-lg border p-2 border-navy-700 bg-navy-800/50" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-600">Branch Code</label>
        <input type="text" value={data.bankBranchCode} onChange={(e) => setData({ ...data, bankBranchCode: e.target.value })} className="w-full rounded-lg border p-2 border-navy-700 bg-navy-800/50" />
      </div>
      <div className="md:col-span-2">
        <label className="mb-1 block text-sm font-medium text-gray-600">Notes</label>
        <textarea value={data.notes} onChange={(e) => setData({ ...data, notes: e.target.value })} rows={2} className="w-full rounded-lg border p-2 border-navy-700 bg-navy-800/50" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">SPV Management</h1>
            <p className="mt-1 text-gray-500">Manage Special Purpose Vehicles for property ownership</p>
          </div>
          <button onClick={() => setShowCreateForm(!showCreateForm)} className="flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-white hover:bg-gold-600">
            <Plus size={18} /> Register New SPV
          </button>
        </div>

        {/* Create Form */}
        {showCreateForm && (
          <div className="mb-8 rounded-lg border border-navy-800/50 bg-navy-900/50 p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Register New SPV</h2>
            <FormFields data={formData} setData={setFormData} />
            <div className="mt-4 flex gap-2">
              <button onClick={() => createMutation.mutate({ authToken: authToken ?? "", ...formData })} disabled={!formData.name || createMutation.isPending} className="rounded-lg bg-gold-500 px-4 py-2 text-white hover:bg-gold-600 disabled:opacity-50">
                {createMutation.isPending ? "Creating..." : "Create SPV"}
              </button>
              <button onClick={() => setShowCreateForm(false)} className="rounded-lg border px-4 py-2 text-gray-600 hover:bg-navy-800/30">Cancel</button>
            </div>
          </div>
        )}

        {/* Pipeline Overview */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
          {(["PENDING_REGISTRATION", "REGISTERED", "ACTIVE", "DORMANT", "DEREGISTERED"] as const).map((status) => {
            const count = spvsQuery.data?.filter((s) => s.status === status).length ?? 0;
            return (
              <div key={status} className="rounded-lg border border-navy-800/50 bg-navy-900/50 p-4">
                <span className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${statusColors[status]}`}>{statusLabels[status]}</span>
                <p className="mt-2 text-2xl font-bold text-gray-900">{count}</p>
              </div>
            );
          })}
        </div>

        {/* SPV List */}
        {spvsQuery.isLoading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gold-500 border-r-transparent" />
          </div>
        ) : (
          <div className="space-y-4">
            {spvsQuery.data?.map((spv) => (
              <div key={spv.id} className="rounded-lg border border-navy-800/50 bg-navy-900/50 p-6">
                {/* ─── Edit Mode ───────────────────────────────── */}
                {editingSPV === spv.id ? (
                  <div>
                    <h3 className="mb-4 text-lg font-semibold text-gray-900">Edit SPV</h3>
                    <FormFields data={editFormData} setData={setEditFormData} />
                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => updateMutation.mutate({ authToken: authToken ?? "", spvId: spv.id, ...editFormData })}
                        disabled={!editFormData.name || updateMutation.isPending}
                        className="rounded-lg bg-gold-500 px-4 py-2 text-white hover:bg-gold-600 disabled:opacity-50">
                        {updateMutation.isPending ? "Saving..." : "Save Changes"}
                      </button>
                      <button onClick={() => setEditingSPV(null)} className="rounded-lg border px-4 py-2 text-gray-600 hover:bg-navy-800/30">Cancel</button>
                    </div>
                  </div>
                ) : (
                  /* ─── View Mode ──────────────────────────────── */
                  <div>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-3">
                          <Building2 className="text-gold-600" size={24} />
                          <h3 className="text-lg font-semibold text-gray-900">{spv.name}</h3>
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusColors[spv.status]}`}>{statusLabels[spv.status]}</span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1 text-sm text-gray-500">
                          {spv.registrationNumber && <p>CIPC: {spv.registrationNumber}</p>}
                          {spv.taxNumber && <p>Tax No: {spv.taxNumber}</p>}
                          {spv.bankName && <p>Bank: {spv.bankName}</p>}
                          <p>Director: {spv.director.name}</p>
                          <p>Properties: {spv._count.properties}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(spv)} className="rounded-lg border border-navy-700 px-3 py-1.5 text-sm text-gray-600 hover:bg-navy-800/30" title="Edit SPV">
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => { setAssigningSPV(assigningSPV === spv.id ? null : spv.id); setSelectedPropertyId(null); }} className="rounded-lg border border-navy-700 px-3 py-1.5 text-sm text-gold-600 hover:bg-navy-800/30" title="Assign Property">
                          <LinkIcon size={16} />
                        </button>
                        {spv.status === "PENDING_REGISTRATION" && (
                          <button onClick={() => updateMutation.mutate({ authToken: authToken ?? "", spvId: spv.id, status: "REGISTERED", registeredDate: new Date().toISOString() })} className="rounded-lg bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-700">
                            Mark Registered
                          </button>
                        )}
                        {spv.status === "REGISTERED" && (
                          <button onClick={() => updateMutation.mutate({ authToken: authToken ?? "", spvId: spv.id, status: "ACTIVE" })} className="rounded-lg bg-gold-500 px-3 py-1.5 text-sm text-white hover:bg-gold-600">
                            Activate
                          </button>
                        )}
                        {spv.status === "ACTIVE" && (
                          <button onClick={() => updateMutation.mutate({ authToken: authToken ?? "", spvId: spv.id, status: "DORMANT" })} className="rounded-lg border border-gray-400 px-3 py-1.5 text-sm text-gray-500 hover:bg-navy-800/30">
                            Dormant
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Assign Property Panel */}
                    {assigningSPV === spv.id && (
                      <div className="mt-4 rounded-lg border border-gold-500/30 bg-gold-50/10 p-4">
                        <h4 className="mb-2 text-sm font-semibold text-gray-900">Assign Property to {spv.name}</h4>
                        {availableProperties.length === 0 ? (
                          <p className="text-sm text-gray-500">No unassigned properties available.</p>
                        ) : (
                          <div className="flex items-end gap-3">
                            <div className="flex-1">
                              <label className="mb-1 block text-xs font-medium text-gray-600">Select Property</label>
                              <select
                                value={selectedPropertyId ?? ""}
                                onChange={(e) => setSelectedPropertyId(e.target.value ? Number(e.target.value) : null)}
                                className="w-full rounded-lg border p-2 border-navy-700 bg-navy-800/50 text-sm">
                                <option value="">-- Choose a property --</option>
                                {availableProperties.map((p: any) => (
                                  <option key={p.id} value={p.id}>{p.title} ({p.city})</option>
                                ))}
                              </select>
                            </div>
                            <button
                              onClick={() => selectedPropertyId && assignMutation.mutate({ authToken: authToken ?? "", spvId: spv.id, propertyId: selectedPropertyId })}
                              disabled={!selectedPropertyId || assignMutation.isPending}
                              className="rounded-lg bg-gold-500 px-4 py-2 text-sm text-white hover:bg-gold-600 disabled:opacity-50">
                              {assignMutation.isPending ? "Assigning..." : "Assign"}
                            </button>
                            <button onClick={() => setAssigningSPV(null)} className="rounded-lg border px-3 py-2 text-sm text-gray-600 hover:bg-navy-800/30">
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Linked Properties */}
                    {spv.properties.length > 0 && (
                      <div className="mt-4">
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Linked Properties</h4>
                        <div className="flex flex-wrap gap-2">
                          {spv.properties.map((p) => (
                            <span key={p.id} className="inline-flex items-center gap-2 rounded-lg bg-navy-800/30 px-3 py-1.5 text-sm text-gold-600">
                              {p.title}
                              <button
                                onClick={() => {
                                  if (confirm(`Remove "${p.title}" from ${spv.name}?`)) {
                                    removeMutation.mutate({ authToken: authToken ?? "", spvId: spv.id, propertyId: p.id });
                                  }
                                }}
                                className="ml-1 rounded p-0.5 text-red-400 hover:bg-red-500/20 hover:text-red-300"
                                title="Remove property from SPV">
                                <X size={14} />
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {spvsQuery.data?.length === 0 && (
              <div className="rounded-lg border-2 border-dashed py-12 text-center text-gray-500 border-navy-700">
                <Building2 className="mx-auto mb-3" size={48} />
                <p className="text-lg font-medium">No SPVs registered yet</p>
                <p className="mt-1 text-sm">Create your first Special Purpose Vehicle to start fractional property ownership</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
