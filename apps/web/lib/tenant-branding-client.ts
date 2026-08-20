import {
  buildBrandingCssVariables,
  type BrandingSettings,
} from "@/lib/branding";
import { buildFaviconHref, DEFAULT_FAVICON_HREF } from "@/lib/favicon-metadata";
import {
  applyTheme,
  effectiveThemeChoice,
  TENANT_THEME_ATTRIBUTE,
} from "@/lib/theme";

const TENANT_FAVICON_ID = "tenant-favicon";
const BRANDING_ATTRIBUTE = "data-dijipeople-branding";
let lastAppliedTitle = "";
let lastAppliedFont = "";

export function applyTenantBranding(
  branding: BrandingSettings,
  pageTitle?: string,
) {
  const root = document.documentElement;
  const variables = buildBrandingCssVariables(branding);

  for (const [key, value] of Object.entries(variables)) {
    if (root.style.getPropertyValue(key) !== value) {
      root.style.setProperty(key, value);
    }
  }

  root.dataset.density = branding.density.toLowerCase();

  /*
   * BUG-0046 — this used to write `root.dataset.theme` directly, which put the
   * tenant default into the same slot as the resolved answer and lost the race
   * against the theme applier's MutationObserver every time.
   *
   * The tenant default is now published to its own attribute and `applyTheme`
   * resolves the precedence — user choice, then this, then the device. That also
   * stops a themeMode of `SYSTEM` reaching the document as a literal
   * `data-theme="system"`, which matched no rule in `globals.css` and so read as
   * light regardless of the device.
   */
  root.setAttribute(TENANT_THEME_ATTRIBUTE, branding.themeMode.toLowerCase());
  applyTheme(effectiveThemeChoice());

  setRouteTitle(pageTitle ?? "", branding.appTitle);
  upsertFavicon(branding.faviconUrl);

  const font = variables["--font-family"] ?? "";
  if (font !== lastAppliedFont) {
    lastAppliedFont = font;
    logBrandingChange("font applied", font);
  }
}

export function setRouteTitle(pageTitle: string, brandingTitle: string) {
  const tenantTitle = brandingTitle.trim() || "DijiPeople";
  const routeTitle = pageTitle.trim();
  const resolvedTitle = routeTitle
    ? `${routeTitle} | ${tenantTitle}`
    : tenantTitle;

  if (document.title !== resolvedTitle) {
    document.title = resolvedTitle;
  }
  if (lastAppliedTitle !== resolvedTitle) {
    lastAppliedTitle = resolvedTitle;
    logBrandingChange("title applied", resolvedTitle);
  }
}

export function resolveRouteTitle(pathname: string) {
  if (pathname === "/") return "Overview";
  if (pathname === "/login" || pathname.endsWith("/login")) return "Login";

  const segments = pathname.split("/").filter(Boolean);
  if (!segments.length) return "";

  const ignoredSegments = new Set(["new", "edit", "designer"]);
  const meaningful = [...segments]
    .reverse()
    .find(
      (segment) =>
        !ignoredSegments.has(segment) &&
        !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment),
    );

  return titleCase((meaningful ?? segments[0]).replace(/-/g, " "));
}

/**
 * Next renders the branded icon into <head> from generateMetadata and re-applies
 * it on every client navigation. Rewriting those managed tags here made the two
 * fight each other on each route change, so this now only adds a link of its own
 * when the rendered icon genuinely differs — which in practice means a live
 * branding preview, not ordinary navigation.
 */
export function upsertFavicon(faviconUrl?: string | null) {
  const head = document.head;
  if (!head) return;

  const href = normalizeFaviconHref(faviconUrl);
  const existing = document.getElementById(
    TENANT_FAVICON_ID,
  ) as HTMLLinkElement | null;

  if (existing?.href === href) return;

  if (!existing && hasRenderedIcon(href)) return;

  const link = existing ?? document.createElement("link");
  const created = !existing;

  if (created) {
    link.id = TENANT_FAVICON_ID;
    link.rel = "icon";
    link.setAttribute(BRANDING_ATTRIBUTE, "true");
  }

  link.href = href;

  const type = inferFaviconType(href);
  if (type && link.type !== type) {
    link.type = type;
  }

  if (created) {
    // Appended last so it takes precedence over the server-rendered icon.
    head.appendChild(link);
  }

  logBrandingChange(`favicon ${created ? "created" : "updated"}`, href);
}

function hasRenderedIcon(href: string) {
  return Array.from(
    document.querySelectorAll<HTMLLinkElement>("link[rel~='icon']"),
  ).some((link) => link.href === href);
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

// Resolved against the origin so it can be compared with link.href, which the
// DOM always reports as absolute.
function normalizeFaviconHref(value?: string | null) {
  try {
    return new URL(buildFaviconHref(value), window.location.origin).href;
  } catch {
    return new URL(
      buildFaviconHref(DEFAULT_FAVICON_HREF),
      window.location.origin,
    ).href;
  }
}

function inferFaviconType(href: string) {
  const pathname = new URL(href).pathname.toLowerCase();
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (pathname.endsWith(".ico")) return "image/x-icon";
  return "";
}

function logBrandingChange(message: string, value: string) {
  if (process.env.NODE_ENV === "development") {
    console.debug(`[tenant-branding] ${message}`, value);
  }
}
