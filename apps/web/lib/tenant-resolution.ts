export type TenantHint = {
  type: "slug" | "domain" | "tenantCode" | "generic";
  value: string | null;
  source: "host" | "query" | "cookie" | "fallback";
};

export const RESERVED_HOST_LABELS = new Set([
  "admin",
  "api",
  "app",
  "auth",
  "login",
  "logout",
  "signup",
  "register",
  "dashboard",
  "settings",
  "www",
  "dijipeople",
  "tenant",
  "tenants",
  "system",
  "platform",
  "portal",
  "support",
  "help",
  "docs",
  "billing",
  "account",
  "accounts",
  "root",
  "superadmin",
  "assets",
  "static",
  "cdn",
  "mail",
  "email",
  "smtp",
  "status",
  "health",
  "public",
  "private",
  "security",
  "sso",
  "oauth",
  "callback",
]);

export function getTenantHintFromRequest(input: {
  host?: string | null;
  queryTenant?: string | null;
  cookieTenant?: string | null;
}): TenantHint {
  const queryTenant = input.queryTenant?.trim() ?? "";
  if (queryTenant) {
    const type = looksLikeTenantCode(queryTenant) ? "tenantCode" : "slug";
    return {
      type,
      value:
        type === "tenantCode"
          ? queryTenant.toUpperCase()
          : normalizeTenantSlug(queryTenant),
      source: "query",
    };
  }

  const hostHint = getTenantHintFromHost(input.host);
  if (hostHint.type !== "generic") {
    return hostHint;
  }

  const cookieTenant = normalizeTenantSlug(input.cookieTenant);
  if (cookieTenant) {
    return {
      type: "slug",
      value: cookieTenant,
      source: "cookie",
    };
  }

  return { type: "generic", value: null, source: "fallback" };
}

export function getTenantHintFromHost(host?: string | null): TenantHint {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost || normalizedHost.startsWith("localhost")) {
    return { type: "generic", value: null, source: "fallback" };
  }

  const rootDomain = normalizeHost(process.env.NEXT_PUBLIC_WEB_ROOT_DOMAIN);
  const commonLoginHost = normalizeHost(
    process.env.NEXT_PUBLIC_COMMON_LOGIN_HOST,
  );

  if (commonLoginHost && normalizedHost === commonLoginHost) {
    return { type: "generic", value: null, source: "fallback" };
  }

  if (rootDomain && normalizedHost.endsWith(`.${rootDomain}`)) {
    const subdomain = normalizedHost.slice(0, -`.${rootDomain}`.length);
    if (
      subdomain &&
      !subdomain.includes(".") &&
      !isReservedSubdomain(subdomain)
    ) {
      return {
        type: "slug",
        value: normalizeTenantSlug(subdomain),
        source: "host",
      };
    }

    return { type: "generic", value: null, source: "fallback" };
  }

  return {
    type: "domain",
    value: normalizedHost,
    source: "host",
  };
}

export function resolveTenantSlugFromRequest(input: {
  host?: string | null;
  queryTenant?: string | null;
}) {
  const hint = getTenantHintFromRequest(input);
  return hint.type === "slug" ? hint.value ?? "" : "";
}

export function isReservedSubdomain(subdomain: string) {
  return RESERVED_HOST_LABELS.has(subdomain.trim().toLowerCase());
}

export function normalizeHost(host?: string | null) {
  return (host ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

export function normalizeTenantSlug(value?: string | null) {
  const normalized = value?.trim().toLowerCase() ?? "";

  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized) ? normalized : "";
}

function looksLikeTenantCode(value: string) {
  return /^TEN-\d{6,}$/i.test(value.trim());
}
