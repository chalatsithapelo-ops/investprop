/**
 * Distressed Property Scraper Service — v6 EXPANDED
 * ──────────────────────────────────────────────────
 * Sources confirmed working via live testing.
 *
 * WORKING sources:
 *   1.  Property24         — verified selectors, images via js_P24_listingImage, pagination
 *   2.  Private Property    — listing-result class (new), multiple URL strategies
 *   3.  IOL Property        — Houzez theme, item-wrap selectors, slug-based links
 *   4.  MyRoof (Std Bank)   — prop_list_item, data-original images
 *   5.  In2assets           — /main-auction page, property links
 *   6.  Aucor               — /auctions/category/property-67, views-row blocks
 *   7.  High Street Auctions— property.highstreetauctions.com
 *   8.  SheriffHQ           — requires login cookies
 *   9.  Broll               — broll.com __NEXT_DATA__ JSON (commercial)
 *   10. BidX1               — bidx1.com/en/south-africa property cards
 *   11. Auction Inc         — auctioninc.co.za property links + auction pages
 *   12. RealNet             — realnet.co.za property-list-listing cards
 *   13. SA Sheriff          — sasheriff.co.za POST search + detail pages
 *
 * REMOVED (dead/broken — verified 2025):
 *   - vavi.co.za — DNS ENOTFOUND (all domains)
 *   - nedbankpip.co.za — DNS ENOTFOUND
 *   - rawsonauctions.co.za — timeout / 403
 *   - absa.co.za repos page — 404
 *   - standardbank.co.za repos page — 404
 *   - fnb repos page — landing page only, no listings
 */

import * as cheerio from "cheerio";
import { db } from "~/server/db";

// ─── Types ───────────────────────────────────────────────────────

export interface ScrapedListing {
  externalId?: string;
  source: string;
  sourceUrl?: string;
  title: string;
  description?: string;
  propertyType: string;
  address?: string;
  suburb?: string;
  city: string;
  province: string;
  marketValue?: number;
  askingPrice: number;
  discount?: number;
  bedrooms?: number;
  bathrooms?: number;
  erfSize?: number;
  floorSize?: number;
  imageUrl?: string;
  auctionDate?: Date;
  auctionTime?: string;
  auctionVenue?: string;
  auctionType?: string;
  auctioneer?: string;
  noReserve?: boolean;
  caseNumber?: string;
  courtDivision?: string;
}

interface ScrapeResult {
  source: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  listings: ScrapedListing[];
  error?: string;
  durationMs: number;
  pagesScraped?: number;
}

// ─── Configuration ───────────────────────────────────────────────

const TARGET_PROVINCE = "Gauteng";
const MAX_PRICE = 450_000;

const GAUTENG_CITIES = [
  "Johannesburg", "Pretoria", "Tshwane", "Centurion", "Midrand",
  "Sandton", "Randburg", "Roodepoort", "Soweto", "Benoni",
  "Boksburg", "Germiston", "Springs", "Alberton", "Vereeniging",
  "Vanderbijlpark", "Krugersdorp", "Kempton Park", "Edenvale",
  "Bedfordview", "Fourways", "Bryanston", "Sunninghill",
  "Brakpan", "Nigel", "Heidelberg", "Meyerton", "Carletonville",
  "Randfontein", "Westonaria", "Bronkhorstspruit", "Cullinan",
  "Irene", "Montana", "Hatfield", "Menlyn", "Arcadia",
  "Sunnyside", "Brooklyn", "Waterkloof", "Lynnwood",
  "Silverton", "Mamelodi", "Atteridgeville", "Diepsloot",
  "Cosmo City", "Honeydew", "Lonehill", "Northriding",
  "Florida", "Constantia Kloof", "Northcliff", "Melville",
  "Auckland Park", "Parkhurst", "Parktown", "Houghton",
  "Saxonwold", "Illovo", "Hyde Park", "Craighall",
  "Linden", "Emmarentia", "Greenside", "Westcliff",
  "Norwood", "Cyrildene", "Kensington", "Turffontein",
  "Southdale", "Glenvista", "Bassonia", "Mulbarton",
  "Mondeor", "Meredale", "Kibler Park", "South Hills",
  "Lenasia", "Ennerdale", "Orange Farm", "Tembisa",
  "Katlehong", "Thokoza", "Vosloorus", "Daveyton",
  "Malvern", "Fairview", "Bruma", "Braamfontein",
  "Hillbrow", "Yeoville", "Berea", "Jeppestown",
  "Observatory", "Orange Grove", "Bez Valley", "Troyeville",
  "Birchleigh", "Glen Marais", "Witfontein", "Croydon",
  "Olifantsfontein", "Rhodesfield", "Kaalfontein", "Mooifontein",
  "Midstream", "Cresslawn", "Witfield", "Pomona",
  "Klippoortjie", "Soshanguve", "Hammanskraal", "Ga-Rankuwa",
  "Mabopane", "Winterveld", "Temba", "Rabie Ridge",
  "Ivory Park", "Ekurhuleni", "Mogale City",
  "Emfuleni", "Sedibeng", "West Rand", "East Rand",
];

// ──── Fetch helpers ─────────────────────────────────────────────

async function safeFetch(url: string, options?: { cookies?: string }): Promise<{ html: string | null; status: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-ZA,en;q=0.9",
      "Cache-Control": "no-cache",
    };
    if (options?.cookies) headers["Cookie"] = options.cookies;
    const res = await fetch(url, { signal: controller.signal, headers, redirect: "follow" });
    if (!res.ok) return { html: null, status: res.status };
    return { html: await res.text(), status: res.status };
  } catch {
    return { html: null, status: 0 };
  } finally {
    clearTimeout(timeout);
  }
}

// ──── Login helpers ────────────────────────────────────────────

/** Login to SheriffHQ and return session cookie string */
async function loginSheriffHQ(email: string, password: string): Promise<string | null> {
  try {
    // First GET /Account/Login to get a session cookie
    const getRes = await fetch("https://www.sheriffhq.co.za/Account/Login", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,*/*",
      },
      redirect: "manual",
    });
    const getCookies = getRes.headers.getSetCookie?.() || [];
    const sessionCookie = getCookies.map((c: string) => c.split(";")[0]).join("; ");

    // POST /Home/SignIn with email and password
    const body = `Email=${encodeURIComponent(email)}&Password=${encodeURIComponent(password)}`;
    const postRes = await fetch("https://www.sheriffhq.co.za/Home/SignIn", {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": sessionCookie,
        "Accept": "text/html,*/*",
      },
      body,
      redirect: "manual",
    });

    // Collect all cookies from sign-in response
    const postCookies = postRes.headers.getSetCookie?.() || [];
    const allCookies = [...getCookies, ...postCookies].map((c: string) => c.split(";")[0]).join("; ");

    // 302 redirect = successful login
    if (postRes.status === 302 || postRes.status === 200) {
      return allCookies || null;
    }
    return null;
  } catch {
    return null;
  }
}

/** Login to SA Sheriff and return session cookie string */
async function loginSASheriff(email: string, password: string): Promise<string | null> {
  try {
    // GET login page to get session cookie
    const getRes = await fetch("https://www.sasheriff.co.za/memberlogin.asp?CID=1", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,*/*",
      },
      redirect: "manual",
    });
    const getCookies = getRes.headers.getSetCookie?.() || [];
    const sessionCookie = getCookies.map((c: string) => c.split(";")[0]).join("; ");

    // POST /MemberValidate.asp with txtUsername and txtPassword
    const body = `txtUsername=${encodeURIComponent(email)}&txtPassword=${encodeURIComponent(password)}&chkRemember=TRUE`;
    const postRes = await fetch("https://www.sasheriff.co.za/MemberValidate.asp", {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": sessionCookie,
        "Accept": "text/html,*/*",
      },
      body,
      redirect: "manual",
    });

    const postCookies = postRes.headers.getSetCookie?.() || [];
    const allCookies = [...getCookies, ...postCookies].map((c: string) => c.split(";")[0]).join("; ");

    if (postRes.status === 302 || postRes.status === 200) {
      return allCookies || null;
    }
    return null;
  } catch {
    return null;
  }
}

// ──── Parsing utilities ─────────────────────────────────────────

function extractPrice(text: string): number | null {
  if (!text) return null;
  const upper = text.toUpperCase().trim();
  if (upper === "POA" || upper === "PRICE ON APPLICATION") return null;
  const cleaned = text.replace(/[^\d.,]/g, "").replace(/,/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) || num <= 0 ? null : num;
}

function isGauteng(text: string): boolean {
  const lower = text.toLowerCase();
  if (lower.includes("gauteng")) return true;
  return GAUTENG_CITIES.some((c) => lower.includes(c.toLowerCase()));
}

function parseDate(text: string): Date | null {
  if (!text) return null;
  try {
    const longMatch = text.match(/(\d{1,2})(?:st|nd|rd|th)?\s*(?:day\s+of\s+)?(january|february|march|april|may|june|july|august|september|october|november|december)\s*(\d{4})/i);
    if (longMatch) {
      const d = new Date(`${longMatch[3]}-${longMatch[2]}-${longMatch[1]}`);
      if (!isNaN(d.getTime())) return d;
    }
    const saMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (saMatch) {
      const d = new Date(`${saMatch[3]!}-${saMatch[2]!.padStart(2, "0")}-${saMatch[1]!.padStart(2, "0")}`);
      return isNaN(d.getTime()) ? null : d;
    }
    const shortMatch = text.match(/(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(\d{4})/i);
    if (shortMatch) {
      const d = new Date(`${shortMatch[3]}-${shortMatch[2]}-${shortMatch[1]}`);
      if (!isNaN(d.getTime())) return d;
    }
    const d = new Date(text);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function extractCity(location: string): string {
  const lower = location.toLowerCase();
  for (const city of GAUTENG_CITIES) {
    if (lower.includes(city.toLowerCase())) return city;
  }
  return "Gauteng";
}

function extractBeds(text: string): number | undefined {
  const m = text.match(/(\d+)\s*(?:bed|bedroom|br)/i);
  return m?.[1] ? parseInt(m[1]) : undefined;
}

function extractBaths(text: string): number | undefined {
  const m = text.match(/(\d+)\s*(?:bath|bathroom)/i);
  return m?.[1] ? parseInt(m[1]) : undefined;
}

function extractSize(text: string): number | undefined {
  const m = text.match(/(\d+)\s*(?:m\u00b2|sqm|m2|square met)/i);
  return m?.[1] ? parseInt(m[1]) : undefined;
}

function extractErf(text: string): number | undefined {
  const m = text.match(/erf\w*\s*\d+.*?(\d[\d\s]*)\s*(?:m\u00b2|sqm|m2|square met)/i);
  return m?.[1] ? parseInt(m[1].replace(/\s/g, "")) : undefined;
}

function getImageUrl($el: cheerio.Cheerio<any>, $: cheerio.CheerioAPI, baseUrl?: string): string | undefined {
  // Try to find proper property images — skip logos, icons, navs
  const candidates: string[] = [];
  $el.find("img").each((_, imgEl) => {
    const $img = $(imgEl);
    const src = $img.attr("data-original") || $img.attr("data-src") || $img.attr("data-lazy-src") || $img.attr("src") || "";
    if (!src) return;
    // Skip common non-property images
    if (src.includes("placeholder") || src.includes("blank.gif") || src.includes("/icon") || src.endsWith(".svg") || src.includes("200x150.png") || src.includes("logo") || src.includes("nav-icon") || src.includes("favicon") || src.includes("/Images/logo") || src.includes("/Images/icon") || src.includes("info-icon") || src.includes("bidder.svg") || src.includes("google")) return;
    // Check if image is in a header/nav (skip those)
    if ($img.closest("nav, header, footer, .navbar, .nav").length > 0) return;
    candidates.push(src);
  });

  const src = candidates[0] || "";
  if (!src) return undefined;
  if (src.startsWith("http")) return src;
  if (src.startsWith("//")) return `https:${src}`;
  if (src.startsWith("/") && baseUrl) return `${baseUrl}${src}`;
  if (src.startsWith("/")) return undefined;
  return undefined;
}

function dedup(listings: ScrapedListing[]): ScrapedListing[] {
  const seen = new Set<string>();
  return listings.filter((l) => {
    const key = `${l.source}|${l.externalId || l.sourceUrl || l.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Detect "without a reserve price" or "no reserve" in text */
function detectNoReserve(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes("without a reserve") || lower.includes("no reserve") || lower.includes("without reserve");
}

/** Extract reserve price from gazette / sheriff text */
function extractReservePrice(text: string): number | null {
  const patterns = [
    /reserve\s*(?:price|amount)?\s*(?:of|:)?\s*R\s*([\d\s,]+)/i,
    /(?:subject to (?:a )?)?reserve\s*(?:of)?\s*R\s*([\d\s,]+)/i,
    /minimum\s*(?:reserve|bid|price)\s*(?:of|:)?\s*R\s*([\d\s,]+)/i,
    /R\s*([\d\s,]+)\s*(?:reserve)/i,
  ];
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m?.[1]) {
      const num = parseInt(m[1].replace(/[\s,]/g, ""));
      if (!isNaN(num) && num >= 1000) return num;
    }
  }
  return null;
}

/** Check if a sheriff listing should be included */
function shouldIncludeSheriffListing(text: string, price: number | null): { include: boolean; askingPrice: number; noReserve: boolean } {
  const noReserve = detectNoReserve(text);
  const reservePrice = extractReservePrice(text);
  const effectivePrice = price || reservePrice;

  if (noReserve) return { include: true, askingPrice: effectivePrice || 0, noReserve: true };
  if (effectivePrice && effectivePrice <= MAX_PRICE) return { include: true, askingPrice: effectivePrice, noReserve: false };
  if (effectivePrice && effectivePrice > MAX_PRICE) return { include: false, askingPrice: effectivePrice, noReserve: false };
  return { include: true, askingPrice: 0, noReserve: false };
}

/** Extract court case number like "2874/2023" */
function extractCaseNumber(text: string): string | undefined {
  const m = text.match(/case\s*(?:no|number)?:?\s*(\d{1,6}\/\d{4})/i);
  return m?.[1];
}

/** Extract court division */
function extractCourtDivision(text: string): string | undefined {
  const m = text.match(/((?:HIGH|MAGISTRATE)\s*COURT[^,)]*(?:DIVISION[^,)]*)?)/i);
  return m?.[1]?.trim();
}

// ═══════════════════════════════════════════════════════════════
// ═══ 1. PROPERTY24 — VERIFIED images + pagination ════════════
// ═══════════════════════════════════════════════════════════════

async function scrapeProperty24(): Promise<ScrapeResult> {
  const start = Date.now();
  const allListings: ScrapedListing[] = [];
  let pagesScraped = 0;

  // City-specific URLs with pagination (page 1 and 2)
  const cityConfigs = [
    { name: "johannesburg", code: "100" },
    { name: "pretoria", code: "469" },
    { name: "centurion", code: "1564" },
    { name: "midrand", code: "1645" },
    { name: "soweto", code: "432" },
    { name: "benoni", code: "117" },
    { name: "boksburg", code: "118" },
    { name: "springs", code: "125" },
    { name: "kempton-park", code: "120" },
    { name: "alberton", code: "116" },
    { name: "krugersdorp", code: "119" },
    { name: "randburg", code: "1589" },
    { name: "roodepoort", code: "123" },
    { name: "vereeniging", code: "127" },
    { name: "brakpan", code: "3835" },
    { name: "germiston", code: "121" },
  ];

  const cityUrls: string[] = [];
  for (const { name, code } of cityConfigs) {
    // Page 1
    cityUrls.push(`https://www.property24.com/for-sale/${name}/gauteng/${code}?sp=pt%3d450000`);
    // Page 2 (pagination: /code/pageNumber)
    cityUrls.push(`https://www.property24.com/for-sale/${name}/gauteng/${code}/2?sp=pt%3d450000`);
  }

  for (const url of cityUrls) {
    const { html, status } = await safeFetch(url);
    if (!html || status !== 200) continue;
    pagesScraped++;

    const $ = cheerio.load(html);

    $(".p24_regularTile").each((_, el) => {
      const $el = $(el);
      const title = $el.find(".p24_title").text().trim();
      const priceText = $el.find(".p24_price").text().trim();
      const location = $el.find(".p24_location").text().trim();
      const address = $el.find(".p24_address").text().trim();
      const linkHref = $el.find("a").first().attr("href") || "";
      const featureText = $el.find(".p24_featureDetails").text();

      // ── Image extraction (VERIFIED via live testing) ──
      // P24 lazy-loads main images via JS. The main tile image has class="lazy"
      // with NO src/data-original/data-src. BUT rollover thumbnails with class
      // "js_P24_listingImage" or "js_lazyLoadImage" DO have a real `src`:
      //   src="https://images.prop24.com/371320712/Crop158x89"
      // We find these and upscale to Crop528x351 for display.
      let imageUrl: string | undefined;

      // Strategy 1: Find js_P24_listingImage or js_lazyLoadImage with actual src
      $el.find("img.js_P24_listingImage, img.js_lazyLoadImage").each((_, imgEl) => {
        if (imageUrl) return;
        const src = $(imgEl).attr("src") || "";
        if (src.startsWith("https://images.prop24.com/")) {
          // Convert thumbnail to larger format
          imageUrl = src.replace(/Crop\d+x\d+/, "Crop528x351");
        }
      });

      // Strategy 2: Any img with prop24 image domain
      if (!imageUrl) {
        $el.find("img[src*='images.prop24.com']").each((_, imgEl) => {
          if (imageUrl) return;
          const src = $(imgEl).attr("src") || "";
          if (!src.includes("Logo") && !src.includes("Branding") && !src.endsWith(".svg") && !src.includes("icon")) {
            imageUrl = src.replace(/Crop\d+x\d+/, "Crop528x351").replace(/Ensure\d+x\d+/, "Crop528x351");
          }
        });
      }

      // Strategy 3: data-original / data-src fallback
      if (!imageUrl) {
        $el.find("img").each((_, imgEl) => {
          if (imageUrl) return;
          const src = $(imgEl).attr("data-original") || $(imgEl).attr("data-src") || "";
          if (src.startsWith("http") && src.includes("prop24.com") && !src.includes("Logo") && !src.includes("icon")) {
            imageUrl = src;
          }
        });
      }

      const fullText = `${title} ${location} ${address}`;
      if (!isGauteng(fullText)) return;

      let price = extractPrice(priceText);
      const isPOA = priceText.toUpperCase().includes("POA");
      if (price && price > MAX_PRICE) return;
      if (!price && !isPOA) return;

      const sourceUrl = linkHref.startsWith("http") ? linkHref : `https://www.property24.com${linkHref}`;
      const idMatch = sourceUrl.match(/(\d+)$/);

      allListings.push({
        externalId: idMatch?.[1] || `p24-${allListings.length}`,
        source: "property24",
        sourceUrl,
        title: title || "Property24 Listing",
        propertyType: "HOUSE",
        address: address || location,
        suburb: location,
        city: extractCity(`${location} ${address}`),
        province: TARGET_PROVINCE,
        askingPrice: price || 0,
        bedrooms: extractBeds(title + " " + featureText),
        bathrooms: extractBaths(featureText),
        floorSize: extractSize(featureText),
        imageUrl,
        auctionType: "SALE",
        auctioneer: "Property24",
      });
    });
  }

  return { source: "property24", status: allListings.length > 0 ? "SUCCESS" : "PARTIAL", listings: dedup(allListings), durationMs: Date.now() - start, pagesScraped };
}

// ═══════════════════════════════════════════════════════════════
// ═══ 2. PRIVATE PROPERTY — updated selectors ═════════════════
// ═══════════════════════════════════════════════════════════════

async function scrapePrivateProperty(): Promise<ScrapeResult> {
  const start = Date.now();
  const allListings: ScrapedListing[] = [];
  let pagesScraped = 0;

  // PP changed HTML structure: .featured-listing is gone, now uses .listing-result
  // Try multiple URL strategies — some return 0 results depending on filter.
  const baseUrls = [
    "https://www.privateproperty.co.za/for-sale/gauteng/1?PriceTo=450000",
    "https://www.privateproperty.co.za/for-sale/gauteng/1?PriceTo=450000&page=2",
    "https://www.privateproperty.co.za/for-sale/south-africa/1?PriceTo=450000&pr=3",
    "https://www.privateproperty.co.za/for-sale/south-africa/1?PriceTo=450000&pr=3&page=2",
    "https://www.privateproperty.co.za/for-sale/johannesburg/1?PriceTo=450000",
    "https://www.privateproperty.co.za/for-sale/pretoria/1?PriceTo=450000",
    "https://www.privateproperty.co.za/for-sale/centurion/1?PriceTo=450000",
    "https://www.privateproperty.co.za/for-sale/soweto/1?PriceTo=450000",
    "https://www.privateproperty.co.za/for-sale/midrand/1?PriceTo=450000",
  ];

  for (const url of baseUrls) {
    const { html, status } = await safeFetch(url);
    if (!html || status !== 200) continue;
    pagesScraped++;

    const $ = cheerio.load(html);

    // Strategy A: JSON-LD Residence objects
    const jsonLdMap = new Map<string, { imageUrl?: string; sourceUrl?: string; address?: string; suburb?: string }>();
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).text());
        if (json["@type"] === "Residence") {
          const jsonUrl = json.url || "";
          const photo = Array.isArray(json.photo) ? json.photo[0]?.contentUrl : (typeof json.photo === "string" ? json.photo : undefined);
          const key = jsonUrl.match(/T(\d+)$/)?.[1] || json.address?.addressLocality || "";
          jsonLdMap.set(key, {
            imageUrl: photo,
            sourceUrl: jsonUrl.startsWith("http") ? jsonUrl : `https://www.privateproperty.co.za${jsonUrl}`,
            address: json.address?.streetAddress,
            suburb: json.address?.addressLocality,
          });
        }
      } catch {}
    });

    // Strategy B: .listing-result containers (NEW class)
    $(".listing-result").each((_, el) => {
      const $el = $(el);
      if ($el.hasClass("listing-result__no-result")) return;

      const title = $el.find(".listing-result__title, .listing-result__header a, h3, h4").first().text().trim();
      const priceText = $el.find(".listing-result__price, .listing-result__header .price").first().text().trim();
      const address = $el.find(".listing-result__address, .listing-result__location").first().text().trim();
      const features = $el.find(".listing-result__feature, .listing-result__features span").map((_, f) => $(f).text().trim()).get();

      let detailLink = "";
      $el.find("a[href]").each((_, a) => {
        const href = $(a).attr("href") || "";
        if (href.match(/\/T\d+$/) && !detailLink) detailLink = href;
      });

      const fullText = `${title} ${address} ${priceText}`;
      if (!isGauteng(fullText)) return;

      const price = extractPrice(priceText);
      if (price && price > MAX_PRICE) return;
      if (!price) return;

      const listingId = detailLink.match(/T(\d+)$/)?.[1] || "";
      const jsonLd = jsonLdMap.get(listingId);
      const sourceUrl = jsonLd?.sourceUrl || (detailLink ? `https://www.privateproperty.co.za${detailLink}` : undefined);

      let imageUrl = jsonLd?.imageUrl;
      if (!imageUrl) {
        const img = $el.find("img").first();
        const src = img.attr("data-src") || img.attr("data-original") || img.attr("src") || "";
        if (src.startsWith("http") && !src.includes("placeholder") && !src.endsWith(".svg")) {
          imageUrl = src;
        }
      }

      const beds = features[0] ? parseInt(features[0]) : extractBeds(title);
      const baths = features[1] ? parseInt(features[1]) : undefined;
      const sizeTxt = features.find(f => f.includes("m\u00b2") || f.match(/\d+\s*m/));
      const floorSize = sizeTxt ? extractSize(sizeTxt) : undefined;

      allListings.push({
        externalId: listingId || `pp-${allListings.length}`,
        source: "private_property",
        sourceUrl,
        title: title || "Private Property Listing",
        propertyType: "HOUSE",
        address: jsonLd?.address || address,
        suburb: jsonLd?.suburb || address.split(",")[0]?.trim(),
        city: extractCity(fullText),
        province: TARGET_PROVINCE,
        askingPrice: price,
        bedrooms: isNaN(beds as number) ? undefined : beds,
        bathrooms: isNaN(baths as number) ? undefined : baths,
        floorSize,
        imageUrl,
        auctionType: "SALE",
        auctioneer: "Private Property",
      });
    });

    // Strategy C: Also try older .featured-listing selector as fallback
    $(".featured-listing").each((_, el) => {
      const $el = $(el);
      const title = $el.find(".featured-listing__title").text().trim();
      const priceText = $el.find(".featured-listing__price").text().trim();
      const address = $el.find(".featured-listing__address").text().trim();

      let detailLink = "";
      $el.find("a[href]").each((_, a) => {
        const href = $(a).attr("href") || "";
        if (href.match(/\/T\d+$/) && !detailLink) detailLink = href;
      });

      const fullText = `${title} ${address} ${priceText}`;
      if (!isGauteng(fullText)) return;

      const price = extractPrice(priceText);
      if (price && price > MAX_PRICE) return;
      if (!price) return;

      const listingId = detailLink.match(/T(\d+)$/)?.[1] || "";
      const jsonLd = jsonLdMap.get(listingId);
      const sourceUrl = jsonLd?.sourceUrl || (detailLink ? `https://www.privateproperty.co.za${detailLink}` : undefined);
      const imageUrl = jsonLd?.imageUrl || getImageUrl($el, $);

      allListings.push({
        externalId: listingId || `pp-${allListings.length}`,
        source: "private_property",
        sourceUrl,
        title: title || "Private Property Listing",
        propertyType: "HOUSE",
        address: jsonLd?.address || address,
        suburb: jsonLd?.suburb || address.split(",")[0]?.trim(),
        city: extractCity(fullText),
        province: TARGET_PROVINCE,
        askingPrice: price,
        bedrooms: extractBeds(title),
        floorSize: extractSize(title),
        imageUrl,
        auctionType: "SALE",
        auctioneer: "Private Property",
      });
    });
  }

  return { source: "private_property", status: allListings.length > 0 ? "SUCCESS" : "PARTIAL", listings: dedup(allListings), durationMs: Date.now() - start, pagesScraped };
}

// ═══════════════════════════════════════════════════════════════
// ═══ 3. IOL PROPERTY — Houzez WordPress theme ════════════════
// ═══════════════════════════════════════════════════════════════

async function scrapeIOLProperty(): Promise<ScrapeResult> {
  const start = Date.now();
  const allListings: ScrapedListing[] = [];
  let pagesScraped = 0;

  // IOL Property uses Houzez theme with advanced search
  const urls = [
    "https://iolproperty.co.za/advanced-search-results-page/?keyword=gauteng&status%5B%5D=for-sale&min-price=0&max-price=450000",
    "https://iolproperty.co.za/advanced-search-results-page/?keyword=johannesburg&status%5B%5D=for-sale&min-price=0&max-price=450000",
    "https://iolproperty.co.za/advanced-search-results-page/?keyword=pretoria&status%5B%5D=for-sale&min-price=0&max-price=450000",
    "https://iolproperty.co.za/advanced-search-results-page/?keyword=soweto&status%5B%5D=for-sale&min-price=0&max-price=450000",
    "https://iolproperty.co.za/property-type/house/",
  ];

  for (const url of urls) {
    const { html, status } = await safeFetch(url);
    if (!html || status !== 200) continue;
    pagesScraped++;

    const $ = cheerio.load(html);

    // IOL uses .item-wrap .item-wrap-v1 blocks
    $(".item-wrap").each((_, el) => {
      const $el = $(el);

      // Price
      const priceText = $el.find(".item-price").first().text().trim();
      const price = extractPrice(priceText);

      // Skip rentals
      if (priceText.toLowerCase().includes("per month") || priceText.toLowerCase().includes("/pm")) return;
      if (price && price > MAX_PRICE) return;
      if (!price) return;

      // Title & link — from link to /property/slug/
      const titleLink = $el.find("a[href*='/property/']").first();
      const linkHref = titleLink.attr("href") || "";
      const title = titleLink.text().trim() || $el.find("h2, h3, h4").first().text().trim();

      // Location
      const location = $el.find(".item-address, .item-location, address").first().text().trim();

      const fullText = `${title} ${location} ${priceText}`;
      if (!isGauteng(fullText)) return;

      // Image — IOL uses direct img src in listing-thumb
      let imageUrl: string | undefined;
      const imgEl = $el.find(".listing-thumb img, .listing-image img, img").first();
      const imgSrc = imgEl.attr("src") || imgEl.attr("data-src") || imgEl.attr("data-lazy-src") || "";
      if (imgSrc.startsWith("http") && !imgSrc.endsWith(".svg") && !imgSrc.includes("placeholder")) {
        imageUrl = imgSrc;
      }
      // Also check data-listing_image on compare button
      if (!imageUrl) {
        const compareImg = $el.find("[data-listing_image]").attr("data-listing_image");
        if (compareImg?.startsWith("http")) imageUrl = compareImg;
      }

      // Features
      const features = $el.find(".item-amenities li, .hz-detail-desc").map((_, f) => $(f).text().trim()).get().join(" ");

      // Source URL — slug-based like /property/great-investment-property/
      const sourceUrl = linkHref.startsWith("http") ? linkHref : linkHref ? `https://iolproperty.co.za${linkHref}` : undefined;
      const idMatch = $el.find("[data-listid]").attr("data-listid");

      allListings.push({
        externalId: idMatch || linkHref.split("/").filter(Boolean).pop() || `iol-${allListings.length}`,
        source: "iol_property",
        sourceUrl,
        title: title || "IOL Property Listing",
        propertyType: "HOUSE",
        address: location,
        suburb: location.split(",")[0]?.trim(),
        city: extractCity(fullText),
        province: TARGET_PROVINCE,
        askingPrice: price,
        bedrooms: extractBeds(features + " " + title),
        bathrooms: extractBaths(features),
        floorSize: extractSize(features),
        imageUrl,
        auctionType: "SALE",
        auctioneer: "IOL Property",
      });
    });
  }

  return { source: "iol_property", status: allListings.length > 0 ? "SUCCESS" : "PARTIAL", listings: dedup(allListings), durationMs: Date.now() - start, pagesScraped };
}

// ═══════════════════════════════════════════════════════════════
// ═══ 4. MYROOF — Standard Bank Repossessed ═══════════════════
// ═══════════════════════════════════════════════════════════════

async function scrapeMyRoof(): Promise<ScrapeResult> {
  const start = Date.now();
  const allListings: ScrapedListing[] = [];
  let pagesScraped = 0;

  // MyRoof — Standard Bank Repossessed Auctions
  // Verified: 51 prop_list_item cards with data-mrno, data-original images
  const urls = [
    "https://www.myroof.co.za/Standard-Bank/Repossessed-Auctions?sort_by=cheap&province=Gauteng",
    "https://www.myroof.co.za/Standard-Bank/Repossessed-Auctions?sort_by=cheap&province=Gauteng&page=2",
    "https://www.myroof.co.za/Standard-Bank/Repossessed-Auctions?sort_by=cheap&province=Gauteng&page=3",
  ];

  for (const url of urls) {
    const { html, status } = await safeFetch(url);
    if (!html || status !== 200) continue;
    pagesScraped++;

    const $ = cheerio.load(html);

    $(".prop_list_item[data-mrno]").each((_, el) => {
      const $el = $(el);
      const mrNo = $el.attr("data-mrno") || "";

      // Title (suburb/area name)
      const title = $el.find(".prop_title").text().trim();

      // Price
      let priceText = $el.find(".prop_price_asking").text().trim();
      if (!priceText) priceText = $el.find(".prop_price").text().trim();
      const price = extractPrice(priceText);
      if (price && price > MAX_PRICE) return;

      // Link and title attribute with full location
      const propLink = $el.find("a.prop_link").first();
      const linkTitle = propLink.attr("title") || "";
      const linkHref = propLink.attr("href") || "";

      // The URL always has province=Gauteng, so all results are Gauteng
      const fullText = `${title} ${linkTitle} ${priceText} Gauteng`;

      // Image — lazy-load with data-original
      // <img class="lazy-load photo_thumb" src="/static/img/200x150.png" data-original="https://www.myroof.co.za/prop_static/MR237734/p/b/11096156.jpg">
      let imageUrl: string | undefined;
      const imgEl = $el.find("img.photo_thumb, img.lazy-load").first();
      const dataOriginal = imgEl.attr("data-original") || "";
      if (dataOriginal.startsWith("http")) {
        imageUrl = dataOriginal;
      } else {
        const src = imgEl.attr("src") || "";
        if (src.startsWith("http") && !src.includes("200x150.png") && !src.includes("placeholder")) {
          imageUrl = src;
        }
      }

      // Bed/bath/size from icon elements
      const bedText = $el.find(".prop_icon_bed").attr("title") || $el.find(".prop_icon_bed").text().trim();
      const beds = bedText ? parseInt(bedText.replace(/\D/g, "")) : undefined;
      const bathText = $el.find(".prop_icon_bath").attr("title") || $el.find(".prop_icon_bath").text().trim();
      const baths = bathText ? parseInt(bathText.replace(/\D/g, "")) : undefined;
      const sizeText = $el.find(".prop_icon_size").attr("title") || $el.find(".prop_icon_size").text().trim();
      const floorSize = sizeText ? extractSize(sizeText) : undefined;

      // Badges
      const badgeText = $el.find(".prop_badge").text().trim();
      const isAuctionClosed = badgeText.toLowerCase().includes("auction closed") || badgeText.toLowerCase().includes("in transaction");

      const sourceUrl = linkHref.startsWith("http") ? linkHref : `https://www.myroof.co.za${linkHref}`;

      // Extract suburb from link title like "for Sale in Klippoortjie AH, Gauteng"
      const locationMatch = linkTitle.match(/in\s+(.+?)(?:,|$)/i);
      const suburb = locationMatch?.[1]?.trim() || title;

      allListings.push({
        externalId: mrNo || `mr-${allListings.length}`,
        source: "myroof",
        sourceUrl,
        title: linkTitle || title || `Standard Bank Repo - ${mrNo}`,
        propertyType: "HOUSE",
        address: suburb,
        suburb,
        city: extractCity(fullText),
        province: TARGET_PROVINCE,
        askingPrice: price || 0,
        bedrooms: isNaN(beds as number) ? undefined : beds,
        bathrooms: isNaN(baths as number) ? undefined : baths,
        floorSize,
        imageUrl,
        auctionType: isAuctionClosed ? "BANK_REPO" : "AUCTION",
        auctioneer: "Standard Bank (MyRoof)",
        noReserve: false,
      });
    });
  }

  return { source: "myroof", status: allListings.length > 0 ? "SUCCESS" : "PARTIAL", listings: dedup(allListings), durationMs: Date.now() - start, pagesScraped };
}

// ═══════════════════════════════════════════════════════════════
// ═══ 5. IN2ASSETS — /main-auction page ═══════════════════════
// ═══════════════════════════════════════════════════════════════

async function scrapeIn2assets(): Promise<ScrapeResult> {
  const start = Date.now();
  const allListings: ScrapedListing[] = [];
  let pagesScraped = 0;

  const urls = [
    "https://www.in2assets.co.za/main-auction",
    "https://www.in2assets.co.za/",
  ];

  for (const url of urls) {
    const { html, status } = await safeFetch(url);
    if (!html || status !== 200) continue;
    pagesScraped++;

    const $ = cheerio.load(html);

    // Find property links
    const propertyLinks = new Set<string>();
    $("a[href*='/property/'], a[href*='/individual-auction/']").each((_, el) => {
      const href = $(el).attr("href") || "";
      if (href.includes("/property/") || href.includes("/individual-auction/")) {
        propertyLinks.add(href.startsWith("http") ? href : `https://www.in2assets.co.za${href}`);
      }
    });

    // Parse listing cards
    $(".property-card, .auction-card, [class*='featured-auction'], [class*='browse-auction'], .card, article").each((_, el) => {
      const $el = $(el);
      const text = $el.text().replace(/\s+/g, " ").trim();
      if (text.length < 20 || text.length > 3000) return;
      if (!isGauteng(text)) return;

      const priceEl = $el.find("[class*='price'], .price, .amount").first().text().trim();
      const price = extractPrice(priceEl) || extractPrice(text.match(/R\s*([\d\s,]+)/)?.[0] || "");
      if (price && price > MAX_PRICE) return;

      const title = $el.find("[class*='title'], h3, h4, h2").first().text().trim();
      const location = $el.find("[class*='location'], [class*='address']").first().text().trim();
      const link = $el.find("a[href*='/property/'], a[href*='/individual-auction/'], a").first().attr("href") || "";
      const dateText = $el.find("[class*='date']").first().text().trim();

      const sourceUrl = link.startsWith("http") ? link : `https://www.in2assets.co.za${link.startsWith("/") ? "" : "/"}${link}`;

      allListings.push({
        externalId: link.match(/\/(\d+)\//)?.[1] || `i2a-${allListings.length}`,
        source: "in2assets",
        sourceUrl,
        title: title || location || text.substring(0, 60),
        propertyType: "HOUSE",
        address: location || text.substring(0, 100),
        suburb: location.split(",")[0]?.trim(),
        city: extractCity(text),
        province: TARGET_PROVINCE,
        askingPrice: price || 0,
        bedrooms: extractBeds(text),
        bathrooms: extractBaths(text),
        floorSize: extractSize(text),
        imageUrl: getImageUrl($el, $),
        auctionDate: parseDate(dateText) ?? undefined,
        auctionType: "ONLINE",
        auctioneer: "In2assets",
      });
    });

    // Scrape individual property detail pages for Gauteng
    for (const propLink of [...propertyLinks].slice(0, 10)) {
      const { html: detailHtml } = await safeFetch(propLink);
      if (!detailHtml) continue;
      const $d = cheerio.load(detailHtml);
      const bodyText = $d("body").text().replace(/\s+/g, " ").trim();
      if (!isGauteng(bodyText)) continue;

      const detailTitle = $d("h1, h2").first().text().trim();
      const priceText = $d("[class*='price']").first().text().trim();
      const price = extractPrice(priceText);
      if (price && price > MAX_PRICE) continue;

      const location = $d("[class*='location'], [class*='address']").first().text().trim();

      allListings.push({
        externalId: propLink.match(/\/(\d+)\//)?.[1] || `i2a-d-${allListings.length}`,
        source: "in2assets",
        sourceUrl: propLink,
        title: detailTitle || "In2assets Auction Property",
        propertyType: "HOUSE",
        address: location,
        city: extractCity(bodyText),
        province: TARGET_PROVINCE,
        askingPrice: price || 0,
        bedrooms: extractBeds(bodyText),
        bathrooms: extractBaths(bodyText),
        floorSize: extractSize(bodyText),
        imageUrl: getImageUrl($d(".property-detail, .auction-detail, .lot-detail, main, .content, article, .container").first(), $d, "https://www.in2assets.co.za") || getImageUrl($d("body"), $d, "https://www.in2assets.co.za"),
        auctionType: "ONLINE",
        auctioneer: "In2assets",
      });
    }
  }

  return { source: "in2assets", status: allListings.length > 0 ? "SUCCESS" : "PARTIAL", listings: dedup(allListings), durationMs: Date.now() - start, pagesScraped };
}

// ═══════════════════════════════════════════════════════════════
// ═══ 6. AUCOR — /auctions/category/property-67 ═══════════════
// ═══════════════════════════════════════════════════════════════

async function scrapeAucor(): Promise<ScrapeResult> {
  const start = Date.now();
  const allListings: ScrapedListing[] = [];
  let pagesScraped = 0;

  const urls = [
    "https://www.aucor.com/auctions/category/property-67",
  ];

  for (const url of urls) {
    const { html, status } = await safeFetch(url);
    if (!html || status !== 200) continue;
    pagesScraped++;

    const $ = cheerio.load(html);

    // Aucor uses .views-row blocks with .node-auction class
    $(".views-row").each((_, el) => {
      const $el = $(el);
      const text = $el.text().replace(/\s+/g, " ").trim();
      if (text.length < 20) return;
      if (!isGauteng(text)) return;

      const title = $el.find(".field-name-title a, h2 a, h3 a").first().text().trim();
      const link = $el.find(".field-name-title a, h2 a, h3 a").first().attr("href") || "";
      const dateText = $el.find(".field-name-field-viewing-date").text().trim();
      const auctionDate = parseDate(dateText) ?? undefined;
      const venueText = text.match(/Venue:\s*([^.]+)/i)?.[1]?.trim() || "";

      const sourceUrl = link.startsWith("http") ? link : `https://www.aucor.com${link}`;

      allListings.push({
        externalId: link.match(/\d+$/)?.[1] || sourceUrl.split("/").pop() || `aucor-${allListings.length}`,
        source: "aucor_property",
        sourceUrl,
        title: title || "Aucor Property Auction",
        propertyType: "HOUSE",
        address: venueText,
        city: extractCity(text),
        province: TARGET_PROVINCE,
        askingPrice: 0,
        auctionDate,
        auctionVenue: venueText || undefined,
        auctionType: "AUCTION",
        auctioneer: "Aucor",
        imageUrl: getImageUrl($el, $),
      });
    });

    // Find individual auction links for detail scraping
    const auctionLinks = new Set<string>();
    $("a[href*='/auction/']").each((_, el) => {
      const href = $(el).attr("href") || "";
      if (href.includes("/auction/") && !href.includes("/category/")) {
        auctionLinks.add(href.startsWith("http") ? href : `https://www.aucor.com${href}`);
      }
    });

    for (const auctionLink of [...auctionLinks].slice(0, 10)) {
      const { html: detailHtml } = await safeFetch(auctionLink);
      if (!detailHtml) continue;
      const $d = cheerio.load(detailHtml);

      $d(".views-row, .lot-item, [class*='lot']").each((_, lotEl) => {
        const $lot = $d(lotEl);
        const lotText = $lot.text().replace(/\s+/g, " ").trim();
        if (lotText.length < 15) return;
        if (!isGauteng(lotText)) return;

        const lotTitle = $lot.find("h3, h4, a").first().text().trim();
        const lotLink = $lot.find("a").first().attr("href") || "";
        const priceMatch = lotText.match(/R\s*([\d\s,]+)/);
        const price = priceMatch ? parseInt(priceMatch[1]!.replace(/[\s,]/g, "")) : null;
        if (price && price > MAX_PRICE) return;

        const lotUrl = lotLink.startsWith("http") ? lotLink : `https://www.aucor.com${lotLink}`;

        allListings.push({
          externalId: lotLink.match(/\d+$/)?.[1] || `aucor-lot-${allListings.length}`,
          source: "aucor_property",
          sourceUrl: lotUrl,
          title: lotTitle || "Aucor Lot",
          propertyType: "HOUSE",
          address: lotText.substring(0, 100),
          city: extractCity(lotText),
          province: TARGET_PROVINCE,
          askingPrice: (price && price >= 1000) ? price : 0,
          auctionType: "AUCTION",
          auctioneer: "Aucor",
          imageUrl: getImageUrl($lot, $d),
        });
      });
    }
  }

  return { source: "aucor_property", status: allListings.length > 0 ? "SUCCESS" : "PARTIAL", listings: dedup(allListings), durationMs: Date.now() - start, pagesScraped };
}

// ═══════════════════════════════════════════════════════════════
// ═══ 7. HIGH STREET AUCTIONS ═════════════════════════════════
// ═══════════════════════════════════════════════════════════════

async function scrapeHighStreetAuctions(): Promise<ScrapeResult> {
  const start = Date.now();
  const allListings: ScrapedListing[] = [];
  let pagesScraped = 0;

  const urls = [
    "https://www.property.highstreetauctions.com/property-auctions-high-street-auctions.php?kw=main_auctions",
    "https://www.property.highstreetauctions.com/property-auctions-high-street-auctions.php?kw=multi_auctions",
    "https://www.highstreetauctions.com/",
  ];

  for (const url of urls) {
    const { html, status } = await safeFetch(url);
    if (!html || status !== 200) continue;
    pagesScraped++;

    const $ = cheerio.load(html);

    // Adaptive container detection
    const candidateSelectors = [
      ".property-card", ".property-item", ".auction-item", ".lot-card",
      ".listing-card", ".search-result", ".listing-item", "article", ".card",
      "[class*='property'][class*='card']", "[class*='auction'][class*='item']",
    ];

    let bestSelector = "";
    let bestCount = 0;
    for (const sel of candidateSelectors) {
      const count = $(sel).length;
      if (count > bestCount && count < 100) {
        bestCount = count;
        bestSelector = sel;
      }
    }

    if (bestSelector && bestCount > 0) {
      $(bestSelector).each((_, el) => {
        const $el = $(el);
        const text = $el.text().replace(/\s+/g, " ").trim();
        if (text.length < 15 || text.length > 3000) return;
        if (!isGauteng(text + " " + url)) return;

        const priceEl = $el.find("[class*='price'], .price, .amount").first().text().trim();
        const price = extractPrice(priceEl) || extractPrice(text.match(/R\s*([\d\s,]+)/)?.[0] || "");
        if (price && price > MAX_PRICE) return;
        if (!price || price < 1000) return;

        const title = $el.find("[class*='title'], h3, h4, h2").first().text().trim();
        const location = $el.find("[class*='location'], [class*='address']").first().text().trim();
        const link = $el.find("a").first().attr("href") || "";
        const sourceUrl = link.startsWith("http") ? link : `https://www.property.highstreetauctions.com${link.startsWith("/") ? "" : "/"}${link}`;

        allListings.push({
          externalId: link.match(/(\d+)$/)?.[1] || `hsa-${allListings.length}`,
          source: "highstreet_auctions",
          sourceUrl,
          title: title || location || text.substring(0, 60),
          propertyType: "HOUSE",
          address: location || text.substring(0, 100),
          city: extractCity(text),
          province: TARGET_PROVINCE,
          askingPrice: price,
          bedrooms: extractBeds(text),
          bathrooms: extractBaths(text),
          floorSize: extractSize(text),
          imageUrl: getImageUrl($el, $),
          auctionType: "AUCTION",
          auctioneer: "High Street Auctions",
        });
      });
    }

    // Fallback: extract property-related links
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      if (!href.match(/\/(?:property|lot|auction)\//i)) return;
      const container = $(el).closest("div, li, article");
      if (!container.length) return;
      const text = container.text().replace(/\s+/g, " ").trim();
      if (!isGauteng(text)) return;
      const priceMatch = text.match(/R\s*([\d\s,]+)/);
      const price = priceMatch ? parseInt(priceMatch[1]!.replace(/[\s,]/g, "")) : null;
      if (price && price > MAX_PRICE) return;
      if (!price || price < 1000) return;

      const fullUrl = href.startsWith("http") ? href : `https://www.highstreetauctions.com${href}`;
      allListings.push({
        externalId: href.match(/(\d+)$/)?.[1] || `hsa-ft-${allListings.length}`,
        source: "highstreet_auctions",
        sourceUrl: fullUrl,
        title: text.substring(0, 80),
        propertyType: "HOUSE",
        address: text.substring(0, 100),
        city: extractCity(text),
        province: TARGET_PROVINCE,
        askingPrice: price,
        imageUrl: getImageUrl(container, $, "https://www.highstreetauctions.com"),
        auctionType: "AUCTION",
        auctioneer: "High Street Auctions",
      });
    });
  }

  return { source: "highstreet_auctions", status: allListings.length > 0 ? "SUCCESS" : "PARTIAL", listings: dedup(allListings), durationMs: Date.now() - start, pagesScraped };
}

// ═══════════════════════════════════════════════════════════════
// ═══ 8. SHERIFFHQ — requires login, scrapes city pages ═══════
// ═══════════════════════════════════════════════════════════════

async function scrapeSheriffHQ(): Promise<ScrapeResult> {
  const start = Date.now();
  const allListings: ScrapedListing[] = [];
  let pagesScraped = 0;

  // Try auto-login with email/password, fall back to cookies env var
  let cookies = process.env.SHERIFFHQ_COOKIES || "";
  if (!cookies) {
    const email = process.env.SHERIFFHQ_EMAIL || "";
    const password = process.env.SHERIFFHQ_PASSWORD || "";
    if (email && password) {
      cookies = await loginSheriffHQ(email, password) || "";
      if (!cookies) {
        return {
          source: "sheriffhq",
          status: "FAILED",
          listings: [],
          error: "Auto-login failed — check SHERIFFHQ_EMAIL and SHERIFFHQ_PASSWORD",
          durationMs: Date.now() - start,
        };
      }
    } else {
      return {
        source: "sheriffhq",
        status: "PARTIAL",
        listings: [],
        error: "Login required — set SHERIFFHQ_EMAIL + SHERIFFHQ_PASSWORD in .env",
        durationMs: Date.now() - start,
      };
    }
  }

  // Step 1: Fetch the Gauteng province page to discover city links
  const { html: provHtml, status: provStatus } = await safeFetch(
    "https://www.sheriffhq.co.za/Auctions/Gauteng",
    { cookies },
  );

  // Extract city names from /Auctions/City/{CityName} links
  let cities: string[] = [];
  if (provHtml && provStatus === 200) {
    pagesScraped++;
    const $prov = cheerio.load(provHtml);
    $prov('a[href*="/Auctions/City/"]').each((_, el) => {
      const href = $prov(el).attr("href") || "";
      const cityMatch = href.match(/\/Auctions\/City\/([^/?#]+)/);
      if (cityMatch && cityMatch[1]) cities.push(cityMatch[1] as string);
    });
    cities = [...new Set(cities)];
  }

  // Fallback: hardcoded major Gauteng cities (top 10 for speed)
  if (cities.length === 0) {
    cities = [
      "Johannesburg", "Pretoria", "Sandton", "Centurion", "KemptonPark",
      "Randburg", "Roodepoort", "Soweto", "Benoni", "Boksburg",
    ];
  }

  // Limit to top 10 cities for speed (each city page = 1 HTTP request + parsing)
  const citiesToScrape = cities.slice(0, 10);

  // Step 2: Scrape each city page for listing detail links (in parallel batches of 3)
  // City pages have: <a class="property-address" href="/Auction/Details/{id}">
  //   <span>Street</span><span> - </span><span>Suburb</span>
  // </a>
  // <div class="font-14 d-md-inline">X bedrooms, Y bathrooms</div>
  const detailLinksSet = new Set<string>();
  const listingIndex: { id: string; address: string; beds: number; baths: number; city: string }[] = [];

  const CITY_BATCH = 3;
  for (let b = 0; b < citiesToScrape.length; b += CITY_BATCH) {
    const cityBatch = citiesToScrape.slice(b, b + CITY_BATCH);
    const batchResults = await Promise.allSettled(
      cityBatch.map(async (city) => {
        const { html: cityHtml, status: cityStatus } = await safeFetch(
          `https://www.sheriffhq.co.za/Auctions/City/${city}`,
          { cookies },
        );
        return { city, cityHtml, cityStatus };
      }),
    );
    for (const result of batchResults) {
      if (result.status !== "fulfilled") continue;
      const { city, cityHtml, cityStatus } = result.value;
      if (!cityHtml || cityStatus !== 200) continue;
      pagesScraped++;

      const $c = cheerio.load(cityHtml);
      const cityName = city.replace(/([a-z])([A-Z])/g, "$1 $2");

      $c("a.property-address").each((_, el) => {
      const href = $c(el).attr("href") || "";
      const idMatch = href.match(/\/Auction\/Details\/(\d+)/);
      if (!idMatch || !idMatch[1]) return;
      const id: string = idMatch[1]!;
      if (detailLinksSet.has(id)) return;
      detailLinksSet.add(id);

      // Address from <span> children
      const spans = $c(el).find("span");
      const addressParts: string[] = [];
      spans.each((_, s) => {
        const t = $c(s).text().trim();
        if (t && t !== "-" && t !== ",") addressParts.push(t);
      });
      const address = addressParts.join(", ");

      // Bedrooms/bathrooms from sibling div
      const infoDiv = $c(el).closest(".col-9, .col-12").find(".font-14").first().text().trim();
      const bedsMatch = infoDiv.match(/(\d+)\s*bedroom/i);
      const bathsMatch = infoDiv.match(/(\d+)\s*bathroom/i);

      listingIndex.push({
        id,
        address,
        beds: bedsMatch?.[1] ? parseInt(bedsMatch[1]!) : 0,
        baths: bathsMatch?.[1] ? parseInt(bathsMatch[1]!) : 0,
        city: cityName,
      });
    });
    }
  }

  // Step 3: Visit detail pages for richer data (limit to 20 to keep scan fast)
  const maxDetail = 20;
  const toVisit = listingIndex.slice(0, maxDetail);

  for (const item of toVisit) {
    const detailUrl = `https://www.sheriffhq.co.za/Auction/Details/${item.id}`;
    const { html: detailHtml } = await safeFetch(detailUrl, { cookies });
    if (!detailHtml) {
      // Still add the basic listing from the city page
      allListings.push({
        externalId: item.id,
        source: "sheriffhq",
        sourceUrl: detailUrl,
        title: item.address || "Sheriff Sale",
        description: `Sheriff sale in ${item.city}`,
        propertyType: "HOUSE",
        address: item.address,
        city: item.city,
        province: TARGET_PROVINCE,
        askingPrice: 0,
        bedrooms: item.beds || undefined,
        bathrooms: item.baths || undefined,
        auctionType: "SHERIFF",
        auctioneer: "Sheriff of the Court",
      });
      continue;
    }
    pagesScraped++;

    const $d = cheerio.load(detailHtml);
    const pageText = $d("body").text().replace(/\s+/g, " ").trim();

    // Title from <title> tag — e.g. "3 Dieter Street, Birchleigh North Ext 2"
    const titleTag = $d("title").text().trim();
    const detailTitle = titleTag || item.address || "Sheriff Sale Property";

    // Reserve info — look for "No Reserve" or "Reserve Price" badge
    const noReserve = detectNoReserve(pageText);

    // Municipal valuation — look for "Municipal Val." value
    const munValMatch = pageText.match(/Municipal\s*Val\.?\s*R?([\d,. ]+)/i);
    const municipalVal = munValMatch ? (extractPrice(`R${munValMatch[1]}`) ?? 0) : 0;

    // Reserve price (from "Reserve Price" section, or opening bid)
    const reserveMatch = pageText.match(/Reserve\s*Price\s*R?([\d,. ]+)/i);
    const askingPrice: number = reserveMatch ? (extractPrice(`R${reserveMatch[1]}`) ?? 0) : municipalVal;

    // Case number
    const caseNumber = extractCaseNumber(pageText);
    const courtDivision = extractCourtDivision(pageText);

    // Auction date — look for "Auction Date X Mon YYYY HH:MM"
    const auctionDateMatch = pageText.match(/Auction\s*Date\s*(\d{1,2}\s+\w+\s+\d{4})/i);
    const auctionDate = auctionDateMatch?.[1] ? parseDate(auctionDateMatch[1]!) ?? undefined : parseDate(pageText) ?? undefined;

    // Auction time
    const timeMatch = pageText.match(/Auction\s*Date\s*\d{1,2}\s+\w+\s+\d{4}\s+(\d{1,2}:\d{2})/i);
    const auctionTime = timeMatch?.[1];

    // Venue — "held ... at ..."
    const venueMatch = pageText.match(/(?:held at|venue|at the offices of|SHERIFF\s+OF\s+THE\s+(?:HIGH\s*COURT|MAGISTRATE))\s*([^,.\d]{5,80})/i);
    const auctionVenue = venueMatch?.[1]?.trim();

    // Erf size — look for "Xm²" pattern
    const erfMatch = pageText.match(/(\d[\d,]*)\s*m[²2]/i);
    const erfSize = erfMatch ? extractErf(erfMatch[0]) : extractErf(pageText);

    // Bedrooms/bathrooms from detail page or fall back to city page
    const beds = extractBeds(pageText) || item.beds || undefined;
    const baths = extractBaths(pageText) || item.baths || undefined;

    // Address from detail page
    const addressFromDetail = $d(".property-address, [class*='ADDRESS']").first().text().trim();

    allListings.push({
      externalId: item.id,
      source: "sheriffhq",
      sourceUrl: detailUrl,
      title: detailTitle,
      description: pageText.substring(0, 500),
      propertyType: "HOUSE",
      address: addressFromDetail || item.address || extractCity(pageText),
      city: item.city || extractCity(pageText),
      province: TARGET_PROVINCE,
      askingPrice,
      bedrooms: beds,
      bathrooms: baths,
      erfSize,
      noReserve,
      caseNumber,
      courtDivision,
      auctionDate,
      auctionTime,
      auctionVenue,
      auctionType: "SHERIFF",
      auctioneer: "Sheriff of the Court",
      imageUrl: getImageUrl($d(".container, .content, main, #content").first(), $d, "https://www.sheriffhq.co.za") || getImageUrl($d("body"), $d, "https://www.sheriffhq.co.za"),
    });
  }

  // Add remaining listings (beyond maxDetail) with basic info only — cap at 30 overflow
  const maxOverflow = 30;
  for (const item of listingIndex.slice(maxDetail, maxDetail + maxOverflow)) {
    allListings.push({
      externalId: item.id,
      sourceUrl: `https://www.sheriffhq.co.za/Auction/Details/${item.id}`,
      source: "sheriffhq",
      title: item.address || "Sheriff Sale",
      description: `Sheriff auction in ${item.city}`,
      propertyType: "HOUSE",
      address: item.address,
      city: item.city,
      province: TARGET_PROVINCE,
      askingPrice: 0,
      bedrooms: item.beds || undefined,
      bathrooms: item.baths || undefined,
      auctionType: "SHERIFF",
      auctioneer: "Sheriff of the Court",
    });
  }

  return { source: "sheriffhq", status: allListings.length > 0 ? "SUCCESS" : (cookies ? "PARTIAL" : "FAILED"), listings: dedup(allListings), durationMs: Date.now() - start, pagesScraped };
}

// ═══════════════════════════════════════════════════════════════
// ═══ 9. BROLL — Commercial property via __NEXT_DATA__ JSON ═══
// ═══════════════════════════════════════════════════════════════

async function scrapeBroll(): Promise<ScrapeResult> {
  const start = Date.now();
  const allListings: ScrapedListing[] = [];
  let pagesScraped = 0;

  try {
    const { html, status } = await safeFetch("https://www.broll.com/");
    if (!html || status !== 200) {
      return { source: "broll", status: "FAILED", listings: [], error: `Status ${status}`, durationMs: Date.now() - start };
    }
    pagesScraped++;

    // Broll is a Next.js app — property data is embedded in __NEXT_DATA__
    const ndMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (!ndMatch?.[1]) {
      return { source: "broll", status: "FAILED", listings: [], error: "No __NEXT_DATA__ found", durationMs: Date.now() - start };
    }

    let data: any;
    try { data = JSON.parse(ndMatch[1]); } catch { return { source: "broll", status: "FAILED", listings: [], error: "JSON parse error", durationMs: Date.now() - start }; }

    const offerings = data?.props?.pageProps?.featuredOfferingsList || [];
    for (const item of offerings) {
      const city = item.city || "";
      const province = item.province || "";
      const suburb = item.suburb || item.cluster || "";
      const fullLoc = `${city} ${province} ${suburb}`;
      if (!isGauteng(fullLoc)) continue;

      // Build URL from slug
      const dealType = item.dealType === "ForSale" ? "for-sale" : "to-let";
      const category = (item.property_category || "commercial").toLowerCase();
      const slug = item.property_slug || item.unit_slug || "";
      const sourceUrl = slug ? `https://www.broll.com/${dealType}/${category}/${slug}` : "https://www.broll.com/search";

      // Price — gross_price is the TOTAL asking price in ZAR. Earlier code
      // multiplied it by GLA assuming it was per-sqm, which produced absurd
      // multi-billion-rand figures. Treat as total; clamp implausible outliers.
      const rawPrice = Number(item.gross_price) || Number(item.min_price) || 0;
      const gla = Number(item.max_gla) || Number(item.min_gla) || Number(item.total_property_gla) || 0;
      // Sanity cap: nothing in SA distressed market exceeds R500M.
      const totalPrice = rawPrice > 500_000_000 ? 0 : rawPrice;

      const propName = item.property_name || "Broll Property";
      const address = item.street_address || "";

      allListings.push({
        externalId: item.objectID || item.web_ref || `broll-${allListings.length}`,
        source: "broll",
        sourceUrl,
        title: propName,
        description: `${propName} — ${category} ${dealType.replace("-", " ")} in ${suburb || city}`,
        propertyType: category.toUpperCase(),
        address,
        suburb,
        city: extractCity(fullLoc) || city,
        province: province || TARGET_PROVINCE,
        askingPrice: totalPrice,
        floorSize: gla > 0 ? gla : undefined,
        erfSize: item.total_erf_extent || undefined,
        imageUrl: item.best_image || (item.property_images?.length ? item.property_images[0] : undefined),
        auctionType: "SALE",
      });
    }
  } catch (err) {
    return { source: "broll", status: "FAILED", listings: [], error: String(err), durationMs: Date.now() - start };
  }

  return { source: "broll", status: allListings.length > 0 ? "SUCCESS" : "PARTIAL", listings: dedup(allListings), durationMs: Date.now() - start, pagesScraped };
}

// ═══════════════════════════════════════════════════════════════
// ═══ 10. BIDX1 — SA auction properties via HTML cards ════════
// ═══════════════════════════════════════════════════════════════

async function scrapeBidX1(): Promise<ScrapeResult> {
  const start = Date.now();
  const allListings: ScrapedListing[] = [];
  let pagesScraped = 0;

  const urls = [
    "https://www.bidx1.com/en/south-africa",
    "https://www.bidx1.com/en/south-africa/property-for-auction",
  ];

  for (const url of urls) {
    try {
      const { html, status } = await safeFetch(url);
      if (!html || status !== 200) continue;
      pagesScraped++;

      const $ = cheerio.load(html);

      // BidX1 uses Bootstrap cards with class "card property-card"
      $(".card.property-card, [class*='property-card']").each((_, el) => {
        const $el = $(el);
        const text = $el.text().replace(/\s+/g, " ").trim();
        if (text.length < 10) return;

        // Link
        const link = $el.find("a[href*='/auction/property/']").first().attr("href") || $el.find("a").first().attr("href") || "";
        const sourceUrl = link.startsWith("http") ? link : `https://www.bidx1.com${link}`;

        // Title
        const title = $el.find("[class*='title'], h3, h4, h5, .card-title").first().text().trim() || "BidX1 Auction Property";

        // Address / location
        const address = $el.find("[class*='address'], [class*='location'], .card-text").first().text().trim();

        // Price — look for guide price / reserve
        const priceText = $el.find("[class*='price'], [class*='guide']").first().text().trim();
        const price = extractPrice(priceText);

        // Image
        const img = $el.find("img").first();
        const imageUrl = img.attr("src") || img.attr("data-src") || undefined;

        // Status label (e.g. "For Sale", "Sold", "Under Offer")
        const statusLabel = $el.find("[class*='status-label']").text().trim().toLowerCase();

        // Extract ID from link
        const idMatch = link.match(/property\/(\d+)/);

        // Include Gauteng or unlocated properties
        const fullText = `${text} ${address}`;

        if (isGauteng(fullText) || !address) {
          allListings.push({
            externalId: idMatch?.[1] || `bidx1-${allListings.length}`,
            source: "bidx1",
            sourceUrl,
            title,
            description: text.substring(0, 300),
            propertyType: "HOUSE",
            address,
            city: extractCity(fullText) || "Gauteng",
            province: TARGET_PROVINCE,
            askingPrice: price || 0,
            imageUrl: imageUrl?.startsWith("http") ? imageUrl : imageUrl ? `https://www.bidx1.com${imageUrl}` : undefined,
            auctionType: statusLabel.includes("sold") || statusLabel.includes("under offer") ? "SOLD" : "ONLINE_AUCTION",
            bedrooms: extractBeds(text),
            bathrooms: extractBaths(text),
            floorSize: extractSize(text),
          });
        }
      });
    } catch { /* skip URL errors */ }
  }

  return { source: "bidx1", status: allListings.length > 0 ? "SUCCESS" : "PARTIAL", listings: dedup(allListings), durationMs: Date.now() - start, pagesScraped };
}

// ═══════════════════════════════════════════════════════════════
// ═══ 11. AUCTION INC — auctioninc.co.za ═════════════════════
// ═══════════════════════════════════════════════════════════════

async function scrapeAuctionInc(): Promise<ScrapeResult> {
  const start = Date.now();
  const allListings: ScrapedListing[] = [];
  let pagesScraped = 0;

  try {
    // Start with homepage which has featured properties
    const { html, status } = await safeFetch("https://www.auctioninc.co.za/");
    if (!html || status !== 200) {
      return { source: "auction_inc", status: "FAILED", listings: [], error: `Status ${status}`, durationMs: Date.now() - start };
    }
    pagesScraped++;

    const $ = cheerio.load(html);

    // Find all property links on the page
    const propLinks = new Set<string>();
    $("a[href*='propertyinfo.aspx']").each((_, el) => {
      const href = $(el).attr("href") || "";
      if (href) propLinks.add(href.startsWith("http") ? href : `https://www.auctioninc.co.za${href}`);
    });

    // Also find auction date pages to scrape for more properties
    const auctionPages = new Set<string>();
    $("a[href*='auctions.aspx?date=']").each((_, el) => {
      const href = $(el).attr("href") || "";
      if (href) auctionPages.add(href.startsWith("http") ? href : `https://www.auctioninc.co.za${href}`);
    });

    // Scrape auction date pages for more property links
    for (const auctionUrl of [...auctionPages].slice(0, 5)) {
      const { html: aucHtml } = await safeFetch(auctionUrl);
      if (!aucHtml) continue;
      pagesScraped++;
      const $a = cheerio.load(aucHtml);
      $a("a[href*='propertyinfo.aspx']").each((_, el) => {
        const href = $a(el).attr("href") || "";
        if (href) propLinks.add(href.startsWith("http") ? href : `https://www.auctioninc.co.za${href}`);
      });
    }

    // Extract data for each property from homepage cards
    // Properties appear in blocks with images and details
    $("a[href*='propertyinfo.aspx']").each((_, el) => {
      const $el = $(el);
      const href = $el.attr("href") || "";
      const sourceUrl = href.startsWith("http") ? href : `https://www.auctioninc.co.za${href}`;
      const idMatch = href.match(/prpID=(\d+)/);

      // Get surrounding context for location and price
      const $parent = $el.closest(".multipropcard, .propcard, .row, .col-md-4, .col-md-6, .col-lg-4, div");
      const parentText = $parent.text().replace(/\s+/g, " ").trim();

      // Image from sibling img tag
      const img = $el.find("img").first();
      let imageUrl = img.attr("src") || "";
      if (!imageUrl) {
        const siblingImg = $parent.find("img").first();
        imageUrl = siblingImg.attr("src") || "";
      }
      if (imageUrl && !imageUrl.startsWith("http")) {
        imageUrl = `https://www.auctioninc.co.za${imageUrl}`;
      }

      // Price
      const priceMatch = parentText.match(/R[\s]*([\d,\s]+)/);
      const price = priceMatch ? extractPrice(`R${priceMatch[1]}`) : null;

      // Title from img alt or parent text
      const title = img.attr("alt") || $parent.find("h3, h4, h5, .title, strong").first().text().trim() || "Auction Inc Property";

      // Location from parent text
      if (isGauteng(parentText) || !parentText.includes(",")) {
        allListings.push({
          externalId: idMatch?.[1] || `aucinc-${allListings.length}`,
          source: "auction_inc",
          sourceUrl,
          title: title.replace(/^Property Auction Date:.*$/i, "").trim() || "Auction Inc Property",
          description: parentText.substring(0, 300),
          propertyType: "HOUSE",
          city: extractCity(parentText) || "Gauteng",
          province: TARGET_PROVINCE,
          askingPrice: price || 0,
          imageUrl: imageUrl || undefined,
          auctionDate: parseDate(parentText) ?? undefined,
          auctionType: "LIVE_AUCTION",
          auctioneer: "Auction Inc",
          bedrooms: extractBeds(parentText),
          bathrooms: extractBaths(parentText),
          floorSize: extractSize(parentText),
          erfSize: extractErf(parentText),
        });
      }
    });
  } catch (err) {
    return { source: "auction_inc", status: "FAILED", listings: [], error: String(err), durationMs: Date.now() - start };
  }

  return { source: "auction_inc", status: allListings.length > 0 ? "SUCCESS" : "PARTIAL", listings: dedup(allListings), durationMs: Date.now() - start, pagesScraped };
}

// ═══════════════════════════════════════════════════════════════
// ═══ 12. REALNET — realnet.co.za residential listings ════════
// ═══════════════════════════════════════════════════════════════

async function scrapeRealnet(): Promise<ScrapeResult> {
  const start = Date.now();
  const allListings: ScrapedListing[] = [];
  let pagesScraped = 0;

  const urls = [
    `https://www.realnet.co.za/results/residential/for-sale/?province=Gauteng&max_price=${MAX_PRICE}`,
    `https://www.realnet.co.za/results/residential/for-sale/?province=Gauteng&max_price=${MAX_PRICE}&page=2`,
  ];

  for (const url of urls) {
    try {
      const { html, status } = await safeFetch(url);
      if (!html || status !== 200) continue;
      pagesScraped++;

      const $ = cheerio.load(html);

      // Realnet uses .property-list-listing cards with data-href attribute
      $(".property-list-listing, [class*='property-list-listing']").each((_, el) => {
        const $el = $(el);
        const text = $el.text().replace(/\s+/g, " ").trim();

        // Link from data-href attribute
        const dataHref = $el.attr("data-href") || "";
        const link = $el.find("a").first().attr("href") || dataHref;
        const sourceUrl = link.startsWith("http") ? link : `https://www.realnet.co.za${link}`;

        // Price from itemprop="price" or .property-list-price-heading
        const priceText = $el.find("[itemprop='price'], .property-list-price-heading").first().text().trim();
        const price = extractPrice(priceText);

        // Skip if over max price
        if (price && price > MAX_PRICE) return;

        // Image
        const img = $el.find(".property-list-image-thumb img, img[itemprop='image']").first();
        const imageUrl = img.attr("src") || img.attr("data-src") || undefined;

        // Title from alt text or heading
        const title = img.attr("alt") || $el.find("h3, h4, .property-list-title").first().text().trim() || "Realnet Property";

        // Address
        const address = $el.find(".property-list-address, [itemprop='address']").first().text().trim();

        // Property type from data-model attribute
        const model = $el.attr("data-model") || "residential";

        // Extract ID
        const idMatch = $el.attr("data-id") || link.match(/\/(\d+)\/?$/)?.[1];

        // Location check
        const fullText = `${text} ${address}`;
        if (!isGauteng(fullText)) return;

        allListings.push({
          externalId: (typeof idMatch === "string" ? idMatch : idMatch) || `realnet-${allListings.length}`,
          source: "realnet",
          sourceUrl,
          title,
          description: text.substring(0, 300),
          propertyType: model.toUpperCase(),
          address,
          city: extractCity(fullText),
          province: TARGET_PROVINCE,
          askingPrice: price || 0,
          imageUrl: imageUrl?.startsWith("http") ? imageUrl : imageUrl ? `https://www.realnet.co.za${imageUrl}` : undefined,
          bedrooms: extractBeds(text),
          bathrooms: extractBaths(text),
          floorSize: extractSize(text),
          erfSize: extractErf(text),
          auctionType: "SALE",
        });
      });
    } catch { /* skip page errors */ }
  }

  return { source: "realnet", status: allListings.length > 0 ? "SUCCESS" : "PARTIAL", listings: dedup(allListings), durationMs: Date.now() - start, pagesScraped };
}

// ═══════════════════════════════════════════════════════════════
// ═══ 13. SA SHERIFF — sasheriff.co.za (login required) ═══════
// ═══════════════════════════════════════════════════════════════

async function scrapeSASheriff(): Promise<ScrapeResult> {
  const start = Date.now();
  const allListings: ScrapedListing[] = [];
  let pagesScraped = 0;

  // Try auto-login with email/password, fall back to cookies env var
  let cookies = process.env.SASHERIFF_COOKIES || "";
  if (!cookies) {
    const email = process.env.SASHERIFF_EMAIL || "";
    const password = process.env.SASHERIFF_PASSWORD || "";
    if (email && password) {
      cookies = await loginSASheriff(email, password) || "";
    }
  }

  // SA Sheriff has a search that works without login for basic results
  // The POST endpoint is /SheriffAuctionList.asp with SCH=Gauteng&CID=1
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Content-Type": "application/x-www-form-urlencoded",
    };
    if (cookies) headers["Cookie"] = cookies;

    const res = await fetch("https://www.sasheriff.co.za/SheriffAuctionList.asp", {
      method: "POST",
      headers,
      body: "SCH=Gauteng&CID=1",
      signal: controller.signal,
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { source: "sa_sheriff", status: "FAILED", listings: [], error: `Status ${res.status}`, durationMs: Date.now() - start };
    }

    const html = await res.text();
    pagesScraped++;
    const $ = cheerio.load(html);

    // SA Sheriff results use AContainer/AListHead structure
    // Each listing has: case number in bold, View Property button with auction link
    $(".AContainer, [class*='AContainer']").each((_, el) => {
      const $el = $(el);
      const text = $el.text().replace(/\s+/g, " ").trim();
      if (text.length < 20) return;

      // Case number from heading
      const heading = $el.find(".AListHead b, .AListHead strong").first().text().trim();
      const caseNumber = extractCaseNumber(heading) || extractCaseNumber(text);

      // View Property link
      const link = $el.find("a[href*='aup'], a:contains('View')").first().attr("href") || "";
      const sourceUrl = link
        ? `https://www.sasheriff.co.za${link.replace(/\\/g, "/")}`
        : "https://www.sasheriff.co.za/sheriffauctions.asp";

      // Price from text
      const price = extractPrice(text);
      const noReserve = detectNoReserve(text);

      // Auction date
      const auctionDate = parseDate(text) ?? undefined;

      // Extract court division
      const courtDivision = extractCourtDivision(text);

      // Title
      const title = heading || `Sheriff Auction ${caseNumber || ""}`.trim();

      allListings.push({
        externalId: caseNumber || link.match(/aup(\d+)/)?.[1] || `sasheriff-${allListings.length}`,
        source: "sa_sheriff",
        sourceUrl,
        title,
        description: text.substring(0, 500),
        propertyType: "HOUSE",
        city: extractCity(text) || "Gauteng",
        province: TARGET_PROVINCE,
        askingPrice: price || 0,
        noReserve,
        caseNumber,
        courtDivision,
        auctionDate,
        auctionType: "SHERIFF",
        auctioneer: "Sheriff of the Court",
        imageUrl: getImageUrl($el, $, "https://www.sasheriff.co.za"),
      });
    });

    // Also try scraping individual listings from detail links
    const detailLinks = new Set<string>();
    $("a[href*='aup']").each((_, el) => {
      const href = $(el).attr("href") || "";
      if (href) detailLinks.add(href.replace(/\\/g, "/"));
    });

    for (const detailPath of [...detailLinks].slice(0, 10)) {
      const detailUrl = `https://www.sasheriff.co.za${detailPath}`;
      const { html: detailHtml } = await safeFetch(detailUrl, cookies ? { cookies } : undefined);
      if (!detailHtml) continue;
      pagesScraped++;

      const $d = cheerio.load(detailHtml);
      const bodyText = $d("body").text().replace(/\s+/g, " ").trim();
      if (!isGauteng(bodyText)) continue;

      const detailTitle = $d("h1, h2, h3, [class*='title']").first().text().trim();
      const caseNum = extractCaseNumber(bodyText);
      const court = extractCourtDivision(bodyText);
      const auctDate = parseDate(bodyText) ?? undefined;
      const detailPrice = extractPrice(bodyText.match(/R\s*[\d,\s]+/)?.[0] || "");
      const noRes = detectNoReserve(bodyText);
      const erfSize = extractErf(bodyText);

      allListings.push({
        externalId: caseNum || detailPath.match(/aup(\d+)/)?.[1] || `sasheriff-d-${allListings.length}`,
        source: "sa_sheriff",
        sourceUrl: detailUrl,
        title: detailTitle || `Sheriff Sale ${caseNum || ""}`.trim(),
        description: bodyText.substring(0, 500),
        propertyType: "HOUSE",
        city: extractCity(bodyText),
        province: TARGET_PROVINCE,
        askingPrice: detailPrice || 0,
        noReserve: noRes,
        caseNumber: caseNum,
        courtDivision: court,
        auctionDate: auctDate,
        erfSize,
        auctionType: "SHERIFF",
        auctioneer: "Sheriff of the Court",
        imageUrl: getImageUrl($d(".AContainer, .content, main, #content").first(), $d, "https://www.sasheriff.co.za") || getImageUrl($d("body"), $d, "https://www.sasheriff.co.za"),
      });
    }
  } catch (err) {
    return { source: "sa_sheriff", status: "FAILED", listings: [], error: String(err), durationMs: Date.now() - start };
  }

  return { source: "sa_sheriff", status: allListings.length > 0 ? "SUCCESS" : "PARTIAL", listings: dedup(allListings), durationMs: Date.now() - start, pagesScraped };
}

// ═══════════════════════════════════════════════════════════════════
// ═══ 14. STUDENT ACCOMMODATION — Investment Properties FOR SALE ═══
// ═══════════════════════════════════════════════════════════════════

async function scrapeStudentAccommodation(): Promise<ScrapeResult> {
  const start = Date.now();
  const allListings: ScrapedListing[] = [];
  let pagesScraped = 0;

  // ─── We want student accommodation BUILDINGS FOR SALE as investment ───
  // These are multi-bed properties (e.g. 24 beds for R2M) near universities.
  // No price cap — looking for bargain investment deals.

  // ─── Property24: Student accommodation FOR SALE ────────────
  // Property24 has a "student accommodation" property type under for-sale.
  // Also search for large rooming houses / multi-unit properties near universities.
  const studentP24Urls = [
    // Student accommodation for sale — Gauteng (no price cap)
    "https://www.property24.com/for-sale/gauteng/2?PropertyType=StudentAccommodation",
    "https://www.property24.com/for-sale/gauteng/2?PropertyType=StudentAccommodation&Page=2",
    "https://www.property24.com/for-sale/johannesburg/gauteng/100?PropertyType=StudentAccommodation",
    "https://www.property24.com/for-sale/pretoria/gauteng/469?PropertyType=StudentAccommodation",
    "https://www.property24.com/for-sale/centurion/gauteng/1564?PropertyType=StudentAccommodation",
    // Rooming house / guest house for sale (often used as student digs)
    "https://www.property24.com/for-sale/gauteng/2?PropertyType=RoomingHouse",
    "https://www.property24.com/for-sale/gauteng/2?PropertyType=GuestHouse",
    // Commercial properties near university areas — may include student accommodation
    "https://www.property24.com/for-sale/braamfontein/johannesburg/gauteng/15421",
    "https://www.property24.com/for-sale/auckland-park/johannesburg/gauteng/15389",
    "https://www.property24.com/for-sale/hatfield/pretoria/gauteng/15576",
    "https://www.property24.com/for-sale/sunnyside/pretoria/gauteng/15643",
  ];

  for (const url of studentP24Urls) {
    try {
      const { html, status } = await safeFetch(url);
      if (!html || status !== 200) continue;
      pagesScraped++;

      const $ = cheerio.load(html);

      $(".p24_regularTile").each((_, el) => {
        const $el = $(el);
        const title = $el.find(".p24_title").text().trim();
        const priceText = $el.find(".p24_price").text().trim();
        const location = $el.find(".p24_location").text().trim();
        const address = $el.find(".p24_address").text().trim();
        const linkHref = $el.find("a").first().attr("href") || "";
        const featureText = $el.find(".p24_featureDetails").text();

        let imageUrl: string | undefined;
        $el.find("img.js_P24_listingImage, img.js_lazyLoadImage, img[src*='images.prop24.com']").each((_, imgEl) => {
          if (imageUrl) return;
          const src = $(imgEl).attr("src") || "";
          if (src.startsWith("https://images.prop24.com/") && !src.includes("Logo")) {
            imageUrl = src.replace(/Crop\d+x\d+/, "Crop528x351");
          }
        });
        if (!imageUrl) {
          $el.find("img").each((_, imgEl) => {
            if (imageUrl) return;
            const src = $(imgEl).attr("data-original") || $(imgEl).attr("data-src") || "";
            if (src.startsWith("http") && src.includes("prop24.com") && !src.includes("Logo")) imageUrl = src;
          });
        }

        const fullText = `${title} ${location} ${address}`;
        if (!isGauteng(fullText)) return;

        const price = extractPrice(priceText);
        // No price cap for student accommodation — these are investment properties
        if (!price && !priceText.toUpperCase().includes("POA")) return;

        const sourceUrl = linkHref.startsWith("http") ? linkHref : `https://www.property24.com${linkHref}`;
        const idMatch = sourceUrl.match(/(\d+)$/);

        allListings.push({
          externalId: idMatch?.[1] ? `stu-p24-${idMatch[1]}` : `stu-p24-${allListings.length}`,
          source: "student_accommodation",
          sourceUrl,
          title: title || "Student Accommodation For Sale",
          description: `Student accommodation / investment property for sale: ${location}`,
          propertyType: "STUDENT",
          address: address || location,
          suburb: location,
          city: extractCity(`${location} ${address}`),
          province: TARGET_PROVINCE,
          askingPrice: price || 0,
          bedrooms: extractBeds(title + " " + featureText),
          bathrooms: extractBaths(featureText),
          floorSize: extractSize(featureText),
          imageUrl,
          auctionType: "SALE",
          auctioneer: "Property24",
        });
      });
    } catch { /* skip URL */ }
  }

  // ─── Private Property: Student accommodation FOR SALE ──────
  const studentPPUrls = [
    "https://www.privateproperty.co.za/for-sale/gauteng/1?PropertyCategory=StudentAccommodation",
    "https://www.privateproperty.co.za/for-sale/gauteng/1?PropertyCategory=StudentAccommodation&page=2",
    "https://www.privateproperty.co.za/for-sale/johannesburg/1?PropertyCategory=StudentAccommodation",
    "https://www.privateproperty.co.za/for-sale/pretoria/1?PropertyCategory=StudentAccommodation",
    // Guest houses / rooming houses (often student digs)
    "https://www.privateproperty.co.za/for-sale/gauteng/1?PropertyCategory=GuestHouse",
    "https://www.privateproperty.co.za/for-sale/gauteng/1?PropertyCategory=RoomingHouse",
  ];

  for (const url of studentPPUrls) {
    try {
      const { html, status } = await safeFetch(url);
      if (!html || status !== 200) continue;
      pagesScraped++;

      const $ = cheerio.load(html);

      $(".listing-result").each((_, el) => {
        const $el = $(el);
        if ($el.hasClass("listing-result__no-result")) return;

        const title = $el.find(".listing-result__title, h3, h4").first().text().trim();
        const priceText = $el.find(".listing-result__price, .price").first().text().trim();
        const address = $el.find(".listing-result__address, .listing-result__location").first().text().trim();

        let detailLink = "";
        $el.find("a[href]").each((_, a) => {
          const href = $(a).attr("href") || "";
          if (href.match(/\/T\d+$/) && !detailLink) detailLink = href;
        });

        const fullText = `${title} ${address}`;
        if (!isGauteng(fullText)) return;

        const price = extractPrice(priceText);
        if (!price) return;

        const listingId = detailLink.match(/T(\d+)$/)?.[1] || "";
        const sourceUrl = detailLink ? `https://www.privateproperty.co.za${detailLink}` : url;

        let imageUrl: string | undefined;
        const img = $el.find("img").first();
        const src = img.attr("data-src") || img.attr("data-original") || img.attr("src") || "";
        if (src.startsWith("http") && !src.includes("placeholder") && !src.endsWith(".svg")) {
          imageUrl = src;
        }

        allListings.push({
          externalId: listingId ? `stu-pp-${listingId}` : `stu-pp-${allListings.length}`,
          source: "student_accommodation",
          sourceUrl,
          title: title || "Student Accommodation For Sale",
          description: `Student accommodation investment for sale via Private Property`,
          propertyType: "STUDENT",
          address: address,
          suburb: address.split(",")[0]?.trim(),
          city: extractCity(fullText),
          province: TARGET_PROVINCE,
          askingPrice: price,
          bedrooms: extractBeds(title),
          imageUrl,
          auctionType: "SALE",
          auctioneer: "Private Property",
        });
      });
    } catch { /* skip URL */ }
  }

  // ─── IOL Property: Student accommodation / guest houses for sale ───
  const studentIOLUrls = [
    "https://iolproperty.co.za/advanced-search-results-page/?keyword=student+accommodation&status%5B%5D=for-sale",
    "https://iolproperty.co.za/advanced-search-results-page/?keyword=guest+house&status%5B%5D=for-sale&property_province=gauteng",
    "https://iolproperty.co.za/advanced-search-results-page/?keyword=rooming+house&status%5B%5D=for-sale&property_province=gauteng",
  ];

  for (const url of studentIOLUrls) {
    try {
      const { html, status } = await safeFetch(url);
      if (!html || status !== 200) continue;
      pagesScraped++;

      const $ = cheerio.load(html);

      $(".item-wrap, .property-listing, article").each((_, el) => {
        const $el = $(el);
        const text = $el.text().replace(/\s+/g, " ").trim();
        if (text.length < 20) return;

        const title = $el.find("h2 a, h3 a, .item-title a, .property-title").first().text().trim();
        const priceText = $el.find(".item-price, .listing-price, [class*='price']").first().text().trim();
        const address = $el.find(".item-address, [class*='address'], [class*='location']").first().text().trim();

        const link = $el.find("a[href*='iolproperty']").first().attr("href") || $el.find("h2 a, h3 a").first().attr("href") || "";
        const sourceUrl = link.startsWith("http") ? link : link ? `https://iolproperty.co.za${link}` : url;

        if (!isGauteng(`${text} ${address}`)) return;

        const price = extractPrice(priceText);
        if (!price) return;

        const imageUrl = getImageUrl($el, $, "https://iolproperty.co.za");
        const idMatch = link.match(/\/([\w-]+)\/?$/);

        allListings.push({
          externalId: idMatch?.[1] ? `stu-iol-${idMatch[1]}` : `stu-iol-${allListings.length}`,
          source: "student_accommodation",
          sourceUrl,
          title: title || "Student Accommodation / Guest House For Sale",
          description: text.substring(0, 400),
          propertyType: "STUDENT",
          address: address,
          city: extractCity(text) || "Gauteng",
          province: TARGET_PROVINCE,
          askingPrice: price,
          bedrooms: extractBeds(text),
          bathrooms: extractBaths(text),
          floorSize: extractSize(text),
          imageUrl,
          auctionType: "SALE",
          auctioneer: "IOL Property",
        });
      });
    } catch { /* skip URL */ }
  }

  // ─── BidX1 / In2Assets / Auction Sites: Student accommodation at auction ───
  const studentAuctionUrls = [
    "https://www.bidx1.com/en/south-africa?q=student",
    "https://www.bidx1.com/en/south-africa?q=guest+house",
    "https://www.in2assets.co.za/search?keyword=student",
    "https://www.in2assets.co.za/search?keyword=guest+house",
  ];

  for (const url of studentAuctionUrls) {
    try {
      const { html, status } = await safeFetch(url);
      if (!html || status !== 200) continue;
      pagesScraped++;

      const $ = cheerio.load(html);

      $(".card.property-card, [class*='property-card'], .property-item, .search-result, .lot-card").each((_, el) => {
        const $el = $(el);
        const text = $el.text().replace(/\s+/g, " ").trim();
        if (text.length < 20) return;

        const title = $el.find("[class*='title'], h3, h4, h5").first().text().trim();
        const priceText = $el.find("[class*='price'], [class*='guide']").first().text().trim();
        const address = $el.find("[class*='address'], [class*='location']").first().text().trim();

        const link = $el.find("a[href]").first().attr("href") || "";
        const baseUrl = url.includes("bidx1") ? "https://www.bidx1.com" : "https://www.in2assets.co.za";
        const sourceUrl = link.startsWith("http") ? link : link ? `${baseUrl}${link}` : url;

        if (!isGauteng(`${text} ${address}`)) return;

        const price = extractPrice(priceText);
        const imageUrl = getImageUrl($el, $, baseUrl);

        allListings.push({
          externalId: `stu-auc-${allListings.length}`,
          source: "student_accommodation",
          sourceUrl,
          title: title || "Student / Guest House Auction",
          description: text.substring(0, 400),
          propertyType: "STUDENT",
          address: address,
          city: extractCity(text) || "Gauteng",
          province: TARGET_PROVINCE,
          askingPrice: price || 0,
          bedrooms: extractBeds(text),
          bathrooms: extractBaths(text),
          floorSize: extractSize(text),
          imageUrl,
          auctionType: "ONLINE_AUCTION",
          auctioneer: url.includes("bidx1") ? "BidX1" : "In2assets",
        });
      });
    } catch { /* skip URL */ }
  }

  const combinedListings = dedup(allListings);
  return {
    source: "student_accommodation",
    status: combinedListings.length > 0 ? "SUCCESS" : "PARTIAL",
    listings: combinedListings,
    durationMs: Date.now() - start,
    pagesScraped,
  };
}

// ─── All Scrapers ────────────────────────────────────────────

const ALL_SCRAPERS = [
  // Tier 1: Site-specific verified scrapers
  scrapeProperty24,
  scrapePrivateProperty,
  scrapeIOLProperty,
  scrapeMyRoof,
  // Tier 2: Auction houses
  scrapeIn2assets,
  scrapeAucor,
  scrapeHighStreetAuctions,
  scrapeBroll,
  scrapeBidX1,
  scrapeAuctionInc,
  scrapeRealnet,
  // Tier 3: Sheriff (login required)
  scrapeSheriffHQ,
  scrapeSASheriff,
  // Tier 4: Student accommodation
  scrapeStudentAccommodation,
];

// ─── Main Orchestrator ───────────────────────────────────────

export async function runFullScrape(): Promise<{
  totalFound: number;
  totalNew: number;
  totalExpired: number;
  results: ScrapeResult[];
}> {
  const BATCH_SIZE = 5;
  const scrapeResults: ScrapeResult[] = [];

  for (let i = 0; i < ALL_SCRAPERS.length; i += BATCH_SIZE) {
    const batch = ALL_SCRAPERS.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(batch.map((fn) => fn()));
    for (const result of batchResults) {
      scrapeResults.push(
        result.status === "fulfilled"
          ? result.value
          : {
              source: "unknown",
              status: "FAILED" as const,
              listings: [],
              error: (result.reason as Error)?.message ?? "Unknown error",
              durationMs: 0,
            }
      );
    }
  }

  let totalFound = 0;
  let totalNew = 0;
  let totalExpired = 0;

  for (const r of scrapeResults) {
    totalFound += r.listings.length;

    // Track which externalIds were seen for this source in this run.
    // Used after the loop to auto-expire listings the source no longer publishes.
    const seenExternalIds = new Set<string>();

    for (const listing of r.listings) {
      try {
        const existing = listing.externalId
          ? await db.distressedListing.findUnique({
              where: {
                source_externalId: {
                  source: listing.source,
                  externalId: listing.externalId,
                },
              },
            })
          : null;

        if (listing.externalId) {
          seenExternalIds.add(listing.externalId);
        }

        if (existing) {
          // Log a price-history snapshot only when the price actually changed
          // (avoids polluting the table with identical rows on every scrape).
          if (
            typeof listing.askingPrice === "number" &&
            listing.askingPrice > 0 &&
            listing.askingPrice !== existing.askingPrice
          ) {
            try {
              await db.distressedListingPriceHistory.create({
                data: {
                  listingId: existing.id,
                  askingPrice: listing.askingPrice,
                  marketValue: listing.marketValue ?? existing.marketValue ?? null,
                },
              });
            } catch {
              // history is best-effort, never block the scrape
            }
          }
          await db.distressedListing.update({
            where: { id: existing.id },
            data: {
              // Re-activate listings that previously expired/were withdrawn but
              // have reappeared on the source. Don't override SOLD or WATCHED
              // (manual states) — only flip auto-expired ones back to ACTIVE.
              status:
                existing.status === "EXPIRED" || existing.status === "WITHDRAWN"
                  ? "ACTIVE"
                  : existing.status,
              askingPrice: listing.askingPrice,
              marketValue: listing.marketValue,
              discount: listing.discount,
              auctionDate: listing.auctionDate,
              auctionTime: listing.auctionTime,
              auctionVenue: listing.auctionVenue,
              imageUrl: listing.imageUrl ?? existing.imageUrl,
              noReserve: listing.noReserve ?? existing.noReserve,
              caseNumber: listing.caseNumber ?? existing.caseNumber,
              courtDivision: listing.courtDivision ?? existing.courtDivision,
              lastScrapedAt: new Date(),
            },
          });
        } else {
          const created = await db.distressedListing.create({
            data: {
              externalId: listing.externalId,
              source: listing.source,
              sourceUrl: listing.sourceUrl,
              title: listing.title,
              description: listing.description,
              propertyType: listing.propertyType,
              address: listing.address,
              suburb: listing.suburb,
              city: listing.city,
              province: listing.province,
              marketValue: listing.marketValue,
              askingPrice: listing.askingPrice,
              discount: listing.discount,
              bedrooms: listing.bedrooms,
              bathrooms: listing.bathrooms,
              erfSize: listing.erfSize,
              floorSize: listing.floorSize,
              imageUrl: listing.imageUrl,
              auctionDate: listing.auctionDate,
              auctionTime: listing.auctionTime,
              auctionVenue: listing.auctionVenue,
              auctionType: listing.auctionType,
              auctioneer: listing.auctioneer,
              noReserve: listing.noReserve ?? false,
              caseNumber: listing.caseNumber,
              courtDivision: listing.courtDivision,
              lastScrapedAt: new Date(),
            },
          });
          if (typeof listing.askingPrice === "number" && listing.askingPrice > 0) {
            try {
              await db.distressedListingPriceHistory.create({
                data: { listingId: created.id, askingPrice: listing.askingPrice, marketValue: listing.marketValue ?? null },
              });
            } catch {}
          }
          totalNew++;
        }
      } catch {
        // Skip duplicates silently
      }
    }

    // Auto-expire stale listings: only do this on SUCCESSFUL scrapes that
    // actually returned data. We never prune on PARTIAL/FAILED runs because a
    // transient site outage or parser regression would otherwise wipe the DB.
    if (r.status === "SUCCESS" && r.listings.length > 0 && seenExternalIds.size > 0) {
      try {
        const expired = await db.distressedListing.updateMany({
          where: {
            source: r.source,
            status: { in: ["ACTIVE", "WATCHED"] },
            externalId: { not: null, notIn: Array.from(seenExternalIds) },
          },
          data: { status: "EXPIRED" },
        });
        totalExpired += expired.count;
      } catch {
        // Non-fatal — listings will be re-evaluated on next run.
      }
    }

    // Log scrape result
    try {
      await db.distressedScrapeLog.create({
        data: {
          source: r.source,
          status: r.status,
          listingsFound: r.listings.length,
          newListings: 0,
          errorMessage: r.error,
          durationMs: r.durationMs,
        },
      });
    } catch {}
  }

  // Global cleanup: any ACTIVE listing whose auction has already happened
  // is by definition no longer a live deal — expire it regardless of source.
  try {
    const pastAuction = await db.distressedListing.updateMany({
      where: {
        status: { in: ["ACTIVE", "WATCHED"] },
        auctionDate: { lt: new Date() },
      },
      data: { status: "EXPIRED" },
    });
    totalExpired += pastAuction.count;
  } catch {
    // Non-fatal
  }

  // Stale cleanup: any ACTIVE/WATCHED listing not refreshed for 14+ days
  // is treated as removed from source. Catches sources we couldn't dedup
  // by externalId and protects against scraper drift.
  try {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const stale = await db.distressedListing.updateMany({
      where: {
        status: { in: ["ACTIVE", "WATCHED"] },
        OR: [
          { lastScrapedAt: null },
          { lastScrapedAt: { lt: fourteenDaysAgo } },
        ],
      },
      data: { status: "EXPIRED" },
    });
    totalExpired += stale.count;
  } catch {
    // Non-fatal
  }

  return { totalFound, totalNew, totalExpired, results: scrapeResults };
}

/**
 * Get all sources with their status and registration URLs
 */
export function getSourceInfo() {
  return [
    // Tier 1: Verified working scrapers
    { id: "property24", name: "Property24", url: "https://www.property24.com/for-sale/gauteng/2?sp=pt%3d450000", loginRequired: false, type: "Auction & Sales" },
    { id: "private_property", name: "Private Property", url: "https://www.privateproperty.co.za/for-sale/gauteng/1?PriceTo=450000", loginRequired: false, type: "Sales" },
    { id: "iol_property", name: "IOL Property", url: "https://iolproperty.co.za/advanced-search-results-page/?keyword=gauteng&status%5B%5D=for-sale&max-price=450000", loginRequired: false, type: "Sales" },
    { id: "myroof", name: "MyRoof (Standard Bank)", url: "https://www.myroof.co.za/Standard-Bank/Repossessed-Auctions?sort_by=cheap&province=Gauteng", loginRequired: false, type: "Bank Repo / Auction" },
    // Tier 2: Auction houses
    { id: "in2assets", name: "In2assets", url: "https://www.in2assets.co.za/main-auction", loginRequired: false, type: "Online Auction" },
    { id: "aucor_property", name: "Aucor Property", url: "https://www.aucor.com/auctions/category/property-67", loginRequired: false, type: "Live Auction" },
    { id: "highstreet_auctions", name: "High Street Auctions", url: "https://www.highstreetauctions.com", loginRequired: false, type: "Live Auction" },
    { id: "broll", name: "Broll Property Group", url: "https://www.broll.com/search", loginRequired: false, type: "Commercial Sales" },
    { id: "bidx1", name: "BidX1 Auctions", url: "https://www.bidx1.com/en/south-africa", loginRequired: false, type: "Online Auction" },
    { id: "auction_inc", name: "Auction Inc", url: "https://www.auctioninc.co.za", loginRequired: false, type: "Live Auction" },
    { id: "realnet", name: "RealNet Property", url: "https://www.realnet.co.za/results/residential/for-sale/?province=Gauteng", loginRequired: false, type: "Sales" },
    // Tier 3: Sheriff (login)
    { id: "sheriffhq", name: "SheriffHQ", url: "https://www.sheriffhq.co.za", loginRequired: true, type: "Sheriff/Court" },
    { id: "sa_sheriff", name: "SA Sheriff", url: "https://www.sasheriff.co.za/sheriffauctions.asp", loginRequired: true, type: "Sheriff/Court" },
    // Tier 4: Student Accommodation (investment properties FOR SALE)
    { id: "student_accommodation", name: "Student Accommodation", url: "https://www.property24.com/for-sale/gauteng/2?PropertyType=StudentAccommodation", loginRequired: false, type: "Investment / For Sale" },
    // Bank repo registration links — not scraped, direct links for users
    { id: "fnb_repos", name: "FNB Repossessed", url: "https://www.fnb.co.za/sell-and-buy/repossessed-properties.html", loginRequired: true, type: "Bank Repo" },
    { id: "absa_repos", name: "ABSA Repossessed", url: "https://www.absa.co.za/personal/sell-and-buy/buying-a-home/repossessed-properties/", loginRequired: true, type: "Bank Repo" },
    { id: "standard_bank", name: "Standard Bank Repos", url: "https://www.myroof.co.za/Standard-Bank/Repossessed-Auctions", loginRequired: false, type: "Bank Repo" },
    { id: "nedbank_pip", name: "Nedbank Properties in Possession", url: "https://www.nedbank.co.za/content/nedbank/desktop/gt/en/personal/loans/home-loans/properties-in-possession.html", loginRequired: true, type: "Bank Repo" },
    { id: "capitec_repos", name: "Capitec Home Loans", url: "https://www.capitecbank.co.za/personal/loans/home-loans/", loginRequired: true, type: "Bank Repo" },
    { id: "sa_home_loans", name: "SA Home Loans", url: "https://www.sahomeloans.com", loginRequired: false, type: "Bank Repo" },
  ];
}
