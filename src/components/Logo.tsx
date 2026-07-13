import { BRAND } from "@/lib/brand";

/**
 * The brand wordmark (location-pin + score-gauge mark next to the name). Uses
 * the outlined SVG assets in /public/brand so it renders identically everywhere.
 * `variant="dark"` uses the light-on-dark version for dark backgrounds.
 */
export function Logo({
  className = "h-8",
  variant = "light",
  compact = false,
}: {
  className?: string;
  variant?: "light" | "dark";
  /** Tighter lockup for headers/nav. */
  compact?: boolean;
}) {
  const dark = variant === "dark";
  const src = compact
    ? dark
      ? "/brand/logo-compact-dark.svg"
      : "/brand/logo-compact.svg"
    : dark
      ? "/brand/logo-horizontal-dark.svg"
      : "/brand/logo-horizontal.svg";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={BRAND.name} className={`w-auto ${className}`} />
  );
}

/** The standalone pin+gauge mark (no wordmark), e.g. for compact spots. */
export function ScoreMark({ className = "h-7 w-7" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/icon.svg" alt="" aria-hidden="true" className={className} />;
}
