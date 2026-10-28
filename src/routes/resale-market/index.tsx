import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  Loader2,
  MapPin,
  Home,
  Search,
  X,
  BedDouble,
  Bath,
  Ruler,
  Landmark,
  Send,
  ImageOff,
} from "lucide-react";
import { Navbar } from "~/components/Navbar";
import { useTRPC, useTRPCClient } from "~/trpc/react";
import { useAuthStore } from "~/stores/authStore";
import toast from "react-hot-toast";

export const Route = createFileRoute("/resale-market/")({
  component: ResaleMarketPage,
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

const ZAR = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(n ?? 0);

function ResaleMarketPage() {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user) as any;
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const [province, setProvince] = useState("all");
  const [propertyType, setPropertyType] = useState("all");
  const [maxPrice, setMaxPrice] = useState("");
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<number | null>(null);

  // Express-interest form state
  const [offerAmount, setOfferAmount] = useState("");
  const [message, setMessage] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) navigate({ to: "/login" });
  }, [user, authToken, hasHydrated]);

  const listingsQuery = useQuery({
    ...trpc.getPublicResaleListings.queryOptions({
      authToken: authToken ?? "",
      province: province === "all" ? undefined : province,
      propertyType: propertyType === "all" ? undefined : propertyType,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      search: search.trim() || undefined,
    }),
    enabled: !!authToken,
  });

  const listings: any[] = (listingsQuery.data as any)?.listings ?? [];

  const detailQuery = useQuery({
    ...trpc.getPublicResaleListing.queryOptions({
      authToken: authToken ?? "",
      id: detailId ?? 0,
    }),
    enabled: !!authToken && !!detailId,
  });
  const detail: any = (detailQuery.data as any)?.listing ?? null;

  const interestMutation = useMutation({
    mutationFn: (params: { id: number; offerAmount?: number; message?: string; contactPhone?: string }) =>
      (trpcClient as any).expressResaleInterest.mutate({
        authToken: authToken ?? "",
        ...params,
      }),
    onSuccess: () => {
      toast.success("Your interest has been sent. The team will be in touch.");
      setOfferAmount("");
      setMessage("");
      setContactPhone("");
      setDetailId(null);
    },
    onError: (err: any) => toast.error(err.message ?? "Could not send your interest"),
  });

  const closeDetail = () => {
    setDetailId(null);
    setOfferAmount("");
    setMessage("");
    setContactPhone("");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-purple-700">
            <Home size={22} />
            <h1 className="text-2xl font-bold text-gray-900">Resale Market</h1>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Homes listed directly by owners for sale to the public. Found one you love? Get prequalified and make an
            offer.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-6 grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Province</label>
            <select
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {PROVINCES.map((p) => (
                <option key={p} value={p}>
                  {p === "all" ? "All provinces" : p}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Property type</label>
            <select
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t === "all" ? "All types" : t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Max price (R)</label>
            <input
              type="number"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
              placeholder="e.g. 1500000"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Search</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Title, city, address"
                className="w-full rounded-lg border border-gray-300 py-2 pl-8 pr-3 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Results */}
        {listingsQuery.isLoading ? (
          <div className="flex items-center justify-center py-20 text-gray-500">
            <Loader2 className="mr-2 animate-spin" /> Loading listings…
          </div>
        ) : listings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white py-20 text-center">
            <Home className="mx-auto mb-3 text-gray-300" size={40} />
            <p className="text-sm font-medium text-gray-600">No listings match your filters yet.</p>
            <p className="mt-1 text-xs text-gray-400">Check back soon — new homes are added regularly.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((l) => {
              const img = Array.isArray(l.imageUrls) && l.imageUrls.length > 0 ? l.imageUrls[0] : null;
              return (
                <button
                  key={l.id}
                  onClick={() => setDetailId(l.id)}
                  className="group overflow-hidden rounded-xl border border-gray-200 bg-white text-left shadow-sm transition hover:shadow-md"
                >
                  <div className="relative h-44 w-full overflow-hidden bg-gray-100">
                    {img ? (
                      <img
                        src={img}
                        alt={l.title}
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-gray-300">
                        <ImageOff size={32} />
                      </div>
                    )}
                    <span className="absolute left-2 top-2 rounded-full bg-purple-600/90 px-2 py-0.5 text-xs font-semibold text-white">
                      {l.propertyType}
                    </span>
                  </div>
                  <div className="p-4">
                    <h3 className="line-clamp-1 font-semibold text-gray-900">{l.title}</h3>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
                      <MapPin size={12} /> {l.city}, {l.province}
                    </p>
                    <p className="mt-2 text-lg font-bold text-purple-700">{ZAR(l.askingPrice)}</p>
                    <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                      {l.bedrooms != null && (
                        <span className="flex items-center gap-1">
                          <BedDouble size={12} /> {l.bedrooms}
                        </span>
                      )}
                      {l.bathrooms != null && (
                        <span className="flex items-center gap-1">
                          <Bath size={12} /> {l.bathrooms}
                        </span>
                      )}
                      {l.squareMeters != null && (
                        <span className="flex items-center gap-1">
                          <Ruler size={12} /> {l.squareMeters} m²
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {detailId && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
          onClick={closeDetail}
        >
          <div
            className="my-8 w-full max-w-2xl rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {detailQuery.isLoading || !detail ? (
              <div className="flex items-center justify-center py-20 text-gray-500">
                <Loader2 className="mr-2 animate-spin" /> Loading…
              </div>
            ) : (
              <div>
                {/* Images */}
                <div className="relative h-56 w-full overflow-hidden rounded-t-2xl bg-gray-100">
                  {Array.isArray(detail.imageUrls) && detail.imageUrls.length > 0 ? (
                    <img src={detail.imageUrls[0]} alt={detail.title} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-gray-300">
                      <ImageOff size={40} />
                    </div>
                  )}
                  <button
                    onClick={closeDetail}
                    className="absolute right-3 top-3 rounded-full bg-white/90 p-1.5 text-gray-600 hover:bg-white"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="p-6">
                  <h2 className="text-xl font-bold text-gray-900">{detail.title}</h2>
                  <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">
                    <MapPin size={14} /> {detail.address}, {detail.city}, {detail.province}
                  </p>
                  <p className="mt-3 text-2xl font-bold text-purple-700">{ZAR(detail.askingPrice)}</p>

                  {/* Specs */}
                  <div className="mt-4 flex flex-wrap gap-4 text-sm text-gray-600">
                    {detail.bedrooms != null && (
                      <span className="flex items-center gap-1">
                        <BedDouble size={16} /> {detail.bedrooms} bed
                      </span>
                    )}
                    {detail.bathrooms != null && (
                      <span className="flex items-center gap-1">
                        <Bath size={16} /> {detail.bathrooms} bath
                      </span>
                    )}
                    {detail.squareMeters != null && (
                      <span className="flex items-center gap-1">
                        <Ruler size={16} /> {detail.squareMeters} m²
                      </span>
                    )}
                    {detail.erfSize != null && (
                      <span className="flex items-center gap-1">
                        Erf {detail.erfSize} m²
                      </span>
                    )}
                  </div>

                  {detail.description && (
                    <p className="mt-4 whitespace-pre-line text-sm text-gray-700">{detail.description}</p>
                  )}

                  {/* Prequalify CTA */}
                  <Link
                    to="/finance/prequalify"
                    search={{ propertyPrice: Number(detail.askingPrice) } as any}
                    className="mt-5 flex items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100"
                  >
                    <Landmark size={16} />
                    Get prequalified for a home loan
                  </Link>

                  {/* Express interest / offer */}
                  <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <h3 className="mb-3 text-sm font-semibold text-gray-900">Express interest / make an offer</h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">Your offer (R, optional)</label>
                        <input
                          type="number"
                          value={offerAmount}
                          onChange={(e) => setOfferAmount(e.target.value)}
                          placeholder={String(detail.askingPrice)}
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-gray-600">Contact phone (optional)</label>
                        <input
                          type="tel"
                          value={contactPhone}
                          onChange={(e) => setContactPhone(e.target.value)}
                          placeholder="e.g. 082 123 4567"
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="mb-1 block text-xs font-medium text-gray-600">Message (optional)</label>
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={3}
                        placeholder="Tell us when you'd like to view, or any questions."
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <button
                      onClick={() =>
                        interestMutation.mutate({
                          id: detail.id,
                          offerAmount: offerAmount ? Number(offerAmount) : undefined,
                          message: message.trim() || undefined,
                          contactPhone: contactPhone.trim() || undefined,
                        })
                      }
                      disabled={interestMutation.isPending}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
                    >
                      {interestMutation.isPending ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Send size={16} />
                      )}
                      Send my interest
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
