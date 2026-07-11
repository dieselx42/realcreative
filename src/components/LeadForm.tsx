"use client";

import { useFormState, useFormStatus } from "react-dom";

import { submitLead, type SubmitLeadState } from "@/app/actions";

const initialState: SubmitLeadState = { ok: false };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? "Scoring your website…" : "Get my Growth Score"}
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

export function LeadForm() {
  const [state, formAction] = useFormState(submitLead, initialState);
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.formError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.formError}
        </div>
      ) : null}

      <Field label="Restaurant name" name="restaurantName" error={errors.restaurantName}>
        <input
          id="restaurantName"
          name="restaurantName"
          type="text"
          className="field-input"
          placeholder="Bella's Trattoria"
          autoComplete="organization"
        />
      </Field>

      <Field label="Website URL" name="websiteUrl" error={errors.websiteUrl}>
        <input
          id="websiteUrl"
          name="websiteUrl"
          type="text"
          inputMode="url"
          className="field-input"
          placeholder="bellastrattoria.com"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contact name" name="contactName" error={errors.contactName}>
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

        <Field label="City" name="city" error={errors.city}>
          <input
            id="city"
            name="city"
            type="text"
            className="field-input"
            placeholder="Austin, TX"
            autoComplete="address-level2"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
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

        <Field
          label="Current online ordering provider"
          name="onlineOrderingProvider"
          error={errors.onlineOrderingProvider}
        >
          <input
            id="onlineOrderingProvider"
            name="onlineOrderingProvider"
            type="text"
            className="field-input"
            placeholder="Toast, DoorDash… (optional)"
          />
        </Field>
      </div>

      <SubmitButton />

      <p className="text-center text-xs text-ink-muted">
        No credit card. We&apos;ll email your full Growth Score report.
      </p>
    </form>
  );
}
