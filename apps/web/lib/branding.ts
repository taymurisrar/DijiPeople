import { DEFAULT_BRANDING_VALUES } from "@/app/components/branding/branding-defaults";

export const BRANDING_COLOR_KEYS = [
  "primaryColor",
  "secondaryColor",
  "accentColor",
  "backgroundColor",
  "surfaceColor",
  "textColor",
  "mutedTextColor",
  "borderColor",
  "sidebarBackgroundColor",
  "sidebarTextColor",
  "sidebarActiveBackgroundColor",
  "sidebarActiveTextColor",
  "successColor",
  "warningColor",
  "dangerColor",
  "infoColor",
] as const;

export const BRANDING_TEXT_KEYS = [
  "appTitle",
  "brandName",
  "shortBrandName",
  "portalTagline",
  "welcomeTitle",
  "welcomeSubtitle",
  "footerText",
  "dashboardGreeting",
  "employeePortalMessage",
  "supportEmail",
  "supportPhone",
  "privacyPolicyUrl",
  "termsOfUseUrl",
] as const;

export const BRANDING_ASSET_KEYS = [
  "logoUrl",
  "logoDarkUrl",
  "faviconUrl",
  "loginHeroImageUrl",
  "emailHeaderLogoUrl",
] as const;

export const BRANDING_FONT_OPTIONS = [
  {
    key: "INTER",
    label: "Inter",
    stack: "Inter, ui-sans-serif, system-ui, sans-serif",
  },
  {
    key: "ROBOTO",
    label: "Roboto",
    stack: "Roboto, Arial, sans-serif",
  },
  {
    key: "OPEN_SANS",
    label: "Open Sans",
    stack: '"Open Sans", Arial, sans-serif',
  },
  {
    key: "LATO",
    label: "Lato",
    stack: "Lato, Arial, sans-serif",
  },
  {
    key: "POPPINS",
    label: "Poppins",
    stack: "Poppins, Arial, sans-serif",
  },
  {
    key: "MONTSERRAT",
    label: "Montserrat",
    stack: "Montserrat, Arial, sans-serif",
  },
  {
    key: "NUNITO",
    label: "Nunito",
    stack: "Nunito, Arial, sans-serif",
  },
  {
    key: "SOURCE_SANS_3",
    label: "Source Sans 3",
    stack: '"Source Sans 3", Arial, sans-serif',
  },
] as const;

export const BRANDING_THEME_MODES = ["LIGHT", "DARK", "SYSTEM"] as const;
export const BRANDING_DENSITY_OPTIONS = ["COMPACT", "COMFORTABLE", "SPACIOUS"] as const;
export const BRANDING_RADIUS_OPTIONS = ["NONE", "SMALL", "MEDIUM", "LARGE", "FULL"] as const;
export const BRANDING_SHADOW_OPTIONS = ["NONE", "SOFT", "MEDIUM", "STRONG"] as const;
export const BRANDING_NAVIGATION_LAYOUTS = ["SIDEBAR", "TOPBAR", "HYBRID"] as const;

export type BrandingFontKey = (typeof BRANDING_FONT_OPTIONS)[number]["key"];
export type BrandingColorKey = (typeof BRANDING_COLOR_KEYS)[number];
export type BrandingTextKey = (typeof BRANDING_TEXT_KEYS)[number];
export type BrandingAssetKey = (typeof BRANDING_ASSET_KEYS)[number];
export type BrandingThemeMode = (typeof BRANDING_THEME_MODES)[number];
export type BrandingDensity = (typeof BRANDING_DENSITY_OPTIONS)[number];
export type BrandingRadius = (typeof BRANDING_RADIUS_OPTIONS)[number];
export type BrandingShadow = (typeof BRANDING_SHADOW_OPTIONS)[number];
export type BrandingNavigationLayout = (typeof BRANDING_NAVIGATION_LAYOUTS)[number];

export type BrandingSettings = {
  appTitle: string;
  brandName: string;
  shortBrandName: string;
  portalTagline: string;
  welcomeTitle: string;
  welcomeSubtitle: string;
  footerText: string;
  dashboardGreeting: string;
  employeePortalMessage: string;

  supportEmail: string;
  supportPhone: string;
  privacyPolicyUrl: string;
  termsOfUseUrl: string;

  logoUrl: string;
  logoDarkUrl: string;
  faviconUrl: string;
  loginHeroImageUrl: string;
  emailHeaderLogoUrl: string;

  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  mutedTextColor: string;
  borderColor: string;
  sidebarBackgroundColor: string;
  sidebarTextColor: string;
  sidebarActiveBackgroundColor: string;
  sidebarActiveTextColor: string;
  successColor: string;
  warningColor: string;
  dangerColor: string;
  infoColor: string;

  fontFamily: BrandingFontKey;
  themeMode: BrandingThemeMode;
  density: BrandingDensity;
  radius: BrandingRadius;
  shadow: BrandingShadow;
  navigationLayout: BrandingNavigationLayout;
};

const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;
const URL_PATTERN = /^(https?:\/\/|\/)[^\s]+$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SUPPORTED_FONT_KEYS = new Set<BrandingFontKey>(
  BRANDING_FONT_OPTIONS.map((entry) => entry.key),
);

const SUPPORTED_THEME_MODES = new Set<BrandingThemeMode>(BRANDING_THEME_MODES);
const SUPPORTED_DENSITIES = new Set<BrandingDensity>(BRANDING_DENSITY_OPTIONS);
const SUPPORTED_RADIUS_OPTIONS = new Set<BrandingRadius>(BRANDING_RADIUS_OPTIONS);
const SUPPORTED_SHADOW_OPTIONS = new Set<BrandingShadow>(BRANDING_SHADOW_OPTIONS);
const SUPPORTED_NAVIGATION_LAYOUTS = new Set<BrandingNavigationLayout>(
  BRANDING_NAVIGATION_LAYOUTS,
);

export const DEFAULT_BRANDING_SETTINGS: BrandingSettings = {
  appTitle: DEFAULT_BRANDING_VALUES.appTitle,
  brandName: DEFAULT_BRANDING_VALUES.brandName,
  shortBrandName: DEFAULT_BRANDING_VALUES.shortBrandName,
  portalTagline: DEFAULT_BRANDING_VALUES.portalTagline,
  welcomeTitle: DEFAULT_BRANDING_VALUES.welcomeTitle,
  welcomeSubtitle: DEFAULT_BRANDING_VALUES.welcomeSubtitle,
  footerText: DEFAULT_BRANDING_VALUES.footerText,
  dashboardGreeting: DEFAULT_BRANDING_VALUES.dashboardGreeting,
  employeePortalMessage: DEFAULT_BRANDING_VALUES.employeePortalMessage,

  supportEmail: "",
  supportPhone: "",
  privacyPolicyUrl: "",
  termsOfUseUrl: "",

  logoUrl: DEFAULT_BRANDING_VALUES.logoUrl,
  logoDarkUrl: DEFAULT_BRANDING_VALUES.logoUrl,
  faviconUrl: DEFAULT_BRANDING_VALUES.faviconUrl,
  loginHeroImageUrl: "",
  emailHeaderLogoUrl: DEFAULT_BRANDING_VALUES.logoUrl,

  primaryColor: DEFAULT_BRANDING_VALUES.primaryColor,
  secondaryColor: DEFAULT_BRANDING_VALUES.secondaryColor,
  accentColor: DEFAULT_BRANDING_VALUES.accentColor,
  backgroundColor: DEFAULT_BRANDING_VALUES.backgroundColor,
  surfaceColor: DEFAULT_BRANDING_VALUES.surfaceColor,
  textColor: DEFAULT_BRANDING_VALUES.textColor,

  mutedTextColor: "#64748b",
  borderColor: "#e2e8f0",
  sidebarBackgroundColor: "#0f172a",
  sidebarTextColor: "#e5e7eb",
  sidebarActiveBackgroundColor: DEFAULT_BRANDING_VALUES.primaryColor,
  sidebarActiveTextColor: "#ffffff",

  successColor: "#16a34a",
  warningColor: "#f59e0b",
  dangerColor: "#dc2626",
  infoColor: "#2563eb",

  fontFamily: DEFAULT_BRANDING_VALUES.fontFamily,
  themeMode: "LIGHT",
  density: "COMFORTABLE",
  radius: "LARGE",
  shadow: "SOFT",
  navigationLayout: "SIDEBAR",
};

export function isValidHexColor(value: string) {
  return HEX_COLOR_PATTERN.test(value.trim());
}

export function normalizeHexColor(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;

  const trimmed = value.trim();

  if (!isValidHexColor(trimmed)) {
    return fallback;
  }

  const hex = trimmed.toLowerCase();

  if (hex.length === 4) {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }

  return hex;
}

export function normalizeFontFamily(value: string | null | undefined) {
  if (!value) {
    return DEFAULT_BRANDING_SETTINGS.fontFamily;
  }

  const normalized = value.trim().toUpperCase() as BrandingFontKey;

  return SUPPORTED_FONT_KEYS.has(normalized)
    ? normalized
    : DEFAULT_BRANDING_SETTINGS.fontFamily;
}

export function normalizeThemeMode(value: string | null | undefined) {
  const normalized = normalizeEnumValue(value, SUPPORTED_THEME_MODES);
  return normalized ?? DEFAULT_BRANDING_SETTINGS.themeMode;
}

export function normalizeDensity(value: string | null | undefined) {
  const normalized = normalizeEnumValue(value, SUPPORTED_DENSITIES);
  return normalized ?? DEFAULT_BRANDING_SETTINGS.density;
}

export function normalizeRadius(value: string | null | undefined) {
  const normalized = normalizeEnumValue(value, SUPPORTED_RADIUS_OPTIONS);
  return normalized ?? DEFAULT_BRANDING_SETTINGS.radius;
}

export function normalizeShadow(value: string | null | undefined) {
  const normalized = normalizeEnumValue(value, SUPPORTED_SHADOW_OPTIONS);
  return normalized ?? DEFAULT_BRANDING_SETTINGS.shadow;
}

export function normalizeNavigationLayout(value: string | null | undefined) {
  const normalized = normalizeEnumValue(value, SUPPORTED_NAVIGATION_LAYOUTS);
  return normalized ?? DEFAULT_BRANDING_SETTINGS.navigationLayout;
}

export function getFontOptionByKey(fontKey: BrandingFontKey) {
  return (
    BRANDING_FONT_OPTIONS.find((font) => font.key === fontKey) ??
    BRANDING_FONT_OPTIONS[0]
  );
}

export function resolveBrandingSettings(
  branding?: Partial<Record<string, string | null>> | null,
): BrandingSettings {
  return {
    appTitle: normalizeText(branding?.appTitle, DEFAULT_BRANDING_SETTINGS.appTitle, 80),
    brandName: normalizeText(branding?.brandName, DEFAULT_BRANDING_SETTINGS.brandName, 80),
    shortBrandName: normalizeText(
      branding?.shortBrandName,
      DEFAULT_BRANDING_SETTINGS.shortBrandName,
      24,
    ),
    portalTagline: normalizeText(
      branding?.portalTagline,
      DEFAULT_BRANDING_SETTINGS.portalTagline,
      140,
    ),
    welcomeTitle: normalizeText(
      branding?.welcomeTitle,
      DEFAULT_BRANDING_SETTINGS.welcomeTitle,
      120,
    ),
    welcomeSubtitle: normalizeText(
      branding?.welcomeSubtitle,
      DEFAULT_BRANDING_SETTINGS.welcomeSubtitle,
      240,
    ),
    footerText: normalizeText(
      branding?.footerText,
      DEFAULT_BRANDING_SETTINGS.footerText,
      160,
    ),
    dashboardGreeting: normalizeText(
      branding?.dashboardGreeting,
      DEFAULT_BRANDING_SETTINGS.dashboardGreeting,
      120,
    ),
    employeePortalMessage: normalizeText(
      branding?.employeePortalMessage,
      DEFAULT_BRANDING_SETTINGS.employeePortalMessage,
      240,
    ),

    supportEmail: normalizeEmail(branding?.supportEmail, DEFAULT_BRANDING_SETTINGS.supportEmail),
    supportPhone: normalizeText(
      branding?.supportPhone,
      DEFAULT_BRANDING_SETTINGS.supportPhone,
      40,
    ),
    privacyPolicyUrl: normalizeUrl(
      branding?.privacyPolicyUrl,
      DEFAULT_BRANDING_SETTINGS.privacyPolicyUrl,
    ),
    termsOfUseUrl: normalizeUrl(
      branding?.termsOfUseUrl,
      DEFAULT_BRANDING_SETTINGS.termsOfUseUrl,
    ),

    logoUrl: normalizeUrl(branding?.logoUrl, DEFAULT_BRANDING_SETTINGS.logoUrl),
    logoDarkUrl: normalizeUrl(
      branding?.logoDarkUrl,
      branding?.logoUrl ?? DEFAULT_BRANDING_SETTINGS.logoDarkUrl,
    ),
    faviconUrl: normalizeUrl(branding?.faviconUrl, DEFAULT_BRANDING_SETTINGS.faviconUrl),
    loginHeroImageUrl: normalizeUrl(
      branding?.loginHeroImageUrl,
      DEFAULT_BRANDING_SETTINGS.loginHeroImageUrl,
    ),
    emailHeaderLogoUrl: normalizeUrl(
      branding?.emailHeaderLogoUrl,
      branding?.logoUrl ?? DEFAULT_BRANDING_SETTINGS.emailHeaderLogoUrl,
    ),

    primaryColor: normalizeHexColor(
      branding?.primaryColor,
      DEFAULT_BRANDING_SETTINGS.primaryColor,
    ),
    secondaryColor: normalizeHexColor(
      branding?.secondaryColor,
      DEFAULT_BRANDING_SETTINGS.secondaryColor,
    ),
    accentColor: normalizeHexColor(
      branding?.accentColor,
      DEFAULT_BRANDING_SETTINGS.accentColor,
    ),
    backgroundColor: normalizeHexColor(
      branding?.backgroundColor ?? branding?.appBackgroundColor,
      DEFAULT_BRANDING_SETTINGS.backgroundColor,
    ),
    surfaceColor: normalizeHexColor(
      branding?.surfaceColor ?? branding?.appSurfaceColor,
      DEFAULT_BRANDING_SETTINGS.surfaceColor,
    ),
    textColor: normalizeHexColor(
      branding?.textColor,
      DEFAULT_BRANDING_SETTINGS.textColor,
    ),
    mutedTextColor: normalizeHexColor(
      branding?.mutedTextColor,
      DEFAULT_BRANDING_SETTINGS.mutedTextColor,
    ),
    borderColor: normalizeHexColor(
      branding?.borderColor,
      DEFAULT_BRANDING_SETTINGS.borderColor,
    ),
    sidebarBackgroundColor: normalizeHexColor(
      branding?.sidebarBackgroundColor,
      DEFAULT_BRANDING_SETTINGS.sidebarBackgroundColor,
    ),
    sidebarTextColor: normalizeHexColor(
      branding?.sidebarTextColor,
      DEFAULT_BRANDING_SETTINGS.sidebarTextColor,
    ),
    sidebarActiveBackgroundColor: normalizeHexColor(
      branding?.sidebarActiveBackgroundColor,
      DEFAULT_BRANDING_SETTINGS.sidebarActiveBackgroundColor,
    ),
    sidebarActiveTextColor: normalizeHexColor(
      branding?.sidebarActiveTextColor,
      DEFAULT_BRANDING_SETTINGS.sidebarActiveTextColor,
    ),
    successColor: normalizeHexColor(
      branding?.successColor,
      DEFAULT_BRANDING_SETTINGS.successColor,
    ),
    warningColor: normalizeHexColor(
      branding?.warningColor,
      DEFAULT_BRANDING_SETTINGS.warningColor,
    ),
    dangerColor: normalizeHexColor(
      branding?.dangerColor,
      DEFAULT_BRANDING_SETTINGS.dangerColor,
    ),
    infoColor: normalizeHexColor(
      branding?.infoColor,
      DEFAULT_BRANDING_SETTINGS.infoColor,
    ),

    fontFamily: normalizeFontFamily(branding?.fontFamily),
    themeMode: normalizeThemeMode(branding?.themeMode),
    density: normalizeDensity(branding?.density),
    radius: normalizeRadius(branding?.radius),
    shadow: normalizeShadow(branding?.shadow),
    navigationLayout: normalizeNavigationLayout(branding?.navigationLayout),
  };
}

export function buildBrandingCssVariables(settings: BrandingSettings) {
  const fontStack = getFontOptionByKey(settings.fontFamily).stack;

  return {
    "--dp-primary": settings.primaryColor,
    "--dp-secondary": settings.secondaryColor,
    "--dp-accent": settings.accentColor,
    "--dp-background": settings.backgroundColor,
    "--dp-surface": settings.surfaceColor,
    "--dp-text": settings.textColor,
    "--dp-muted-text": settings.mutedTextColor,
    "--dp-border": settings.borderColor,

    "--dp-sidebar-background": settings.sidebarBackgroundColor,
    "--dp-sidebar-text": settings.sidebarTextColor,
    "--dp-sidebar-active-background": settings.sidebarActiveBackgroundColor,
    "--dp-sidebar-active-text": settings.sidebarActiveTextColor,

    "--dp-success": settings.successColor,
    "--dp-warning": settings.warningColor,
    "--dp-danger": settings.dangerColor,
    "--dp-info": settings.infoColor,

    "--dp-font-family": fontStack,
    "--dp-radius": resolveRadiusValue(settings.radius),
    "--dp-shadow": resolveShadowValue(settings.shadow),
    "--dp-density-scale": resolveDensityScale(settings.density),
  } as Record<string, string>;
}

export function buildBrandingPreviewPayload(settings: BrandingSettings) {
  return {
    title: settings.appTitle,
    brand: settings.brandName,
    shortBrand: settings.shortBrandName,
    tagline: settings.portalTagline,
    logoUrl: settings.logoUrl,
    faviconUrl: settings.faviconUrl,
    fontFamily: getFontOptionByKey(settings.fontFamily),
    colors: Object.fromEntries(
      BRANDING_COLOR_KEYS.map((key) => [key, settings[key]]),
    ) as Record<BrandingColorKey, string>,
    cssVariables: buildBrandingCssVariables(settings),
  };
}

export function getBrandingContrastRatio(
  foregroundHex: string,
  backgroundHex: string,
) {
  const foreground = getRelativeLuminance(foregroundHex);
  const background = getRelativeLuminance(backgroundHex);

  const lighter = Math.max(foreground, background);
  const darker = Math.min(foreground, background);

  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

export function hasReadableContrast(
  foregroundHex: string,
  backgroundHex: string,
  minimumRatio = 4.5,
) {
  return getBrandingContrastRatio(foregroundHex, backgroundHex) >= minimumRatio;
}

export function getBrandingValidationIssues(settings: BrandingSettings) {
  const issues: string[] = [];

  if (!hasReadableContrast(settings.textColor, settings.backgroundColor)) {
    issues.push("Text color does not have enough contrast against the background color.");
  }

  if (!hasReadableContrast(settings.sidebarTextColor, settings.sidebarBackgroundColor)) {
    issues.push("Sidebar text color does not have enough contrast against the sidebar background.");
  }

  if (!hasReadableContrast(settings.sidebarActiveTextColor, settings.sidebarActiveBackgroundColor)) {
    issues.push("Active sidebar text color does not have enough contrast against the active sidebar background.");
  }

  if (settings.supportEmail && !EMAIL_PATTERN.test(settings.supportEmail)) {
    issues.push("Support email is not valid.");
  }

  return issues;
}

function normalizeText(
  value: string | null | undefined,
  fallback: string,
  maxLength = 200,
) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return fallback;
  }

  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

function normalizeEmail(value: string | null | undefined, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim().toLowerCase();

  return !trimmed || EMAIL_PATTERN.test(trimmed) ? trimmed : fallback;
}

function normalizeUrl(value: string | null | undefined, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();

  return !trimmed || URL_PATTERN.test(trimmed) ? trimmed : fallback;
}

function normalizeEnumValue<T extends string>(
  value: string | null | undefined,
  supportedValues: Set<T>,
) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase() as T;

  return supportedValues.has(normalized) ? normalized : null;
}

function resolveRadiusValue(radius: BrandingRadius) {
  const values: Record<BrandingRadius, string> = {
    NONE: "0px",
    SMALL: "6px",
    MEDIUM: "10px",
    LARGE: "14px",
    FULL: "9999px",
  };

  return values[radius];
}

function resolveShadowValue(shadow: BrandingShadow) {
  const values: Record<BrandingShadow, string> = {
    NONE: "none",
    SOFT: "0 8px 24px rgba(15, 23, 42, 0.08)",
    MEDIUM: "0 12px 32px rgba(15, 23, 42, 0.12)",
    STRONG: "0 18px 45px rgba(15, 23, 42, 0.18)",
  };

  return values[shadow];
}

function resolveDensityScale(density: BrandingDensity) {
  const values: Record<BrandingDensity, string> = {
    COMPACT: "0.875",
    COMFORTABLE: "1",
    SPACIOUS: "1.125",
  };

  return values[density];
}

function getRelativeLuminance(hexColor: string) {
  const normalized = normalizeHexColor(hexColor, "#000000").replace("#", "");

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  const [r, g, b] = [red, green, blue].map((channel) => {
    const normalizedChannel = channel / 255;
    return normalizedChannel <= 0.03928
      ? normalizedChannel / 12.92
      : Math.pow((normalizedChannel + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}