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
 * Persistence layer for leads / restaurants / scan requests.
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
  lead: LeadFormData;
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

/**
 * Create a lead, its restaurant, and a scan request in one logical operation.
 * Returns the scan request id, which the results page is keyed on.
 */
/** The lead data plus an optional goal from the landing quiz. */
export type LeadInput = LeadFormData & { goal?: string | null };

export async function createScanRequest(
  data: LeadInput,
): Promise<ScanRequest> {
  if (isSupabaseConfigured()) {
    return createScanRequestInSupabase(data);
  }
  return createScanRequestInFallback(data);
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

function createScanRequestInFallback(data: LeadInput): ScanRequest {
  const now = new Date().toISOString();
  const scanRequest: ScanRequest = {
    id: randomUUID(),
    leadId: randomUUID(),
    restaurantId: randomUUID(),
    websiteUrl: data.websiteUrl,
    status: "pending",
    createdAt: now,
  };

  const scans = readFallback();
  scans[scanRequest.id] = { scanRequest, lead: data };
  writeFallback(scans);
  return scanRequest;
}

// --- Supabase implementation ----------------------------------------------

async function createScanRequestInSupabase(
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

  const { data: scan, error: scanError } = await supabase
    .from("scan_requests")
    .insert({
      lead_id: lead.id,
      restaurant_id: restaurant.id,
      website_url: data.websiteUrl,
      status: "pending",
    })
    .select("id, lead_id, restaurant_id, website_url, status, created_at")
    .single();
  if (scanError) throw scanError;

  return mapScanRow(scan);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function getScanRequestFromSupabase(
  id: string,
): Promise<ScanRequest | null> {
  // scan_requests.id is a uuid column; a non-uuid id (e.g. a hand-typed or
  // stale link) would make Postgres reject the query. Treat it as "not found"
  // so callers can fall back gracefully instead of surfacing a 500.
  if (!UUID_RE.test(id)) return null;

  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("scan_requests")
    .select("id, lead_id, restaurant_id, website_url, status, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapScanRow(data) : null;
}

async function listScanRequestsFromSupabase(): Promise<ScanRequest[]> {
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("scan_requests")
    .select("id, lead_id, restaurant_id, website_url, status, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map(mapScanRow);
}

interface ScanRow {
  id: string;
  lead_id: string;
  restaurant_id: string;
  website_url: string;
  status: ScanRequest["status"];
  created_at: string;
}

function mapScanRow(row: ScanRow): ScanRequest {
  return {
    id: row.id,
    leadId: row.lead_id,
    restaurantId: row.restaurant_id,
    websiteUrl: row.website_url,
    status: row.status,
    createdAt: row.created_at,
  };
}

// --- Scan results (used by the Trigger.dev background-job flow) -------------
// These require Supabase — the background task (running on Trigger.dev) and the
// results page (running on Vercel) are different processes, so they can only
// share a real database, not the local JSON-file fallback. The scored result +
// meta are stored as a JSON blob in scan_results.raw.

/**
 * Persist a completed scan result and mark the scan request completed.
 * No-op (returns false) when Supabase is not configured.
 */
export async function saveScanResult(
  scanRequestId: string,
  stored: StoredScanResult,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
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
  if (!isSupabaseConfigured() || !UUID_RE.test(scanRequestId)) return null;
  const supabase = createServiceSupabaseClient();
  const { data, error } = await supabase
    .from("scan_results")
    .select("raw")
    .eq("scan_request_id", scanRequestId)
    .maybeSingle();
  if (error) throw error;
  return (data?.raw as StoredScanResult | undefined) ?? null;
}
