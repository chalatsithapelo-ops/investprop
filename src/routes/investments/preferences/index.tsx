import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Settings, DollarSign, MapPin, Shield } from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";

export const Route = createFileRoute("/investments/preferences/")({
  component: InvestmentPreferencesPage,
});

const PROPERTY_TYPE_OPTIONS = [
  "Residential",
  "Commercial",
  "Industrial",
  "Mixed-Use",
  "Retail",
  "Office",
  "Student Housing",
  "Affordable Housing",
];

const LOCATION_OPTIONS = [
  "Johannesburg",
  "Cape Town",
  "Durban",
  "Pretoria",
  "Port Elizabeth",
  "Bloemfontein",
  "East London",
  "Stellenbosch",
  "Sandton",
  "Umhlanga",
];

const RISK_OPTIONS = [
  { value: "low", label: "Low", description: "Capital preservation focus" },
  { value: "medium", label: "Medium", description: "Balanced growth" },
  { value: "high", label: "High", description: "Aggressive growth" },
];

function InvestmentPreferencesPage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [preferredPropertyTypes, setPreferredPropertyTypes] = useState<
    string[]
  >([]);
  const [minInvestment, setMinInvestment] = useState("");
  const [maxInvestment, setMaxInvestment] = useState("");
  const [preferredLocations, setPreferredLocations] = useState<string[]>([]);
  const [riskTolerance, setRiskTolerance] = useState("medium");
  const [preferredReturnRate, setPreferredReturnRate] = useState("");

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const preferencesQuery = useQuery({
    ...trpc.getInvestorPreferences.queryOptions({
      authToken: authToken ?? "",
    }),
    enabled: !!authToken,
  });

  const prefs = preferencesQuery.data as any;
  const prefsData = prefs?.preferences;

  useEffect(() => {
    if (prefsData) {
      setPreferredPropertyTypes(prefsData.preferredPropertyTypes ?? []);
      setMinInvestment(String(prefsData.minInvestment ?? ""));
      setMaxInvestment(String(prefsData.maxInvestment ?? ""));
      setPreferredLocations(prefsData.preferredLocations ?? []);
      setRiskTolerance(prefsData.riskTolerance ?? "medium");
      setPreferredReturnRate(String(prefsData.preferredReturnRate ?? ""));
    }
  }, [prefsData]);

  const toggleArrayItem = (
    arr: string[],
    setArr: (v: string[]) => void,
    item: string,
  ) => {
    if (arr.includes(item)) {
      setArr(arr.filter((i) => i !== item));
    } else {
      setArr([...arr, item]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    setSaveSuccess(false);
    try {
      await trpcClient.updateInvestorPreferences.mutate({
        authToken: authToken ?? "",
        preferences: {
          preferredPropertyTypes,
          minInvestment: minInvestment ? Number(minInvestment) : undefined,
          maxInvestment: maxInvestment ? Number(maxInvestment) : undefined,
          preferredLocations,
          riskTolerance,
          preferredReturnRate: preferredReturnRate
            ? Number(preferredReturnRate)
            : undefined,
        },
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setSaveError(err?.message ?? "Failed to save preferences.");
    } finally {
      setSaving(false);
    }
  };

  if (!user || !authToken) return null;

  if (preferencesQuery.isLoading) {
    return (
      <div className="min-h-screen bg-navy-950">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold-500 border-r-transparent" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <Settings className="text-gold-600" size={32} />
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Investment Preferences
              </h1>
              <p className="mt-1 text-gray-500">
                Set your preferences to receive tailored investment
                opportunities
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {/* Property Types */}
          <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
            <div className="mb-4 flex items-center gap-2">
              <Settings className="text-gold-600" size={18} />
              <h2 className="text-lg font-semibold text-gray-900">
                Preferred Property Types
              </h2>
            </div>
            <p className="mb-4 text-sm text-gray-500">
              Select the types of properties you're interested in investing in.
            </p>
            <div className="flex flex-wrap gap-2">
              {PROPERTY_TYPE_OPTIONS.map((type) => {
                const selected = preferredPropertyTypes.includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() =>
                      toggleArrayItem(
                        preferredPropertyTypes,
                        setPreferredPropertyTypes,
                        type,
                      )
                    }
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      selected
                        ? "bg-gold-500 text-navy-950"
                        : "border border-navy-800/50 bg-navy-800/30 text-gray-600 hover:border-gold-300 hover:text-gray-900"
                    }`}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Investment Range */}
          <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
            <div className="mb-4 flex items-center gap-2">
              <DollarSign className="text-gold-600" size={18} />
              <h2 className="text-lg font-semibold text-gray-900">
                Investment Range
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-600">
                  Minimum Investment (R)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                    R
                  </span>
                  <input
                    type="number"
                    value={minInvestment}
                    onChange={(e) => setMinInvestment(e.target.value)}
                    placeholder="e.g. 1000"
                    className="w-full rounded-lg border border-navy-800/50 bg-navy-800/30 py-2.5 pl-8 pr-4 text-sm text-gray-900 placeholder-gray-500 focus:border-gold-500/50 focus:outline-none focus:ring-1 focus:ring-gold-500/50"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-600">
                  Maximum Investment (R)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                    R
                  </span>
                  <input
                    type="number"
                    value={maxInvestment}
                    onChange={(e) => setMaxInvestment(e.target.value)}
                    placeholder="e.g. 500000"
                    className="w-full rounded-lg border border-navy-800/50 bg-navy-800/30 py-2.5 pl-8 pr-4 text-sm text-gray-900 placeholder-gray-500 focus:border-gold-500/50 focus:outline-none focus:ring-1 focus:ring-gold-500/50"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Preferred Locations */}
          <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
            <div className="mb-4 flex items-center gap-2">
              <MapPin className="text-gold-600" size={18} />
              <h2 className="text-lg font-semibold text-gray-900">
                Preferred Locations
              </h2>
            </div>
            <p className="mb-4 text-sm text-gray-500">
              Select the areas where you'd like to invest.
            </p>
            <div className="flex flex-wrap gap-2">
              {LOCATION_OPTIONS.map((loc) => {
                const selected = preferredLocations.includes(loc);
                return (
                  <button
                    key={loc}
                    type="button"
                    onClick={() =>
                      toggleArrayItem(
                        preferredLocations,
                        setPreferredLocations,
                        loc,
                      )
                    }
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      selected
                        ? "bg-gold-500 text-navy-950"
                        : "border border-navy-800/50 bg-navy-800/30 text-gray-600 hover:border-gold-300 hover:text-gray-900"
                    }`}
                  >
                    {loc}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Risk Tolerance */}
          <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
            <div className="mb-4 flex items-center gap-2">
              <Shield className="text-gold-600" size={18} />
              <h2 className="text-lg font-semibold text-gray-900">
                Risk Tolerance
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {RISK_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setRiskTolerance(option.value)}
                  className={`rounded-lg p-4 text-left transition-all ${
                    riskTolerance === option.value
                      ? "border-2 border-gold-500 bg-gold-50"
                      : "border border-navy-800/50 bg-navy-800/30 hover:border-gold-300"
                  }`}
                >
                  <p
                    className={`text-sm font-semibold ${
                      riskTolerance === option.value
                        ? "text-gold-600"
                        : "text-gray-900"
                    }`}
                  >
                    {option.label}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {option.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Preferred Return Rate */}
          <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
            <div className="mb-4 flex items-center gap-2">
              <DollarSign className="text-gold-600" size={18} />
              <h2 className="text-lg font-semibold text-gray-900">
                Preferred Return Rate
              </h2>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-600">
                Minimum Expected Return (%)
              </label>
              <div className="relative max-w-xs">
                <input
                  type="number"
                  value={preferredReturnRate}
                  onChange={(e) => setPreferredReturnRate(e.target.value)}
                  placeholder="e.g. 10"
                  min={0}
                  max={100}
                  className="w-full rounded-lg border border-navy-800/50 bg-navy-800/30 py-2.5 pl-4 pr-10 text-sm text-gray-900 placeholder-gray-500 focus:border-gold-500/50 focus:outline-none focus:ring-1 focus:ring-gold-500/50"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                  %
                </span>
              </div>
            </div>
          </div>

          {/* Save */}
          {saveError && (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-600">
              {saveError}
            </div>
          )}
          {saveSuccess && (
            <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-600">
              Preferences saved successfully!
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-gold-500 px-8 py-3 text-sm font-semibold text-navy-950 transition-colors hover:bg-gold-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Preferences"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
