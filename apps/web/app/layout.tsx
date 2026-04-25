import type { Metadata } from "next";
import { Instrument_Sans, Literata } from "next/font/google";
import { DEFAULT_BRANDING_VALUES } from "./components/branding/branding-defaults";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: DEFAULT_BRANDING_VALUES.appTitle,
  description: "Configurable multi-tenant HRM platform for modern teams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${instrumentSans.variable} ${literata.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
