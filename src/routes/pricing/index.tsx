import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Check, Sparkles, Loader2 } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

export const Route = createFileRoute("/pricing/")({
  component: PricingPage,
});

const ZAR = (n: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(n ?? 0);

type Plan = {
  tier: string;
  name: string;
  tagline: string;
  description: string;
  monthlyPrice: number;
  annualPrice: number;
  features: string[];
  highlighted: boolean;
  standalone: boolean;
};

function PricingPage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const [cycle, setCycle] = useState<"MONTHLY" | "ANNUAL">("MONTHLY");
  const [busyTier, setBusyTier] = useState<string | null>(null);

  const plansQuery = useQuery(trpc.getSubscriptionPlans.queryOptions());
  const plans = (plansQuery.data as Plan[] | undefined) ?? [];

  const investorPlans = plans.filter((p) => !p.standalone);
  const standalonePlans = plans.filter((p) => p.standalone);

  const handleSubscribe = async (tier: string) => {
    if (!authToken) {
      navigate({ to: "/login" });
      return;
    }
    if (tier === "FREE") {
      navigate({ to: "/dashboard" });
      return;
    }
    setBusyTier(tier);
    try {
      const callbackUrl = `${window.location.origin}/billing?ref=pending`;
      const res = await trpcClient.initializeSubscription.mutate({
        authToken,
        tier: tier as any,
        billingCycle: cycle,
        callbackUrl,
      });
      window.location.href = res.authorizationUrl;
    } catch (err: any) {
      toast.error(err?.message ?? "Could not start checkout. Please try again.");
      setBusyTier(null);
    }
  };

  const priceFor = (p: Plan) => (cycle === "ANNUAL" ? p.annualPrice : p.monthlyPrice);

  const renderCard = (p: Plan) => {
    const price = priceFor(p);
    return (
      <div
        key={p.tier}
        className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm ${
          p.highlighted ? "border-teal-500 ring-2 ring-teal-500" : "border-gray-200"
        }`}
      >
        {p.highlighted && (
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-teal-600 px-3 py-1 text-xs font-semibold text-white">
            Most popular
          </span>
        )}
        <h3 className="text-lg font-bold text-gray-900">{p.name}</h3>
        <p className="mt-1 text-sm text-gray-500">{p.tagline}</p>
        <div className="mt-4">
          <span className="text-3xl font-extrabold text-gray-900">
            {price === 0 ? "Free" : ZAR(price)}
          </span>
          {price > 0 && (
            <span className="text-sm text-gray-500">/{cycle === "ANNUAL" ? "year" : "month"}</span>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {price === 0
            ? "No card required — free forever"
            : cycle === "ANNUAL"
              ? "Billed yearly · 2 months free · cancel anytime"
              : "Billed monthly · cancel anytime · no lock-in"}
        </p>
        <p className="mt-2 text-sm text-gray-600">{p.description}</p>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
          What&apos;s included
        </p>
        <ul className="mt-2 flex-1 space-y-2">
          {p.features.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
              <Check className="mt-0.5 shrink-0 text-teal-600" size={16} />
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <button
          onClick={() => handleSubscribe(p.tier)}
          disabled={busyTier === p.tier}
          className={`mt-6 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
            p.highlighted || p.standalone
              ? "bg-teal-600 text-white hover:bg-teal-700"
              : "border border-gray-300 text-gray-800 hover:bg-gray-50"
          } disabled:opacity-60`}
        >
          {busyTier === p.tier && <Loader2 className="animate-spin" size={16} />}
          {p.tier === "FREE" ? "Get started" : "Subscribe"}
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-teal-50 px-3 py-1 text-sm font-medium text-teal-700">
            <Sparkles size={14} /> Plans &amp; pricing
          </div>
          <h1 className="mt-4 text-3xl font-extrabold text-gray-900 sm:text-4xl">
            Invest smarter with the right plan
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-gray-600">
            InvestProp lets everyday South Africans co-invest in vetted property deals from
            R1,000 — the platform itself is free to join. These plans are optional add-ons that
            unlock AI tools and our distressed-property engine. Cancel anytime.
          </p>

          <div className="mt-6 inline-flex items-center rounded-lg border border-gray-200 bg-white p-1">
            <button
              onClick={() => setCycle("MONTHLY")}
              className={`rounded-md px-4 py-1.5 text-sm font-medium ${
                cycle === "MONTHLY" ? "bg-teal-600 text-white" : "text-gray-600"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setCycle("ANNUAL")}
              className={`rounded-md px-4 py-1.5 text-sm font-medium ${
                cycle === "ANNUAL" ? "bg-teal-600 text-white" : "text-gray-600"
              }`}
            >
              Annual <span className="text-xs opacity-80">(2 months free)</span>
            </button>
          </div>
        </div>

        {/* New-visitor explainer */}
        <div className="mx-auto mt-10 grid max-w-5xl gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-bold text-gray-900">What is InvestProp?</h3>
            <p className="mt-1.5 text-sm text-gray-600">
              A South African platform for fractional property investing. We vet a property,
              place it in a ring-fenced company (SPV), and you buy shares from R1,000 — earning
              a share of the rental income and any growth in value.
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-bold text-gray-900">Who is it for?</h3>
            <p className="mt-1.5 text-sm text-gray-600">
              Everyday investors who want property exposure without buying a whole house,
              bargain hunters chasing distressed &amp; auction deals, and property owners who
              want to sell to us. There&apos;s a plan for each.
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="text-sm font-bold text-gray-900">What am I paying for?</h3>
            <p className="mt-1.5 text-sm text-gray-600">
              Browsing and investing are free. A paid plan is a monthly subscription that adds
              extra tools — the AI deal co-pilot, portfolio insights, and full access to our
              distressed-property engine with alerts. It is not the cost of the property itself.
            </p>
          </div>
        </div>

        {plansQuery.isLoading ? (
          <div className="mt-12 text-center text-gray-500">Loading plans…</div>
        ) : (
          <>
            <div className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {investorPlans.map(renderCard)}
            </div>

            {standalonePlans.length > 0 && (
              <div className="mt-16">
                <div className="text-center">
                  <h2 className="text-2xl font-bold text-gray-900">Standalone products</h2>
                  <p className="mx-auto mt-2 max-w-2xl text-gray-600">
                    Specialist subscriptions you can buy on their own — you don&apos;t need an
                    investor plan. Pick these if you only want distressed-deal alerts, or if
                    you&apos;re a property owner selling to us.
                  </p>
                </div>
                <div className="mx-auto mt-8 grid max-w-md gap-6">
                  {standalonePlans.map(renderCard)}
                </div>
                <div className="mt-6 text-center">
                  <Link to="/distressed-deals" className="text-sm font-medium text-teal-700 hover:underline">
                    Learn more about DistressedDeals SA →
                  </Link>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
