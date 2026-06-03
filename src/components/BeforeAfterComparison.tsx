import { useState, useCallback, useRef } from "react";
import { ArrowLeftRight } from "lucide-react";

type BeforeAfterComparisonProps = {
  beforeImage: string;
  afterImage: string;
  beforeLabel?: string;
  afterLabel?: string;
};

export function BeforeAfterComparison({
  beforeImage,
  afterImage,
  beforeLabel = "Before",
  afterLabel = "After",
}: BeforeAfterComparisonProps) {
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current || !dragging.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
    setPosition(pct);
  }, []);

  const onMouseDown = useCallback(() => {
    dragging.current = true;
    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX);
    const onMouseUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [handleMove]);

  const onTouchStart = useCallback(() => {
    dragging.current = true;
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) handleMove(e.touches[0].clientX);
    };
    const onTouchEnd = () => {
      dragging.current = false;
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
    window.addEventListener("touchmove", onTouchMove);
    window.addEventListener("touchend", onTouchEnd);
  }, [handleMove]);

  return (
    <div className="overflow-hidden rounded-xl border border-navy-800/50 bg-navy-900/50">
      <div className="flex items-center gap-2 border-b border-navy-800/50 px-4 py-3">
        <ArrowLeftRight className="h-5 w-5 text-gold-600" />
        <h3 className="text-sm font-semibold text-gray-900">Before &amp; After Comparison</h3>
      </div>

      <div
        ref={containerRef}
        className="relative aspect-video w-full cursor-col-resize select-none overflow-hidden"
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
      >
        {/* After image (full background) */}
        <img
          src={afterImage}
          alt={afterLabel}
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
        />

        {/* Before image (clipped) */}
        <img
          src={beforeImage}
          alt={beforeLabel}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
          draggable={false}
        />

        {/* Divider line */}
        <div
          className="absolute top-0 bottom-0 z-10 w-0.5 bg-gold-500"
          style={{ left: `${position}%` }}
        />

        {/* Drag handle */}
        <div
          className="absolute top-1/2 z-20 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-gold-500 bg-navy-900/90 shadow-lg"
          style={{ left: `${position}%` }}
        >
          <ArrowLeftRight className="h-4 w-4 text-gold-600" />
        </div>

        {/* Labels */}
        <div className="absolute top-3 left-3 z-10 rounded-md bg-navy-900/80 px-2.5 py-1 text-xs font-semibold text-gray-900 backdrop-blur-sm">
          {beforeLabel}
        </div>
        <div className="absolute top-3 right-3 z-10 rounded-md bg-navy-900/80 px-2.5 py-1 text-xs font-semibold text-gray-900 backdrop-blur-sm">
          {afterLabel}
        </div>
      </div>
    </div>
  );
}
