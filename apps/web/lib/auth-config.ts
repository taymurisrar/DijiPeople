export const AUTH_APP_CLIENT_ID = "web";
const AUTH_COOKIE_PREFIX = process.env.AUTH_WEB_COOKIE_PREFIX ?? "dp_web";
export const ACCESS_TOKEN_COOKIE =
  process.env.AUTH_WEB_COOKIE_ACCESS_NAME ??
  process.env.WEB_ACCESS_TOKEN_COOKIE ??
  process.env.ACCESS_TOKEN_COOKIE ??
  `${AUTH_COOKIE_PREFIX}_access_token`;
export const REFRESH_TOKEN_COOKIE =
  process.env.AUTH_WEB_COOKIE_REFRESH_NAME ??
  process.env.WEB_REFRESH_TOKEN_COOKIE ??
  process.env.REFRESH_TOKEN_COOKIE ??
  `${AUTH_COOKIE_PREFIX}_refresh_token`;
export const SESSION_COOKIE =
  process.env.AUTH_WEB_COOKIE_SESSION_NAME ?? `${AUTH_COOKIE_PREFIX}_session_id`;
export const DASHBOARD_ROUTE = "/";
export const LOGIN_ROUTE = "/login";
export const DEFAULT_AUTHENTICATED_ROUTE = "/";

export const PROTECTED_ROUTE_PREFIXES = [
  "/",
  "/me",
  "/settings",
  "/employees",
  "/attendance",
  "/leaves",
  "/projects",
  "/payroll",
  "/timesheets",
  "/users",
  "/customers",
  "/reports",
  "/recruitment",
  "/onboarding",
  "/claims",
  "/business-trips",
  "/customization",
] as const;
export const PUBLIC_ROUTE_PREFIXES = [
  "/login",
  "/activate",
  "/activate-account",
  "/api",
  "/_next",
] as const;
export const AUTH_ROUTES = ["/login"] as const;

function normalizePath(pathname: string): string {
  if (!pathname) return "/";

  const path = pathname.split("?")[0].split("#")[0];

  if (path.length > 1 && path.endsWith("/")) {
    return path.slice(0, -1);
  }

  return path;
}

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => {
    if (prefix === "/") return pathname === "/";
    return pathname === prefix || pathname.startsWith(prefix + "/");
  });
}

export function isProtectedRoute(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  if (
    matchesPrefix(normalized, PUBLIC_ROUTE_PREFIXES) ||
    PUBLIC_FILE_PATTERN.test(normalized)
  ) {
    return false;
  }
  return matchesPrefix(normalized, PROTECTED_ROUTE_PREFIXES);
}

export function isAuthRoute(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  return AUTH_ROUTES.includes(normalized as (typeof AUTH_ROUTES)[number]);
}

export function shouldRedirectAuthenticatedUser(pathname: string): boolean {
  return isAuthRoute(pathname);
}

export function shouldRedirectUnauthenticatedUser(pathname: string): boolean {
  return isProtectedRoute(pathname);
}

const PUBLIC_FILE_PATTERN = /\.(?:ico|png|jpg|jpeg|gif|svg|webp|css|js|map|txt|xml|json)$/i;
