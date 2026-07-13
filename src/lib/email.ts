import "server-only";

import { BRAND } from "@/lib/brand";

/**
 * Sends the "here's your report" email via Resend. Best-effort: if RESEND_API_KEY
 * is not configured, or the send fails, it returns an error instead of throwing,
 * so lead capture never breaks on email delivery.
 *
 * Set RESEND_API_KEY and RESEND_FROM (a verified sender, e.g.
 * "Growth Score <reports@yourdomain.com>"). Without a verified domain, Resend's
 * onboarding@resend.dev sender only delivers to your own account email.
 */

export interface SendReportEmailInput {
  to: string;
  contactName?: string;
  restaurantName?: string;
  reportUrl?: string;
}

export async function sendReportEmail(
  input: SendReportEmailInput,
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY not set" };

  const from =
    process.env.RESEND_FROM || `${BRAND.name} <onboarding@resend.dev>`;
  const restaurant = input.restaurantName || "your restaurant";
  const subject = `Your ${BRAND.scoreName} for ${restaurant}`;
  const cta = input.reportUrl
    ? `<p style="margin:24px 0"><a href="${input.reportUrl}" style="background:#f97316;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">View your full report</a></p>`
    : "";
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:520px;margin:auto;color:#0f172a">
    <p>Hi ${input.contactName || "there"},</p>
    <p>Thanks for scoring <strong>${restaurant}</strong>. Your ${BRAND.scoreName} report
    breaks down how you compare to nearby restaurants, what the gaps may be costing you,
    and the highest-impact fixes to win back orders.</p>
    ${cta}
    <p>Want us to walk through it with you? Just reply to this email and we'll set up a free
    30-minute Growth Review.</p>
    <p style="color:#64748b;font-size:12px;margin-top:32px">${BRAND.name}</p>
  </div>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from, to: [input.to], subject, html }),
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `Resend responded ${res.status} ${detail}`.trim() };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Email failed" };
  }
}
