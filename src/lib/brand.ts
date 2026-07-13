/**
 * Single source of truth for the product's name and identity. Change it here
 * and it updates everywhere (headers, emails, metadata, print).
 */
export const BRAND = {
  /** Product name, spaced for prose. */
  name: "My Restaurant Score",
  /** Wordmark pieces for the styled logo: prefix + highlighted + suffix. */
  wordmark: { prefix: "My", highlight: "Restaurant", suffix: "Score" },
  /** What the number itself is called. */
  scoreName: "Restaurant Score",
  domain: "myrestaurantscore.com",
  url: "https://myrestaurantscore.com",
} as const;
