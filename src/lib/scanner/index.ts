import "server-only";

import { businessProfileScanner } from "@/lib/scanner/business-profile";
import { crawlScanner } from "@/lib/scanner/crawl";
import { performanceScanner } from "@/lib/scanner/performance";
import type { Scanner, ScanContext, ScannerSignals } from "@/lib/scanner/types";

export type { Scanner, ScanContext, ScannerSignals } from "@/lib/scanner/types";
export { runPerformanceScan } from "@/lib/scanner/performance";
export { runCrawlScan } from "@/lib/scanner/crawl";
export { runBusinessProfileScan } from "@/lib/scanner/business-profile";

/**
 * Modular scanner services.
 *
 * Each scanner gathers raw signals for one or more score categories and returns
 * a normalized 0..1 value per category it covers. The scoring engine multiplies
 * these by each category's `maxPoints`; categories with no signal fall back to
 * deterministic placeholder scoring.
 *
 * Real implementations:
 *   - performanceScanner: Google PageSpeed → Website Performance
 *   - crawlScanner: Cheerio homepage crawl → Conversion, Online Ordering,
 *     Retention/CRM, Brand/Content
 *   - businessProfileScanner: DataForSEO Google Business Profile → Local SEO,
 *     Reputation (falls back when credentials are absent)
 */

/** All registered scanners. The orchestrator runs these and merges signals. */
export const SCANNERS: readonly Scanner[] = [
  performanceScanner,
  crawlScanner,
  businessProfileScanner,
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
