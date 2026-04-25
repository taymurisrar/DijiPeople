import { DEFAULT_BRANDING_VALUES } from "@/app/components/branding/branding-defaults";

export const BRANDING_COLOR_KEYS = [
  "primaryColor",
  "secondaryColor",
  "accentColor",
  "backgroundColor",
  "surfaceColor",
  "textColor",
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

export type BrandingFontKey = (typeof BRANDING_FONT_OPTIONS)[number]["key"];
export type BrandingColorKey = (typeof BRANDING_COLOR_KEYS)[number];
export type BrandingTextKey = (typeof BRANDING_TEXT_KEYS)[number];

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
  logoUrl: string;
  faviconUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  textColor: string;
  fontFamily: BrandingFontKey;
};

const HEX_COLOR_PATTERN = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/;
const SUPPORTED_FONT_KEYS = new Set<BrandingFontKey>(
  BRANDING_FONT_OPTIONS.map((entry) => entry.key),
);

export const DEFAULT_BRANDING_SETTINGS: BrandingSettings = {
  ...DEFAULT_BRANDING_VALUES,
};

export function isValidHexColor(value: string) {
  return HEX_COLOR_PATTERN.test(value.trim());
}

export function normalizeHexColor(value: string, fallback: string) {
  const trimmed = value.trim();
  return isValidHexColor(trimmed) ? trimmed : fallback;
}

export function normalizeFontFamily(value: string | null | undefined) {
  if (!value) {
    return DEFAULT_BRANDING_SETTINGS.fontFamily;
  }

  const normalized = value.trim().toUpperCase() as BrandingFontKey;
  if (SUPPORTED_FONT_KEYS.has(normalized)) {
    return normalized;
  }

  return DEFAULT_BRANDING_SETTINGS.fontFamily;
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
    appTitle: normalizeText(branding?.appTitle, DEFAULT_BRANDING_SETTINGS.appTitle),
    brandName: normalizeText(branding?.brandName, DEFAULT_BRANDING_SETTINGS.brandName),
    shortBrandName: normalizeText(
      branding?.shortBrandName,
      DEFAULT_BRANDING_SETTINGS.shortBrandName,
    ),
    portalTagline: normalizeText(
      branding?.portalTagline,
      DEFAULT_BRANDING_SETTINGS.portalTagline,
    ),
    welcomeTitle: normalizeText(
      branding?.welcomeTitle,
      DEFAULT_BRANDING_SETTINGS.welcomeTitle,
    ),
    welcomeSubtitle: normalizeText(
      branding?.welcomeSubtitle,
      DEFAULT_BRANDING_SETTINGS.welcomeSubtitle,
    ),
    footerText: normalizeText(
      branding?.footerText,
      DEFAULT_BRANDING_SETTINGS.footerText,
    ),
    dashboardGreeting: normalizeText(
      branding?.dashboardGreeting,
      DEFAULT_BRANDING_SETTINGS.dashboardGreeting,
    ),
    employeePortalMessage: normalizeText(
      branding?.employeePortalMessage,
      DEFAULT_BRANDING_SETTINGS.employeePortalMessage,
    ),
    logoUrl: normalizeText(branding?.logoUrl, DEFAULT_BRANDING_SETTINGS.logoUrl),
    faviconUrl: normalizeText(
      branding?.faviconUrl,
      DEFAULT_BRANDING_SETTINGS.faviconUrl,
    ),
    primaryColor: normalizeHexColor(
      branding?.primaryColor ?? "",
      DEFAULT_BRANDING_SETTINGS.primaryColor,
    ),
    secondaryColor: normalizeHexColor(
      branding?.secondaryColor ?? "",
      DEFAULT_BRANDING_SETTINGS.secondaryColor,
    ),
    accentColor: normalizeHexColor(
      branding?.accentColor ?? "",
      DEFAULT_BRANDING_SETTINGS.accentColor,
    ),
    backgroundColor: normalizeHexColor(
      branding?.backgroundColor ?? branding?.appBackgroundColor ?? "",
      DEFAULT_BRANDING_SETTINGS.backgroundColor,
    ),
    surfaceColor: normalizeHexColor(
      branding?.surfaceColor ?? branding?.appSurfaceColor ?? "",
      DEFAULT_BRANDING_SETTINGS.surfaceColor,
    ),
    textColor: normalizeHexColor(
      branding?.textColor ?? "",
      DEFAULT_BRANDING_SETTINGS.textColor,
    ),
    fontFamily: normalizeFontFamily(branding?.fontFamily),
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
    "--dp-font-family": fontStack,
  } as Record<string, string>;
}

function normalizeText(value: string | null | undefined, fallback: string) {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

