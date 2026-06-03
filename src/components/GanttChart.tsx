import { useMemo } from "react";

const statusColor: Record<string, string> = {
  PLANNED: "bg-gray-500",
  IN_PROGRESS: "bg-gold-500",
  COMPLETED: "bg-emerald-500",
  DELAYED: "bg-red-500",
};

const statusText: Record<string, string> = {
  PLANNED: "text-gray-500",
  IN_PROGRESS: "text-gold-600",
  COMPLETED: "text-emerald-600",
  DELAYED: "text-red-600",
};

export function GanttChart({ milestones }: { milestones: any[] }) {
  const { chartStart, chartEnd, totalDays } = useMemo(() => {
    if (milestones.length === 0) return { chartStart: new Date(), chartEnd: new Date(), totalDays: 1 };

    const starts = milestones.map((m) => new Date(m.estimatedStartDate || m.startDate || m.createdAt).getTime());
    const ends = milestones.map((m) => new Date(m.estimatedCompletionDate || m.endDate || m.createdAt).getTime());

    const minDate = new Date(Math.min(...starts));
    const maxDate = new Date(Math.max(...ends));

    // Pad a week on each side
    minDate.setDate(minDate.getDate() - 7);
    maxDate.setDate(maxDate.getDate() + 7);

    const days = Math.max(1, Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 60 * 60 * 24)));
    return { chartStart: minDate, chartEnd: maxDate, totalDays: days };
  }, [milestones]);

  const today = new Date();
  const todayOffset = Math.max(0, Math.min(100, ((today.getTime() - chartStart.getTime()) / (1000 * 60 * 60 * 24) / totalDays) * 100));

  const formatDate = (d: string | Date) => {
    const date = typeof d === "string" ? new Date(d) : d;
    return date.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
  };

  if (milestones.length === 0) {
    return (
      <div className="rounded-xl border border-navy-700 bg-navy-800/50 py-12 text-center">
        <p className="text-gray-500">No milestones to display</p>
      </div>
    );
  }

  const sorted = [...milestones].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  return (
    <div className="rounded-xl border border-navy-700 bg-navy-800/50 p-5">
      <h3 className="mb-4 text-lg font-bold text-gray-900">Project Timeline</h3>

      {/* Date headers */}
      <div className="mb-2 flex justify-between text-xs text-gray-500">
        <span>{formatDate(chartStart)}</span>
        <span>{formatDate(new Date((chartStart.getTime() + chartEnd.getTime()) / 2))}</span>
        <span>{formatDate(chartEnd)}</span>
      </div>

      {/* Chart area */}
      <div className="relative">
        {/* Today marker */}
        {todayOffset > 0 && todayOffset < 100 && (
          <div
            className="absolute top-0 z-10 h-full w-px border-l-2 border-dashed border-red-500"
            style={{ left: `${todayOffset}%` }}
          >
            <span className="absolute -top-5 -translate-x-1/2 whitespace-nowrap rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
              Today
            </span>
          </div>
        )}

        {/* Bars */}
        <div className="space-y-3">
          {sorted.map((m: any) => {
            const start = new Date(m.estimatedStartDate || m.startDate || m.createdAt);
            const end = new Date(m.estimatedCompletionDate || m.endDate || m.createdAt);
            const startPct = Math.max(0, ((start.getTime() - chartStart.getTime()) / (1000 * 60 * 60 * 24) / totalDays) * 100);
            const widthPct = Math.max(2, ((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24) / totalDays) * 100);
            const status = m.status ?? "PLANNED";
            const barColor = statusColor[status] ?? statusColor.PLANNED;
            const txtColor = statusText[status] ?? statusText.PLANNED;
            const progress = m.progress ?? m.percentageComplete ?? 0;

            return (
              <div key={m.id} className="flex items-center gap-3">
                {/* Label */}
                <div className="w-36 flex-shrink-0 truncate text-sm text-gray-600" title={m.name}>
                  {m.name}
                </div>

                {/* Bar track */}
                <div className="relative h-8 flex-1 rounded bg-navy-900/60">
                  {/* Bar */}
                  <div
                    className={`absolute top-0 flex h-full items-center rounded ${barColor}/30`}
                    style={{ left: `${startPct}%`, width: `${widthPct}%` }}
                  >
                    {/* Filled portion */}
                    {progress > 0 && (
                      <div
                        className={`h-full rounded-l ${barColor}`}
                        style={{ width: `${Math.min(100, progress)}%` }}
                      />
                    )}
                  </div>

                  {/* Date labels inside bar */}
                  <div
                    className="pointer-events-none absolute top-0 flex h-full items-center px-2 text-[10px] text-gray-900/70"
                    style={{ left: `${startPct}%`, width: `${widthPct}%` }}
                  >
                    <span className="truncate">
                      {formatDate(start)} – {formatDate(end)}
                    </span>
                  </div>
                </div>

                {/* Status */}
                <span className={`w-16 flex-shrink-0 text-right text-xs font-medium ${txtColor}`}>
                  {progress}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-5 flex flex-wrap gap-4 border-t border-navy-700 pt-4">
        {Object.entries(statusColor).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className={`inline-block h-2.5 w-2.5 rounded-full ${color}`} />
            {status.replace("_", " ")}
          </div>
        ))}
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <span className="inline-block h-2.5 w-px border-l-2 border-dashed border-red-500" />
          Today
        </div>
      </div>
    </div>
  );
}
