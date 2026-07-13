/**
 * Canonical definition of the seven My Restaurant Score categories.
 *
 * The `maxPoints` values are the source of truth for the total score and MUST
 * sum to 100. They are referenced by the scoring engine, the results page, and
 * the database seed. Keep this list and the `score_categories` table in sync.
 */

export type CategoryKey =
  | "website_performance"
  | "conversion"
  | "online_ordering"
  | "local_seo"
  | "reputation"
  | "retention_crm"
  | "brand_content";

export interface CategoryDefinition {
  key: CategoryKey;
  label: string;
  maxPoints: number;
  /** Short, customer-facing description shown on the results page. */
  description: string;
}

export const SCORE_CATEGORIES: readonly CategoryDefinition[] = [
  {
    key: "website_performance",
    label: "Website Performance",
    maxPoints: 15,
    description:
      "How fast and stable your site is on mobile — slow pages quietly lose orders.",
  },
  {
    key: "conversion",
    label: "Conversion",
    maxPoints: 20,
    description:
      "How well your site turns visitors into orders and reservations.",
  },
  {
    key: "online_ordering",
    label: "Online Ordering",
    maxPoints: 20,
    description:
      "Whether guests can order directly from you without friction or high commissions.",
  },
  {
    key: "local_seo",
    label: "Local SEO",
    maxPoints: 15,
    description:
      "How easily nearby, hungry customers find you in search and maps.",
  },
  {
    key: "reputation",
    label: "Reputation",
    maxPoints: 10,
    description: "Your review volume, rating, and how you respond to guests.",
  },
  {
    key: "retention_crm",
    label: "Retention / CRM",
    maxPoints: 10,
    description:
      "Whether you capture guest contact info and bring them back again.",
  },
  {
    key: "brand_content",
    label: "Brand / Content",
    maxPoints: 10,
    description:
      "How appetizing and trustworthy your brand, photos, and menu feel.",
  },
] as const;

/** Total possible score. Guaranteed to equal 100 by the assertion below. */
export const MAX_TOTAL_SCORE = SCORE_CATEGORIES.reduce(
  (sum, category) => sum + category.maxPoints,
  0,
);

// Fail fast during development/build if the point budget drifts from 100.
if (MAX_TOTAL_SCORE !== 100) {
  throw new Error(
    `Score category points must sum to 100, but got ${MAX_TOTAL_SCORE}.`,
  );
}

export function getCategory(key: CategoryKey): CategoryDefinition {
  const category = SCORE_CATEGORIES.find((c) => c.key === key);
  if (!category) {
    throw new Error(`Unknown score category: ${key}`);
  }
  return category;
}
