import { Building2 } from "lucide-react";

type BrandLogoProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
  wordmarkClassName?: string;
  showWordmark?: boolean;
};

const SIZE_CLASSES: Record<NonNullable<BrandLogoProps["size"]>, string> = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
  lg: "h-12 w-12",
};

const ICON_CLASSES: Record<NonNullable<BrandLogoProps["size"]>, string> = {
  sm: "h-4 w-4",
  md: "h-5 w-5",
  lg: "h-7 w-7",
};

const TEXT_CLASSES: Record<NonNullable<BrandLogoProps["size"]>, string> = {
  sm: "text-lg",
  md: "text-xl",
  lg: "text-3xl",
};

export function BrandLogo({
  size = "md",
  className = "",
  wordmarkClassName = "text-gray-900",
  showWordmark = true,
}: BrandLogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`.trim()}>
      <div
        className={`${SIZE_CLASSES[size]} flex items-center justify-center rounded-lg bg-gradient-to-br from-gold-400 to-gold-600 shadow-lg shadow-gold-500/15`}
        aria-label="Investprop"
      >
        <Building2 className={`${ICON_CLASSES[size]} text-gray-900`} />
      </div>
      {showWordmark && (
        <span className={`font-display font-bold tracking-tight ${TEXT_CLASSES[size]} ${wordmarkClassName}`}>
          Invest<span className="text-gold-500">Prop</span>
        </span>
      )}
    </div>
  );
}
