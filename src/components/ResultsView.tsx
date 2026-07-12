"use client";

import { useEffect, useState } from "react";

import { ScoreDial } from "@/components/ScoreDial";
import type {
  CrawlFinding,
  PerformanceMetrics,
  ScanApiResponse,
  ScanResult,
  ScanResultMeta,
} from "@/lib/types";

interface ResultsViewProps {
  scanId: string;
  websiteUrl: string;
}

const SCAN_STEPS = [
  "Loading your homepage…",
  "Checking mobile performance…",
  "Looking for online ordering…",
  "Reviewing local SEO & reviews…",
  "Scoring customer capture…",
];

type Tone = "good" | "ni" | "poor";

function toneClass(tone: Tone): string {
  if (tone === "good") return "border-green-200 bg-green-50 text-green-700";
  if (tone === "ni") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-red-200 bg-red-50 text-red-700";
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

/**
 * Renders the real Core Web Vitals from PageSpeed as color-graded chips, using
 * Google's good / needs-improvement / poor thresholds. These are measured
 * values — seeing them makes it clear the Website Performance score is real.
 */
function PerformanceVitals({ metrics }: { metrics: PerformanceMetrics }) {
  const items: { label: string; value: string; tone: Tone }[] = [];

  if (typeof metrics.lcpMs === "number") {
    items.push({
      label: "LCP",
      value: seconds(metrics.lcpMs),
      tone: metrics.lcpMs <= 2500 ? "good" : metrics.lcpMs <= 4000 ? "ni" : "poor",
    });
  }
  if (typeof metrics.fcpMs === "number") {
    items.push({
      label: "FCP",
      value: seconds(metrics.fcpMs),
      tone: metrics.fcpMs <= 1800 ? "good" : metrics.fcpMs <= 3000 ? "ni" : "poor",
    });
  }
  if (typeof metrics.tbtMs === "number") {
    items.push({
      label: "TBT",
      value: `${Math.round(metrics.tbtMs)}ms`,
      tone: metrics.tbtMs <= 200 ? "good" : metrics.tbtMs <= 600 ? "ni" : "poor",
    });
  }
  if (typeof metrics.cls === "number") {
    items.push({
      label: "CLS",
      value: metrics.cls.toFixed(2),
      tone: metrics.cls <= 0.1 ? "good" : metrics.cls <= 0.25 ? "ni" : "poor",
    });
  }

  if (items.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {items.map((item) => (
        <span
          key={item.label}
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium ${toneClass(item.tone)}`}
        >
          <span className="opacity-70">{item.label}</span>
          {item.value}
        </span>
      ))}
    </div>
  );
}

/** Renders detected/missing features from the homepage crawl as chips. */
function CrawlFindings({ findings }: { findings: CrawlFinding[] }) {
  if (findings.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {findings.map((f) => (
        <span
          key={f.label}
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium ${
            f.ok
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-slate-200 bg-slate-50 text-slate-400"
          }`}
        >
          <span>{f.ok ? "✓" : "—"}</span>
          {f.label}
        </span>
      ))}
    </div>
  );
}

/** Small "live data" pill shown on categories backed by a real scanner. */
function LiveBadge({ label, tone }: { label: string; tone: "green" | "blue" }) {
  const cls =
    tone === "green"
      ? "bg-green-50 text-green-700"
      : "bg-sky-50 text-sky-700";
  const dot = tone === "green" ? "bg-green-500" : "bg-sky-500";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

/**
 * Plays a "scanning" animation while the real scan runs in /api/scan/[id],
 * then reveals the result. The animation holds on its last step until the
 * result arrives (PageSpeed can take several seconds), and surfaces a retry if
 * the request fails.
 *
 * TODO: When scans run as real background jobs, poll scan_requests status and
 *   stream real progress instead of stepping through fixed labels.
 */
export function ResultsView({ scanId, websiteUrl }: ResultsViewProps) {
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [meta, setMeta] = useState<ScanResultMeta | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Fetch the scored result once (re-run on retry).
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    const query = new URLSearchParams({ u: websiteUrl });
    fetch(`/api/scan/${scanId}?${query.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Scan failed (${res.status})`);
        return res.json() as Promise<ScanApiResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        setResult(data);
        setMeta(data.meta ?? null);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [scanId, websiteUrl, attempt]);

  // Advance the animation; hold on the final step until the result is in.
  useEffect(() => {
    const isLastStep = step >= SCAN_STEPS.length - 1;
    if (isLastStep && result) return;
    if (isLastStep && !result) return; // waiting on the fetch
    const timer = setTimeout(() => setStep((s) => s + 1), 700);
    return () => clearTimeout(timer);
  }, [step, result]);

  const revealed = result && step >= SCAN_STEPS.length - 1;

  if (failed) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-lg">
          <h1 className="text-lg font-bold text-ink">Scan didn&apos;t finish</h1>
          <p className="mt-1 text-sm text-ink-muted">
            We couldn&apos;t score {websiteUrl} just now.
          </p>
          <button
            type="button"
            onClick={() => {
              setStep(0);
              setResult(null);
              setAttempt((a) => a + 1);
            }}
            className="btn-primary mt-6"
          >
            Try again
          </button>
        </div>
      </main>
    );
  }

  if (!revealed) {
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

  // `revealed` implies a non-null result; this guard narrows the type for TS.
  if (!result) return null;

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
              const livePerf =
                category.key === "website_performance" &&
                meta?.performance?.source === "pagespeed"
                  ? meta.performance
                  : null;
              const crawlFindings =
                meta?.crawl?.source === "crawl"
                  ? meta.crawl.findings[category.key]
                  : undefined;
              return (
                <div
                  key={category.key}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                      {category.label}
                      {livePerf ? (
                        <LiveBadge label="Live PageSpeed" tone="green" />
                      ) : null}
                      {crawlFindings ? (
                        <LiveBadge label="Live site scan" tone="blue" />
                      ) : null}
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
                  {livePerf ? (
                    <PerformanceVitals metrics={livePerf.metrics} />
                  ) : null}
                  {crawlFindings ? (
                    <CrawlFindings findings={crawlFindings} />
                  ) : null}
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
