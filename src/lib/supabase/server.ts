import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Resolve the Supabase project URL, tolerating the different names used by
 * various setups: our own `.env.example` uses NEXT_PUBLIC_SUPABASE_URL, while
 * Vercel's Supabase integration also provisions a bare SUPABASE_URL. Accepting
 * either means the app switches on whichever the integration created, instead
 * of silently staying in the no-database fallback.
 */
function resolveSupabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
}

function resolveServiceRoleKey(): string | undefined {
  return process.env.SUPABASE_SERVICE_ROLE_KEY;
}

/**
 * Server-only Supabase client using the service role key. This bypasses Row
 * Level Security, so it must NEVER be imported into a client component.
 *
 * Used by server actions / API routes to insert leads, restaurants, and scan
 * requests on behalf of anonymous visitors.
 */
export function createServiceSupabaseClient(): SupabaseClient {
  const url = resolveSupabaseUrl();
  const serviceRoleKey = resolveServiceRoleKey();

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase URL (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL) or " +
        "SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env.local and fill " +
        "in your Supabase keys, or connect the Supabase integration in Vercel.",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * True when Supabase env vars are configured. When false, the store falls back
 * to a no-database JSON file so the app is runnable without Supabase (e.g. a
 * first local `npm run dev`, or a demo deploy before the database is wired up).
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(resolveSupabaseUrl() && resolveServiceRoleKey());
}
