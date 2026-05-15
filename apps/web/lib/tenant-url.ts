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
  const normalizedSlug = slug.trim().toLowerCase();
  const appEnv = process.env.NEXT_PUBLIC_APP_ENV;
  const rootDomain = stripProtocol(process.env.NEXT_PUBLIC_WEB_ROOT_DOMAIN ?? "");
  const protocol =
    process.env.NEXT_PUBLIC_WEB_PROTOCOL?.replace(/:$/, "") || "https";
  const isProduction = appEnv === "production" && rootDomain.length > 0;
  const url = isProduction
    ? new URL(`${protocol}://${normalizedSlug}.${rootDomain}${normalizePath(path)}`)
    : new URL(
        normalizePath(path),
        process.env.NEXT_PUBLIC_WEB_APP_ORIGIN || "http://localhost:3001",
      );

  if (!isProduction) {
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

function stripProtocol(value: string) {
  return value.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
}
