import type { CategoryKey } from "@/lib/scoring/categories";

/**
 * Shared application types. These loosely mirror the Supabase schema in
 * `supabase/migrations` but are intentionally hand-written for the MVP so we
 * are not blocked on generating types from a live database.
 *
 * TODO: Replace hand-written DB row types with generated types via
 *   `supabase gen types typescript` once the project is linked.
 */

export type ScanStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed";

export interface Lead {
  id: string;
  restaurantName: string;
  contactName: string;
  email: string;
  phone: string;
  city: string;
  createdAt: string;
}

export interface Restaurant {
  id: string;
  leadId: string;
  name: string;
  websiteUrl: string;
  city: string;
  numberOfLocations: number;
  onlineOrderingProvider: string | null;
  createdAt: string;
}

export interface ScanRequest {
  id: string;
  /** Null until the scan converts to a lead at the email gate. */
  leadId: string | null;
  /** Null until the scan converts to a lead at the email gate. */
  restaurantId: string | null;
  websiteUrl: string;
  /** Scan context captured up front (before a lead exists), for the admin. */
  businessName: string | null;
  city: string | null;
  status: ScanStatus;
  createdAt: string;
}

export interface CategoryScore {
  key: CategoryKey;
  label: string;
  score: number;
  maxPoints: number;
}

export interface Recommendation {
  category: CategoryKey;
  title: string;
  detail: string;
  /** 1 = highest impact. Used to order the "Top 5" list. */
  priority: number;
}

export interface ScanResult {
  scanRequestId: string;
  totalScore: number;
  maxScore: number;
  categories: CategoryScore[];
  recommendations: Recommendation[];
  generatedAt: string;
}

/** Core Web Vitals captured by the PageSpeed scanner (all optional). */
export interface PerformanceMetrics {
  lcpMs?: number;
  cls?: number;
  tbtMs?: number;
  fcpMs?: number;
}

/** A single detected (or missing) feature from the homepage crawl. */
export interface CrawlFinding {
  label: string;
  ok: boolean;
}

/**
 * Diagnostic metadata returned alongside a scan result by /api/scan, describing
 * where each real signal came from. Extra to the core scoring types.
 */
export interface ScanResultMeta {
  recommendations?: {
    source: "claude" | "template";
    error?: string;
  };
  performance?: {
    source: "pagespeed" | "unavailable";
    error?: string;
    metrics: PerformanceMetrics;
  };
  crawl?: {
    source: "crawl" | "unavailable";
    error?: string;
    findings: Partial<Record<CategoryKey, CrawlFinding[]>>;
    providers?: { name: string; type: "direct" | "marketplace" }[];
    pagesCrawled?: number;
  };
  businessProfile?: {
    source: "dataforseo" | "unavailable";
    error?: string;
    metrics: { rating?: number; reviews?: number };
    findings: Partial<Record<CategoryKey, CrawlFinding[]>>;
    query?: {
      keyword: string;
      locationName?: string;
      locationCode?: number;
      cityResolved: boolean;
      matchedBy?: "panel" | "website" | "name+city" | "name";
      candidatesConsidered?: number;
    };
  };
  reviews?: {
    responseRate?: number;
    responded?: number;
    sampled?: number;
    mostRecentDaysAgo?: number;
  };
  competitors?: {
    competitors: { name: string; rating?: number; reviews?: number; area?: string }[];
    avgRating?: number;
    avgReviews?: number;
    rank?: number;
    outOf?: number;
    standing?: "above" | "at" | "below";
    categoryLabel?: string;
  };
  revenue?: {
    opportunities: {
      key: string;
      label: string;
      monthlyLow: number;
      monthlyHigh: number;
      basis: string;
    }[];
    totalMonthlyLow: number;
    totalMonthlyHigh: number;
    annualLow: number;
    annualHigh: number;
    assumptions: {
      avgTicket: number;
      estMonthlyOrders: number;
      commissionRate: number;
    };
  };
}

/** The full /api/scan response: the scored result plus diagnostic meta. */
export type ScanApiResponse = ScanResult & { meta?: ScanResultMeta };
