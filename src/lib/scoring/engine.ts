import {
  MAX_TOTAL_SCORE,
  SCORE_CATEGORIES,
  type CategoryKey,
} from "@/lib/scoring/categories";
import { RECOMMENDATION_LIBRARY } from "@/lib/scoring/recommendations";
import type { ScannerSignals } from "@/lib/scanner/types";
import type { CategoryScore, Recommendation, ScanResult } from "@/lib/types";

/**
 * Scoring engine.
 *
 * For each category, if a scanner supplied a real 0..1 signal it is used;
 * otherwise the engine falls back to a DETERMINISTIC value derived from the
 * website URL so the same restaurant always sees the same result and different
 * sites see plausibly different scores.
 *
 * As of the first real scanner, `website_performance` is driven by Google
 * PageSpeed when available; the remaining categories are still deterministic
 * placeholders.
 *
 * TODO: Add real scorers for the remaining categories (crawl, local SEO,
 *   reputation, retention, brand) so fewer categories rely on the fallback.
 */

/** Small, stable string hash (FNV-1a). Deterministic across runs. */
function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Convert to an unsigned 32-bit integer.
  return hash >>> 0;
}

/**
 * Derive a stable 0..1 fraction for a given category + seed. Mixing the
 * category key into the seed gives each category its own pseudo-random value.
 */
function fractionFor(seed: number, category: CategoryKey): number {
  const mixed = hashString(`${seed}:${category}`);
  // Keep results in a realistic 0.35..1.0 band so scores aren't demoralizing.
  const normalized = mixed / 0xffffffff;
  return 0.35 + normalized * 0.65;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function scoreCategories(
  websiteUrl: string,
  signals: ScannerSignals = {},
): CategoryScore[] {
  const seed = hashString(websiteUrl.toLowerCase());

  return SCORE_CATEGORIES.map((category) => {
    const signal = signals[category.key];
    const fraction =
      typeof signal === "number"
        ? clamp01(signal)
        : fractionFor(seed, category.key);
    const score = Math.round(category.maxPoints * fraction);
    return {
      key: category.key,
      label: category.label,
      score,
      maxPoints: category.maxPoints,
    };
  });
}

/**
 * Choose recommendations for the weakest categories. Lower percentage-of-max
 * categories surface first, so the "Top 5" naturally targets biggest gaps.
 *
 * TODO: Swap this rule-based selection for OpenAI-generated, restaurant-
 *   specific recommendations once the OpenAI integration lands.
 */
export function buildRecommendations(
  categories: CategoryScore[],
): Recommendation[] {
  const ranked = [...categories].sort(
    (a, b) => a.score / a.maxPoints - b.score / b.maxPoints,
  );

  return ranked
    .map((category, index) => {
      const template = RECOMMENDATION_LIBRARY[category.key];
      return {
        category: category.key,
        title: template.title,
        detail: template.detail,
        priority: index + 1,
      } satisfies Recommendation;
    })
    .sort((a, b) => a.priority - b.priority);
}

/** Run a full scoring pass for a scan request, blending any scanner signals. */
export function generateScanResult(
  scanRequestId: string,
  websiteUrl: string,
  signals: ScannerSignals = {},
): ScanResult {
  const categories = scoreCategories(websiteUrl, signals);
  const totalScore = categories.reduce((sum, c) => sum + c.score, 0);

  return {
    scanRequestId,
    totalScore,
    maxScore: MAX_TOTAL_SCORE,
    categories,
    recommendations: buildRecommendations(categories),
    generatedAt: new Date().toISOString(),
  };
}
