export function buildTenantLoginUrl(slug: string) {
  const normalizedSlug = slug.trim().toLowerCase();

  const rootDomain =
    process.env.NEXT_PUBLIC_WEB_ROOT_DOMAIN?.trim();

  const webUrl =
    process.env.NEXT_PUBLIC_WEB_URL?.trim() ||
    "http://localhost:3001";

  if (!rootDomain || rootDomain.startsWith("localhost")) {
    const url = new URL("/login", webUrl);

    url.searchParams.set("tenant", normalizedSlug);

    return url.toString();
  }

  return `https://${normalizedSlug}.${rootDomain.replace(
    /^https?:\/\//,
    "",
  )}/login`;
}