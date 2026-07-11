import Link from "next/link";

export default function ResultNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold text-ink">Scan not found</h1>
        <p className="mt-2 text-sm text-ink-soft">
          We couldn&apos;t find that scan. It may have expired, or the link is
          incorrect.
        </p>
        <Link href="/" className="btn-primary mt-6">
          Score a website
        </Link>
      </div>
    </main>
  );
}
