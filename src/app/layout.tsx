import type { Metadata } from "next";

import { BRAND } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.url),
  title: `${BRAND.name} — free restaurant website audit`,
  description:
    "Find out if your restaurant website is costing you orders. See how you compare to nearby restaurants, what the gaps are costing you, and the highest-impact fixes to win back orders.",
  openGraph: {
    title: BRAND.name,
    description:
      "See how your restaurant compares to nearby competitors and what your website gaps are costing you.",
    url: BRAND.url,
    siteName: BRAND.name,
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
