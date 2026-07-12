/**
 * True when Trigger.dev is configured to run scans as background jobs. Requires
 * both a Trigger.dev secret key AND Supabase — the background task and the app
 * run in different processes, so they need a shared database to hand off
 * results. When false, scans run inline in the /api/scan route instead.
 */
export function isTriggerConfigured(): boolean {
  return Boolean(
    process.env.TRIGGER_SECRET_KEY &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
