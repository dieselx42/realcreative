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
 * falls back to the static templates (src/lib/scoring/recommendations.ts).
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

// JSON Schema for the model's structured output (the supported subset:
// object/array/string/enum + additionalProperties:false + required).
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    recommendations: {
      type: "array",
      description: "Exactly five recommendations, most impactful first.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          category: { type: "string", enum: CATEGORY_KEYS },
          title: { type: "string", description: "Short action (max ~8 words)" },
          detail: {
            type: "string",
            description:
              "1-2 sentences citing the restaurant's actual data and a concrete next step.",
          },
        },
        required: ["category", "title", "detail"],
      },
    },
  },
  required: ["recommendations"],
} as const;

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

const SYSTEM_PROMPT = `You are a restaurant growth consultant reviewing an automated audit of a restaurant's online presence. You write specific, high-impact recommendations a busy owner can act on.

Rules:
- Return exactly 5 recommendations, ordered most impactful first (biggest score gaps and revenue impact).
- Ground every recommendation in the provided data: cite the actual metric, missing feature, rating, or score. Never invent facts not in the data.
- Be concrete and specific to THIS restaurant, not generic advice. Prefer a clear next step over platitudes.
- Keep each title short and each detail to 1-2 sentences.
- Choose the category that best matches each recommendation.`;

export async function generateAiRecommendations(
  input: AiRecommendationInput,
): Promise<Recommendation[] | null> {
  if (!isAiRecommendationsConfigured()) return null;

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
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      output_config: {
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
        effort: "low",
      },
      messages: [
        {
          role: "user",
          content: `Here is the audit data for a restaurant. Write the five recommendations.\n\n${userContent}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;

    const parsed = ResponseSchema.safeParse(JSON.parse(textBlock.text));
    if (!parsed.success) return null;

    return parsed.data.recommendations.slice(0, 5).map((rec, index) => ({
      category: rec.category,
      title: rec.title,
      detail: rec.detail,
      priority: index + 1,
    }));
  } catch (error) {
    console.error("AI recommendation generation failed", error);
    return null;
  }
}
