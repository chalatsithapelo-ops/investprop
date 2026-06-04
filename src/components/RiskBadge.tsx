import { ShieldAlert, ShieldCheck, Shield } from "lucide-react";

type Props = {
  rating?: "LOW" | "MEDIUM" | "HIGH" | string;
  size?: "sm" | "md";
};

const cfg = {
  LOW: {
    label: "Low risk",
    Icon: ShieldCheck,
    cls: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  MEDIUM: {
    label: "Medium risk",
    Icon: Shield,
    cls: "bg-amber-50 text-amber-700 border-amber-200",
  },
  HIGH: {
    label: "High risk",
    Icon: ShieldAlert,
    cls: "bg-red-50 text-red-700 border-red-200",
  },
};

export function RiskBadge({ rating, size = "sm" }: Props) {
  const key = (rating ?? "MEDIUM").toUpperCase() as keyof typeof cfg;
  const { label, Icon, cls } = cfg[key] ?? cfg.MEDIUM;
  const pad = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <span
      title={`Risk rating: ${label}`}
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${pad} ${cls}`}
    >
      <Icon className={size === "sm" ? "h-3 w-3" : "h-4 w-4"} aria-hidden="true" />
      {label}
    </span>
  );
}
