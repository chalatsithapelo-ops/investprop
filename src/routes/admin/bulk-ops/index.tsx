import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CheckSquare, Square, ShieldOff, UserCheck, Search, LogIn } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { QueryState } from "~/components/QueryState";
import { ConfirmModal } from "~/components/ConfirmModal";
import { useAuthStore } from "~/stores/authStore";
import { useTRPC } from "~/trpc/react";

export const Route = createFileRoute("/admin/bulk-ops/")({
  component: BulkOpsPage,
});

function BulkOpsPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const nav = useNavigate();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");

  useEffect(() => {
    if (!user || user.role !== "ADMIN") nav({ to: "/dashboard" });
  }, [user]);

  const usersQ = useQuery({
    ...trpc.getAllUsers.queryOptions({ role: "ALL", page: 1, limit: 200 } as any),
    enabled: !!token,
  });

  const approveM = useMutation(
    trpc.bulkApproveUsers.mutationOptions({
      onSuccess: (d) => {
        toast.success(`Approved ${d.approved} user(s)`);
        setSelected(new Set());
        qc.invalidateQueries();
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const suspendM = useMutation(
    trpc.bulkSuspendUsers.mutationOptions({
      onSuccess: (d) => {
        toast.success(`Suspended ${d.suspended} user(s)`);
        setSelected(new Set());
        setSuspendReason("");
        qc.invalidateQueries();
      },
      onError: (e) => toast.error(e.message),
    })
  );

  const impersonateM = useMutation(
    trpc.impersonateUser.mutationOptions({
      onSuccess: (d: any) => {
        if (d?.token) {
          // Replace current auth with impersonation token
          useAuthStore.setState({ token: d.token, user: d.user });
          toast.success(`Now logged in as ${d.user?.email}`);
          nav({ to: "/dashboard" });
        } else {
          toast.error("Impersonation failed: no token returned");
        }
      },
      onError: (e) => toast.error(e.message),
    })
  );
  const [confirmImpersonate, setConfirmImpersonate] = useState<{ id: number; email: string } | null>(null);

  const users = (usersQ.data as any)?.users ?? [];
  const filtered = users.filter(
    (u: any) =>
      !filter ||
      u.email?.toLowerCase().includes(filter.toLowerCase()) ||
      u.name?.toLowerCase().includes(filter.toLowerCase())
  );

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Bulk User Operations</h1>
        <p className="mb-6 text-sm text-gray-500">
          Select multiple users and approve or suspend them in a single transaction. All
          actions are recorded in the audit log.
        </p>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Filter by name or email…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-gold-500 focus:outline-none"
              aria-label="Filter users"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmApprove(true)}
              disabled={selected.size === 0 || approveM.isPending}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40 hover:bg-emerald-700"
            >
              <UserCheck className="h-4 w-4" /> Approve ({selected.size})
            </button>
            <button
              type="button"
              onClick={() => setConfirmSuspend(true)}
              disabled={selected.size === 0 || suspendM.isPending}
              className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40 hover:bg-red-700"
            >
              <ShieldOff className="h-4 w-4" /> Suspend ({selected.size})
            </button>
          </div>
        </div>

        <QueryState query={usersQ} isEmpty={() => filtered.length === 0} emptyLabel="No users match the filter.">
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 w-10"></th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((u: any) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        aria-label={`Select user ${u.email}`}
                        onClick={() => toggle(u.id)}
                        className="text-gray-500 hover:text-gold-600"
                      >
                        {selected.has(u.id) ? (
                          <CheckSquare className="h-4 w-4 text-gold-600" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                    <td className="px-3 py-2 font-medium text-gray-900">{u.name}</td>
                    <td className="px-3 py-2 text-gray-600">{u.email}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{u.role}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          u.status === "ACTIVE"
                            ? "bg-emerald-50 text-emerald-700"
                            : u.status === "SUSPENDED"
                            ? "bg-red-50 text-red-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {u.role !== "ADMIN" && (
                        <button
                          type="button"
                          onClick={() => setConfirmImpersonate({ id: u.id, email: u.email })}
                          className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                          title="Log in as this user (audited)"
                          aria-label={`Log in as ${u.email}`}
                        >
                          <LogIn className="h-3 w-3" /> Login as
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </QueryState>
      </div>

      <ConfirmModal
        open={confirmApprove}
        onClose={() => setConfirmApprove(false)}
        onConfirm={() => {
          approveM.mutate({ authToken: token ?? "", userIds: Array.from(selected) });
          setConfirmApprove(false);
        }}
        title={`Approve ${selected.size} user(s)?`}
        message="Pending users will become ACTIVE and receive a notification."
        confirmLabel="Approve all"
        tone="info"
        loading={approveM.isPending}
      />

      <ConfirmModal
        open={confirmSuspend}
        onClose={() => setConfirmSuspend(false)}
        onConfirm={() => {
          if (suspendReason.length < 5) {
            toast.error("Please provide a reason (min 5 chars)");
            return;
          }
          suspendM.mutate({
            authToken: token ?? "",
            userIds: Array.from(selected),
            reason: suspendReason,
          });
          setConfirmSuspend(false);
        }}
        title={`Suspend ${selected.size} user(s)?`}
        message={
          <div className="space-y-2">
            <p>Selected accounts will be SUSPENDED and unable to log in. Admins are excluded.</p>
            <textarea
              placeholder="Reason (required, recorded in audit log)…"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              className="w-full rounded-lg border border-gray-300 p-2 text-sm"
              rows={2}
              aria-label="Suspension reason"
            />
          </div>
        }
        confirmLabel="Suspend all"
        tone="danger"
        loading={suspendM.isPending}
      />
      <ConfirmModal
        open={!!confirmImpersonate}
        onClose={() => setConfirmImpersonate(null)}
        onConfirm={() => {
          if (confirmImpersonate) {
            impersonateM.mutate({
              authToken: token ?? "",
              targetUserId: confirmImpersonate.id,
            } as any);
            setConfirmImpersonate(null);
          }
        }}
        title={`Log in as ${confirmImpersonate?.email}?`}
        message="You will be logged out of your admin session and act as this user. This is recorded in the audit log. Log out and back in to restore your admin session."
        confirmLabel="Impersonate"
        tone="warning"
        loading={impersonateM.isPending}
      />
    </div>
  );
}
