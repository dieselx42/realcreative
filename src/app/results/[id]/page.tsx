import { notFound } from "next/navigation";

import { ResultsView } from "@/components/ResultsView";
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

  // The score is fetched client-side from /api/scan/[id] so the (potentially
  // slow) PageSpeed call runs behind the scan animation instead of blocking
  // this render.
  return <ResultsView scanId={params.id} websiteUrl={websiteUrl} />;
}
