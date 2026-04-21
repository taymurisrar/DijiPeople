import {
  getApiBaseUrl as getSharedApiBaseUrl,
  getAppOrigin,
} from "@repo/config";

export const ACCESS_TOKEN_COOKIE = "dp_access_token";
export const DEFAULT_ADMIN_ROUTE = "/tenants";
export const ACCESS_DENIED_ROUTE = "/access-denied";

export function getApiBaseUrl() {
  return getSharedApiBaseUrl(process.env);
}

export function getWebLoginUrl(nextPath = DEFAULT_ADMIN_ROUTE) {
  const webAppUrl = getAppOrigin("web", process.env);
  const normalizedNextPath = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  const adminAppUrl = getAppOrigin("admin", process.env);

  return `${webAppUrl}/login?next=${encodeURIComponent(
    `${adminAppUrl}${normalizedNextPath}`,
  )}`;
}
