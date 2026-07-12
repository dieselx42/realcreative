import "server-only";

/**
 * Turn a free-text US city into a lat/lng, so the DataForSEO business-listings
 * search can be scoped to the right metro. DataForSEO's listings search geo
 * filter is a coordinate ("lat,lng,radius"), not a location code, so we need a
 * point.
 *
 * Uses OpenStreetMap Nominatim by default — no API key, fine for low volume.
 * Results are cached per city (city centroids are static). The endpoint and
 * User-Agent are overridable so a keyed provider (Google/Mapbox) can be swapped
 * in for higher volume without touching callers. Any failure resolves to
 * `null`, and the caller falls back to an unscoped search.
 *
 * Nominatim usage policy: keep volume modest, send a valid User-Agent. See
 * https://operations.osmfoundation.org/policies/nominatim/.
 */

const DEFAULT_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const DEFAULT_TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface GeoPoint {
  lat: number;
  lng: number;
}

const cache = new Map<string, { point: GeoPoint | null; at: number }>();

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export async function geocodeCity(
  city: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<GeoPoint | null> {
  const key = norm(city);
  if (!key) return null;

  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.point;

  const endpoint = process.env.GEOCODE_ENDPOINT || DEFAULT_ENDPOINT;
  // Bias to the US; append the country so "Pembroke Pines, FL" resolves cleanly.
  const query = `${city}, USA`;
  const url = `${endpoint}?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=us`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent":
          process.env.GEOCODE_USER_AGENT ||
          "RestaurantGrowthScore/1.0 (+https://github.com/dieselx42/realcreative)",
        accept: "application/json",
      },
      signal: controller.signal,
      next: { revalidate: CACHE_TTL_MS / 1000 },
    });
    if (!response.ok) {
      cache.set(key, { point: null, at: Date.now() });
      return null;
    }
    const data = (await response.json()) as Array<{ lat?: string; lon?: string }>;
    const first = data?.[0];
    const lat = first ? Number(first.lat) : NaN;
    const lng = first ? Number(first.lon) : NaN;
    const point =
      Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    cache.set(key, { point, at: Date.now() });
    return point;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Test hook: clear the module cache. */
export function __resetGeocodeCache() {
  cache.clear();
}
