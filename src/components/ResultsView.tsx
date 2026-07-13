"use client";

import { useEffect, useState } from "react";

import { LeadCaptureForm } from "@/components/LeadCaptureForm";
import { Logo } from "@/components/Logo";
import { ScoreDial } from "@/components/ScoreDial";
import { BRAND } from "@/lib/brand";
import { GOAL_OPTIONS } from "@/lib/validation";
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
  businessName?: string;
  city?: string;
  goal?: string;
}

const SCAN_STEPS = [
  "Loading your homepage…",
  "Checking mobile performance…",
  "Looking for online ordering…",
  "Reviewing local SEO & reviews…",
  "Comparing you to nearby restaurants…",
];

const CALENDLY_URL = process.env.NEXT_PUBLIC_CALENDLY_URL;
const SCREENSHOT_BASE =
  process.env.NEXT_PUBLIC_SCREENSHOT_BASE || "https://image.thum.io/get/width/1000/";

function matchLabel(m?: string): string {
  if (m === "website") return "matched to your website domain";
  if (m === "name+city") return "matched by name + city";
  if (m === "panel") return "matched to your Google listing";
  return "matched by name near your city";
}

type Tone = "good" | "ni" | "poor";

function toneClass(tone: Tone): string {
  if (tone === "good") return "border-green-200 bg-green-50 text-green-700";
  if (tone === "ni") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-red-200 bg-red-50 text-red-700";
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

/** Core Web Vitals from PageSpeed as color-graded chips (Google thresholds). */
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

/** Detected/missing features from the homepage crawl as chips. */
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
function LiveBadge({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "blue" | "amber";
}) {
  const cls =
    tone === "green"
      ? "bg-green-50 text-green-700"
      : tone === "blue"
        ? "bg-sky-50 text-sky-700"
        : "bg-amber-50 text-amber-700";
  const dot =
    tone === "green"
      ? "bg-green-500"
      : tone === "blue"
        ? "bg-sky-500"
        : "bg-amber-500";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

/** Confirms what we scanned: a homepage screenshot + the matched Google listing. */
function ScannedTargetPanel({
  websiteUrl,
  businessName,
  business,
}: {
  websiteUrl: string;
  businessName?: string;
  business?: ScanResultMeta["businessProfile"];
}) {
  const [imgOk, setImgOk] = useState(true);
  const matched = business?.source === "dataforseo" ? business : undefined;

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-bold text-ink">What we scanned</h2>
      <div className="mt-4 grid gap-5 sm:grid-cols-[220px,1fr] sm:items-center">
        {imgOk ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`${SCREENSHOT_BASE}${websiteUrl}`}
            alt={`Screenshot of ${websiteUrl}`}
            className="w-full rounded-lg border border-slate-200"
            loading="lazy"
            onError={() => setImgOk(false)}
          />
        ) : (
          <div className="flex aspect-[5/4] w-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-xs text-ink-muted">
            {websiteUrl}
          </div>
        )}
        <div className="text-sm">
          <div className="font-semibold text-ink">
            {businessName ?? "Your restaurant"}
          </div>
          <a
            href={websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-brand-600 hover:underline"
          >
            {websiteUrl}
          </a>
          {matched ? (
            <p className="mt-3 text-ink-soft">
              Google listing{" "}
              <span className="font-semibold text-ink">
                {typeof matched.metrics.rating === "number"
                  ? `${matched.metrics.rating.toFixed(1)}★`
                  : "—"}
              </span>
              {matched.metrics.reviews != null
                ? ` · ${matched.metrics.reviews.toLocaleString()} reviews`
                : ""}{" "}
              <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                {matchLabel(matched.query?.matchedBy)}
              </span>
            </p>
          ) : null}
          <p className="mt-2 text-xs text-ink-muted">
            Scored the wrong spot? Re-run with your full{" "}
            <span className="font-medium">City, State</span> so we match the right
            Google listing.
          </p>
        </div>
      </div>
    </section>
  );
}

/** How you stack up against same-category restaurants nearby — the hook. */
function CompetitorPanel({
  data,
  rating,
}: {
  data: NonNullable<ScanResultMeta["competitors"]>;
  rating?: number;
}) {
  const standingCopy =
    data.standing === "above"
      ? { text: "ahead of", tone: "text-green-700" }
      : data.standing === "below"
        ? { text: "behind", tone: "text-red-600" }
        : { text: "in line with", tone: "text-ink" };

  const peerLabel = data.categoryLabel
    ? `${data.categoryLabel.toLowerCase()}s nearby`
    : "nearby restaurants in your category";

  return (
    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold text-ink">
        How you compare to {peerLabel}
        <LiveBadge label="Live Google data" tone="amber" />
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Your rating
          </div>
          <div className="mt-1 text-2xl font-extrabold text-ink">
            {typeof rating === "number" ? `${rating.toFixed(1)}★` : "—"}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Local average
          </div>
          <div className="mt-1 text-2xl font-extrabold text-ink">
            {typeof data.avgRating === "number" ? `${data.avgRating.toFixed(1)}★` : "—"}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Your rank
          </div>
          <div className="mt-1 text-2xl font-extrabold text-ink">
            {data.rank && data.outOf ? `#${data.rank} of ${data.outOf}` : "—"}
          </div>
        </div>
      </div>

      {typeof rating === "number" && typeof data.avgRating === "number" ? (
        <p className="mt-4 text-sm text-ink-soft">
          Your {rating.toFixed(1)}★ is{" "}
          <span className={`font-semibold ${standingCopy.tone}`}>
            {standingCopy.text}
          </span>{" "}
          the {data.avgRating.toFixed(1)}★ average of {peerLabel}
          {data.avgReviews
            ? ` (who average ${data.avgReviews.toLocaleString()} reviews each)`
            : ""}
          .
        </p>
      ) : null}

      {data.competitors.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          {data.competitors.map((c, i) => (
            <div
              key={`${c.name}-${i}`}
              className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5 text-sm last:border-b-0"
            >
              <span className="min-w-0 truncate">
                <span className="text-ink">{c.name}</span>
                {c.area ? (
                  <span className="ml-2 text-xs text-ink-muted">{c.area}</span>
                ) : null}
              </span>
              <span className="flex-none font-medium text-ink-soft">
                {typeof c.rating === "number" ? `${c.rating.toFixed(1)}★` : "—"}
                <span className="ml-2 text-ink-muted">
                  {c.reviews != null ? `${c.reviews.toLocaleString()} reviews` : ""}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** Translates the score gaps into an estimated dollar opportunity. */
function RevenuePanel({ data }: { data: NonNullable<ScanResultMeta["revenue"]> }) {
  if (data.opportunities.length === 0) return null;
  return (
    <section className="mt-8 rounded-2xl border border-brand-200 bg-brand-50 p-6 shadow-sm">
      <h2 className="text-lg font-bold text-ink">
        What these gaps may be costing you
      </h2>
      <p className="mt-2 text-3xl font-extrabold text-brand-700">
        {money(data.totalMonthlyLow)}–{money(data.totalMonthlyHigh)}
        <span className="text-base font-semibold text-ink-soft"> / month</span>
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        Roughly {money(data.annualLow)}–{money(data.annualHigh)} a year in
        recoverable revenue.
      </p>

      <ul className="mt-4 space-y-2">
        {data.opportunities.map((o) => (
          <li
            key={o.key}
            className="rounded-xl border border-brand-100 bg-white p-3 text-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-semibold text-ink">{o.label}</span>
              <span className="flex-none font-semibold text-brand-700">
                {money(o.monthlyLow)}–{money(o.monthlyHigh)}/mo
              </span>
            </div>
            <p className="mt-1 text-ink-soft">{o.basis}</p>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-ink-muted">
        Estimates based on ~{data.assumptions.estMonthlyOrders.toLocaleString()}{" "}
        online orders/mo at a {money(data.assumptions.avgTicket)} average ticket.
        Book a review for a figure using your real numbers.
      </p>
    </section>
  );
}

/**
 * Plays a "scanning" animation while the real scan runs, then reveals the
 * report: score, local comparison, revenue impact, category breakdown, and a
 * gated action plan (unlocked by capturing the lead's email).
 */
export function ResultsView({
  scanId,
  websiteUrl,
  businessName,
  city,
  goal,
}: ResultsViewProps) {
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [meta, setMeta] = useState<ScanResultMeta | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    const query = new URLSearchParams({ u: websiteUrl });
    if (businessName) query.set("n", businessName);
    if (city) query.set("c", city);

    let attempts = 0;
    const MAX_ATTEMPTS = 40; // ~40 × 3s ≈ 2 min before giving up

    const poll = async () => {
      try {
        const res = await fetch(`/api/scan/${scanId}?${query.toString()}`);
        if (!res.ok && res.status !== 202) {
          throw new Error(`Scan failed (${res.status})`);
        }
        const data = (await res.json()) as ScanApiResponse & { status?: string };
        if (cancelled) return;

        if (data.status === "processing") {
          attempts += 1;
          if (attempts > MAX_ATTEMPTS) {
            setFailed(true);
            return;
          }
          setTimeout(poll, 3000);
          return;
        }

        setResult(data);
        setMeta(data.meta ?? null);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    poll();
    return () => {
      cancelled = true;
    };
  }, [scanId, websiteUrl, businessName, city, attempt]);

  useEffect(() => {
    const isLastStep = step >= SCAN_STEPS.length - 1;
    if (isLastStep) return;
    const timer = setTimeout(() => setStep((s) => s + 1), 700);
    return () => clearTimeout(timer);
  }, [step, result]);

  const revealed = result && step >= SCAN_STEPS.length - 1;
  const goalCategory = GOAL_OPTIONS.find((o) => o.value === goal)?.category;

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
          <h1 className="text-lg font-bold text-ink">Scoring your website</h1>
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

  if (!result) return null;

  const topRecommendations = result.recommendations.slice(0, 5);

  return (
    <main className="min-h-screen bg-slate-50 pb-16">
      <header className="border-b border-slate-200 bg-white print:hidden">
        <div className="container-page flex h-16 items-center justify-between">
          <a href="/">
            <Logo />
          </a>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-ink-muted sm:inline">
              Report for {websiteUrl}
            </span>
            <button
              type="button"
              onClick={() => window.print()}
              className="btn-secondary hidden sm:inline-flex"
            >
              Print / Save PDF
            </button>
          </div>
        </div>
      </header>

      <div className="container-page pt-10">
        {/* Print-only header, since the on-screen nav is hidden in the PDF. */}
        <div className="mb-4 hidden items-baseline justify-between border-b border-slate-200 pb-2 print:flex">
          <span className="text-base font-bold text-ink">
            {BRAND.name} — {businessName ?? websiteUrl}
          </span>
          <span className="text-xs text-ink-muted">{websiteUrl}</span>
        </div>

        <div className="grid gap-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10 lg:grid-cols-[auto,1fr] lg:items-center">
          <ScoreDial score={result.totalScore} max={result.maxScore} />
          <div>
            <h1 className="text-2xl font-extrabold text-ink sm:text-3xl">
              Your {BRAND.scoreName}
            </h1>
            <p className="mt-2 max-w-xl text-ink-soft">
              A preview score based on {websiteUrl}. See how you compare to nearby
              restaurants, what the gaps may be costing you, and the highest-impact
              fixes to win back orders.
            </p>
          </div>
        </div>

        {/* What we scanned — screenshot + matched Google listing */}
        <ScannedTargetPanel
          websiteUrl={websiteUrl}
          businessName={businessName}
          business={meta?.businessProfile}
        />

        {/* Competitor benchmarking */}
        {meta?.competitors ? (
          <CompetitorPanel
            data={meta.competitors}
            rating={meta.businessProfile?.metrics.rating}
          />
        ) : null}

        {/* Revenue impact */}
        {meta?.revenue ? <RevenuePanel data={meta.revenue} /> : null}

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
              const businessFindings =
                meta?.businessProfile?.source === "dataforseo"
                  ? meta.businessProfile.findings[category.key]
                  : undefined;
              const isGoal = category.key === goalCategory;
              return (
                <div
                  key={category.key}
                  className={`rounded-xl border bg-white p-4 ${
                    isGoal
                      ? "border-brand-400 ring-1 ring-brand-200"
                      : "border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                      {category.label}
                      {isGoal ? (
                        <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                          Your focus
                        </span>
                      ) : null}
                      {livePerf ? (
                        <LiveBadge label="Live PageSpeed" tone="green" />
                      ) : null}
                      {crawlFindings ? (
                        <LiveBadge label="Live site scan" tone="blue" />
                      ) : null}
                      {businessFindings ? (
                        <LiveBadge label="Live Google data" tone="amber" />
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
                  {businessFindings ? (
                    <CrawlFindings findings={businessFindings} />
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        {/* Recommendations — gated behind the email capture */}
        <section className="mt-10">
          <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold text-ink">
            Your Top 5 fixes
            {meta?.recommendations?.source === "claude" ? (
              <LiveBadge label="AI-tailored" tone="green" />
            ) : null}
          </h2>

          {unlocked ? (
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
          ) : (
            <div className="mt-4 grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:grid-cols-2 lg:items-center print:hidden">
              <div>
                <div
                  aria-hidden
                  className="pointer-events-none select-none space-y-2"
                >
                  {topRecommendations.slice(0, 3).map((rec, i) => (
                    <div
                      key={rec.category}
                      className={`rounded-lg border border-slate-200 bg-slate-50 p-3 ${
                        i === 0 ? "" : "blur-sm"
                      }`}
                    >
                      <h3 className="text-sm font-semibold text-ink">
                        {i === 0 ? rec.title : "•••••••••••••••••••"}
                      </h3>
                      <p className="mt-1 text-xs text-ink-soft">
                        {i === 0
                          ? rec.detail
                          : "••••••••••••••••••••••••••••••••••••••••••••"}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm font-medium text-ink">
                  Enter your details to unlock all 5 prioritized fixes for{" "}
                  {businessName ?? "your restaurant"}.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <LeadCaptureForm
                  context={{
                    restaurantName: businessName ?? "",
                    websiteUrl,
                    city: city ?? "",
                    goal,
                  }}
                  onUnlock={() => setUnlocked(true)}
                />
              </div>
            </div>
          )}
        </section>

        {/* CTA */}
        <section className="mt-10 rounded-2xl bg-ink px-6 py-10 text-center sm:px-10 print:hidden">
          <h2 className="text-2xl font-extrabold text-white">
            Ready to turn this score into more orders?
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-slate-300">
            Get a free 30-minute Growth Review. We&apos;ll walk through your
            report and build a prioritized plan for your restaurant.
          </p>
          <a
            href={
              CALENDLY_URL ??
              "mailto:hello@restaurantgrowthscore.com?subject=Schedule%20a%20Free%20Growth%20Review"
            }
            target={CALENDLY_URL ? "_blank" : undefined}
            rel={CALENDLY_URL ? "noopener noreferrer" : undefined}
            className="mt-6 inline-flex items-center justify-center rounded-lg bg-brand-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-brand-600"
          >
            Schedule a Free Growth Review
          </a>
        </section>
      </div>
    </main>
  );
}
