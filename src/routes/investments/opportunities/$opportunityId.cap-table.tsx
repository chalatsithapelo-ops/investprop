import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ArrowLeft, PieChart, Users, TrendingUp } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { QueryState } from "~/components/QueryState";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/investments/opportunities/$opportunityId/cap-table")({
  component: CapTablePage,
});

function CapTablePage() {
  const { opportunityId } = Route.useParams();
  const trpc = useTRPC();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated, navigate]);

  const capTableQuery = useQuery({
    ...trpc.getCapTablePreview.queryOptions({
      authToken: authToken ?? "",
      propertyId: Number(opportunityId),
    }),
    enabled: !!authToken && !!opportunityId,
  });

  if (!user || !authToken) return null;

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          to="/investments/opportunities/$opportunityId"
          params={{ opportunityId }}
          className="mb-4 inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gold-500"
        >
          <ArrowLeft size={16} /> Back to opportunity
        </Link>

        <div className="mb-6 flex items-center gap-3">
          <PieChart className="text-gold-500" size={28} />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Cap Table</h1>
            <p className="text-sm text-gray-500">
              Live ownership preview as funding progresses. Updates in real time as
              investors commit and certificates are issued.
            </p>
          </div>
        </div>

        <QueryState query={capTableQuery} emptyLabel="No cap-table data available">
          {(() => {
            const data: any = capTableQuery.data;
            if (!data) return null;
            const rows: any[] = data.rows ?? [];
            return (
              <div className="space-y-6">
                {/* Summary cards */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-4">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <TrendingUp size={14} /> Total Raised
                    </div>
                    <p className="mt-1 text-2xl font-bold text-emerald-500">
                      R{Number(data.totalCommitted).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">
                      of R{Number(data.property?.fundingGoal).toLocaleString()} goal
                    </p>
                  </div>
                  <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-4">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Users size={14} /> Investors
                    </div>
                    <p className="mt-1 text-2xl font-bold text-gold-500">
                      {data.totalInvestors}
                    </p>
                  </div>
                  <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-4">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <PieChart size={14} /> Funding %
                    </div>
                    <p className="mt-1 text-2xl font-bold text-blue-500">
                      {(
                        (Number(data.totalCommitted) /
                          Math.max(Number(data.property?.fundingGoal), 1)) *
                        100
                      ).toFixed(1)}
                      %
                    </p>
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto rounded-xl border border-navy-800/50 bg-navy-900/50">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-navy-700 text-left text-xs uppercase text-gray-500">
                        <th className="py-3 pl-4 pr-4">#</th>
                        <th className="px-4 py-3">Investor</th>
                        <th className="px-4 py-3 text-right">Committed</th>
                        <th className="px-4 py-3 text-right">Shares</th>
                        <th className="px-4 py-3 text-right">% of Raised</th>
                        <th className="px-4 py-3 text-right">% of Goal</th>
                        <th className="px-4 py-3 pr-4 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-gray-500">
                            No investors yet. Cap-table will populate as commitments
                            come in.
                          </td>
                        </tr>
                      ) : (
                        rows.map((r, i) => (
                          <tr
                            key={`${r.investorId}-${i}`}
                            className="border-b border-navy-800/30 hover:bg-navy-800/20"
                          >
                            <td className="py-3 pl-4 pr-4 text-gray-500">{i + 1}</td>
                            <td className="px-4 py-3 font-medium text-gray-900">
                              {r.investorName}
                            </td>
                            <td className="px-4 py-3 text-right text-emerald-600">
                              R{Number(r.amount).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right text-gray-700">
                              {Number(r.shares).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-right text-gold-600">
                              {Number(r.pctOfRaised).toFixed(2)}%
                            </td>
                            <td className="px-4 py-3 text-right text-blue-600">
                              {Number(r.pctOfGoal).toFixed(2)}%
                            </td>
                            <td className="px-4 py-3 pr-4 text-right">
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                  r.status === "APPROVED"
                                    ? "bg-emerald-50 text-emerald-600"
                                    : r.status === "PENDING"
                                      ? "bg-amber-50 text-amber-600"
                                      : "bg-gray-100 text-gray-600"
                                }`}
                              >
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <p className="text-xs text-gray-500">
                  Cap-table is a preview based on current commitments. Final ownership
                  is recorded on the share register once certificates are issued and
                  the cooling-off period expires.
                </p>
              </div>
            );
          })()}
        </QueryState>
      </div>
    </div>
  );
}
