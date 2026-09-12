import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
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
import {
  parseThemeChoice,
  resolveThemePrecedence,
  TENANT_THEME_ATTRIBUTE,
  THEME_COOKIE,
  THEME_STORAGE_KEY,
} from "@/lib/theme";
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

  /*
   * BUG-3373 — the pre-paint decision used to see only `localStorage` and the
   * operating system, never the tenant default, so a Light tenant on a
   * dark-preferring machine painted dark for the first several hundred
   * milliseconds of every full load. `publicSettings` is already fetched
   * above and already carries `themeMode`; the only thing missing was reading
   * it here rather than only inside `buildInitialBrandingStyle`.
   *
   * Precedence is explicit choice (mirrored into a cookie by
   * `storeThemeChoice`) → tenant default → device. The device is the one
   * input the server genuinely cannot see, so a `system` result is left
   * unresolved here on purpose — `THEME_BOOTSTRAP_SCRIPT` below finishes it
   * with `matchMedia` before paint, seeded from `data-tenant-theme` rather
   * than guessing.
   */
  const tenantThemeDefault = parseThemeChoice(
    resolveTenantBranding({
      ...publicSettings,
      tenantName: publicSettings.tenantName,
    }).themeMode.toLowerCase(),
  );
  const storedThemeChoice = parseThemeChoice(
    (await cookies()).get(THEME_COOKIE)?.value,
  );
  const effectiveChoice = resolveThemePrecedence(
    storedThemeChoice,
    tenantThemeDefault,
  );
  const resolvedTheme = effectiveChoice === "system" ? undefined : effectiveChoice;

  return (
    <html
      lang="en"
      className={`${instrumentSans.variable} ${literata.variable} h-full antialiased`}
      style={buildInitialBrandingStyle(publicSettings)}
      data-theme={resolvedTheme}
      data-tenant-theme={tenantThemeDefault ?? "system"}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        {/*
         * Finishes resolving the theme before the page paints, on every route.
         *
         * The layout above already stamps `data-theme` server-side whenever it
         * can, which is every case except an effective choice of `system` —
         * the one input (the OS preference) the server cannot see. This script
         * exists for exactly that remaining case, plus one migration: a choice
         * made before this fix shipped lives only in `localStorage`, with no
         * cookie yet for the server to read, and gets mirrored into one here so
         * the *next* full load is resolved server-side too.
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
 * the first paint. Kept small and defensive — a browser with storage or cookies
 * blocked falls back to the system preference rather than throwing.
 *
 * It does not run in <head>, whatever this comment said until BUG-1261 — the
 * placement note above <script> is the accurate one, and this line contradicting
 * it is exactly what would send the next author to move the tag back.
 *
 * The cookie/attribute/storage-key names are interpolated from `lib/theme.ts`
 * rather than duplicated as literals, so this string cannot silently drift
 * from the module the rest of the app resolves theme through.
 */
const THEME_BOOTSTRAP_SCRIPT = `(function () {
  try {
    var root = document.documentElement;
    var isValid = function (value) {
      return value === "light" || value === "dark" || value === "system";
    };
    var cookieMatch = document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=([^;]*)/);
    var cookieChoice = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null;
    var stored = null;
    try {
      stored = window.localStorage.getItem("${THEME_STORAGE_KEY}");
    } catch (storageError) {
      stored = null;
    }

    if (!isValid(cookieChoice) && isValid(stored)) {
      // Pre-fix choice, cookie-less: migrate it so the next full load does
      // not need this script to already know it.
      document.cookie = "${THEME_COOKIE}=" + stored + "; path=/; max-age=31536000; samesite=lax";
    }

    var choice = isValid(cookieChoice) ? cookieChoice : (isValid(stored) ? stored : null);
    var tenantDefault = root.getAttribute("${TENANT_THEME_ATTRIBUTE}");
    var effective = choice || (isValid(tenantDefault) ? tenantDefault : null) || "system";

    if (effective === "system") {
      var dark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.setAttribute("data-theme", dark ? "dark" : "light");
    } else if (root.getAttribute("data-theme") !== effective) {
      root.setAttribute("data-theme", effective);
    }
  } catch (error) {
    if (!document.documentElement.getAttribute("data-theme")) {
      document.documentElement.setAttribute("data-theme", "light");
    }
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
