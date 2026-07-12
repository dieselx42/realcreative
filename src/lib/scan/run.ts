import "server-only";

import {
  generateAiRecommendations,
  isAiRecommendationsConfigured,
} from "@/lib/recommendations/ai";
import { runBusinessProfileScan } from "@/lib/scanner/business-profile";
import { runCrawlScan } from "@/lib/scanner/crawl";
import { runPerformanceScan } from "@/lib/scanner/performance";
import { generateScanResult } from "@/lib/scoring/engine";
import type { ScannerSignals } from "@/lib/scanner/types";
import type { ScanResult, ScanResultMeta } from "@/lib/types";

/**
 * The full scan pipeline, extracted so it can run in two places:
 *   - inline in the /api/scan route (the default / fallback), and
 *   - inside the Trigger.dev background task (src/trigger/scan.ts).
 *
 * Runs the real scanners in parallel, blends their signals into the score,
 * upgrades the recommendations with Claude when configured, and returns the
 * scored result plus diagnostic meta.
 */

export interface ScanPipelineInput {
  scanId: string;
  websiteUrl: string;
  businessName?: string;
  city?: string;
}

export interface ScanPipelineOutput {
  result: ScanResult;
  meta: ScanResultMeta;
}

export async function runScanPipeline(
  input: ScanPipelineInput,
): Promise<ScanPipelineOutput> {
  const { scanId, websiteUrl, businessName, city } = input;

  const [performance, crawl, business] = await Promise.all([
    runPerformanceScan(websiteUrl),
    runCrawlScan(websiteUrl),
    runBusinessProfileScan({ websiteUrl, businessName, city }),
  ]);

  const signals: ScannerSignals = {
    ...(performance.signal === null
      ? {}
      : { website_performance: performance.signal }),
    ...crawl.signals,
    ...business.signals,
  };

  const result = generateScanResult(scanId, websiteUrl, signals);

  let recommendationSource: "claude" | "template" = "template";
  let recommendationError: string | undefined;
  if (isAiRecommendationsConfigured()) {
    const aiRecs = await generateAiRecommendations({
      businessName,
      city,
      websiteUrl,
      categories: result.categories,
      findings: {
        performance: { source: performance.source, metrics: performance.metrics },
        crawl: { source: crawl.source, findings: crawl.findings },
        googleBusinessProfile: {
          source: business.source,
          metrics: business.metrics,
          findings: business.findings,
        },
      },
    });
    if (aiRecs.recommendations) {
      result.recommendations = aiRecs.recommendations;
      recommendationSource = "claude";
    } else {
      recommendationError = aiRecs.error;
    }
  }

  const meta: ScanResultMeta = {
    recommendations: { source: recommendationSource, error: recommendationError },
    performance: {
      source: performance.source,
      error: performance.error,
      metrics: performance.metrics,
    },
    crawl: {
      source: crawl.source,
      error: crawl.error,
      findings: crawl.findings,
    },
    businessProfile: {
      source: business.source,
      error: business.error,
      metrics: business.metrics,
      findings: business.findings,
      query: business.query,
    },
  };

  return { result, meta };
}
