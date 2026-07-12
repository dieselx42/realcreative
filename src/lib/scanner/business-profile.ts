import "server-only";

import type { CategoryKey } from "@/lib/scoring/categories";
import type { Scanner, ScanContext, ScannerSignals } from "@/lib/scanner/types";

/**
 * Local SEO + Reputation scanner backed by DataForSEO's Google Business Profile
 * ("My Business Info") data. One lookup yields both categories:
 *   - Reputation: rating and review volume.
 *   - Local SEO: whether a Google Business Profile exists, is claimed, has a
 *     category, and has consistent NAP (name/address/phone) + website.
 *
 * Requires DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD. Without credentials, without
 * a business name to search for, or when the business can't be found, this
 * resolves to no signal so the engine falls back to deterministic scoring for
 * these categories instead of erroring.
 *
 * TODO: Google Business Profile API is an alternative source if the restaurant
 *   grants access; DataForSEO needs no per-restaurant auth, so it's the default.
 */

const DEFAULT_ENDPOINT =
  "https://api.dataforseo.com/v3/business_data/google/my_business_info/live";
const DEFAULT_TIMEOUT_MS = 20_000;

/** Overridable for tests / self-hosted proxies. */
function endpoint(): string {
  return process.env.DATAFORSEO_ENDPOINT || DEFAULT_ENDPOINT;
}

export interface BusinessProfileFinding {
  label: string;
  ok: boolean;
}

export interface BusinessProfileScan {
  signals: ScannerSignals; // { reputation, local_seo } when available
  findings: Partial<Record<CategoryKey, BusinessProfileFinding[]>>;
  metrics: { rating?: number; reviews?: number };
  source: "dataforseo" | "unavailable";
  error?: string;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function unavailable(error: string): BusinessProfileScan {
  return { signals: {}, findings: {}, metrics: {}, source: "unavailable", error };
}

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

  // my_business_info returns data only when Google resolves a *single* local
  // business panel. Two ways to get there:
  //   - With an explicit city-level location (DATAFORSEO_LOCATION, e.g.
  //     "Miami,Florida,United States"), Google already pins the locale, so the
  //     keyword should be just the business name — a cleaner, higher-hit query.
  //   - Without one, we fall back to a country-wide search (location_code 2840
  //     = United States, which the business-data endpoints accept — a country
  //     *name* like "United States" is rejected) and lean on the typed city
  //     inside the keyword as the only disambiguation signal we have. A common
  //     restaurant name over the whole US is ambiguous and returns "No Search
  //     Results" — set DATAFORSEO_LOCATION to fix that.
  const locationName = process.env.DATAFORSEO_LOCATION;
  const keyword = locationName
    ? (context.businessName ?? "")
    : [context.businessName, context.city].filter(Boolean).join(" ");
  const task: Record<string, unknown> = { keyword, language_code: "en" };
  if (locationName) {
    task.location_name = locationName;
  } else {
    task.location_code = Number(process.env.DATAFORSEO_LOCATION_CODE) || 2840;
  }

  const auth = Buffer.from(`${login}:${password}`).toString("base64");
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
      return unavailable(`DataForSEO responded ${response.status}`);
    }

    const json = (await response.json()) as DataForSeoResponse;
    const dfsTask = json.tasks?.[0];
    if (!dfsTask || dfsTask.status_code !== 20000) {
      return unavailable(
        dfsTask?.status_message ?? "DataForSEO task failed",
      );
    }

    const item = dfsTask.result?.[0]?.items?.[0];
    if (!item) {
      return unavailable("No Google Business Profile found");
    }

    return mapItem(item, context);
  } catch (error) {
    return unavailable(
      error instanceof Error ? error.message : "DataForSEO request failed",
    );
  } finally {
    clearTimeout(timer);
  }
}

function mapItem(
  item: MyBusinessItem,
  context: ScanContext,
): BusinessProfileScan {
  const rating = typeof item.rating?.value === "number" ? item.rating.value : undefined;
  const reviews =
    typeof item.rating?.votes_count === "number"
      ? item.rating.votes_count
      : undefined;

  const isClaimed = item.is_claimed === true;
  const hasCategory = Boolean(item.category);
  const hasWebsite = Boolean(item.url);
  const hasNap = Boolean(item.address) && Boolean(item.phone);

  // Reputation: rating quality, discounted by low review volume (a 5.0 with 3
  // reviews is weaker evidence than a 4.5 with 300).
  let reputation: number | undefined;
  if (typeof rating === "number") {
    const ratingScore = clamp01(rating / 5);
    const volumeConfidence = clamp01((reviews ?? 0) / 100);
    reputation = clamp01(ratingScore * (0.6 + 0.4 * volumeConfidence));
  }

  // Local SEO: presence and completeness of the Google Business Profile.
  const localSeo = clamp01(
    0.4 + // a profile exists at all
      (isClaimed ? 0.2 : 0) +
      (hasCategory ? 0.15 : 0) +
      (hasWebsite ? 0.1 : 0) +
      (hasNap ? 0.15 : 0),
  );

  const signals: ScannerSignals = { local_seo: localSeo };
  if (typeof reputation === "number") signals.reputation = reputation;

  const findings: Partial<Record<CategoryKey, BusinessProfileFinding[]>> = {
    local_seo: [
      { label: "Google Business Profile", ok: true },
      { label: "Claimed", ok: isClaimed },
      { label: "Category set", ok: hasCategory },
      { label: "Website linked", ok: hasWebsite },
    ],
    reputation: [
      {
        label: rating != null ? `${rating.toFixed(1)}★ rating` : "No rating",
        ok: (rating ?? 0) >= 4.3,
      },
      {
        label: `${reviews ?? 0} reviews`,
        ok: (reviews ?? 0) >= 50,
      },
    ],
  };

  void context;
  return {
    signals,
    findings,
    metrics: { rating, reviews },
    source: "dataforseo",
  };
}

/** Adapter to the generic Scanner interface used by the orchestrator. */
export const businessProfileScanner: Scanner = {
  name: "business_profile",
  async run(context: ScanContext): Promise<ScannerSignals> {
    const { signals } = await runBusinessProfileScan(context);
    return signals;
  },
};

// --- DataForSEO response shape (only the fields we read) -------------------

interface MyBusinessItem {
  rating?: { value?: number; votes_count?: number };
  category?: string;
  url?: string;
  address?: string;
  phone?: string;
  is_claimed?: boolean;
}

interface DataForSeoResponse {
  tasks?: Array<{
    status_code?: number;
    status_message?: string;
    result?: Array<{ items?: MyBusinessItem[] }> | null;
  }>;
}
