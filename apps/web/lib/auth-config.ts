export const ACCESS_TOKEN_COOKIE = "dp_access_token";
export const REFRESH_TOKEN_COOKIE = "dp_refresh_token";
export const DASHBOARD_ROUTE = "/dashboard";
export const LOGIN_ROUTE = "/login";
export const DEFAULT_AUTHENTICATED_ROUTE = "/dashboard";

export const PROTECTED_ROUTE_PREFIXES = ["/dashboard"] as const;
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