# Restaurant Growth Score

A lead-generation website scoring tool for restaurants. A restaurant owner
enters their website URL and contact details; the app scores the site out of
100, breaks the score into categories, generates recommendations, and stores
the lead + scan for follow-up.

This repository is the **initial project foundation** (MVP scaffold). Scoring is
deterministic placeholder logic today — the real scanners, external APIs, and AI
recommendations are stubbed with clearly marked `TODO`s.

## Stack

- **Next.js** (App Router) + **TypeScript**
- **Tailwind CSS**
- **Supabase / PostgreSQL**
- **Zod** for shared client/server validation
- **Vercel-ready** deployment

### Planned integrations (stubbed, see TODOs)

- **Trigger.dev** — run scans as background jobs
- **OpenAI** — generate restaurant-specific recommendations
- **Google PageSpeed Insights** — Website Performance scoring
- **DataForSEO** — Local SEO + Reputation signals
- **Playwright / Cheerio** — crawl the site for conversion & ordering signals

## Getting started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Fill in your Supabase project URL and keys (Dashboard → Project Settings → API).

> **You can skip this to try the app.** If Supabase env vars are not set, the
> app falls back to an in-memory store so you can run the full flow locally.
> Data is lost on restart — do not use the fallback in production.

### 3. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

- `/` — landing page + lead form
- `/results/[id]` — mock score + recommendations
- `/admin` — placeholder list of scan requests

## Database setup (Supabase)

The schema lives in [`supabase/migrations`](./supabase/migrations).

Using the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase init          # first time only, if you don't have supabase/config.toml
supabase link --project-ref <your-project-ref>
supabase db push       # applies supabase/migrations/*.sql
```

Or paste the contents of `supabase/migrations/0001_init.sql` into the Supabase
SQL editor and run it.

The migration creates: `leads`, `restaurants`, `scan_requests`, `scan_results`,
`scan_category_scores`, `score_categories`, and `recommendations`, seeds the
seven score categories, and enables Row Level Security. Writes go through the
server-side **service role** key; the public **anon** key cannot read lead data.

Also apply `0002_lead_goal.sql` (adds a `goal` column to `leads` for the landing
quiz). It's optional — the app writes the goal best-effort, so lead creation
still works if this migration hasn't been run.

## How the funnel works today

1. The landing form (`src/components/ScanStartForm.tsx`) collects only the
   restaurant name, website, city, and a one-question goal quiz, and posts to the
   `startScan` server action (`src/app/actions.ts`). No lead is created yet.
2. `startScan` redirects to the results page, which runs the scan and shows the
   score, the **local competitor comparison**, and the **estimated revenue
   impact** — no email required (Owner.com's grader model).
3. The Top-5 action plan is gated: `LeadCaptureForm` collects contact info and
   calls the `captureLead` action, which is where a lead is actually persisted
   (`src/lib/store.ts`).
4. Scoring blends real scanner signals with a **deterministic** baseline from the
   URL (`src/lib/scoring/engine.ts`) so results are stable per site.

The report's persuasion pieces live in `src/lib/scanner/competitors.ts`
(same-category benchmarking via DataForSEO) and `src/lib/scoring/revenue.ts`
(dollar-impact estimates). See `docs/ROADMAP.md` for the competitive teardown and
what's next.

The seven categories and their point budgets (which sum to 100) are the single
source of truth in `src/lib/scoring/categories.ts`:

| Category            | Points |
| ------------------- | ------ |
| Website Performance | 15     |
| Conversion          | 20     |
| Online Ordering     | 20     |
| Local SEO           | 15     |
| Reputation          | 10     |
| Retention / CRM     | 10     |
| Brand / Content     | 10     |

## Project structure

```
src/
  app/
    page.tsx                 Landing page + lead form
    actions.ts               submitLead server action
    results/[id]/page.tsx     Mock results page
    admin/page.tsx           Placeholder admin list
  components/
    LeadForm.tsx             Client form (validation feedback)
    ResultsView.tsx          Simulated scan + result UI
    ScoreDial.tsx            Circular score gauge
  lib/
    validation.ts            Shared Zod schema
    types.ts                 App-level types
    store.ts                 Persistence (Supabase + in-memory fallback)
    supabase/                Browser + server Supabase clients
    scoring/                 Categories, engine, recommendation templates
    scanner/                 Modular scanner service stubs (TODOs)
supabase/
  migrations/                SQL schema + seed
```

## Background scans with Trigger.dev (optional)

By default the scan runs **inline** when the results page loads (`/api/scan`).
With Trigger.dev configured, the scan instead runs as a **background job** off
the request path, writes its result to Supabase, and the results page polls for
it. This requires Supabase (the job and the app are separate processes and need
a shared database).

### Why (and when) you'd turn this on

A full scan is slow: PageSpeed's Lighthouse audit alone is ~10–25s, plus the
crawl and DataForSEO lookups. Running that **inline** means it happens during
the web request while the user waits, and serverless functions have a time
limit (60s on Vercel Hobby). For low traffic and normal sites this is fine —
the results page shows a scanning animation and polls until it's done — but a
slow site or a burst of traffic can push a scan past the limit and kill it.

Moving the scan to a **background job** removes that ceiling: the request
returns instantly, the heavy work runs on Trigger.dev's infrastructure with no
tight timeout, and you get retries + a dashboard of every job's status.

**You don't need this to launch.** Turn it on when:

- you're getting enough real traffic that you don't want each scan tying up a
  serverless function for 20–40s,
- scans get slower or heavier (e.g. adding a scraping proxy for bot-protected
  sites, or crawling multiple pages) and start approaching the 60s limit, or
- you want automatic retries and per-job observability.

Until then, the inline path handles everything and the code below stays dormant.

To enable it:

1. Create a Trigger.dev project and put its ref in `trigger.config.ts` (or set
   `TRIGGER_PROJECT_REF`).
2. In the Trigger.dev dashboard, set the task's runtime env vars (the same
   Supabase / PageSpeed / DataForSEO / Anthropic keys the app uses).
3. Deploy the task: `npx trigger.dev@latest deploy`.
4. Set `TRIGGER_SECRET_KEY` in the app's environment (Vercel).

The pieces: the task in `src/trigger/scan.ts`, the shared pipeline in
`src/lib/scan/run.ts`, enqueue in `src/app/actions.ts`, and the poll/self-heal
logic in `src/app/api/scan/[id]/route.ts`. If a job never completes, the API
route falls back to running the scan inline, so the app never gets stuck.

## Where future integrations plug in

Search the codebase for `TODO:` — the key seams are:

- `src/lib/scanner/index.ts` — real scanner implementations (PageSpeed,
  crawl, DataForSEO) and a Trigger.dev orchestrator.
- `src/lib/scoring/engine.ts` — replace deterministic scoring with real
  signal-based scoring.
- `src/lib/scoring/recommendations.ts` — swap static copy for OpenAI output.
- `src/app/actions.ts` — enqueue a background scan job after creating the
  scan request.
- `src/app/admin/page.tsx` — add authentication before deploying.

## Deploying to Vercel

1. Push this repo to GitHub.
2. Import the project in Vercel.
3. Add the environment variables from `.env.example` in the Vercel dashboard.
4. Deploy. No extra build configuration is required.
