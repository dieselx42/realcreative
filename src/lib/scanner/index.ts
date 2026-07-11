import type { CategoryKey } from "@/lib/scoring/categories";

/**
 * Modular scanner services.
 *
 * Each scanner is responsible for gathering raw signals for one or more score
 * categories and returning a normalized 0..1 value per category it covers. The
 * scoring engine multiplies these by each category's `maxPoints`.
 *
 * For the MVP these are stubs that return `null` (meaning "no signal yet"), and
 * the engine falls back to deterministic placeholder scoring. The interfaces
 * below define the contract the real implementations should honor.
 */

export interface ScanContext {
  websiteUrl: string;
  city: string;
  onlineOrderingProvider: string | null;
}

/** A scanner's contribution: a 0..1 signal per category it can assess. */
export type ScannerSignals = Partial<Record<CategoryKey, number>>;

export interface Scanner {
  name: string;
  run(context: ScanContext): Promise<ScannerSignals>;
}

// TODO: Website Performance scanner — call Google PageSpeed Insights API and
//   map Core Web Vitals to a 0..1 signal for `website_performance`.
export const performanceScanner: Scanner = {
  name: "performance",
  async run() {
    return {};
  },
};

// TODO: Crawl scanner — use Playwright/Cheerio to crawl the homepage and menu,
//   detecting order buttons, contact capture, schema markup, and content depth
//   (feeds `conversion`, `online_ordering`, `retention_crm`, `brand_content`).
export const crawlScanner: Scanner = {
  name: "crawl",
  async run() {
    return {};
  },
};

// TODO: Local SEO scanner — use DataForSEO (or Google Business Profile) to read
//   local pack presence, NAP consistency, and category coverage (`local_seo`).
export const localSeoScanner: Scanner = {
  name: "local_seo",
  async run() {
    return {};
  },
};

// TODO: Reputation scanner — use DataForSEO reviews (or Google/Yelp) to read
//   review count, average rating, and response rate (`reputation`).
export const reputationScanner: Scanner = {
  name: "reputation",
  async run() {
    return {};
  },
};

/** All registered scanners. The orchestrator runs these and merges signals. */
export const SCANNERS: readonly Scanner[] = [
  performanceScanner,
  crawlScanner,
  localSeoScanner,
  reputationScanner,
];

/**
 * Run every scanner and merge their signals into a single map.
 *
 * TODO: Move this into a Trigger.dev background job so scans run asynchronously
 *   and the results page can poll for completion instead of blocking the
 *   request. For now it is unused by the MVP flow (scoring is deterministic).
 */
export async function runScanners(
  context: ScanContext,
): Promise<ScannerSignals> {
  const results = await Promise.all(
    SCANNERS.map((scanner) => scanner.run(context)),
  );

  return results.reduce<ScannerSignals>(
    (merged, signals) => ({ ...merged, ...signals }),
    {},
  );
}
