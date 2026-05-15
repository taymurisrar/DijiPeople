export const APP_ROUTES = {
  home: "/",
  login: "/login",
  activate: "/activate",
  me: "/me",
  settings: "/settings",
  tenantSettings: "/settings/tenant",
  brandingSettings: "/settings/branding",
  employees: "/employees",
  leaves: "/leaves",
  attendance: "/attendance",
  payroll: "/payroll",
  projects: "/projects",
} as const;

const LEGACY_EXACT_ROUTE_MAP = new Map<string, string>([
  ["/dashboard", APP_ROUTES.home],
  ["/dashboard/my-preferences", APP_ROUTES.me],
  ["/dashboard/profile", APP_ROUTES.me],
  ["/dashboard/leave", APP_ROUTES.leaves],
  ["/dashboard/settings", APP_ROUTES.settings],
  ["/dashboard/settings/tenant", APP_ROUTES.tenantSettings],
  ["/dashboard/settings/branding", APP_ROUTES.brandingSettings],
]);

export function toCanonicalPath(pathname: string) {
  const normalized = normalizeAppPath(pathname);
  const exact = LEGACY_EXACT_ROUTE_MAP.get(normalized);

  if (exact) {
    return exact;
  }

  if (normalized.startsWith("/dashboard/leave/")) {
    return normalized.replace(/^\/dashboard\/leave/, APP_ROUTES.leaves);
  }

  if (normalized.startsWith("/dashboard/my-preferences/")) {
    return normalized.replace(/^\/dashboard\/my-preferences/, APP_ROUTES.me);
  }

  if (normalized.startsWith("/dashboard/profile/")) {
    return normalized.replace(/^\/dashboard\/profile/, APP_ROUTES.me);
  }

  if (normalized.startsWith("/dashboard/")) {
    return normalized.replace(/^\/dashboard/, "") || APP_ROUTES.home;
  }

  return normalized;
}

export function isLegacyDashboardPath(pathname: string) {
  const normalized = normalizeAppPath(pathname);
  return normalized === "/dashboard" || normalized.startsWith("/dashboard/");
}

export function sanitizeLocalNextPath(value: string | null | undefined) {
  if (!value) return APP_ROUTES.home;

  try {
    const decoded = decodeURIComponent(value);
    if (!decoded.startsWith("/") || decoded.startsWith("//")) {
      return APP_ROUTES.home;
    }

    const url = new URL(decoded, "http://local.invalid");
    return `${toCanonicalPath(url.pathname)}${url.search}${url.hash}`;
  } catch {
    return APP_ROUTES.home;
  }
}

function normalizeAppPath(pathname: string) {
  const path = (pathname || "/").split("?")[0].split("#")[0] || "/";

  if (path.length > 1 && path.endsWith("/")) {
    return path.slice(0, -1);
  }

  return path;
}
