import { BRAND } from "@/lib/brand";

/**
 * The wordmark: a score-gauge mark (echoing the report's ScoreDial) next to the
 * product name. Used in the site header, the report header, and the favicon.
 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <ScoreMark className="h-7 w-7" />
      <span className="text-lg font-bold text-ink">
        {BRAND.wordmark.prefix}
        <span className="text-brand-600">{BRAND.wordmark.highlight}</span>
        {BRAND.wordmark.suffix}
      </span>
    </span>
  );
}

/** The standalone gauge mark — a ~70%-filled score ring. */
export function ScoreMark({ className = "" }: { className?: string }) {
  // r=13 → circumference ≈ 81.68; show ~68% as the "score" arc.
  const c = 2 * Math.PI * 13;
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="16" cy="16" r="13" fill="none" stroke="#e2e8f0" strokeWidth="4" />
      <circle
        cx="16"
        cy="16"
        r="13"
        fill="none"
        stroke="#f97316"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${c * 0.68} ${c}`}
        transform="rotate(-90 16 16)"
      />
    </svg>
  );
}
