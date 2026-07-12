import { NextResponse } from "next/server";

import { runScanPipeline } from "@/lib/scan/run";
import {
  getScanRequest,
  getStoredScanResult,
  saveScanResult,
} from "@/lib/store";
import { isTriggerConfigured } from "@/lib/trigger";

/**
 * PageSpeed Insights runs a full Lighthouse audit server-side and often takes
 * 10-25s. When scanning inline, Vercel serverless functions default to a 10s
 * timeout (Hobby), which would kill the scan before it returns. Raise the
 * ceiling. (Hobby allows up to 60s.)
 */
export const maxDuration = 60;

/** How long to wait for the background job before self-healing with an inline scan. */
const BACKGROUND_GRACE_MS = 90_000;

/**
 * Returns the scored result for a scan.
 *
 * Three paths, in order:
 *   1. A completed result is already persisted (e.g. by the Trigger.dev
 *      background job) → return it.
 *   2. Trigger.dev is configured and the scan is still recent → the background
 *      job is presumably running; return {status:"processing"} so the results
 *      page keeps polling.
 *   3. Otherwise → run the scan inline (the default when Trigger.dev is not
 *      configured, and a self-heal if a background job never completed),
 *      persist it when possible, and return it.
 *
 * The response includes a `meta` block describing where each real signal came
 * from (open this route directly in a browser to inspect it).
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const url = new URL(request.url);
  const scanRequest = await getScanRequest(params.id);
  const websiteUrl = scanRequest?.websiteUrl ?? url.searchParams.get("u");
  const businessName = url.searchParams.get("n") ?? undefined;
  const city = url.searchParams.get("c") ?? undefined;

  if (!websiteUrl) {
    return NextResponse.json(
      { error: "Unknown scan and no website URL provided." },
      { status: 404 },
    );
  }

  // 1. Already-persisted result (background job finished, or a prior inline run).
  const stored = await getStoredScanResult(params.id);
  if (stored) {
    return NextResponse.json({
      status: "completed",
      ...stored.result,
      meta: stored.meta,
    });
  }

  // 2. Background job in flight — tell the client to keep polling.
  if (isTriggerConfigured() && scanRequest) {
    const ageMs = Date.now() - new Date(scanRequest.createdAt).getTime();
    if (ageMs < BACKGROUND_GRACE_MS) {
      return NextResponse.json({ status: "processing" }, { status: 202 });
    }
    // Fell through the grace window — the job likely failed; self-heal below.
  }

  // 3. Run inline (default / fallback), persist when a database is configured.
  const { result, meta } = await runScanPipeline({
    scanId: params.id,
    websiteUrl,
    businessName,
    city,
  });

  try {
    await saveScanResult(params.id, { result, meta });
  } catch (error) {
    console.error("Failed to persist inline scan result", error);
  }

  return NextResponse.json({ status: "completed", ...result, meta });
}
