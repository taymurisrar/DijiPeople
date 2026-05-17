import {
  getAppBaseUrl,
  getTenantRootDomain,
  normalizeTenantSlug,
  supportsTenantSubdomains,
} from "@/lib/tenant-resolution";

type QueryValue = string | number | boolean | null | undefined;

export function buildTenantLoginUrl(
  slug: string,
  query?: Record<string, QueryValue>,
) {
  return buildTenantPortalUrl(slug, "/login", query);
}

export function buildTenantActivationUrl(slug: string, token?: string | null) {
  return buildTenantPortalUrl(slug, "/activate", {
    token,
  });
}

export function buildTenantPortalUrl(
  slug: string,
  path = "/login",
  query?: Record<string, QueryValue>,
) {
  const normalizedSlug = normalizeTenantSlug(slug);
  const appUrl = getAppBaseUrl();
  const parsedAppUrl = new URL(appUrl);
  const hostname = parsedAppUrl.hostname;
  const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
  const tenantRootDomain = getTenantRootDomain();

  const url =
    !isLocalHost && supportsTenantSubdomains() && tenantRootDomain
      ? new URL(`${parsedAppUrl.protocol}//${normalizedSlug}.${tenantRootDomain}${normalizePath(path)}`)
      : new URL(normalizePath(path), appUrl);

  if (isLocalHost && normalizedSlug) {
    url.searchParams.set("tenant", normalizedSlug);
  }

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== null && value !== undefined && String(value).length > 0) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function normalizePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}
