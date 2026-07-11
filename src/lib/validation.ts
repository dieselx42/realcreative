import { z } from "zod";

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
  websiteUrl: z
    .string()
    .trim()
    .min(1, "Website URL is required")
    .transform((value) =>
      // Be forgiving: allow users to paste "example.com" without a scheme.
      /^https?:\/\//i.test(value) ? value : `https://${value}`,
    )
    .pipe(z.string().url("Enter a valid website URL")),
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

export type LeadFormInput = z.input<typeof leadFormSchema>;
export type LeadFormData = z.output<typeof leadFormSchema>;

export type FieldErrors = Partial<Record<keyof LeadFormData, string>>;

/** Flatten a ZodError into a simple `{ field: message }` map for the UI. */
export function toFieldErrors(error: z.ZodError<LeadFormData>): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof LeadFormData | undefined;
    if (key && !fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}
