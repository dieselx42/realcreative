import { notFound } from "next/navigation";

import { ResultsView } from "@/components/ResultsView";
import { generateScanResult } from "@/lib/scoring/engine";
import { getScanRequest } from "@/lib/store";

interface ResultsPageProps {
  params: { id: string };
  searchParams: { u?: string };
}

export default async function ResultsPage({
  params,
  searchParams,
}: ResultsPageProps) {
  // Prefer the persisted scan (when a database is configured). Fall back to the
  // website URL passed in the query string so the page still renders on
  // serverless without a database — see the note in submitLead (actions.ts).
  const scanRequest = await getScanRequest(params.id);
  const websiteUrl = scanRequest?.websiteUrl ?? searchParams.u;

  if (!websiteUrl) {
    notFound();
  }

  // MVP: scoring is deterministic and computed on the fly. Once real scans run
  // as background jobs, read the persisted scan_results row here instead and
  // show a "still processing" state while status !== "completed".
  const result = generateScanResult(params.id, websiteUrl);

  return <ResultsView websiteUrl={websiteUrl} result={result} />;
}
