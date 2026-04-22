import { getApiBaseUrl as getSharedApiBaseUrl, getAppOrigin } from "@repo/config";

export const ACCESS_TOKEN_COOKIE = "dp_access_token";
export const REFRESH_TOKEN_COOKIE = "dp_refresh_token";
export const LOGIN_ROUTE = "/login";
export const DEFAULT_ADMIN_ROUTE = "/tenants";
export const ACCESS_DENIED_ROUTE = "/access-denied";

function normalizePath(pathname: string): string {
  if (!pathname) return "/";

  const path = pathname.split("?")[0].split("#")[0];

  if (path.length > 1 && path.endsWith("/")) {
    return path.slice(0, -1);
  }

  return path;
}

export function isProtectedAdminRoute(pathname: string): boolean {
  const normalized = normalizePath(pathname);

  return (
    normalized === "/tenants" ||
    normalized.startsWith("/tenants/") ||
    normalized === "/customers" ||
    normalized.startsWith("/customers/") ||
    normalized === "/settings" ||
    normalized.startsWith("/settings/")
  );
}

export function isAdminAuthRoute(pathname: string): boolean {
  return normalizePath(pathname) === LOGIN_ROUTE;
}

export function getApiBaseUrl(): string {
  return getSharedApiBaseUrl(process.env);
}

export function getAdminLoginUrl(nextPath = DEFAULT_ADMIN_ROUTE): string {
  const loginUrl = new URL(LOGIN_ROUTE, getAppOrigin("admin", process.env));
  loginUrl.searchParams.set("next", nextPath);
  return `${loginUrl.pathname}${loginUrl.search}`;
}
