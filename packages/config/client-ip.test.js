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
 * this returns decides whose bucket a request lands in.
 *
 * ## The boundary that looks like an off-by-one and is not
 *
 * A chain is only usable when it has **strictly more** entries than the trusted
 * hop count, so that the position read has a trusted hop's append to its right.
 * A chain of exactly `hopCount` entries is refused.
 *
 * That refusal was mistaken for an off-by-one during SESSION-0098 and briefly
 * relaxed to `entries.length < hopCount`, on the reasoning that an honest chain
 * carries exactly `hopCount` entries. The reasoning ignores INF-06: the API is
 * directly reachable, so Cloudflare can be bypassed. With two hops configured, a
 * caller who goes straight to Render sending one forged entry produces
 * `<forged>, <render-peer>` — two entries, the same length as an honest
 * Cloudflare-then-Render chain — and `entries[length - hops]` is then the forged
 * value. Relaxing the guard hands out the identity, which is the RATE-01 bypass.
 *
 * `services/api/src/common/security/client-ip.spec.ts` caught it. These cases
 * exist so the arithmetic is pinned in the package that owns it too, since this
 * module had no test file of its own at all.
 *
 * The cost of the strict boundary is real and accepted: honest traffic arriving
 * without passing every configured hop resolves to `null`, and the caller keys it
 * on something it independently trusts. `cf-connecting-ip` is preferred above
 * this path for that reason — Cloudflare overwrites it and a caller cannot.
 *
 * Also runs alongside `forwarded-host.test.js`, which existed but was wired into
 * no script and no job, so it had never executed once.
 */

const CLIENT = "203.0.113.7";
const CF_EDGE = "172.16.0.1";
const FORGED = "1.2.3.4";

test("one trusted hop reads the rightmost entry, which the hop appended", () => {
  assert.equal(readForwardedForClientIp(`${FORGED}, ${CLIENT}`, 1), CLIENT);
});

test("two trusted hops read two from the right, however much is prepended", () => {
  // The INF-06 scenario end to end: forged, real client, edge.
  assert.equal(
    readForwardedForClientIp(`${FORGED}, ${CLIENT}, ${CF_EDGE}`, 2),
    CLIENT,
  );
  assert.equal(
    readForwardedForClientIp(`a, b, ${FORGED}, ${CLIENT}, ${CF_EDGE}`, 2),
    CLIENT,
  );
});

test("a chain of exactly the hop count vouches for nothing", () => {
  // The security-critical case. Accepting these is the RATE-01 bypass: the
  // leftmost entry of a two-entry chain under two hops is attacker-supplied
  // whenever Cloudflare was bypassed, and the API is directly reachable.
  assert.equal(readForwardedForClientIp(CLIENT, 1), null);
  assert.equal(readForwardedForClientIp(`${FORGED}, ${CLIENT}`, 2), null);
  assert.equal(readForwardedForClientIp(`${CLIENT}, ${CF_EDGE}`, 2), null);
});

test("a chain shorter than the hop count vouches for nothing either", () => {
  assert.equal(readForwardedForClientIp(CLIENT, 2), null);
  assert.equal(readForwardedForClientIp(`${CLIENT}, ${CF_EDGE}`, 3), null);
});

test("an absent or unusable header is null, never a guess", () => {
  assert.equal(readForwardedForClientIp(undefined, 1), null);
  assert.equal(readForwardedForClientIp(null, 1), null);
  assert.equal(readForwardedForClientIp("", 1), null);
  assert.equal(readForwardedForClientIp("   ", 1), null);
  assert.equal(readForwardedForClientIp(" , , ", 1), null);
});

test("an array header reads its first value, as Node presents repeats", () => {
  assert.equal(readForwardedForClientIp([`${FORGED}, ${CLIENT}`, "9.9.9.9"], 1), CLIENT);
});

test("IPv6 arrives bracketed and sometimes with a port", () => {
  assert.equal(readForwardedForClientIp(`${FORGED}, [::1]:1234`, 1), "::1");
  assert.equal(
    readForwardedForClientIp(`${FORGED}, [2001:db8::1]`, 1),
    "2001:db8::1",
  );
});

test("a missing or nonsense hop count defaults to one rather than zero", () => {
  // Zero would index past the end of the chain and read nothing.
  assert.equal(readForwardedForClientIp(`${FORGED}, ${CLIENT}`), CLIENT);
  assert.equal(readForwardedForClientIp(`${FORGED}, ${CLIENT}`, 0), CLIENT);
  assert.equal(readForwardedForClientIp(`${FORGED}, ${CLIENT}`, -3), CLIENT);
  assert.equal(readForwardedForClientIp(`${FORGED}, ${CLIENT}`, 1.5), CLIENT);
});

test("relaying a chain is a shape check, not a trust decision", () => {
  // A first-party proxy relaying a single-entry chain is the normal case, so the
  // relay must not apply the API's hop arithmetic — it does not know how many
  // hops the next leg will trust. Asserted through the exported builder, since
  // the predicate itself is internal.
  const headers = (value) => ({ get: () => value });

  assert.deepEqual(buildForwardedClientHeaders(headers(CLIENT)), {
    [FORWARDED_FOR_HEADER]: CLIENT,
  });
  assert.deepEqual(
    buildForwardedClientHeaders(headers(`${CLIENT}, ${CF_EDGE}`)),
    { [FORWARDED_FOR_HEADER]: `${CLIENT}, ${CF_EDGE}` },
  );

  // Nothing worth relaying yields no header at all, rather than an empty one a
  // downstream reader would have to interpret.
  assert.deepEqual(buildForwardedClientHeaders(headers("")), {});
  assert.deepEqual(buildForwardedClientHeaders(headers("   ")), {});
  assert.deepEqual(buildForwardedClientHeaders(headers(null)), {});
  assert.deepEqual(buildForwardedClientHeaders(undefined), {});
  assert.deepEqual(buildForwardedClientHeaders({}), {});
});
