import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Restaurant Growth Score",
  description:
    "Find out if your restaurant website is costing you orders. Get a Restaurant Growth Score based on your website, online ordering, SEO, reviews, and customer capture system.",
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
