import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { DollarSign, TrendingUp, Settings, Target, ArrowRight, Award } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/investments/")({
  component: InvestmentsHubPage,
});

function InvestmentsHubPage() {
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  if (!user || !authToken) return null;

  const role = (user as any)?.role ?? "INVESTOR";

  const investorLinks = [
    {
      title: "Investment Opportunities",
      description:
        "Browse available properties and invest in fractional shares across South Africa's top property markets.",
      href: "/investments/opportunities",
      icon: TrendingUp,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      title: "My Contributions",
      description:
        "Track your investments, returns, and portfolio performance across all properties.",
      href: "/investments/my-contributions",
      icon: DollarSign,
      color: "text-gold-600",
      bg: "bg-gold-50",
    },
    {
      title: "Investment Preferences",
      description:
        "Set your preferred property types, risk tolerance, and investment range to receive tailored opportunities.",
      href: "/investments/preferences",
      icon: Settings,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      title: "My Certificates",
      description:
        "View your share certificates proving fractional ownership in each property you've invested in.",
      href: "/investments/certificates",
      icon: Award,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      title: "Funding Campaigns",
      description:
        "View active funding campaigns and participate in property crowdfunding rounds.",
      href: "/funding-campaigns",
      icon: Target,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
  ];

  const adminLinks = [
    {
      title: "Investment Opportunities",
      description:
        "Manage and publish investment opportunities for investors on the platform.",
      href: "/investments/opportunities",
      icon: TrendingUp,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      title: "Funding Campaigns",
      description:
        "Create, manage and monitor funding campaigns for property acquisitions.",
      href: "/funding-campaigns",
      icon: Target,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
  ];

  const links =
    role === "DEVELOPMENT_MANAGER" || role === "PROJECT_MANAGER" || role === "PROPERTY_OWNER" || role === "OWNER" ? adminLinks : investorLinks;

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <DollarSign className="text-gold-600" size={32} />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Investments</h1>
              <p className="mt-1 text-gray-500">
                Manage your fractional property investments across South Africa
              </p>
            </div>
          </div>
        </div>

        {/* Navigation Cards */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {links.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className="group rounded-xl border border-navy-800/50 bg-navy-900/50 p-6 transition-all hover:border-gold-300 hover:bg-navy-900/80"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className={`rounded-lg ${item.bg} p-3`}>
                    <item.icon className={item.color} size={24} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 transition-colors group-hover:text-gold-600">
                      {item.title}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-gray-500">
                      {item.description}
                    </p>
                  </div>
                </div>
                <ArrowRight
                  className="mt-1 text-gray-600 transition-colors group-hover:text-gold-600"
                  size={20}
                />
              </div>
            </Link>
          ))}
        </div>

        {/* Quick Info */}
        <div className="mt-8 rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
          <h3 className="mb-3 text-lg font-semibold text-gray-900">
            About Fractional Property Investment
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg bg-navy-800/30 p-4">
              <p className="mb-1 text-sm font-medium text-gold-600">
                Low Minimum Entry
              </p>
              <p className="text-xs text-gray-500">
                Start investing in premium SA properties from as little as
                R1,000
              </p>
            </div>
            <div className="rounded-lg bg-navy-800/30 p-4">
              <p className="mb-1 text-sm font-medium text-gold-600">
                Diversified Portfolio
              </p>
              <p className="text-xs text-gray-500">
                Spread your investment across multiple properties and locations
              </p>
            </div>
            <div className="rounded-lg bg-navy-800/30 p-4">
              <p className="mb-1 text-sm font-medium text-gold-600">
                Regulated & Transparent
              </p>
              <p className="text-xs text-gray-500">
                FSCA-aligned compliance with full disclosure on fees and risks
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
