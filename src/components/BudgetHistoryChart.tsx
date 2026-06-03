import { BarChart, TrendingUp, TrendingDown } from "lucide-react";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import { useQuery } from "@tanstack/react-query";

export function BudgetHistoryChart({ propertyId }: { propertyId: number }) {
  const trpc = useTRPC();
  const authToken = useAuthStore((s) => s.accessToken) ?? "";

  const { data: raw, isLoading } = useQuery(
    trpc.getBudgetEntries.queryOptions({ authToken, propertyId }),
  );
  const entries: any[] = Array.isArray(raw) ? (raw as any[]) : [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold-500 border-t-transparent" />
      </div>
    );
  }

  // Group by category
  const grouped: Record<string, { estimated: number; actual: number }> = {};
  for (const entry of entries) {
    const cat: string = entry.category ?? "OTHER";
    if (!grouped[cat]) grouped[cat] = { estimated: 0, actual: 0 };
    grouped[cat].estimated += Number(entry.estimatedAmount ?? 0);
    grouped[cat].actual += Number(entry.actualAmount ?? 0);
  }

  const categories = Object.entries(grouped);
  const maxValue = Math.max(
    ...categories.flatMap(([, v]) => [v.estimated, v.actual]),
    1,
  );

  const totalEstimated = categories.reduce((s, [, v]) => s + v.estimated, 0);
  const totalActual = categories.reduce((s, [, v]) => s + v.actual, 0);
  const totalVariance = totalActual - totalEstimated;

  return (
    <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-gold-50 p-2">
            <BarChart className="h-5 w-5 text-gold-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            Budget vs Actual
          </h3>
        </div>
        <div className="flex items-center gap-1 text-sm">
          {totalVariance > 0 ? (
            <>
              <TrendingUp className="h-4 w-4 text-red-600" />
              <span className="text-red-600">
                R{totalVariance.toLocaleString()} over budget
              </span>
            </>
          ) : (
            <>
              <TrendingDown className="h-4 w-4 text-emerald-600" />
              <span className="text-emerald-600">
                R{Math.abs(totalVariance).toLocaleString()} under budget
              </span>
            </>
          )}
        </div>
      </div>

      {categories.length === 0 ? (
        <p className="py-8 text-center text-gray-500">
          No budget entries yet.
        </p>
      ) : (
        <div className="space-y-5">
          {categories.map(([cat, vals]) => {
            const estPct = (vals.estimated / maxValue) * 100;
            const actPct = (vals.actual / maxValue) * 100;
            const variance = vals.actual - vals.estimated;
            return (
              <div key={cat}>
                <div className="mb-2 flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-600">
                    {cat.replace(/_/g, " ")}
                  </span>
                  <span
                    className={
                      variance > 0
                        ? "text-red-600"
                        : variance < 0
                          ? "text-emerald-600"
                          : "text-gray-500"
                    }
                  >
                    {variance > 0 ? "+" : ""}R{variance.toLocaleString()}
                  </span>
                </div>
                {/* Estimated bar */}
                <div className="mb-1 flex items-center gap-2">
                  <span className="w-20 text-xs text-gray-500">Estimated</span>
                  <div className="h-5 flex-1 overflow-hidden rounded bg-navy-800">
                    <div
                      className="h-full rounded bg-navy-600 transition-all"
                      style={{ width: `${estPct}%` }}
                    />
                  </div>
                  <span className="w-28 text-right text-xs text-gray-500">
                    R{vals.estimated.toLocaleString()}
                  </span>
                </div>
                {/* Actual bar */}
                <div className="flex items-center gap-2">
                  <span className="w-20 text-xs text-gray-500">Actual</span>
                  <div className="h-5 flex-1 overflow-hidden rounded bg-navy-800">
                    <div
                      className="h-full rounded bg-gold-500 transition-all"
                      style={{ width: `${actPct}%` }}
                    />
                  </div>
                  <span className="w-28 text-right text-xs text-gray-500">
                    R{vals.actual.toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="mt-6 flex items-center gap-6 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded bg-navy-600" />
          Estimated
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded bg-gold-500" />
          Actual
        </div>
      </div>
    </div>
  );
}
