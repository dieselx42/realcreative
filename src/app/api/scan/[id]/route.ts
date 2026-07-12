import { NextResponse } from "next/server";

import { runBusinessProfileScan } from "@/lib/scanner/business-profile";
import { runCrawlScan } from "@/lib/scanner/crawl";
import { runPerformanceScan } from "@/lib/scanner/performance";
import { generateScanResult } from "@/lib/scoring/engine";
import type { ScannerSignals } from "@/lib/scanner/types";
import { getScanRequest } from "@/lib/store";

/**
 * PageSpeed Insights runs a full Lighthouse audit server-side and often takes
 * 10-25s. Vercel serverless functions default to a 10s timeout (Hobby), which
 * would kill the scan before it returns. Raise the ceiling so real results have
 * time to come back. (Hobby allows up to 60s.)
 */
export const maxDuration = 60;

/**
 * Runs the scan for a scan request and returns the scored result as JSON. The
 * results page fetches this on the client so the (potentially slow) PageSpeed
 * call does not block the initial page render, and the API key stays on the
 * server.
 *
 * The website URL is resolved from the persisted scan when available, otherwise
 * from the `u` query param passed through by the results page — see the note in
 * submitLead (actions.ts) about stateless rendering without a database.
 *
 * The response includes a `meta` block describing where each real signal came
 * from, so it is possible to tell a real PageSpeed score from the deterministic
 * fallback (open this route directly in a browser to inspect it).
 *
 * TODO: Once scans run as Trigger.dev background jobs, this route should read a
 *   persisted scan_results row (and report status) instead of scanning inline.
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const url = new URL(request.url);
  const scanRequest = await getScanRequest(params.id);
  const websiteUrl = scanRequest?.websiteUrl ?? url.searchParams.get("u");
  // Business name + city (for the Google Business Profile lookup) are passed
  // through as query params by the results page; see submitLead (actions.ts).
  const businessName = url.searchParams.get("n") ?? undefined;
  const city = url.searchParams.get("c") ?? undefined;

  if (!websiteUrl) {
    return NextResponse.json(
      { error: "Unknown scan and no website URL provided." },
      { status: 404 },
    );
  }

  // Real scanners run in parallel:
  //   - PageSpeed → Website Performance
  //   - homepage crawl → Conversion, Online Ordering, Retention/CRM, Brand
  //   - DataForSEO Google Business Profile → Local SEO, Reputation
  // Categories with no real signal fall back to deterministic scoring.
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

  const result = generateScanResult(params.id, websiteUrl, signals);

  return NextResponse.json({
    ...result,
    meta: {
      performance: {
        source: performance.source, // "pagespeed" | "unavailable"
        error: performance.error,
        metrics: performance.metrics,
      },
      crawl: {
        source: crawl.source, // "crawl" | "unavailable"
        error: crawl.error,
        findings: crawl.findings,
      },
      businessProfile: {
        source: business.source, // "dataforseo" | "unavailable"
        error: business.error,
        metrics: business.metrics,
        findings: business.findings,
      },
    },
  });
}
