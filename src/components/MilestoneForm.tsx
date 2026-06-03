import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Target, Calendar, DollarSign } from "lucide-react";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

export function MilestoneForm({ propertyId, onSuccess }: { propertyId: number; onSuccess?: () => void }) {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const qc = useQueryClient();
  const authToken = useAuthStore((s) => s.token);

  const [form, setForm] = useState({
    name: "",
    description: "",
    estimatedStartDate: "",
    estimatedCompletionDate: "",
    budgetAllocated: 0,
    order: 1,
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) return toast.error("Not authenticated");
    if (!form.name.trim()) return toast.error("Milestone name is required");

    setSubmitting(true);
    try {
      await trpcClient.createMilestone.mutate({
        authToken,
        propertyId,
        name: form.name,
        description: form.description,
        estimatedStartDate: form.estimatedStartDate,
        estimatedCompletionDate: form.estimatedCompletionDate,
        budgetAllocated: form.budgetAllocated,
        order: form.order,
      });
      toast.success("Milestone created");
      qc.invalidateQueries({ queryKey: trpc.getMilestones.queryKey() });
      setForm({ name: "", description: "", estimatedStartDate: "", estimatedCompletionDate: "", budgetAllocated: 0, order: 1 });
      onSuccess?.();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to create milestone");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-xl border border-navy-700 bg-navy-800/50 p-6">
      <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900">
        <Target className="h-5 w-5 text-gold-600" />
        New Milestone
      </h3>

      {/* Name */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-600">Name</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full rounded-lg border border-navy-600 bg-navy-900/60 px-4 py-2.5 text-gray-900 placeholder-gray-500 outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500"
          placeholder="e.g. Foundation Complete"
        />
      </div>

      {/* Description */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-600">Description</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={3}
          className="w-full rounded-lg border border-navy-600 bg-navy-900/60 px-4 py-2.5 text-gray-900 placeholder-gray-500 outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500"
          placeholder="Describe this milestone..."
        />
      </div>

      {/* Dates */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-600">
            <Calendar className="h-4 w-4 text-gold-600" />
            Est. Start Date
          </label>
          <input
            type="date"
            value={form.estimatedStartDate}
            onChange={(e) => setForm({ ...form, estimatedStartDate: e.target.value })}
            className="w-full rounded-lg border border-navy-600 bg-navy-900/60 px-4 py-2.5 text-gray-900 outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500"
          />
        </div>
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-600">
            <Calendar className="h-4 w-4 text-gold-600" />
            Est. Completion Date
          </label>
          <input
            type="date"
            value={form.estimatedCompletionDate}
            onChange={(e) => setForm({ ...form, estimatedCompletionDate: e.target.value })}
            className="w-full rounded-lg border border-navy-600 bg-navy-900/60 px-4 py-2.5 text-gray-900 outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500"
          />
        </div>
      </div>

      {/* Budget & Order */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 flex items-center gap-1.5 text-sm font-medium text-gray-600">
            <DollarSign className="h-4 w-4 text-gold-600" />
            Budget Allocated (R)
          </label>
          <input
            type="number"
            min={0}
            value={form.budgetAllocated}
            onChange={(e) => setForm({ ...form, budgetAllocated: Number(e.target.value) })}
            className="w-full rounded-lg border border-navy-600 bg-navy-900/60 px-4 py-2.5 text-gray-900 outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-600">Order</label>
          <input
            type="number"
            min={1}
            value={form.order}
            onChange={(e) => setForm({ ...form, order: Number(e.target.value) })}
            className="w-full rounded-lg border border-navy-600 bg-navy-900/60 px-4 py-2.5 text-gray-900 outline-none focus:border-gold-500 focus:ring-1 focus:ring-gold-500"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-gold-500 px-6 py-3 font-semibold text-navy-900 transition hover:bg-gold-400 disabled:opacity-50"
      >
        {submitting ? "Creating..." : "Create Milestone"}
      </button>
    </form>
  );
}
