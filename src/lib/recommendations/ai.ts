import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { SCORE_CATEGORIES, type CategoryKey } from "@/lib/scoring/categories";
import type { CategoryScore, Recommendation } from "@/lib/types";

/**
 * AI-generated recommendations via the Claude API.
 *
 * Given the real scan findings (category scores, PageSpeed metrics, detected
 * site features, Google Business Profile stats), Claude writes five prioritized,
 * restaurant-specific recommendations that reference the actual numbers — rather
 * than the generic static templates.
 *
 * Requires ANTHROPIC_API_KEY. When it's absent, or the call fails, the caller
 * falls back to the static templates (src/lib/scoring/recommendations.ts) and
 * the reason is surfaced in `result.error` (and the scan meta) for debugging.
 * The model is overridable via ANTHROPIC_MODEL (defaults to Claude Opus 4.8).
 */

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

export function isAiRecommendationsConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const CATEGORY_KEYS = SCORE_CATEGORIES.map((c) => c.key) as [
  CategoryKey,
  ...CategoryKey[],
];

// Runtime validation of the model's JSON with the project's Zod (v3).
const ResponseSchema = z.object({
  recommendations: z.array(
    z.object({
      category: z.enum(CATEGORY_KEYS),
      title: z.string().min(1),
      detail: z.string().min(1),
    }),
  ),
});

export interface AiRecommendationInput {
  businessName?: string;
  city?: string;
  websiteUrl: string;
  categories: CategoryScore[];
  /** Arbitrary findings/metrics gathered by the scanners, for grounding. */
  findings: Record<string, unknown>;
}

export interface AiRecommendationsResult {
  recommendations: Recommendation[] | null;
  /** Why AI recs were not used (missing key, API error, bad output). */
  error?: string;
}

const SYSTEM_PROMPT = `You are a restaurant growth consultant reviewing an automated audit of a restaurant's online presence. You write specific, high-impact recommendations a busy owner can act on.

Rules:
- Return exactly 5 recommendations, ordered most impactful first (biggest score gaps and revenue impact).
- Ground every recommendation in the provided data: cite the actual metric, missing feature, rating, or score. Never invent facts not in the data.
- Be concrete and specific to THIS restaurant, not generic advice. Prefer a clear next step over platitudes.
- Keep each title short (max ~8 words) and each detail to 1-2 sentences.
- Choose the category that best matches each recommendation.

Respond with ONLY a JSON object, no prose and no markdown code fences, of exactly this shape:
{"recommendations":[{"category":"<one of: ${CATEGORY_KEYS.join(
  ", ",
)}>","title":"...","detail":"..."}]}`;

/** Pull the JSON object out of the model's text, tolerating stray fences/prose. */
function extractJsonObject(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  return start >= 0 && end > start ? body.slice(start, end + 1) : body;
}

export async function generateAiRecommendations(
  input: AiRecommendationInput,
): Promise<AiRecommendationsResult> {
  if (!isAiRecommendationsConfigured()) {
    return { recommendations: null, error: "ANTHROPIC_API_KEY not set" };
  }

  try {
    const client = new Anthropic();

    const userContent = JSON.stringify(
      {
        restaurant: input.businessName ?? "(unknown)",
        city: input.city ?? "(unknown)",
        website: input.websiteUrl,
        categoryScores: input.categories.map((c) => ({
          category: c.key,
          label: c.label,
          score: c.score,
          max: c.maxPoints,
        })),
        findings: input.findings,
      },
      null,
      2,
    );

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Here is the audit data for a restaurant. Write the five recommendations as JSON.\n\n${userContent}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return { recommendations: null, error: "No text in AI response" };
    }

    let json: unknown;
    try {
      json = JSON.parse(extractJsonObject(textBlock.text));
    } catch {
      return { recommendations: null, error: "AI response was not valid JSON" };
    }

    const parsed = ResponseSchema.safeParse(json);
    if (!parsed.success) {
      return {
        recommendations: null,
        error: `AI JSON failed schema: ${parsed.error.issues[0]?.message ?? "unknown"}`,
      };
    }

    const recommendations = parsed.data.recommendations
      .slice(0, 5)
      .map((rec, index) => ({
        category: rec.category,
        title: rec.title,
        detail: rec.detail,
        priority: index + 1,
      }));

    if (recommendations.length === 0) {
      return { recommendations: null, error: "AI returned no recommendations" };
    }

    return { recommendations };
  } catch (error) {
    console.error("AI recommendation generation failed", error);
    return {
      recommendations: null,
      error: error instanceof Error ? error.message : "AI request failed",
    };
  }
}
