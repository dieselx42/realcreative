import Link from "next/link";

import { listScanRequests } from "@/lib/store";

export const dynamic = "force-dynamic";

// TODO: This admin view is intentionally unauthenticated for the MVP. Before
//   any real deployment, gate it behind Supabase Auth (or at minimum HTTP basic
//   auth / a shared secret) so lead data is not publicly readable.
export default async function AdminPage() {
  const scans = await listScanRequests();

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="container-page flex h-16 items-center justify-between">
          <span className="text-lg font-bold text-ink">
            Admin · Scan requests
          </span>
          <Link href="/" className="btn-secondary">
            Back to site
          </Link>
        </div>
      </header>

      <div className="container-page py-10">
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Placeholder admin view — not authenticated. Lock this down before
          deploying.
        </div>

        {scans.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-ink-muted">
            No scan requests yet. Submit the form on the{" "}
            <Link href="/" className="font-medium text-brand-600 underline">
              landing page
            </Link>{" "}
            to create one.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 font-semibold">Website</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Scan ID</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scans.map((scan) => (
                  <tr key={scan.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 text-ink-soft">
                      {new Date(scan.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-ink">{scan.websiteUrl}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-ink-soft">
                        {scan.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-muted">
                      {scan.id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/results/${scan.id}`}
                        className="font-medium text-brand-600 hover:underline"
                      >
                        View result
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
