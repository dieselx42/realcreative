import "server-only";

/**
 * Resolves a free-text city (what a lead types on the form, e.g. "Miami" or
 * "Austin, TX") into a DataForSEO location_code so `my_business_info` can pin a
 * single local Google business panel.
 *
 * Why this exists: `my_business_info` returns "No Search Results" when a common
 * restaurant name is searched country-wide, because Google can't resolve one
 * business. A city-level location fixes that. Rather than hard-code a single
 * DATAFORSEO_LOCATION (which can't scale to leads from many cities), we look
 * the city up against DataForSEO's own locations list — same credentials, no
 * extra API/key, and the location_code database is unified across Google
 * endpoints (2840 = United States works in both SERP and business data).
 *
 * The list is effectively static, so it's fetched once per serverless instance
 * and cached. Any failure (no match, network error, unexpected shape) resolves
 * to `null`, and the caller falls back to the country-wide search — so this can
 * only improve match rate, never regress it.
 */

const DEFAULT_LOCATIONS_ENDPOINT =
  "https://api.dataforseo.com/v3/serp/google/locations/US";
const DEFAULT_TIMEOUT_MS = 20_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function locationsEndpoint(): string {
  return process.env.DATAFORSEO_LOCATIONS_ENDPOINT || DEFAULT_LOCATIONS_ENDPOINT;
}

interface DfsLocation {
  location_code?: number;
  location_name?: string;
  country_iso_code?: string;
  location_type?: string;
}

interface LocationsResponse {
  tasks?: Array<{
    status_code?: number;
    result?: DfsLocation[] | null;
  }>;
}

/** Normalize for matching: lowercase, collapse whitespace, tidy comma spacing. */
const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/\s*,\s*/g, ",")
    .replace(/\s+/g, " ");

/** US state name -> USPS abbreviation, so "Austin, TX" and "Austin, Texas" both match. */
const STATE_ABBR: Record<string, string> = {
  alabama: "al", alaska: "ak", arizona: "az", arkansas: "ar", california: "ca",
  colorado: "co", connecticut: "ct", delaware: "de", "district of columbia": "dc",
  florida: "fl", georgia: "ga", hawaii: "hi", idaho: "id", illinois: "il",
  indiana: "in", iowa: "ia", kansas: "ks", kentucky: "ky", louisiana: "la",
  maine: "me", maryland: "md", massachusetts: "ma", michigan: "mi",
  minnesota: "mn", mississippi: "ms", missouri: "mo", montana: "mt",
  nebraska: "ne", nevada: "nv", "new hampshire": "nh", "new jersey": "nj",
  "new mexico": "nm", "new york": "ny", "north carolina": "nc",
  "north dakota": "nd", ohio: "oh", oklahoma: "ok", oregon: "or",
  pennsylvania: "pa", "rhode island": "ri", "south carolina": "sc",
  "south dakota": "sd", tennessee: "tn", texas: "tx", utah: "ut",
  vermont: "vt", virginia: "va", washington: "wa", "west virginia": "wv",
  wisconsin: "wi", wyoming: "wy",
};

/**
 * Cached lookup index, keyed by:
 *   - "city"            -> first US city with that name (best-effort)
 *   - "city,state"      -> exact match (full state name)
 *   - "city,st"         -> exact match (USPS abbreviation)
 * The last (city,state) entries win, so an unambiguous "Austin, TX" always
 * beats the arbitrary bare-"austin" pick.
 */
let cache: { index: Map<string, number>; builtAt: number } | null = null;
let inFlight: Promise<Map<string, number> | null> | null = null;

function buildIndex(locations: DfsLocation[]): Map<string, number> {
  const index = new Map<string, number>();
  for (const loc of locations) {
    if (typeof loc.location_code !== "number") continue;
    if (loc.location_type !== "City") continue;
    if (loc.country_iso_code && loc.country_iso_code !== "US") continue;
    const name = loc.location_name;
    if (!name) continue;

    // location_name looks like "Miami,Florida,United States".
    const [cityPart, statePart] = name.split(",").map((p) => p.trim());
    if (!cityPart) continue;
    const city = norm(cityPart);

    // Bare city: first one wins (list order), a best-effort default.
    if (!index.has(city)) index.set(city, loc.location_code);

    if (statePart) {
      const state = norm(statePart);
      index.set(`${city},${state}`, loc.location_code);
      const abbr = STATE_ABBR[state];
      if (abbr) index.set(`${city},${abbr}`, loc.location_code);
    }
  }
  return index;
}

async function loadIndex(
  auth: string,
  timeoutMs: number,
): Promise<Map<string, number> | null> {
  if (cache && Date.now() - cache.builtAt < CACHE_TTL_MS) return cache.index;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(locationsEndpoint(), {
        method: "GET",
        headers: { authorization: `Basic ${auth}` },
        signal: controller.signal,
        // The list is static; let Next cache it across requests where possible.
        next: { revalidate: CACHE_TTL_MS / 1000 },
      });
      if (!response.ok) return null;

      const json = (await response.json()) as LocationsResponse;
      const task = json.tasks?.[0];
      const result = task?.result;
      if (!result || !Array.isArray(result) || result.length === 0) return null;

      const index = buildIndex(result);
      if (index.size === 0) return null;
      cache = { index, builtAt: Date.now() };
      return index;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Resolve a typed city to a DataForSEO US location_code, or `null` if it can't
 * be matched (caller then falls back to the country-wide search).
 */
export async function resolveUsLocationCode(
  city: string,
  auth: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<number | null> {
  const query = norm(city);
  if (!query) return null;

  const index = await loadIndex(auth, timeoutMs);
  if (!index) return null;

  // Try the full "city,state" form first, then the bare city.
  if (index.has(query)) return index.get(query) ?? null;
  const cityOnly = query.split(",")[0];
  if (index.has(cityOnly)) return index.get(cityOnly) ?? null;
  return null;
}

/** Test hook: clear the module cache. */
export function __resetLocationCache() {
  cache = null;
  inFlight = null;
}
