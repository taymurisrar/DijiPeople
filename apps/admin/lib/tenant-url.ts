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

  const appEnv =
    process.env.NEXT_PUBLIC_APP_ENV ??
    process.env.NODE_ENV ??
    "development";

  const appUrl =
    process.env.NEXT_PUBLIC_WEB_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3001";

  const parsedUrl = new URL(appUrl);

  const protocol = parsedUrl.protocol.replace(":", "");
  const hostname = parsedUrl.hostname;

  const isProduction =
    appEnv === "production" &&
    !hostname.includes("localhost") &&
    !hostname.includes("127.0.0.1");

  const url = isProduction
    ? new URL(
        `${protocol}://${normalizedSlug}.${stripWww(hostname)}${normalizePath(path)}`,
      )
    : new URL(normalizePath(path), appUrl);

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

function stripWww(value: string) {
  return value.replace(/^www\./, "");
}