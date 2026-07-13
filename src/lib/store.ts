import "server-only";

import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  createServiceSupabaseClient,
  isSupabaseConfigured,
} from "@/lib/supabase/server";
import type { LeadFormData } from "@/lib/validation";
import type { ScanRequest, ScanResult, ScanResultMeta } from "@/lib/types";

/** The scored result + diagnostic meta persisted for a completed scan. */
export interface StoredScanResult {
  result: ScanResult;
  meta: ScanResultMeta;
}

/**
 * Persistence layer for scans / leads / restaurants.
 *
 * A scan is recorded the moment it starts (`logScan`), keyed on the id the
 * results page uses, with no lead attached yet — so the admin sees every scan,
 * not just the ones that convert. When a visitor completes the email gate the
 * scan is *attached* to a freshly-created lead (`attachLeadToScan`).
 *
 * Two backends:
 *   1. Supabase (when env vars are configured) — the real store.
 *   2. A local JSON file (dev fallback) — lets the app run end-to-end before
 *      Supabase is set up, WITHOUT a database.
 *
 * The file fallback is intentional: Next.js bundles each route separately in
 * production, so a plain in-memory Map is NOT shared between the server action
 * (writer) and the results/admin pages (readers). A file on disk is shared by
 * every route in a single running server. It is a local convenience only —
 * on serverless (Vercel) the filesystem is ephemeral/per-invocation, so
 * configure Supabase for any real deployment.
 *
 * The public functions return plain app types so callers don't care which
 * backend is active.
 */

interface StoredScan {
  scanRequest: ScanRequest;
  /** Set once the scan converts to a lead at the email gate. */
  lead: LeadFormData | null;
  /** Set once the scan is scored (fallback backend only). */
  result?: StoredScanResult;
}

// --- JSON file fallback ----------------------------------------------------

const FALLBACK_DIR = join(tmpdir(), "restaurant-growth-score");
const FALLBACK_FILE = join(FALLBACK_DIR, "scans.json");

function readFallback(): Record<string, StoredScan> {
  try {
    if (!existsSync(FALLBACK_FILE)) return {};
    return JSON.parse(readFileSync(FALLBACK_FILE, "utf8")) as Record<
      string,
      StoredScan
    >;
  } catch {
    return {};
  }
}

function writeFallback(scans: Record<string, StoredScan>): void {
  mkdirSync(FALLBACK_DIR, { recursive: true });
  writeFileSync(FALLBACK_FILE, JSON.stringify(scans, null, 2), "utf8");
}

// --- Public API ------------------------------------------------------------

/** The lead data plus an optional goal from the landing quiz. */
export type LeadInput = LeadFormData & { goal?: string | null };

/** Context captured up front, at scan time, before any lead exists. */
export interface ScanLogInput {
  scanId: string;
  websiteUrl: string;
  businessName?: string | null;
  city?: string | null;
}

/**
 * Record a scan the moment it starts — keyed on the id the results page uses,
 * with no lead attached yet. This gives the admin visibility into every scan
 * and gives `saveScanResult` a row to attach the score to. Best-effort by
 * contract: callers should not block the funnel if logging fails (e.g. the
 * 0003 migration hasn't been applied yet).
 */
export async function logScan(input: ScanLogInput): Promise<void> {
  if (isSupabaseConfigured()) {
    await logScanInSupabase(input);
    return;
  }
  logScanInFallback(input);
}

/**
 * Attach a captured lead to the scan started by `logScan`. If that scan row
 * isn't found (logging was skipped, the DB predates migration 0003, or the
 * fallback was lost), fall back to creating the lead + scan together — the
 * pre-logging behavior — so the gate never fails to record a lead.
 */
export async function attachLeadToScan(
  scanId: string | null,
  data: LeadInput,
): Promise<ScanRequest> {
  if (isSupabaseConfigured()) {
    return attachLeadInSupabase(scanId, data);
  }
  return attachLeadInFallback(scanId, data);
}

export async function getScanRequest(
  id: string,
): Promise<ScanRequest | null> {
  if (isSupabaseConfigured()) {
    return getScanRequestFromSupabase(id);
  }
  return readFallback()[id]?.scanRequest ?? null;
}

export async function listScanRequests(): Promise<ScanRequest[]> {
  if (isSupabaseConfigured()) {
    return listScanRequestsFromSupabase();
  }
  return Object.values(readFallback())
    .map((s) => s.scanRequest)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// --- Fallback implementation ----------------------------------------------

function logScanInFallback(input: ScanLogInput): void {
  const scans = readFallback();
  // Don't clobber an already-recorded scan (e.g. a results-page refresh).
  if (scans[input.scanId]) return;
  scans[input.scanId] = {
    scanRequest: {
      id: input.scanId,
      leadId: null,
      restaurantId: null,
      websiteUrl: input.websiteUrl,
      businessName: input.businessName ?? null,
      city: input.city ?? null,
      status: "pending",
      createdAt: new Date().toISOString(),
    },
    lead: null,
  };
  writeFallback(scans);
}

function attachLeadInFallback(
  scanId: string | null,
  data: LeadInput,
): ScanRequest {
  const scans = readFallback();
  const existing = scanId ? scans[scanId] : undefined;

  if (existing) {
    existing.scanRequest.leadId ??= randomUUID();
    existing.scanRequest.restaurantId ??= randomUUID();
    existing.scanRequest.businessName ??= data.restaurantName;
    existing.scanRequest.city ??= data.city;
    existing.lead = data;
    writeFallback(scans);
    return existing.scanRequest;
  }

  const scanRequest: ScanRequest = {
    id: scanId ?? randomUUID(),
    leadId: randomUUID(),
    restaurantId: randomUUID(),
    websiteUrl: data.websiteUrl,
    businessName: data.restaurantName,
    city: data.city,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  scans[scanRequest.id] = { scanRequest, lead: data };
  writeFallback(scans);
  return scanRequest;
}

// --- Supabase implementation ----------------------------------------------

async function logScanInSupabase(input: ScanLogInput): Promise<void> {
  const supabase = createServiceSupabaseClient();
  // Insert with the results-page id so the score and lead attach to this row.
  // Requires migration 0003 (nullable lead_id + business_name/city columns);
  // if that hasn't run, this insert fails and the caller treats it as a no-op.
  const { error } = await supabase
    .from("scan_requests")
    .upsert(
      {
        id: input.scanId,
        website_url: input.websiteUrl,
        business_name: input.businessName ?? null,
        city: input.city ?? null,
        status: "pending",
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
  if (error) throw error;
}

async function attachLeadInSupabase(
  scanId: string | null,
  data: LeadInput,
): Promise<ScanRequest> {
  const supabase = createServiceSupabaseClient();

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .insert({
      restaurant_name: data.restaurantName,
      contact_name: data.contactName,
      email: data.email,
      phone: data.phone,
      city: data.city,
    })
    .select("id")
    .single();
  if (leadError) throw leadError;

  // Best-effort: store the landing-quiz goal if the column exists. Done as a
  // separate update so a database that hasn't run migration 0002 still creates
  // the lead instead of failing on an unknown column.
  if (data.goal) {
    const { error: goalError } = await supabase
      .from("leads")
      .update({ goal: data.goal })
      .eq("id", lead.id);
    if (goalError) {
      console.warn("Could not store lead goal (run migration 0002?)", goalError.message);
    }
  }

  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .insert({
      lead_id: lead.id,
      name: data.restaurantName,
      website_url: data.websiteUrl,
      city: data.city,
      number_of_locations: data.numberOfLocations,
      online_ordering_provider: data.onlineOrderingProvider || null,
    })
    .select("id")
    .single();
  if (restaurantError) throw restaurantError;

  // Attach to the scan started by logScan, if it's there.
  if (scanId) {
    const { data: updated, error: updateError } = await supabase
      .from("scan_requests")
      .update({ lead_id: lead.id, restaurant_id: restaurant.id })
      .eq("id", scanId)
      .is("lead_id", null)
      .select(SCAN_SELECT)
      .maybeSingle();
    if (!updateError && updated) return mapScanRow(updated);
    // updateError (e.g. pre-0003 schema) or no matching row → create below.
  }

  const { data: scan, error: scanError } = await supabase
    .from("scan_requests")
    .insert({
      id: scanId ?? undefined,
      lead_id: lead.id,
      restaurant_id: restaurant.id,
      website_url: data.websiteUrl,
      status: "pending",
    })
    .select(SCAN_SELECT)
    .single();
  if (scanError) throw scanError;

  return mapScanRow(scan);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Columns the app reads. business_name/city arrive with migration 0003. */
const SCAN_SELECT =
  "id, lead_id, restaurant_id, website_url, business_name, city, status, created_at";
/** Pre-0003 fallback: the columns that have always existed. */
const SCAN_SELECT_LEGACY =
  "id, lead_id, restaurant_id, website_url, status, created_at";

async function getScanRequestFromSupabase(
  id: string,
): Promise<ScanRequest | null> {
  // scan_requests.id is a uuid column; a non-uuid id (e.g. a hand-typed or
  // stale link) would make Postgres reject the query. Treat it as "not found"
  // so callers can fall back gracefully instead of surfacing a 500.
  if (!UUID_RE.test(id)) return null;

  const supabase = createServiceSupabaseClient();
  const primary = await supabase
    .from("scan_requests")
    .select(SCAN_SELECT)
    .eq("id", id)
    .maybeSingle();

  let row = primary.data as ScanRow | null;
  if (primary.error) {
    if (!isMissingColumn(primary.error)) throw primary.error;
    const legacy = await supabase
      .from("scan_requests")
      .select(SCAN_SELECT_LEGACY)
      .eq("id", id)
      .maybeSingle();
    if (legacy.error) throw legacy.error;
    row = legacy.data as ScanRow | null;
  }
  return row ? mapScanRow(row) : null;
}

async function listScanRequestsFromSupabase(): Promise<ScanRequest[]> {
  const supabase = createServiceSupabaseClient();
  const primary = await supabase
    .from("scan_requests")
    .select(SCAN_SELECT)
    .order("created_at", { ascending: false })
    .limit(200);

  let rows = primary.data as ScanRow[] | null;
  // Tolerate a database that hasn't run migration 0003 yet (e.g. code deployed
  // before the migration): retry without the new columns instead of erroring.
  if (primary.error) {
    if (!isMissingColumn(primary.error)) throw primary.error;
    const legacy = await supabase
      .from("scan_requests")
      .select(SCAN_SELECT_LEGACY)
      .order("created_at", { ascending: false })
      .limit(200);
    if (legacy.error) throw legacy.error;
    rows = legacy.data as ScanRow[] | null;
  }
  return (rows ?? []).map(mapScanRow);
}

/** Postgres "undefined column" (42703) — the migration hasn't been applied. */
function isMissingColumn(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42703" ||
    /column .*(business_name|city).* does not exist/i.test(error.message ?? "")
  );
}

interface ScanRow {
  id: string;
  lead_id: string | null;
  restaurant_id: string | null;
  website_url: string;
  business_name?: string | null;
  city?: string | null;
  status: ScanRequest["status"];
  created_at: string;
}

function mapScanRow(row: ScanRow): ScanRequest {
  return {
    id: row.id,
    leadId: row.lead_id ?? null,
    restaurantId: row.restaurant_id ?? null,
    websiteUrl: row.website_url,
    businessName: row.business_name ?? null,
    city: row.city ?? null,
    status: row.status,
    createdAt: row.created_at,
  };
}

// --- Scan results ----------------------------------------------------------
// On Supabase the background task (Trigger.dev) and the results page (Vercel)
// are different processes, so they share the score via the database. Locally
// (no Supabase) they run in one process, so the JSON-file fallback is enough.

/**
 * Persist a completed scan result and mark the scan request completed.
 * Works against Supabase, or the JSON-file fallback for local development.
 */
export async function saveScanResult(
  scanRequestId: string,
  stored: StoredScanResult,
): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    const scans = readFallback();
    const entry = scans[scanRequestId];
    if (!entry) return false;
    entry.result = stored;
    entry.scanRequest.status = "completed";
    writeFallback(scans);
    return true;
  }

  const supabase = createServiceSupabaseClient();

  const { error: resultError } = await supabase.from("scan_results").upsert(
    {
      scan_request_id: scanRequestId,
      total_score: stored.result.totalScore,
      max_score: stored.result.maxScore,
      raw: stored as unknown as Record<string, unknown>,
    },
    { onConflict: "scan_request_id" },
  );
  if (resultError) throw resultError;

  const { error: statusError } = await supabase
    .from("scan_requests")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", scanRequestId);
  if (statusError) throw statusError;

  return true;
}

/** Read a persisted scan result, or null if none exists yet. */
export async function getStoredScanResult(
  scanRequestId: string,
): Promise<StoredScanResult | null> {
  if (!isSupabaseConfigured()) {
    return readFallback()[scanRequestId]?.result ?? null;
  }
  if (!UUID_RE.test(scanRequestId)) return null;
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("scan_results")
    .select("raw")
    .eq("scan_request_id", scanRequestId)
    .maybeSingle();
  if (error) throw error;
  return (data?.raw as StoredScanResult | undefined) ?? null;
}
