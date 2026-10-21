import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Landmark,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Info,
  ArrowRight,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "~/stores/authStore";
import { useBlockPropertyOwner } from "~/utils/use-require-role";
import { calculatePrequalification, PREQUAL_DEFAULTS } from "~/financial-calculations";
import toast from "react-hot-toast";

const R = (n: number) =>
  `R${(Number.isFinite(n) ? n : 0).toLocaleString("en-ZA", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

type FormState = {
  grossMonthlyIncome: number;
  monthlyExpenses: number;
  existingDebtRepayments: number;
  depositAmount: number;
  propertyPrice: number;
  annualInterestRate: number;
  loanTermYears: number;
};

const DEFAULTS: FormState = {
  grossMonthlyIncome: 0,
  monthlyExpenses: 0,
  existingDebtRepayments: 0,
  depositAmount: 0,
  propertyPrice: 0,
  annualInterestRate: PREQUAL_DEFAULTS.annualInterestRate,
  loanTermYears: PREQUAL_DEFAULTS.loanTermYears,
};

const BAND_META: Record<string, { label: string; badge: string; text: string }> = {
  STRONG: {
    label: "Strong",
    badge: "bg-emerald-100 text-emerald-700",
    text: "You comfortably qualify on affordability.",
  },
  MODERATE: {
    label: "Moderate",
    badge: "bg-amber-100 text-amber-700",
    text: "You likely qualify, but with less headroom.",
  },
  WEAK: {
    label: "Weak",
    badge: "bg-rose-100 text-rose-700",
    text: "This looks stretched on current income. Consider a bigger deposit or a lower price.",
  },
};

export const Route = createFileRoute("/finance/prequalify/")({
  validateSearch: (search: Record<string, unknown>) => {
    const num = (key: string) => {
      const raw = search[key];
      if (raw == null || raw === "") return undefined;
      const n = Number(raw);
      return Number.isFinite(n) ? n : undefined;
    };
    return {
      propertyId: num("propertyId"),
      propertyPrice: num("propertyPrice"),
    };
  },
  component: PrequalifyPage,
});

function Field({
  label,
  value,
  onChange,
  hint,
  prefix = "R",
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
  prefix?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <div className="mt-1 flex items-center rounded-md border border-gray-300 bg-white focus-within:border-teal-500">
        {prefix && <span className="pl-3 text-gray-500">{prefix}</span>}
        <input
          type="number"
          min={0}
          value={value === 0 ? "" : value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-full rounded-md bg-transparent px-2 py-2 text-gray-900 outline-none"
          placeholder="0"
        />
      </div>
      {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

function PrequalifyPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const authToken = useAuthStore((s) => s.token);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  useBlockPropertyOwner();

  const [form, setForm] = useState<FormState>(DEFAULTS);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applyConsent, setApplyConsent] = useState(false);
  const [applicantPhone, setApplicantPhone] = useState("");
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (hasHydrated && !authToken) navigate({ to: "/login" });
  }, [hasHydrated, authToken, navigate]);

  useEffect(() => {
    if (search.propertyPrice != null) {
      setForm((p) => ({ ...p, propertyPrice: search.propertyPrice ?? p.propertyPrice }));
    }
  }, [search.propertyPrice]);

  const result = useMemo(
    () =>
      calculatePrequalification({
        grossMonthlyIncome: form.grossMonthlyIncome,
        monthlyExpenses: form.monthlyExpenses,
        existingDebtRepayments: form.existingDebtRepayments,
        depositAmount: form.depositAmount,
        propertyPrice: form.propertyPrice || undefined,
        annualInterestRate: form.annualInterestRate,
        loanTermYears: form.loanTermYears,
      }),
    [form],
  );

  const historyQuery = useQuery({
    ...trpc.getMyPrequalifications.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
  });

  const applicationsQuery = useQuery({
    ...trpc.getMyHomeLoanApplications.queryOptions({ authToken: authToken ?? "" }),
    enabled: !!authToken,
  });

  const hasIncome = form.grossMonthlyIncome > 0;
  const band = BAND_META[result.band] ?? BAND_META.WEAK;

  const handleSave = async () => {
    if (!authToken) {
      navigate({ to: "/login" });
      return;
    }
    if (!hasIncome) {
      toast.error("Enter your gross monthly income first.");
      return;
    }
    if (!consent) {
      toast.error("Please tick the consent box to save your prequalification.");
      return;
    }
    setSaving(true);
    try {
      const res = await trpcClient.submitPrequalification.mutate({
        authToken,
        propertyId: search.propertyId,
        consent,
        grossMonthlyIncome: form.grossMonthlyIncome,
        monthlyExpenses: form.monthlyExpenses,
        existingDebtRepayments: form.existingDebtRepayments,
        depositAmount: form.depositAmount,
        propertyPrice: form.propertyPrice || undefined,
        annualInterestRate: form.annualInterestRate,
        loanTermYears: form.loanTermYears,
      });
      if (!res.success) {
        toast.error(res.error ?? "Could not save prequalification.");
      } else {
        toast.success("Prequalification saved.");
        void historyQuery.refetch();
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save prequalification.");
    } finally {
      setSaving(false);
    }
  };

  const handleApply = async () => {
    if (!authToken) {
      navigate({ to: "/login" });
      return;
    }
    if (!hasIncome) {
      toast.error("Enter your gross monthly income first.");
      return;
    }
    if (!applyConsent) {
      toast.error("Please consent to sharing your application with a bond originator.");
      return;
    }
    setApplying(true);
    try {
      const res = await trpcClient.submitHomeLoanApplication.mutate({
        authToken,
        propertyId: search.propertyId,
        requestedBondAmount: result.maxBondAmount,
        propertyPrice: form.propertyPrice || undefined,
        depositAmount: form.depositAmount,
        grossMonthlyIncome: form.grossMonthlyIncome,
        estimatedInstalment:
          form.propertyPrice > 0 ? result.estimatedInstalment : result.maxInstalment,
        annualInterestRate: form.annualInterestRate,
        loanTermYears: form.loanTermYears,
        applicantPhone: applicantPhone || undefined,
        consentShareData: applyConsent,
      });
      if (!res.success) {
        toast.error(res.error ?? "Could not submit your application.");
      } else {
        toast.success(
          res.originatorName
            ? `Application submitted to ${res.originatorName}.`
            : "Application received. We'll match you to a bond originator.",
        );
        setApplyConsent(false);
        void applicationsQuery.refetch();
        navigate({ to: "/finance/home-loan" });
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Could not submit your application.");
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Navbar />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-teal-100 p-2 text-teal-700">
            <Landmark size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Home Loan Prequalification</h1>
            <p className="text-sm text-gray-600">
              See what you could borrow towards a property deal — in seconds.
            </p>
          </div>
        </div>

        {/* Indicative disclaimer */}
        <div className="mt-5 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          <Info size={16} className="mt-0.5 shrink-0" />
          <p>
            This is an <strong>indicative affordability estimate</strong>, not a credit check or a
            guarantee of finance. Banks make the final decision based on your full credit profile.
            When you're ready, apply to all major banks in one step via our bond-originator partner.
          </p>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* Inputs */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Your finances</h2>
            <div className="mt-4 space-y-4">
              <Field
                label="Gross monthly income"
                value={form.grossMonthlyIncome}
                onChange={(n) => setForm((p) => ({ ...p, grossMonthlyIncome: n }))}
                hint="Your total monthly income before tax and deductions."
              />
              <Field
                label="Existing monthly debt repayments"
                value={form.existingDebtRepayments}
                onChange={(n) => setForm((p) => ({ ...p, existingDebtRepayments: n }))}
                hint="Car finance, credit cards, personal loans, etc."
              />
              <Field
                label="Monthly living expenses"
                value={form.monthlyExpenses}
                onChange={(n) => setForm((p) => ({ ...p, monthlyExpenses: n }))}
                hint="Optional — helps you sense-check the instalment."
              />
              <Field
                label="Deposit available"
                value={form.depositAmount}
                onChange={(n) => setForm((p) => ({ ...p, depositAmount: n }))}
                hint="A bigger deposit improves your rate and chances."
              />
              <Field
                label="Property price (optional)"
                value={form.propertyPrice}
                onChange={(n) => setForm((p) => ({ ...p, propertyPrice: n }))}
                hint="Leave blank to see your maximum, or enter a deal price to test it."
              />
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="Interest rate"
                  prefix=""
                  value={form.annualInterestRate}
                  onChange={(n) => setForm((p) => ({ ...p, annualInterestRate: n }))}
                  hint="% per year"
                />
                <Field
                  label="Term"
                  prefix=""
                  value={form.loanTermYears}
                  onChange={(n) => setForm((p) => ({ ...p, loanTermYears: n }))}
                  hint="Years"
                />
              </div>
            </div>
          </div>

          {/* Result */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Your estimate</h2>
              {hasIncome && (
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${band.badge}`}>
                  {band.label}
                </span>
              )}
            </div>

            {!hasIncome ? (
              <p className="mt-6 text-sm text-gray-500">
                Enter your gross monthly income to see your indicative prequalification.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="rounded-lg bg-teal-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-teal-700">
                    Maximum bond you could qualify for
                  </p>
                  <p className="mt-1 text-3xl font-bold text-teal-900">
                    {R(result.maxBondAmount)}
                  </p>
                  <p className="mt-1 text-sm text-teal-800">
                    Up to {R(result.maxPropertyPrice)} property price with your deposit.
                  </p>
                </div>

                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <dt className="text-gray-500">Max affordable instalment</dt>
                    <dd className="mt-0.5 font-semibold text-gray-900">
                      {R(result.maxInstalment)}/mo
                    </dd>
                  </div>
                  {form.propertyPrice > 0 && (
                    <>
                      <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                        <dt className="text-gray-500">Instalment for this deal</dt>
                        <dd className="mt-0.5 font-semibold text-gray-900">
                          {R(result.estimatedInstalment)}/mo
                        </dd>
                      </div>
                      <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                        <dt className="text-gray-500">Loan-to-value</dt>
                        <dd className="mt-0.5 font-semibold text-gray-900">
                          {result.loanToValue.toFixed(0)}%
                        </dd>
                      </div>
                    </>
                  )}
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <dt className="text-gray-500">Assumed rate / term</dt>
                    <dd className="mt-0.5 font-semibold text-gray-900">
                      {result.annualInterestRate.toFixed(2)}% · {result.loanTermYears}yr
                    </dd>
                  </div>
                </dl>

                <div
                  className={`flex items-start gap-2 rounded-lg p-3 text-sm ${
                    result.qualifies
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-rose-50 text-rose-800"
                  }`}
                >
                  {result.qualifies ? (
                    <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                  ) : (
                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  )}
                  <span>
                    {form.propertyPrice > 0
                      ? result.qualifies
                        ? "This deal looks affordable on your income. " + band.text
                        : "This deal looks stretched. " + band.text
                      : band.text}
                  </span>
                </div>

                {/* Consent + save */}
                <label className="flex items-start gap-2 rounded-lg border border-gray-200 p-3 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4"
                  />
                  <span className="flex items-start gap-1">
                    <ShieldCheck size={16} className="mt-0.5 shrink-0 text-gray-400" />
                    I consent to InvestProp storing these details (POPIA) so I can save this
                    prequalification and apply for finance later.
                  </span>
                </label>

                <button
                  onClick={handleSave}
                  disabled={saving || !consent}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2.5 font-semibold text-white hover:bg-teal-500 disabled:opacity-60"
                >
                  {saving && <Loader2 size={18} className="animate-spin" />}
                  Save prequalification
                </button>

                {/* Apply to all major banks (Phase 2 — bond originator) */}
                <div className="rounded-lg border border-teal-200 bg-teal-50/60 p-4">
                  <div className="flex items-center gap-2">
                    <Landmark size={18} className="text-teal-700" />
                    <h3 className="font-semibold text-teal-900">Apply to all major banks</h3>
                  </div>
                  <p className="mt-1 text-sm text-teal-800">
                    One application, submitted to Standard Bank, ABSA, FNB, Nedbank and Investec
                    through our bond-originator partner. It's free — the winning bank pays the
                    originator. You then pick the best offer.
                  </p>

                  <input
                    type="tel"
                    value={applicantPhone}
                    onChange={(e) => setApplicantPhone(e.target.value)}
                    placeholder="Contact number (optional)"
                    className="mt-3 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-teal-500"
                  />

                  <label className="mt-3 flex items-start gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={applyConsent}
                      onChange={(e) => setApplyConsent(e.target.checked)}
                      className="mt-0.5 h-4 w-4"
                    />
                    <span>
                      I consent to InvestProp sharing my application details with a registered bond
                      originator so they can apply to the banks on my behalf (POPIA).
                    </span>
                  </label>

                  <button
                    onClick={handleApply}
                    disabled={applying || !applyConsent}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-700 px-4 py-2.5 font-semibold text-white hover:bg-teal-600 disabled:opacity-60"
                  >
                    {applying && <Loader2 size={18} className="animate-spin" />}
                    Apply to all major banks
                  </button>

                  <p className="mt-2 text-center text-xs text-teal-700">
                    Indicative only — the banks make the final credit decision. Track progress on
                    your{" "}
                    <Link to="/finance/home-loan" className="font-semibold underline">
                      applications page
                    </Link>
                    .
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* History */}
        {!!authToken && (historyQuery.data?.prequalifications?.length ?? 0) > 0 && (
          <div className="mt-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Your saved prequalifications</h2>
            <div className="mt-3 divide-y divide-gray-100">
              {historyQuery.data?.prequalifications.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-medium text-gray-900">
                      Max bond {R(p.maxBondAmount)}
                      {p.propertyPrice > 0 && ` · deal ${R(p.propertyPrice)}`}
                    </p>
                    <p className="text-gray-500">
                      {new Date(p.createdAt).toLocaleDateString("en-ZA")} · income{" "}
                      {R(p.grossMonthlyIncome)}/mo
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      (BAND_META[p.band] ?? BAND_META.WEAK).badge
                    }`}
                  >
                    {(BAND_META[p.band] ?? BAND_META.WEAK).label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 text-center">
          <Link
            to="/investments/opportunities"
            className="inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:text-teal-600"
          >
            Browse investment opportunities <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}
