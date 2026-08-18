import type { Metadata } from "next";

import { landingEnv } from "../lib/env";
import { Fraunces, Manrope } from "next/font/google";
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
  title: {
    default: "DijiPeople | HRM SaaS for Growing Operational Teams",
    template: "%s | DijiPeople",
  },
  description:
    "DijiPeople is a US-based HRM SaaS platform for healthcare, IT, recruitment, staffing, and service businesses that need structured people operations.",
  openGraph: {
    title: "DijiPeople | HRM SaaS for Growing Operational Teams",
    description:
      "Modern HR operations for growing businesses that need structure across employee workflows, leave, onboarding, documents, and operational control.",
    url: "https://dijipeople.com",
    siteName: "DijiPeople",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "DijiPeople | HRM SaaS for Growing Operational Teams",
    description:
      "A modern HRM SaaS platform for operational businesses that need structure, clarity, and scalable workflows.",
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
        <SiteHeader />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
