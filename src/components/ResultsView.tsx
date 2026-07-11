"use client";

import { useEffect, useState } from "react";

import { ScoreDial } from "@/components/ScoreDial";
import type { ScanResult } from "@/lib/types";

interface ResultsViewProps {
  websiteUrl: string;
  result: ScanResult;
}

const SCAN_STEPS = [
  "Loading your homepage…",
  "Checking mobile performance…",
  "Looking for online ordering…",
  "Reviewing local SEO & reviews…",
  "Scoring customer capture…",
];

/**
 * Renders a short simulated "scanning" animation, then reveals the mock result.
 *
 * TODO: When scans run as real background jobs, replace the timed simulation
 *   with polling of the scan_requests status and stream real progress.
 */
export function ResultsView({ websiteUrl, result }: ResultsViewProps) {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (step >= SCAN_STEPS.length) {
      const finish = setTimeout(() => setDone(true), 500);
      return () => clearTimeout(finish);
    }
    const timer = setTimeout(() => setStep((s) => s + 1), 700);
    return () => clearTimeout(timer);
  }, [step]);

  if (!done) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
          <div className="mx-auto mb-6 h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600" />
          <h1 className="text-lg font-bold text-ink">
            Scoring your website
          </h1>
          <p className="mt-1 truncate text-sm text-ink-muted">{websiteUrl}</p>
          <ul className="mt-6 space-y-2 text-left">
            {SCAN_STEPS.map((label, index) => (
              <li
                key={label}
                className={`flex items-center gap-2 text-sm transition ${
                  index < step ? "text-ink" : "text-ink-muted"
                }`}
              >
                <span
                  className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-xs ${
                    index < step
                      ? "bg-brand-100 text-brand-700"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {index < step ? "✓" : index + 1}
                </span>
                {label}
              </li>
            ))}
          </ul>
        </div>
      </main>
    );
  }

  const topRecommendations = result.recommendations.slice(0, 5);

  return (
    <main className="min-h-screen bg-slate-50 pb-16">
      <header className="border-b border-slate-200 bg-white">
        <div className="container-page flex h-16 items-center justify-between">
          <a href="/" className="text-lg font-bold text-ink">
            Restaurant<span className="text-brand-600">Growth</span>Score
          </a>
          <span className="hidden text-sm text-ink-muted sm:inline">
            Report for {websiteUrl}
          </span>
        </div>
      </header>

      <div className="container-page pt-10">
        <div className="grid gap-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10 lg:grid-cols-[auto,1fr] lg:items-center">
          <ScoreDial score={result.totalScore} max={result.maxScore} />
          <div>
            <h1 className="text-2xl font-extrabold text-ink sm:text-3xl">
              Your Restaurant Growth Score
            </h1>
            <p className="mt-2 max-w-xl text-ink-soft">
              This is a preview score based on {websiteUrl}. Below are your
              category breakdowns and the five highest-impact fixes to win back
              orders.
            </p>
            <p className="mt-4 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-800">
              Preview scores are estimates. Book a free review to get your
              verified score and a tailored action plan.
            </p>
          </div>
        </div>

        {/* Category scores */}
        <section className="mt-8">
          <h2 className="text-lg font-bold text-ink">Category breakdown</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {result.categories.map((category) => {
              const pct = Math.round(
                (category.score / category.maxPoints) * 100,
              );
              return (
                <div
                  key={category.key}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-ink">
                      {category.label}
                    </span>
                    <span className="text-sm font-semibold text-ink-soft">
                      {category.score}
                      <span className="text-ink-muted">
                        /{category.maxPoints}
                      </span>
                    </span>
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-brand-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Top recommendations */}
        <section className="mt-10">
          <h2 className="text-lg font-bold text-ink">
            Top 5 recommendations
          </h2>
          <ol className="mt-4 space-y-3">
            {topRecommendations.map((rec) => (
              <li
                key={rec.category}
                className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4"
              >
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
                  {rec.priority}
                </span>
                <div>
                  <h3 className="font-semibold text-ink">{rec.title}</h3>
                  <p className="mt-1 text-sm text-ink-soft">{rec.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* CTA */}
        <section className="mt-10 rounded-2xl bg-ink px-6 py-10 text-center sm:px-10">
          <h2 className="text-2xl font-extrabold text-white">
            Ready to turn this score into more orders?
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-slate-300">
            Get a free 30-minute Growth Review. We&apos;ll walk through your
            report and build a prioritized plan for your restaurant.
          </p>
          <a
            href="mailto:hello@restaurantgrowthscore.com?subject=Schedule%20a%20Free%20Growth%20Review"
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-brand-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
            Schedule a Free Growth Review
          </a>
        </section>
      </div>
    </main>
  );
}
