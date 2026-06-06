import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  Search, RefreshCw, Star, ExternalLink, MapPin, Calendar, Clock,
  Building2, Home, Filter, Plus, Trash2, Eye, Gavel, Landmark,
  TrendingDown, AlertTriangle, CheckCircle2, XCircle, Loader2,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Banknote, Bed, Bath, Maximize,
  ShieldAlert, Globe, Lock, Zap, Heart, Download,
} from 'lucide-react';
import { Navbar } from '~/components/Navbar';
import { ConfirmModal } from '~/components/ConfirmModal';
import { useTRPC } from '~/trpc/react';
import { useAuthStore } from '~/stores/authStore';
import toast from 'react-hot-toast';

export const Route = createFileRoute('/distressed-finder/')({
  component: DistressedFinderPage,
});

const SOURCE_LABELS: Record<string, string> = {
  // Tier 1: Verified working scrapers
  property24: 'Property24',
  private_property: 'Private Property',
  iol_property: 'IOL Property',
  myroof: 'MyRoof (Standard Bank)',
  // Tier 2: Auction houses & property sites
  in2assets: 'In2assets',
  aucor_property: 'Aucor Property',
  highstreet_auctions: 'High Street Auctions',
  broll: 'Broll Property Group',
  bidx1: 'BidX1 Auctions',
  auction_inc: 'Auction Inc',
  realnet: 'RealNet Property',
  // Tier 3: Sheriff (login)
  sheriffhq: 'SheriffHQ',
  sa_sheriff: 'SA Sheriff',
  // Tier 4: Student Accommodation (for-sale investment properties)
  student_accommodation: 'Student Accommodation',
  // Tier 5: Bank repo links (not scraped)
  fnb_repos: 'FNB Repos',
  absa_repos: 'ABSA Repos',
  standard_bank: 'Standard Bank',
  nedbank_pip: 'Nedbank PIP',
  capitec_repos: 'Capitec Bank',
  sa_home_loans: 'SA Home Loans',
  // Manual
  manual: 'Manual Entry',
};

const AUCTION_TYPE_LABELS: Record<string, string> = {
  SHERIFF: 'Sheriff / Court',
  BANK_REPO: 'Bank Repossession',
  LIQUIDATION: 'Liquidation',
  ONLINE: 'Online Auction',
  ONLINE_AUCTION: 'Online Auction',
  AUCTION: 'Live Auction',
  LIVE_AUCTION: 'Live Auction',
  SALE: 'For Sale',

  SOLD: 'Sold',
};

const GAUTENG_CITIES = [
  'All Cities', 'Johannesburg', 'Pretoria', 'Tshwane', 'Centurion', 'Midrand',
  'Sandton', 'Randburg', 'Roodepoort', 'Soweto', 'Benoni',
  'Boksburg', 'Germiston', 'Springs', 'Alberton', 'Vereeniging',
  'Vanderbijlpark', 'Krugersdorp', 'Kempton Park', 'Edenvale',
];

function DistressedFinderPage() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const authToken = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  const role = (user as any)?.role ?? '';
  // Access: ops/admin only. Property owners don't need to see other people's distress data.
  const isManager = role === 'DEVELOPMENT_MANAGER' || role === 'PROJECT_MANAGER' || role === 'ADMIN';

  useEffect(() => {
    if (!hasHydrated) return;
    if (!user || !authToken) { navigate({ to: '/login' }); return; }
    // Only managers/admins can access the distressed finder
    if (!isManager) navigate({ to: '/dashboard' });
  }, [user, authToken, hasHydrated, isManager]);

  const [tab, setTab] = useState<'listings' | 'sources' | 'add'>('listings');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; title: string } | null>(null);
  const [filters, setFilters] = useState({
    city: 'all',
    source: 'all',
    auctionType: 'all',
    propertyType: 'all',
    maxPrice: 450000,
    onlyUpcoming: false,
    onlyFavourited: false,
    sortBy: 'recommended' as string,
  });

  // Add form state
  const [addForm, setAddForm] = useState({
    title: '', source: 'manual', sourceUrl: '', address: '', suburb: '', city: 'Johannesburg',
    marketValue: '', askingPrice: '', bedrooms: '', bathrooms: '', erfSize: '', floorSize: '',
    auctionDate: '', auctionTime: '', auctionVenue: '', auctionType: '', auctioneer: '', notes: '',
  });

  const listingsQuery = useQuery({
    ...trpc.getDistressedListings.queryOptions({
      authToken: authToken ?? '',
      maxPrice: filters.maxPrice,
      city: filters.city === 'all' ? undefined : filters.city,
      source: filters.source === 'all' ? undefined : filters.source,
      auctionType: filters.auctionType === 'all' ? undefined : filters.auctionType,
      onlyUpcoming: filters.onlyUpcoming || undefined,
      onlyFavourited: filters.onlyFavourited || undefined,
      sortBy: filters.sortBy as any,
      propertyType: filters.propertyType === 'all' ? undefined : filters.propertyType,
      page: currentPage,
      limit: 20,
    }),
    enabled: !!authToken,
    refetchInterval: 5 * 60 * 1000, // Auto-refresh every 5 minutes
    placeholderData: keepPreviousData,
  });

  // If a query returns UNAUTHORIZED and refresh fails, force logout & redirect
  useEffect(() => {
    if (listingsQuery.error) {
      const msg = (listingsQuery.error as any)?.message ?? '';
      if (msg.includes('UNAUTHORIZED') || msg.includes('expired') || msg.includes('Invalid')) {
        useAuthStore.getState().logout();
        navigate({ to: '/login' });
      }
    }
  }, [listingsQuery.error]);

  const sourcesQuery = useQuery({
    ...trpc.getDistressedSources.queryOptions({ authToken: authToken ?? '' }),
    enabled: !!authToken && tab === 'sources',
  });

  const scrapeMutation = useMutation(
    trpc.triggerDistressedScrape.mutationOptions({
      onSuccess: (data: any) => {
        toast.success(`Scan complete: ${data.totalFound} found, ${data.totalNew} new listings`);
        qc.invalidateQueries({ queryKey: trpc.getDistressedListings.queryKey() });
        qc.invalidateQueries({ queryKey: trpc.getDistressedSources.queryKey() });
      },
      onError: (e: any) => toast.error(e.message ?? 'Scan failed'),
    })
  );

  const favMutation = useMutation(
    trpc.toggleDistressedFavourite.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: trpc.getDistressedListings.queryKey() });
      },
    })
  );

  const addMutation = useMutation(
    trpc.addDistressedListing.mutationOptions({
      onSuccess: () => {
        toast.success('Listing added');
        qc.invalidateQueries({ queryKey: trpc.getDistressedListings.queryKey() });
        setTab('listings');
        setAddForm({ title: '', source: 'manual', sourceUrl: '', address: '', suburb: '', city: 'Johannesburg', marketValue: '', askingPrice: '', bedrooms: '', bathrooms: '', erfSize: '', floorSize: '', auctionDate: '', auctionTime: '', auctionVenue: '', auctionType: '', auctioneer: '', notes: '' });
      },
      onError: (e: any) => toast.error(e.message),
    })
  );

  const deleteMutation = useMutation(
    trpc.deleteDistressedListing.mutationOptions({
      onSuccess: () => {
        toast.success('Listing removed');
        qc.invalidateQueries({ queryKey: trpc.getDistressedListings.queryKey() });
      },
    })
  );

  if (!user || !authToken) {
    return (
      <div className="min-h-screen bg-white">
        <Navbar />
        <div className="flex items-center justify-center py-32">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gold-500 border-r-transparent" />
        </div>
      </div>
    );
  }

  const data = listingsQuery.data as any;
  const listings = (data?.listings ?? []) as any[];
  const stats = data?.stats ?? {};
  const totalCount = data?.totalCount ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const hasMore = data?.hasMore ?? false;
  const sources = (sourcesQuery.data ?? []) as any[];

  const fmt = (n: number) => `R${(n ?? 0).toLocaleString('en-ZA', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="min-h-screen bg-navy-950">
      <Navbar />
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-gold-500/15 to-gold-600/10 p-3 ring-1 ring-gold-500/20">
              <Zap className="text-gold-600" size={28} />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Distressed Property Finder</h1>
              <p className="text-navy-400">Scans 14+ SA property &amp; auction sites &middot; Filter by area, type and price cap &middot; Current cap: <span className="font-semibold text-gold-600">R{filters.maxPrice.toLocaleString('en-ZA')}</span></p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => scrapeMutation.mutate({ authToken: authToken ?? '' })}
              disabled={scrapeMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-gold-500 to-gold-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-gold-500/15 transition hover:shadow-gold-500/30 disabled:opacity-50"
            >
              {scrapeMutation.isPending ? (
                <><Loader2 size={16} className="animate-spin" /> Scanning 14 sites...</>
              ) : (
                <><RefreshCw size={16} /> Scan All Sites Now</>
              )}
            </button>
            <button
              onClick={() => {
                if (!listings.length) { toast.error('Nothing to export'); return; }
                const header = ['Title','Source','City','Suburb','Property Type','Asking Price','Market Value','Discount %','Auction Date','Source URL'];
                const lines = [header.join(',')];
                listings.forEach((l: any) => {
                  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
                  lines.push([
                    esc(l.title), esc(l.source), esc(l.city), esc(l.suburb), esc(l.propertyType),
                    l.askingPrice ?? 0, l.marketValue ?? '', l.discount ? l.discount.toFixed(1) : '',
                    l.auctionDate ? new Date(l.auctionDate).toISOString().slice(0,10) : '',
                    esc(l.sourceUrl ?? ''),
                  ].join(','));
                });
                const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `distressed-listings-${new Date().toISOString().slice(0,10)}.csv`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-navy-700/50 bg-navy-800/40 px-4 py-2.5 text-sm text-navy-300 hover:bg-navy-800 hover:text-gray-900 transition"
            >
              <Download size={16} /> Export CSV
            </button>
            <button
              onClick={() => setTab('add')}
              className="inline-flex items-center gap-2 rounded-lg border border-navy-700/50 bg-navy-800/40 px-4 py-2.5 text-sm text-navy-300 hover:bg-navy-800 hover:text-gray-900 transition"
            >
              <Plus size={16} /> Add Manually
            </button>
          </div>
        </div>

        {/* Stats Bar */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-xl border border-navy-800/40 bg-navy-900/60 p-4">
            <div className="flex items-center gap-2 text-gold-600"><Search size={16} /><span className="text-xs uppercase tracking-wide">Active Listings</span></div>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stats.totalActive ?? 0}</p>
          </div>
          <div className="rounded-xl border border-navy-800/40 bg-navy-900/60 p-4">
            <div className="flex items-center gap-2 text-gold-600"><Star size={16} /><span className="text-xs uppercase tracking-wide">Watchlist</span></div>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stats.totalWatched ?? 0}</p>
          </div>
          <div className="rounded-xl border border-navy-800/40 bg-navy-900/60 p-4">
            <div className="flex items-center gap-2 text-gold-600"><Gavel size={16} /><span className="text-xs uppercase tracking-wide">Upcoming Auctions</span></div>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stats.upcomingAuctions ?? 0}</p>
          </div>
          <div className="rounded-xl border border-navy-800/40 bg-navy-900/60 p-4">
            <div className="flex items-center gap-2 text-emerald-600"><TrendingDown size={16} /><span className="text-xs uppercase tracking-wide">Cheapest</span></div>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stats.cheapest ? fmt(stats.cheapest) : 'N/A'}</p>
          </div>
          <div className="rounded-xl border border-navy-800/40 bg-navy-900/60 p-4">
            <div className="flex items-center gap-2 text-navy-400"><Banknote size={16} /><span className="text-xs uppercase tracking-wide">Avg Price</span></div>
            <p className="mt-1 text-2xl font-bold text-gray-900">{stats.avgPrice ? fmt(stats.avgPrice) : 'N/A'}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-xl bg-navy-900/50 p-1">
          {[
            { key: 'listings', label: 'Property Listings', icon: Home },
            { key: 'sources', label: 'Data Sources', icon: Globe },
            { key: 'add', label: 'Add Manual', icon: Plus },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key as any)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                tab === t.key ? 'bg-gold-500 text-white shadow' : 'text-gray-500 hover:text-gold-600'
              }`}
            >
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </div>

        {/* ═══ LISTINGS TAB ═══ */}
        {tab === 'listings' && (
          <>
            {/* Filter bar */}
            <div className="mb-4">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="inline-flex items-center gap-2 rounded-lg border border-navy-700 bg-navy-800/50 px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                <Filter size={16} /> Filters {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>

            {showFilters && (
              <div className="mb-6 grid grid-cols-2 gap-3 rounded-xl border border-navy-800/50 bg-navy-900/50 p-4 sm:grid-cols-3 lg:grid-cols-7">
                <div>
                  <label className="mb-1 block text-xs text-gray-500">City</label>
                  <select value={filters.city} onChange={(e) => { setFilters({ ...filters, city: e.target.value }); setCurrentPage(1); }} className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2 text-sm text-gray-900">
                    <option value="all">All Cities</option>
                    {GAUTENG_CITIES.slice(1).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Source</label>
                  <select value={filters.source} onChange={(e) => { setFilters({ ...filters, source: e.target.value }); setCurrentPage(1); }} className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2 text-sm text-gray-900">
                    <option value="all">All Sources</option>
                    {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Auction Type</label>
                  <select value={filters.auctionType} onChange={(e) => { setFilters({ ...filters, auctionType: e.target.value }); setCurrentPage(1); }} className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2 text-sm text-gray-900">
                    <option value="all">All Types</option>
                    {Object.entries(AUCTION_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Property Type</label>
                  <select value={filters.propertyType} onChange={(e) => { setFilters({ ...filters, propertyType: e.target.value }); setCurrentPage(1); }} className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2 text-sm text-gray-900">
                    <option value="all">All Types</option>
                    <option value="HOUSE">Houses (All)</option>
                    <option value="HOUSE_STANDALONE">Standalone Houses</option>
                    <option value="HOUSE_APARTMENT">Apartments / Flats / Townhouses</option>
                    <option value="STUDENT">Student Accommodation</option>
                    <option value="OFFICE">Office / Commercial</option>
                    <option value="INDUSTRIAL">Industrial</option>
                    <option value="VACANT LAND">Vacant Land</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Max Price</label>
                  <input type="number" value={filters.maxPrice} onChange={(e) => { setFilters({ ...filters, maxPrice: Number(e.target.value) || 450000 }); setCurrentPage(1); }} className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2 text-sm text-gray-900" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Sort By</label>
                  <select value={filters.sortBy} onChange={(e) => { setFilters({ ...filters, sortBy: e.target.value }); setCurrentPage(1); }} className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2 text-sm text-gray-900">
                    <option value="recommended">⭐ Recommended</option>
                    <option value="newest">Newest First</option>
                    <option value="price_asc">Price: Low to High</option>
                    <option value="price_desc">Price: High to Low</option>
                    <option value="date_asc">Auction Date: Soonest</option>
                    <option value="discount">Biggest Discount</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2 pt-5">
                  <label className="inline-flex items-center gap-2 text-xs text-gray-500">
                    <input type="checkbox" checked={filters.onlyUpcoming} onChange={(e) => { setFilters({ ...filters, onlyUpcoming: e.target.checked }); setCurrentPage(1); }} className="rounded border-navy-600 bg-navy-800" />
                    Upcoming auctions only
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs text-gray-500">
                    <input type="checkbox" checked={filters.onlyFavourited} onChange={(e) => { setFilters({ ...filters, onlyFavourited: e.target.checked }); setCurrentPage(1); }} className="rounded border-navy-600 bg-navy-800" />
                    Watchlist only
                  </label>
                </div>
              </div>
            )}

            {/* Results */}
            {listingsQuery.isLoading ? (
              <div className="flex justify-center py-16"><div className="h-10 w-10 animate-spin rounded-full border-4 border-gold-500 border-r-transparent" /></div>
            ) : listings.length === 0 ? (
              <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-16 text-center">
                <Search className="mx-auto mb-4 text-gray-600" size={48} />
                <h3 className="text-xl font-semibold text-gray-900">No Distressed Properties Found</h3>
                <p className="mt-2 text-gray-500">Click "Scan All Sites Now" to search SA property websites for distressed listings, or add listings manually.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Results count bar */}
                <div className="flex items-center justify-between rounded-lg border border-navy-800/50 bg-navy-900/30 px-4 py-2.5">
                  <p className="text-sm text-gray-500">
                    Showing <span className="font-semibold text-gray-900">{listings.length}</span> of <span className="font-semibold text-gray-900">{totalCount}</span> properties
                    {totalPages > 1 && <> &middot; Page <span className="font-semibold text-gray-900">{currentPage}</span> of <span className="font-semibold text-gray-900">{totalPages}</span></>}
                  </p>
                  {listingsQuery.isFetching && !listingsQuery.isLoading && (
                    <Loader2 size={14} className="animate-spin text-gold-600" />
                  )}
                </div>
                {listings.map((listing: any) => {
                  const daysUntilAuction = listing.auctionDate
                    ? Math.ceil((new Date(listing.auctionDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                    : null;
                  const isUpcoming = daysUntilAuction !== null && daysUntilAuction >= 0;
                  const isUrgent = daysUntilAuction !== null && daysUntilAuction <= 7 && daysUntilAuction >= 0;

                  return (
                    <div
                      key={listing.id}
                      className={`group relative overflow-hidden rounded-xl border transition-all hover:border-gold-300 ${
                        isUrgent
                          ? 'border-red-200 bg-red-950/10'
                          : listing.isFavourited
                            ? 'border-gold-300 bg-gold-950/10'
                            : 'border-navy-800/50 bg-navy-900/50'
                      }`}
                    >
                      <div className="flex flex-col lg:flex-row">
                        {/* Image / Placeholder */}
                        <div className="relative w-full flex-shrink-0 lg:w-48">
                          {listing.imageUrl ? (
                            <img src={listing.imageUrl} alt={listing.title} className="h-48 w-full object-cover lg:h-full" />
                          ) : (
                            <div className="flex h-48 w-full items-center justify-center bg-navy-800/50 lg:h-full">
                              <Home className="text-gray-700" size={40} />
                            </div>
                          )}
                          {/* Source badge */}
                          <div className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-xs font-medium text-gray-900 backdrop-blur">
                            {SOURCE_LABELS[listing.source] ?? listing.source}
                          </div>
                          {isUrgent && (
                            <div className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                              <AlertTriangle size={12} /> {daysUntilAuction === 0 ? 'TODAY' : `${daysUntilAuction}d left`}
                            </div>
                          )}
                          {listing.noReserve && (
                            <div className="absolute left-2 bottom-2 rounded-md bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white uppercase tracking-wide">
                              No Reserve
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex flex-1 flex-col p-4">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <h3 className="text-lg font-semibold text-gray-900 truncate">{listing.title}</h3>
                              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
                                <span className="inline-flex items-center gap-1"><MapPin size={13} /> {listing.suburb ? `${listing.suburb}, ` : ''}{listing.city}</span>
                                {listing.address && <span className="text-gray-600">&middot; {listing.address}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => favMutation.mutate({ authToken: authToken ?? '', listingId: listing.id })}
                                className={`rounded-lg p-2 transition ${listing.isFavourited ? 'text-gold-600 hover:text-gold-500' : 'text-gray-600 hover:text-gold-600'}`}
                                title={listing.isFavourited ? 'Remove from watchlist' : 'Add to watchlist'}
                              >
                                <Heart size={18} fill={listing.isFavourited ? 'currentColor' : 'none'} />
                              </button>
                              {listing.sourceUrl && (
                                <a href={listing.sourceUrl} target="_blank" rel="noopener noreferrer" className="rounded-lg p-2 text-gray-600 hover:text-blue-600" title="View original listing">
                                  <ExternalLink size={18} />
                                </a>
                              )}
                              <button
                                onClick={() => setDeleteTarget({ id: listing.id, title: listing.title })}
                                className="rounded-lg p-2 text-gray-700 hover:text-red-600"
                                title="Delete"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>

                          {/* Price & Details Row */}
                          <div className="mt-3 flex flex-wrap items-end gap-4">
                            <div>
                              <p className="text-xs text-gray-500 uppercase">Asking Price</p>
                              <p className="text-2xl font-bold text-emerald-600">{fmt(listing.askingPrice)}</p>
                            </div>
                            {listing.marketValue && (
                              <div>
                                <p className="text-xs text-gray-500 uppercase">Market Value</p>
                                <p className="text-lg font-semibold text-gray-500 line-through">{fmt(listing.marketValue)}</p>
                              </div>
                            )}
                            {listing.discount && (
                              <div className="rounded-lg bg-emerald-50 px-3 py-1">
                                <p className="text-sm font-bold text-emerald-600">{listing.discount.toFixed(0)}% below market</p>
                              </div>
                            )}

                            {/* Property details */}
                            <div className="flex items-center gap-3 text-sm text-gray-500">
                              {listing.bedrooms && <span className="inline-flex items-center gap-1"><Bed size={14} /> {listing.bedrooms} bed</span>}
                              {listing.bathrooms && <span className="inline-flex items-center gap-1"><Bath size={14} /> {listing.bathrooms} bath</span>}
                              {listing.floorSize && <span className="inline-flex items-center gap-1"><Maximize size={14} /> {listing.floorSize}m&sup2;</span>}
                            </div>
                          </div>

                          {/* Auction Info */}
                          {(listing.auctionDate || listing.auctionVenue || listing.auctionType) && (
                            <div className="mt-3 flex flex-wrap gap-3 rounded-lg border border-navy-800/50 bg-navy-950/50 p-3">
                              {listing.auctionType && (
                                <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">
                                  <Gavel size={14} className="text-gold-600" />
                                  {AUCTION_TYPE_LABELS[listing.auctionType] ?? listing.auctionType}
                                </span>
                              )}
                              {listing.auctionDate && (
                                <span className={`inline-flex items-center gap-1.5 text-sm ${isUrgent ? 'font-semibold text-red-600' : 'text-gray-600'}`}>
                                  <Calendar size={14} className={isUrgent ? 'text-red-600' : 'text-gold-600'} />
                                  {new Date(listing.auctionDate).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                                </span>
                              )}
                              {listing.auctionTime && (
                                <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">
                                  <Clock size={14} className="text-gold-600" /> {listing.auctionTime}
                                </span>
                              )}
                              {listing.auctionVenue && (
                                <span className="inline-flex items-center gap-1.5 text-sm text-gray-600">
                                  <MapPin size={14} className="text-gold-600" /> {listing.auctionVenue}
                                </span>
                              )}
                              {listing.auctioneer && (
                                <span className="inline-flex items-center gap-1.5 text-sm text-gray-500">
                                  <Landmark size={14} /> {listing.auctioneer}
                                </span>
                              )}
                              {listing.caseNumber && (
                                <span className="inline-flex items-center gap-1.5 text-sm text-gray-500">
                                  Case: {listing.caseNumber}
                                </span>
                              )}
                              {listing.courtDivision && (
                                <span className="inline-flex items-center gap-1.5 text-sm text-gray-500">
                                  {listing.courtDivision}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Notes */}
                          {listing.notes && (
                            <p className="mt-2 text-sm text-gray-500 italic">{listing.notes}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between rounded-xl border border-navy-800/50 bg-navy-900/50 p-4">
                    <button
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage <= 1}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-navy-700 bg-navy-800/50 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-navy-800 hover:text-gray-900 disabled:opacity-30 disabled:hover:bg-navy-800/50 disabled:hover:text-gray-600"
                    >
                      <ChevronLeft size={14} /> Previous
                    </button>

                    <div className="flex items-center gap-1">
                      {/* Generate page numbers with ellipsis */}
                      {(() => {
                        const pages: (number | string)[] = [];
                        if (totalPages <= 7) {
                          for (let i = 1; i <= totalPages; i++) pages.push(i);
                        } else {
                          pages.push(1);
                          if (currentPage > 3) pages.push('...');
                          for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
                            pages.push(i);
                          }
                          if (currentPage < totalPages - 2) pages.push('...');
                          pages.push(totalPages);
                        }
                        return pages.map((p, idx) =>
                          typeof p === 'string' ? (
                            <span key={`ellipsis-${idx}`} className="px-2 text-gray-600">...</span>
                          ) : (
                            <button
                              key={p}
                              onClick={() => setCurrentPage(p)}
                              className={`min-w-[36px] rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                                p === currentPage
                                  ? 'bg-gold-500 text-white shadow'
                                  : 'text-gray-500 hover:bg-navy-800 hover:text-gray-900'
                              }`}
                            >
                              {p}
                            </button>
                          )
                        );
                      })()}
                    </div>

                    <button
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage >= totalPages}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-navy-700 bg-navy-800/50 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-navy-800 hover:text-gray-900 disabled:opacity-30 disabled:hover:bg-navy-800/50 disabled:hover:text-gray-600"
                    >
                      Next <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ═══ SOURCES TAB ═══ */}
        {tab === 'sources' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
              <h2 className="mb-2 text-lg font-semibold text-gray-900">Data Sources</h2>
              <p className="mb-4 text-sm text-gray-500">
                The scraper checks these South African property &amp; accommodation websites automatically.
                Sites marked with <Lock size={12} className="inline text-gold-600" /> require login credentials to access full listings.
              </p>

              <div className="space-y-3">
                {sources.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg border border-navy-800/50 bg-navy-800/20 p-4">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-lg p-2 ${s.loginRequired ? 'bg-gold-50' : 'bg-emerald-50'}`}>
                        {s.loginRequired ? <Lock className="text-gold-600" size={18} /> : <Globe className="text-emerald-600" size={18} />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-900">{s.name}</h3>
                          <span className="rounded bg-navy-700 px-1.5 py-0.5 text-xs text-gray-500">{s.type}</span>
                        </div>
                        <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">{s.url}</a>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="flex items-center gap-2">
                        {s.lastStatus === 'SUCCESS' && <CheckCircle2 className="text-emerald-600" size={16} />}
                        {s.lastStatus === 'PARTIAL' && <AlertTriangle className="text-gold-600" size={16} />}
                        {s.lastStatus === 'FAILED' && <XCircle className="text-red-600" size={16} />}
                        {!s.lastStatus && <span className="text-xs text-gray-600">Not scanned yet</span>}
                        <span className="text-sm font-medium text-gray-900">{s.activeListings} listings</span>
                      </div>
                      {s.lastScraped && (
                        <p className="text-xs text-gray-500">Last scan: {new Date(s.lastScraped).toLocaleString('en-ZA')}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Login credentials info */}
            <div className="rounded-xl border border-gold-200 bg-gold-950/10 p-6">
              <div className="flex items-start gap-3">
                <Lock className="mt-0.5 flex-shrink-0 text-gold-600" size={20} />
                <div>
                  <h3 className="font-semibold text-gold-500">Login-Required Sites</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    FNB, Nedbank, and ABSA repossession portals require bank account login credentials to access full property listings.
                    To enable these sources:
                  </p>
                  <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-gray-600">
                    <li>Register on each bank&#39;s repossessed property portal</li>
                    <li>Add your credentials to the <code className="rounded bg-navy-800 px-1 py-0.5 text-xs text-gold-600">.env</code> file</li>
                    <li>Variables: <code className="rounded bg-navy-800 px-1 py-0.5 text-xs text-gold-600">FNB_REPO_EMAIL</code>, <code className="rounded bg-navy-800 px-1 py-0.5 text-xs text-gold-600">NEDBANK_PIP_EMAIL</code>, <code className="rounded bg-navy-800 px-1 py-0.5 text-xs text-gold-600">ABSA_REPO_EMAIL</code> (and matching _PASSWORD)</li>
                    <li>Re-run the scan after adding credentials</li>
                  </ol>
                  <p className="mt-3 text-sm text-gray-500">
                    Even without login, the scraper will find public auction listings from Property24, BidX1, High Street Auctions, Sheriff Sales, and Standard Bank.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ ADD MANUAL TAB ═══ */}
        {tab === 'add' && (
          <div className="rounded-xl border border-navy-800/50 bg-navy-900/50 p-6">
            <h2 className="mb-2 text-lg font-semibold text-gray-900">Add Property Manually</h2>
            <p className="mb-6 text-sm text-gray-500">
              Found a distressed property on a site the scraper couldn&#39;t reach? Add it here with all the details.
            </p>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <label className="mb-1 block text-sm text-gray-500">Property Title *</label>
                <input value={addForm.title} onChange={(e) => setAddForm({ ...addForm, title: e.target.value })} placeholder="e.g. 3 Bed House in Soweto — Bank Repo" className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2.5 text-gray-900 placeholder-gray-600" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-500">Source</label>
                <select value={addForm.source} onChange={(e) => setAddForm({ ...addForm, source: e.target.value })} className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2.5 text-gray-900">
                  <option value="manual">Manual Find</option>
                  {Object.entries(SOURCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="lg:col-span-2">
                <label className="mb-1 block text-sm text-gray-500">Source URL</label>
                <input value={addForm.sourceUrl} onChange={(e) => setAddForm({ ...addForm, sourceUrl: e.target.value })} placeholder="https://..." className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2.5 text-gray-900 placeholder-gray-600" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-500">City in Gauteng</label>
                <select value={addForm.city} onChange={(e) => setAddForm({ ...addForm, city: e.target.value })} className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2.5 text-gray-900">
                  {GAUTENG_CITIES.slice(1).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-500">Suburb</label>
                <input value={addForm.suburb} onChange={(e) => setAddForm({ ...addForm, suburb: e.target.value })} placeholder="e.g. Diepkloof" className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2.5 text-gray-900 placeholder-gray-600" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-500">Street Address</label>
                <input value={addForm.address} onChange={(e) => setAddForm({ ...addForm, address: e.target.value })} placeholder="12 Main Rd" className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2.5 text-gray-900 placeholder-gray-600" />
              </div>

              {/* Price */}
              <div>
                <label className="mb-1 block text-sm text-gray-500">Asking / Reserve Price (R) *</label>
                <input type="number" value={addForm.askingPrice} onChange={(e) => setAddForm({ ...addForm, askingPrice: e.target.value })} placeholder="350000" className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2.5 text-gray-900 placeholder-gray-600" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-500">Estimated Market Value (R)</label>
                <input type="number" value={addForm.marketValue} onChange={(e) => setAddForm({ ...addForm, marketValue: e.target.value })} placeholder="1200000" className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2.5 text-gray-900 placeholder-gray-600" />
              </div>

              {/* Property details */}
              <div>
                <label className="mb-1 block text-sm text-gray-500">Bedrooms</label>
                <input type="number" value={addForm.bedrooms} onChange={(e) => setAddForm({ ...addForm, bedrooms: e.target.value })} placeholder="3" className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2.5 text-gray-900 placeholder-gray-600" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-500">Bathrooms</label>
                <input type="number" value={addForm.bathrooms} onChange={(e) => setAddForm({ ...addForm, bathrooms: e.target.value })} placeholder="2" className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2.5 text-gray-900 placeholder-gray-600" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-500">Erf Size (m&sup2;)</label>
                <input type="number" value={addForm.erfSize} onChange={(e) => setAddForm({ ...addForm, erfSize: e.target.value })} placeholder="600" className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2.5 text-gray-900 placeholder-gray-600" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-500">Floor Size (m&sup2;)</label>
                <input type="number" value={addForm.floorSize} onChange={(e) => setAddForm({ ...addForm, floorSize: e.target.value })} placeholder="120" className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2.5 text-gray-900 placeholder-gray-600" />
              </div>

              {/* Auction details */}
              <div className="lg:col-span-3">
                <div className="mb-3 border-t border-navy-800/50 pt-3">
                  <h3 className="text-sm font-medium text-gold-600">Auction Details (if applicable)</h3>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-500">Auction Date</label>
                <input type="date" value={addForm.auctionDate} onChange={(e) => setAddForm({ ...addForm, auctionDate: e.target.value })} className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2.5 text-gray-900" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-500">Auction Time</label>
                <input type="time" value={addForm.auctionTime} onChange={(e) => setAddForm({ ...addForm, auctionTime: e.target.value })} className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2.5 text-gray-900" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-500">Auction Type</label>
                <select value={addForm.auctionType} onChange={(e) => setAddForm({ ...addForm, auctionType: e.target.value })} className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2.5 text-gray-900">
                  <option value="">Select...</option>
                  {Object.entries(AUCTION_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div className="lg:col-span-2">
                <label className="mb-1 block text-sm text-gray-500">Auction Venue</label>
                <input value={addForm.auctionVenue} onChange={(e) => setAddForm({ ...addForm, auctionVenue: e.target.value })} placeholder="e.g. Johannesburg Magistrate's Court" className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2.5 text-gray-900 placeholder-gray-600" />
              </div>
              <div>
                <label className="mb-1 block text-sm text-gray-500">Auctioneer</label>
                <input value={addForm.auctioneer} onChange={(e) => setAddForm({ ...addForm, auctioneer: e.target.value })} placeholder="e.g. Sheriff of the Court" className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2.5 text-gray-900 placeholder-gray-600" />
              </div>

              <div className="lg:col-span-3">
                <label className="mb-1 block text-sm text-gray-500">Notes</label>
                <textarea value={addForm.notes} onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })} rows={3} placeholder="Any additional notes, condition info, contact details..." className="w-full rounded-lg border border-navy-700 bg-navy-800/50 p-2.5 text-gray-900 placeholder-gray-600" />
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  if (!addForm.title || !addForm.askingPrice) { toast.error('Title and asking price are required'); return; }
                  addMutation.mutate({
                    authToken: authToken ?? '',
                    title: addForm.title,
                    source: addForm.source,
                    sourceUrl: addForm.sourceUrl || undefined,
                    address: addForm.address || undefined,
                    suburb: addForm.suburb || undefined,
                    city: addForm.city,
                    marketValue: addForm.marketValue ? Number(addForm.marketValue) : undefined,
                    askingPrice: Number(addForm.askingPrice),
                    bedrooms: addForm.bedrooms ? Number(addForm.bedrooms) : undefined,
                    bathrooms: addForm.bathrooms ? Number(addForm.bathrooms) : undefined,
                    erfSize: addForm.erfSize ? Number(addForm.erfSize) : undefined,
                    floorSize: addForm.floorSize ? Number(addForm.floorSize) : undefined,
                    auctionDate: addForm.auctionDate || undefined,
                    auctionTime: addForm.auctionTime || undefined,
                    auctionVenue: addForm.auctionVenue || undefined,
                    auctionType: addForm.auctionType || undefined,
                    auctioneer: addForm.auctioneer || undefined,
                    notes: addForm.notes || undefined,
                  });
                }}
                disabled={addMutation.isPending}
                className="rounded-lg bg-gold-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-gold-600 disabled:opacity-50"
              >
                {addMutation.isPending ? 'Adding...' : 'Add Listing'}
              </button>
              <button onClick={() => setTab('listings')} className="rounded-lg border border-navy-700 px-4 py-2.5 text-sm text-gray-600 hover:bg-navy-800/30">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate({ authToken: authToken ?? '', listingId: deleteTarget.id });
            setDeleteTarget(null);
          }
        }}
        title="Delete distressed listing?"
        message={
          <span>
            This will remove <strong>{deleteTarget?.title}</strong> from the active listings.
            It will re-appear on the next scrape if still listed on the source site.
          </span>
        }
        confirmLabel="Delete"
        tone="danger"
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
