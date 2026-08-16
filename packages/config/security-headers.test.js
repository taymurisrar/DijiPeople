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

test("HSTS is long-lived and covers subdomains", () => {
  const hsts = baselineSecurityHeaders().find(
    (h) => h.key === "Strict-Transport-Security",
  );
  assert.match(hsts.value, /max-age=63072000/);
  assert.match(hsts.value, /includeSubDomains/);
});
