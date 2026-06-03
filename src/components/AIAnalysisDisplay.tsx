import { Sparkles, Brain, TrendingUp, AlertTriangle, CheckCircle } from "lucide-react";

const sectionConfig: Record<string, { icon: typeof Sparkles; color: string }> = {
  summary: { icon: Brain, color: "text-gold-600" },
  "market analysis": { icon: TrendingUp, color: "text-emerald-600" },
  "risk assessment": { icon: AlertTriangle, color: "text-orange-400" },
  "investment recommendation": { icon: CheckCircle, color: "text-blue-600" },
};

function getSectionMeta(title: string) {
  const key = title.toLowerCase().replace(/^#+\s*/, "").trim();
  for (const [k, v] of Object.entries(sectionConfig)) {
    if (key.includes(k)) return v;
  }
  return { icon: Sparkles, color: "text-gold-600" };
}

export function AIAnalysisDisplay({ analysis }: { analysis: string | null }) {
  if (!analysis || analysis.trim() === "") {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-navy-800/50 bg-navy-900/50 p-12 text-center">
        <div className="mb-4 rounded-full bg-gold-50 p-4">
          <Sparkles className="h-8 w-8 text-gold-600" />
        </div>
        <p className="text-lg font-semibold text-gray-600">No AI analysis available yet</p>
        <p className="mt-1 text-sm text-gray-500">Analysis will appear here once generated.</p>
      </div>
    );
  }

  const sections = parseSections(analysis);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-gold-600" />
        <h3 className="text-lg font-bold text-gray-900">AI Property Analysis</h3>
      </div>

      {sections.map((section, i) => {
        const meta = getSectionMeta(section.title);
        const Icon = meta.icon;
        return (
          <div key={i}>
            {i > 0 && (
              <div className="my-4 h-px bg-gradient-to-r from-transparent via-gold-500/30 to-transparent" />
            )}
            <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-5">
              {section.title && (
                <div className="mb-3 flex items-center gap-2">
                  <div className={`rounded-lg bg-navy-800/80 p-2`}>
                    <Icon className={`h-5 w-5 ${meta.color}`} />
                  </div>
                  <h4 className="text-base font-semibold text-gray-900">{section.title.replace(/^#+\s*/, "")}</h4>
                </div>
              )}
              <div className="space-y-2">
                {section.lines.map((line, j) => (
                  <p key={j} className="text-sm leading-relaxed text-gray-600">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function parseSections(text: string): { title: string; lines: string[] }[] {
  const rawLines = text.split("\n");
  const sections: { title: string; lines: string[] }[] = [];
  let current: { title: string; lines: string[] } = { title: "", lines: [] };

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("##")) {
      if (current.title || current.lines.length > 0) {
        sections.push(current);
      }
      current = { title: trimmed.replace(/^#+\s*/, ""), lines: [] };
    } else if (trimmed) {
      current.lines.push(trimmed);
    }
  }

  if (current.title || current.lines.length > 0) {
    sections.push(current);
  }

  if (sections.length === 0) {
    sections.push({ title: "Summary", lines: rawLines.filter((l) => l.trim()) });
  }

  return sections;
}
