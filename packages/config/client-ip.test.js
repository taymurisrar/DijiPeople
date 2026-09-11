const test = require("node:test");
const assert = require("node:assert/strict");

const {
  readForwardedForClientIp,
  buildForwardedClientHeaders,
  FORWARDED_FOR_HEADER,
} = require("./client-ip");

/**
 * Which entry of `X-Forwarded-For` is the client, and when there isn't one.
 *
 * This module is the trust boundary for every rate limit in the product: the
 * public write limiter keys on `resolveClientIp(request) + path`, so whatever
 * this returns decides whose bucket a request lands in. Two opposite failures
 * matter equally, and both have happened:
 *
 * - **Believing too much.** Reading the leftmost entry lets any caller prepend
 *   an address and rotate through unlimited identities, defeating the limiter
 *   (RATE-01). The API is directly reachable, so that entry is attacker-supplied
 *   (INF-06).
 * - **Believing too little.** Returning `null` for an honest chain collapses
 *   every caller onto one fallback value, so the first twenty public writes on
 *   the whole deployment lock out everybody — the self-inflicted denial of
 *   service of BUG-0032.
 *
 * The second is the one that shipped. The guard read
 * `entries.length <= hopCount`, which rejects precisely the honest shape,
 * because a proxy appends the peer it received from: one trusted hop yields a
 * one-entry chain that *is* the client, and two yield `client, cf-edge`. Both
 * have `length === hops`. Meanwhile a chain carrying an attacker's prepended
 * entry was long enough to resolve, so the condition was inverted in both
 * directions at once.
 *
 * Production masked it — `cf-connecting-ip` is preferred and Cloudflare is in
 * front — which is exactly why it needed a unit test rather than a deployment to
 * find it. The e2e suite caught it; these pin the arithmetic itself.
 *
 * There was no test file for this module at all when the bug was introduced.
 * Its sibling, `forwarded-host.test.js`, exists but is wired into no script and
 * no CI job, so it never runs; `test:client-ip` exists so this one does.
 */

const CLIENT = "203.0.113.7";
const CF_EDGE = "172.16.0.1";
const FORGED = "1.2.3.4";

test("one trusted hop: the whole chain is the client", () => {
  // Render alone. Render appends the peer that connected to it, so a direct
  // visitor produces a single entry and that entry is the visitor.
  assert.equal(readForwardedForClientIp(CLIENT, 1), CLIENT);
});

test("two trusted hops: the client is leftmost of client + edge", () => {
  // Cloudflare sets the chain to the visitor, Render then appends Cloudflare.
  assert.equal(readForwardedForClientIp(`${CLIENT}, ${CF_EDGE}`, 2), CLIENT);
});

test("one trusted hop: a prepended entry does not become the client", () => {
  // The genuine, hop-appended value sits one from the right however much an
  // attacker adds on the left.
  assert.equal(readForwardedForClientIp(`${FORGED}, ${CLIENT}`, 1), CLIENT);
});

test("two trusted hops: a prepended entry does not become the client", () => {
  assert.equal(
    readForwardedForClientIp(`${FORGED}, ${CLIENT}, ${CF_EDGE}`, 2),
    CLIENT,
  );
});

test("a chain shorter than the hop count vouches for nothing", () => {
  // Genuinely too short: two hops must have appended, and only one entry
  // exists. Guessing here is what hands out free identities.
  assert.equal(readForwardedForClientIp(CLIENT, 2), null);
});

test("an absent or unusable header is null, never a guess", () => {
  assert.equal(readForwardedForClientIp(undefined, 1), null);
  assert.equal(readForwardedForClientIp(null, 1), null);
  assert.equal(readForwardedForClientIp("", 1), null);
  assert.equal(readForwardedForClientIp("   ", 1), null);
  assert.equal(readForwardedForClientIp(" , , ", 1), null);
});

test("an array header reads its first value, as Node presents repeats", () => {
  assert.equal(readForwardedForClientIp([CLIENT, "9.9.9.9"], 1), CLIENT);
});

test("IPv6 arrives bracketed and sometimes with a port", () => {
  assert.equal(readForwardedForClientIp("[::1]:1234", 1), "::1");
  assert.equal(readForwardedForClientIp("[2001:db8::1]", 1), "2001:db8::1");
});

test("a missing or nonsense hop count defaults to one rather than zero", () => {
  // Defaulting to zero would index past the end of the chain; defaulting to one
  // is the single-proxy case, which is the common deployment.
  assert.equal(readForwardedForClientIp(CLIENT), CLIENT);
  assert.equal(readForwardedForClientIp(CLIENT, 0), CLIENT);
  assert.equal(readForwardedForClientIp(CLIENT, -3), CLIENT);
  assert.equal(readForwardedForClientIp(CLIENT, 1.5), CLIENT);
});

test("relaying a chain is a shape check, not a trust decision", () => {
  // A first-party proxy relaying a single-entry chain is the normal case, so the
  // relay must not apply the API's hop arithmetic — it does not know how many
  // hops the *next* leg will trust. Asserted through the exported builder,
  // since the predicate itself is internal.
  const headers = (value) => ({ get: () => value });

  assert.deepEqual(buildForwardedClientHeaders(headers(CLIENT)), {
    [FORWARDED_FOR_HEADER]: CLIENT,
  });
  assert.deepEqual(
    buildForwardedClientHeaders(headers(`${CLIENT}, ${CF_EDGE}`)),
    { [FORWARDED_FOR_HEADER]: `${CLIENT}, ${CF_EDGE}` },
  );

  // Nothing worth relaying yields no header at all, rather than an empty one
  // that a downstream reader would have to interpret.
  assert.deepEqual(buildForwardedClientHeaders(headers("")), {});
  assert.deepEqual(buildForwardedClientHeaders(headers("   ")), {});
  assert.deepEqual(buildForwardedClientHeaders(headers(null)), {});
  assert.deepEqual(buildForwardedClientHeaders(undefined), {});
  assert.deepEqual(buildForwardedClientHeaders({}), {});
});
