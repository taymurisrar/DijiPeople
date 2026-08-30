const test = require("node:test");
const assert = require("node:assert/strict");
const {
  securityHeadersForApp,
  baselineSecurityHeaders,
  contentSecurityPolicy,
} = require("./index");

/*
 * BUG-0040 — the three Next apps shipped no security response headers.
 *
 * These assertions pin the two decisions that are easy to undo by accident: the
 * CSP ships Report-Only (so it cannot break a page it has never been observed
 * against), and frame protection is NOT deferred with it.
 */

test("every app gets the baseline headers on every path", () => {
  const [rule] = securityHeadersForApp();
  assert.equal(rule.source, "/:path*");

  const keys = rule.headers.map((h) => h.key);
  for (const expected of [
    "X-Content-Type-Options",
    "Referrer-Policy",
    "X-Frame-Options",
    "Permissions-Policy",
    "Strict-Transport-Security",
  ]) {
    assert.ok(keys.includes(expected), `missing ${expected}`);
  }
});

test("the CSP is report-only, never enforced", () => {
  const [rule] = securityHeadersForApp();
  const keys = rule.headers.map((h) => h.key);

  assert.ok(keys.includes("Content-Security-Policy-Report-Only"));
  // Enforcing a policy never observed in a browser trades a missing header for
  // an outage. Promotion is a deliberate act (ITEM-0039), not a silent edit.
  assert.ok(!keys.includes("Content-Security-Policy"));
});

test("clickjacking protection is enforced, not deferred with the CSP", () => {
  const frame = baselineSecurityHeaders().find(
    (h) => h.key === "X-Frame-Options",
  );
  assert.equal(frame.value, "DENY");
});

test("the API origin is allowed to be called", () => {
  const policy = contentSecurityPolicy({
    apiOrigin: "https://api.example.com",
  });
  assert.match(policy, /connect-src 'self' https:\/\/api\.example\.com/);
});

test("the policy never allows framing or arbitrary objects", () => {
  const policy = contentSecurityPolicy();
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /form-action 'self'/);
});

/*
 * BUG-2331 — `geolocation=()` disabled attendance check-in on the tenant app.
 *
 * The empty allowlist is the strictest form of the directive: it blocks the
 * document's own origin, so Chrome rejected `getCurrentPosition` with
 * PERMISSION_DENIED before any prompt could be shown. The employee was told to
 * grant a permission the browser never offered them.
 *
 * These assertions pin both directions. The permissive value must be `(self)`
 * and not `*` — the point is that this origin may ask, not that any embedder
 * may — and an app that does not opt in must still get the empty allowlist,
 * because a fix that quietly widened the default for landing too would trade
 * one silent header mistake for another.
 */
test("an app that opts in may ask for geolocation from its own origin", () => {
  const header = baselineSecurityHeaders({ geolocation: true }).find(
    (h) => h.key === "Permissions-Policy",
  );

  assert.match(header.value, /geolocation=\(self\)/);
  // `*` would let any embedder use this origin's grant. `(self)` is the point.
  assert.ok(!header.value.includes("geolocation=*"));
  // Opting into one feature must not silently relax the others.
  assert.match(header.value, /camera=\(\)/);
  assert.match(header.value, /microphone=\(\)/);
  assert.match(header.value, /payment=\(\)/);
});

test("geolocation stays fully disabled for an app that does not opt in", () => {
  for (const options of [undefined, {}, { geolocation: false }]) {
    const header = baselineSecurityHeaders(options).find(
      (h) => h.key === "Permissions-Policy",
    );
    assert.match(
      header.value,
      /geolocation=\(\)/,
      `default changed for ${JSON.stringify(options)}`,
    );
    assert.ok(!header.value.includes("(self)"));
  }
});

test("the geolocation opt-in survives securityHeadersForApp", () => {
  // What shipped broken was the wiring, not the value: the option has to reach
  // the baseline through the exported entry point the apps actually call.
  const [rule] = securityHeadersForApp({
    apiOrigin: "https://api.dijipeople.com/api",
    geolocation: true,
  });
  const header = rule.headers.find((h) => h.key === "Permissions-Policy");

  assert.match(header.value, /geolocation=\(self\)/);
});

test("HSTS is long-lived and covers subdomains", () => {
  const hsts = baselineSecurityHeaders().find(
    (h) => h.key === "Strict-Transport-Security",
  );
  assert.match(hsts.value, /max-age=63072000/);
  assert.match(hsts.value, /includeSubDomains/);
});

/*
 * BUG-1822 — the landing site's CSP permitted the API over plain http while
 * the other two apps permitted https. On an HTTPS page that is blocked as
 * mixed content before CSP is consulted, so the connect-src entry matched
 * nothing: harmless while report-only, a live break for checkout under
 * enforcement.
 *
 * Refused at build time rather than shipped, which is the stance this package
 * already takes on loopback URLs reaching production.
 */
test("refuses an API origin a browser on HTTPS could never reach", () => {
  assert.throws(
    () => securityHeadersForApp({ apiOrigin: "http://api.dijipeople.com/api" }),
    /plain http/i,
  );
});

test("allows the loopback origins local development actually uses", () => {
  for (const origin of [
    "http://localhost:4000",
    "http://127.0.0.1:4000",
    "http://[::1]:4000",
  ]) {
    assert.doesNotThrow(() => securityHeadersForApp({ apiOrigin: origin }));
  }
});

test("allows https, and says nothing about an absent origin", () => {
  assert.doesNotThrow(() =>
    securityHeadersForApp({ apiOrigin: "https://api.dijipeople.com/api" }),
  );
  // An unset origin is getApiBaseUrl's complaint to make, not this one's.
  assert.doesNotThrow(() => securityHeadersForApp({}));
});

test("does not choke on a value that is not a URL", () => {
  // Malformed input belongs to whoever parses it; this check only refuses the
  // one thing it can be certain about.
  assert.doesNotThrow(() => securityHeadersForApp({ apiOrigin: "not a url" }));
});
