import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Filter, X, SlidersHorizontal } from "lucide-react";

type PropertyFilters = {
  search: string;
  type: string;
  status: string;
  minPrice: number | null;
  maxPrice: number | null;
  location: string;
  sortBy: string;
};

type PropertySearchFilterProps = {
  onFilter: (filters: PropertyFilters) => void;
};

const INITIAL_FILTERS: PropertyFilters = {
  search: "",
  type: "ALL",
  status: "ALL",
  minPrice: null,
  maxPrice: null,
  location: "",
  sortBy: "NEWEST",
};

const PROPERTY_TYPES = [
  { value: "ALL", label: "All Types" },
  { value: "FLIP", label: "Flip" },
  { value: "RENTAL", label: "Rental" },
  { value: "DEVELOPMENT", label: "Development" },
];

const STATUS_OPTIONS = [
  { value: "ALL", label: "All Statuses" },
  { value: "ACTIVE", label: "Active" },
  { value: "PENDING", label: "Pending" },
  { value: "SOLD", label: "Sold" },
  { value: "UNDER_OFFER", label: "Under Offer" },
];

const SORT_OPTIONS = [
  { value: "NEWEST", label: "Newest First" },
  { value: "PRICE_ASC", label: "Price: Low to High" },
  { value: "PRICE_DESC", label: "Price: High to Low" },
  { value: "ROI_DESC", label: "ROI: High to Low" },
];

export function PropertySearchFilter({ onFilter }: PropertySearchFilterProps) {
  const [filters, setFilters] = useState<PropertyFilters>(INITIAL_FILTERS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedOnFilter = useCallback(
    (updated: PropertyFilters) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onFilter(updated);
      }, 300);
    },
    [onFilter],
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const updateFilter = <K extends keyof PropertyFilters>(key: K, value: PropertyFilters[K]) => {
    const updated = { ...filters, [key]: value };
    setFilters(updated);
    debouncedOnFilter(updated);
  };

  const handleApply = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onFilter(filters);
  };

  const handleClear = () => {
    setFilters(INITIAL_FILTERS);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    onFilter(INITIAL_FILTERS);
  };

  const activeFilterCount = [
    filters.search !== "",
    filters.type !== "ALL",
    filters.status !== "ALL",
    filters.minPrice !== null,
    filters.maxPrice !== null,
    filters.location !== "",
    filters.sortBy !== "NEWEST",
  ].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* Primary Row: Search + Quick Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={filters.search}
            onChange={(e) => updateFilter("search", e.target.value)}
            placeholder="Search properties..."
            className="w-full rounded-lg border border-navy-800/50 bg-navy-900/50 py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder-gray-500 outline-none transition-colors focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/30"
          />
          {filters.search && (
            <button
              onClick={() => updateFilter("search", "")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-200"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Property Type */}
        <select
          value={filters.type}
          onChange={(e) => updateFilter("type", e.target.value)}
          className="rounded-lg border border-navy-800/50 bg-navy-900/50 px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-gold-500/50"
        >
          {PROPERTY_TYPES.map((t) => (
            <option key={t.value} value={t.value} className="bg-navy-900">
              {t.label}
            </option>
          ))}
        </select>

        {/* Status */}
        <select
          value={filters.status}
          onChange={(e) => updateFilter("status", e.target.value)}
          className="rounded-lg border border-navy-800/50 bg-navy-900/50 px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-gold-500/50"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value} className="bg-navy-900">
              {s.label}
            </option>
          ))}
        </select>

        {/* Sort By */}
        <select
          value={filters.sortBy}
          onChange={(e) => updateFilter("sortBy", e.target.value)}
          className="rounded-lg border border-navy-800/50 bg-navy-900/50 px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-gold-500/50"
        >
          {SORT_OPTIONS.map((s) => (
            <option key={s.value} value={s.value} className="bg-navy-900">
              {s.label}
            </option>
          ))}
        </select>

        {/* Advanced Toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
            showAdvanced
              ? "border-gold-500/50 bg-gold-50 text-gold-600"
              : "border-navy-800/50 bg-navy-900/50 text-gray-500 hover:border-gold-300 hover:text-gray-200"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">Filters</span>
          {activeFilterCount > 0 && (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gold-500 text-xs font-bold text-navy-950">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Advanced Filters Panel */}
      {showAdvanced && (
        <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
            {/* Price Range */}
            <div className="flex flex-1 items-center gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-gray-500">Min Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500">
                    R
                  </span>
                  <input
                    type="number"
                    value={filters.minPrice ?? ""}
                    onChange={(e) =>
                      updateFilter("minPrice", e.target.value ? Number(e.target.value) : null)
                    }
                    placeholder="0"
                    className="w-full rounded-lg border border-navy-800/50 bg-navy-800/30 py-2 pl-7 pr-3 text-sm text-gray-900 placeholder-gray-600 outline-none focus:border-gold-500/50"
                  />
                </div>
              </div>
              <span className="mt-5 text-gray-500">—</span>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium text-gray-500">Max Price</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500">
                    R
                  </span>
                  <input
                    type="number"
                    value={filters.maxPrice ?? ""}
                    onChange={(e) =>
                      updateFilter("maxPrice", e.target.value ? Number(e.target.value) : null)
                    }
                    placeholder="No limit"
                    className="w-full rounded-lg border border-navy-800/50 bg-navy-800/30 py-2 pl-7 pr-3 text-sm text-gray-900 placeholder-gray-600 outline-none focus:border-gold-500/50"
                  />
                </div>
              </div>
            </div>

            {/* Location */}
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-500">Location</label>
              <input
                type="text"
                value={filters.location}
                onChange={(e) => updateFilter("location", e.target.value)}
                placeholder="e.g. Johannesburg, Cape Town"
                className="w-full rounded-lg border border-navy-800/50 bg-navy-800/30 px-3 py-2 text-sm text-gray-900 placeholder-gray-600 outline-none focus:border-gold-500/50"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleApply}
                className="flex items-center gap-2 rounded-lg bg-gold-500 px-4 py-2 text-sm font-semibold text-navy-950 transition-colors hover:bg-gold-400"
              >
                <Filter className="h-4 w-4" />
                Apply
              </button>
              <button
                onClick={handleClear}
                className="flex items-center gap-2 rounded-lg border border-navy-800/50 bg-navy-800/30 px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-navy-800/50 hover:text-gray-900"
              >
                <X className="h-4 w-4" />
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Filter Badges */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500">Active filters:</span>
          {filters.search && (
            <span className="flex items-center gap-1 rounded-full border border-gold-300 bg-gold-50 px-3 py-1 text-xs font-medium text-gold-600">
              Search: "{filters.search}"
              <button onClick={() => updateFilter("search", "")} className="ml-1 hover:text-gold-500">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {filters.type !== "ALL" && (
            <span className="flex items-center gap-1 rounded-full border border-gold-300 bg-gold-50 px-3 py-1 text-xs font-medium text-gold-600">
              Type: {PROPERTY_TYPES.find((t) => t.value === filters.type)?.label}
              <button onClick={() => updateFilter("type", "ALL")} className="ml-1 hover:text-gold-500">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {filters.status !== "ALL" && (
            <span className="flex items-center gap-1 rounded-full border border-gold-300 bg-gold-50 px-3 py-1 text-xs font-medium text-gold-600">
              Status: {STATUS_OPTIONS.find((s) => s.value === filters.status)?.label}
              <button onClick={() => updateFilter("status", "ALL")} className="ml-1 hover:text-gold-500">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {filters.minPrice !== null && (
            <span className="flex items-center gap-1 rounded-full border border-gold-300 bg-gold-50 px-3 py-1 text-xs font-medium text-gold-600">
              Min: R{filters.minPrice.toLocaleString()}
              <button onClick={() => updateFilter("minPrice", null)} className="ml-1 hover:text-gold-500">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {filters.maxPrice !== null && (
            <span className="flex items-center gap-1 rounded-full border border-gold-300 bg-gold-50 px-3 py-1 text-xs font-medium text-gold-600">
              Max: R{filters.maxPrice.toLocaleString()}
              <button onClick={() => updateFilter("maxPrice", null)} className="ml-1 hover:text-gold-500">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {filters.location && (
            <span className="flex items-center gap-1 rounded-full border border-gold-300 bg-gold-50 px-3 py-1 text-xs font-medium text-gold-600">
              Location: {filters.location}
              <button onClick={() => updateFilter("location", "")} className="ml-1 hover:text-gold-500">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
          {filters.sortBy !== "NEWEST" && (
            <span className="flex items-center gap-1 rounded-full border border-gold-300 bg-gold-50 px-3 py-1 text-xs font-medium text-gold-600">
              Sort: {SORT_OPTIONS.find((s) => s.value === filters.sortBy)?.label}
              <button onClick={() => updateFilter("sortBy", "NEWEST")} className="ml-1 hover:text-gold-500">
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
