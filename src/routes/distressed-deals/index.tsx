import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Gavel, TrendingDown, BellRing, ShieldCheck, Sparkles, Loader2, MapPin } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

export const Route = createFileRoute("/distressed-deals/")({
  component: DistressedDealsLanding,
});

const ZAR = (n: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(n ?? 0);

const FEATURES = [
  {
    icon: Gavel,
    title: "Every auction, one place",
    body: "Sheriff sales, bank repossessions and liquidation stock aggregated daily from across South Africa.",
  },
  {
    icon: Sparkles,
    title: "AI deal grades (A–E)",
    body: "Each listing is screened and graded on upside and risk so you focus only on the best opportunities.",
  },
  {
    icon: BellRing,
    title: "Instant filtered alerts",
    body: "Set your province, budget and discount filters once — we email and push every matching new deal.",
  },
  {
    icon: ShieldCheck,
    title: "Partner introductions",
    body: "One-tap intros to vetted bond originators and conveyancers to close your deal faster.",
  },
];

function DistressedDealsLanding() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const [busy, setBusy] = useState(false);

  const plansQuery = useQuery(trpc.getSubscriptionPlans.queryOptions());
  const plan = (plansQuery.data as any[] | undefined)?.find((p) => p.tier === "DISTRESSED");

  const handleSubscribe = async () => {
    if (!authToken) {
      navigate({ to: "/login" });
      return;
    }
    setBusy(true);
    try {
      const callbackUrl = `${window.location.origin}/billing?ref=pending`;
      const res = await trpcClient.initializeSubscription.mutate({
        authToken,
        tier: "DISTRESSED" as any,
        billingCycle: "MONTHLY",
        callbackUrl,
      });
      window.location.href = res.authorizationUrl;
    } catch (err: any) {
      toast.error(err?.message ?? "Could not start checkout.");
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-900 to-teal-900 text-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm">
            <TrendingDown size={14} /> DistressedDeals SA
          </div>
          <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-tight sm:text-5xl">
            South Africa's distressed &amp; auction property engine
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-teal-100">
            Find below-market properties before everyone else. AI-graded, filtered to your
            strategy, and delivered to your inbox daily.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <button
              onClick={handleSubscribe}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-500 px-6 py-3 font-semibold text-white hover:bg-teal-400 disabled:opacity-60"
            >
              {busy && <Loader2 className="animate-spin" size={18} />}
              {plan ? `Start for ${ZAR(plan.monthlyPrice)}/mo` : "Get started"}
            </button>
            <Link
              to="/distressed-deals/browse"
              className="rounded-lg border border-white/30 px-6 py-3 font-semibold text-white hover:bg-white/10"
            >
              Browse live deals
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-gray-200 p-6">
              <div className="inline-flex rounded-lg bg-teal-100 p-2 text-teal-600">
                <f.icon size={22} />
              </div>
              <h3 className="mt-4 font-bold text-gray-900">{f.title}</h3>
              <p className="mt-2 text-sm text-gray-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing strip */}
      {plan && (
        <section className="bg-gray-50">
          <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="rounded-2xl border border-teal-200 bg-white p-8 shadow-sm">
              <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{plan.name}</h2>
                  <p className="mt-1 text-gray-600">{plan.description}</p>
                  <ul className="mt-4 space-y-1 text-sm text-gray-700">
                    {plan.features.map((feat: string) => (
                      <li key={feat} className="flex items-center gap-2">
                        <MapPin size={14} className="text-teal-600" /> {feat}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-extrabold text-gray-900">
                    {ZAR(plan.monthlyPrice)}
                    <span className="text-base font-normal text-gray-500">/mo</span>
                  </div>
                  <p className="text-xs text-gray-500">or {ZAR(plan.annualPrice)}/year</p>
                  <button
                    onClick={handleSubscribe}
                    disabled={busy}
                    className="mt-4 w-full rounded-lg bg-teal-600 px-6 py-3 font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
                  >
                    Subscribe now
                  </button>
                </div>
              </div>
            </div>
            <p className="mt-4 text-center text-sm text-gray-500">
              Already subscribed?{" "}
              <Link to="/distressed-alerts" className="font-medium text-teal-700 hover:underline">
                Set up your deal alerts →
              </Link>
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
