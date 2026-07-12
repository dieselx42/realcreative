import "server-only";

/**
 * Revenue-impact framing: translate the score gaps into estimated dollars, so
 * the report speaks the language a restaurant owner cares about ("this is
 * costing you ~$X/month") instead of abstract points. This is the second half
 * of the Owner.com pitch — competitor pressure + a dollar figure.
 *
 * These are deliberately *estimates*, not precise figures — we don't have the
 * restaurant's real order volume. Order volume is proxied from the Google
 * review count (a busy restaurant has more reviews), and every number is a
 * range with its assumptions surfaced, so the report can label them honestly.
 * Tune the ticket size / commission via env vars.
 */

const DEFAULT_AVG_TICKET = 25; // $ per online order
const DEFAULT_COMMISSION_RATE = 0.25; // marketplace take rate (15-30% typical)
const MIN_MONTHLY_ORDERS = 150;
const MAX_MONTHLY_ORDERS = 1500;

export interface RevenueInput {
  /** Google review count — used as a popularity proxy for order volume. */
  reviews?: number;
  hasDirectOrdering: boolean;
  hasMarketplace: boolean;
  hasEmailCapture: boolean;
  hasLoyalty: boolean;
  lcpMs?: number;
}

export interface RevenueOpportunity {
  key: string;
  label: string;
  monthlyLow: number;
  monthlyHigh: number;
  basis: string;
}

export interface RevenueImpact {
  opportunities: RevenueOpportunity[];
  totalMonthlyLow: number;
  totalMonthlyHigh: number;
  annualLow: number;
  annualHigh: number;
  assumptions: {
    avgTicket: number;
    estMonthlyOrders: number;
    commissionRate: number;
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const round = (n: number) => Math.round(n);

/**
 * Estimate monthly online orders from the Google review count. Reviews are
 * lifetime, but volume correlates with how busy a place is; we clamp to a sane
 * band so a viral outlier or a brand-new spot doesn't produce absurd numbers.
 */
function estimateMonthlyOrders(reviews?: number): number {
  if (typeof reviews !== "number" || reviews <= 0) return 300; // neutral default
  return clamp(round(reviews), MIN_MONTHLY_ORDERS, MAX_MONTHLY_ORDERS);
}

export function computeRevenueImpact(input: RevenueInput): RevenueImpact {
  const avgTicket = Number(process.env.REVENUE_AVG_TICKET) || DEFAULT_AVG_TICKET;
  const commissionRate =
    Number(process.env.REVENUE_COMMISSION_RATE) || DEFAULT_COMMISSION_RATE;
  const estMonthlyOrders = estimateMonthlyOrders(input.reviews);

  const opportunities: RevenueOpportunity[] = [];

  // 1. Marketplace commissions — only when they lean on a marketplace with no
  //    commission-free direct ordering. Assume a share of orders flows through
  //    the marketplace at the commission rate.
  if (input.hasMarketplace && !input.hasDirectOrdering) {
    const low = estMonthlyOrders * 0.4 * avgTicket * (commissionRate - 0.05);
    const high = estMonthlyOrders * 0.7 * avgTicket * (commissionRate + 0.05);
    opportunities.push({
      key: "marketplace_commissions",
      label: "Marketplace commissions you could keep",
      monthlyLow: round(low),
      monthlyHigh: round(high),
      basis:
        "You rely on a marketplace with no direct ordering. Commission-free direct orders keep this in-house.",
    });
  }

  // 2. Orders lost to a slow site — conversions drop as load time climbs past
  //    Google's 2.5s LCP threshold.
  if (typeof input.lcpMs === "number" && input.lcpMs > 4000) {
    const lostShare = clamp(((input.lcpMs - 2500) / 1000) * 0.04, 0.03, 0.25);
    const low = estMonthlyOrders * (lostShare * 0.6) * avgTicket;
    const high = estMonthlyOrders * lostShare * avgTicket;
    opportunities.push({
      key: "slow_site",
      label: "Orders lost to a slow site",
      monthlyLow: round(low),
      monthlyHigh: round(high),
      basis: `Your LCP is ${(input.lcpMs / 1000).toFixed(1)}s — well above Google's 2.5s target, so hungry visitors bounce before ordering.`,
    });
  }

  // 3. Repeat orders left on the table — no way to capture and re-engage guests.
  if (!input.hasEmailCapture || !input.hasLoyalty) {
    const low = estMonthlyOrders * 0.05 * avgTicket;
    const high = estMonthlyOrders * 0.15 * avgTicket;
    opportunities.push({
      key: "retention",
      label: "Repeat orders you're not capturing",
      monthlyLow: round(low),
      monthlyHigh: round(high),
      basis:
        "With no email/SMS capture or loyalty program, one-time diners don't come back on their own.",
    });
  }

  const totalMonthlyLow = opportunities.reduce((a, o) => a + o.monthlyLow, 0);
  const totalMonthlyHigh = opportunities.reduce((a, o) => a + o.monthlyHigh, 0);

  return {
    opportunities,
    totalMonthlyLow,
    totalMonthlyHigh,
    annualLow: totalMonthlyLow * 12,
    annualHigh: totalMonthlyHigh * 12,
    assumptions: { avgTicket, estMonthlyOrders, commissionRate },
  };
}
