import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CreditCard, Check, Loader2, ShieldCheck, CalendarClock } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

export const Route = createFileRoute("/billing/")({
  component: BillingPage,
});

const ZAR = (n: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0,
  }).format(n ?? 0);

const fmtDate = (d: string | Date | null) =>
  d ? new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "—";

function BillingPage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const [verifying, setVerifying] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const subQuery = useQuery({
    ...trpc.getMySubscription.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
  });
  const sub = subQuery.data as any;

  // Handle Paystack callback (?reference=...)
  useEffect(() => {
    if (!authToken) return;
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference") ?? params.get("trxref");
    if (!reference) return;
    setVerifying(true);
    trpcClient.verifySubscription
      .mutate({ authToken, reference })
      .then((res: any) => {
        if (res.success) {
          toast.success("Subscription activated. Welcome aboard!");
          queryClient.invalidateQueries({ queryKey: trpc.getMySubscription.queryKey() });
        }
      })
      .catch((err: any) => {
        toast.error(err?.message ?? "We could not verify your payment.");
      })
      .finally(() => {
        setVerifying(false);
        window.history.replaceState({}, "", "/billing");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken]);

  const handleCancel = async () => {
    if (!authToken) return;
    setCancelling(true);
    try {
      const res = await trpcClient.cancelSubscription.mutate({ authToken });
      toast.success(`Subscription will end on ${fmtDate(res.accessUntil)}.`);
      queryClient.invalidateQueries({ queryKey: trpc.getMySubscription.queryKey() });
    } catch (err: any) {
      toast.error(err?.message ?? "Could not cancel subscription.");
    } finally {
      setCancelling(false);
    }
  };

  if (!user || !authToken) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-teal-100 p-2">
            <CreditCard className="text-teal-600" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Billing &amp; subscription</h1>
            <p className="text-sm text-gray-500">Manage your plan, trial and payments.</p>
          </div>
        </div>

        {verifying && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">
            <Loader2 className="animate-spin" size={16} /> Verifying your payment…
          </div>
        )}

        {subQuery.isLoading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-500">
            Loading…
          </div>
        ) : (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            {sub?.staffBypass && (
              <div className="mb-4 flex items-center gap-2 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-700">
                <ShieldCheck size={16} /> Your staff account has full access to all premium features.
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Current plan</p>
                <p className="text-2xl font-bold text-gray-900">{sub?.planName ?? "Starter"}</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  sub?.active ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600"
                }`}
              >
                {sub?.status ?? "NONE"}
              </span>
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-gray-500">Billing cycle</dt>
                <dd className="font-medium text-gray-900">
                  {sub?.priceAmount > 0 ? sub?.billingCycle : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Price</dt>
                <dd className="font-medium text-gray-900">
                  {sub?.priceAmount > 0 ? ZAR(sub.priceAmount) : "Free"}
                </dd>
              </div>
              {sub?.trialEndsAt && sub?.status === "TRIALING" && (
                <div>
                  <dt className="text-gray-500">Trial ends</dt>
                  <dd className="font-medium text-gray-900">{fmtDate(sub.trialEndsAt)}</dd>
                </div>
              )}
              {sub?.currentPeriodEnd && (
                <div>
                  <dt className="flex items-center gap-1 text-gray-500">
                    <CalendarClock size={14} /> Renews / ends
                  </dt>
                  <dd className="font-medium text-gray-900">{fmtDate(sub.currentPeriodEnd)}</dd>
                </div>
              )}
            </dl>

            {sub?.cancelAtPeriodEnd && (
              <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                Your subscription is set to cancel at the end of the current period.
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/pricing"
                className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700"
              >
                {sub?.tier === "FREE" ? "Upgrade plan" : "Change plan"}
              </Link>
              {sub?.tier !== "FREE" && !sub?.cancelAtPeriodEnd && (
                <button
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  {cancelling ? "Cancelling…" : "Cancel subscription"}
                </button>
              )}
            </div>

            {sub?.capabilities?.length > 0 && (
              <div className="mt-6 border-t border-gray-100 pt-4">
                <p className="mb-2 text-sm font-medium text-gray-700">Included in your plan</p>
                <ul className="grid gap-1 sm:grid-cols-2">
                  {sub.capabilities.map((c: string) => (
                    <li key={c} className="flex items-center gap-2 text-sm text-gray-600">
                      <Check className="text-teal-600" size={14} />
                      {c.replace(/_/g, " ").toLowerCase()}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
