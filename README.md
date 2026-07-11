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

## How scoring works today

1. The lead form (`src/components/LeadForm.tsx`) posts to the `submitLead`
   server action (`src/app/actions.ts`).
2. Validation runs via a shared Zod schema (`src/lib/validation.ts`).
3. A lead + restaurant + scan request are created (`src/lib/store.ts`).
4. The results page computes a **deterministic** score from the URL using the
   scoring engine (`src/lib/scoring/engine.ts`) so results are stable per site.

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
