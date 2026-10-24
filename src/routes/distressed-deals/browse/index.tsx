import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Loader2,
  Lock,
  MapPin,
  TrendingDown,
  TrendingUp,
  Sparkles,
  ExternalLink,
  Gavel,
  X,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Scale,
  Gauge,
  Minus,
  Hammer,
  Home,
  Target,
  Clock,
  ShieldAlert,
  AlertTriangle,
  Info,
  ListChecks,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

export const Route = createFileRoute("/distressed-deals/browse/")({
  component: SubscriberBrowsePage,
});

const PROVINCES = [
  "all",
  "Gauteng",
  "Western Cape",
  "KwaZulu-Natal",
  "Eastern Cape",
  "Free State",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
];
const PROPERTY_TYPES = ["all", "HOUSE", "RESIDENTIAL", "STUDENT", "VACANT LAND", "OFFICE", "INDUSTRIAL"];
const GRADES = ["", "A", "B", "C", "D", "E"];

const ZAR = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(n ?? 0);

const GRADE_STYLES: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-700 border-emerald-200",
  B: "bg-teal-100 text-teal-700 border-teal-200",
  C: "bg-amber-100 text-amber-700 border-amber-200",
  D: "bg-orange-100 text-orange-700 border-orange-200",
  E: "bg-red-100 text-red-700 border-red-200",
};

function GradeBadge({ grade }: { grade: string | null }) {
  if (!grade) {
    return (
      <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500">
        Ungraded
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold ${GRADE_STYLES[grade] ?? "bg-gray-100 text-gray-700"}`}>
      Grade {grade}
    </span>
  );
}

function SubscriberBrowsePage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [province, setProvince] = useState("all");
  const [propertyType, setPropertyType] = useState("all");
  const [maxPrice, setMaxPrice] = useState("");
  const [minDiscountPct, setMinDiscountPct] = useState("");
  const [minAIGrade, setMinAIGrade] = useState("");
  const [onlyGraded, setOnlyGraded] = useState(false);
  const [sortBy, setSortBy] = useState<"newest" | "discount" | "price_asc" | "ai_grade">("newest");
  const [page, setPage] = useState(1);
  const [detailId, setDetailId] = useState<number | null>(null);

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const dealsQuery = useQuery({
    ...trpc.getSubscriberDistressedDeals.queryOptions({
      authToken: authToken ?? "",
      province,
      propertyType,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      minDiscountPct: minDiscountPct ? Number(minDiscountPct) : undefined,
      minAIGrade: (minAIGrade || undefined) as any,
      onlyGraded,
      sortBy,
      page,
    }),
    enabled: !!authToken,
  });

  const data = dealsQuery.data as any;
  const entitled = data?.entitled ?? true;
  const listings: any[] = data?.listings ?? [];

  // Not entitled → upgrade prompt.
  if (data && entitled === false) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="mx-auto max-w-2xl px-4 py-20 text-center">
          <div className="mx-auto mb-5 inline-flex rounded-full bg-teal-100 p-4 text-teal-600">
            <Lock size={28} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Distressed deals are a premium feature</h1>
          <p className="mt-3 text-gray-600">
            Browse every AI-graded sheriff sale, bank repossession and auction listing in one place.
            Upgrade to Pro or DistressedDeals SA to unlock full access.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-6 py-3 font-semibold text-white hover:bg-teal-700"
            >
              <Sparkles size={18} /> View plans
            </Link>
            <Link
              to="/distressed-deals"
              className="rounded-lg border border-gray-300 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-100"
            >
              Learn more
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const resetPageAnd = (fn: () => void) => () => {
    setPage(1);
    fn();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-teal-100 px-3 py-1 text-sm font-medium text-teal-700">
              <TrendingDown size={14} /> Distressed deals
            </div>
            <h1 className="mt-3 text-2xl font-bold text-gray-900">Browse live distressed deals</h1>
            <p className="mt-1 text-sm text-gray-600">
              AI-graded auction, sheriff and bank-repossession listings, refreshed daily.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {data?.newThisWeek > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
                <Sparkles size={14} /> {data.newThisWeek} new this week
              </span>
            )}
            <Link
              to="/distressed-alerts"
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Alert settings
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-6 grid grid-cols-2 gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-3 lg:grid-cols-7">
          <label className="text-xs font-medium text-gray-600">
            Province
            <select
              value={province}
              onChange={(e) => resetPageAnd(() => setProvince(e.target.value))()}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            >
              {PROVINCES.map((p) => (
                <option key={p} value={p}>{p === "all" ? "All provinces" : p}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-gray-600">
            Type
            <select
              value={propertyType}
              onChange={(e) => resetPageAnd(() => setPropertyType(e.target.value))()}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            >
              {PROPERTY_TYPES.map((p) => (
                <option key={p} value={p}>{p === "all" ? "All types" : p}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-gray-600">
            Max price
            <input
              type="number"
              value={maxPrice}
              onChange={(e) => resetPageAnd(() => setMaxPrice(e.target.value))()}
              placeholder="Any"
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            />
          </label>
          <label className="text-xs font-medium text-gray-600">
            Min discount %
            <input
              type="number"
              value={minDiscountPct}
              onChange={(e) => resetPageAnd(() => setMinDiscountPct(e.target.value))()}
              placeholder="Any"
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            />
          </label>
          <label className="text-xs font-medium text-gray-600">
            Min AI grade
            <select
              value={minAIGrade}
              onChange={(e) => resetPageAnd(() => setMinAIGrade(e.target.value))()}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            >
              {GRADES.map((g) => (
                <option key={g} value={g}>{g === "" ? "Any" : `${g} or better`}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-medium text-gray-600">
            Sort by
            <select
              value={sortBy}
              onChange={(e) => resetPageAnd(() => setSortBy(e.target.value as any))()}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            >
              <option value="newest">Newest</option>
              <option value="discount">Biggest discount</option>
              <option value="price_asc">Lowest price</option>
              <option value="ai_grade">Best AI grade</option>
            </select>
          </label>
          <label className="flex items-end gap-2 text-xs font-medium text-gray-600">
            <input
              type="checkbox"
              checked={onlyGraded}
              onChange={(e) => resetPageAnd(() => setOnlyGraded(e.target.checked))()}
              className="h-4 w-4 rounded border-gray-300"
            />
            Graded only
          </label>
        </div>

        {/* Results */}
        {dealsQuery.isLoading ? (
          <div className="flex items-center justify-center py-24 text-gray-500">
            <Loader2 className="animate-spin" size={28} />
          </div>
        ) : listings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-20 text-center text-gray-500">
            No deals match your filters yet. Try widening them.
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {listings.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setDetailId(l.id)}
                  className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white text-left shadow-sm transition hover:shadow-md"
                >
                  <div className="relative h-40 w-full bg-gray-100">
                    {l.imageUrl ? (
                      <img src={l.imageUrl} alt={l.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-gray-300">
                        <Gavel size={36} />
                      </div>
                    )}
                    <div className="absolute left-2 top-2">
                      <GradeBadge grade={l.aiGrade} />
                    </div>
                    {l.discount != null && l.discount > 0 && (
                      <div className="absolute right-2 top-2 rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">
                        {Math.round(l.discount)}% off
                      </div>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-4">
                    <h3 className="line-clamp-2 font-semibold text-gray-900">{l.title}</h3>
                    <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">
                      <MapPin size={13} /> {[l.suburb, l.city].filter(Boolean).join(", ") || l.province}
                    </p>
                    <div className="mt-auto pt-3">
                      <div className="text-lg font-bold text-gray-900">{ZAR(l.askingPrice)}</div>
                      {l.marketValue ? (
                        <div className="text-xs text-gray-500">Market est. {ZAR(l.marketValue)}</div>
                      ) : null}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Pagination */}
            <div className="mt-8 flex items-center justify-center gap-4">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-40"
              >
                <ArrowLeft size={16} /> Prev
              </button>
              <span className="text-sm text-gray-600">
                Page {data?.currentPage ?? 1} of {Math.max(1, data?.totalPages ?? 1)} · {data?.totalCount ?? 0} deals
              </span>
              <button
                disabled={page >= (data?.totalPages ?? 1)}
                onClick={() => setPage((p) => p + 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-40"
              >
                Next <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}
      </div>

      {detailId != null && (
        <DealDetailModal
          listingId={detailId}
          authToken={authToken ?? ""}
          onClose={() => setDetailId(null)}
          onGraded={() => dealsQuery.refetch()}
          trpc={trpc}
          trpcClient={trpcClient}
        />
      )}
    </div>
  );
}

function DealDetailModal({
  listingId,
  authToken,
  onClose,
  onGraded,
  trpc,
  trpcClient,
}: {
  listingId: number;
  authToken: string;
  onClose: () => void;
  onGraded: () => void;
  trpc: ReturnType<typeof useTRPC>;
  trpcClient: ReturnType<typeof useTRPCClient>;
}) {
  const [grading, setGrading] = useState(false);
  const detailQuery = useQuery({
    ...trpc.getSubscriberDistressedDetail.queryOptions({ authToken, listingId }),
    enabled: !!authToken,
  });
  const marketQuery = useQuery({
    ...trpc.getSubscriberDistressedMarketAnalysis.queryOptions({ authToken, listingId }),
    enabled: !!authToken,
  });
  const l = detailQuery.data as any;
  const uw = (l?.aiUnderwriting ?? null) as
    | { pros?: string[]; cons?: string[]; redFlags?: string[]; recommendations?: string[] }
    | null;

  const handleGrade = async () => {
    setGrading(true);
    try {
      await trpcClient.screenSubscriberDistressedDeal.mutate({ authToken, listingId });
      await detailQuery.refetch();
      onGraded();
      toast.success("AI grade ready");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not grade this deal.");
    } finally {
      setGrading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8">
      <div className="relative w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X size={20} />
        </button>

        {detailQuery.isLoading || !l ? (
          <div className="flex items-center justify-center py-24 text-gray-500">
            <Loader2 className="animate-spin" size={28} />
          </div>
        ) : (
          <div>
            {l.imageUrl ? (
              <img src={l.imageUrl} alt={l.title} className="h-56 w-full rounded-t-2xl object-cover" />
            ) : null}
            <div className="p-6">
              <div className="flex flex-wrap items-center gap-2">
                <GradeBadge grade={l.aiGrade} />
                {l.discount != null && l.discount > 0 && (
                  <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white">
                    {Math.round(l.discount)}% below market
                  </span>
                )}
                {l.auctionType && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    {l.auctionType}
                  </span>
                )}
              </div>

              <h2 className="mt-3 text-xl font-bold text-gray-900">{l.title}</h2>
              <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">
                <MapPin size={14} /> {[l.suburb, l.city, l.province].filter(Boolean).join(", ")}
              </p>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label="Asking price" value={ZAR(l.askingPrice)} />
                {l.marketValue ? <Stat label="Market est." value={ZAR(l.marketValue)} /> : null}
                {l.bedrooms ? <Stat label="Beds" value={String(l.bedrooms)} /> : null}
                {l.bathrooms ? <Stat label="Baths" value={String(l.bathrooms)} /> : null}
                {l.erfSize ? <Stat label="Erf" value={`${l.erfSize} m²`} /> : null}
                {l.auctionDate ? (
                  <Stat label="Auction" value={new Date(l.auctionDate).toLocaleDateString("en-ZA")} />
                ) : null}
              </div>

              {/* AI breakdown */}
              <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                    <Sparkles size={16} className="text-teal-600" /> AI deal breakdown
                  </h3>
                  {!l.aiGrade && (
                    <button
                      onClick={handleGrade}
                      disabled={grading}
                      className="inline-flex items-center gap-1 rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
                    >
                      {grading && <Loader2 className="animate-spin" size={14} />}
                      Grade this deal
                    </button>
                  )}
                </div>

                {l.aiSummary ? (
                  <p className="mt-3 text-sm text-gray-700">{l.aiSummary}</p>
                ) : (
                  <p className="mt-3 text-sm text-gray-500">
                    Not graded yet. Run the AI screen to get an A–E grade, risk score and underwriting notes.
                  </p>
                )}

                {uw && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <BreakdownList title="Pros" items={uw.pros} tone="text-emerald-700" />
                    <BreakdownList title="Cons" items={uw.cons} tone="text-amber-700" />
                    <BreakdownList title="Red flags" items={uw.redFlags} tone="text-red-700" />
                    <BreakdownList title="Recommendations" items={uw.recommendations} tone="text-teal-700" />
                  </div>
                )}
              </div>

              {/* Market analysis */}
              <MarketAnalysisPanel
                data={marketQuery.data as any}
                isLoading={marketQuery.isLoading}
              />

              {l.description ? (
                <p className="mt-5 whitespace-pre-line text-sm text-gray-600">{l.description}</p>
              ) : null}

              {l.sourceUrl ? (
                <a
                  href={l.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-teal-700 hover:underline"
                >
                  View original listing ({l.source}) <ExternalLink size={14} />
                </a>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-2.5">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function BreakdownList({ title, items, tone }: { title: string; items?: string[]; tone: string }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <div className={`text-xs font-bold uppercase tracking-wide ${tone}`}>{title}</div>
      <ul className="mt-1 space-y-1">
        {items.map((it, i) => (
          <li key={i} className="text-sm text-gray-700">
            • {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

const VERDICT_STYLES: Record<string, string> = {
  Strong: "bg-emerald-100 text-emerald-800 border-emerald-200",
  Solid: "bg-teal-100 text-teal-800 border-teal-200",
  Fair: "bg-amber-100 text-amber-800 border-amber-200",
  Weak: "bg-orange-100 text-orange-800 border-orange-200",
  Avoid: "bg-red-100 text-red-800 border-red-200",
};

const SIGNAL_STYLES: Record<string, { dot: string; text: string }> = {
  POSITIVE: { dot: "bg-emerald-500", text: "text-emerald-700" },
  NEUTRAL: { dot: "bg-gray-400", text: "text-gray-600" },
  CAUTION: { dot: "bg-red-500", text: "text-red-700" },
};

const RISK_STYLES: Record<string, { wrap: string; badge: string; Icon: typeof Info }> = {
  INFO: { wrap: "border-sky-200 bg-sky-50", badge: "text-sky-700", Icon: Info },
  ATTENTION: { wrap: "border-amber-200 bg-amber-50", badge: "text-amber-700", Icon: AlertTriangle },
  WARNING: { wrap: "border-red-200 bg-red-50", badge: "text-red-700", Icon: ShieldAlert },
};

const STALENESS_LABEL: Record<string, { text: string; cls: string }> = {
  FRESH: { text: "Fresh", cls: "text-emerald-600" },
  NORMAL: { text: "On market", cls: "text-gray-700" },
  STALE: { text: "Stale", cls: "text-red-600" },
  UNKNOWN: { text: "—", cls: "text-gray-400" },
};

function MarketAnalysisPanel({ data, isLoading }: { data: any; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="mt-6 flex items-center justify-center rounded-xl border border-gray-200 bg-white py-8 text-gray-400">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }
  if (!data) return null;

  const a = data;
  const v = a.verdict;
  const estValue = a.valuation?.estimatedValue as number | null;
  const margin = a.valuation?.impliedMarginPct as number | null;
  const trendDir = a.trend?.direction as string;
  const TrendIcon = trendDir === "RISING" ? TrendingUp : trendDir === "FALLING" ? TrendingDown : Minus;

  return (
    <div className="mt-6 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-gray-900">
          <BarChart3 size={16} className="text-indigo-600" /> Market analysis
        </h3>
        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${VERDICT_STYLES[v?.label] ?? "bg-gray-100 text-gray-700"}`}>
          <Gauge size={12} /> {v?.label} · {v?.score}/100
        </span>
      </div>

      {v?.rationale && <p className="mt-2 text-sm text-gray-700">{v.rationale}</p>}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {estValue != null && (
          <Stat
            label="Benchmark value"
            value={ZAR(estValue)}
          />
        )}
        {margin != null && (
          <div className="rounded-lg border border-gray-200 bg-white p-2.5">
            <div className="text-xs text-gray-500">Margin of safety</div>
            <div className={`font-semibold ${margin >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {margin >= 0 ? "+" : ""}
              {margin.toFixed(0)}%
            </div>
          </div>
        )}
        {a.area?.medianPricePerSqm != null && (
          <Stat label="Area median R/m²" value={ZAR(a.area.medianPricePerSqm)} />
        )}
        {a.subject?.pricePerSqm != null && (
          <Stat label="This deal R/m²" value={ZAR(a.subject.pricePerSqm)} />
        )}
        {a.positioning?.pricePercentile != null && (
          <Stat label="Cheaper than" value={`${a.positioning.pricePercentile}% of comps`} />
        )}
        {trendDir && trendDir !== "UNKNOWN" && (
          <div className="rounded-lg border border-gray-200 bg-white p-2.5">
            <div className="text-xs text-gray-500">Area trend</div>
            <div className="flex items-center gap-1 font-semibold text-gray-900">
              <TrendIcon size={14} className={trendDir === "RISING" ? "text-emerald-600" : trendDir === "FALLING" ? "text-red-600" : "text-gray-500"} />
              {trendDir === "RISING" ? "Rising" : trendDir === "FALLING" ? "Softening" : "Flat"}
            </div>
          </div>
        )}
      </div>

      {Array.isArray(a.signals) && a.signals.length > 0 && (
        <div className="mt-4 space-y-1.5">
          {a.signals.map((s: any, i: number) => {
            const st = SIGNAL_STYLES[s.status] ?? SIGNAL_STYLES.NEUTRAL;
            return (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${st.dot}`} />
                <span className="text-gray-700">
                  <span className={`font-medium ${st.text}`}>{s.label}:</span> {s.detail}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {(a.projections?.flip || a.projections?.rental) && (
        <div className="mt-4 rounded-lg border border-indigo-100 bg-white p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">
            <Hammer size={12} /> Projected returns
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {a.projections.flip && (
              <>
                <Stat label="Flip net ROI" value={`${a.projections.flip.roiPct.toFixed(0)}%`} />
                <Stat label="Flip net profit" value={ZAR(a.projections.flip.netProfit)} />
                <Stat label="Annualised" value={`${a.projections.flip.annualisedPct.toFixed(0)}%`} />
                <Stat label="Benchmark ARV" value={ZAR(a.projections.flip.arv)} />
              </>
            )}
          </div>
          {a.projections.rental && (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Est. monthly rent" value={ZAR(a.projections.rental.estimatedMonthlyRent)} />
              <Stat label="Gross yield" value={`${a.projections.rental.grossYieldPct.toFixed(1)}%`} />
              <Stat label="Net yield" value={`${a.projections.rental.netYieldPct.toFixed(1)}%`} />
              <Stat
                label="Monthly cashflow"
                value={ZAR(a.projections.rental.monthlyNetCashflow)}
              />
            </div>
          )}
          {a.projections.assumptions && (
            <p className="mt-2 flex items-start gap-1 text-[11px] leading-snug text-gray-400">
              <Home size={11} className="mt-0.5 shrink-0" /> {a.projections.assumptions}
            </p>
          )}
        </div>
      )}

      {a.maxBid && (a.maxBid.maxBidForTarget != null || a.maxBid.breakEvenPrice != null) && (
        <div className="mt-4 rounded-lg border border-indigo-100 bg-white p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">
            <Target size={12} /> Bidding guide
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {a.maxBid.maxBidForTarget != null && (
              <Stat
                label={`Max bid (${a.maxBid.targetRoiPct.toFixed(0)}% ROI)`}
                value={ZAR(a.maxBid.maxBidForTarget)}
              />
            )}
            {a.maxBid.breakEvenPrice != null && (
              <Stat label="Break-even price" value={ZAR(a.maxBid.breakEvenPrice)} />
            )}
            {a.maxBid.askingVsMaxBidPct != null && (
              <div className="rounded-lg border border-gray-200 bg-white p-2.5">
                <div className="text-xs text-gray-500">Asking vs max bid</div>
                <div
                  className={`font-semibold ${a.maxBid.askingVsMaxBidPct <= 0 ? "text-emerald-600" : "text-red-600"}`}
                >
                  {a.maxBid.askingVsMaxBidPct > 0 ? "+" : ""}
                  {a.maxBid.askingVsMaxBidPct.toFixed(0)}%
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {a.activity && a.activity.staleness !== "UNKNOWN" && (
        <div className="mt-4 rounded-lg border border-indigo-100 bg-white p-3">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">
            <Clock size={12} /> Market activity
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {a.activity.daysOnMarket != null && (
              <div className="rounded-lg border border-gray-200 bg-white p-2.5">
                <div className="text-xs text-gray-500">Days on market</div>
                <div className="font-semibold text-gray-900">
                  {a.activity.daysOnMarket}{" "}
                  <span className={`text-xs font-medium ${STALENESS_LABEL[a.activity.staleness]?.cls}`}>
                    · {STALENESS_LABEL[a.activity.staleness]?.text}
                  </span>
                </div>
              </div>
            )}
            {a.activity.priceDropCount > 0 && (
              <Stat label="Price cuts" value={`${a.activity.priceDropCount}`} />
            )}
            {a.activity.totalDropPct != null && (
              <Stat label="Total price cut" value={`${a.activity.totalDropPct.toFixed(0)}%`} />
            )}
            {a.activity.dropVelocityPctPerMonth != null && (
              <Stat
                label="Cut velocity"
                value={`${a.activity.dropVelocityPctPerMonth.toFixed(1)}%/mo`}
              />
            )}
          </div>
        </div>
      )}

      {Array.isArray(a.auctionRisk) && a.auctionRisk.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">
            <ShieldAlert size={12} /> Auction & distressed-sale risks
          </div>
          <div className="mt-2 space-y-2">
            {a.auctionRisk.map((r: any, i: number) => {
              const st = RISK_STYLES[r.severity] ?? RISK_STYLES.INFO;
              const Icon = st.Icon;
              return (
                <div key={i} className={`flex items-start gap-2 rounded-lg border p-2.5 text-sm ${st.wrap}`}>
                  <Icon size={14} className={`mt-0.5 shrink-0 ${st.badge}`} />
                  <span className="text-gray-700">
                    <span className={`font-semibold ${st.badge}`}>{r.label}:</span> {r.detail}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {Array.isArray(v?.factors) && v.factors.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">
            <ListChecks size={12} /> How we scored this
          </div>
          <div className="mt-2 space-y-1">
            {v.factors.map((f: any, i: number) => (
              <div key={i} className="flex items-center justify-between gap-2 text-sm">
                <span className="text-gray-700">
                  <span className="font-medium text-gray-900">{f.label}</span>
                  {f.note ? <span className="text-gray-500"> — {f.note}</span> : null}
                </span>
                <span
                  className={`shrink-0 font-semibold tabular-nums ${f.impact > 0 ? "text-emerald-600" : f.impact < 0 ? "text-red-600" : "text-gray-400"}`}
                >
                  {f.impact > 0 ? "+" : ""}
                  {f.impact.toFixed(0)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {Array.isArray(a.comparables) && a.comparables.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-gray-500">
            <Scale size={12} /> Comparable listings ({a.area?.level} · {a.area?.name})
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-gray-400">
                <tr>
                  <th className="pb-1 pr-2 font-medium">Property</th>
                  <th className="pb-1 pr-2 font-medium">Asking</th>
                  <th className="pb-1 font-medium">R/m²</th>
                </tr>
              </thead>
              <tbody className="text-gray-700">
                {a.comparables.map((c: any) => (
                  <tr key={c.id} className="border-t border-gray-100">
                    <td className="py-1 pr-2">
                      <span className="line-clamp-1">{c.title}</span>
                      <span className="text-gray-400">{[c.suburb, c.city].filter(Boolean).join(", ")}</span>
                    </td>
                    <td className="py-1 pr-2 font-medium">{ZAR(c.askingPrice)}</td>
                    <td className="py-1">{c.pricePerSqm != null ? ZAR(c.pricePerSqm) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-snug text-gray-400">
        Benchmark derived from comparable distressed/auction asking prices in the area — a guide, not a formal valuation. Always verify with your own due diligence.
      </p>
    </div>
  );
}

