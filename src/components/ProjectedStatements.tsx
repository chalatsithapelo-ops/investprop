import { useState } from "react";
import { FileBarChart, Wallet, Scale, Info } from "lucide-react";
import type { ProjectedStatements, StatementPeriod } from "~/projected-statements";

const R = (n: number) => {
  const v = Math.round(n || 0);
  const s = Math.abs(v).toLocaleString("en-ZA");
  return v < 0 ? `(R${s})` : `R${s}`;
};

type Row = {
  label: string;
  get: (p: StatementPeriod) => number;
  bold?: boolean;
  indent?: boolean;
  topBorder?: boolean;
};

const INCOME_ROWS: Row[] = [
  { label: "Revenue", get: (p) => p.revenue },
  { label: "Cost of sales", get: (p) => -p.costOfSales, indent: true },
  { label: "Gross profit", get: (p) => p.grossProfit, bold: true, topBorder: true },
  { label: "Operating expenses", get: (p) => -p.operatingExpenses, indent: true },
  { label: "Depreciation", get: (p) => -p.depreciation, indent: true },
  { label: "Operating profit (EBIT)", get: (p) => p.operatingProfit, bold: true, topBorder: true },
  { label: "Finance costs (interest)", get: (p) => -p.interest, indent: true },
  { label: "Profit before tax", get: (p) => p.profitBeforeTax, bold: true, topBorder: true },
  { label: "Taxation", get: (p) => -p.tax, indent: true },
  { label: "Net profit", get: (p) => p.netProfit, bold: true, topBorder: true },
];

const CASHFLOW_ROWS: Row[] = [
  { label: "Cash from operations", get: (p) => p.cashFromOperations },
  { label: "Cash from investing", get: (p) => p.cashFromInvesting },
  { label: "Cash from financing", get: (p) => p.cashFromFinancing },
  { label: "Net change in cash", get: (p) => p.netCashFlow, bold: true, topBorder: true },
  { label: "Opening cash", get: (p) => p.openingCash, indent: true },
  { label: "Closing cash", get: (p) => p.closingCash, bold: true, topBorder: true },
];

const BALANCE_ROWS: Row[] = [
  { label: "Property / development asset", get: (p) => p.propertyAsset, indent: true },
  { label: "Cash", get: (p) => p.cash, indent: true },
  { label: "Total assets", get: (p) => p.totalAssets, bold: true, topBorder: true },
  { label: "Interest-bearing debt", get: (p) => p.debt, indent: true },
  { label: "Total liabilities", get: (p) => p.totalLiabilities, bold: true, topBorder: true },
  { label: "Contributed equity", get: (p) => p.contributedEquity, indent: true },
  { label: "Retained earnings", get: (p) => p.retainedEarnings, indent: true },
  { label: "Total equity", get: (p) => p.totalEquity, bold: true, topBorder: true },
];

const TABS = [
  { key: "income" as const, label: "Income Statement", icon: FileBarChart, rows: INCOME_ROWS },
  { key: "cashflow" as const, label: "Cash Flow", icon: Wallet, rows: CASHFLOW_ROWS },
  { key: "balance" as const, label: "Balance Sheet", icon: Scale, rows: BALANCE_ROWS },
];

/**
 * Renders the projected income statement, cash-flow statement and balance sheet
 * for a property, with each projection period shown as a column. Works for every
 * property type (flip, rental, development).
 */
export function ProjectedStatementsView({ data }: { data: ProjectedStatements }) {
  const [tab, setTab] = useState<"income" | "cashflow" | "balance">("income");
  const active = TABS.find((t) => t.key === tab)!;
  const periods = data.periods;

  if (periods.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-navy-700 bg-navy-800/20 p-4 text-sm text-gray-400">
        Not enough financial inputs have been captured yet to project the statements.
      </p>
    );
  }

  const subtitle =
    data.type === "development"
      ? data.developmentType === "AFFORDABLE_RESALE"
        ? "Greenfield development — build & sell"
        : "Greenfield development — build & hold"
      : data.type === "flip"
        ? "Buy, renovate & resell"
        : "Buy-to-let hold";

  return (
    <div className="rounded-xl border border-navy-800/50 bg-navy-900/40 p-5">
      <div className="mb-1 flex items-center gap-2">
        <FileBarChart size={18} className="text-gold-500" />
        <h3 className="text-lg font-semibold text-gray-900">Projected Financial Statements</h3>
      </div>
      <p className="mb-4 text-xs text-gray-500">
        {subtitle} · figures in ZAR ·{" "}
        {data.periodicity === "annual" ? "annual periods" : "project phases"} · indicative projection
      </p>

      {/* Statement tabs */}
      <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-navy-800/40 p-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition ${
                tab === t.key ? "bg-gold-500 text-navy-950" : "text-gray-500 hover:text-gold-600"
              }`}
            >
              <Icon size={15} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Statement table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-navy-900/40 py-2 pr-4 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                {active.label}
              </th>
              {periods.map((p, i) => (
                <th
                  key={i}
                  className="whitespace-nowrap px-3 py-2 text-right text-xs font-medium uppercase tracking-wide text-gray-500"
                >
                  {p.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {active.rows.map((row, ri) => (
              <tr
                key={ri}
                className={row.topBorder ? "border-t border-navy-700/70" : ""}
              >
                <td
                  className={`sticky left-0 z-10 bg-navy-900/40 py-1.5 pr-4 text-left ${
                    row.bold ? "font-semibold text-gray-900" : "text-gray-500"
                  } ${row.indent ? "pl-4" : ""}`}
                >
                  {row.label}
                </td>
                {periods.map((p, i) => {
                  const v = row.get(p);
                  return (
                    <td
                      key={i}
                      className={`whitespace-nowrap px-3 py-1.5 text-right tabular-nums ${
                        row.bold ? "font-semibold text-gray-900" : "text-gray-600"
                      } ${v < 0 ? "text-red-500" : ""}`}
                    >
                      {R(v)}
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* Memo: market value (balance sheet) */}
            {tab === "balance" && periods.some((p) => p.marketValue != null) && (
              <tr className="border-t border-dashed border-navy-800">
                <td className="sticky left-0 z-10 bg-navy-900/40 py-1.5 pr-4 text-left text-xs italic text-gray-500">
                  Memo: property market value
                </td>
                {periods.map((p, i) => (
                  <td key={i} className="whitespace-nowrap px-3 py-1.5 text-right text-xs italic tabular-nums text-gray-500">
                    {p.marketValue != null ? R(p.marketValue) : "—"}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Assumptions */}
      {data.assumptions.length > 0 && (
        <div className="mt-5 rounded-lg border border-navy-800/50 bg-navy-950/40 p-4">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            <Info size={13} /> Key assumptions
          </p>
          <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
            {data.assumptions.map((a, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-gray-500">{a.label}</span>
                <span className="font-medium text-gray-300">{a.value}</span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-gray-500">
            These are indicative, forward-looking projections built from the figures captured for this
            property — not a guarantee or audited accounts. Actual results depend on sales, rental
            demand, build costs, interest rates and timing.
          </p>
        </div>
      )}
    </div>
  );
}
