/**
 * Distressed Property Finder — Market Analysis engine.
 *
 * Deterministic (no LLM) comparable-sales / area-benchmark analysis that tells a
 * subscriber whether a distressed listing is a worthwhile investment. It answers
 * the questions "what is it really worth?", "how does it price against the area?",
 * "which way is the area trending?" and "what's my margin of safety?" using data
 * we already hold: the DistressedListing table (peer asking prices across SA) and
 * each listing's recorded price history.
 *
 * IMPORTANT: comparables are drawn from distressed/auction *asking* prices, not a
 * deeds-office sold-price register, so the output is a benchmark/guide — not a
 * formal valuation. The UI must surface that caveat.
 */

import { db } from "~/server/db";
import {
  calculateTransferDuty,
  estimateFlipIncomeTax,
  calculateAnnualisedReturn,
  calculateRentalMetrics,
  type RentalPropertyInput,
} from "~/financial-calculations";

export type TrendDirection = "RISING" | "FALLING" | "FLAT" | "UNKNOWN";
export type SignalStatus = "POSITIVE" | "NEUTRAL" | "CAUTION";
export type AreaLevel = "suburb" | "city" | "province";
export type RiskSeverity = "INFO" | "ATTENTION" | "WARNING";

export interface MarketComparable {
  id: number;
  title: string;
  suburb: string | null;
  city: string;
  propertyType: string;
  askingPrice: number;
  floorSize: number | null;
  erfSize: number | null;
  pricePerSqm: number | null;
  bedrooms: number | null;
  status: string;
  createdAt: string;
}

export interface MarketSignal {
  label: string;
  status: SignalStatus;
  detail: string;
}

/** Listing recency + price-cut velocity (motivated-seller / staleness signal). */
export interface MarketActivity {
  daysOnMarket: number | null;
  firstSeenPrice: number | null;
  latestPrice: number;
  priceDropCount: number;
  totalDropPct: number | null;
  dropVelocityPctPerMonth: number | null;
  staleness: "FRESH" | "NORMAL" | "STALE" | "UNKNOWN";
}

export interface FlipProjection {
  arv: number;
  purchasePrice: number;
  transferDuty: number;
  renovationAllowance: number;
  holdingCosts: number;
  sellingCosts: number;
  totalInvested: number;
  grossProfit: number;
  taxEstimate: number;
  netProfit: number;
  roiPct: number;
  annualisedPct: number;
}

export interface RentalProjection {
  estimatedMonthlyRent: number;
  grossYieldPct: number;
  netYieldPct: number;
  capRatePct: number;
  monthlyNetCashflow: number;
}

export interface MarketProjections {
  /** After-repair / benchmark value the projections are built on. */
  arv: number | null;
  assumptions: string;
  flip: FlipProjection | null;
  rental: RentalProjection | null;
}

export interface MaxBidAnalysis {
  targetRoiPct: number;
  /** Price at which a flip nets zero after all costs & tax. */
  breakEvenPrice: number | null;
  /** Highest price you can pay and still hit the target ROI. */
  maxBidForTarget: number | null;
  /** Asking price vs the max bid, % (negative = asking is below your ceiling = good). */
  askingVsMaxBidPct: number | null;
}

export interface AuctionRiskItem {
  label: string;
  severity: RiskSeverity;
  detail: string;
}

export interface VerdictFactor {
  label: string;
  /** Signed points this factor contributed to the 0–100 score. */
  impact: number;
  note: string;
}

export interface DistressedMarketAnalysis {
  listingId: number;
  generatedAt: string;
  /** Not enough peer data to analyse. */
  insufficientData: boolean;
  area: {
    level: AreaLevel;
    name: string;
    sampleSize: number;
    medianAskingPrice: number | null;
    medianPricePerSqm: number | null;
    priceRange: { min: number; max: number } | null;
  };
  subject: {
    askingPrice: number;
    marketValue: number | null;
    discount: number | null;
    floorSize: number | null;
    erfSize: number | null;
    pricePerSqm: number | null;
  };
  positioning: {
    /** Subject asking price vs area median, % (negative = cheaper than area). */
    vsAreaMedianPct: number | null;
    /** Subject R/m² vs area median R/m², % (negative = cheaper per m²). */
    vsAreaPricePerSqmPct: number | null;
    /** Where the subject sits among comparables by price, 0 (cheapest) – 100. */
    pricePercentile: number | null;
  };
  valuation: {
    /** Independent benchmark value = area median R/m² × subject floor size. */
    estimatedValue: number | null;
    estimatedValueLow: number | null;
    estimatedValueHigh: number | null;
    /** (estimatedValue − asking) / estimatedValue, % — the margin of safety. */
    impliedMarginPct: number | null;
    method: string;
  };
  trend: {
    direction: TrendDirection;
    /** Recent vs older area median asking price, %. */
    areaPriceChangePct: number | null;
    /** The subject's own recorded price drops. */
    subjectPriceDrops: Array<{ from: number; to: number; pct: number; at: string }>;
  };
  comparables: MarketComparable[];
  /** Listing recency + price-cut velocity. */
  activity: MarketActivity;
  /** Deterministic flip & buy-to-let return projections off the benchmark ARV. */
  projections: MarketProjections;
  /** Max price to still hit a target return, plus the break-even price. */
  maxBid: MaxBidAnalysis | null;
  /** Educational auction / distressed-sale risk checklist from listing metadata. */
  auctionRisk: AuctionRiskItem[];
  signals: MarketSignal[];
  verdict: {
    /** 0–100 attractiveness; higher = stronger buy case. */
    score: number;
    label: "Strong" | "Solid" | "Fair" | "Weak" | "Avoid";
    rationale: string;
    /** Per-factor breakdown of how the score was reached. */
    factors: VerdictFactor[];
  };
}

// ─── small numeric helpers ─────────────────────────────────────
function median(nums: number[]): number | null {
  const xs = nums.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

function pricePerSqm(price: number | null, floor: number | null, erf: number | null): number | null {
  const area = floor && floor > 0 ? floor : erf && erf > 0 ? erf : null;
  if (!price || price <= 0 || !area) return null;
  return price / area;
}

function pctDelta(value: number, base: number): number | null {
  if (!base || base <= 0) return null;
  return ((value - base) / base) * 100;
}

// ─── projection / max-bid assumptions (illustrative, surfaced in UI) ──
const RENO_ALLOWANCE_PCT = 0.08; // distressed stock typically needs ~8% refurb
const FLIP_HOLDING_MONTHS = 6;
const FLIP_HOLDING_COST_PCT_PA = 0.1; // rates, interest, insurance while held
const FLIP_SELLING_COST_PCT = 0.06; // agent + conveyancing on resale
const FLIP_TARGET_ROI = 0.2; // target net ROI used for the max-bid ceiling
const ASSUMED_GROSS_YIELD = 0.09; // buy-to-let gross yield assumption
const PROJECTION_ASSUMPTIONS =
  "Benchmark ARV = area median R/m² × size. Flip assumes ~8% refurb, 6-month hold, ~10%/yr holding cost, 6% selling cost and 27% income tax on profit. Rental assumes a ~9% gross yield with standard operating costs, unleveraged. Illustrative only — not a formal valuation or guaranteed return.";

/** Flip economics for a given purchase price against a benchmark resale value (ARV). */
function computeFlip(purchase: number, arv: number): FlipProjection {
  const transferDuty = calculateTransferDuty(purchase);
  const renovationAllowance = purchase * RENO_ALLOWANCE_PCT;
  const holdingCosts = purchase * FLIP_HOLDING_COST_PCT_PA * (FLIP_HOLDING_MONTHS / 12);
  const sellingCosts = arv * FLIP_SELLING_COST_PCT;
  const totalInvested = purchase + transferDuty + renovationAllowance + holdingCosts + sellingCosts;
  const grossProfit = arv - totalInvested;
  const taxEstimate = estimateFlipIncomeTax(grossProfit);
  const netProfit = grossProfit - taxEstimate;
  const roiPct = totalInvested > 0 ? (netProfit / totalInvested) * 100 : 0;
  const annualisedPct = calculateAnnualisedReturn(netProfit, totalInvested, FLIP_HOLDING_MONTHS);
  return {
    arv,
    purchasePrice: purchase,
    transferDuty,
    renovationAllowance,
    holdingCosts,
    sellingCosts,
    totalInvested,
    grossProfit,
    taxEstimate,
    netProfit,
    roiPct,
    annualisedPct,
  };
}

/** Binary-search the purchase price at which a flip hits a target net ROI (ROI falls as price rises). */
function solvePurchaseForRoi(arv: number, targetRoi: number): number | null {
  if (!arv || arv <= 0) return null;
  let lo = arv * 0.05;
  let hi = arv * 1.2;
  const f = (p: number) => computeFlip(p, arv).roiPct / 100 - targetRoi;
  if (f(lo) < 0) return null; // even the cheapest buy can't reach the target
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) >= 0) lo = mid;
    else hi = mid;
  }
  return lo;
}

function computeMaxBid(arv: number, asking: number): MaxBidAnalysis | null {
  if (!arv || arv <= 0) return null;
  const maxBidForTarget = solvePurchaseForRoi(arv, FLIP_TARGET_ROI);
  const askingVsMaxBidPct =
    maxBidForTarget && maxBidForTarget > 0 ? ((asking - maxBidForTarget) / maxBidForTarget) * 100 : null;
  return {
    targetRoiPct: FLIP_TARGET_ROI * 100,
    breakEvenPrice: solvePurchaseForRoi(arv, 0),
    maxBidForTarget,
    askingVsMaxBidPct,
  };
}

/** Buy-to-let projection via the shared financial engine, using standard SA operating assumptions. */
function computeRental(asking: number, closingCosts: number): RentalProjection {
  const monthlyRent = (asking * ASSUMED_GROSS_YIELD) / 12;
  const input: RentalPropertyInput = {
    purchasePrice: asking,
    monthlyRent,
    annualPropertyTax: asking * 0.007,
    annualInsurance: asking * 0.004,
    monthlyHOAFees: 0,
    monthlyMaintenanceReserve: monthlyRent * 0.08,
    monthlyUtilities: 0,
    monthlyManagementFee: monthlyRent * 0.08,
    vacancyRate: 6,
    appreciationRate: 5,
    capRate: 0,
    cashOnCashReturn: 0,
    grossRentMultiplier: 0,
    debtServiceCoverageRatio: 0,
    grossYield: 0,
    netYield: 0,
    downPaymentAmount: 0,
    loanAmount: 0,
    interestRate: 0,
    loanTermYears: 0,
    monthlyDebtService: 0,
    totalInvestmentBudget: 0,
    spentInvestmentBudget: 0,
    closingCosts,
  };
  const m = calculateRentalMetrics(input);
  return {
    estimatedMonthlyRent: monthlyRent,
    grossYieldPct: m.grossYield,
    netYieldPct: m.netYield,
    capRatePct: m.displayCapRate,
    monthlyNetCashflow: m.monthlyCashFlow,
  };
}

/** Days-on-market + price-drop velocity from the listing's recorded history. */
function computeActivity(subject: {
  createdAt: Date;
  askingPrice: number;
  priceHistory: { askingPrice: number; recordedAt: Date }[];
}): MarketActivity {
  const hist = subject.priceHistory ?? [];
  const daysOnMarket = subject.createdAt
    ? Math.max(0, Math.round((Date.now() - subject.createdAt.getTime()) / 86_400_000))
    : null;
  const firstSeenPrice = hist.length ? hist[0].askingPrice : null;
  const latestPrice = hist.length ? hist[hist.length - 1].askingPrice : subject.askingPrice;
  let priceDropCount = 0;
  for (let i = 1; i < hist.length; i++) if (hist[i].askingPrice < hist[i - 1].askingPrice) priceDropCount++;
  const totalDropPct =
    firstSeenPrice && firstSeenPrice > 0
      ? latestPrice < firstSeenPrice
        ? ((firstSeenPrice - latestPrice) / firstSeenPrice) * 100
        : 0
      : null;
  const monthsOnMarket = daysOnMarket != null ? daysOnMarket / 30.44 : null;
  const dropVelocityPctPerMonth =
    totalDropPct != null && monthsOnMarket && monthsOnMarket > 0.5 ? totalDropPct / monthsOnMarket : null;
  const staleness: MarketActivity["staleness"] =
    daysOnMarket == null ? "UNKNOWN" : daysOnMarket <= 21 ? "FRESH" : daysOnMarket <= 90 ? "NORMAL" : "STALE";
  return { daysOnMarket, firstSeenPrice, latestPrice, priceDropCount, totalDropPct, dropVelocityPctPerMonth, staleness };
}

/** Educational auction / distressed-sale risk checklist inferred from listing metadata. */
function buildAuctionRisk(subject: {
  source: string;
  auctionType: string | null;
  auctionDate: Date | null;
  noReserve: boolean;
  caseNumber: string | null;
}): AuctionRiskItem[] {
  const items: AuctionRiskItem[] = [];
  const type = (subject.auctionType ?? "").toUpperCase();
  const src = (subject.source ?? "").toLowerCase();
  const isSheriff = type.includes("SHERIFF") || src.includes("sheriff") || !!subject.caseNumber;
  const isAuction = isSheriff || type.length > 0 || !!subject.auctionDate || /auction|bidx|repo/.test(src);

  if (isSheriff) {
    items.push({
      label: "Occupancy / eviction",
      severity: "WARNING",
      detail:
        "Sheriff/court sales are often still occupied. Budget time and legal cost for a lawful eviction (PIE Act) — you cannot simply remove occupants.",
    });
    items.push({
      label: "Municipal & levy arrears",
      severity: "WARNING",
      detail:
        "Confirm outstanding rates, taxes and body-corporate levies. Historical arrears can become the buyer's liability on transfer.",
    });
  }
  if (isAuction) {
    items.push({
      label: "Voetstoots (as-is)",
      severity: "ATTENTION",
      detail:
        "Auction sales are voetstoots — no warranties on condition or defects. Inspect thoroughly and price in repairs before bidding.",
    });
    items.push({
      label: "Deposit & commission",
      severity: "ATTENTION",
      detail:
        "Budget for an immediate deposit (often ~10%) plus the auctioneer's/sheriff's commission and VAT, payable on the fall of the hammer.",
    });
    items.push({
      label: "FICA to bid",
      severity: "INFO",
      detail: "Register and complete FICA (ID + proof of address) before the auction to be allowed to bid.",
    });
  }
  if (subject.noReserve) {
    items.push({
      label: "No reserve",
      severity: "INFO",
      detail: "No reserve price — the property sells to the highest bidder. Set and stick to a firm maximum bid.",
    });
  } else if (isAuction) {
    items.push({
      label: "Reserve price",
      severity: "INFO",
      detail: "A reserve price may apply — the seller can reject bids below an undisclosed threshold.",
    });
  }
  if (subject.auctionDate) {
    items.push({
      label: "Payment timing",
      severity: "ATTENTION",
      detail:
        "Auctions require the balance shortly after the sale — arrange bridging or bond approval in advance; a failed payment can forfeit your deposit.",
    });
  }
  return items;
}

interface PeerRow {
  id: number;
  title: string;
  suburb: string | null;
  city: string;
  province: string;
  propertyType: string;
  askingPrice: number;
  floorSize: number | null;
  erfSize: number | null;
  bedrooms: number | null;
  status: string;
  createdAt: Date;
}

/**
 * Picks the tightest geographic level (suburb → city → province) that yields at
 * least MIN_COMPS peers of the same property type and sane price band.
 */
async function selectComparables(subject: PeerRow): Promise<{ level: AreaLevel; name: string; peers: PeerRow[] }> {
  const MIN_COMPS = 4;
  const priceFloor = subject.askingPrice * 0.3;
  const priceCeil = subject.askingPrice * 3;

  const select = {
    id: true,
    title: true,
    suburb: true,
    city: true,
    province: true,
    propertyType: true,
    askingPrice: true,
    floorSize: true,
    erfSize: true,
    bedrooms: true,
    status: true,
    createdAt: true,
  } as const;

  const baseWhere = {
    id: { not: subject.id },
    propertyType: subject.propertyType,
    askingPrice: { gt: priceFloor, lt: priceCeil },
    status: { in: ["ACTIVE", "WATCHED", "SOLD"] },
  };

  const levels: Array<{ level: AreaLevel; name: string; where: Record<string, unknown> }> = [];
  if (subject.suburb) {
    levels.push({
      level: "suburb",
      name: subject.suburb,
      where: { ...baseWhere, suburb: { equals: subject.suburb, mode: "insensitive" } },
    });
  }
  levels.push({
    level: "city",
    name: subject.city,
    where: { ...baseWhere, city: { equals: subject.city, mode: "insensitive" } },
  });
  levels.push({
    level: "province",
    name: subject.province,
    where: { ...baseWhere, province: subject.province },
  });

  let fallback: { level: AreaLevel; name: string; peers: PeerRow[] } | null = null;
  for (const lvl of levels) {
    const peers = (await db.distressedListing.findMany({
      where: lvl.where as never,
      select,
      orderBy: { createdAt: "desc" },
      take: 60,
    })) as PeerRow[];
    if (peers.length >= MIN_COMPS) return { level: lvl.level, name: lvl.name, peers };
    if (!fallback || peers.length > fallback.peers.length) fallback = { level: lvl.level, name: lvl.name, peers };
  }
  return fallback ?? { level: "province", name: subject.province, peers: [] };
}

/** Area trend from peer listing recency: median price of newest third vs oldest third. */
function computeAreaTrend(peers: PeerRow[]): { direction: TrendDirection; changePct: number | null } {
  if (peers.length < 6) return { direction: "UNKNOWN", changePct: null };
  const sorted = [...peers].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const third = Math.max(1, Math.floor(sorted.length / 3));
  const older = median(sorted.slice(0, third).map((p) => p.askingPrice));
  const newer = median(sorted.slice(-third).map((p) => p.askingPrice));
  if (!older || !newer) return { direction: "UNKNOWN", changePct: null };
  const changePct = pctDelta(newer, older);
  if (changePct == null) return { direction: "UNKNOWN", changePct: null };
  const direction: TrendDirection = changePct > 3 ? "RISING" : changePct < -3 ? "FALLING" : "FLAT";
  return { direction, changePct };
}

/**
 * Builds the full market analysis for a single distressed listing.
 * Returns null only when the listing itself cannot be found.
 */
export async function computeDistressedMarketAnalysis(
  listingId: number,
): Promise<DistressedMarketAnalysis | null> {
  const subject = (await db.distressedListing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      title: true,
      suburb: true,
      city: true,
      province: true,
      propertyType: true,
      askingPrice: true,
      marketValue: true,
      discount: true,
      floorSize: true,
      erfSize: true,
      bedrooms: true,
      status: true,
      createdAt: true,
      source: true,
      auctionDate: true,
      auctionType: true,
      noReserve: true,
      caseNumber: true,
      priceHistory: { orderBy: { recordedAt: "asc" }, select: { askingPrice: true, recordedAt: true } },
    },
  })) as (PeerRow & {
    marketValue: number | null;
    discount: number | null;
    source: string;
    auctionDate: Date | null;
    auctionType: string | null;
    noReserve: boolean;
    caseNumber: string | null;
    priceHistory: { askingPrice: number; recordedAt: Date }[];
  }) | null;

  if (!subject) return null;

  const subjectPpsm = pricePerSqm(subject.askingPrice, subject.floorSize, subject.erfSize);

  const { level, name, peers } = await selectComparables(subject);

  // Subject's own recorded price drops.
  const subjectPriceDrops: Array<{ from: number; to: number; pct: number; at: string }> = [];
  const hist = subject.priceHistory ?? [];
  for (let i = 1; i < hist.length; i++) {
    const from = hist[i - 1].askingPrice;
    const to = hist[i].askingPrice;
    if (from > 0 && to > 0 && to < from) {
      const pct = ((from - to) / from) * 100;
      if (pct >= 1) subjectPriceDrops.push({ from, to, pct, at: hist[i].recordedAt.toISOString() });
    }
  }

  const baseAnalysis: DistressedMarketAnalysis = {
    listingId,
    generatedAt: new Date().toISOString(),
    insufficientData: peers.length < 4,
    area: {
      level,
      name,
      sampleSize: peers.length,
      medianAskingPrice: null,
      medianPricePerSqm: null,
      priceRange: null,
    },
    subject: {
      askingPrice: subject.askingPrice,
      marketValue: subject.marketValue,
      discount: subject.discount,
      floorSize: subject.floorSize,
      erfSize: subject.erfSize,
      pricePerSqm: subjectPpsm,
    },
    positioning: { vsAreaMedianPct: null, vsAreaPricePerSqmPct: null, pricePercentile: null },
    valuation: {
      estimatedValue: null,
      estimatedValueLow: null,
      estimatedValueHigh: null,
      impliedMarginPct: null,
      method: "Area benchmark (median R/m² of comparable distressed listings)",
    },
    trend: { direction: "UNKNOWN", areaPriceChangePct: null, subjectPriceDrops },
    comparables: [],
    activity: computeActivity(subject),
    projections: { arv: null, assumptions: PROJECTION_ASSUMPTIONS, flip: null, rental: null },
    maxBid: null,
    auctionRisk: buildAuctionRisk(subject),
    signals: [],
    verdict: { score: 0, label: "Fair", rationale: "", factors: [] },
  };

  if (!peers.length) {
    baseAnalysis.signals = buildSignals(baseAnalysis);
    baseAnalysis.verdict = buildVerdict(baseAnalysis);
    return baseAnalysis;
  }

  const peerPrices = peers.map((p) => p.askingPrice);
  const peerPpsmList = peers
    .map((p) => pricePerSqm(p.askingPrice, p.floorSize, p.erfSize))
    .filter((n): n is number => n != null);

  const medianAskingPrice = median(peerPrices);
  const medianPpsm = median(peerPpsmList);
  const priceRange = { min: Math.min(...peerPrices), max: Math.max(...peerPrices) };

  baseAnalysis.area.medianAskingPrice = medianAskingPrice;
  baseAnalysis.area.medianPricePerSqm = medianPpsm;
  baseAnalysis.area.priceRange = priceRange;

  // Positioning
  const vsMedian = medianAskingPrice ? pctDelta(subject.askingPrice, medianAskingPrice) : null;
  const vsPpsm = medianPpsm && subjectPpsm ? pctDelta(subjectPpsm, medianPpsm) : null;
  const cheaperCount = peerPrices.filter((p) => p > subject.askingPrice).length;
  const percentile = peerPrices.length ? Math.round((cheaperCount / peerPrices.length) * 100) : null;
  baseAnalysis.positioning = {
    vsAreaMedianPct: vsMedian,
    vsAreaPricePerSqmPct: vsPpsm,
    pricePercentile: percentile,
  };

  // Valuation (benchmark) — area R/m² × subject size, ±12% band.
  const area = subject.floorSize && subject.floorSize > 0 ? subject.floorSize : subject.erfSize;
  if (medianPpsm && area && area > 0) {
    const est = medianPpsm * area;
    baseAnalysis.valuation.estimatedValue = est;
    baseAnalysis.valuation.estimatedValueLow = est * 0.88;
    baseAnalysis.valuation.estimatedValueHigh = est * 1.12;
    baseAnalysis.valuation.impliedMarginPct = pctDelta(est, subject.askingPrice) == null
      ? null
      : ((est - subject.askingPrice) / est) * 100;

    // Projected returns + max-bid, built off the benchmark ARV.
    baseAnalysis.projections.arv = est;
    const closingCosts = calculateTransferDuty(subject.askingPrice);
    baseAnalysis.projections.flip = computeFlip(subject.askingPrice, est);
    baseAnalysis.projections.rental = computeRental(subject.askingPrice, closingCosts);
    baseAnalysis.maxBid = computeMaxBid(est, subject.askingPrice);
  }

  // Trend
  const trend = computeAreaTrend(peers);
  baseAnalysis.trend.direction = trend.direction;
  baseAnalysis.trend.areaPriceChangePct = trend.changePct;

  // Comparables (closest by price, max 6)
  baseAnalysis.comparables = [...peers]
    .sort((a, b) => Math.abs(a.askingPrice - subject.askingPrice) - Math.abs(b.askingPrice - subject.askingPrice))
    .slice(0, 6)
    .map((p) => ({
      id: p.id,
      title: p.title,
      suburb: p.suburb,
      city: p.city,
      propertyType: p.propertyType,
      askingPrice: p.askingPrice,
      floorSize: p.floorSize,
      erfSize: p.erfSize,
      pricePerSqm: pricePerSqm(p.askingPrice, p.floorSize, p.erfSize),
      bedrooms: p.bedrooms,
      status: p.status,
      createdAt: p.createdAt.toISOString(),
    }));

  baseAnalysis.signals = buildSignals(baseAnalysis);
  baseAnalysis.verdict = buildVerdict(baseAnalysis);
  return baseAnalysis;
}

// ─── signals + verdict ─────────────────────────────────────────
function buildSignals(a: DistressedMarketAnalysis): MarketSignal[] {
  const signals: MarketSignal[] = [];

  // Discount vs stated market value
  if (a.subject.discount != null) {
    const d = a.subject.discount;
    signals.push({
      label: "Discount to market value",
      status: d >= 20 ? "POSITIVE" : d >= 8 ? "NEUTRAL" : "CAUTION",
      detail: `Listed ${d.toFixed(0)}% below the stated market value.`,
    });
  }

  // Margin of safety vs area benchmark
  if (a.valuation.impliedMarginPct != null) {
    const m = a.valuation.impliedMarginPct;
    signals.push({
      label: "Margin of safety (area benchmark)",
      status: m >= 20 ? "POSITIVE" : m >= 5 ? "NEUTRAL" : "CAUTION",
      detail:
        m >= 0
          ? `Asking price is ${m.toFixed(0)}% under the area benchmark value.`
          : `Asking price is ${Math.abs(m).toFixed(0)}% above the area benchmark value.`,
    });
  }

  // Price positioning per m²
  if (a.positioning.vsAreaPricePerSqmPct != null) {
    const v = a.positioning.vsAreaPricePerSqmPct;
    signals.push({
      label: "Price per m² vs area",
      status: v <= -10 ? "POSITIVE" : v <= 10 ? "NEUTRAL" : "CAUTION",
      detail:
        v <= 0
          ? `${Math.abs(v).toFixed(0)}% cheaper per m² than comparable listings.`
          : `${v.toFixed(0)}% more expensive per m² than comparable listings.`,
    });
  }

  // Area trend
  if (a.trend.direction !== "UNKNOWN" && a.trend.areaPriceChangePct != null) {
    const c = a.trend.areaPriceChangePct;
    signals.push({
      label: "Area price trend",
      status: a.trend.direction === "RISING" ? "POSITIVE" : a.trend.direction === "FALLING" ? "CAUTION" : "NEUTRAL",
      detail:
        a.trend.direction === "FLAT"
          ? "Area asking prices are broadly flat."
          : `Area asking prices are ${a.trend.direction === "RISING" ? "up" : "down"} ~${Math.abs(c).toFixed(0)}% recently.`,
    });
  }

  // Liquidity / comparables depth
  signals.push({
    label: "Comparable depth",
    status: a.area.sampleSize >= 10 ? "POSITIVE" : a.area.sampleSize >= 4 ? "NEUTRAL" : "CAUTION",
    detail:
      a.area.sampleSize >= 4
        ? `${a.area.sampleSize} comparable ${a.area.level}-level listings support this view.`
        : `Only ${a.area.sampleSize} comparable listing(s) — treat the estimate with caution.`,
  });

  // Seller motivation from price drops
  if (a.trend.subjectPriceDrops.length) {
    const total = a.trend.subjectPriceDrops.reduce((s, d) => s + d.pct, 0);
    signals.push({
      label: "Seller motivation",
      status: "POSITIVE",
      detail: `Asking price cut ${a.trend.subjectPriceDrops.length} time(s), ~${total.toFixed(0)}% total — motivated seller.`,
    });
  }

  return signals;
}

function buildVerdict(a: DistressedMarketAnalysis): DistressedMarketAnalysis["verdict"] {
  // Start neutral; move on real evidence only.
  let score = 50;
  const factors: VerdictFactor[] = [];
  const add = (label: string, impact: number, note: string) => {
    if (!impact) return;
    score += impact;
    factors.push({ label, impact: Math.round(impact), note });
  };

  if (a.subject.discount != null) {
    add(
      "Discount to market value",
      Math.max(-10, Math.min(20, (a.subject.discount - 10) * 0.8)),
      `${a.subject.discount.toFixed(0)}% below stated market value.`,
    );
  }
  if (a.valuation.impliedMarginPct != null) {
    add(
      "Margin vs area benchmark",
      Math.max(-15, Math.min(25, a.valuation.impliedMarginPct * 0.8)),
      a.valuation.impliedMarginPct >= 0
        ? `~${a.valuation.impliedMarginPct.toFixed(0)}% under the area benchmark value.`
        : `~${Math.abs(a.valuation.impliedMarginPct).toFixed(0)}% over the area benchmark value.`,
    );
  }
  if (a.positioning.vsAreaPricePerSqmPct != null) {
    const v = a.positioning.vsAreaPricePerSqmPct;
    add(
      "Price per m² vs area",
      Math.max(-12, Math.min(12, -v * 0.4)),
      v <= 0 ? `${Math.abs(v).toFixed(0)}% cheaper per m² than peers.` : `${v.toFixed(0)}% dearer per m² than peers.`,
    );
  }
  if (a.trend.direction === "RISING") add("Area price trend", 6, "Area asking prices are rising.");
  else if (a.trend.direction === "FALLING") add("Area price trend", -6, "Area asking prices are softening.");
  if (a.trend.subjectPriceDrops.length)
    add("Seller motivation", 4, `Asking price cut ${a.trend.subjectPriceDrops.length} time(s).`);
  if (a.area.sampleSize < 4) add("Thin comparable data", -8, `Only ${a.area.sampleSize} comparable listing(s).`);
  if (a.projections.flip) {
    const roi = a.projections.flip.roiPct;
    add(
      "Projected flip return",
      Math.max(-10, Math.min(12, (roi - 12) * 0.4)),
      `~${roi.toFixed(0)}% net flip ROI on benchmark assumptions.`,
    );
  }
  if (a.activity.staleness === "STALE")
    add("Time on market", -4, `Listed ~${a.activity.daysOnMarket ?? "?"} days — may signal title or condition issues.`);

  score = Math.max(0, Math.min(100, Math.round(score)));

  const label: DistressedMarketAnalysis["verdict"]["label"] =
    score >= 78 ? "Strong" : score >= 62 ? "Solid" : score >= 45 ? "Fair" : score >= 30 ? "Weak" : "Avoid";

  const bits: string[] = [];
  if (a.valuation.impliedMarginPct != null) {
    bits.push(
      a.valuation.impliedMarginPct >= 0
        ? `~${a.valuation.impliedMarginPct.toFixed(0)}% under the area benchmark`
        : `~${Math.abs(a.valuation.impliedMarginPct).toFixed(0)}% over the area benchmark`,
    );
  } else if (a.subject.discount != null) {
    bits.push(`${a.subject.discount.toFixed(0)}% below stated market value`);
  }
  if (a.trend.direction === "RISING") bits.push("in a rising area");
  else if (a.trend.direction === "FALLING") bits.push("in a softening area");
  if (a.trend.subjectPriceDrops.length) bits.push("with a motivated seller");
  if (a.insufficientData) bits.push("on limited comparable data");

  const rationale = bits.length
    ? `${label} buy case — ${bits.join(", ")}.`
    : `${label} buy case on the available data.`;

  return { score, label, rationale, factors: factors.sort((x, y) => Math.abs(y.impact) - Math.abs(x.impact)) };
}

/**
 * Compact, prompt-ready market context for the AI quick-screen so grades reflect
 * real comparables instead of the single listing's own fields. Safe to call for
 * any listing; returns an empty string when there is nothing useful to add.
 */
export async function buildMarketContextLines(listingId: number): Promise<string> {
  const a = await computeDistressedMarketAnalysis(listingId);
  if (!a || !a.area.sampleSize) return "";
  const lines: string[] = [`Comparable ${a.area.level} "${a.area.name}" (${a.area.sampleSize} listings):`];
  if (a.area.medianAskingPrice) lines.push(`  Area median asking: R${Math.round(a.area.medianAskingPrice).toLocaleString()}`);
  if (a.area.medianPricePerSqm) lines.push(`  Area median R/m²: R${Math.round(a.area.medianPricePerSqm).toLocaleString()}`);
  if (a.positioning.vsAreaMedianPct != null)
    lines.push(`  This listing vs area median price: ${a.positioning.vsAreaMedianPct.toFixed(0)}%`);
  if (a.positioning.vsAreaPricePerSqmPct != null)
    lines.push(`  This listing vs area R/m²: ${a.positioning.vsAreaPricePerSqmPct.toFixed(0)}%`);
  if (a.valuation.estimatedValue)
    lines.push(`  Benchmark value estimate: R${Math.round(a.valuation.estimatedValue).toLocaleString()}`);
  if (a.valuation.impliedMarginPct != null)
    lines.push(`  Implied margin of safety: ${a.valuation.impliedMarginPct.toFixed(0)}%`);
  if (a.trend.direction !== "UNKNOWN")
    lines.push(`  Area price trend: ${a.trend.direction}${a.trend.areaPriceChangePct != null ? ` (${a.trend.areaPriceChangePct.toFixed(0)}%)` : ""}`);
  if (a.projections.flip && a.projections.arv)
    lines.push(`  Projected flip: ~${a.projections.flip.roiPct.toFixed(0)}% net ROI (ARV R${Math.round(a.projections.arv).toLocaleString()})`);
  if (a.projections.rental)
    lines.push(`  Projected rental: ~${a.projections.rental.grossYieldPct.toFixed(1)}% gross / ${a.projections.rental.netYieldPct.toFixed(1)}% net yield`);
  if (a.maxBid?.maxBidForTarget)
    lines.push(`  Max bid for ${a.maxBid.targetRoiPct.toFixed(0)}% ROI: R${Math.round(a.maxBid.maxBidForTarget).toLocaleString()}`);
  if (a.activity.daysOnMarket != null)
    lines.push(`  Days on market: ${a.activity.daysOnMarket}${a.activity.staleness !== "UNKNOWN" ? ` (${a.activity.staleness})` : ""}`);
  if (a.auctionRisk.length) lines.push(`  Auction/distressed risks flagged: ${a.auctionRisk.length}`);
  lines.push(`  Finder verdict: ${a.verdict.label} (${a.verdict.score}/100)`);
  return lines.join("\n");
}
