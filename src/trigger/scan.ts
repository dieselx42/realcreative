import { task } from "@trigger.dev/sdk";

import { runScanPipeline, type ScanPipelineInput } from "@/lib/scan/run";
import { saveScanResult } from "@/lib/store";

/**
 * Background scan task. Runs the full scan pipeline (PageSpeed, crawl,
 * DataForSEO, Claude recommendations) off the request path and persists the
 * result to Supabase, where the results page polls for it.
 *
 * Deploy with `npx trigger.dev@latest deploy` after setting the project ref in
 * trigger.config.ts. The task's env (Supabase, PageSpeed, DataForSEO, Anthropic
 * keys) is configured in the Trigger.dev dashboard, not in Vercel.
 */
export const scanWebsiteTask = task({
  id: "scan-website",
  // Scans can take a while (PageSpeed alone is 10-25s); give generous headroom.
  maxDuration: 180,
  run: async (payload: ScanPipelineInput) => {
    const { result, meta } = await runScanPipeline(payload);
    await saveScanResult(payload.scanId, { result, meta });
    return { scanId: payload.scanId, totalScore: result.totalScore };
  },
});
