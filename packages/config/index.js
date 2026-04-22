const DEFAULT_LOCAL_HOST = "localhost";

const DEFAULT_LOCAL_PORTS = Object.freeze({
  landing: 3000,
  web: 3001,
  admin: 3002,
  api: 4000,
});

const PRODUCTION_APP_URLS = Object.freeze({
  landing: "https://dijipeople.com",
  web: "https://app.dijipeople.com",
  admin: "https://admin.dijipeople.com",
  api: "https://api.dijipeople.com",
});

const APP_PORT_ENV_KEYS = Object.freeze({
  landing: "LANDING_PORT",
  web: "WEB_PORT",
  admin: "ADMIN_PORT",
  api: "API_PORT",
});

const APP_URL_ENV_KEYS = Object.freeze({
  landing: ["NEXT_PUBLIC_LANDING_URL", "LANDING_APP_URL", "LANDING_URL"],
  web: ["NEXT_PUBLIC_WEB_URL", "WEB_APP_URL", "WEB_URL"],
  admin: ["NEXT_PUBLIC_ADMIN_URL", "ADMIN_APP_URL", "ADMIN_URL"],
});

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
  const stage = getAppStage(env);
  return (
    stage === "production" ||
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
    return (
      firstDefined(env, ["API_ORIGIN", "NEXT_PUBLIC_API_ORIGIN"]) ??
      (isProductionLike(env)
        ? PRODUCTION_APP_URLS.api
        : `http://${DEFAULT_LOCAL_HOST}:${getAppPort("api", env)}`)
    );
  }

  return (
    firstDefined(env, APP_URL_ENV_KEYS[app]) ??
    (isProductionLike(env)
      ? PRODUCTION_APP_URLS[app]
      : `http://${DEFAULT_LOCAL_HOST}:${getAppPort(app, env)}`)
  );
}

function getApiBaseUrl(env = process.env) {
  return (
    firstDefined(env, [
      "NEXT_PUBLIC_API_BASE_URL",
      "NEXT_PUBLIC_API_URL",
      "API_BASE_URL",
      "API_URL",
    ]) ?? `${getAppOrigin("api", env)}/api`
  );
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

function getLocalArchitecture(env = process.env) {
  return {
    landing: getAppOrigin("landing", env),
    web: getAppOrigin("web", env),
    admin: getAppOrigin("admin", env),
    api: getApiBaseUrl(env),
  };
}

module.exports = {
  DEFAULT_LOCAL_PORTS,
  PRODUCTION_APP_URLS,
  getAppPort,
  getAppOrigin,
  getApiBaseUrl,
  getAllowedCorsOrigins,
  getLocalArchitecture,
  getAppStage,
  isProductionLike,
};