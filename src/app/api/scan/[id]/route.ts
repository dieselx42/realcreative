import { NextResponse } from "next/server";

import { runScanners } from "@/lib/scanner";
import { generateScanResult } from "@/lib/scoring/engine";
import { getScanRequest } from "@/lib/store";

/**
 * Runs the scan for a scan request and returns the scored result as JSON. The
 * results page fetches this on the client so the (potentially slow) PageSpeed
 * call does not block the initial page render, and the API key stays on the
 * server.
 *
 * The website URL is resolved from the persisted scan when available, otherwise
 * from the `u` query param passed through by the results page — see the note in
 * submitLead (actions.ts) about stateless rendering without a database.
 *
 * TODO: Once scans run as Trigger.dev background jobs, this route should read a
 *   persisted scan_results row (and report status) instead of scanning inline.
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  const url = new URL(request.url);
  const scanRequest = await getScanRequest(params.id);
  const websiteUrl = scanRequest?.websiteUrl ?? url.searchParams.get("u");

  if (!websiteUrl) {
    return NextResponse.json(
      { error: "Unknown scan and no website URL provided." },
      { status: 404 },
    );
  }

  const signals = await runScanners({
    websiteUrl,
    city: undefined,
    onlineOrderingProvider: undefined,
  });

  const result = generateScanResult(params.id, websiteUrl, signals);
  return NextResponse.json(result);
}
