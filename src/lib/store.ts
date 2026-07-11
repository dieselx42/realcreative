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
import type { ScanRequest } from "@/lib/types";

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
export async function createScanRequest(
  data: LeadFormData,
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

function createScanRequestInFallback(data: LeadFormData): ScanRequest {
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
  data: LeadFormData,
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

async function getScanRequestFromSupabase(
  id: string,
): Promise<ScanRequest | null> {
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
