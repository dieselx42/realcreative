import "server-only";

import type { CategoryKey } from "@/lib/scoring/categories";
import type { Scanner, ScanContext, ScannerSignals } from "@/lib/scanner/types";
import { resolveUsLocationCode } from "@/lib/scanner/location-resolver";
import { geocodeCity } from "@/lib/scanner/geocode";

/**
 * Local SEO + Reputation scanner backed by DataForSEO's Google Business Profile
 * data. One lookup yields both categories:
 *   - Reputation: rating and review volume.
 *   - Local SEO: whether a Google Business Profile exists, is claimed, has a
 *     category, and has consistent NAP (name/address/phone) + website.
 *
 * Two-step match, because a restaurant name alone is often ambiguous:
 *   1. `my_business_info` — returns Google's single business panel. Precise, but
 *      only works when the name resolves to exactly one business. Common names
 *      (e.g. two "Los Tacos" in one city) yield "No Search Results".
 *   2. Fallback `business_listings/search` — returns *multiple* candidates near
 *      the city, which we then disambiguate using the lead's own website domain
 *      (globally unique), then city, then name. This is what makes a near-miss
 *      or ambiguous name resolve to the right listing.
 *
 * Requires DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD. Without credentials, without
 * a business name, or when nothing confidently matches, this resolves to no
 * signal so the engine falls back to deterministic scoring instead of erroring.
 */

const DEFAULT_ENDPOINT =
  "https://api.dataforseo.com/v3/business_data/google/my_business_info/live";
const DEFAULT_LISTINGS_ENDPOINT =
  "https://api.dataforseo.com/v3/business_data/business_listings/search/live";
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_SEARCH_RADIUS_KM = 30;

/** Overridable for tests / self-hosted proxies. */
function endpoint(): string {
  return process.env.DATAFORSEO_ENDPOINT || DEFAULT_ENDPOINT;
}
function listingsEndpoint(): string {
  return process.env.DATAFORSEO_LISTINGS_ENDPOINT || DEFAULT_LISTINGS_ENDPOINT;
}

export interface BusinessProfileFinding {
  label: string;
  ok: boolean;
}

/** How the matched business was found — surfaced in meta for transparency. */
export type ProfileMatch = "panel" | "website" | "name+city" | "name";

/** Exactly what was sent to DataForSEO — surfaced in meta for debugging. */
export interface BusinessProfileQuery {
  keyword: string;
  locationName?: string;
  locationCode?: number;
  cityResolved: boolean;
  matchedBy?: ProfileMatch;
  candidatesConsidered?: number;
}

export interface BusinessProfileScan {
  signals: ScannerSignals; // { reputation, local_seo } when available
  findings: Partial<Record<CategoryKey, BusinessProfileFinding[]>>;
  metrics: { rating?: number; reviews?: number };
  source: "dataforseo" | "unavailable";
  error?: string;
  query?: BusinessProfileQuery;
  /** The matched business's identity, used to find same-category competitors. */
  matched?: { category?: string; title?: string };
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function unavailable(
  error: string,
  query?: BusinessProfileQuery,
): BusinessProfileScan {
  return {
    signals: {},
    findings: {},
    metrics: {},
    source: "unavailable",
    error,
    query,
  };
}

/** Normalized profile fields, from either DataForSEO endpoint. */
interface ProfileFields {
  rating?: number;
  reviews?: number;
  isClaimed: boolean;
  hasCategory: boolean;
  hasWebsite: boolean;
  hasNap: boolean;
  /** Photos on the Google Business Profile (completeness signal). */
  photoCount?: number;
  /** Whether opening hours are published on the profile. */
  hasHours: boolean;
}

/** Shared scorer so `my_business_info` and listings candidates score identically. */
function buildScan(
  fields: ProfileFields,
): Pick<BusinessProfileScan, "signals" | "findings" | "metrics" | "source"> {
  const {
    rating,
    reviews,
    isClaimed,
    hasCategory,
    hasWebsite,
    hasNap,
    photoCount,
    hasHours,
  } = fields;

  // Reputation: rating quality, discounted by low review volume (a 5.0 with 3
  // reviews is weaker evidence than a 4.5 with 300).
  let reputation: number | undefined;
  if (typeof rating === "number") {
    const ratingScore = clamp01(rating / 5);
    const volumeConfidence = clamp01((reviews ?? 0) / 100);
    reputation = clamp01(ratingScore * (0.6 + 0.4 * volumeConfidence));
  }

  // A well-stocked profile has a healthy set of photos.
  const hasPhotos = (photoCount ?? 0) >= 10;

  // Local SEO: presence and completeness of the Google Business Profile.
  const localSeo = clamp01(
    0.35 + // a profile exists at all
      (isClaimed ? 0.15 : 0) +
      (hasCategory ? 0.1 : 0) +
      (hasWebsite ? 0.1 : 0) +
      (hasNap ? 0.1 : 0) +
      (hasHours ? 0.1 : 0) +
      (hasPhotos ? 0.1 : 0),
  );

  const signals: ScannerSignals = { local_seo: localSeo };
  if (typeof reputation === "number") signals.reputation = reputation;

  const localSeoFindings: BusinessProfileFinding[] = [
    { label: "Google Business Profile", ok: true },
    { label: "Claimed", ok: isClaimed },
    { label: "Category set", ok: hasCategory },
    { label: "Website linked", ok: hasWebsite },
    { label: "Hours listed", ok: hasHours },
  ];
  if (typeof photoCount === "number") {
    localSeoFindings.push({ label: `${photoCount} photos`, ok: hasPhotos });
  }

  const findings: Partial<Record<CategoryKey, BusinessProfileFinding[]>> = {
    local_seo: localSeoFindings,
    reputation: [
      {
        label: rating != null ? `${rating.toFixed(1)}★ rating` : "No rating",
        ok: (rating ?? 0) >= 4.3,
      },
      { label: `${reviews ?? 0} reviews`, ok: (reviews ?? 0) >= 50 },
    ],
  };

  return { signals, findings, metrics: { rating, reviews }, source: "dataforseo" };
}

/** Registrable-ish host for domain matching: hostname minus a leading "www.". */
function hostOf(raw?: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

function sameDomain(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

const normCity = (s?: string) =>
  (s ?? "").trim().toLowerCase().split(",")[0].replace(/\s+/g, " ");

interface RunOptions {
  timeoutMs?: number;
}

export async function runBusinessProfileScan(
  context: ScanContext,
  options: RunOptions = {},
): Promise<BusinessProfileScan> {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    return unavailable("DataForSEO credentials not configured");
  }
  if (!context.businessName) {
    return unavailable("No business name to look up");
  }

  const { timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const auth = Buffer.from(`${login}:${password}`).toString("base64");

  // Step 1: the precise single-panel lookup.
  const panel = await tryMyBusinessInfo(context, auth, timeoutMs);
  if (panel.source === "dataforseo") return panel;

  // Step 2: ambiguous / near-miss name → fuzzy candidate search, disambiguated
  // by the lead's own website domain. Carry over the query for continuity.
  const fallback = await trySearchListings(context, auth, timeoutMs, panel.query);
  if (fallback.source === "dataforseo") return fallback;

  // Neither worked — return whichever carries the more useful diagnostic.
  return fallback.query?.candidatesConsidered != null ? fallback : panel;
}

// --- Step 1: my_business_info (single Google panel) ------------------------

async function tryMyBusinessInfo(
  context: ScanContext,
  auth: string,
  timeoutMs: number,
): Promise<BusinessProfileScan> {
  // my_business_info returns data only when Google resolves a *single* local
  // business panel. Pin the locale to improve the odds:
  //   1. DATAFORSEO_LOCATION — explicit override (full name). Wins when set.
  //   2. The lead's typed city, resolved to a DataForSEO location_code.
  //   3. Country-wide fallback (2840 = United States), city in the keyword.
  // A country *name* like "United States" is rejected by the location database.
  const explicitLocation = process.env.DATAFORSEO_LOCATION;
  let resolvedCode: number | null = null;
  if (!explicitLocation && context.city) {
    resolvedCode = await resolveUsLocationCode(context.city, auth, timeoutMs);
  }

  const businessName = context.businessName ?? "";
  const hasCityLevelLocation = Boolean(explicitLocation) || resolvedCode != null;
  const keyword = hasCityLevelLocation
    ? businessName
    : [businessName, context.city].filter(Boolean).join(" ");

  const task: Record<string, unknown> = { keyword, language_code: "en" };
  const query: BusinessProfileQuery = {
    keyword,
    cityResolved: resolvedCode != null,
  };
  if (explicitLocation) {
    task.location_name = explicitLocation;
    query.locationName = explicitLocation;
  } else if (resolvedCode != null) {
    task.location_code = resolvedCode;
    query.locationCode = resolvedCode;
  } else {
    const fallback = Number(process.env.DATAFORSEO_LOCATION_CODE) || 2840;
    task.location_code = fallback;
    query.locationCode = fallback;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint(), {
      method: "POST",
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/json",
      },
      body: JSON.stringify([task]),
      signal: controller.signal,
      next: { revalidate: 3600 },
    });
    if (!response.ok) {
      return unavailable(`DataForSEO responded ${response.status}`, query);
    }

    const json = (await response.json()) as MyBusinessResponse;
    const dfsTask = json.tasks?.[0];
    if (!dfsTask || dfsTask.status_code !== 20000) {
      return unavailable(dfsTask?.status_message ?? "DataForSEO task failed", query);
    }

    const item = dfsTask.result?.[0]?.items?.[0];
    if (!item) {
      return unavailable("No Google Business Profile found", query);
    }

    const fields: ProfileFields = {
      rating: typeof item.rating?.value === "number" ? item.rating.value : undefined,
      reviews:
        typeof item.rating?.votes_count === "number"
          ? item.rating.votes_count
          : undefined,
      isClaimed: item.is_claimed === true,
      hasCategory: Boolean(item.category),
      hasWebsite: Boolean(item.url),
      hasNap: Boolean(item.address) && Boolean(item.phone),
      photoCount:
        typeof item.total_photos === "number" ? item.total_photos : undefined,
      hasHours: Boolean(item.work_time),
    };
    return {
      ...buildScan(fields),
      query: { ...query, matchedBy: "panel" },
      matched: { category: item.category },
    };
  } catch (error) {
    return unavailable(
      error instanceof Error ? error.message : "DataForSEO request failed",
      query,
    );
  } finally {
    clearTimeout(timer);
  }
}

// --- Step 2: business_listings/search (multiple candidates) ----------------

async function trySearchListings(
  context: ScanContext,
  auth: string,
  timeoutMs: number,
  priorQuery?: BusinessProfileQuery,
): Promise<BusinessProfileScan> {
  const title = context.businessName ?? "";
  const baseQuery: BusinessProfileQuery = {
    keyword: title,
    cityResolved: priorQuery?.cityResolved ?? false,
    locationCode: priorQuery?.locationCode,
    locationName: priorQuery?.locationName,
  };

  const task: Record<string, unknown> = { title, limit: 50 };
  // Scope to the metro when we can geocode the city — otherwise a far-away
  // business with the same name could crowd out the local one.
  const point = context.city ? await geocodeCity(context.city, timeoutMs) : null;
  if (point) {
    const radiusKm =
      Number(process.env.DATAFORSEO_SEARCH_RADIUS_KM) || DEFAULT_SEARCH_RADIUS_KM;
    task.location_coordinate = `${point.lat},${point.lng},${radiusKm}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(listingsEndpoint(), {
      method: "POST",
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/json",
      },
      body: JSON.stringify([task]),
      signal: controller.signal,
      next: { revalidate: 3600 },
    });
    if (!response.ok) {
      return unavailable(`DataForSEO listings responded ${response.status}`, baseQuery);
    }

    const json = (await response.json()) as ListingsResponse;
    const dfsTask = json.tasks?.[0];
    if (!dfsTask || dfsTask.status_code !== 20000) {
      return unavailable(
        dfsTask?.status_message ?? "DataForSEO listings task failed",
        baseQuery,
      );
    }

    const items = dfsTask.result?.[0]?.items ?? [];
    const query: BusinessProfileQuery = {
      ...baseQuery,
      candidatesConsidered: items.length,
    };
    if (items.length === 0) {
      return unavailable("No business listings found", query);
    }

    const best = pickBestListing(items, context);
    if (!best) {
      // Candidates existed but none matched by domain or city — attributing a
      // random same-name business's reviews would be wrong. Bail out safely.
      return unavailable("No confident business match", query);
    }

    const item = best.item;
    const fields: ProfileFields = {
      rating: typeof item.rating?.value === "number" ? item.rating.value : undefined,
      reviews:
        typeof item.rating?.votes_count === "number"
          ? item.rating.votes_count
          : undefined,
      isClaimed: item.is_claimed === true,
      hasCategory: Boolean(item.category),
      hasWebsite: Boolean(item.url || item.domain),
      hasNap: Boolean(item.address || item.address_info?.address) && Boolean(item.phone),
      photoCount:
        typeof item.total_photos === "number" ? item.total_photos : undefined,
      hasHours: Boolean(item.work_time),
    };
    return {
      ...buildScan(fields),
      query: { ...query, matchedBy: best.matchedBy },
      matched: { category: item.category, title: item.title },
    };
  } catch (error) {
    return unavailable(
      error instanceof Error ? error.message : "DataForSEO listings request failed",
      baseQuery,
    );
  } finally {
    clearTimeout(timer);
  }
}

interface BestListing {
  item: ListingItem;
  matchedBy: ProfileMatch;
}

/**
 * Choose the candidate that is most confidently the lead's business:
 *   website domain match  >  same city  >  (reject).
 * Reviews break ties within the same tier. A name-only match is rejected — with
 * no domain or city agreement it's too likely to be a different same-name spot.
 */
function pickBestListing(
  items: ListingItem[],
  context: ScanContext,
): BestListing | null {
  const targetHost = hostOf(context.websiteUrl);
  const city = normCity(context.city);

  let best: ListingItem | null = null;
  let bestScore = -1;
  let bestMatch: ProfileMatch = "name";

  for (const item of items) {
    const host = hostOf(item.url || item.domain);
    const domainMatch = sameDomain(host, targetHost);
    const itemCity = normCity(item.address_info?.city);
    const cityMatch = Boolean(city) && city === itemCity;
    const reviews = item.rating?.votes_count ?? 0;

    let score = Math.min(reviews, 1000) / 1000; // tie-breaker in [0,1)
    let match: ProfileMatch = "name";
    if (cityMatch) {
      score += 100;
      match = "name+city";
    }
    if (domainMatch) {
      score += 1000;
      match = "website";
    }

    if (score > bestScore) {
      bestScore = score;
      best = item;
      bestMatch = match;
    }
  }

  if (!best || bestMatch === "name") return null;
  return { item: best, matchedBy: bestMatch };
}

/** Adapter to the generic Scanner interface used by the orchestrator. */
export const businessProfileScanner: Scanner = {
  name: "business_profile",
  async run(context: ScanContext): Promise<ScannerSignals> {
    const { signals } = await runBusinessProfileScan(context);
    return signals;
  },
};

// --- DataForSEO response shapes (only the fields we read) ------------------

interface MyBusinessItem {
  rating?: { value?: number; votes_count?: number };
  category?: string;
  url?: string;
  address?: string;
  phone?: string;
  is_claimed?: boolean;
  total_photos?: number;
  work_time?: unknown;
}

interface MyBusinessResponse {
  tasks?: Array<{
    status_code?: number;
    status_message?: string;
    result?: Array<{ items?: MyBusinessItem[] }> | null;
  }>;
}

interface ListingItem {
  title?: string;
  category?: string;
  address?: string;
  address_info?: { city?: string; region?: string; address?: string };
  url?: string;
  domain?: string;
  phone?: string;
  rating?: { value?: number; votes_count?: number };
  is_claimed?: boolean;
  total_photos?: number;
  work_time?: unknown;
}

interface ListingsResponse {
  tasks?: Array<{
    status_code?: number;
    status_message?: string;
    result?: Array<{ items?: ListingItem[] }> | null;
  }>;
}
