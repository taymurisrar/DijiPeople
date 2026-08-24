const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isForwardedHostTrusted,
  resolveForwardedHostname,
  resolveTrustProxySetting,
} = require("./forwarded-host");

/**
 * The rule that decides whether a header may name a workspace.
 *
 * These cases are the contract `services/api/src/main.ts` and
 * `apps/web/proxy.ts` both depend on. They are asserted here rather than in
 * either consumer because the point of the module is that there is one answer:
 * a change that made the API and the web app disagree would pass both of their
 * own suites and fail here.
 */

const headers = (map) => ({
  get: (name) => map[name.toLowerCase()] ?? null,
});

test("explicit truthy values trust one hop", () => {
  for (const value of ["1", "true", "yes", "on", "TRUE", " On "]) {
    assert.equal(
      resolveTrustProxySetting({ TRUST_PROXY_HEADERS: value }),
      1,
      `expected ${JSON.stringify(value)} to trust one hop`,
    );
  }
});

test("explicit falsy values trust nothing", () => {
  for (const value of ["0", "false", "no", "off", "OFF"]) {
    assert.equal(
      resolveTrustProxySetting({ TRUST_PROXY_HEADERS: value }),
      false,
      `expected ${JSON.stringify(value)} to trust nothing`,
    );
  }
});

test("an explicit hop count is honoured", () => {
  assert.equal(resolveTrustProxySetting({ TRUST_PROXY_HEADERS: "2" }), 2);
  assert.equal(resolveTrustProxySetting({ TRUST_PROXY_HEADERS: "3" }), 3);
});

/*
 * A deployment that tried to configure this and got it wrong must not silently
 * inherit the platform default. A typo becoming a trusted header is the failure
 * mode this case exists to prevent.
 */
test("an unrecognised explicit value fails closed rather than falling through", () => {
  assert.equal(
    resolveTrustProxySetting({ TRUST_PROXY_HEADERS: "maybe", VERCEL: "1" }),
    false,
  );
  assert.equal(
    resolveTrustProxySetting({ TRUST_PROXY_HEADERS: "-1", RENDER: "true" }),
    false,
  );
});

test("Render and Vercel are inferred as one hop when nothing is configured", () => {
  assert.equal(resolveTrustProxySetting({ RENDER: "true" }), 1);
  assert.equal(resolveTrustProxySetting({ VERCEL: "1" }), 1);
});

test("an unknown runtime trusts nothing", () => {
  assert.equal(resolveTrustProxySetting({}), false);
  assert.equal(resolveTrustProxySetting({ RENDER: "false", VERCEL: "0" }), false);
  assert.equal(resolveTrustProxySetting(undefined), false);
});

test("isForwardedHostTrusted mirrors the hop decision", () => {
  assert.equal(isForwardedHostTrusted({ VERCEL: "1" }), true);
  assert.equal(isForwardedHostTrusted({ TRUST_PROXY_HEADERS: "2" }), true);
  assert.equal(isForwardedHostTrusted({}), false);
});

// --------------------------------------------------------------- hostname

test("an untrusted runtime ignores the forwarded host", () => {
  const resolved = resolveForwardedHostname(
    headers({
      host: "app.internal",
      "x-forwarded-host": "victim.dijipeople.com",
    }),
    {},
  );
  assert.equal(resolved, "app.internal");
});

test("a trusted runtime prefers the forwarded host", () => {
  const resolved = resolveForwardedHostname(
    headers({
      host: "app.internal",
      "x-forwarded-host": "maseer.dijipeople.com",
    }),
    { VERCEL: "1" },
  );
  assert.equal(resolved, "maseer.dijipeople.com");
});

test("RFC 7239 Forwarded is read before X-Forwarded-Host", () => {
  const resolved = resolveForwardedHostname(
    headers({
      host: "app.internal",
      forwarded: "host=maseer.dijipeople.com;proto=https",
      "x-forwarded-host": "other.dijipeople.com",
    }),
    { TRUST_PROXY_HEADERS: "true" },
  );
  assert.equal(resolved, "maseer.dijipeople.com");
});

/*
 * `client, proxy1, proxy2` is appended left to right, so the first entry is the
 * hop closest to the client. Reading the last would let any intermediate hop
 * rewrite the host.
 */
test("only the first hop of a chain is read", () => {
  const resolved = resolveForwardedHostname(
    headers({
      host: "app.internal",
      "x-forwarded-host": "maseer.dijipeople.com, attacker.example.com",
    }),
    { VERCEL: "1" },
  );
  assert.equal(resolved, "maseer.dijipeople.com");
});

test("hostnames are normalized", () => {
  assert.equal(
    resolveForwardedHostname(headers({ host: "MASEER.DijiPeople.com:443" }), {}),
    "maseer.dijipeople.com",
  );
});

test("a trusted runtime with no forwarded header falls back to Host", () => {
  assert.equal(
    resolveForwardedHostname(headers({ host: "maseer.dijipeople.com" }), {
      VERCEL: "1",
    }),
    "maseer.dijipeople.com",
  );
});

test("no usable host resolves to null rather than a guess", () => {
  assert.equal(resolveForwardedHostname(headers({}), { VERCEL: "1" }), null);
  assert.equal(
    resolveForwardedHostname(headers({ "x-forwarded-host": "a.example.com" }), {}),
    null,
  );
});
