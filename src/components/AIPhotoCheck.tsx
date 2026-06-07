import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Sparkles, Loader2, AlertTriangle } from "lucide-react";
import { useTRPC } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

type Props = { propertyId: number };

const VERDICT_META: Record<string, { label: string; cls: string }> = {
  GREEN: { label: "Verified", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  AMBER: { label: "Partial", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  RED: { label: "Not verified", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

interface PhotoFlag { category: string; description: string }
interface PhotoCheck {
  id: number;
  verdict: string;
  confidence: number;
  narrative: string;
  flags: PhotoFlag[];
  generatedAt: string | Date;
}

export function AIPhotoCheck({ propertyId }: Props) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const token = useAuthStore((s) => s.token);

  const [showForm, setShowForm] = useState(false);
  const [urls, setUrls] = useState("");
  const [expected, setExpected] = useState("");

  const q = useQuery({
    ...trpc.getPhotoChecks.queryOptions({ authToken: token ?? "", propertyId }),
    enabled: !!token,
  });
  const checks = (q.data ?? []) as PhotoCheck[];

  const run = useMutation(
    trpc.verifyConstructionPhotos.mutationOptions({
      onSuccess: (r: { verdict: string }) => {
        toast.success(`Verification: ${r.verdict}`);
        void qc.invalidateQueries({ queryKey: trpc.getPhotoChecks.queryKey({ authToken: token ?? "", propertyId }) });
        setShowForm(false);
        setUrls("");
        setExpected("");
      },
      onError: (e) => toast.error(e.message || "Verification failed"),
    })
  );

  if (!token) return null;

  function submit() {
    const photoUrls = urls
      .split(/[\n,]/)
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//.test(u))
      .slice(0, 8);
    if (photoUrls.length === 0) {
      toast.error("Add at least one photo URL (https://…)");
      return;
    }
    if (expected.trim().length < 10) {
      toast.error("Describe the expected milestone state (min 10 chars)");
      return;
    }
    run.mutate({ authToken: token!, propertyId, photoUrls, expectedState: expected.trim() });
  }

  return (
    <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <Camera className="h-4 w-4 text-indigo-600" /> AI construction verification
        </h3>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1 text-xs font-medium text-white"
        >
          <Sparkles className="h-3 w-3" /> {showForm ? "Cancel" : "Verify photos"}
        </button>
      </div>

      {showForm && (
        <div className="mb-4 space-y-2 rounded-lg border border-navy-700 bg-navy-800/30 p-3">
          <div>
            <label className="mb-1 block text-xs text-gray-500">Site photo URLs (one per line, max 8)</label>
            <textarea
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              rows={3}
              placeholder="https://investprop.io/property-images/…"
              className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2 text-xs text-gray-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Expected milestone state</label>
            <textarea
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              rows={2}
              placeholder="e.g. Ground floor slab poured and cured, ground-floor block walls up to lintel height."
              className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2 text-xs text-gray-900"
            />
          </div>
          <button
            onClick={submit}
            disabled={run.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {run.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {run.isPending ? "Analysing…" : "Run verification"}
          </button>
        </div>
      )}

      {checks.length === 0 ? (
        <p className="py-4 text-center text-xs text-gray-500">No verifications yet.</p>
      ) : (
        <ul className="space-y-2">
          {checks.map((c) => {
            const meta = VERDICT_META[c.verdict] ?? VERDICT_META.AMBER!;
            return (
              <li key={c.id} className={`rounded-lg border p-3 ${meta.cls}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">{meta.label} · {Math.round((c.confidence ?? 0) * 100)}% confidence</span>
                  <span className="text-[10px] opacity-70">{new Date(c.generatedAt).toLocaleDateString("en-ZA")}</span>
                </div>
                <p className="mt-1 text-xs leading-relaxed opacity-90">{c.narrative}</p>
                {Array.isArray(c.flags) && c.flags.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {c.flags.map((f, i) => (
                      <li key={i} className="flex items-start gap-1 text-[11px]">
                        <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
                        <span><strong>{f.category}:</strong> {f.description}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-[10px] text-gray-500">
        Vision-model check comparing site photos to the claimed milestone. Indicative — not a substitute for site inspection.
      </p>
    </div>
  );
}
