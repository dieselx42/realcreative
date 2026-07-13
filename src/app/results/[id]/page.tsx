import { notFound } from "next/navigation";

import { ResultsView } from "@/components/ResultsView";
import { getScanRequest } from "@/lib/store";

interface ResultsPageProps {
  params: { id: string };
  searchParams: { u?: string; n?: string; c?: string; g?: string };
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

  // Prefer the query string (fresh scan), fall back to the stored scan context
  // so links from the admin (which carry no query params) still scan correctly.
  const businessName = searchParams.n ?? scanRequest?.businessName ?? undefined;
  const city = searchParams.c ?? scanRequest?.city ?? undefined;

  // The score is fetched client-side from /api/scan/[id] so the (potentially
  // slow) scanner calls run behind the scan animation instead of blocking this
  // render. Business name + city are forwarded for the Business Profile lookup.
  return (
    <ResultsView
      scanId={params.id}
      websiteUrl={websiteUrl}
      businessName={businessName}
      city={city}
      goal={searchParams.g}
    />
  );
}
