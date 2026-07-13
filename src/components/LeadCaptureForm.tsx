"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { captureLead, type CaptureLeadState } from "@/app/actions";

const initialState: CaptureLeadState = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? "Unlocking…" : "Unlock my full report"}
    </button>
  );
}

interface FieldProps {
  label: string;
  name: string;
  error?: string;
  children: React.ReactNode;
}

function Field({ label, name, error, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={name} className="field-label">
        {label}
      </label>
      {children}
      {error ? <p className="field-error">{error}</p> : null}
    </div>
  );
}

export interface LeadCaptureContext {
  restaurantName: string;
  websiteUrl: string;
  city: string;
  goal?: string;
}

/**
 * The email gate on the report. Contact fields are visible; the scan context
 * (name/website/city/goal) rides along as hidden inputs so the server can
 * persist a complete lead. On success, `onUnlock` reveals the action plan.
 */
export function LeadCaptureForm({
  context,
  onUnlock,
}: {
  context: LeadCaptureContext;
  onUnlock: () => void;
}) {
  const [state, formAction] = useFormState(captureLead, initialState);
  const errors = state.errors ?? {};
  const [reportUrl, setReportUrl] = useState("");

  useEffect(() => {
    setReportUrl(window.location.href);
  }, []);

  useEffect(() => {
    if (state.ok) onUnlock();
  }, [state.ok, onUnlock]);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="restaurantName" value={context.restaurantName} />
      <input type="hidden" name="websiteUrl" value={context.websiteUrl} />
      <input type="hidden" name="city" value={context.city} />
      {context.goal ? (
        <input type="hidden" name="goal" value={context.goal} />
      ) : null}
      <input type="hidden" name="reportUrl" value={reportUrl} />

      {state.formError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.formError}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" name="contactName" error={errors.contactName}>
          <input
            id="contactName"
            name="contactName"
            type="text"
            className="field-input"
            placeholder="Alex Rivera"
            autoComplete="name"
          />
        </Field>
        <Field label="Email" name="email" error={errors.email}>
          <input
            id="email"
            name="email"
            type="email"
            className="field-input"
            placeholder="alex@bellastrattoria.com"
            autoComplete="email"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone" name="phone" error={errors.phone}>
          <input
            id="phone"
            name="phone"
            type="tel"
            className="field-input"
            placeholder="(555) 123-4567"
            autoComplete="tel"
          />
        </Field>
        <Field
          label="Number of locations"
          name="numberOfLocations"
          error={errors.numberOfLocations}
        >
          <input
            id="numberOfLocations"
            name="numberOfLocations"
            type="number"
            min={1}
            defaultValue={1}
            className="field-input"
          />
        </Field>
      </div>

      <input
        type="hidden"
        name="onlineOrderingProvider"
        value=""
      />

      <SubmitButton />
      <p className="text-center text-xs text-ink-muted">
        We&apos;ll email your full report and a prioritized action plan.
      </p>
    </form>
  );
}
