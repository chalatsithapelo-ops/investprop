import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Shield, Users, Building, Activity, Settings, X, AlertTriangle, Pencil, KeyRound, Trash2 } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

export const Route = createFileRoute("/admin/")({
  component: AdminPage,
});

function AdminPage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [tab, setTab] = useState<"overview" | "users" | "audit">("overview");
  const [searchUser, setSearchUser] = useState("");
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("");
  const [resettingUser, setResettingUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");
  const [deletingUser, setDeletingUser] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const isManager = user?.role === "DEVELOPMENT_MANAGER";

  const statsQuery = useQuery({
    ...trpc.getSystemStats.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isManager,
  });

  const usersQuery = useQuery({
    ...trpc.getAllUsers.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isManager,
  });

  const auditQuery = useQuery({
    ...trpc.getAuditLogs.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken && isManager,
  });

  const stats = statsQuery.data as any;
  const allUsers = (usersQuery.data as any)?.users ?? usersQuery.data ?? [];
  const usersArr = Array.isArray(allUsers) ? allUsers : [];
  const auditLogs = (auditQuery.data as any)?.logs ?? auditQuery.data ?? [];
  const auditArr = Array.isArray(auditLogs) ? auditLogs : [];

  const filteredUsers = usersArr.filter((u: any) =>
    !searchUser || (u.name ?? u.email ?? "").toLowerCase().includes(searchUser.toLowerCase())
  );

  const totalUsers = stats?.totalUsers ?? usersArr.length;
  const activeUsers = stats?.activeUsers ?? usersArr.filter((u: any) => u.status === "ACTIVE" || u.isActive).length;
  const totalProperties = stats?.totalProperties ?? 0;
  const revenue = stats?.revenue ?? stats?.totalRevenue ?? 0;

  if (!user || !authToken) return null;

  const handleEditUser = async () => {
    if (!editingUser) return;
    setSubmitting(true);
    try {
      await trpcClient.updateUser.mutate({
        authToken: authToken!,
        userId: editingUser.id,
        name: editName || undefined,
        email: editEmail || undefined,
        role: editRole || undefined,
      });
      toast.success("User updated successfully");
      setEditingUser(null);
      queryClient.invalidateQueries({ queryKey: trpc.getAllUsers.queryKey() });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to update user");
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resettingUser || !newPassword) return;
    if (newPassword.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    setSubmitting(true);
    try {
      await trpcClient.resetUserPassword.mutate({
        authToken: authToken!,
        userId: resettingUser.id,
        newPassword,
      });
      toast.success("Password reset successfully");
      setResettingUser(null);
      setNewPassword("");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to reset password");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    setSubmitting(true);
    try {
      await trpcClient.deleteUser.mutate({
        authToken: authToken!,
        userId: deletingUser.id,
      });
      toast.success("User deleted successfully");
      setDeletingUser(null);
      queryClient.invalidateQueries({ queryKey: trpc.getAllUsers.queryKey() });
    } catch (err: any) {
      toast.error(err.message ?? "Failed to delete user");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isManager) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="flex flex-col items-center justify-center py-32">
          <Shield className="mb-4 text-red-600" size={48} />
          <h2 className="text-xl font-bold text-gray-900">Access Denied</h2>
          <p className="mt-2 text-gray-500">Only Development Managers can access the admin panel.</p>
        </div>
      </div>
    );
  }

  if (statsQuery.isLoading) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold-500 border-r-transparent"></div>
        </div>
      </div>
    );
  }

  const roleBadge = (role: string) => {
    const map: Record<string, string> = {
      DEVELOPMENT_MANAGER: "bg-gold-500/20 text-gold-600",
      PROPERTY_OWNER: "bg-purple-500/20 text-purple-600",
      INVESTOR: "bg-emerald-500/20 text-emerald-600",
      CONTRACTOR: "bg-blue-500/20 text-blue-600",
      ADMIN: "bg-red-500/20 text-red-600",
    };
    return map[role] ?? "bg-gray-500/20 text-gray-500";
  };

  const statCards = [
    { label: "Total Users", value: totalUsers, icon: Users, color: "text-blue-600", bg: "bg-blue-50" },
    { label: "Active Users", value: activeUsers, icon: Activity, color: "text-emerald-600", bg: "bg-emerald-50" },
    { label: "Total Properties", value: totalProperties, icon: Building, color: "text-purple-600", bg: "bg-purple-50" },
    { label: "Revenue", value: `R${Number(revenue).toLocaleString()}`, icon: Settings, color: "text-gold-600", bg: "bg-gold-50" },
  ];

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <Shield className="text-gold-600" size={32} />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Admin Panel</h1>
              <p className="mt-1 text-gray-500">System management and user administration</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-lg bg-navy-900 p-1">
          {(["overview", "users", "audit"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
                tab === t ? "bg-gold-500 text-navy-950" : "text-gray-500 hover:text-gold-600"
              }`}
            >
              {t === "overview" ? <Activity size={16} /> : t === "users" ? <Users size={16} /> : <Shield size={16} />}
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {tab === "overview" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
        )}

        {/* Users Tab */}
        {tab === "users" && (
          <div>
            <div className="mb-4">
              <input
                type="text"
                value={searchUser}
                onChange={(e) => setSearchUser(e.target.value)}
                placeholder="Search users..."
                className="w-full max-w-md rounded-lg border border-navy-700 bg-navy-900 px-4 py-2 text-gray-900 placeholder-gray-500 focus:border-gold-500 focus:outline-none"
              />
            </div>
            <div className="overflow-x-auto rounded-xl border border-navy-800/50">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-navy-800 bg-navy-900/80">
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Joined</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-800/50">
                  {filteredUsers.length > 0 ? filteredUsers.map((u: any, i: number) => (
                    <tr key={u.id ?? i} className="bg-navy-900/30 hover:bg-navy-800/30 transition">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{u.name ?? "N/A"}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{u.email}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${roleBadge(u.role)}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.status === "ACTIVE" || u.isActive || u.emailVerified ? "bg-emerald-500/20 text-emerald-600" : "bg-gray-500/20 text-gray-500"}`}>
                          {u.status ?? (u.isActive || u.emailVerified ? "Active" : "Inactive")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{u.createdAt ? new Date(u.createdAt).toLocaleDateString("en-ZA") : "N/A"}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => { setEditingUser(u); setEditName(u.name ?? ""); setEditEmail(u.email ?? ""); setEditRole(u.role ?? ""); }} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 transition"><Pencil size={12} /> Edit</button>
                          <button onClick={() => { setResettingUser(u); setNewPassword(""); }} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-amber-600 hover:bg-amber-50 transition"><KeyRound size={12} /> Reset PW</button>
                          {u.id !== user?.id && <button onClick={() => setDeletingUser(u)} className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50 transition"><Trash2 size={12} /> Delete</button>}
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">No users found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Audit Tab */}
        {tab === "audit" && (
          <div className="overflow-x-auto rounded-xl border border-navy-800/50">
            <table className="w-full">
              <thead>
                <tr className="border-b border-navy-800 bg-navy-900/80">
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Timestamp</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">User</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Action</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800/50">
                {auditArr.length > 0 ? auditArr.map((log: any, i: number) => (
                  <tr key={log.id ?? i} className="bg-navy-900/30 hover:bg-navy-800/30 transition">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                      {log.createdAt ?? log.timestamp ? new Date(log.createdAt ?? log.timestamp).toLocaleString("en-ZA") : "N/A"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">{log.userName ?? log.user?.name ?? log.userId ?? "System"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-navy-800 px-2 py-0.5 text-xs font-medium text-gold-600">{log.action ?? log.type}</span>
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-sm text-gray-500">{log.details ?? log.description ?? log.message ?? "-"}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">No audit logs available</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Edit User</h3>
              <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
                <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Role</label>
                <select value={editRole} onChange={(e) => setEditRole(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none">
                  <option value="INVESTOR">Investor</option>
                  <option value="PROPERTY_OWNER">Property Owner</option>
                  <option value="DEVELOPMENT_MANAGER">Development Manager</option>
                  <option value="PROJECT_MANAGER">Project Manager</option>
                  <option value="CONTRACTOR">Contractor</option>
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setEditingUser(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleEditUser} disabled={submitting} className="rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-white hover:bg-gold-600 disabled:opacity-50">
                {submitting ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resettingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Reset Password</h3>
              <button onClick={() => setResettingUser(null)} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
            </div>
            <p className="mb-4 text-sm text-gray-500">Reset password for <strong>{resettingUser.name ?? resettingUser.email}</strong></p>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">New Password</label>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Minimum 8 characters" className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none" />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setResettingUser(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleResetPassword} disabled={submitting || newPassword.length < 8} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50">
                {submitting ? "Resetting..." : "Reset Password"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete User Modal */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-full bg-red-100 p-2"><AlertTriangle className="text-red-600" size={20} /></div>
              <h3 className="text-lg font-bold text-gray-900">Delete User</h3>
            </div>
            <p className="mb-2 text-sm text-gray-600">Are you sure you want to permanently delete this user?</p>
            <div className="mb-4 rounded-lg bg-red-50 p-3">
              <p className="text-sm font-medium text-red-800">{deletingUser.name ?? "N/A"}</p>
              <p className="text-xs text-red-600">{deletingUser.email} &middot; {deletingUser.role}</p>
            </div>
            <p className="text-xs text-gray-400">This action cannot be undone. All associated data may be affected.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setDeletingUser(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleDeleteUser} disabled={submitting} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                {submitting ? "Deleting..." : "Delete User"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
