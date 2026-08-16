const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildAppUrl,
  getAppOrigin,
  isLoopbackUrl,
  resolveAppUrls,
  validateDeploymentEnv,
  REQUIRED_APP_URLS,
} = require("./index.js");

// A production-like env that is complete apart from whatever a given test
// removes. Kept minimal on purpose: every key here is one the validator needs,
// so an unexplained addition is a signal the contract widened.
function productionEnv(overrides = {}) {
  return {
    APP_ENV: "production",
    DATABASE_URL: "postgresql://user:pass@db.example.com:5432/dijipeople",
    JWT_ACCESS_SECRET: "a".repeat(32),
    JWT_REFRESH_SECRET: "b".repeat(32),
    API_ORIGIN: "https://api.dijipeople.com",
    CORS_ALLOWED_ORIGINS: "https://www.dijipeople.com",
    NEXT_PUBLIC_API_BASE_URL: "https://api.dijipeople.com/api",
    NEXT_PUBLIC_LANDING_APP_URL: "https://www.dijipeople.com",
    NEXT_PUBLIC_WEB_APP_URL: "https://app.dijipeople.com",
    NEXT_PUBLIC_ADMIN_APP_URL: "https://admin.dijipeople.com",
    LANDING_APP_URL: "https://www.dijipeople.com",
    WEB_APP_URL: "https://app.dijipeople.com",
    ADMIN_APP_URL: "https://admin.dijipeople.com",
    ...overrides,
  };
}

test("development resolves loopback origins without configuration", () => {
  const env = {};
  assert.equal(getAppOrigin("landing", env), "http://localhost:3000");
  assert.equal(getAppOrigin("web", env), "http://localhost:3001");
  assert.equal(getAppOrigin("admin", env), "http://localhost:3002");
  assert.equal(getAppOrigin("api", env), "http://localhost:4000");
});

test("a local build is not production-like, so it still validates", () => {
  // CI and a developer's `npm run build` set NODE_ENV=production but neither
  // VERCEL, RENDER nor APP_ENV. Tightening the URL rules must not break them.
  assert.doesNotThrow(() =>
    validateDeploymentEnv(
      { NODE_ENV: "production", DATABASE_URL: "postgresql://ci:ci@localhost:5432/ci" },
      { app: "landing" },
    ),
  );
});

// REGRESSION — resolveAppUrls originally called getAppOrigin("api"), which
// requires API_ORIGIN. A Vercel frontend configures NEXT_PUBLIC_API_BASE_URL and
// has no reason to set API_ORIGIN, so a correctly-configured landing build
// failed with "API_ORIGIN must be configured in production". Caught by running
// the real build, not by the unit tests that existed at the time.
test("a frontend configured with only NEXT_PUBLIC_API_BASE_URL resolves", () => {
  const env = productionEnv();
  delete env.API_ORIGIN;

  const urls = resolveAppUrls(env);
  assert.equal(urls.api, "https://api.dijipeople.com");
  assert.equal(urls.apiBaseUrl, "https://api.dijipeople.com/api");

  assert.doesNotThrow(() => validateDeploymentEnv(env, { app: "landing" }));
});

// REGRESSION — resolveAppUrls resolved eagerly, so reading *any* property
// required *every* app URL. validateDeploymentEnv does not require the admin URL
// for landing (the landing site emits no admin links), so a correctly
// configured landing build passed validation and then threw at module
// evaluation — from a different place than the validator. Resolution is lazy so
// REQUIRED_APP_URLS stays the single declaration of what must be configured.
test("resolveAppUrls only requires the URLs actually read", () => {
  const env = productionEnv();
  delete env.NEXT_PUBLIC_ADMIN_APP_URL;
  delete env.ADMIN_APP_URL;

  const urls = resolveAppUrls(env);

  // Landing reads the workspace URL. That must not drag in the admin URL.
  assert.equal(urls.web, "https://app.dijipeople.com");
  assert.equal(urls.landing, "https://www.dijipeople.com");
  assert.doesNotThrow(() => validateDeploymentEnv(env, { app: "landing" }));

  // Reading the unconfigured one still fails, loudly.
  assert.throws(() => urls.admin, /must be configured in production/);
});

test("resolveAppUrls returns every canonical origin", () => {
  const urls = resolveAppUrls(productionEnv());
  assert.deepEqual(
    { ...urls },
    {
      landing: "https://www.dijipeople.com",
      web: "https://app.dijipeople.com",
      admin: "https://admin.dijipeople.com",
      api: "https://api.dijipeople.com",
      apiBaseUrl: "https://api.dijipeople.com/api",
    },
  );
});

// ---------------------------------------------------------------------------
// REGRESSION — the public "Login" button pointed at http://localhost:3001.
//
// The landing header resolved NEXT_PUBLIC_WEB_APP_URL at module scope and fell
// back to a loopback literal. Because nothing required that variable, the
// production build succeeded and Next inlined the loopback URL into the shipped
// HTML. These two tests are what make that unshippable: the landing deployment
// cannot build without the workspace URL, and cannot build with a loopback one.
// ---------------------------------------------------------------------------

test("landing production build fails when the workspace URL is unset", () => {
  const env = productionEnv();
  delete env.NEXT_PUBLIC_WEB_APP_URL;
  delete env.WEB_APP_URL;

  assert.throws(
    () => validateDeploymentEnv(env, { app: "landing" }),
    /NEXT_PUBLIC_WEB_APP_URL[\s\S]*must be configured in production/,
  );
});

test("landing production build fails when the workspace URL is loopback", () => {
  assert.throws(
    () =>
      validateDeploymentEnv(
        productionEnv({ NEXT_PUBLIC_WEB_APP_URL: "http://localhost:3001" }),
        { app: "landing" },
      ),
    /must not point at a loopback host in production/,
  );
});

test("every app rejects a loopback origin for the surfaces it links to", () => {
  for (const [app, targets] of Object.entries(REQUIRED_APP_URLS)) {
    for (const target of targets) {
      if (target === "api") continue;
      const key = `NEXT_PUBLIC_${target.toUpperCase()}_APP_URL`;
      const legacyKey = `${target.toUpperCase()}_APP_URL`;
      const env = productionEnv({
        [key]: "http://127.0.0.1:9999",
        [legacyKey]: "http://127.0.0.1:9999",
      });

      assert.throws(
        () => validateDeploymentEnv(env, { app }),
        /must not point at a loopback host in production/,
        `${app} accepted a loopback ${target} URL`,
      );
    }
  }
});

test("the API refuses to boot without the app URLs it mails links into", () => {
  const env = productionEnv();
  delete env.NEXT_PUBLIC_WEB_APP_URL;
  delete env.WEB_APP_URL;

  assert.throws(
    () => validateDeploymentEnv(env, { app: "api" }),
    /must be configured in production/,
  );
});

test("a loopback API base URL is rejected in production", () => {
  assert.throws(
    () =>
      validateDeploymentEnv(
        productionEnv({ NEXT_PUBLIC_API_BASE_URL: "http://localhost:4000/api" }),
        { app: "web" },
      ),
    /API base URL must not point at a loopback host/,
  );
});

test("a malformed app URL is rejected rather than silently used", () => {
  assert.throws(
    () =>
      validateDeploymentEnv(
        productionEnv({
          NEXT_PUBLIC_WEB_APP_URL: "app.dijipeople.com",
          WEB_APP_URL: "app.dijipeople.com",
        }),
        { app: "landing" },
      ),
    /must be a valid absolute URL/,
  );
});

test("a non-http scheme is rejected", () => {
  assert.throws(
    () =>
      validateDeploymentEnv(
        productionEnv({
          NEXT_PUBLIC_WEB_APP_URL: "ftp://app.dijipeople.com",
          WEB_APP_URL: "ftp://app.dijipeople.com",
        }),
        { app: "landing" },
      ),
    /must use http or https/,
  );
});

// REGRESSION — validateDeploymentEnv eagerly computed allowedCorsOrigins, which
// needs all three frontend origins. next.config.ts calls this, so a landing
// build demanded the admin URL that the validator itself had deliberately not
// required. CORS is an API concern; a frontend never reads it.
test("validation requires exactly what REQUIRED_APP_URLS declares", () => {
  const env = productionEnv();
  delete env.NEXT_PUBLIC_ADMIN_APP_URL;
  delete env.ADMIN_APP_URL;

  const result = validateDeploymentEnv(env, { app: "landing" });
  assert.equal(result.productionLike, true);
  assert.equal(result.apiBaseUrl, "https://api.dijipeople.com/api");

  // An explicit CORS_ALLOWED_ORIGINS is returned as configured, without
  // deriving any app origin.
  assert.deepEqual(result.allowedCorsOrigins, ["https://www.dijipeople.com"]);

  // Without it the list is derived from the three frontend origins, which does
  // need the admin URL — and still fails loudly when it is read.
  delete env.CORS_ALLOWED_ORIGINS;
  const derived = validateDeploymentEnv(env, { app: "landing" });
  assert.throws(() => derived.allowedCorsOrigins, /must be configured/);
});

test("a fully configured production environment validates for every app", () => {
  for (const app of ["landing", "web", "admin", "api"]) {
    assert.doesNotThrow(
      () => validateDeploymentEnv(productionEnv(), { app }),
      `${app} rejected a complete production environment`,
    );
  }
});

test("isLoopbackUrl recognises the loopback forms and nothing else", () => {
  assert.equal(isLoopbackUrl("http://localhost:3001"), true);
  assert.equal(isLoopbackUrl("http://127.0.0.1:4000/api"), true);
  assert.equal(isLoopbackUrl("http://0.0.0.0:3000"), true);
  assert.equal(isLoopbackUrl("https://app.dijipeople.com"), false);
  // Not loopback: a real host that merely contains the substring.
  assert.equal(isLoopbackUrl("https://localhost.dijipeople.com"), false);
  assert.equal(isLoopbackUrl("not-a-url"), false);
});

test("buildAppUrl joins without producing a concatenated host", () => {
  const env = productionEnv({
    NEXT_PUBLIC_WEB_APP_URL: "https://app.dijipeople.com/",
    WEB_APP_URL: "https://app.dijipeople.com/",
  });

  assert.equal(
    buildAppUrl("web", "/dashboard", env),
    "https://app.dijipeople.com/dashboard",
  );
  // A path missing its leading slash must not become part of the hostname.
  assert.equal(
    buildAppUrl("web", "dashboard", env),
    "https://app.dijipeople.com/dashboard",
  );
  assert.equal(buildAppUrl("web", "/", env), "https://app.dijipeople.com/");
});
