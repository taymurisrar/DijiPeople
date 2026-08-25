import type { Metadata } from "next";
import { headers } from "next/headers";
import { cache } from "react";
import { Instrument_Sans, Literata } from "next/font/google";
import { TenantSettingsProvider } from "./components/settings/tenant-settings-provider";
import { ThemeApplier } from "./components/theme/theme-applier";
import { apiRequestJson } from "@/lib/server-api";
import { getTenantHintFromRequest } from "@/lib/tenant-resolution";
import {
  buildInitialBrandingStyle,
  type PublicTenantSettings,
} from "@/lib/public-tenant-settings";
import { resolveTenantBranding } from "@/lib/branding";
import { resolveRouteTitle } from "@/lib/tenant-branding-client";
import { buildFaviconMetadata } from "@/lib/favicon-metadata";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});

const literata = Literata({
  variable: "--font-literata",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const publicSettings = await resolvePublicSettingsForRequest();
  const requestHeaders = await headers();
  const branding = resolveTenantBranding({
    ...publicSettings,
    tenantName: publicSettings.tenantName,
  });
  const pageTitle = resolveRouteTitle(
    requestHeaders.get("x-dijipeople-pathname") ?? "/",
  );

  return {
    title: pageTitle
      ? `${pageTitle} | ${branding.appTitle}`
      : branding.appTitle,
    description: "Configurable multi-tenant HRM platform for modern teams.",
    icons: buildFaviconMetadata(branding.faviconUrl),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const publicSettings = await resolvePublicSettingsForRequest();

  return (
    <html
      lang="en"
      className={`${instrumentSans.variable} ${literata.variable} h-full antialiased`}
      style={buildInitialBrandingStyle(publicSettings)}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {/*
         * Applies the stored theme before the page paints, on every route.
         *
         * The toggle component only ran on the page it was mounted on, so a
         * full page load anywhere else came back light even though the user
         * had chosen dark. Setting it here makes the theme a property of the
         * document rather than of one screen.
         *
         * Placed as the first child of <body>, not in <head>: Next owns <head>
         * in the App Router, and browser extensions inject their own scripts
         * there, which React then tries to reconcile against ours and reports
         * as a hydration mismatch. It still runs before anything below it
         * renders, so there is no flash of the wrong theme.
         */}
        <script
          dangerouslySetInnerHTML={{
            __html: THEME_BOOTSTRAP_SCRIPT,
          }}
        />
        <ThemeApplier />
        <TenantSettingsProvider initialPublicSettings={publicSettings}>
          {children}
        </TenantSettingsProvider>
      </body>
    </html>
  );
}

/*
 * Deliberately a string of plain JS rather than an imported module: it has to
 * execute synchronously during document parse, before React hydrates and before
 * the first paint. Kept small and defensive — a browser with storage blocked
 * falls back to the system preference rather than throwing.
 *
 * It does not run in <head>, whatever this comment said until BUG-1261 — the
 * placement note above <script> is the accurate one, and this line contradicting
 * it is exactly what would send the next author to move the tag back.
 */
const THEME_BOOTSTRAP_SCRIPT = `(function () {
  try {
    var stored = window.localStorage.getItem("dijipeople:theme");
    var choice = stored === "light" || stored === "dark" || stored === "system"
      ? stored
      : "system";
    var resolved = choice === "system"
      ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
      : choice;
    document.documentElement.setAttribute("data-theme", resolved);
  } catch (error) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();`;

const getPublicSettings = cache(async (tenantSlug: string) => {
  const query = tenantSlug
    ? `?tenantSlug=${encodeURIComponent(tenantSlug)}`
    : "";
  return apiRequestJson<PublicTenantSettings>(
    `/tenant-settings/public-branding${query}`,
    { includeAuth: false },
  ).catch((): PublicTenantSettings => ({}));
});

async function resolvePublicSettingsForRequest() {
  const requestHeaders = await headers();
  const hint = getTenantHintFromRequest({
    host: requestHeaders.get("host"),
  });
  return getPublicSettings(hint.type === "slug" ? (hint.value ?? "") : "");
}
