import { notFound } from "next/navigation";

import { ResultsView } from "@/components/ResultsView";
import { generateScanResult } from "@/lib/scoring/engine";
import { getScanRequest } from "@/lib/store";

interface ResultsPageProps {
  params: { id: string };
}

export default async function ResultsPage({ params }: ResultsPageProps) {
  const scanRequest = await getScanRequest(params.id);

  if (!scanRequest) {
    notFound();
  }

  // MVP: scoring is deterministic and computed on the fly. Once real scans run
  // as background jobs, read the persisted scan_results row here instead and
  // show a "still processing" state while status !== "completed".
  const result = generateScanResult(scanRequest.id, scanRequest.websiteUrl);

  return <ResultsView websiteUrl={scanRequest.websiteUrl} result={result} />;
}
