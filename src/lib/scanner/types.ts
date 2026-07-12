import type { CategoryKey } from "@/lib/scoring/categories";

/**
 * Shared scanner contracts. Kept free of any server-only imports so both the
 * scoring engine and server-side scanners can depend on these types without
 * pulling server-only code into a client bundle.
 */

export interface ScanContext {
  websiteUrl: string;
  businessName?: string;
  city?: string;
  onlineOrderingProvider?: string | null;
}

/** A scanner's contribution: a 0..1 signal per category it can assess. */
export type ScannerSignals = Partial<Record<CategoryKey, number>>;

export interface Scanner {
  name: string;
  run(context: ScanContext): Promise<ScannerSignals>;
}
