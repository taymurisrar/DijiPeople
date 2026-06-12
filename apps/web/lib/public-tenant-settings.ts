import type { CSSProperties } from "react";
import {
  type BrandingSettings,
  buildBrandingCssVariables,
  resolveTenantBranding,
} from "@/lib/branding";

export type PublicTenantSettings = Partial<BrandingSettings> & {
  tenantId?: string | null;
  tenantSlug?: string | null;
  tenantName?: string | null;
};

export function buildInitialBrandingStyle(
  settings: PublicTenantSettings,
): CSSProperties {
  return buildBrandingCssVariables(
    resolveTenantBranding({
      ...toBrandingSettingsRecord(settings),
      tenantName: settings.tenantName,
    }),
  ) as CSSProperties;
}

export function toBrandingSettingsRecord(settings: PublicTenantSettings) {
  return Object.fromEntries(
    Object.entries(settings).filter(
      ([, value]) => typeof value === "string" || value === null,
    ),
  ) as Partial<Record<string, string | null>>;
}
