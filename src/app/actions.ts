"use server";

import { randomUUID } from "crypto";

import { redirect } from "next/navigation";

import { createScanRequest } from "@/lib/store";
import {
  leadCaptureSchema,
  scanStartSchema,
  toFieldErrors,
  type FieldErrors,
} from "@/lib/validation";

export interface ScanStartState {
  ok: boolean;
  errors?: FieldErrors;
  formError?: string;
}

/**
 * Step 1 — landing form. Validates the minimal fields + goal, then redirects to
 * the results page, which runs the scan statelessly from the query string. No
 * lead is created yet: we show the score first and capture the lead at the
 * email gate (see `captureLead`). This mirrors Owner.com's grader funnel.
 */
export async function startScan(
  _prevState: ScanStartState,
  formData: FormData,
): Promise<ScanStartState> {
  const parsed = scanStartSchema.safeParse({
    restaurantName: formData.get("restaurantName"),
    websiteUrl: formData.get("websiteUrl"),
    city: formData.get("city"),
    goal: formData.get("goal"),
  });

  if (!parsed.success) {
    return { ok: false, errors: toFieldErrors(parsed.error) };
  }

  const scanId = randomUUID();
  const query = new URLSearchParams({
    u: parsed.data.websiteUrl,
    n: parsed.data.restaurantName,
    c: parsed.data.city,
  });
  if (parsed.data.goal) query.set("g", parsed.data.goal);

  // redirect() throws internally, so it must be the last thing we do.
  redirect(`/results/${scanId}?${query.toString()}`);
}

export interface CaptureLeadState {
  ok: boolean;
  errors?: FieldErrors;
  formError?: string;
}

/**
 * Step 2 — the email gate on the results page. Persists the full lead (contact
 * info + the scan context carried as hidden fields) so the report's action plan
 * unlocks. This is where a lead actually enters the database.
 */
export async function captureLead(
  _prevState: CaptureLeadState,
  formData: FormData,
): Promise<CaptureLeadState> {
  const parsed = leadCaptureSchema.safeParse({
    restaurantName: formData.get("restaurantName"),
    websiteUrl: formData.get("websiteUrl"),
    contactName: formData.get("contactName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    city: formData.get("city"),
    numberOfLocations: formData.get("numberOfLocations"),
    onlineOrderingProvider: formData.get("onlineOrderingProvider"),
    goal: formData.get("goal"),
  });

  if (!parsed.success) {
    return { ok: false, errors: toFieldErrors(parsed.error) };
  }

  try {
    await createScanRequest(parsed.data);
  } catch (error) {
    console.error("Failed to create lead", error);
    return {
      ok: false,
      formError: "Something went wrong. Please try again in a moment.",
    };
  }

  return { ok: true };
}
