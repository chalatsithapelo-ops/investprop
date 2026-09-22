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
      <img
        src="/investprop-mark.svg"
        alt="Investprop"
        className={`${SIZE_CLASSES[size]} rounded-lg shadow-lg shadow-gold-500/20`}
        loading="eager"
      />
      {showWordmark && (
        <span className={`font-display font-bold tracking-tight ${TEXT_CLASSES[size]} ${wordmarkClassName}`}>
          Invest<span className="text-gold-500">Prop</span>
        </span>
      )}
    </div>
  );
}
