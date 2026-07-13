"use server";

import { randomUUID } from "crypto";

import { redirect } from "next/navigation";

import { sendReportEmail } from "@/lib/email";
import { attachLeadToScan, logScan } from "@/lib/store";
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
 * Step 1 — landing form. Validates the minimal fields + goal, records the scan
 * (so every scan is visible in the admin, not just the ones that convert), then
 * redirects to the results page, which runs the scan statelessly from the query
 * string. No lead is created yet: we show the score first and capture the lead
 * at the email gate (see `captureLead`). This mirrors Owner.com's grader funnel.
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

  // Record the scan up front, keyed on the id the results page uses. Best-effort:
  // never block the visitor from seeing their score if logging fails.
  try {
    await logScan({
      scanId,
      websiteUrl: parsed.data.websiteUrl,
      businessName: parsed.data.restaurantName,
      city: parsed.data.city,
    });
  } catch (error) {
    console.error("Failed to log scan", error);
  }

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
 * info + the scan context carried as hidden fields) and attaches it to the scan
 * started in step 1 (via the hidden `scanId`), flipping that scan from an
 * anonymous visit into a captured lead.
 */
export async function captureLead(
  _prevState: CaptureLeadState,
  formData: FormData,
): Promise<CaptureLeadState> {
  const scanIdRaw = formData.get("scanId");
  const scanId = typeof scanIdRaw === "string" && scanIdRaw ? scanIdRaw : null;

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
    await attachLeadToScan(scanId, parsed.data);
  } catch (error) {
    console.error("Failed to create lead", error);
    return {
      ok: false,
      formError: "Something went wrong. Please try again in a moment.",
    };
  }

  // Best-effort: email the report link. Never block unlocking on delivery.
  const reportUrl = formData.get("reportUrl");
  try {
    const result = await sendReportEmail({
      to: parsed.data.email,
      contactName: parsed.data.contactName,
      restaurantName: parsed.data.restaurantName,
      reportUrl: typeof reportUrl === "string" ? reportUrl : undefined,
    });
    if (!result.ok && result.error !== "RESEND_API_KEY not set") {
      console.warn("Report email not sent:", result.error);
    }
  } catch (error) {
    console.warn("Report email threw:", error);
  }

  return { ok: true };
}
