/**
 * Platform hostnames, and the rules for turning one into a workspace.
 *
 * There is exactly one copy of these rules and it lives here, because the API,
 * the tenant web app and Platform Admin all have to agree on them: if the API
 * thinks `maseer.dijipeople.com` is a tenant and the web app thinks it is a
 * platform host, the workspace is unreachable in a way that is very hard to see.
 *
 * FOUR CONCEPTS, KEPT APART:
 *
 *   Platform environment  where DijiPeople itself runs (development / staging /
 *                         production). Selects the base domain.
 *   Customer              the commercial account.
 *   Tenant / workspace    one workspace belonging to a customer. A customer can
 *                         have several — production, UAT, sandbox.
 *   Tenant domain         a hostname pointing at one workspace. A workspace can
 *                         have several; exactly one is primary.
 *
 * `maseer-uat.dijipeople.com` is a customer's UAT workspace on DijiPeople's
 * production platform. `maseer.staging.dijipeople.com` is that customer's
 * workspace on DijiPeople's staging platform. They are different things and this
 * module never conflates them: the platform environment picks the base domain,
 * and the workspace slug is the label in front of it.
 */

const PLATFORM_ENVIRONMENTS = Object.freeze({
  DEVELOPMENT: "development",
  STAGING: "staging",
  PRODUCTION: "production",
});

/**
 * Host labels that can never be a workspace slug, because they are — or may
 * become — a platform hostname or a well-known service name. Centralised so the
 * slug validator and the host parser cannot disagree about what is reserved.
 */
const RESERVED_HOST_LABELS = Object.freeze([
  "account",
  "accounts",
  "admin",
  "api",
  "app",
  "assets",
  "auth",
  "billing",
  "callback",
  "cdn",
  "dashboard",
  "dev",
  "development",
  "dijipeople",
  "docs",
  "downloads",
  "email",
  "health",
  "help",
  "internal",
  "login",
  "logout",
  "mail",
  "oauth",
  "platform",
  "portal",
  "private",
  "prod",
  "production",
  "public",
  "register",
  "root",
  "security",
  "settings",
  "signup",
  "smtp",
  "sso",
  "staging",
  "static",
  "status",
  "superadmin",
  "support",
  "system",
  "tenant",
  "tenants",
  "test",
  "uat",
  "www",
]);

const DEFAULT_BASE_DOMAIN = "dijipeople.com";

function firstConfigured(env, keys) {
  for (const key of keys) {
    const value = env[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

/**
 * Normalise a Host header into a comparable hostname.
 *
 * Lowercased, port stripped, trailing dot stripped, scheme and path stripped.
 * Anything that is not a plausible hostname returns "" rather than a partial
 * value, because a partial value is what makes suffix matching unsafe.
 */
function normalizeHostname(value) {
  if (typeof value !== "string") return "";

  let host = value.trim().toLowerCase();
  if (!host) return "";

  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  host = host.split("/")[0];
  /* IPv6 literals keep their brackets; everything else loses its port. */
  if (host.startsWith("[")) {
    const closing = host.indexOf("]");
    if (closing === -1) return "";
    host = host.slice(0, closing + 1);
  } else {
    host = host.split(":")[0];
  }
  /* A single trailing dot is the legal fully-qualified form of a hostname. */
  host = host.replace(/\.$/, "");

  if (!host || host.length > 253) return "";
  if (host === "localhost" || /^\[[0-9a-f:]+\]$/.test(host) || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    return host;
  }
  /*
   * Label-by-label validation. Rejecting here is what stops
   * `maseer.dijipeople.com.attacker.com` from being treated as a hostname we
   * then try to suffix-match — though the exact-suffix rule below would refuse
   * it anyway.
   */
  const labels = host.split(".");
  if (labels.length < 2) return host === "localhost" ? host : "";
  for (const label of labels) {
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) return "";
  }
  return host;
}

/** Every platform hostname for the current environment, plus the tenant base. */
function getPlatformDomainConfig(env = process.env) {
  const stage = resolvePlatformEnvironment(env);

  const baseDomain =
    normalizeHostname(
      firstConfigured(env, [
        "PUBLIC_BASE_DOMAIN",
        "NEXT_PUBLIC_PUBLIC_BASE_DOMAIN",
      ]),
    ) || (stage === PLATFORM_ENVIRONMENTS.PRODUCTION ? DEFAULT_BASE_DOMAIN : "");

  /*
   * The tenant base domain is configured separately from the public one so a
   * deployment can serve workspaces from a different apex than the marketing
   * site without code changes.
   */
  const tenantBaseDomain =
    normalizeHostname(
      firstConfigured(env, [
        "TENANT_BASE_DOMAIN",
        "NEXT_PUBLIC_TENANT_BASE_DOMAIN",
        "NEXT_PUBLIC_TENANT_ROOT_DOMAIN",
        "WEB_APP_PROD_ROOT_DOMAIN",
        "NEXT_PUBLIC_WEB_ROOT_DOMAIN",
      ]),
    ) || baseDomain;

  const host = (keys, fallbackLabel) => {
    const configured = normalizeHostname(firstConfigured(env, keys));
    if (configured) return configured;
    return baseDomain ? `${fallbackLabel}.${baseDomain}` : "";
  };

  return {
    platformEnvironment: stage,
    baseDomain,
    tenantBaseDomain,
    appHost: host(["APP_HOST", "NEXT_PUBLIC_APP_HOST"], "app"),
    adminHost: host(["ADMIN_HOST", "NEXT_PUBLIC_ADMIN_HOST"], "admin"),
    apiHost: host(["API_HOST", "NEXT_PUBLIC_API_HOST"], "api"),
    landingHost:
      normalizeHostname(
        firstConfigured(env, ["LANDING_HOST", "NEXT_PUBLIC_LANDING_HOST"]),
      ) || baseDomain,
    /* https everywhere except local development, where TLS is not terminated. */
    protocol: stage === PLATFORM_ENVIRONMENTS.DEVELOPMENT ? "http" : "https",
  };
}

function resolvePlatformEnvironment(env = process.env) {
  const raw = String(
    env.PLATFORM_ENVIRONMENT ||
      env.NEXT_PUBLIC_PLATFORM_ENVIRONMENT ||
      env.APP_ENV ||
      env.NEXT_PUBLIC_APP_ENV ||
      env.DIJIPEOPLE_ENV ||
      env.NODE_ENV ||
      "development",
  )
    .trim()
    .toLowerCase();

  if (raw === "production" || raw === "prod") {
    return PLATFORM_ENVIRONMENTS.PRODUCTION;
  }
  if (raw === "staging" || raw === "stage" || raw === "uat") {
    return PLATFORM_ENVIRONMENTS.STAGING;
  }
  return PLATFORM_ENVIRONMENTS.DEVELOPMENT;
}

/** The platform's own hostnames — never a workspace, whatever the label says. */
function getPlatformHostnames(env = process.env) {
  const config = getPlatformDomainConfig(env);
  return new Set(
    [
      config.appHost,
      config.adminHost,
      config.apiHost,
      config.landingHost,
      config.baseDomain,
      config.baseDomain ? `www.${config.baseDomain}` : "",
    ].filter(Boolean),
  );
}

function isPlatformHostname(hostname, env = process.env) {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return false;
  return getPlatformHostnames(env).has(normalized);
}

function isWorkspaceDiscoveryHostname(hostname, env = process.env) {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return false;
  return normalized === getPlatformDomainConfig(env).appHost;
}

/**
 * The workspace slug a hostname claims, or null.
 *
 * EXACT SUFFIX MATCHING, deliberately. `maseer.dijipeople.com.attacker.com`
 * *contains* the base domain but does not end at a label boundary that leaves a
 * single label in front of it, so it resolves to null. A `String.includes` or a
 * loose `endsWith` on the bare domain is the classic way this check is got
 * wrong; the label arithmetic below is what makes it safe.
 *
 * Returns null — not a guess — for platform hosts, multi-label subdomains and
 * reserved labels. A null result means "this host is not a workspace", and the
 * caller must not fall back to a default tenant outside development.
 */
function parseWorkspaceHostname(hostname, env = process.env) {
  const normalized = normalizeHostname(hostname);
  if (!normalized) return null;
  if (isPlatformHostname(normalized, env)) return null;

  const { tenantBaseDomain } = getPlatformDomainConfig(env);
  if (!tenantBaseDomain) return null;

  const suffix = `.${tenantBaseDomain}`;
  if (!normalized.endsWith(suffix)) return null;

  const label = normalized.slice(0, -suffix.length);
  /* One label only. `a.b.dijipeople.com` is not a workspace hostname. */
  if (!label || label.includes(".")) return null;
  if (!isValidWorkspaceSlugFormat(label)) return null;
  if (isReservedHostLabel(label)) return null;

  return label;
}

function isReservedHostLabel(label) {
  return RESERVED_HOST_LABELS.includes(String(label).trim().toLowerCase());
}

/**
 * Slug format only — uniqueness and reservation are checked separately, because
 * only the database can answer the first and only the reserved list the second.
 *
 * lowercase, a-z 0-9 and single hyphens, 3–50 characters, no leading, trailing
 * or doubled hyphen.
 */
function isValidWorkspaceSlugFormat(value) {
  const slug = String(value ?? "").trim().toLowerCase();
  if (slug.length < 3 || slug.length > 50) return false;
  if (slug.includes("--")) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/** "Maseer Group" → "maseer-group". Never returns a reserved or invalid slug. */
function suggestWorkspaceSlug(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    /*
     * Decompose and drop combining marks first, so "Ünïcode" suggests "unicode"
     * rather than "n-code" — stripping the accented letters outright mangles the
     * company's own name into something nobody would recognise as their address.
     */
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
}

/** The system hostname a slug would occupy. Empty when no base domain is set. */
function buildWorkspaceHostname(slug, env = process.env) {
  const { tenantBaseDomain } = getPlatformDomainConfig(env);
  const normalized = String(slug ?? "").trim().toLowerCase();
  if (!tenantBaseDomain || !normalized) return "";
  return `${normalized}.${tenantBaseDomain}`;
}

/**
 * The URL a person should open for a workspace.
 *
 * In development there is no wildcard DNS, so the local web origin is used with
 * the slug as a query parameter — the same mechanism local development already
 * relies on. This is the only place that difference is expressed.
 */
function buildWorkspaceUrl(slug, options = {}) {
  const env = options.env ?? process.env;
  const path = options.path ?? "/";
  const config = getPlatformDomainConfig(env);
  const hostname = options.hostname
    ? normalizeHostname(options.hostname)
    : buildWorkspaceHostname(slug, env);

  if (!hostname) {
    const origin = options.developmentOrigin ?? "http://localhost:3001";
    const url = new URL(path.startsWith("/") ? path : `/${path}`, origin);
    if (slug) url.searchParams.set("workspace", String(slug).toLowerCase());
    return url.toString();
  }

  return new URL(
    path.startsWith("/") ? path : `/${path}`,
    `${config.protocol}://${hostname}`,
  ).toString();
}

module.exports = {
  PLATFORM_ENVIRONMENTS,
  RESERVED_HOST_LABELS,
  buildWorkspaceHostname,
  buildWorkspaceUrl,
  getPlatformDomainConfig,
  getPlatformHostnames,
  isPlatformHostname,
  isReservedHostLabel,
  isValidWorkspaceSlugFormat,
  isWorkspaceDiscoveryHostname,
  normalizeHostname,
  parseWorkspaceHostname,
  resolvePlatformEnvironment,
  suggestWorkspaceSlug,
};
