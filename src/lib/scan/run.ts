import "server-only";

import {
  generateAiRecommendations,
  isAiRecommendationsConfigured,
} from "@/lib/recommendations/ai";
import { runBusinessProfileScan } from "@/lib/scanner/business-profile";
import { runCompetitorScan } from "@/lib/scanner/competitors";
import { runCrawlScan } from "@/lib/scanner/crawl";
import { runPerformanceScan } from "@/lib/scanner/performance";
import { generateScanResult } from "@/lib/scoring/engine";
import { computeRevenueImpact } from "@/lib/scoring/revenue";
import type { CategoryKey } from "@/lib/scoring/categories";
import type { ScannerSignals } from "@/lib/scanner/types";
import type { CrawlFinding, ScanResult, ScanResultMeta } from "@/lib/types";

/** Read whether a labelled crawl finding was detected (ok), by category + label prefix. */
function findingOk(
  findings: Partial<Record<CategoryKey, CrawlFinding[]>>,
  category: CategoryKey,
  labelStartsWith: string,
): boolean {
  const list = findings[category] ?? [];
  const match = list.find((f) =>
    f.label.toLowerCase().startsWith(labelStartsWith.toLowerCase()),
  );
  return Boolean(match?.ok);
}

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

  // Competitor benchmarking depends on the matched restaurant's category, so it
  // runs after the business-profile scan (not in the parallel batch above).
  const competitor = await runCompetitorScan({
    city,
    category: business.matched?.category,
    rating: business.metrics.rating,
    reviews: business.metrics.reviews,
    businessName,
    websiteUrl,
  });

  // Revenue framing is a pure calc from what the scanners already found.
  const revenue = computeRevenueImpact({
    reviews: business.metrics.reviews,
    hasDirectOrdering: findingOk(crawl.findings, "online_ordering", "Direct"),
    hasMarketplace: findingOk(crawl.findings, "online_ordering", "Marketplace"),
    hasEmailCapture: findingOk(crawl.findings, "retention_crm", "Email"),
    hasLoyalty: findingOk(crawl.findings, "retention_crm", "Loyalty"),
    lcpMs: performance.metrics.lcpMs,
  });

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
        localCompetitors:
          competitor.source === "dataforseo"
            ? {
                avgRating: competitor.avgRating,
                avgReviews: competitor.avgReviews,
                yourRank: competitor.rank,
                outOf: competitor.outOf,
                standing: competitor.standing,
              }
            : undefined,
        estimatedRevenueOpportunity: {
          monthlyLow: revenue.totalMonthlyLow,
          monthlyHigh: revenue.totalMonthlyHigh,
          opportunities: revenue.opportunities.map((o) => ({
            label: o.label,
            monthlyLow: o.monthlyLow,
            monthlyHigh: o.monthlyHigh,
          })),
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
    competitors:
      competitor.source === "dataforseo"
        ? {
            competitors: competitor.competitors,
            avgRating: competitor.avgRating,
            avgReviews: competitor.avgReviews,
            rank: competitor.rank,
            outOf: competitor.outOf,
            standing: competitor.standing,
            categoryLabel: competitor.categoryLabel,
          }
        : undefined,
    revenue,
  };

  return { result, meta };
}
