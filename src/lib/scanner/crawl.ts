import "server-only";

import { load } from "cheerio";

import type { CategoryKey } from "@/lib/scoring/categories";
import type { Scanner, ScanContext, ScannerSignals } from "@/lib/scanner/types";

/**
 * Crawl scanner: fetches the homepage (and its menu / order subpages) and parses
 * them with Cheerio to derive signals for Conversion, Online Ordering,
 * Retention/CRM, and Brand/Content — plus the specific ordering provider(s) in
 * use (Toast, ChowNow, DoorDash, …).
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
const MAX_SUBPAGES = 2; // menu / order pages fetched in addition to the homepage
// Use a real browser UA: many restaurant sites (Squarespace/Wix/Cloudflare)
// serve a 403 or a JS challenge to unknown bot user-agents, which would make
// the crawl come back empty. A standard Chrome UA gets the real HTML.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const BROWSER_HEADERS: Record<string, string> = {
  "user-agent": USER_AGENT,
  accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "upgrade-insecure-requests": "1",
  "sec-ch-ua": '"Chromium";v="126", "Google Chrome";v="126", "Not.A/Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
};

/**
 * Known online-ordering providers, matched against link hrefs (and page HTML)
 * by domain — not arbitrary page text — to avoid false positives like "square"
 * in "Times Square". `direct` = first-party / commission-light; `marketplace` =
 * aggregator that owns the customer and charges high commission.
 */
interface Provider {
  name: string;
  type: "direct" | "marketplace";
  match: string[];
}

const PROVIDERS: Provider[] = [
  { name: "Toast", type: "direct", match: ["toasttab.com", "toast.site"] },
  { name: "ChowNow", type: "direct", match: ["chownow.com"] },
  { name: "Square", type: "direct", match: ["square.site", "squareup.com"] },
  { name: "Olo", type: "direct", match: ["olo.com"] },
  { name: "Popmenu", type: "direct", match: ["popmenu.com"] },
  { name: "BentoBox", type: "direct", match: ["getbento.com"] },
  { name: "SpotOn", type: "direct", match: ["spoton.com"] },
  { name: "Menufy", type: "direct", match: ["menufy.com"] },
  { name: "Clover", type: "direct", match: ["clover.com"] },
  { name: "Flipdish", type: "direct", match: ["flipdish.com"] },
  { name: "Owner.com", type: "direct", match: ["order.online"] },
  { name: "DoorDash", type: "marketplace", match: ["doordash.com"] },
  { name: "Uber Eats", type: "marketplace", match: ["ubereats.com"] },
  { name: "Grubhub", type: "marketplace", match: ["grubhub.com", "seamless.com"] },
  { name: "Postmates", type: "marketplace", match: ["postmates.com"] },
  { name: "Slice", type: "marketplace", match: ["slicelife.com"] },
];

export interface CrawlFinding {
  label: string;
  ok: boolean;
}

export interface DetectedProvider {
  name: string;
  type: "direct" | "marketplace";
}

export interface CrawlScan {
  signals: ScannerSignals;
  /** Human-readable detected features per category, for display / debugging. */
  findings: Partial<Record<CategoryKey, CrawlFinding[]>>;
  source: "crawl" | "unavailable";
  error?: string;
  /** Ordering providers detected across the crawled pages. */
  providers?: DetectedProvider[];
  /** How many pages were fetched (homepage + subpages). */
  pagesCrawled?: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

interface RunOptions {
  timeoutMs?: number;
}

async function fetchHtml(
  url: string,
  timeoutMs: number,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: BROWSER_HEADERS,
      next: { revalidate: 300 },
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("html")) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function runCrawlScan(
  websiteUrl: string,
  options: RunOptions = {},
): Promise<CrawlScan> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  const homeHtml = await fetchHtml(websiteUrl, timeoutMs);
  if (homeHtml === null) {
    return unavailable("Could not fetch the homepage");
  }

  const $home = load(homeHtml);

  // Follow the menu / order links to catch ordering CTAs and providers that
  // live on a subpage rather than the homepage — a common restaurant pattern.
  const subUrls = findSubpageUrls($home, websiteUrl).slice(0, MAX_SUBPAGES);
  const subHtmls = (
    await Promise.all(subUrls.map((u) => fetchHtml(u, timeoutMs)))
  ).filter((h): h is string => h !== null);

  return analyze(homeHtml, subHtmls, websiteUrl);
}

/** Same-origin links that look like a menu or ordering page. */
function findSubpageUrls($: ReturnType<typeof load>, base: string): string[] {
  let origin: string;
  try {
    origin = new URL(base).origin;
  } catch {
    return [];
  }
  const seen = new Set<string>();
  const urls: string[] = [];
  $("a").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const text = $(el).text().trim().toLowerCase();
    if (!/menu|order/.test(href.toLowerCase()) && !/menu|order/.test(text)) return;
    let abs: URL;
    try {
      abs = new URL(href, base);
    } catch {
      return;
    }
    if (abs.origin !== origin) return; // stay on-site
    abs.hash = "";
    const key = abs.toString();
    if (key === base || key === `${base}/` || seen.has(key)) return;
    seen.add(key);
    urls.push(key);
  });
  return urls;
}

function unavailable(error: string): CrawlScan {
  return { signals: {}, findings: {}, source: "unavailable", error };
}

interface LinkPair {
  href: string;
  text: string;
}

function collectLinks($: ReturnType<typeof load>): LinkPair[] {
  return $("a")
    .toArray()
    .map((el) => {
      const $el = $(el);
      return {
        href: ($el.attr("href") ?? "").toLowerCase(),
        text: $el.text().trim().toLowerCase(),
      };
    });
}

function analyze(
  homeHtml: string,
  subHtmls: string[],
  websiteUrl: string,
): CrawlScan {
  const $ = load(homeHtml); // page-level signals come from the homepage

  // Links + raw HTML are aggregated across all crawled pages so ordering CTAs /
  // providers on a menu or order subpage are not missed.
  const allHtmlLower = [homeHtml, ...subHtmls].join(" \n ").toLowerCase();
  const links: LinkPair[] = [
    ...collectLinks($),
    ...subHtmls.flatMap((h) => collectLinks(load(h))),
  ];
  const linkMatches = (re: RegExp) =>
    links.some((l) => re.test(l.href) || re.test(l.text));
  const hrefIncludes = (needle: string) =>
    links.some((l) => l.href.includes(needle));

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const lowerHtml = homeHtml.toLowerCase();

  // If the homepage is essentially empty (likely a client-rendered SPA shell),
  // don't score it — return no signal so the engine falls back.
  if (bodyText.length < 200 && links.length < 3) {
    return unavailable("Page had too little server-rendered content to analyze");
  }

  // --- Ordering providers -------------------------------------------------
  // A provider is detected if any of its domains appears in a link href or
  // anywhere in the page HTML (widgets often inject an iframe/script).
  const detected: DetectedProvider[] = [];
  for (const p of PROVIDERS) {
    const hit = p.match.some(
      (d) => hrefIncludes(d) || allHtmlLower.includes(d),
    );
    if (hit) detected.push({ name: p.name, type: p.type });
  }
  const directProviders = detected.filter((p) => p.type === "direct");
  const marketplaceProviders = detected.filter((p) => p.type === "marketplace");

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

  // Direct ordering: a known direct provider, or a self-hosted /order path.
  const hasOrderPath = linkMatches(/\/order(-online)?\/?($|\?)/);
  const directOrder = directProviders.length > 0 || hasOrderPath;
  const marketplaceOrder = marketplaceProviders.length > 0;

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

  const directLabel = directProviders.length
    ? `Direct: ${directProviders.map((p) => p.name).join(", ")}`
    : "Direct ordering";
  const marketplaceLabel = marketplaceProviders.length
    ? `Marketplace: ${marketplaceProviders.map((p) => p.name).join(", ")}`
    : "Marketplace";

  const findings: Partial<Record<CategoryKey, CrawlFinding[]>> = {
    conversion: [
      { label: "Order CTA", ok: hasOrderCta },
      { label: "Phone", ok: hasPhone },
      { label: "Menu link", ok: hasMenu },
      { label: "Reservations", ok: hasReservation },
    ],
    online_ordering: [
      { label: directLabel, ok: directOrder },
      { label: marketplaceLabel, ok: marketplaceOrder },
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

  void websiteUrl;

  return {
    signals,
    findings,
    source: "crawl",
    providers: detected,
    pagesCrawled: 1 + subHtmls.length,
  };
}

/** Adapter to the generic Scanner interface used by the orchestrator. */
export const crawlScanner: Scanner = {
  name: "crawl",
  async run({ websiteUrl }: ScanContext): Promise<ScannerSignals> {
    const { signals } = await runCrawlScan(websiteUrl);
    return signals;
  },
};
