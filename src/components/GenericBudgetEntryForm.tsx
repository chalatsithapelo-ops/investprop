import { useState } from "react";
import { DollarSign, Tag, FileText } from "lucide-react";
import { useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

const DEFAULT_CATEGORIES = [
  "ACQUISITION",
  "CONSTRUCTION",
  "PROFESSIONAL_FEES",
  "MARKETING",
  "CONTINGENCY",
  "OTHER",
];

const inputClass =
  "w-full rounded-lg border border-navy-700 bg-navy-800/50 px-4 py-3 text-gray-900 placeholder-gray-500 focus:border-gold-500 focus:outline-none focus:ring-2 focus:ring-gold-500/20";

const labelClass = "text-sm font-medium text-gray-600";

type GenericBudgetEntryFormProps = {
  entityType: string;
  entityId: number;
  categories?: string[];
  onSuccess?: () => void;
};

export function GenericBudgetEntryForm({
  entityType,
  entityId,
  categories,
  onSuccess,
}: GenericBudgetEntryFormProps) {
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const authToken = useAuthStore((s) => s.accessToken) ?? "";

  const cats = categories ?? DEFAULT_CATEGORIES;

  const [category, setCategory] = useState<string>(cats[0] ?? "OTHER");
  const [description, setDescription] = useState("");
  const [estimatedAmount, setEstimatedAmount] = useState("");
  const [actualAmount, setActualAmount] = useState("");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      trpcClient.createBudgetEntry.mutate({
        authToken,
        propertyId: entityId,
        category,
        description,
        amount: Number(estimatedAmount),
      }),
    onSuccess: () => {
      toast.success("Budget entry created");
      queryClient.invalidateQueries({ queryKey: ["getBudgetEntries"] });
      queryClient.invalidateQueries({ queryKey: ["getPropertyById"] });
      queryClient.invalidateQueries({ queryKey: ["getBudgetHistory"] });
      setCategory(cats[0] ?? "OTHER");
      setDescription("");
      setEstimatedAmount("");
      setActualAmount("");
      setNotes("");
      onSuccess?.();
    },
    onError: (err: any) =>
      toast.error(err?.message ?? "Failed to create budget entry"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !estimatedAmount) {
      toast.error("Description and estimated amount are required");
      return;
    }
    mutation.mutate();
  };

  return (
    <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-lg bg-gold-50 p-2">
          <DollarSign className="h-5 w-5 text-gold-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">
          Add Budget Entry
        </h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Category */}
        <div>
          <label className={labelClass}>
            <Tag className="mr-1 inline h-4 w-4" />
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={inputClass}
          >
            {cats.map((cat) => (
              <option key={cat} value={cat}>
                {cat.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>

        {/* Description */}
        <div>
          <label className={labelClass}>
            <FileText className="mr-1 inline h-4 w-4" />
            Description
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Budget item description"
            className={inputClass}
          />
        </div>

        {/* Estimated Amount */}
        <div>
          <label className={labelClass}>
            <DollarSign className="mr-1 inline h-4 w-4" />
            Estimated Amount (ZAR)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
              R
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={estimatedAmount}
              onChange={(e) => setEstimatedAmount(e.target.value)}
              placeholder="0.00"
              className={`${inputClass} pl-8`}
            />
          </div>
        </div>

        {/* Actual Amount */}
        <div>
          <label className={labelClass}>
            <DollarSign className="mr-1 inline h-4 w-4" />
            Actual Amount (ZAR)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
              R
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={actualAmount}
              onChange={(e) => setActualAmount(e.target.value)}
              placeholder="0.00"
              className={`${inputClass} pl-8`}
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className={labelClass}>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional notes…"
            rows={3}
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full rounded-lg bg-gold-500 px-6 py-3 font-semibold text-navy-900 transition hover:bg-gold-400 disabled:opacity-50"
        >
          {mutation.isPending ? "Creating…" : "Add Budget Entry"}
        </button>
      </form>
    </div>
  );
}
