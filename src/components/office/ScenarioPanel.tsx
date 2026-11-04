import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, ClipboardList } from "lucide-react";
import { errorMessage, formatDate, jsonPreview, officeApi, scenarioAssumptionsSchema, type ScenarioAssumptions } from "./api";

const field = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500";
const money = (value: number) => new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(value);
const metrics = [
  ["annualGrossRent", "Annual gross rent", "money"],
  ["vacancyRatePct", "Vacancy rate", "percent"],
  ["vacancyLoss", "Annual vacancy loss", "money"],
  ["annualOperatingExpenses", "Annual operating expenses", "money"],
  ["noi", "Annual NOI (before debt)", "money"],
  ["interestRatePct", "Historical / stressed interest rate", "percent"],
  ["annualDebtService", "Modelled annual debt service", "money"],
  ["annualCashFlow", "Annual cash flow (before tax / capex)", "money"],
  ["dscr", "DSCR", "ratio"],
] as const;

function Notes({ title, items }: { title: string; items: string[] }) {
  return <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-950"><h3 className="font-semibold">{title}</h3><ul className="mt-2 list-disc space-y-1 pl-4">{items.map((item, index) => <li key={index}>{item}</li>)}</ul></div>;
}

export function ScenarioPanel({ authToken, accountId, holdings }: {
  authToken: string; accountId: number; holdings: { propertyId: string | number; title: string }[];
}) {
  const [submitted, setSubmitted] = useState<{ propertyId: number; assumptions: ScenarioAssumptions } | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const scope = ["ai-office", accountId, authToken];
  const scenario = useQuery({
    queryKey: [...scope, "propertyScenario", submitted],
    queryFn: () => {
      if (!submitted) throw new Error("Enter a rental property and all stress assumptions first.");
      return officeApi.propertyScenario({ authToken, ...submitted });
    },
    enabled: submitted !== null, retry: false,
  });
  const exceptions = useQuery({ queryKey: [...scope, "accountingExceptions"], queryFn: () => officeApi.accountingExceptions({ authToken }), retry: false });

  function submit(form: HTMLFormElement) {
    setInputError(null);
    try {
      const data = new FormData(form);
      const number = (name: string) => {
        const raw = data.get(name);
        if (typeof raw !== "string" || !raw.trim()) throw new Error(`Enter ${name}; blank inputs are not treated as zero.`);
        const value = Number(raw);
        if (!Number.isFinite(value)) throw new Error(`Enter a finite number for ${name}.`);
        return value;
      };
      const propertyId = number("propertyId");
      if (!Number.isSafeInteger(propertyId) || propertyId <= 0) throw new Error("Property ID must be a positive whole number.");
      const assumptions = scenarioAssumptionsSchema.parse({ rentChangePct: number("rentChangePct"), vacancyRatePct: number("vacancyRatePct"), operatingCostChangePct: number("operatingCostChangePct"), interestRateChangePp: number("interestRateChangePp") });
      setSubmitted({ propertyId, assumptions });
    } catch (error) { setSubmitted(null); setInputError(errorMessage(error)); }
  }

  return <section aria-labelledby="scenario-heading" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
    <h2 id="scenario-heading" className="flex items-center gap-2 text-lg font-bold"><Building2 size={20} className="text-amber-700" />Rental scenarios & accounting exceptions</h2>
    <p className="mt-2 text-sm text-slate-600">Read-only evidence review. Only an unambiguous rental baseline is supported; flip and development properties are not supported. The server verifies access and rental eligibility.</p>
    <div className="mt-5 grid items-start gap-6 xl:grid-cols-2">
      <div className="min-w-0">
        <h3 className="font-semibold">Compare recorded baseline with your stress assumptions</h3>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">All inputs below describe your stress case, never the recorded baseline. Enter 0 explicitly for no relative change. Vacancy is required and replaces baseline vacancy, not a change to it.</p>
        <form className="mt-4 grid gap-3 sm:grid-cols-2" onChange={() => { setSubmitted(null); setInputError(null); }} onSubmit={(event) => { event.preventDefault(); submit(event.currentTarget); }}>
          <label className="text-xs font-semibold sm:col-span-2">Rental property ID<input name="propertyId" type="number" min={1} step={1} required list="office-scenario-properties" className={field} /><datalist id="office-scenario-properties">{holdings.map((holding) => <option key={holding.propertyId} value={holding.propertyId}>{holding.title} — rental eligibility not yet verified</option>)}</datalist></label>
          {[
            { name: "rentChangePct", label: "Rent change (%)", min: -100, max: 100 },
            { name: "vacancyRatePct", label: "Stress vacancy rate (%) — required", min: 0, max: 100 },
            { name: "operatingCostChangePct", label: "Operating-cost change (%)", min: -100, max: 200 },
            { name: "interestRateChangePp", label: "Interest-rate change (percentage points)", min: -20, max: 20 },
          ].map((input) => <label key={input.name} className="text-xs font-semibold">{input.label}<input name={input.name} type="number" required min={input.min} max={input.max} step="any" className={field} /></label>)}
          <button type="submit" disabled={scenario.isFetching} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2">{scenario.isFetching ? "Loading recorded baseline…" : "Compare rental scenario"}</button>
        </form>
        {inputError && <p role="alert" className="mt-3 break-words text-sm text-red-800">{inputError}</p>}
        {scenario.error && submitted && <p role="alert" className="mt-3 break-words rounded-xl bg-red-50 p-3 text-sm text-red-800">Scenario: {errorMessage(scenario.error)} <button type="button" className="underline" disabled={scenario.isFetching} onClick={() => { void scenario.refetch(); }}>Retry</button></p>}
        {scenario.isFetching && <p role="status" className="mt-3 text-sm text-slate-500">Checking rental evidence…</p>}
        {!submitted && <p className="mt-4 text-xs text-slate-500">No baseline or stress figures are assumed. Submit your inputs to load server evidence.</p>}
        {submitted && scenario.data && <div className="mt-5">
          <h3 className="font-semibold">{scenario.data.title} · #{scenario.data.propertyId}</h3>
          <p className="mt-1 text-xs text-slate-500">Evaluated {formatDate(scenario.data.evaluatedAt)} — not a financial as-of date. ZAR, constant 12-month model; not a forecast or investor payout.</p>
          <h4 className="mt-3 text-xs font-semibold">Submitted stress assumptions (server-confirmed)</h4><pre className="mt-1 overflow-auto rounded-xl bg-slate-50 p-3 text-xs">{jsonPreview(scenario.data.assumptions)}</pre>
          <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><caption className="sr-only">Recorded rental baseline and user stress scenario</caption><thead><tr className="border-b border-slate-200"><th className="py-2 pr-3">Metric</th><th className="p-2">Recorded baseline</th><th className="p-2">Your stress case</th></tr></thead><tbody>{metrics.map(([key, label, unit]) => <tr key={key} className="border-b border-slate-100"><th scope="row" className="py-3 pr-3 font-medium">{label}</th>{[scenario.data.base[key], scenario.data.stressed[key]].map((value, index) => <td key={index} className="p-2">{value === null ? "Unknown — see gaps" : unit === "money" ? money(value) : unit === "percent" ? `${value.toLocaleString("en-ZA")}%` : `${value.toLocaleString("en-ZA", { maximumFractionDigits: 3 })}×`}</td>)}</tr>)}</tbody></table></div>
          <Notes title="Scenario evidence gaps" items={scenario.data.gaps} /><Notes title="Units & model limitations" items={scenario.data.unitNotes} />
          <details className="mt-4 text-xs"><summary className="cursor-pointer font-semibold">Recorded rental evidence & financing (not independently verified)</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3">{jsonPreview({ financing: scenario.data.financing, evidence: scenario.data.evidence })}</pre></details>
        </div>}
      </div>
      <div className="min-w-0 rounded-xl border border-slate-200 p-4">
        <div className="flex items-start justify-between gap-3"><h3 className="flex items-center gap-2 font-semibold"><ClipboardList size={18} />My accounting exceptions</h3><button type="button" disabled={exceptions.isFetching} onClick={() => { void exceptions.refetch(); }} className="text-xs font-semibold text-amber-800 disabled:opacity-50">Refresh</button></div>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">Self-only recorded observations, not an audit, fraud finding, bank reconciliation or tax calculation.</p>
        {exceptions.isPending && <p role="status" className="mt-3 text-sm">Loading recorded exceptions…</p>}
        {exceptions.error && <p role="alert" className="mt-3 break-words rounded-xl bg-red-50 p-3 text-sm text-red-800">Accounting exceptions: {errorMessage(exceptions.error)}</p>}
        {exceptions.data && <>
          <p className="mt-3 text-xs text-slate-600">Snapshot evaluated {formatDate(exceptions.data.evaluatedAt)} · {exceptions.data.complete ? "Within server record limits — not a completeness assurance" : "INCOMPLETE — server record limits exceeded"}</p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">{Object.entries(exceptions.data.counts).map(([label, count]) => <div key={label} className="rounded-lg bg-slate-50 p-2"><dt className="capitalize">{label} examined</dt><dd className="mt-1 font-semibold">{count}</dd></div>)}</dl>
          {exceptions.data.exceptions.length === 0 && <p className="mt-4 text-sm">No exceptions reported in this snapshot. This does not establish that the records are complete or correct.</p>}
          <ul className="mt-4 space-y-3">{exceptions.data.exceptions.map((item, index) => <li key={`${item.code}-${index}`} className="rounded-xl border border-amber-200 p-3"><h4 className="break-words text-xs font-bold">{item.code} · Property #{item.propertyId}</h4><p className="mt-2 text-xs leading-relaxed">{item.message}</p><h5 className="mt-2 text-xs font-semibold">Observed fields & evidence (server units)</h5><pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-2 text-xs">{jsonPreview({ observed: item.observed, evidence: item.evidence })}</pre></li>)}</ul>
          <Notes title="Exception evidence gaps" items={exceptions.data.gaps} /><Notes title="Exception units & interpretation" items={exceptions.data.unitNotes} />
        </>}
      </div>
    </div>
  </section>;
}