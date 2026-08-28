import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";

import {
  ADMIN_THEME_COOKIE,
  THEME_BOOTSTRAP_SCRIPT,
} from "@/lib/console-theme-bootstrap";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  /*
   * A template, so a per-route title composes rather than replaces (BUG-1421).
   *
   * 47 of 48 audited screens shared this one title, which made every browser
   * tab, every bookmark and every screen reader page announcement say the same
   * thing. `default` still covers the routes that set none — the three client
   * components that cannot export metadata, and the auth screens outside the
   * console.
   */
  title: {
    template: "%s · DijiPeople Admin",
    default: "DijiPeople Admin",
  },
  description: "Internal SaaS control panel for DijiPeople operations.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any", type: "image/x-icon" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-only.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon-180x180.png",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  /*
   * The preference, read from the cookie the console writes when it applies
   * one. See `console-theme-bootstrap.ts` for why a cookie is the only thing
   * that can reach this layout, and why resolving SYSTEM is the script's job
   * rather than this one's.
   */
  const preference = (await cookies()).get(ADMIN_THEME_COOKIE)?.value;
  const theme =
    preference === "dark" || preference === "light" ? preference : undefined;

  return (
    <html
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      data-admin-theme={theme}
      /*
       * The bootstrap script edits `documentElement` before React hydrates, so
       * the served markup and the hydrated tree differ by design.
       */
      lang="en"
      suppressHydrationWarning
    >
      {/*
        Background and text come from the theme tokens. They were
        `bg-slate-100 text-slate-950` — hardcoded light, on the one element
        outside every route group and therefore outside anything that knows the
        preference. Even with the attribute set correctly, the page behind the
        shell stayed light.

        `suppressHydrationWarning` because extensions stamp their own attributes
        on `<body>` — Grammarly, password managers, translation tools — and a
        warning this app cannot prevent is a warning that trains operators to
        ignore the console.
      */}
      <body
        className="min-h-full bg-[var(--admin-background)] font-sans text-[var(--admin-text)]"
        suppressHydrationWarning
      >
        {/*
          Blocking, inline, and the first child of `<body>` — not in `<head>`.

          Blocking and inline because it has to run before the first paint, and
          anything deferred is by definition after it. First child of `<body>`
          rather than `<head>` because React reconciles `<head>` position by
          position, and browser extensions insert their own `<script>` there
          before React loads: React then compares our inline bootstrap against
          whatever the extension put in that slot and reports a hydration
          mismatch — `src="chrome-extension://…"` on the client, `__html` on
          the server — on every console load. It still precedes the paint here,
          because nothing below it has been parsed yet. `apps/web` met this
          first and moved its own bootstrap out of `<head>` for the same reason.
        */}
        <script
          dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }}
          id="admin-theme-bootstrap"
        />
        {children}
      </body>
    </html>
  );
}
