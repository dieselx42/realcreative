import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-safe Supabase client. Uses the public anon key and is subject to
 * Row Level Security. Safe to import from client components.
 */
export function createBrowserSupabaseClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Copy .env.example to .env.local and fill in your Supabase keys.",
    );
  }

  return createClient(url, anonKey);
}
