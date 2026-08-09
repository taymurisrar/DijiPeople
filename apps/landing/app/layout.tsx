import type { Metadata } from "next";
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
  metadataBase: new URL("https://dijipeople.com"),
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-only.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon-180x180.png",
  },
  title: "DijiPeople | HRM SaaS for Growing Operational Teams",
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
