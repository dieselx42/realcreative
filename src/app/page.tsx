import { LeadForm } from "@/components/LeadForm";
import { SCORE_CATEGORIES } from "@/lib/scoring/categories";

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="container-page flex h-16 items-center justify-between">
          <span className="text-lg font-bold text-ink">
            Restaurant<span className="text-brand-600">Growth</span>Score
          </span>
          <a href="#score" className="btn-secondary hidden sm:inline-flex">
            Get my score
          </a>
        </div>
      </header>

      <section className="relative overflow-hidden bg-gradient-to-b from-white to-slate-50">
        <div className="container-page grid gap-12 py-16 lg:grid-cols-2 lg:py-24">
          <div className="flex flex-col justify-center">
            <span className="mb-4 inline-flex w-fit items-center rounded-full bg-brand-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-700">
              Free website audit for restaurants
            </span>
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-ink sm:text-5xl">
              Find out if your restaurant website is costing you orders.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink-soft">
              Get a Restaurant Growth Score based on your website, online
              ordering, SEO, reviews, and customer capture system.
            </p>

            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {SCORE_CATEGORIES.map((category) => (
                <li
                  key={category.key}
                  className="flex items-start gap-2 text-sm text-ink-soft"
                >
                  <span
                    aria-hidden
                    className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-brand-100 text-brand-700"
                  >
                    ✓
                  </span>
                  <span>
                    <span className="font-medium text-ink">
                      {category.label}
                    </span>{" "}
                    <span className="text-ink-muted">
                      ({category.maxPoints} pts)
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div id="score" className="lg:pl-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg sm:p-8">
              <h2 className="text-xl font-bold text-ink">
                Score my website
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                Takes 30 seconds. Get your score out of 100 instantly.
              </p>
              <div className="mt-6">
                <LeadForm />
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="container-page flex flex-col items-center justify-between gap-2 py-8 text-sm text-ink-muted sm:flex-row">
          <span>
            © {new Date().getFullYear()} Restaurant Growth Score
          </span>
          <a href="/admin" className="hover:text-ink">
            Admin
          </a>
        </div>
      </footer>
    </main>
  );
}
