import { useState } from "react";
import { ShieldAlert, ShieldCheck, Shield, Info } from "lucide-react";

type Props = {
  rating?: "LOW" | "MEDIUM" | "HIGH" | string;
  size?: "sm" | "md";
  /**
   * Optional top contributing factors shown in the tooltip popover.
   * Pass 1-3 short phrases (e.g. "Sectional title", "Long vacancy history").
   * If omitted, generic explanations per level are shown.
   */
  factors?: string[];
};

const cfg = {
  LOW: {
    label: "Low risk",
    Icon: ShieldCheck,
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
    intro: "Stable income property in an established area with verifiable financials.",
    defaultFactors: [
      "Title deed verified & freehold or strong scheme",
      "Predictable rental income with low vacancy",
      "Conservative loan-to-value and clear exit",
    ],
  },
  MEDIUM: {
    label: "Medium risk",
    Icon: Shield,
    cls: "bg-amber-50 text-amber-700 border-amber-200",
    intro: "Solid opportunity with some variables that depend on execution or market timing.",
    defaultFactors: [
      "Returns depend on letting up / renovation timing",
      "Some market or tenant concentration risk",
      "Standard SA real-estate execution risk",
    ],
  },
  HIGH: {
    label: "High risk",
    Icon: ShieldAlert,
    cls: "bg-red-50 text-red-700 border-red-200",
    intro: "Higher potential return — and higher chance of capital loss. Only suitable if you can afford the downside.",
    defaultFactors: [
      "Distressed / auction asset or unproven income",
      "Material development, zoning, or refurb risk",
      "Illiquid exit — secondary sale may take months",
    ],
  },
};

export function RiskBadge({ rating, size = "sm", factors }: Props) {
  const [open, setOpen] = useState(false);
  const key = (rating ?? "MEDIUM").toUpperCase() as keyof typeof cfg;
  const { label, Icon, cls, intro, defaultFactors } = cfg[key] ?? cfg.MEDIUM;
  const pad = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  const factorList = (factors && factors.length > 0 ? factors : defaultFactors).slice(0, 3);

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={`${label} — see what this means`}
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen((o) => !o); }}
        className={`inline-flex cursor-help items-center gap-1 rounded-full border font-medium ${pad} ${cls}`}
      >
        <Icon className={size === "sm" ? "h-3 w-3" : "h-4 w-4"} aria-hidden="true" />
        {label}
        <Info className={size === "sm" ? "h-3 w-3 opacity-60" : "h-3.5 w-3.5 opacity-60"} aria-hidden="true" />
      </button>

      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-50 mt-2 w-72 rounded-lg border border-navy-200 bg-white p-3 text-left text-xs text-gray-700 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <span className="block font-semibold text-gray-900">{label}</span>
          <span className="mt-1 block text-gray-600">{intro}</span>
          <span className="mt-2 block font-semibold text-gray-900">Top factors:</span>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-gray-700">
            {factorList.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
          <span className="mt-2 block text-[10px] italic text-gray-500">
            Risk ratings are guidance, not guarantees. Always read the deal docs.
          </span>
        </span>
      )}
    </span>
  );
}
