export function buildTenantLoginUrl(slug: string) {
  const normalizedSlug = slug.trim().toLowerCase();
  const rootDomain = process.env.NEXT_PUBLIC_WEB_ROOT_DOMAIN?.trim();

  if (!rootDomain || rootDomain.startsWith("localhost")) {
    const baseUrl = rootDomain
      ? `http://${rootDomain}`
      : "http://localhost:3000";
    const url = new URL("/login", baseUrl);
    url.searchParams.set("tenant", normalizedSlug);
    return url.toString();
  }

  return `https://${normalizedSlug}.${rootDomain.replace(/^https?:\/\//, "")}/login`;
}
