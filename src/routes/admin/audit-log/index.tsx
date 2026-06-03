import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Loader2, Search, Activity } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/admin/audit-log/")({
  component: AuditLogPage,
});

function AuditLogPage() {
  const navigate = useNavigate();
  const trpc = useTRPC();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
    if (user && user.role !== "ADMIN" && user.role !== "DEVELOPMENT_MANAGER") {
      navigate({ to: "/dashboard" });
    }
  }, [user, authToken, hasHydrated]);

  const logQuery = useQuery({
    ...trpc.listAuditLog.queryOptions({
      authToken: authToken ?? "",
      ...(actionFilter ? { action: actionFilter } : {}),
      ...(entityFilter ? { entityType: entityFilter } : {}),
      limit: 200,
    }),
    enabled: !!authToken,
  });

  const rows = (logQuery.data as any)?.rows ?? [];

  const downloadCsv = () => {
    const header = ["id", "createdAt", "userId", "userName", "action", "entity", "entityId", "status"];
    const lines = [header.join(",")];
    rows.forEach((r: any) => {
      lines.push(
        [
          r.id,
          new Date(r.createdAt).toISOString(),
          r.userId ?? "",
          (r.user?.name ?? "").replace(/,/g, " "),
          r.action,
          r.entity,
          r.entityId ?? "",
          r.status ?? "",
        ].join(",")
      );
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!user || !authToken) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold text-gray-900">
              <Activity className="text-gold-500" /> Audit Log
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              POPIA-grade immutable audit trail of every privileged action
            </p>
          </div>
          <button
            onClick={downloadCsv}
            disabled={rows.length === 0}
            className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-600 disabled:opacity-50"
          >
            Export CSV ({rows.length})
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Filter by action…"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <input
            type="text"
            placeholder="Filter by entity (User, Property, …)"
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
          />
        </div>

        {logQuery.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-gold-500" />
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2 text-left">When</th>
                  <th className="px-4 py-2 text-left">User</th>
                  <th className="px-4 py-2 text-left">Action</th>
                  <th className="px-4 py-2 text-left">Entity</th>
                  <th className="px-4 py-2 text-left">ID</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs text-gray-500">
                      {new Date(r.createdAt).toLocaleString("en-ZA")}
                    </td>
                    <td className="px-4 py-2">
                      {r.user ? (
                        <>
                          <div className="font-medium text-gray-800">{r.user.name}</div>
                          <div className="text-xs text-gray-500">{r.user.email}</div>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">system</span>
                      )}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-700">{r.action}</td>
                    <td className="px-4 py-2 text-xs text-gray-700">{r.entity}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">{r.entityId ?? "—"}</td>
                    <td className="px-4 py-2 text-xs">
                      {r.status === "FAILED" ? (
                        <span className="rounded bg-red-100 px-2 py-0.5 text-red-700">FAILED</span>
                      ) : r.status === "DENIED" ? (
                        <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-700">
                          DENIED
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-700">
                          OK
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                      No audit entries match
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
