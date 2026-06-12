import type {
  TenantBorderRadius,
  TenantBrandingConfig,
  TenantDensity,
  TenantRuntimeConfig,
  TenantTextDirection,
  TenantThemeMode,
} from "./tenant-runtime.types";

export interface TenantRuntimeResolverInput {
  readonly tenantId?: string | null;
  readonly tenantSlug: string;
  readonly displayName?: string | null;
  readonly locale?: string | null;
  readonly timezone?: string | null;
  readonly dateFormat?: string | null;
  readonly timeFormat?: string | null;
  readonly dateTimeFormat?: string | null;
  readonly currencyCode?: string | null;
  readonly textDirection?: string | null;
  readonly runtimeVersion?: string | null;
  readonly featureFlags?: Readonly<Record<string, boolean>> | null;
  readonly branding?: Partial<TenantBrandingConfig> | null;
  readonly settings?: Readonly<
    Record<string, string | boolean | null | undefined>
  >;
}

const DEFAULT_FONT_STACK = "Inter, ui-sans-serif, system-ui, sans-serif";

const DEFAULT_BRANDING: TenantBrandingConfig = {
  appTitle: "DijiPeople",
  brandName: "DijiPeople",
  primaryColor: "#2563eb",
  secondaryColor: "#0f172a",
  accentColor: "#14b8a6",
  fontFamilyKey: "INTER",
  fontStack: DEFAULT_FONT_STACK,
  bodyFontFamilyKey: "INTER",
  bodyFontStack: DEFAULT_FONT_STACK,
  headingFontFamilyKey: "INTER",
  headingFontStack: DEFAULT_FONT_STACK,
  themeMode: "light",
  density: "comfortable",
  borderRadius: "large",
};

export function resolveTenantRuntimeConfig(
  input: TenantRuntimeResolverInput,
): TenantRuntimeConfig {
  const tenantSlug = normalizeSlug(input.tenantSlug);
  const settings = input.settings ?? {};
  const branding = input.branding ?? {};
  const bodyFontKey = normalizeText(
    readSetting(settings, "bodyFontFamilyKey"),
    branding.bodyFontFamilyKey ??
      branding.fontFamilyKey ??
      DEFAULT_BRANDING.bodyFontFamilyKey,
  );
  const headingFontKey = normalizeText(
    readSetting(settings, "headingFontFamilyKey"),
    branding.headingFontFamilyKey ??
      branding.fontFamilyKey ??
      DEFAULT_BRANDING.headingFontFamilyKey,
  );
  const bodyFontStack = normalizeText(
    readSetting(settings, "bodyFontStack"),
    branding.bodyFontStack ??
      branding.fontStack ??
      DEFAULT_BRANDING.bodyFontStack,
  );
  const headingFontStack = normalizeText(
    readSetting(settings, "headingFontStack"),
    branding.headingFontStack ??
      branding.fontStack ??
      DEFAULT_BRANDING.headingFontStack,
  );

  return {
    tenantId: normalizeText(input.tenantId, tenantSlug),
    tenantSlug,
    displayName: normalizeText(input.displayName, tenantSlug),
    locale: normalizeText(
      input.locale ?? readSetting(settings, "locale"),
      "en-US",
    ),
    timezone: normalizeText(
      input.timezone ?? readSetting(settings, "timezone"),
      "Asia/Riyadh",
    ),
    dateFormat: normalizeText(
      input.dateFormat ?? readSetting(settings, "dateFormat"),
      "yyyy-MM-dd",
    ),
    timeFormat: normalizeText(
      input.timeFormat ?? readSetting(settings, "timeFormat"),
      "HH:mm",
    ),
    dateTimeFormat: normalizeText(
      input.dateTimeFormat ?? readSetting(settings, "dateTimeFormat"),
      "yyyy-MM-dd HH:mm",
    ),
    currencyCode: normalizeOptionalText(
      input.currencyCode ?? readSetting(settings, "currencyCode"),
    ),
    textDirection: normalizeTextDirection(
      input.textDirection ?? readSetting(settings, "textDirection"),
    ),
    branding: {
      ...DEFAULT_BRANDING,
      ...branding,
      appTitle: normalizeText(
        branding.appTitle ?? readSetting(settings, "appTitle"),
        DEFAULT_BRANDING.appTitle,
      ),
      brandName: normalizeText(
        branding.brandName ?? readSetting(settings, "brandName"),
        DEFAULT_BRANDING.brandName,
      ),
      logoUrl: normalizeOptionalText(
        branding.logoUrl ?? readSetting(settings, "logoUrl"),
      ),
      faviconUrl: normalizeOptionalText(
        branding.faviconUrl ?? readSetting(settings, "faviconUrl"),
      ),
      primaryColor: normalizeColor(
        branding.primaryColor ?? readSetting(settings, "primaryColor"),
        DEFAULT_BRANDING.primaryColor,
      ),
      secondaryColor: normalizeColor(
        branding.secondaryColor ?? readSetting(settings, "secondaryColor"),
        DEFAULT_BRANDING.secondaryColor ?? DEFAULT_BRANDING.primaryColor,
      ),
      fontFamilyKey: bodyFontKey,
      fontStack: bodyFontStack,
      bodyFontFamilyKey: bodyFontKey,
      bodyFontStack,
      headingFontFamilyKey: headingFontKey,
      headingFontStack,
      themeMode: normalizeThemeMode(
        branding.themeMode ?? readSetting(settings, "themeMode"),
      ),
      density: normalizeDensity(
        branding.density ?? readSetting(settings, "density"),
      ),
      borderRadius: normalizeBorderRadius(
        branding.borderRadius ?? readSetting(settings, "borderRadius"),
      ),
    },
    featureFlags: input.featureFlags ?? undefined,
    runtimeVersion: normalizeOptionalText(input.runtimeVersion),
    cachePartitionKey: `tenant:${tenantSlug}`,
  };
}

function readSetting(
  settings: Readonly<Record<string, string | boolean | null | undefined>>,
  key: string,
) {
  const value = settings[key];
  return typeof value === "boolean" ? String(value) : value;
}

function normalizeSlug(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized || "default";
}

function normalizeText(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function normalizeColor(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed?.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
    ? trimmed
    : fallback;
}

function normalizeThemeMode(value: string | null | undefined): TenantThemeMode {
  return value === "dark" || value === "system" || value === "light"
    ? value
    : DEFAULT_BRANDING.themeMode;
}

function normalizeDensity(value: string | null | undefined): TenantDensity {
  return value === "compact" || value === "spacious" || value === "comfortable"
    ? value
    : DEFAULT_BRANDING.density;
}

function normalizeBorderRadius(
  value: string | null | undefined,
): TenantBorderRadius {
  return value === "none" ||
    value === "small" ||
    value === "medium" ||
    value === "large" ||
    value === "full"
    ? value
    : DEFAULT_BRANDING.borderRadius;
}

function normalizeTextDirection(
  value: string | null | undefined,
): TenantTextDirection {
  return value === "rtl" ? "rtl" : "ltr";
}
