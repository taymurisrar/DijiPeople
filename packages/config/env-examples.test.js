const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");

const { getPlatformDomainConfig, DEFAULT_LOCAL_PORTS } = require("./index");

/**
 * REG-222 — ITEM-0045.
 *
 * `apps/web` ships two committed environment examples and they disagreed about
 * the domain workspaces are served from: `.env.example` said `localhost:3000`,
 * `.env.local.example` said `localhost:3001`. 3000 is the *landing* port.
 *
 * `NEXT_PUBLIC_WEB_ROOT_DOMAIN` is the lowest-precedence alias for
 * `TENANT_BASE_DOMAIN` in `platform-domains.js`. Locally the port never reached
 * classification — `normalizeHostname` strips it, so both reduced to
 * `localhost` — and that is precisely why the drift survived in a committed
 * example: a wrong value nothing reads is a wrong value nobody notices. It is
 * still wrong. Anything that builds a URL reads the value unnormalised, and a
 * developer following the example is told which app they are configuring.
 *
 * Two examples for one app is itself the hazard: whichever is read second wins,
 * and nobody diffs them. So the invariant is that **they agree**, that they
 * agree on the ports the apps actually answer on, and that `platform-domains.js`
 * makes the same thing of each.
 */

const REPO_ROOT = join(__dirname, "..", "..");
const WEB = join(REPO_ROOT, "apps", "web");

/**
 * Variables that decide routing or cross-app addressing. A difference in any of
 * these changes behaviour; a difference in a cookie name or a timeout does not,
 * and demanding byte-identical files would make this test noise.
 */
const MUST_AGREE = [
  "NEXT_PUBLIC_APP_ORIGIN",
  "NEXT_PUBLIC_WEB_APP_URL",
  "NEXT_PUBLIC_ADMIN_APP_URL",
  "NEXT_PUBLIC_LANDING_APP_URL",
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_WEB_ROOT_DOMAIN",
  "NEXT_PUBLIC_ADMIN_ROOT_DOMAIN",
  "API_BASE_URL",
  "API_ORIGIN",
];

function parseEnvExample(path) {
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    values[trimmed.slice(0, separator)] = trimmed.slice(separator + 1);
  }
  return values;
}

const examplePath = join(WEB, ".env.example");
const localExamplePath = join(WEB, ".env.local.example");

test("both apps/web environment examples exist", () => {
  assert.ok(existsSync(examplePath), ".env.example is missing");
  assert.ok(existsSync(localExamplePath), ".env.local.example is missing");
});

const example = parseEnvExample(examplePath);
const localExample = parseEnvExample(localExamplePath);

test("the examples were parsed, so this is not comparing two empty objects", () => {
  assert.ok(Object.keys(example).length > 10);
  assert.ok(Object.keys(localExample).length > 10);
});

test("the two examples agree on every routing and addressing variable", () => {
  const disagreements = [];
  for (const key of MUST_AGREE) {
    const a = example[key];
    const b = localExample[key];
    if (a === undefined || b === undefined) continue; // covered below
    if (a !== b) disagreements.push(`${key}: .env.example=${a} .env.local.example=${b}`);
  }
  assert.deepEqual(disagreements, []);
});

test("neither example omits a routing variable the other declares", () => {
  const missing = [];
  for (const key of MUST_AGREE) {
    if (example[key] !== undefined && localExample[key] === undefined) {
      missing.push(`${key} absent from .env.local.example`);
    }
    if (localExample[key] !== undefined && example[key] === undefined) {
      missing.push(`${key} absent from .env.example`);
    }
  }
  assert.deepEqual(missing, []);
});

test("the tenant root domain names the port apps/web actually answers on", () => {
  // The whole defect in one assertion: 3000 is landing, 3001 is web.
  const expected = `localhost:${DEFAULT_LOCAL_PORTS.web}`;
  assert.equal(example.NEXT_PUBLIC_WEB_ROOT_DOMAIN, expected);
  assert.equal(localExample.NEXT_PUBLIC_WEB_ROOT_DOMAIN, expected);
});

test("the admin root domain names the port apps/admin answers on", () => {
  const expected = `localhost:${DEFAULT_LOCAL_PORTS.admin}`;
  assert.equal(example.NEXT_PUBLIC_ADMIN_ROOT_DOMAIN, expected);
  assert.equal(localExample.NEXT_PUBLIC_ADMIN_ROOT_DOMAIN, expected);
});

test("platform-domains resolves both examples to the same tenant base domain", () => {
  // Not just "the two files match" — that the code does the same thing with
  // each. Locally both normalise to `localhost`, because `normalizeHostname`
  // strips the port, which is *why* the 3000/3001 drift never failed anything
  // and could sit in a committed example for months. The value still has to be
  // right: it is read unnormalised by anything that builds a URL from it, and a
  // developer following the example is told which app they are configuring.
  const options = { PLATFORM_ENVIRONMENT: "development" };
  const fromExample = getPlatformDomainConfig({ ...example, ...options });
  const fromLocal = getPlatformDomainConfig({ ...localExample, ...options });

  assert.equal(fromExample.tenantBaseDomain, fromLocal.tenantBaseDomain);
  assert.equal(
    fromExample.tenantBaseDomain,
    example.NEXT_PUBLIC_WEB_ROOT_DOMAIN.split(":")[0],
  );
});
