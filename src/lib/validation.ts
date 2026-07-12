import { z } from "zod";

/**
 * The primary goal the owner picks on the landing quiz. Mirrors how Owner.com's
 * demo qualifies a lead, and lets the report emphasize the matching category.
 */
export const GOAL_OPTIONS = [
  {
    value: "google",
    label: "Drive more customers from Google",
    category: "local_seo",
  },
  {
    value: "repeat",
    label: "Maximize sales from existing customers",
    category: "retention_crm",
  },
  {
    value: "experience",
    label: "Deliver the best online ordering experience",
    category: "online_ordering",
  },
] as const;

export type GoalValue = (typeof GOAL_OPTIONS)[number]["value"];

const goalValues = GOAL_OPTIONS.map((o) => o.value) as [GoalValue, ...GoalValue[]];

/** Be forgiving: allow users to paste "example.com" without a scheme. */
const websiteUrlSchema = z
  .string()
  .trim()
  .min(1, "Website URL is required")
  .transform((value) =>
    /^https?:\/\//i.test(value) ? value : `https://${value}`,
  )
  .pipe(z.string().url("Enter a valid website URL"));

const goalSchema = z.enum(goalValues).optional().or(z.literal(""));

/**
 * Validation schema for the lead / scan request form. Used by both the client
 * form and the server action so the two never drift apart.
 */
export const leadFormSchema = z.object({
  restaurantName: z
    .string()
    .trim()
    .min(1, "Restaurant name is required")
    .max(120),
  websiteUrl: websiteUrlSchema,
  contactName: z.string().trim().min(1, "Contact name is required").max(120),
  email: z.string().trim().email("Enter a valid email address"),
  phone: z
    .string()
    .trim()
    .min(7, "Enter a valid phone number")
    .max(30),
  city: z.string().trim().min(1, "City is required").max(120),
  numberOfLocations: z.coerce
    .number()
    .int("Must be a whole number")
    .min(1, "Must have at least 1 location")
    .max(10000),
  onlineOrderingProvider: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal("")),
});

/**
 * Step 1 (landing): minimal fields to run the scan + the goal quiz. No contact
 * info yet — we show the score first, then capture the lead at the email gate.
 */
export const scanStartSchema = z.object({
  restaurantName: z
    .string()
    .trim()
    .min(1, "Restaurant name is required")
    .max(120),
  websiteUrl: websiteUrlSchema,
  city: z.string().trim().min(1, "City is required").max(120),
  goal: goalSchema,
});

export type ScanStartInput = z.input<typeof scanStartSchema>;
export type ScanStartData = z.output<typeof scanStartSchema>;

/**
 * Step 2 (results gate): the contact fields, plus the scan context carried
 * forward as hidden inputs, so we can persist the full lead once they unlock
 * the report.
 */
export const leadCaptureSchema = leadFormSchema.extend({ goal: goalSchema });

export type LeadCaptureData = z.output<typeof leadCaptureSchema>;

export type LeadFormInput = z.input<typeof leadFormSchema>;
export type LeadFormData = z.output<typeof leadFormSchema>;

export type FieldErrors = Record<string, string>;

/** Flatten a ZodError into a simple `{ field: message }` map for the UI. */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = typeof issue.path[0] === "string" ? issue.path[0] : undefined;
    if (key && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}
