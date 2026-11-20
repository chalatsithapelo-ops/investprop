import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Users,
  ShieldAlert,
  Search,
  Mail,
  Phone,
  CheckCircle2,
  Clock,
  Landmark,
  Scale,
  HardHat,
  Building2,
  TrendingUp,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/admin/directory/")({
  component: AdminDirectoryPage,
});

const OVERSIGHT_ROLES = ["ADMIN", "DEVELOPMENT_MANAGER", "PROJECT_MANAGER", "COMPLIANCE_OFFICER"];

const ROLE_META: Record<string, { label: string; icon: any; color: string }> = {
  INVESTOR: { label: "Investors", icon: TrendingUp, color: "text-teal-600 bg-teal-50" },
  PROPERTY_OWNER: { label: "Property Owners", icon: Building2, color: "text-purple-600 bg-purple-50" },
  CONVEYANCER: { label: "Conveyancers", icon: Scale, color: "text-blue-600 bg-blue-50" },
  BOND_ORIGINATOR: { label: "Bond Originators", icon: Landmark, color: "text-amber-600 bg-amber-50" },
  COMPLIANCE_OFFICER: { label: "Compliance Officers", icon: ShieldCheck, color: "text-rose-600 bg-rose-50" },
  DEVELOPMENT_MANAGER: { label: "Development Managers", icon: UserCog, color: "text-gold-700 bg-gold-50" },
  PROJECT_MANAGER: { label: "Project Managers", icon: UserCog, color: "text-gold-700 bg-gold-50" },
  CONTRACTOR: { label: "Contractors", icon: HardHat, color: "text-orange-600 bg-orange-50" },
  ADMIN: { label: "Administrators", icon: ShieldCheck, color: "text-gray-700 bg-gray-100" },
};

// Display order for role groups.
const ROLE_ORDER = [
  "INVESTOR",
  "PROPERTY_OWNER",
  "CONVEYANCER",
  "BOND_ORIGINATOR",
  "COMPLIANCE_OFFICER",
  "DEVELOPMENT_MANAGER",
  "PROJECT_MANAGER",
  "CONTRACTOR",
  "ADMIN",
];

function AdminDirectoryPage() {
  const trpc = useTRPC();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) void navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const isAllowed = OVERSIGHT_ROLES.includes(user?.role ?? "");

  const q = useQuery({
    ...trpc.getPeopleDirectory.queryOptions({ search: search || undefined }),
    enabled: !!authToken && isAllowed,
  });

  const grouped = useMemo(() => {
    const people = q.data?.people ?? [];
    const filtered = roleFilter === "ALL" ? people : people.filter((p: any) => p.role === roleFilter);
    const byRole: Record<string, any[]> = {};
    for (const p of filtered) (byRole[p.role] ??= []).push(p);
    return byRole;
  }, [q.data, roleFilter]);

  if (!user || !authToken) return null;
  if (!isAllowed) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <ShieldAlert className="mx-auto mb-4 text-red-600" size={48} />
          <h1 className="text-2xl font-bold text-gray-900">Access restricted</h1>
          <p className="mt-2 text-gray-500">Only the admin team can view the people directory.</p>
        </div>
      </div>
    );
  }

  const counts = q.data?.countsByRole ?? {};

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Navbar />
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-xl bg-gold-500/20 p-2.5 text-gold-600">
            <Users size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold">People directory</h1>
            <p className="text-sm text-gray-500">
              Everyone on the platform — investors, owners, conveyancers, bond originators, compliance & staff.
            </p>
          </div>
        </div>

        {/* Role chips */}
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setRoleFilter("ALL")}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${roleFilter === "ALL" ? "bg-gold-500 text-white" : "bg-white text-gray-600 border border-gray-200"}`}
          >
            All ({q.data?.total ?? 0})
          </button>
          {ROLE_ORDER.filter((r) => counts[r]).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${roleFilter === r ? "bg-gold-500 text-white" : "bg-white text-gray-600 border border-gray-200"}`}
            >
              {ROLE_META[r]?.label ?? r} ({counts[r]})
            </button>
          ))}
        </div>

        <div className="relative mb-6 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or investor code…"
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-gold-500 focus:outline-none"
          />
        </div>

        {q.isLoading ? (
          <div className="flex justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-gold-500 border-r-transparent" />
          </div>
        ) : (
          <div className="space-y-8">
            {ROLE_ORDER.filter((r) => grouped[r]?.length).map((role) => {
              const meta = ROLE_META[role] ?? { label: role, icon: Users, color: "text-gray-600 bg-gray-100" };
              const Icon = meta.icon;
              return (
                <section key={role}>
                  <div className="mb-3 flex items-center gap-2">
                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${meta.color}`}>
                      <Icon size={15} />
                    </span>
                    <h2 className="text-lg font-semibold">{meta.label}</h2>
                    <span className="text-sm text-gray-400">({grouped[role].length})</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {grouped[role].map((p: any) => (
                      <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-4">
                        <div className="flex items-start justify-between">
                          <p className="font-semibold text-gray-900">{p.name || "—"}</p>
                          {p.status !== "ACTIVE" && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                              {p.status}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 space-y-0.5 text-xs text-gray-500">
                          <p className="inline-flex items-center gap-1 break-all"><Mail size={11} />{p.email}</p>
                          {p.phoneNumber && <p className="inline-flex items-center gap-1"><Phone size={11} />{p.phoneNumber}</p>}
                          {p.investorCode && <p>Code: {p.investorCode}</p>}
                          {p.partnerFirm && <p>Firm: {p.partnerFirm}</p>}
                          {p.complianceOfficerLicense && <p>Licence: {p.complianceOfficerLicense}</p>}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                          {role === "INVESTOR" && (
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${p.ficaVerified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                              {p.ficaVerified ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                              {p.ficaVerified ? "FICA verified" : "FICA pending"}
                            </span>
                          )}
                          {p.investmentCount > 0 && (
                            <span className="rounded-full bg-teal-50 px-2 py-0.5 text-teal-700">{p.investmentCount} investment{p.investmentCount === 1 ? "" : "s"}</span>
                          )}
                          {p.propertyCount > 0 && (
                            <span className="rounded-full bg-purple-50 px-2 py-0.5 text-purple-700">{p.propertyCount} propert{p.propertyCount === 1 ? "y" : "ies"}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
