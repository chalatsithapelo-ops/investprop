import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Menu,
  X,
  Bell,
  ChevronDown,
  LogOut,
  User,
  Building2,
  DollarSign,
  Briefcase,
  ShieldCheck,
  Banknote,
} from "lucide-react";
import {
  mainNavigationLinks,
  getNavigationLinksForRole,
} from "~/config/navigation";
import type { NavigationLink } from "~/config/navigation";
import { useAuthStore } from "~/stores/authStore";
import { useTRPC } from "~/trpc/react";

/* ─── dropdown group definitions ─── */
type NavGroup = {
  label: string;
  icon: React.ElementType;
  matchLabels: string[];
};

const navGroups: NavGroup[] = [
  {
    label: "Investments",
    icon: DollarSign,
    matchLabels: [
      "Investments",
      "Investment Opportunities",
      "My Investments",
      "Investment Preferences",
      "Investment Payments",
      "My Certificates",
      "Funding Campaigns",
    ],
  },
  {
    label: "Properties",
    icon: Building2,
    matchLabels: ["Property Flips", "Rental Bonds", "Developments"],
  },
  {
    label: "Finance",
    icon: Banknote,
    matchLabels: [
      "Payments",
      "Property Financials",
      "Distributions & Voting",
      "Share Marketplace",
      "Share Ledger",
    ],
  },
  {
    label: "Management",
    icon: Briefcase,
    matchLabels: [
      "SPV Management",
      "Acquisitions",
      "Project Management",
      "Contractor Management",
      "Contractor Portal",
      "Sale Proposals",
      "Owner Portal",
    ],
  },
  {
    label: "Compliance",
    icon: ShieldCheck,
    matchLabels: [
      "KYC Compliance",
      "FICA Verification",
      "Certificate Management",
      "FSCA Readiness",
      "Compliance Dashboard",
      "Legal Documents",
      "My Documents",
    ],
  },
];

const standaloneLabels = [
  "Dashboard",
  "My Portfolio",
  "Metrics",
  "Distressed Finder",
];

/* ─── helpers ─── */
function resolveGroups(links: NavigationLink[]) {
  const grouped: { group: NavGroup; items: NavigationLink[] }[] = [];
  const standalone: NavigationLink[] = [];
  const usedLabels = new Set<string>();

  for (const g of navGroups) {
    const items = links.filter((l) => g.matchLabels.includes(l.label));
    if (items.length > 0) {
      grouped.push({ group: g, items });
      items.forEach((i) => usedLabels.add(i.label));
    }
  }

  for (const l of links) {
    if (!usedLabels.has(l.label) && standaloneLabels.includes(l.label)) {
      standalone.push(l);
    }
  }

  return { grouped, standalone };
}

/* ─── dropdown component ─── */
function NavDropdown({
  group,
  items,
}: {
  group: NavGroup;
  items: NavigationLink[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const Icon = group.icon;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gold-600"
      >
        <Icon className="h-4 w-4" />
        {group.label}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 z-50 mt-1 w-60 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
          <div className="p-1.5">
            {items.map((item) => {
              const ItemIcon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-600 transition hover:bg-gray-100 hover:text-gold-600"
                >
                  {ItemIcon && <ItemIcon className="h-4 w-4 text-gray-500" />}
                  <div>
                    <div className="font-medium">{item.label}</div>
                    {item.description && (
                      <div className="mt-0.5 text-xs text-gray-500">
                        {item.description}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── main navbar ─── */
export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const trpc = useTRPC();

  const isLoggedIn = !!user;

  // Fetch unread notification count
  const notificationsQuery = useQuery({
    ...trpc.getNotifications.queryOptions({ unreadOnly: true, limit: 1 }),
    enabled: isLoggedIn,
    refetchInterval: 30_000, // Poll every 30 seconds
  });
  const unreadCount = (notificationsQuery.data as any)?.unreadCount ?? 0;

  const visibleLinks = getNavigationLinksForRole(
    mainNavigationLinks,
    (user?.role as any) ?? undefined,
  );

  const { grouped, standalone } = resolveGroups(visibleLinks);

  function handleLogout() {
    logout();
    navigate({ to: "/login" });
  }

  return (
    <nav className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur-xl">
      <div className="mx-auto w-full px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* ── Logo ── */}
          <Link
            to="/"
            className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-gray-900"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-gold-400 to-gold-600 shadow-lg shadow-gold-500/15">
              <Building2 className="h-5 w-5 text-gray-900" />
            </div>
            <span className="font-display">
              Invest<span className="text-gold-500">prop</span>
            </span>
          </Link>

          {/* ── Desktop links ── */}
          {isLoggedIn && (
            <div className="hidden items-center gap-1 lg:flex">
              {standalone.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.to}
                    to={link.to}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gold-600"
                  >
                    {Icon && <Icon className="h-4 w-4" />}
                    {link.label}
                  </Link>
                );
              })}

              {grouped.map(({ group, items }) => (
                <NavDropdown key={group.label} group={group} items={items} />
              ))}
            </div>
          )}

          {/* ── Right section ── */}
          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <>
                {/* Notification bell */}
                <button
                  type="button"
                  onClick={() => navigate({ to: "/dashboard" })}
                  className="relative rounded-lg p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gold-600"
                  aria-label="Notifications"
                >
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                </button>

                {/* User info */}
                <div className="hidden items-center gap-3 border-l border-gray-200 pl-4 md:flex">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gold-50 text-sm font-semibold text-gold-600">
                    {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
                  </div>
                  <div className="hidden flex-col xl:flex">
                    <span className="text-sm font-medium text-gray-900">
                      {user?.name}
                    </span>
                    <span className="rounded bg-gold-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-gold-600">
                      {user?.role?.replace(/_/g, " ")}
                    </span>
                  </div>
                </div>

                {/* Logout button — always visible on desktop */}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-red-500 md:flex"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden lg:inline">Logout</span>
                </button>

                {/* Mobile hamburger */}
                <button
                  type="button"
                  onClick={() => setMobileOpen((o) => !o)}
                  className="rounded-lg p-2 text-gray-600 transition hover:bg-gray-100 lg:hidden"
                  aria-label="Toggle menu"
                >
                  {mobileOpen ? (
                    <X className="h-6 w-6" />
                  ) : (
                    <Menu className="h-6 w-6" />
                  )}
                </button>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  to="/login"
                  className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition hover:text-gold-600"
                >
                  Login
                </Link>
                <Link
                  to="/register"
                  className="rounded-lg bg-gradient-to-r from-gold-500 to-gold-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-gold-500/15 transition hover:from-gold-400 hover:to-gold-500"
                >
                  Register
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Mobile slide-down panel ── */}
      {isLoggedIn && mobileOpen && (
        <div className="border-t border-gray-200 bg-white lg:hidden">
          <div className="space-y-1 px-4 py-4">
            {/* Standalone links */}
            {standalone.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gold-600"
                >
                  {Icon && <Icon className="h-4 w-4 text-gray-500" />}
                  {link.label}
                </Link>
              );
            })}

            {/* Grouped sections */}
            {grouped.map(({ group, items }) => {
              const GIcon = group.icon;
              return (
                <div key={group.label} className="pt-3">
                  <div className="flex items-center gap-2 px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <GIcon className="h-3.5 w-3.5" />
                    {group.label}
                  </div>
                  {items.map((item) => {
                    const IIcon = item.icon;
                    return (
                      <Link
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileOpen(false)}
                        className="flex items-center gap-3 rounded-lg px-3 py-2.5 pl-8 text-sm text-gray-600 transition hover:bg-gray-100 hover:text-gold-600"
                      >
                        {IIcon && (
                          <IIcon className="h-4 w-4 text-gray-500" />
                        )}
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              );
            })}

            {/* Mobile user section */}
            <div className="mt-4 border-t border-gray-200 pt-4">
              <div className="flex items-center gap-3 px-3 pb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-50 text-sm font-semibold text-gold-600">
                  {user?.name?.charAt(0)?.toUpperCase() ?? "U"}
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-900">
                    {user?.name}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gold-600">
                    {user?.role?.replace(/_/g, " ")}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  handleLogout();
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-500 transition hover:bg-gray-100"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
