type QueryValue = string | number | boolean | null | undefined;

export function buildTenantLoginUrl(slug: string) {
  return buildTenantPortalUrl(slug, "/login");
}

export function buildTenantActivationUrl(
  slug: string,
  token?: string | null,
) {
  return buildTenantPortalUrl(slug, "/activate", {
    token,
  });
}

export function buildTenantPortalUrl(
  slug: string,
  path = "/login",
  query?: Record<string, QueryValue>,
) {
  const normalizedSlug = slug.trim().toLowerCase();

  const appUrl = resolveTenantAppBaseUrl();

  const parsedUrl = new URL(appUrl);

  const protocol = parsedUrl.protocol.replace(":", "");
  const hostname = parsedUrl.hostname;

  const tenantRootDomain = process.env.NEXT_PUBLIC_TENANT_ROOT_DOMAIN?.trim();
  const isSubdomainMode = Boolean(tenantRootDomain);

  const url = isSubdomainMode
    ? new URL(
        `${protocol}://${normalizedSlug}.${stripWww(tenantRootDomain as string)}${normalizePath(path)}`,
      )
    : new URL(normalizePath(path), appUrl);

  if (!isSubdomainMode && isLocalHost(hostname)) {
    url.searchParams.set("tenant", normalizedSlug);
  }

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== null && value !== undefined && String(value).length > 0) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

export function resolveTenantAppBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_WEB_APP_URL ??
    process.env.NEXT_PUBLIC_APP_BASE_URL ??
    process.env.NEXT_PUBLIC_WEB_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3001"
  );
}

function normalizePath(path: string) {
  return path.startsWith("/") ? path : `/${path}`;
}

function stripWww(value: string) {
  return value.replace(/^www\./, "");
}

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}
