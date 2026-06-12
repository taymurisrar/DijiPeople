import type { TenantRuntimeConfig } from "../../../lib/runtime/tenant-runtime.types";

export function buildTenantRuntimeCssVariables(
  tenant: TenantRuntimeConfig,
): Record<string, string> {
  const radiusValues = {
    none: "0px",
    small: "6px",
    medium: "10px",
    large: "14px",
    full: "9999px",
  } as const;

  const densityValues = {
    compact: "0.875",
    comfortable: "1",
    spacious: "1.125",
  } as const;

  return {
    "--dp-runtime-font-body": tenant.branding.bodyFontStack,
    "--dp-runtime-font-heading": tenant.branding.headingFontStack,
    "--dp-runtime-primary": tenant.branding.primaryColor,
    "--dp-runtime-secondary": tenant.branding.secondaryColor ?? tenant.branding.primaryColor,
    "--dp-runtime-radius": radiusValues[tenant.branding.borderRadius],
    "--dp-runtime-density": densityValues[tenant.branding.density],
  };
}
