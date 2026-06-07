import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Users, ShieldAlert, Building2, ArrowRight, Award } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/admin/team/")({
  component: AdminTeamPage,
});

const ADMIN_ROLES = ["ADMIN", "DEVELOPMENT_MANAGER"];
// Roles that can sponsor (own) deals on the platform.
const SPONSOR_ROLES = ["DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "PROPERTY_OWNER"];

const ROLE_LABEL: Record<string, string> = {
  DEVELOPMENT_MANAGER: "Development Manager",
  PROJECT_MANAGER: "Project Manager",
  PROPERTY_OWNER: "Property Owner",
};

function AdminTeamPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const isAdmin = ADMIN_ROLES.includes(user?.role ?? "");

  const q = useQuery({
    ...trpc.getAllUsers.queryOptions({ authToken: authToken ?? "", role: "ALL", page: 1, limit: 200 } as any),
    enabled: !!authToken && isAdmin,
  });

  if (!user || !authToken) return null;

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <ShieldAlert className="mx-auto mb-4 text-red-600" size={48} />
          <h1 className="text-2xl font-bold text-gray-900">Admin only</h1>
          <p className="mt-2 text-gray-500">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }

  const allUsers = ((q.data as any)?.users ?? []) as any[];
  const team = allUsers
    .filter((u) => SPONSOR_ROLES.includes(u.role))
    .sort((a, b) => (b._count?.properties ?? 0) - (a._count?.properties ?? 0));

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold-500/20 text-gold-400">
            <Users size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Team performance</h1>
            <p className="text-sm text-gray-400">
              Per-manager delivery scorecards. Internal oversight only — investors see the platform-wide track record.
            </p>
          </div>
        </div>

        {q.isLoading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gold-500 border-r-transparent" />
          </div>
        ) : team.length === 0 ? (
          <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-12 text-center">
            <Award className="mx-auto mb-3 text-gray-500" size={40} />
            <p className="text-lg font-medium text-white">No deal managers yet</p>
            <p className="mt-1 text-sm text-gray-400">
              Development managers, project managers and property owners who run deals will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {team.map((u) => (
              <Link
                key={u.id}
                to="/sponsors/$sponsorId"
                params={{ sponsorId: String(u.id) }}
                className="flex items-center justify-between rounded-xl border border-navy-800/50 bg-navy-900/50 p-4 transition hover:border-gold-500/50"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-navy-800 text-gold-400">
                    <Building2 size={18} />
                  </div>
                  <div>
                    <p className="font-semibold text-white">{u.name || u.email}</p>
                    <p className="text-xs text-gray-400">{ROLE_LABEL[u.role] ?? u.role}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-lg font-bold text-white">{u._count?.properties ?? 0}</p>
                    <p className="text-[10px] uppercase tracking-wide text-gray-500">deals</p>
                  </div>
                  <ArrowRight size={18} className="text-gray-500" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
