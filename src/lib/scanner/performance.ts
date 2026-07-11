import "server-only";

import type { Scanner, ScanContext, ScannerSignals } from "@/lib/scanner/types";

/**
 * Website Performance scanner backed by the Google PageSpeed Insights API.
 *
 * PageSpeed runs Lighthouse and returns a performance score already normalized
 * to 0..1, which maps directly onto our `website_performance` category signal.
 *
 * The API works without a key but is heavily rate limited; set
 * GOOGLE_PAGESPEED_API_KEY for reliable results. Any failure (no key, rate
 * limit, timeout, network error, unreachable site) resolves to a null signal so
 * the scoring engine falls back to its deterministic placeholder for this
 * category instead of erroring.
 */

const DEFAULT_PAGESPEED_ENDPOINT =
  "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";

/** Overridable for tests or self-hosted/proxied PageSpeed deployments. */
function pagespeedEndpoint(): string {
  return process.env.PAGESPEED_ENDPOINT || DEFAULT_PAGESPEED_ENDPOINT;
}

/** PageSpeed/Lighthouse can be slow; cap how long we'll wait for it. */
const DEFAULT_TIMEOUT_MS = 20_000;

export interface PerformanceScan {
  /** Lighthouse performance score, 0..1, or null when unavailable. */
  signal: number | null;
  /** Core Web Vitals, when available, for display / future recomputation. */
  metrics: {
    lcpMs?: number;
    cls?: number;
    tbtMs?: number;
    fcpMs?: number;
  };
  source: "pagespeed" | "unavailable";
  error?: string;
}

interface RunOptions {
  timeoutMs?: number;
  strategy?: "mobile" | "desktop";
}

function numericAudit(
  audits: Record<string, { numericValue?: number }> | undefined,
  id: string,
): number | undefined {
  const value = audits?.[id]?.numericValue;
  return typeof value === "number" ? value : undefined;
}

export async function runPerformanceScan(
  websiteUrl: string,
  options: RunOptions = {},
): Promise<PerformanceScan> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, strategy = "mobile" } = options;

  const params = new URLSearchParams({
    url: websiteUrl,
    strategy,
    category: "performance",
  });
  const apiKey = process.env.GOOGLE_PAGESPEED_API_KEY;
  if (apiKey) params.set("key", apiKey);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${pagespeedEndpoint()}?${params.toString()}`, {
      signal: controller.signal,
      // Results are stable enough to cache briefly; avoids re-scanning on reload.
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return {
        signal: null,
        metrics: {},
        source: "unavailable",
        error: `PageSpeed responded ${response.status}`,
      };
    }

    const data = (await response.json()) as {
      lighthouseResult?: {
        categories?: { performance?: { score?: number } };
        audits?: Record<string, { numericValue?: number }>;
      };
    };

    const score = data.lighthouseResult?.categories?.performance?.score;
    if (typeof score !== "number") {
      return {
        signal: null,
        metrics: {},
        source: "unavailable",
        error: "PageSpeed returned no performance score",
      };
    }

    const audits = data.lighthouseResult?.audits;
    return {
      signal: Math.min(1, Math.max(0, score)),
      metrics: {
        lcpMs: numericAudit(audits, "largest-contentful-paint"),
        cls: numericAudit(audits, "cumulative-layout-shift"),
        tbtMs: numericAudit(audits, "total-blocking-time"),
        fcpMs: numericAudit(audits, "first-contentful-paint"),
      },
      source: "pagespeed",
    };
  } catch (error) {
    return {
      signal: null,
      metrics: {},
      source: "unavailable",
      error: error instanceof Error ? error.message : "PageSpeed request failed",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Adapter to the generic Scanner interface used by the orchestrator. */
export const performanceScanner: Scanner = {
  name: "performance",
  async run({ websiteUrl }: ScanContext): Promise<ScannerSignals> {
    const { signal } = await runPerformanceScan(websiteUrl);
    return signal === null ? {} : { website_performance: signal };
  },
};
