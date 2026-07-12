"use server";

import { redirect } from "next/navigation";

import { createScanRequest } from "@/lib/store";
import { leadFormSchema, toFieldErrors, type FieldErrors } from "@/lib/validation";

export interface SubmitLeadState {
  ok: boolean;
  errors?: FieldErrors;
  formError?: string;
}

/**
 * Server action for the landing-page lead form.
 *
 * Validates the submission, creates lead + restaurant + scan request, then
 * redirects to the results page. The actual site scan is NOT run here yet.
 *
 * TODO: After the scan request is created, enqueue a Trigger.dev background job
 *   to run the scanners and persist scan_results. The results page will then
 *   poll for completion instead of showing placeholder scores immediately.
 */
export async function submitLead(
  _prevState: SubmitLeadState,
  formData: FormData,
): Promise<SubmitLeadState> {
  const parsed = leadFormSchema.safeParse({
    restaurantName: formData.get("restaurantName"),
    websiteUrl: formData.get("websiteUrl"),
    contactName: formData.get("contactName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    city: formData.get("city"),
    numberOfLocations: formData.get("numberOfLocations"),
    onlineOrderingProvider: formData.get("onlineOrderingProvider"),
  });

  if (!parsed.success) {
    return { ok: false, errors: toFieldErrors(parsed.error) };
  }

  let scanId: string;
  try {
    const scanRequest = await createScanRequest(parsed.data);
    scanId = scanRequest.id;
  } catch (error) {
    console.error("Failed to create scan request", error);
    return {
      ok: false,
      formError:
        "Something went wrong creating your scan. Please try again in a moment.",
    };
  }

  // Values needed to render/scan are passed forward in the query string so the
  // results page works statelessly. This matters on serverless (e.g. Vercel)
  // without a configured database: the fallback store lives in a single
  // request's ephemeral filesystem, so a later request cannot read the scan
  // back. `u` is the website URL (scoring is deterministic from it); `n`/`c`
  // are the business name + city for the Google Business Profile lookup. When
  // Supabase IS configured, the persisted scan supplies the URL instead.
  const query = new URLSearchParams({
    u: parsed.data.websiteUrl,
    n: parsed.data.restaurantName,
    c: parsed.data.city,
  });

  // redirect() throws internally, so it must live outside the try/catch above.
  redirect(`/results/${scanId}?${query.toString()}`);
}
