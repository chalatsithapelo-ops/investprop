import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Landmark,
  Target,
  Info as InfoIcon,
} from "lucide-react";
import { useTRPC } from "~/trpc/react";
import { InfoTooltip } from "~/components/InfoTooltip";

export type InvestorStrategy =
  | "FLIP"
  | "DEVELOPMENT_EXIT"
  | "RENTAL_INCOME"
  | "BUY_AND_HOLD"
  | "EARLY_RESALE";

export type StrategyConfig = {
  strategy: InvestorStrategy | null;
  holdMonths: number | null;
  usesFinancing: boolean;
  financingAmount: number;
  financingRate: number;
  financingTermMonths: number;
};

export const DEFAULT_STRATEGY_CONFIG: StrategyConfig = {
  strategy: null,
  holdMonths: null,
  usesFinancing: false,
  financingAmount: 0,
  financingRate: 11.75,
  financingTermMonths: 60,
};

const STRATEGY_LABELS: Record<InvestorStrategy, { label: string; blurb: string }> = {
  FLIP: { label: "Flip to completion", blurb: "Ride the buy-renovate-sell to the sale — a one-off capital gain." },
  DEVELOPMENT_EXIT: { label: "Hold to development exit", blurb: "Stay in until the development is built and sold." },
  RENTAL_INCOME: { label: "Rental income", blurb: "Collect your share of rental distributions, plus growth on exit." },
  BUY_AND_HOLD: { label: "Long buy & hold", blurb: "Hold long term for income plus compounding capital growth." },
  EARLY_RESALE: { label: "Early resale", blurb: "Exit early by selling your shares on the marketplace." },
};

const R = (n: number) =>
  "R" + Math.round(n).toLocaleString("en-ZA", { maximumFractionDigits: 0 });
const pct = (n: number) => `${n.toFixed(1)}%`;

type Props = {
  propertyId: number;
  amount: number;
  config: StrategyConfig;
  onConfigChange: (c: StrategyConfig) => void;
};

/**
 * Live, strategy-aware projection of what a single investor can expect for
 * their contribution — three scenarios, optional gearing, net of fees & tax.
 */
export function InvestmentProjection({ propertyId, amount, config, onConfigChange }: Props) {
  const trpc = useTRPC();

  const query = useQuery({
    ...trpc.calculateInvestmentProjection.queryOptions({
      propertyId,
      amount,
      strategy: config.strategy ?? undefined,
      holdMonths: config.holdMonths ?? undefined,
      financing:
        config.usesFinancing && config.financingAmount > 0
          ? {
              amount: Math.min(config.financingAmount, amount),
              annualRate: config.financingRate,
              termMonths: config.financingTermMonths,
            }
          : undefined,
    }),
    enabled: amount > 0 && !!propertyId,
  });

  const data = query.data as any;
  const strategies: InvestorStrategy[] = data?.availableStrategies ?? [];
  const activeStrategy: InvestorStrategy | null =
    config.strategy ?? data?.defaultStrategy ?? null;
  const activeHold: number = config.holdMonths ?? data?.projectHoldMonths ?? 12;

  const scenarios = data?.projection?.scenarios;
  const base = scenarios?.base;

  const waterfall = useMemo(() => {
    if (!base) return null;
    const total = Math.max(1, base.capitalReturned + base.preferredReturnPaid + base.profitShare);
    return {
      capital: (base.capitalReturned / total) * 100,
      pref: (base.preferredReturnPaid / total) * 100,
      promoteInvestor: (base.profitShare / total) * 100,
    };
  }, [base]);

  if (amount <= 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-gold-500/30 bg-gold-50/50 p-4">
      <h4 className="mb-1 flex items-center gap-2 text-sm font-semibold text-gold-800">
        <Target size={14} />
        Your Investment Projection
        <InfoTooltip term="investorStrategy" />
      </h4>
      <p className="mb-3 text-[11px] text-gray-500">
        Estimates for your amount, based on the strategy you choose below. Not guarantees, not financial advice.
      </p>

      {/* Strategy selector */}
      {strategies.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-[11px] font-semibold text-gray-600">
            Your strategy
            <InfoTooltip term="investorStrategy" />
          </p>
          <div className="flex flex-wrap gap-1.5">
            {strategies.map((s) => {
              const activeS = activeStrategy === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => onConfigChange({ ...config, strategy: s })}
                  className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                    activeS
                      ? "bg-gold-500 text-white"
                      : "bg-white/70 text-gray-600 hover:bg-gold-100"
                  }`}
                >
                  {STRATEGY_LABELS[s]?.label ?? s}
                </button>
              );
            })}
          </div>
          {activeStrategy && (
            <p className="mt-1.5 text-[11px] text-gray-500">{STRATEGY_LABELS[activeStrategy]?.blurb}</p>
          )}
        </div>
      )}

      {/* Hold period */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-[11px] font-semibold text-gray-600">
            Your hold period
          </p>
          <span className="text-[11px] font-semibold text-gold-700">
            {activeHold >= 12 && activeHold % 12 === 0
              ? `${activeHold / 12} year${activeHold === 12 ? "" : "s"}`
              : `${activeHold} months`}
          </span>
        </div>
        <input
          type="range"
          min={3}
          max={120}
          step={3}
          value={activeHold}
          onChange={(e) => onConfigChange({ ...config, holdMonths: Number(e.target.value) })}
          className="w-full accent-gold-500"
        />
        {data?.projectHoldMonths > 0 && (
          <p className="mt-0.5 text-[10px] text-gray-400">
            Platform plan: ~{data.projectHoldMonths} months. You can exit earlier by selling shares on the marketplace.
          </p>
        )}
      </div>

      {/* Bank-loan gearing */}
      <div className="mb-3 rounded-lg bg-white/60 p-2.5">
        <label className="flex cursor-pointer items-center gap-2 text-[11px] font-semibold text-gray-700">
          <input
            type="checkbox"
            checked={config.usesFinancing}
            onChange={(e) => onConfigChange({ ...config, usesFinancing: e.target.checked })}
            className="accent-gold-500"
          />
          <Landmark size={13} className="text-gold-600" />
          Use a bank loan to co-invest (gearing)
          <InfoTooltip term="gearing" />
        </label>
        {config.usesFinancing && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            <div>
              <p className="text-[10px] text-gray-500">Loan amount (R)</p>
              <input
                type="number"
                value={config.financingAmount || ""}
                onChange={(e) => onConfigChange({ ...config, financingAmount: Number(e.target.value) })}
                placeholder="0"
                className="w-full rounded border border-navy-200 bg-white px-2 py-1 text-xs text-gray-900"
              />
            </div>
            <div>
              <p className="text-[10px] text-gray-500">Rate (% p.a.)</p>
              <input
                type="number"
                step="0.25"
                value={config.financingRate || ""}
                onChange={(e) => onConfigChange({ ...config, financingRate: Number(e.target.value) })}
                className="w-full rounded border border-navy-200 bg-white px-2 py-1 text-xs text-gray-900"
              />
            </div>
            <div>
              <p className="text-[10px] text-gray-500">Term (months)</p>
              <input
                type="number"
                value={config.financingTermMonths || ""}
                onChange={(e) => onConfigChange({ ...config, financingTermMonths: Number(e.target.value) })}
                className="w-full rounded border border-navy-200 bg-white px-2 py-1 text-xs text-gray-900"
              />
            </div>
          </div>
        )}
      </div>

      {query.isLoading && (
        <p className="py-3 text-center text-[11px] text-gray-500">Calculating your projection…</p>
      )}

      {/* Scenario table */}
      {scenarios && (
        <>
          <div className="overflow-hidden rounded-lg border border-navy-200 bg-white">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-navy-50 text-gray-500">
                  <th className="px-2 py-1.5 text-left font-medium"> </th>
                  <th className="px-2 py-1.5 text-right font-medium">
                    <span className="inline-flex items-center gap-0.5 text-red-500">
                      <TrendingDown size={11} /> Downside
                    </span>
                  </th>
                  <th className="px-2 py-1.5 text-right font-medium">
                    <span className="inline-flex items-center gap-0.5 text-gray-700">
                      <Minus size={11} /> Base
                    </span>
                  </th>
                  <th className="px-2 py-1.5 text-right font-medium">
                    <span className="inline-flex items-center gap-0.5 text-emerald-600">
                      <TrendingUp size={11} /> Upside
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                <ProjRow
                  label="Net payout"
                  term="netProceeds"
                  down={R(scenarios.downside.netProceeds)}
                  base={R(scenarios.base.netProceeds)}
                  up={R(scenarios.upside.netProceeds)}
                />
                <ProjRow
                  label="Net profit"
                  down={R(scenarios.downside.netProfit)}
                  base={R(scenarios.base.netProfit)}
                  up={R(scenarios.upside.netProfit)}
                  downNeg={scenarios.downside.netProfit < 0}
                  baseNeg={scenarios.base.netProfit < 0}
                />
                <ProjRow
                  label="Equity multiple"
                  term="moic"
                  down={`${scenarios.downside.moic.toFixed(2)}×`}
                  base={`${scenarios.base.moic.toFixed(2)}×`}
                  up={`${scenarios.upside.moic.toFixed(2)}×`}
                />
                <ProjRow
                  label="Annualised"
                  term="annualisedReturn"
                  down={pct(scenarios.downside.annualisedReturn)}
                  base={pct(scenarios.base.annualisedReturn)}
                  up={pct(scenarios.upside.annualisedReturn)}
                  downNeg={scenarios.downside.annualisedReturn < 0}
                  baseNeg={scenarios.base.annualisedReturn < 0}
                />
              </tbody>
            </table>
          </div>

          {/* Scenario legend */}
          <p className="mt-1.5 flex items-center gap-1 text-[10px] text-gray-400">
            <InfoIcon size={10} /> Downside / Base / Upside
            <InfoTooltip term="scenarioBands" />
            — real outcomes usually land in between.
          </p>

          {/* Waterfall mini-bar (base case) */}
          {waterfall && base && (
            <div className="mt-3">
              <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-gray-600">
                How your base-case payout splits
                <InfoTooltip term="promote" />
              </p>
              <div className="flex h-3 overflow-hidden rounded-full">
                <div className="bg-navy-400" style={{ width: `${waterfall.capital}%` }} title="Your capital back" />
                <div className="bg-gold-400" style={{ width: `${waterfall.pref}%` }} title="Preferred return" />
                <div className="bg-emerald-500" style={{ width: `${waterfall.promoteInvestor}%` }} title="Your profit share" />
              </div>
              <div className="mt-1 flex flex-wrap gap-2 text-[9px] text-gray-500">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-navy-400" /> Capital {R(base.capitalReturned)}</span>
                {base.preferredReturnPaid > 0 && (
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-gold-400" /> Preferred {R(base.preferredReturnPaid)} <InfoTooltip term="preferredReturn" /></span>
                )}
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Your profit {R(base.profitShare)}</span>
              </div>
            </div>
          )}

          {/* Plain-English summary */}
          {data?.projection?.summary && (
            <p className="mt-3 rounded-lg bg-navy-50 p-2.5 text-[11px] leading-relaxed text-gray-700">
              {data.projection.summary}
            </p>
          )}

          <p className="mt-2 text-[10px] leading-relaxed text-gray-400">
            {data?.projection?.disclaimer}
          </p>
        </>
      )}
    </div>
  );
}

function ProjRow({
  label,
  term,
  down,
  base,
  up,
  downNeg,
  baseNeg,
}: {
  label: string;
  term?: Parameters<typeof InfoTooltip>[0]["term"];
  down: string;
  base: string;
  up: string;
  downNeg?: boolean;
  baseNeg?: boolean;
}) {
  return (
    <tr className="border-t border-navy-100">
      <td className="px-2 py-1.5 text-left text-gray-600">
        <span className="inline-flex items-center gap-0.5">
          {label}
          {term && <InfoTooltip term={term} />}
        </span>
      </td>
      <td className={`px-2 py-1.5 text-right font-semibold ${downNeg ? "text-red-500" : "text-gray-700"}`}>{down}</td>
      <td className={`px-2 py-1.5 text-right font-bold ${baseNeg ? "text-red-500" : "text-gray-900"}`}>{base}</td>
      <td className="px-2 py-1.5 text-right font-semibold text-emerald-600">{up}</td>
    </tr>
  );
}
