"use strict";

/**
 * Hostname parsing is the boundary that decides which tenant a request belongs
 * to. Everything below is a case where getting it wrong hands one customer
 * another customer's workspace, so the tests are written as attacks rather than
 * as happy paths.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  PLATFORM_ENVIRONMENTS,
  buildWorkspaceHostname,
  buildWorkspaceUrl,
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

/** A production-shaped environment, independent of the developer's own env. */
const ENV = {
  NODE_ENV: "production",
  PLATFORM_ENVIRONMENT: "production",
  TENANT_BASE_DOMAIN: "dijipeople.com",
  PLATFORM_APP_HOST: "app.dijipeople.com",
  PLATFORM_ADMIN_HOST: "admin.dijipeople.com",
  PLATFORM_API_HOST: "api.dijipeople.com",
};

test("normalizes case, port, trailing dot and surrounding whitespace", () => {
  assert.equal(normalizeHostname("  MASEER.DijiPeople.com:443 "), "maseer.dijipeople.com");
  assert.equal(normalizeHostname("maseer.dijipeople.com."), "maseer.dijipeople.com");
  assert.equal(normalizeHostname(""), "");
  assert.equal(normalizeHostname(undefined), "");
});

test("resolves the workspace slug from a first-level subdomain", () => {
  assert.equal(parseWorkspaceHostname("maseer.dijipeople.com", ENV), "maseer");
  assert.equal(parseWorkspaceHostname("MASEER.DIJIPEOPLE.COM", ENV), "maseer");
  assert.equal(parseWorkspaceHostname("maseer-uat.dijipeople.com", ENV), "maseer-uat");
});

test("rejects a hostname that merely ends with the base domain as a substring", () => {
  /*
   * `maseer.dijipeople.com.attacker.com` is controlled by the attacker. A
   * contains/startsWith check would resolve it to the maseer workspace and hand
   * that tenant's session cookies to another origin.
   */
  assert.equal(
    parseWorkspaceHostname("maseer.dijipeople.com.attacker.com", ENV),
    null,
  );
  assert.equal(parseWorkspaceHostname("notdijipeople.com", ENV), null);
  assert.equal(parseWorkspaceHostname("xdijipeople.com", ENV), null);
  assert.equal(parseWorkspaceHostname("maseer.dijipeople.com.evil", ENV), null);
});

test("rejects nested labels rather than resolving the leftmost one", () => {
  assert.equal(parseWorkspaceHostname("a.b.dijipeople.com", ENV), null);
  assert.equal(parseWorkspaceHostname("maseer.uat.dijipeople.com", ENV), null);
});

test("rejects the bare base domain and platform hostnames", () => {
  assert.equal(parseWorkspaceHostname("dijipeople.com", ENV), null);
  for (const host of getPlatformHostnames(ENV)) {
    assert.equal(parseWorkspaceHostname(host, ENV), null, host);
    assert.equal(isPlatformHostname(host, ENV), true, host);
  }
});

test("rejects reserved labels so a tenant cannot occupy platform infrastructure", () => {
  for (const label of ["admin", "app", "api", "www", "mail", "uat", "staging", "prod"]) {
    assert.equal(isReservedHostLabel(label), true, label);
    assert.equal(
      parseWorkspaceHostname(`${label}.dijipeople.com`, ENV),
      null,
      label,
    );
  }
});

test("rejects slug shapes that are not valid host labels", () => {
  for (const bad of [
    "ab",               // too short
    "a".repeat(51),     // too long
    "-leading",
    "trailing-",
    "double--hyphen",
    "under_score",
    "has space",
    "dot.in.label",
  ]) {
    assert.equal(isValidWorkspaceSlugFormat(bad), false, bad);
  }
  for (const good of ["abc", "maseer", "maseer-uat", "acme-group-2"]) {
    assert.equal(isValidWorkspaceSlugFormat(good), true, good);
  }
});

test("case is normalized rather than rejected, and stays normalized end to end", () => {
  /*
   * "Maseer" is accepted because every path lowercases before validating and
   * before storing, so the stored slug is always the host label. The invariant
   * that matters is that the normalized form is what the hostname is built from
   * — a stored "Maseer" with a hostname lookup for "maseer" would be a workspace
   * nobody can reach.
   */
  assert.equal(isValidWorkspaceSlugFormat("Maseer"), true);
  assert.equal(buildWorkspaceHostname("Maseer", ENV), "maseer.dijipeople.com");
  assert.equal(parseWorkspaceHostname("Maseer.DijiPeople.com", ENV), "maseer");
});

test("an unconfigured non-production deployment resolves no workspace at all", () => {
  /*
   * A missing base domain must not silently match everything — that is how an
   * unconfigured deployment ends up resolving arbitrary hosts to a tenant.
   * Production carries a built-in default; staging and development do not.
   */
  const unset = { NODE_ENV: "production", PLATFORM_ENVIRONMENT: "staging" };
  assert.equal(parseWorkspaceHostname("maseer.dijipeople.com", unset), null);
  assert.equal(parseWorkspaceHostname("anything.example.com", unset), null);
  assert.equal(buildWorkspaceHostname("maseer", unset), "");
});

test("the discovery host is the platform app host, never a workspace", () => {
  assert.equal(isWorkspaceDiscoveryHostname("app.dijipeople.com", ENV), true);
  assert.equal(isWorkspaceDiscoveryHostname("maseer.dijipeople.com", ENV), false);
});

test("builds hostnames and URLs from the same rules that parse them", () => {
  assert.equal(buildWorkspaceHostname("maseer", ENV), "maseer.dijipeople.com");
  assert.equal(
    buildWorkspaceUrl("maseer", { path: "/activate", env: ENV }),
    "https://maseer.dijipeople.com/activate",
  );
  /* Round trip: anything we build must parse back to the slug we built it from. */
  assert.equal(
    parseWorkspaceHostname(buildWorkspaceHostname("maseer-uat", ENV), ENV),
    "maseer-uat",
  );
});

test("a development workspace URL carries the port the web app listens on", () => {
  /*
   * `xoul-ltd.localhost` resolves — browsers loopback any `.localhost` label —
   * so with a tenant base domain configured locally the hostname branch is
   * taken, and it produced port 80 where nothing listens. Every generated
   * workspace link was dead in development, including Open Tenant and every
   * invitation email, and it presented as a DNS problem.
   */
  const DEV = {
    PLATFORM_ENVIRONMENT: "development",
    TENANT_BASE_DOMAIN: "localhost",
    WEB_APP_URL: "http://localhost:3001",
  };
  assert.equal(buildWorkspaceHostname("xoul-ltd", DEV), "xoul-ltd.localhost");
  assert.equal(
    buildWorkspaceUrl("xoul-ltd", { path: "/login", env: DEV }),
    "http://xoul-ltd.localhost:3001/login",
  );
});

test("a deployed workspace URL never has a port grafted onto it", () => {
  /*
   * Asserted for both non-development stages rather than production alone: the
   * guard is on the environment, and a rule that only holds for one of the two
   * values it excludes is a rule that will be got wrong later.
   */
  for (const stage of ["production", "staging"]) {
    const env = {
      PLATFORM_ENVIRONMENT: stage,
      TENANT_BASE_DOMAIN: "dijipeople.com",
      /* Deliberately present, and deliberately ignored. */
      WEB_APP_URL: "http://localhost:3001",
    };
    assert.equal(
      buildWorkspaceUrl("maseer", { path: "/login", env }),
      "https://maseer.dijipeople.com/login",
    );
  }
});

test("a web origin with no explicit port yields no port", () => {
  const DEV = {
    PLATFORM_ENVIRONMENT: "development",
    TENANT_BASE_DOMAIN: "localhost",
    WEB_APP_URL: "http://web.internal",
  };
  assert.equal(
    buildWorkspaceUrl("xoul-ltd", { path: "/", env: DEV }),
    "http://xoul-ltd.localhost/",
  );
});

test("suggests a usable slug from a company name", () => {
  assert.equal(suggestWorkspaceSlug("Maseer Group LLC"), "maseer-group-llc");
  assert.equal(suggestWorkspaceSlug("  ACME   Holdings  "), "acme-holdings");
  assert.equal(suggestWorkspaceSlug("Ünïcode & Co."), "unicode-co");
});

test("development is only reached through explicit configuration", () => {
  assert.equal(resolvePlatformEnvironment(ENV), PLATFORM_ENVIRONMENTS.PRODUCTION);
  assert.equal(
    resolvePlatformEnvironment({ NODE_ENV: "development" }),
    PLATFORM_ENVIRONMENTS.DEVELOPMENT,
  );
  /*
   * NODE_ENV=production with no explicit stage must never resolve to
   * development: the development branch is what enables the fallback tenant.
   */
  assert.notEqual(
    resolvePlatformEnvironment({ NODE_ENV: "production" }),
    PLATFORM_ENVIRONMENTS.DEVELOPMENT,
  );
});
