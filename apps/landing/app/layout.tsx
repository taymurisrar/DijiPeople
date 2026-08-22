import type { Metadata } from "next";
import { Suspense } from "react";

import { landingEnv } from "../lib/env";
import { Fraunces, Manrope } from "next/font/google";
import { ReferralCapture } from "./_components/referral-capture";
import { SiteFooter, SiteHeader } from "./_components/site-shell";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-sans",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  // Resolves the relative canonical/OpenGraph URLs the pages declare. Taken
  // from configuration so a preview deployment does not claim production URLs.
  metadataBase: new URL(landingEnv.appOrigin),
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-only.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon-180x180.png",
  },
  // A template rather than a literal, so a route only states what it is and the
  // brand suffix cannot drift between pages — six routes previously set no
  // title at all and inherited this one verbatim, which made them
  // indistinguishable in history, tabs and search results.
  /*
   * The most-read copy on the site: the browser tab, the search result and the
   * link preview. It was written in the register of an internal positioning
   * document — "HRM SaaS for Growing Operational Teams", "structured people
   * operations", "scalable workflows" — none of which tells a reader what they
   * would get.
   *
   * "US-based" is also gone, and not for tone. `markets.catalog.ts` has the US
   * as `PLANNED`, `isEnabled: false`, "Not open for business", while Pakistan,
   * Qatar and International are the launched markets. It was a factual claim
   * this repository's own configuration contradicts, and the fix for that is to
   * stop making it rather than to make a different one.
   */
  title: {
    default: "DijiPeople | HR, attendance and payroll in one place",
    template: "%s | DijiPeople",
  },
  description:
    "DijiPeople keeps employee records, attendance, leave, hiring and payroll preparation in one connected system — so information is entered once instead of retyped between tools.",
  openGraph: {
    title: "DijiPeople | HR, attendance and payroll in one place",
    description:
      "Employee records, attendance, leave, hiring and payroll preparation in one connected system. Enter it once, and every stage reads what the last one produced.",
    url: "https://dijipeople.com",
    siteName: "DijiPeople",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DijiPeople | HR, attendance and payroll in one place",
    description:
      "Employee records, attendance, leave, hiring and payroll preparation in one connected system.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${manrope.variable} ${fraunces.variable}`}>
        {/*
          * Remembers a partner's `?ref=` code on whichever page their link
          * pointed at, so it survives to the form the visitor finally submits.
          * Renders nothing. Wrapped in Suspense because `useSearchParams`
          * opts a subtree out of static rendering otherwise, and this must not
          * cost every page its prerender. BUG-0281.
          */}
        <Suspense fallback={null}>
          <ReferralCapture />
        </Suspense>
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
