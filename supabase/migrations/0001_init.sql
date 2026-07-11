-- Restaurant Growth Score — initial schema
-- ---------------------------------------------------------------------------
-- Tables: leads, restaurants, scan_requests, scan_results, score_categories,
--         recommendations
--
-- Apply with the Supabase CLI:  supabase db push
-- or paste into the Supabase SQL editor.
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";

-- --- Enums -----------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'scan_status') then
    create type scan_status as enum ('pending', 'processing', 'completed', 'failed');
  end if;
end
$$;

-- --- leads ------------------------------------------------------------------
-- One row per person who submits the form (the marketing lead).
create table if not exists public.leads (
  id              uuid primary key default gen_random_uuid(),
  restaurant_name text        not null,
  contact_name    text        not null,
  email           text        not null,
  phone           text        not null,
  city            text        not null,
  created_at      timestamptz not null default now()
);

create index if not exists leads_email_idx on public.leads (email);

-- --- restaurants -----------------------------------------------------------
-- The restaurant/business tied to a lead.
create table if not exists public.restaurants (
  id                       uuid primary key default gen_random_uuid(),
  lead_id                  uuid not null references public.leads (id) on delete cascade,
  name                     text not null,
  website_url              text not null,
  city                     text not null,
  number_of_locations      integer not null default 1 check (number_of_locations >= 1),
  online_ordering_provider text,
  created_at               timestamptz not null default now()
);

create index if not exists restaurants_lead_id_idx on public.restaurants (lead_id);

-- --- scan_requests ---------------------------------------------------------
-- One scan job per submission. Drives the results page and admin list.
create table if not exists public.scan_requests (
  id            uuid primary key default gen_random_uuid(),
  lead_id       uuid not null references public.leads (id) on delete cascade,
  restaurant_id uuid not null references public.restaurants (id) on delete cascade,
  website_url   text not null,
  status        scan_status not null default 'pending',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists scan_requests_status_idx on public.scan_requests (status);
create index if not exists scan_requests_created_at_idx on public.scan_requests (created_at desc);

-- --- scan_results ----------------------------------------------------------
-- The overall result for a completed scan (one row per scan_request).
create table if not exists public.scan_results (
  id              uuid primary key default gen_random_uuid(),
  scan_request_id uuid not null unique references public.scan_requests (id) on delete cascade,
  total_score     integer not null check (total_score >= 0 and total_score <= 100),
  max_score       integer not null default 100,
  -- Raw scanner signals / metadata for debugging and future recomputation.
  raw             jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

-- --- score_categories ------------------------------------------------------
-- Reference table for the seven categories. Kept in sync with
-- src/lib/scoring/categories.ts (max_points must sum to 100).
create table if not exists public.score_categories (
  key         text primary key,
  label       text not null,
  max_points  integer not null check (max_points >= 0),
  description text not null,
  sort_order  integer not null default 0
);

-- Per-category score for a given scan result.
create table if not exists public.scan_category_scores (
  id             uuid primary key default gen_random_uuid(),
  scan_result_id uuid not null references public.scan_results (id) on delete cascade,
  category_key   text not null references public.score_categories (key),
  score          integer not null check (score >= 0),
  max_points     integer not null check (max_points >= 0),
  unique (scan_result_id, category_key)
);

-- --- recommendations -------------------------------------------------------
-- Recommendations generated for a scan result (ordered by priority).
create table if not exists public.recommendations (
  id             uuid primary key default gen_random_uuid(),
  scan_result_id uuid not null references public.scan_results (id) on delete cascade,
  category_key   text not null references public.score_categories (key),
  title          text not null,
  detail         text not null,
  priority       integer not null default 100,
  created_at     timestamptz not null default now()
);

create index if not exists recommendations_scan_result_idx
  on public.recommendations (scan_result_id, priority);

-- --- Seed: score_categories ------------------------------------------------
insert into public.score_categories (key, label, max_points, description, sort_order)
values
  ('website_performance', 'Website Performance', 15,
   'How fast and stable your site is on mobile — slow pages quietly lose orders.', 1),
  ('conversion', 'Conversion', 20,
   'How well your site turns visitors into orders and reservations.', 2),
  ('online_ordering', 'Online Ordering', 20,
   'Whether guests can order directly from you without friction or high commissions.', 3),
  ('local_seo', 'Local SEO', 15,
   'How easily nearby, hungry customers find you in search and maps.', 4),
  ('reputation', 'Reputation', 10,
   'Your review volume, rating, and how you respond to guests.', 5),
  ('retention_crm', 'Retention / CRM', 10,
   'Whether you capture guest contact info and bring them back again.', 6),
  ('brand_content', 'Brand / Content', 10,
   'How appetizing and trustworthy your brand, photos, and menu feel.', 7)
on conflict (key) do update
  set label = excluded.label,
      max_points = excluded.max_points,
      description = excluded.description,
      sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Writes happen via the service role key on the server, which bypasses RLS.
-- We enable RLS with no public policies so the anon key cannot read lead data.
-- TODO: Add authenticated admin policies once Supabase Auth is wired up.
alter table public.leads                enable row level security;
alter table public.restaurants          enable row level security;
alter table public.scan_requests        enable row level security;
alter table public.scan_results         enable row level security;
alter table public.scan_category_scores enable row level security;
alter table public.recommendations      enable row level security;

-- score_categories is non-sensitive reference data — allow public read.
alter table public.score_categories enable row level security;
drop policy if exists "score_categories are public" on public.score_categories;
create policy "score_categories are public"
  on public.score_categories for select
  using (true);
