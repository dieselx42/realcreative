import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client using the service role key. This bypasses Row
 * Level Security, so it must NEVER be imported into a client component.
 *
 * Used by server actions / API routes to insert leads, restaurants, and scan
 * requests on behalf of anonymous visitors.
 */
export function createServiceSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "Copy .env.example to .env.local and fill in your Supabase keys.",
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
 * True when Supabase env vars are configured. The MVP falls back to an
 * in-memory store when this is false so the app is runnable without a
 * database (e.g. a first local `npm run dev` before Supabase is set up).
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
