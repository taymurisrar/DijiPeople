export type TenantThemeMode = "light" | "dark" | "system";
export type TenantDensity = "compact" | "comfortable" | "spacious";
export type TenantTextDirection = "ltr" | "rtl";
export type TenantBorderRadius = "none" | "small" | "medium" | "large" | "full";

export interface TenantBrandingConfig {
  readonly appTitle: string;
  readonly brandName: string;
  readonly shortBrandName?: string;
  readonly logoUrl?: string;
  readonly logoDarkUrl?: string;
  readonly faviconUrl?: string;
  readonly primaryColor: string;
  readonly secondaryColor?: string;
  readonly accentColor?: string;
  readonly backgroundColor?: string;
  readonly surfaceColor?: string;
  readonly textColor?: string;
  readonly mutedTextColor?: string;
  readonly borderColor?: string;
  readonly successColor?: string;
  readonly warningColor?: string;
  readonly dangerColor?: string;
  readonly infoColor?: string;
  readonly fontFamilyKey: string;
  readonly fontStack: string;
  readonly bodyFontFamilyKey: string;
  readonly bodyFontStack: string;
  readonly headingFontFamilyKey: string;
  readonly headingFontStack: string;
  readonly themeMode: TenantThemeMode;
  readonly density: TenantDensity;
  readonly borderRadius: TenantBorderRadius;
}

export interface TenantRuntimeConfig {
  readonly tenantId: string;
  readonly tenantSlug: string;
  readonly displayName: string;
  readonly locale: string;
  readonly timezone: string;
  readonly dateFormat: string;
  readonly timeFormat: string;
  readonly dateTimeFormat: string;
  readonly currencyCode?: string;
  readonly textDirection: TenantTextDirection;
  readonly branding: TenantBrandingConfig;
  readonly featureFlags?: Readonly<Record<string, boolean>>;
  readonly runtimeVersion?: string;
  readonly cachePartitionKey: string;
}
