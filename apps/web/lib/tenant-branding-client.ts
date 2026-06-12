import {
  buildBrandingCssVariables,
  type BrandingSettings,
} from "@/lib/branding";

const TENANT_FAVICON_ID = "tenant-favicon";
const BRANDING_ATTRIBUTE = "data-dijipeople-branding";
const DEFAULT_FAVICON_HREF = "/favicon.ico";
let lastAppliedTitle = "";
let lastAppliedFavicon = "";
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
  root.dataset.theme = branding.themeMode.toLowerCase();
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

export function upsertFavicon(faviconUrl?: string | null) {
  const head = document.head;
  if (!head) return;

  const href = normalizeFaviconHref(faviconUrl);
  let link = document.getElementById(
    TENANT_FAVICON_ID,
  ) as HTMLLinkElement | null;
  const created = !link;

  if (!link) {
    link = document.createElement("link");
    link.id = TENANT_FAVICON_ID;
    link.rel = "icon";
    link.setAttribute(BRANDING_ATTRIBUTE, "true");
    head.appendChild(link);
  }

  if (link.href !== href) {
    link.href = href;
  }
  const type = inferFaviconType(href);
  if (type && link.type !== type) {
    link.type = type;
  }

  if (lastAppliedFavicon !== href || created) {
    lastAppliedFavicon = href;
    logBrandingChange(
      `favicon ${created ? "created" : "updated"}`,
      href,
    );
  }
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizeFaviconHref(value?: string | null) {
  const candidate = value?.trim() || DEFAULT_FAVICON_HREF;

  try {
    return new URL(candidate, window.location.origin).href;
  } catch {
    return new URL(DEFAULT_FAVICON_HREF, window.location.origin).href;
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
