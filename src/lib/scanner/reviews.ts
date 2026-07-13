import "server-only";

/**
 * Review-response + recency signals from DataForSEO's Google Reviews API.
 *
 * Two reputation signals that go beyond the star rating:
 *   - response rate: what share of recent reviews the owner replied to
 *     (`owner_answer`) — a strong "engaged owner" signal Google itself rewards.
 *   - recency: how long since the most recent review (an active vs. stale
 *     listing).
 *
 * IMPORTANT: Google Reviews has no synchronous/live endpoint — it's a
 * task_post → poll task_get flow that can take longer than an inline request
 * allows. So this is BEST-EFFORT with a time budget: inline it may not finish
 * (and we skip the signal); in the Trigger.dev background job the budget is
 * large enough to complete. Any failure/timeout resolves to `unavailable`, so
 * the reputation score simply falls back to rating + volume.
 */

const POST_ENDPOINT =
  "https://api.dataforseo.com/v3/business_data/google/reviews/task_post";
const GET_ENDPOINT =
  "https://api.dataforseo.com/v3/business_data/google/reviews/task_get/advanced";
const DEFAULT_BUDGET_MS = 12_000;
const POLL_INTERVAL_MS = 2_000;
const DEPTH = 20; // number of recent reviews to sample

export interface ReviewsInsights {
  source: "dataforseo" | "unavailable";
  error?: string;
  /** How many recent reviews we sampled. */
  sampled?: number;
  /** How many of those had an owner response. */
  responded?: number;
  /** responded / sampled, 0..1. */
  responseRate?: number;
  /** Days since the most recent review. */
  mostRecentDaysAgo?: number;
}

export interface ReviewsInput {
  cid?: string;
  placeId?: string;
  /** Total budget for the post + poll cycle. */
  budgetMs?: number;
}

interface ReviewItem {
  owner_answer?: string | null;
  timestamp?: string | null;
}

interface ReviewsTaskResponse {
  tasks?: Array<{
    id?: string;
    status_code?: number;
    status_message?: string;
    result?: Array<{ items?: ReviewItem[] }> | null;
  }>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const unavailable = (error: string): ReviewsInsights => ({ source: "unavailable", error });

export async function runReviewsInsights(
  input: ReviewsInput,
): Promise<ReviewsInsights> {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) return unavailable("DataForSEO credentials not configured");
  if (!input.cid && !input.placeId) return unavailable("No cid/place_id to look up reviews");

  const auth = Buffer.from(`${login}:${password}`).toString("base64");
  const budgetMs = input.budgetMs ?? DEFAULT_BUDGET_MS;
  const deadline = Date.now() + budgetMs;

  const task: Record<string, unknown> = {
    language_code: "en",
    location_code: 2840,
    depth: DEPTH,
    sort_by: "newest",
  };
  if (input.placeId) task.place_id = input.placeId;
  else if (input.cid) task.cid = input.cid;

  try {
    const postRes = await fetchJson(POST_ENDPOINT, auth, [task], deadline);
    const taskId = postRes?.tasks?.[0]?.id;
    if (!taskId) return unavailable("Reviews task was not created");

    // Poll until the task is ready or we run out of budget.
    while (Date.now() < deadline) {
      await sleep(Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())));
      if (Date.now() >= deadline) break;
      const getRes = await fetchJson(`${GET_ENDPOINT}/${taskId}`, auth, null, deadline);
      const dfsTask = getRes?.tasks?.[0];
      if (dfsTask?.status_code === 20000) {
        const items = dfsTask.result?.[0]?.items ?? [];
        return summarize(items);
      }
      // Any terminal error status (not "in queue / in progress") → give up.
      if (
        typeof dfsTask?.status_code === "number" &&
        dfsTask.status_code >= 40000 &&
        dfsTask.status_code !== 40602 &&
        dfsTask.status_code !== 40601
      ) {
        return unavailable(dfsTask.status_message ?? "Reviews task failed");
      }
    }
    return unavailable("Reviews task did not finish in time (needs background job)");
  } catch (error) {
    return unavailable(
      error instanceof Error ? error.message : "Reviews request failed",
    );
  }
}

async function fetchJson(
  url: string,
  auth: string,
  body: unknown | null,
  deadline: number,
): Promise<ReviewsTaskResponse | null> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Math.max(1_000, deadline - Date.now()),
  );
  try {
    const res = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: {
        authorization: `Basic ${auth}`,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as ReviewsTaskResponse;
  } finally {
    clearTimeout(timer);
  }
}

function summarize(items: ReviewItem[]): ReviewsInsights {
  if (items.length === 0) return unavailable("No reviews returned");

  const responded = items.filter(
    (i) => typeof i.owner_answer === "string" && i.owner_answer.trim().length > 0,
  ).length;

  let mostRecentDaysAgo: number | undefined;
  const times = items
    .map((i) => (i.timestamp ? Date.parse(i.timestamp) : NaN))
    .filter((t) => Number.isFinite(t));
  if (times.length > 0) {
    const newest = Math.max(...times);
    mostRecentDaysAgo = Math.max(0, Math.round((Date.now() - newest) / 86_400_000));
  }

  return {
    source: "dataforseo",
    sampled: items.length,
    responded,
    responseRate: items.length ? responded / items.length : undefined,
    mostRecentDaysAgo,
  };
}
