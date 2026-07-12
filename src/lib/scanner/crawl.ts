import "server-only";

import { load } from "cheerio";

import type { CategoryKey } from "@/lib/scoring/categories";
import type { Scanner, ScanContext, ScannerSignals } from "@/lib/scanner/types";

/**
 * Crawl scanner: fetches the homepage HTML and parses it with Cheerio to derive
 * signals for Conversion, Online Ordering, Retention/CRM, and Brand/Content.
 *
 * Cheerio (not a headless browser) keeps this lightweight and serverless-
 * friendly. The trade-off is it sees server-rendered HTML only; a fully client-
 * rendered SPA may expose little. When the page looks unanalyzable we return no
 * signal so the engine falls back to deterministic scoring rather than unfairly
 * penalizing the site.
 *
 * TODO: For JS-heavy sites, upgrade to a Playwright render (behind a background
 *   job) and reuse the same detection heuristics below.
 */

const DEFAULT_TIMEOUT_MS = 12_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; RestaurantGrowthScoreBot/1.0; +https://restaurantgrowthscore.com/bot)";

// Providers are matched against link hrefs (domains), not arbitrary page text,
// to avoid false positives like "square" in "Times Square" or "slice of pizza".

/** Direct (first-party / commission-light) online ordering provider domains. */
const DIRECT_ORDER_DOMAINS = [
  "toasttab.com",
  "chownow.com",
  "square.site",
  "squareup.com",
  "order.online",
  "olo.com",
  "getbento.com",
  "popmenu.com",
  "spoton.com",
  "menufy.com",
  "clover.com",
  "flipdish.com",
];

/** Marketplace aggregator domains (higher commission, they own the customer). */
const MARKETPLACE_DOMAINS = [
  "doordash.com",
  "ubereats.com",
  "grubhub.com",
  "seamless.com",
  "postmates.com",
  "slicelife.com",
];

export interface CrawlFinding {
  label: string;
  ok: boolean;
}

export interface CrawlScan {
  signals: ScannerSignals;
  /** Human-readable detected features per category, for display / debugging. */
  findings: Partial<Record<CategoryKey, CrawlFinding[]>>;
  source: "crawl" | "unavailable";
  error?: string;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

interface RunOptions {
  timeoutMs?: number;
}

export async function runCrawlScan(
  websiteUrl: string,
  options: RunOptions = {},
): Promise<CrawlScan> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(websiteUrl, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return unavailable(`Site responded ${response.status}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) {
      return unavailable(`Unexpected content-type: ${contentType || "unknown"}`);
    }

    const html = await response.text();
    return analyze(html, websiteUrl);
  } catch (error) {
    return unavailable(
      error instanceof Error ? error.message : "Crawl request failed",
    );
  } finally {
    clearTimeout(timer);
  }
}

function unavailable(error: string): CrawlScan {
  return { signals: {}, findings: {}, source: "unavailable", error };
}

function analyze(html: string, websiteUrl: string): CrawlScan {
  const $ = load(html);

  // Collect all links as lowercased (href, text) pairs once.
  const links = $("a")
    .toArray()
    .map((el) => {
      const $el = $(el);
      return {
        href: ($el.attr("href") ?? "").toLowerCase(),
        text: $el.text().trim().toLowerCase(),
      };
    });
  const linkMatches = (re: RegExp) =>
    links.some((l) => re.test(l.href) || re.test(l.text));

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const lowerHtml = html.toLowerCase();

  // If the page is essentially empty (likely a client-rendered SPA shell),
  // don't score it — return no signal so the engine falls back.
  if (bodyText.length < 200 && links.length < 3) {
    return unavailable("Page had too little server-rendered content to analyze");
  }

  // --- Detections ---------------------------------------------------------
  const hasOrderCta =
    linkMatches(/order\s*(online|now|here|food)|\border\b/) ||
    /order online|order now/.test(bodyText.toLowerCase());
  const hasPhone =
    $('a[href^="tel:"]').length > 0 || /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/.test(bodyText);
  const hasMenu = linkMatches(/\bmenu\b/);
  const hasReservation = linkMatches(
    /reserv|opentable|resy|tock|book\s*(a\s*)?table/,
  );

  const hrefIncludes = (needle: string) =>
    links.some((l) => l.href.includes(needle));
  const directOrder =
    DIRECT_ORDER_DOMAINS.some(hrefIncludes) ||
    linkMatches(/\/order(-online)?\/?($|\?)/);
  const marketplaceOrder = MARKETPLACE_DOMAINS.some(hrefIncludes);

  const hasEmailInput = $('input[type="email"]').length > 0;
  const hasSignupContext =
    /newsletter|sign\s*up|subscribe|mailing list|join (our )?(list|club|email)|stay in the loop/.test(
      bodyText.toLowerCase(),
    );
  const hasEsp = /mailchimp|klaviyo|constantcontact|list-manage|mc-embedded/.test(
    lowerHtml,
  );
  const hasLoyalty = /loyalty|rewards|earn points|punch card/.test(
    bodyText.toLowerCase(),
  );

  const imageCount = $("img").length;
  const hasMetaDescription =
    ($('meta[name="description"]').attr("content") ?? "").trim().length > 0;
  const hasOgImage = $('meta[property="og:image"]').length > 0;
  const hasSocial = linkMatches(/instagram\.com|facebook\.com|tiktok\.com/);
  const hasSchema = (() => {
    const blocks = $('script[type="application/ld+json"]')
      .toArray()
      .map((el) => $(el).text().toLowerCase());
    return blocks.some(
      (b) => b.includes("restaurant") || b.includes("foodestablishment"),
    );
  })();

  // --- Scoring per category (0..1) ---------------------------------------
  const conversion = clamp01(
    (hasOrderCta ? 0.4 : 0) +
      (hasPhone ? 0.2 : 0) +
      (hasMenu ? 0.2 : 0) +
      (hasReservation ? 0.2 : 0),
  );

  const onlineOrdering = clamp01(
    directOrder ? 1 : marketplaceOrder ? 0.55 : hasOrderCta ? 0.4 : 0.12,
  );

  const retention = clamp01(
    (hasEmailInput || hasEsp ? 0.6 : 0) +
      (hasSignupContext ? 0.25 : 0) +
      (hasLoyalty ? 0.25 : 0) || 0.1,
  );

  const brand = clamp01(
    Math.min(imageCount, 8) / 8 * 0.4 +
      (hasMetaDescription ? 0.15 : 0) +
      (hasOgImage ? 0.15 : 0) +
      (hasSocial ? 0.15 : 0) +
      (hasSchema ? 0.15 : 0),
  );

  const signals: ScannerSignals = {
    conversion,
    online_ordering: onlineOrdering,
    retention_crm: retention,
    brand_content: brand,
  };

  const findings: Partial<Record<CategoryKey, CrawlFinding[]>> = {
    conversion: [
      { label: "Order CTA", ok: hasOrderCta },
      { label: "Phone", ok: hasPhone },
      { label: "Menu link", ok: hasMenu },
      { label: "Reservations", ok: hasReservation },
    ],
    online_ordering: [
      { label: "Direct ordering", ok: directOrder },
      { label: "Marketplace", ok: marketplaceOrder },
    ],
    retention_crm: [
      { label: "Email capture", ok: hasEmailInput || hasEsp || hasSignupContext },
      { label: "Loyalty / rewards", ok: hasLoyalty },
    ],
    brand_content: [
      { label: `${imageCount} photos`, ok: imageCount >= 6 },
      { label: "Social links", ok: hasSocial },
      { label: "Schema markup", ok: hasSchema },
      { label: "Meta description", ok: hasMetaDescription },
    ],
  };

  // Ignore the URL beyond fetching; kept for signature symmetry / future use.
  void websiteUrl;

  return { signals, findings, source: "crawl" };
}

/** Adapter to the generic Scanner interface used by the orchestrator. */
export const crawlScanner: Scanner = {
  name: "crawl",
  async run({ websiteUrl }: ScanContext): Promise<ScannerSignals> {
    const { signals } = await runCrawlScan(websiteUrl);
    return signals;
  },
};
