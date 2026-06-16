import { useState } from "react";
import { Info } from "lucide-react";

/**
 * Plain-language explanations of the financial jargon investors see across the
 * app. Keep each entry short, jargon-free, and South-Africa specific (ZAR,
 * SARS, freehold/sectional title, etc.). Definitions are written so a
 * first-time investor can understand them without a finance background.
 */
export const FINANCIAL_TERMS = {
  capRate: {
    term: "Capitalisation Rate (Cap Rate)",
    text: "The yearly net rental income divided by the property price, shown as a percentage. It tells you the return on the property itself, ignoring any loan. A higher cap rate usually means more income for the price — but often more risk too.",
    formula: "Cap Rate = Net Operating Income ÷ Property Value",
  },
  noi: {
    term: "Net Operating Income (NOI)",
    text: "The rent left over each year after paying running costs like rates, levies, insurance, maintenance and management — but before any bond/loan repayments and tax. It's the income the property generates on its own.",
    formula: "NOI = Annual Rent − Operating Expenses",
  },
  grossYield: {
    term: "Gross Rental Yield",
    text: "The full year's rent as a percentage of the property price, before any costs are deducted. It's a quick headline number — the net yield (after costs) is what you actually earn.",
    formula: "Gross Yield = Annual Rent ÷ Property Price",
  },
  netYield: {
    term: "Net Rental Yield",
    text: "The year's rent as a percentage of the property price after deducting running costs (rates, levies, insurance, maintenance, management). This is a truer picture of the income return than gross yield.",
    formula: "Net Yield = (Annual Rent − Costs) ÷ Property Price",
  },
  roi: {
    term: "Return on Investment (ROI)",
    text: "Your total profit as a percentage of the cash you put in. It combines rental income and any increase in the property's value. The higher the ROI, the harder your money is working.",
    formula: "ROI = Total Profit ÷ Cash Invested",
  },
  cashOnCash: {
    term: "Cash-on-Cash Return",
    text: "The yearly cash profit (after the bond/loan repayment) as a percentage of the actual cash you invested — your deposit and fees. It shows the real cash return on the money you personally put down, not the full property price.",
    formula: "Cash-on-Cash = Annual Cash Flow ÷ Cash Invested",
  },
  irr: {
    term: "Internal Rate of Return (IRR)",
    text: "A single yearly percentage that captures the whole journey of an investment — money in, income along the way, and the final sale — accounting for the timing of each cash flow. Useful for comparing deals that pay out differently over time.",
    formula: "The annualised return that makes all cash flows break even",
  },
  dscr: {
    term: "Debt Service Coverage Ratio (DSCR)",
    text: "How comfortably the rental income covers the bond/loan repayment. A DSCR of 1.0 means rent exactly covers the repayment; above 1.2 is generally considered safe. Below 1.0 means the property can't pay its own loan from rent.",
    formula: "DSCR = Net Operating Income ÷ Annual Loan Repayment",
  },
  arv: {
    term: "After-Repair Value (ARV)",
    text: "The estimated price the property could sell for once renovations are finished. Flip profits are based on this number, so a realistic ARV is critical — an optimistic estimate inflates the expected profit.",
    formula: "ARV = Expected resale value after renovation",
  },
  ltv: {
    term: "Loan-to-Value (LTV)",
    text: "The size of the bond/loan as a percentage of the property's value. A lower LTV means more of your own cash is in the deal and less debt risk. Banks in SA typically lend up to 80–100% depending on the buyer.",
    formula: "LTV = Loan Amount ÷ Property Value",
  },
  managementFee: {
    term: "Management Fee",
    text: "What a managing agent charges to run the property — finding tenants, collecting rent, handling maintenance. In SA this is usually 8–10% of the monthly rent. It's already deducted before working out your net income.",
    formula: "Typically 8–10% of monthly rent",
  },
  grossProfit: {
    term: "Gross Profit",
    text: "For a flip: the resale price minus the purchase price and renovation costs — before fees, transfer duty, agent commission and tax. The net profit (after all those costs) is what you actually keep.",
    formula: "Gross Profit = Resale Price − Purchase − Renovation",
  },
  netProfit: {
    term: "Net Profit",
    text: "What's left after every cost is paid — purchase, renovation, transfer duty, bond costs, agent commission, holding costs and tax. This is the real money the deal makes.",
    formula: "Net Profit = Resale Price − All Costs",
  },
  holdingCosts: {
    term: "Holding Costs",
    text: "The ongoing costs of owning a property while you renovate or wait to sell — bond interest, rates, levies, insurance and utilities. The longer the project runs, the more these eat into profit.",
    formula: "Monthly costs × number of months held",
  },
  transferDuty: {
    term: "Transfer Duty",
    text: "A tax paid to SARS when property changes hands, calculated on a sliding scale based on the price. Properties under a threshold pay none; above it, the rate rises with value. It's a real upfront cost on every purchase.",
    formula: "SARS sliding scale based on purchase price",
  },
  equityShare: {
    term: "Equity Share",
    text: "The portion of the property (and its profits) you own through your investment, shown as a percentage. Distributions and any sale proceeds are split according to each investor's equity share.",
    formula: "Your Shares ÷ Total Shares Issued",
  },
  distribution: {
    term: "Distribution",
    text: "A payout of profit to investors — from rental income or when a property is sold. Each investor receives a share based on how much equity they hold. SARS may withhold tax on certain distributions.",
    formula: "Profit × Your Equity Share",
  },
  annualisedReturn: {
    term: "Annualised Return",
    text: "The profit expressed as a yearly rate, so deals of different lengths can be compared fairly. A 15% profit earned in 6 months is far better than the same 15% over 3 years — annualising makes that obvious. For a single buy-and-sell it equals the IRR.",
    formula: "(1 + Profit ÷ Invested) ^ (12 ÷ months) − 1",
  },
  marginOfSafety: {
    term: "Margin of Safety",
    text: "How far the expected resale price sits above the break-even price. A bigger cushion means the deal can absorb a lower-than-hoped sale price (or cost overruns) and still avoid a loss. A thin or negative margin is a red flag.",
    formula: "(Resale Value − Break-Even) ÷ Break-Even",
  },
  grm: {
    term: "Gross Rent Multiplier (GRM)",
    text: "How many years of gross rent it would take to equal the purchase price. A lower GRM generally means better value for an income property. It's a quick screening number — it ignores running costs, so pair it with the net yield.",
    formula: "GRM = Purchase Price ÷ Annual Gross Rent",
  },
  capRateOnCost: {
    term: "Cap Rate on Total Cost",
    text: "The cap rate measured against everything you put in — purchase price plus transfer duty and fees — rather than just the price. It's a more honest yield because it counts the true money invested. It will always be a little lower than the headline cap rate.",
    formula: "NOI ÷ (Price + Transfer Duty + Costs)",
  },
} as const;

export type FinancialTermKey = keyof typeof FINANCIAL_TERMS;

type Props = {
  /** A known glossary key — shows the matching term, explanation and formula. */
  term?: FinancialTermKey;
  /** Custom title (used when `term` is not supplied). */
  title?: string;
  /** Custom body text (used when `term` is not supplied). */
  text?: string;
  /** Visual size of the info icon. */
  size?: "sm" | "md";
  /** Extra classes for the trigger wrapper. */
  className?: string;
  /** Tooltip horizontal alignment relative to the icon. */
  align?: "left" | "right";
};

/**
 * A small, accessible "ⓘ" info icon that reveals a plain-language explanation
 * on hover/focus/tap. Designed to demystify financial jargon for investors.
 *
 * Usage:
 *   <InfoTooltip term="capRate" />
 *   <InfoTooltip title="Custom" text="Anything you want to explain." />
 */
export function InfoTooltip({
  term,
  title,
  text,
  size = "sm",
  className = "",
  align = "left",
}: Props) {
  const [open, setOpen] = useState(false);

  const entry = term ? FINANCIAL_TERMS[term] : undefined;
  const heading = entry?.term ?? title ?? "More info";
  const body = entry?.text ?? text ?? "";
  const formula = entry?.formula;

  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const alignCls = align === "right" ? "right-0" : "left-0";

  return (
    <span
      className={`relative inline-flex align-middle ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`${heading} — what does this mean?`}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen((o) => !o);
        }}
        className="inline-flex cursor-help items-center text-navy-400 transition-colors hover:text-navy-600 focus:text-navy-600 focus:outline-none"
      >
        <Info className={iconSize} aria-hidden="true" />
      </button>

      {open && (
        <span
          role="tooltip"
          className={`absolute top-full z-50 mt-2 w-72 rounded-lg border border-navy-200 bg-white p-3 text-left text-xs font-normal normal-case leading-relaxed text-gray-700 shadow-xl ${alignCls}`}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="block font-semibold text-gray-900">{heading}</span>
          <span className="mt-1 block text-gray-600">{body}</span>
          {formula && (
            <span className="mt-2 block rounded bg-navy-50 px-2 py-1 font-mono text-[10px] text-navy-700">
              {formula}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
