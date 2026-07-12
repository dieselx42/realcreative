"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";

import { startScan, type ScanStartState } from "@/app/actions";
import { GOAL_OPTIONS, type GoalValue } from "@/lib/validation";

const initialState: ScanStartState = { ok: false };

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

/**
 * Step 1 of the funnel: collect just enough to run the scan (name, website,
 * city) plus a one-question goal quiz. Contact info is captured later, at the
 * report's email gate — so the visitor sees their score before giving it up.
 */
export function ScanStartForm() {
  const [state, formAction] = useFormState(startScan, initialState);
  const errors = state.errors ?? {};
  const [goal, setGoal] = useState<GoalValue | "">("");

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

      <fieldset>
        <legend className="field-label">
          What&apos;s your #1 goal right now?{" "}
          <span className="font-normal text-ink-muted">(optional)</span>
        </legend>
        <input type="hidden" name="goal" value={goal} />
        <div className="mt-1 space-y-2">
          {GOAL_OPTIONS.map((option) => {
            const selected = goal === option.value;
            return (
              <button
                type="button"
                key={option.value}
                onClick={() => setGoal(selected ? "" : option.value)}
                className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition ${
                  selected
                    ? "border-brand-500 bg-brand-50 text-ink"
                    : "border-slate-200 bg-white text-ink-soft hover:border-slate-300"
                }`}
              >
                <span
                  aria-hidden
                  className={`flex h-4 w-4 flex-none items-center justify-center rounded-full border ${
                    selected
                      ? "border-brand-500 bg-brand-500 text-white"
                      : "border-slate-300"
                  }`}
                >
                  {selected ? "✓" : ""}
                </span>
                {option.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <SubmitButton />

      <p className="text-center text-xs text-ink-muted">
        Takes 30 seconds. No credit card.
      </p>
    </form>
  );
}
