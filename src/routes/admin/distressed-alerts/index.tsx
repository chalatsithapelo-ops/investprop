import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BellRing, Send, Eye, Users, Mail, Target } from "lucide-react";
import toast from "react-hot-toast";
import { Navbar } from "~/components/Navbar";
import { useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/admin/distressed-alerts/")({
  component: AdminDistressedAlertsPage,
});

type RunResult = {
  subscribersChecked: number;
  matchedSubscribers: number;
  totalMatches: number;
  emailsSent: number;
  dryRun: boolean;
};

function AdminDistressedAlertsPage() {
  const trpcClient = useTRPCClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const [running, setRunning] = useState<"dry" | "live" | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const isManager = user?.role === "ADMIN" || user?.role === "DEVELOPMENT_MANAGER";

  const runAlerts = async (dryRun: boolean) => {
    setRunning(dryRun ? "dry" : "live");
    try {
      const res = (await trpcClient.runDistressedSubscriberAlerts.mutate({
        authToken: authToken ?? "",
        dryRun,
      })) as RunResult;
      setResult(res);
      if (dryRun) {
        toast.success(
          `Preview: ${res.matchedSubscribers} subscriber(s) would get ${res.totalMatches} match(es).`,
        );
      } else {
        toast.success(`Sent ${res.emailsSent} alert email(s) to ${res.matchedSubscribers} subscriber(s).`);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to run distressed-deal alerts.");
    } finally {
      setRunning(null);
    }
  };

  if (!user || !authToken) return null;
  if (!isManager) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="mx-auto max-w-3xl px-4 py-16 text-center">
          <h1 className="text-xl font-bold text-gray-900">Admin access required</h1>
        </div>
      </div>
    );
  }

  const cards = result
    ? [
        { label: "Subscribers checked", value: result.subscribersChecked, icon: Users, color: "text-blue-600" },
        { label: "Matched subscribers", value: result.matchedSubscribers, icon: Target, color: "text-purple-600" },
        { label: "Total matches", value: result.totalMatches, icon: BellRing, color: "text-amber-600" },
        { label: "Emails sent", value: result.emailsSent, icon: Mail, color: "text-emerald-600" },
      ]
    : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Distressed-deal alerts</h1>
          <p className="text-sm text-gray-500">
            Match new distressed listings against each subscriber's filters and notify entitled subscribers by
            push and email. Normally runs on a schedule — use this to trigger a run on demand.
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <BellRing size={22} />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-semibold text-gray-900">Run alerts now</h2>
              <p className="mt-1 text-sm text-gray-500">
                Preview first to see who would be matched without sending anything. Only subscribers entitled to the
                <span className="font-medium"> Distressed Alerts</span> feature receive notifications.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={() => runAlerts(true)}
                  disabled={running !== null}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                >
                  <Eye size={16} className={running === "dry" ? "animate-pulse" : ""} />
                  {running === "dry" ? "Previewing…" : "Preview (dry run)"}
                </button>
                <button
                  onClick={() => runAlerts(false)}
                  disabled={running !== null}
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                >
                  <Send size={16} className={running === "live" ? "animate-pulse" : ""} />
                  {running === "live" ? "Sending…" : "Run & send alerts"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {result && (
          <div className="mt-6">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-gray-600">
              {result.dryRun ? (
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                  Dry run — nothing sent
                </span>
              ) : (
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                  Alerts delivered
                </span>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {cards.map((c) => {
                const Icon = c.icon;
                return (
                  <div key={c.label} className="rounded-xl border border-gray-200 bg-white p-4">
                    <Icon size={18} className={c.color} />
                    <p className="mt-2 text-2xl font-bold text-gray-900">{c.value}</p>
                    <p className="text-xs text-gray-500">{c.label}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
