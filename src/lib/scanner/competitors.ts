import "server-only";

import { geocodeCity } from "@/lib/scanner/geocode";

/**
 * Competitor benchmarking: how does this restaurant's Google rating + review
 * volume stack up against same-category restaurants nearby? This is the single
 * most persuasive thing on the report — "you're a 4.2★; the taco spots around
 * you average 4.5★" — so it's worth a dedicated DataForSEO lookup.
 *
 * It reuses the geocoder (city -> coordinate) and DataForSEO's
 * business_listings/search, filtered to the matched restaurant's category near
 * the city. Requires the business-profile scan to have matched (we need the
 * category + the restaurant's own rating/reviews to rank it). Any failure
 * resolves to `unavailable` so the report simply omits the section.
 */

const DEFAULT_LISTINGS_ENDPOINT =
  "https://api.dataforseo.com/v3/business_data/business_listings/search/live";
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_RADIUS_KM = 15;

function listingsEndpoint(): string {
  return process.env.DATAFORSEO_LISTINGS_ENDPOINT || DEFAULT_LISTINGS_ENDPOINT;
}

export interface Competitor {
  name: string;
  rating?: number;
  reviews?: number;
}

export interface CompetitorScan {
  source: "dataforseo" | "unavailable";
  error?: string;
  /** Top nearby same-category competitors by review volume. */
  competitors: Competitor[];
  /** Average rating / reviews across the competitor set. */
  avgRating?: number;
  avgReviews?: number;
  /** This restaurant's rank by rating within the set (1 = best), and set size. */
  rank?: number;
  outOf?: number;
  /** How this restaurant compares on rating: "above" | "at" | "below" average. */
  standing?: "above" | "at" | "below";
}

export interface CompetitorInput {
  city?: string;
  category?: string;
  /** The subject restaurant's own Google rating/reviews, to rank it. */
  rating?: number;
  reviews?: number;
  /** The subject's own name + website host, to exclude it from the set. */
  businessName?: string;
  websiteUrl?: string;
}

interface ListingItem {
  title?: string;
  category?: string;
  url?: string;
  domain?: string;
  rating?: { value?: number; votes_count?: number };
}

interface ListingsResponse {
  tasks?: Array<{
    status_code?: number;
    status_message?: string;
    result?: Array<{ items?: ListingItem[] }> | null;
  }>;
}

function unavailable(error: string): CompetitorScan {
  return { source: "unavailable", error, competitors: [] };
}

function hostOf(raw?: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

const norm = (s?: string) => (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export async function runCompetitorScan(
  input: CompetitorInput,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<CompetitorScan> {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return unavailable("DataForSEO credentials not configured");
  if (!input.category) return unavailable("No business category to compare against");
  if (!input.city) return unavailable("No city to search competitors in");

  const point = await geocodeCity(input.city, timeoutMs);
  if (!point) return unavailable("Could not geocode city");

  const auth = Buffer.from(`${login}:${password}`).toString("base64");
  const radiusKm =
    Number(process.env.DATAFORSEO_COMPETITOR_RADIUS_KM) || DEFAULT_RADIUS_KM;
  const task: Record<string, unknown> = {
    categories: [input.category],
    location_coordinate: `${point.lat},${point.lng},${radiusKm}`,
    order_by: ["rating.votes_count,desc"],
    limit: 30,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(listingsEndpoint(), {
      method: "POST",
      headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
      body: JSON.stringify([task]),
      signal: controller.signal,
      next: { revalidate: 3600 },
    });
    if (!response.ok) return unavailable(`DataForSEO responded ${response.status}`);

    const json = (await response.json()) as ListingsResponse;
    const dfsTask = json.tasks?.[0];
    if (!dfsTask || dfsTask.status_code !== 20000) {
      return unavailable(dfsTask?.status_message ?? "DataForSEO task failed");
    }

    const items = dfsTask.result?.[0]?.items ?? [];
    return summarize(items, input);
  } catch (error) {
    return unavailable(
      error instanceof Error ? error.message : "DataForSEO competitor request failed",
    );
  } finally {
    clearTimeout(timer);
  }
}

function summarize(items: ListingItem[], input: CompetitorInput): CompetitorScan {
  const targetHost = hostOf(input.websiteUrl);
  const targetName = norm(input.businessName);

  // Exclude the subject restaurant itself (by domain, else by exact name) and
  // any listing missing a rating (can't benchmark on it).
  const competitors = items
    .filter((it) => {
      const host = hostOf(it.url || it.domain);
      const isSelf =
        (targetHost && host && host === targetHost) ||
        (targetName && norm(it.title) === targetName);
      return !isSelf && typeof it.rating?.value === "number";
    })
    .map((it) => ({
      name: it.title ?? "Nearby restaurant",
      rating: it.rating?.value,
      reviews:
        typeof it.rating?.votes_count === "number" ? it.rating.votes_count : undefined,
    }));

  if (competitors.length < 2) {
    return unavailable("Not enough nearby competitors to compare");
  }

  const ratings = competitors.map((c) => c.rating ?? 0);
  const reviews = competitors.map((c) => c.reviews ?? 0);
  const avgRating =
    Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
  const avgReviews = Math.round(reviews.reduce((a, b) => a + b, 0) / reviews.length);

  let rank: number | undefined;
  let standing: CompetitorScan["standing"];
  if (typeof input.rating === "number") {
    // Rank = how many competitors out-rate the subject, +1. outOf includes the
    // subject so "3 of 12" reads naturally.
    const better = competitors.filter((c) => (c.rating ?? 0) > input.rating!).length;
    rank = better + 1;
    standing =
      input.rating > avgRating ? "above" : input.rating < avgRating ? "below" : "at";
  }

  return {
    source: "dataforseo",
    competitors: competitors
      .slice()
      .sort((a, b) => (b.reviews ?? 0) - (a.reviews ?? 0))
      .slice(0, 5),
    avgRating,
    avgReviews,
    rank,
    outOf: typeof input.rating === "number" ? competitors.length + 1 : undefined,
    standing,
  };
}
