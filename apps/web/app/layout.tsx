import type { Metadata } from "next";
import { headers } from "next/headers";
import { cache } from "react";
import { Instrument_Sans, Literata } from "next/font/google";
import { TenantSettingsProvider } from "./components/settings/tenant-settings-provider";
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
      <body className="min-h-full flex flex-col">
        <TenantSettingsProvider initialPublicSettings={publicSettings}>
          {children}
        </TenantSettingsProvider>
      </body>
    </html>
  );
}

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
