import { Logo } from "@/components/Logo";
import { ScanStartForm } from "@/components/ScanStartForm";
import { BRAND } from "@/lib/brand";
import { SCORE_CATEGORIES } from "@/lib/scoring/categories";

const HERO_BENEFITS = [
  {
    icon: "🏆",
    title: "See how you rank against nearby restaurants",
    desc: "Your Google rating and reviews, benchmarked against local competitors.",
  },
  {
    icon: "💸",
    title: "See what the gaps are costing you",
    desc: "An estimate of the monthly revenue you're leaving on the table.",
  },
  {
    icon: "✅",
    title: "Get your action plan",
    desc: "Five AI-tailored fixes for your restaurant, ranked by impact.",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="container-page flex h-16 items-center justify-between">
          <Logo compact />
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
              Get your {BRAND.scoreName} based on your website, online ordering,
              SEO, reviews, and how you stack up against nearby restaurants.
            </p>

            <ul className="mt-8 space-y-4">
              {HERO_BENEFITS.map((benefit) => (
                <li key={benefit.title} className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-100 text-base"
                  >
                    {benefit.icon}
                  </span>
                  <span>
                    <span className="font-semibold text-ink">
                      {benefit.title}
                    </span>
                    <span className="block text-sm text-ink-muted">
                      {benefit.desc}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            <p className="mt-6 text-sm text-ink-muted">
              <span className="font-medium text-ink-soft">What we check:</span>{" "}
              {SCORE_CATEGORIES.map((c) => c.label).join(" · ")}
            </p>
          </div>

          <div id="score" className="lg:pl-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg sm:p-8">
              <h2 className="text-xl font-bold text-ink">
                Score my website
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                See your score and how you rank against nearby restaurants —
                instantly, no email required.
              </p>
              <div className="mt-6">
                <ScanStartForm />
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white">
        <div className="container-page flex flex-col items-center justify-between gap-2 py-8 text-sm text-ink-muted sm:flex-row">
          <span>
            © {new Date().getFullYear()} {BRAND.name}
          </span>
          <a href="/admin" className="hover:text-ink">
            Admin
          </a>
        </div>
      </footer>
    </main>
  );
}
