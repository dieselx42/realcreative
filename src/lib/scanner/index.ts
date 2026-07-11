import "server-only";

import { performanceScanner } from "@/lib/scanner/performance";
import type { Scanner, ScanContext, ScannerSignals } from "@/lib/scanner/types";

export type { Scanner, ScanContext, ScannerSignals } from "@/lib/scanner/types";
export { runPerformanceScan } from "@/lib/scanner/performance";

/**
 * Modular scanner services.
 *
 * Each scanner gathers raw signals for one or more score categories and returns
 * a normalized 0..1 value per category it covers. The scoring engine multiplies
 * these by each category's `maxPoints`; categories with no signal fall back to
 * deterministic placeholder scoring.
 *
 * `performanceScanner` is the first real implementation (Google PageSpeed). The
 * rest are still stubs returning `{}`.
 */

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
 * Run every scanner and merge their signals into a single map. A scanner that
 * throws is treated as "no signal" so one failing service never breaks a scan.
 *
 * TODO: Move this into a Trigger.dev background job so scans run asynchronously
 *   and the results page polls for completion, rather than running inline in
 *   the /api/scan request.
 */
export async function runScanners(
  context: ScanContext,
): Promise<ScannerSignals> {
  const results = await Promise.all(
    SCANNERS.map((scanner) =>
      scanner.run(context).catch((error) => {
        console.error(`Scanner "${scanner.name}" failed`, error);
        return {} as ScannerSignals;
      }),
    ),
  );

  return results.reduce<ScannerSignals>(
    (merged, signals) => ({ ...merged, ...signals }),
    {},
  );
}
