import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BellRing, Loader2, Lock } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

export const Route = createFileRoute("/distressed-alerts/")({
  component: DistressedAlertsPage,
});

const PROVINCES = [
  "Gauteng",
  "Western Cape",
  "KwaZulu-Natal",
  "Eastern Cape",
  "Free State",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
];
const PROPERTY_TYPES = ["HOUSE", "TOWNHOUSE", "APARTMENT", "LAND", "COMMERCIAL", "FARM"];
const GRADES = ["A", "B", "C", "D", "E"];

function DistressedAlertsPage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const [saving, setSaving] = useState(false);

  const [provinces, setProvinces] = useState<string[]>([]);
  const [propertyTypes, setPropertyTypes] = useState<string[]>([]);
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [minDiscountPct, setMinDiscountPct] = useState<string>("");
  const [minAIGrade, setMinAIGrade] = useState<string>("");
  const [channelEmail, setChannelEmail] = useState(true);
  const [channelPush, setChannelPush] = useState(true);
  const [active, setActive] = useState(true);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const alertsQuery = useQuery({
    ...trpc.getMyDistressedAlerts.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
  });
  const data = alertsQuery.data as any;

  useEffect(() => {
    if (data && !loaded) {
      const s = data.subscription;
      if (s) {
        setProvinces(s.provinces ?? []);
        setPropertyTypes(s.propertyTypes ?? []);
        setMaxPrice(s.maxPrice != null ? String(s.maxPrice) : "");
        setMinDiscountPct(s.minDiscountPct != null ? String(s.minDiscountPct) : "");
        setMinAIGrade(s.minAIGrade ?? "");
        setChannelEmail(s.channelEmail);
        setChannelPush(s.channelPush);
        setActive(s.active);
      }
      setLoaded(true);
    }
  }, [data, loaded]);

  const toggle = (arr: string[], val: string, set: (v: string[]) => void) =>
    set(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);

  const handleSave = async () => {
    if (!authToken) return;
    setSaving(true);
    try {
      await trpcClient.upsertDistressedAlerts.mutate({
        authToken,
        active,
        provinces,
        propertyTypes,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        minDiscountPct: minDiscountPct ? Number(minDiscountPct) : undefined,
        minAIGrade: (minAIGrade || undefined) as any,
        channelEmail,
        channelPush,
      });
      toast.success("Alert preferences saved.");
      queryClient.invalidateQueries({ queryKey: trpc.getMyDistressedAlerts.queryKey() });
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save preferences.");
    } finally {
      setSaving(false);
    }
  };

  if (!user || !authToken) return null;

  const entitled = data?.entitled ?? false;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-teal-100 p-2">
            <BellRing className="text-teal-600" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Distressed deal alerts</h1>
            <p className="text-sm text-gray-500">Get notified the moment a matching deal appears.</p>
          </div>
        </div>

        {!alertsQuery.isLoading && !entitled && (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <Lock className="mt-0.5 shrink-0 text-amber-600" size={18} />
            <div className="text-sm text-amber-800">
              Alerts are a premium feature. You can set your preferences now, but you'll need the{" "}
              <Link to="/distressed-deals" className="font-semibold underline">
                DistressedDeals
              </Link>{" "}
              or Pro plan to receive them.
            </div>
          </div>
        )}

        <div className="space-y-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <label className="flex items-center justify-between">
            <span className="font-medium text-gray-900">Alerts enabled</span>
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-5 w-5 rounded text-teal-600"
            />
          </label>

          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Provinces</p>
            <div className="flex flex-wrap gap-2">
              {PROVINCES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => toggle(provinces, p, setProvinces)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    provinces.includes(p)
                      ? "border-teal-600 bg-teal-50 text-teal-700"
                      : "border-gray-300 text-gray-600"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-400">Leave empty for all provinces.</p>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Property types</p>
            <div className="flex flex-wrap gap-2">
              {PROPERTY_TYPES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => toggle(propertyTypes, p, setPropertyTypes)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    propertyTypes.includes(p)
                      ? "border-teal-600 bg-teal-50 text-teal-700"
                      : "border-gray-300 text-gray-600"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Max price (R)</label>
              <input
                type="number"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="Any"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Min discount %</label>
              <input
                type="number"
                value={minDiscountPct}
                onChange={(e) => setMinDiscountPct(e.target.value)}
                placeholder="Any"
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Min AI grade</label>
              <select
                value={minAIGrade}
                onChange={(e) => setMinAIGrade(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">Any</option>
                {GRADES.map((g) => (
                  <option key={g} value={g}>
                    {g} or better
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={channelEmail}
                onChange={(e) => setChannelEmail(e.target.checked)}
                className="h-4 w-4 rounded text-teal-600"
              />
              Email
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={channelPush}
                onChange={(e) => setChannelPush(e.target.checked)}
                className="h-4 w-4 rounded text-teal-600"
              />
              Push notification
            </label>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
          >
            {saving && <Loader2 className="animate-spin" size={16} />}
            Save preferences
          </button>
        </div>
      </div>
    </div>
  );
}
