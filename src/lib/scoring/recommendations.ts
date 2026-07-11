import type { CategoryKey } from "@/lib/scoring/categories";

/**
 * Static recommendation templates keyed by category. These are the fallback
 * copy shown when a category is a weak spot.
 *
 * TODO: This library is the seam for the OpenAI integration. Replace the
 *   static text with model-generated, restaurant-specific recommendations that
 *   reference the actual findings from the scanners.
 */
export const RECOMMENDATION_LIBRARY: Record<
  CategoryKey,
  { title: string; detail: string }
> = {
  website_performance: {
    title: "Speed up your site on mobile",
    detail:
      "Most restaurant traffic is mobile. Compress hero images, defer heavy scripts, and aim for a Largest Contentful Paint under 2.5s so hungry guests don't bounce.",
  },
  conversion: {
    title: "Make ordering the obvious next step",
    detail:
      "Add a persistent 'Order Now' button, put your phone number and hours above the fold, and remove competing links that distract from placing an order.",
  },
  online_ordering: {
    title: "Own your online ordering",
    detail:
      "Offer commission-free direct ordering alongside the marketplaces. Every order you capture directly protects your margin and your customer relationship.",
  },
  local_seo: {
    title: "Win the local map pack",
    detail:
      "Complete and verify your Google Business Profile, keep your name/address/phone consistent everywhere, and add location and menu schema to your site.",
  },
  reputation: {
    title: "Grow and respond to reviews",
    detail:
      "Ask happy guests for reviews with a QR code at checkout and reply to every review — volume and recency both lift your ranking and trust.",
  },
  retention_crm: {
    title: "Capture guest contact info",
    detail:
      "Add an email/SMS capture with an incentive (a free appetizer on the next visit) so you can bring guests back instead of paying to reach them again.",
  },
  brand_content: {
    title: "Make the food look irresistible",
    detail:
      "Invest in professional photos of your top dishes, keep your menu current and easy to scan, and tell your story so first-time visitors trust you.",
  },
};
