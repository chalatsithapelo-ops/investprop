/**
 * FAIS-style risk disclosure banner. Use prominently on landing,
 * opportunity, and investment-flow pages.
 */
export function RiskDisclaimer({ variant = "warning" }: { variant?: "warning" | "compact" }) {
  if (variant === "compact") {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <strong>Risk warning:</strong> Past performance does not guarantee future returns.
        Property investments are illiquid and capital is at risk. Investprop is not a registered
        financial services provider.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <div className="mb-1 font-semibold text-amber-800">⚠ Risk disclosure</div>
      <ul className="list-inside list-disc space-y-1">
        <li>Past performance does not guarantee future returns.</li>
        <li>Property investments are illiquid — your money may be tied up for years.</li>
        <li>Capital is at risk: you may lose part or all of your investment.</li>
        <li>
          Investprop is <strong>not</strong> a registered FSCA financial services provider; we operate
          as a property investment platform offering private SPV participations. Always consult a
          registered financial advisor and tax practitioner before investing.
        </li>
      </ul>
    </div>
  );
}
