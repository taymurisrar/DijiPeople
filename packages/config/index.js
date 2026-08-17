const DEFAULT_LOCAL_HOST = "localhost";

const DEFAULT_LOCAL_PORTS = Object.freeze({
  landing: 3000,
  web: 3001,
  admin: 3002,
  api: 4000,
});

const PRODUCTION_APP_URLS = Object.freeze({
  landing: "",
  web: "",
  admin: "",
  api: "",
});

const APP_PORT_ENV_KEYS = Object.freeze({
  landing: "LANDING_PORT",
  web: "WEB_PORT",
  admin: "ADMIN_PORT",
  api: "API_PORT",
});

const APP_URL_ENV_KEYS = Object.freeze({
  landing: [
    "NEXT_PUBLIC_LANDING_APP_URL",
    "NEXT_PUBLIC_LANDING_URL",
    "LANDING_APP_URL",
    "LANDING_URL",
  ],
  web: [
    "NEXT_PUBLIC_WEB_APP_URL",
    "NEXT_PUBLIC_WEB_URL",
    "WEB_APP_URL",
    "WEB_URL",
  ],
  admin: [
    "NEXT_PUBLIC_ADMIN_APP_URL",
    "NEXT_PUBLIC_ADMIN_URL",
    "ADMIN_APP_URL",
    "ADMIN_URL",
  ],
});

// Agreement categories are a stable reporting dimension. Contract type remains
// the legal/document classification used by the agreement workflow.
const AGREEMENT_CATEGORY_OPTIONS = Object.freeze([
  Object.freeze({ value: "PARTNER", label: "Partner" }),
  Object.freeze({ value: "LEAD_PROSPECT", label: "Lead / Prospect" }),
  Object.freeze({ value: "CUSTOMER", label: "Customer" }),
  Object.freeze({ value: "TENANT_PROVISIONING", label: "Tenant Provisioning" }),
  Object.freeze({ value: "SUPPORT_SERVICE", label: "Support / Service" }),
  Object.freeze({ value: "OTHER", label: "Other" }),
]);
const AGREEMENT_CATEGORY_VALUES = Object.freeze(
  AGREEMENT_CATEGORY_OPTIONS.map((option) => option.value),
);

function parsePort(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function firstDefined(env, keys) {
  for (const key of keys) {
    const value = env[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function getAppStage(env = process.env) {
  const raw =
    env.APP_ENV ||
    env.NEXT_PUBLIC_APP_ENV ||
    env.DIJIPEOPLE_ENV ||
    env.NODE_ENV ||
    "development";

  return String(raw).trim().toLowerCase();
}

function isProductionLike(env = process.env) {
  const explicitStage = String(
    env.APP_ENV || env.NEXT_PUBLIC_APP_ENV || env.DIJIPEOPLE_ENV || "",
  )
    .trim()
    .toLowerCase();
  return (
    explicitStage === "production" ||
    env.VERCEL === "1" ||
    env.RENDER === "true"
  );
}

function getAppPort(app, env = process.env) {
  const fallback = DEFAULT_LOCAL_PORTS[app];
  const scopedPort = env[APP_PORT_ENV_KEYS[app]];
  return parsePort(scopedPort, fallback);
}

function getAppOrigin(app, env = process.env) {
  if (app === "api") {
    const configured = firstDefined(env, [
      "API_ORIGIN",
      "NEXT_PUBLIC_API_ORIGIN",
    ]);
    if (configured) return configured;
    if (isProductionLike(env))
      throw new Error("API_ORIGIN must be configured in production.");
    return `http://${DEFAULT_LOCAL_HOST}:${getAppPort("api", env)}`;
  }

  const configured = firstDefined(env, APP_URL_ENV_KEYS[app]);
  if (configured) return configured;
  if (isProductionLike(env))
    throw new Error(
      `${APP_URL_ENV_KEYS[app].join(" or ")} must be configured in production.`,
    );
  return `http://${DEFAULT_LOCAL_HOST}:${getAppPort(app, env)}`;
}

// ---------------------------------------------------------------------------
// Canonical cross-app URLs
//
// Every surface in this product links to at least one *other* surface: the
// landing header links to the tenant workspace, the API mails activation links
// into it, admin links out to a tenant's workspace. Each of those call sites
// used to resolve its own env var with its own `|| "http://localhost:3001"`
// fallback, which meant a missing production variable did not fail — it
// silently shipped a loopback link to customers. That is exactly how the
// public "Login" button ended up pointing at localhost:3001 in production.
//
// The rule this section enforces: a loopback URL is a *development* answer. In
// production it is never a fallback, it is a configuration error, and it is
// raised at build/boot time rather than discovered by a customer clicking a
// dead link.
// ---------------------------------------------------------------------------

const LOOPBACK_HOSTNAMES = Object.freeze([
  "localhost",
  "127.0.0.1",
  "0.0.0.0",
  "::1",
  "[::1]",
]);

// Which absolute app URLs a given deployable must have configured before it can
// be trusted to render a link to another surface. Keyed by the app being
// validated; the values are the app origins that app is known to emit links to.
const REQUIRED_APP_URLS = Object.freeze({
  // The landing header/footer link to the tenant workspace ("Login").
  landing: Object.freeze(["landing", "web"]),
  web: Object.freeze(["web"]),
  // Admin deep-links operators into a tenant's workspace.
  admin: Object.freeze(["admin", "web"]),
  // The API mails activation, invitation, reset and public-site links.
  api: Object.freeze(["landing", "web", "admin"]),
});

function parseHttpUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(String(value));
  } catch {
    throw new Error(
      `${label} must be a valid absolute URL (received "${value}").`,
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} must use http or https (received "${value}").`);
  }

  return parsed;
}

function isLoopbackHostname(hostname) {
  return LOOPBACK_HOSTNAMES.includes(String(hostname || "").toLowerCase());
}

function isLoopbackUrl(value) {
  try {
    return isLoopbackHostname(new URL(String(value)).hostname);
  } catch {
    return false;
  }
}

/**
 * Resolve the canonical app URLs from one env object.
 *
 * This is the only function application code should use to answer "where does
 * the <x> app live". It never invents a loopback answer in production: the
 * underlying getAppOrigin throws, and validateDeploymentEnv has already failed
 * the build/boot by the time anything calls this.
 *
 * **Resolution is lazy, and that is load-bearing.** Each property resolves when
 * it is read, so a caller that never reads `.admin` never requires the admin URL
 * to be configured. An eager version failed a *correctly* configured landing
 * build: validateDeploymentEnv does not require the admin URL for landing — the
 * landing site emits no admin links — but eager resolution demanded it anyway,
 * and threw from a different place than the validator, which is precisely the
 * confusing failure this whole change exists to remove. What each deployment
 * must configure is declared once, in REQUIRED_APP_URLS, and nowhere else.
 */
function resolveAppUrls(env = process.env) {
  const lazy = {};

  for (const app of ["landing", "web", "admin"]) {
    Object.defineProperty(lazy, app, {
      enumerable: true,
      get: () => getAppOrigin(app, env),
    });
  }

  // The API origin is derived from the resolved base URL rather than read from
  // API_ORIGIN directly. A browser-facing deployment configures
  // NEXT_PUBLIC_API_BASE_URL and has no reason to also set API_ORIGIN, so
  // requiring the latter here would fail a correctly-configured frontend build.
  // getApiBaseUrl still falls back to getAppOrigin("api"), which throws in
  // production when neither is configured.
  Object.defineProperty(lazy, "apiBaseUrl", {
    enumerable: true,
    get: () => getApiBaseUrl(env),
  });
  Object.defineProperty(lazy, "api", {
    enumerable: true,
    get: () => new URL(getApiBaseUrl(env)).origin,
  });

  return Object.freeze(lazy);
}

/**
 * Build an absolute URL into one of the apps.
 *
 * Prefer this over string concatenation so a trailing slash or a missing
 * leading slash cannot produce `https://web.example.comdashboard`.
 */
function buildAppUrl(app, path = "/", env = process.env) {
  const origin = getAppOrigin(app, env);
  const normalizedPath = String(path || "/");
  return new URL(
    normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`,
    `${origin.replace(/\/+$/, "")}/`,
  ).toString();
}

function getApiBaseUrl(env = process.env) {
  const value =
    firstDefined(env, [
      "NEXT_PUBLIC_API_BASE_URL",
      "NEXT_PUBLIC_API_URL",
      "API_BASE_URL",
      "API_URL",
    ]) ?? `${getAppOrigin("api", env)}/api`;

  return normalizeApiBaseUrl(value);
}

function getAllowedCorsOrigins(env = process.env) {
  const explicitOrigins = env.CORS_ALLOWED_ORIGINS;

  if (explicitOrigins && explicitOrigins.trim().length > 0) {
    return explicitOrigins
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  return [
    getAppOrigin("landing", env),
    getAppOrigin("web", env),
    getAppOrigin("admin", env),
  ];
}

function normalizeApiBaseUrl(value) {
  const trimmed = String(value || "")
    .trim()
    .replace(/\/+$/, "");
  if (!trimmed) return trimmed;
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

function requireEnv(env, key) {
  const value = env[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
}

function validateDeploymentEnv(env = process.env, options = {}) {
  const app = options.app || "api";
  const productionLike = isProductionLike(env);
  const errors = [];

  function required(key) {
    try {
      requireEnv(env, key);
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (app === "api") {
    required("DATABASE_URL");
    if (productionLike) {
      required("JWT_ACCESS_SECRET");
      required("JWT_REFRESH_SECRET");
      required("API_ORIGIN");
      required("CORS_ALLOWED_ORIGINS");
    }
  } else if (productionLike) {
    required("NEXT_PUBLIC_API_BASE_URL");
  }

  // Canonical cross-app URLs. Checked only in production-like environments so a
  // local `npm run build` and CI (which set neither VERCEL, RENDER nor APP_ENV)
  // keep working against the loopback defaults.
  if (productionLike) {
    for (const target of REQUIRED_APP_URLS[app] ?? []) {
      const keys =
        target === "api"
          ? ["API_ORIGIN", "NEXT_PUBLIC_API_ORIGIN"]
          : APP_URL_ENV_KEYS[target];
      const configured = firstDefined(env, keys);

      if (!configured) {
        errors.push(
          `${keys.join(" or ")} must be configured in production — the ${app} ` +
            `deployment emits links to the ${target} app and would otherwise ` +
            `fall back to http://localhost:${DEFAULT_LOCAL_PORTS[target]}.`,
        );
        continue;
      }

      try {
        const parsed = parseHttpUrl(configured, keys[0]);
        if (isLoopbackHostname(parsed.hostname)) {
          errors.push(
            `${keys[0]} must not point at a loopback host in production ` +
              `(received "${configured}").`,
          );
        }
      } catch (error) {
        errors.push(error.message);
      }
    }

    // The API base URL is resolved by every frontend and is the one value a
    // loopback answer breaks silently in the browser rather than on the server.
    const apiBaseUrl = firstDefined(env, [
      "NEXT_PUBLIC_API_BASE_URL",
      "NEXT_PUBLIC_API_URL",
      "API_BASE_URL",
      "API_URL",
    ]);
    if (apiBaseUrl && isLoopbackUrl(apiBaseUrl)) {
      errors.push(
        `The configured API base URL must not point at a loopback host in ` +
          `production (received "${apiBaseUrl}").`,
      );
    }

    const accessSecret = env.JWT_ACCESS_SECRET;
    const refreshSecret = env.JWT_REFRESH_SECRET;
    if (accessSecret && accessSecret.length < 32) {
      errors.push(
        "JWT_ACCESS_SECRET must be at least 32 characters in production.",
      );
    }
    if (refreshSecret && refreshSecret.length < 32) {
      errors.push(
        "JWT_REFRESH_SECRET must be at least 32 characters in production.",
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `Deployment environment validation failed:\n- ${errors.join("\n- ")}`,
    );
  }

  // `allowedCorsOrigins` is resolved lazily because computing it needs all three
  // frontend origins — CORS is an API concern, and a Next frontend calling this
  // from next.config.ts never reads it. Computing it eagerly made a landing
  // build demand the admin URL that validation above had deliberately not
  // required, failing a correctly-configured deployment from a line nowhere
  // near the validator.
  const result = { app, productionLike };

  Object.defineProperty(result, "apiBaseUrl", {
    enumerable: true,
    get: () => getApiBaseUrl(env),
  });
  Object.defineProperty(result, "allowedCorsOrigins", {
    enumerable: true,
    get: () => getAllowedCorsOrigins(env),
  });

  return result;
}

function getLocalArchitecture(env = process.env) {
  return {
    landing: getAppOrigin("landing", env),
    web: getAppOrigin("web", env),
    admin: getAppOrigin("admin", env),
    api: getApiBaseUrl(env),
  };
}

const {
  SYSTEM_MODULE_CAPABILITIES,
  SYSTEM_WIDGET_REGISTRY,
  listSupportedSystemWidgets,
  resolveSystemWidgetAvailability,
  resolveSystemWidgetDefinition,
} = require("./system-widget-registry");
const {
  PLATFORM_RUNTIME_SCHEMA_MANIFEST,
  getRuntimeSchema,
  resolveRuntimeField,
  validateRuntimeDefinition,
} = require("./platform-runtime-schema");
const {
  PLATFORM_MODULE_VIEW_RULES,
  listRuntimeViewKeys,
  resolveRuntimeViewRule,
  runtimeViewLabel,
} = require("./platform-runtime-views");
const {
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
} = require("./platform-domains");

const {
  securityHeadersForApp,
  baselineSecurityHeaders,
  contentSecurityPolicy,
} = require("./security-headers");

const {
  FORWARDED_FOR_HEADER,
  readForwardedForClientIp,
  buildForwardedClientHeaders,
} = require("./client-ip");

const {
  SUPPORTED_EMAIL_PROVIDER_TYPES,
  UNIMPLEMENTED_EMAIL_PROVIDER_TYPES,
  ALL_EMAIL_PROVIDER_TYPES,
  isSupportedEmailProviderType,
} = require("./email-providers");

module.exports = {
  SUPPORTED_EMAIL_PROVIDER_TYPES,
  UNIMPLEMENTED_EMAIL_PROVIDER_TYPES,
  ALL_EMAIL_PROVIDER_TYPES,
  isSupportedEmailProviderType,
  DEFAULT_LOCAL_PORTS,
  PRODUCTION_APP_URLS,
  LOOPBACK_HOSTNAMES,
  REQUIRED_APP_URLS,
  FORWARDED_FOR_HEADER,
  readForwardedForClientIp,
  buildForwardedClientHeaders,
  securityHeadersForApp,
  baselineSecurityHeaders,
  contentSecurityPolicy,
  getAppPort,
  getAppOrigin,
  resolveAppUrls,
  buildAppUrl,
  isLoopbackUrl,
  getApiBaseUrl,
  getAllowedCorsOrigins,
  getLocalArchitecture,
  getAppStage,
  isProductionLike,
  requireEnv,
  validateDeploymentEnv,
  AGREEMENT_CATEGORY_OPTIONS,
  AGREEMENT_CATEGORY_VALUES,
  SYSTEM_MODULE_CAPABILITIES,
  SYSTEM_WIDGET_REGISTRY,
  listSupportedSystemWidgets,
  resolveSystemWidgetAvailability,
  resolveSystemWidgetDefinition,
  PLATFORM_RUNTIME_SCHEMA_MANIFEST,
  getRuntimeSchema,
  resolveRuntimeField,
  validateRuntimeDefinition,
  PLATFORM_MODULE_VIEW_RULES,
  listRuntimeViewKeys,
  resolveRuntimeViewRule,
  runtimeViewLabel,
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
