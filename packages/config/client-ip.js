/**
 * Client IP propagation across the first-party proxy hop.
 *
 * WHY THIS EXISTS. `PublicRateLimitGuard` throttles per client IP. Almost no
 * public traffic reaches the API directly: it goes browser → Next route handler
 * (`apps/landing`, `apps/web`, `apps/admin`) → API. A Next route handler runs
 * `fetch()` server-side, so unless it deliberately carries the visitor's address
 * forward, the API sees the *Next server's* egress address for every visitor
 * alive. The guard then keys every request in the product to one bucket, and the
 * rate limit stops distinguishing an attacker from a customer — it becomes a
 * denial-of-service switch that any single visitor can flip for everyone
 * (BUG-0032).
 *
 * This module is the single home for both halves of the fix: what a proxy sends
 * and what the API reads. They must agree, so they live together rather than in
 * an apps/ helper and a services/api helper that can drift apart.
 */

const FORWARDED_FOR_HEADER = "x-forwarded-for";

/**
 * The client-closest address in an `X-Forwarded-For` chain.
 *
 * SECURITY (RATE-01 / INF-06). The header is `client, proxy1, proxy2` —
 * appended left to right by each hop that relays the request — so the entry a
 * genuinely trusted hop can vouch for is the one *it itself appended*, which is
 * exactly `hopCount` positions from the right, never the leftmost. Reading the
 * leftmost entry unconditionally (the previous behaviour) let anyone who could
 * reach the API directly — which this deployment allows, see INF-06 — supply
 * an arbitrary value there and have it believed as "the client", defeating
 * every rate limit keyed on it. Indexing from the right survives an attacker
 * prepending any number of fake entries: whatever they add only pushes the
 * genuine, hop-appended value further from the *end* of the chain, and the end
 * is where this reads from.
 *
 * `hopCount` must equal the number of real proxies between the untrusted
 * network and this process (e.g. Cloudflare + Render = 2 — see
 * `resolveTrustProxySetting`/`TRUST_PROXY_HEADERS`). When the chain has too few
 * entries to contain that many genuine hops (`entries.length <= hopCount`),
 * there is no position this can vouch for, so it returns `null` rather than
 * guessing — the caller must not fall back to the leftmost entry either, only
 * to a value it independently trusts (e.g. the raw socket address, or
 * `'unknown'`).
 *
 * ## Why the guard demands strictly MORE entries than hops
 *
 * This reads like an off-by-one and is not. It was changed to
 * `entries.length < hopCount` during SESSION-0098 on the reasoning that an
 * honest chain carries exactly `hopCount` entries, and that reasoning is wrong
 * for this deployment in a way that reopens RATE-01.
 *
 * The API is **directly reachable** (INF-06), so Cloudflare can be bypassed. With
 * two hops configured, a caller who goes straight to Render and sends one forged
 * entry produces `<forged>, <render-peer>` — two entries, which is also the shape
 * an honest Cloudflare-then-Render chain has. At `entries[length - hops]` the
 * first of those is the forged value, so accepting a chain of exactly `hopCount`
 * hands the attacker the identity outright, which is the bypass this function
 * exists to close.
 *
 * Requiring one more entry than hops means every accepted position has a trusted
 * hop's append to its right. The cost is deliberate: honest traffic that reaches
 * the service without passing every configured hop resolves to `null`, and the
 * caller keys it on something it trusts instead. `cf-connecting-ip` is preferred
 * above this for exactly that reason — Cloudflare overwrites it and a caller
 * cannot.
 *
 * `services/api/src/common/security/client-ip.spec.ts` asserts both halves, and
 * is what caught the change. Do not relax this boundary to make a test resolve a
 * short chain; give the test a chain of realistic length instead.
 *
 * This value is only meaningful when the deployment says a proxy is in front;
 * the caller decides that, because only the API knows its own topology.
 *
 * @param {string | string[] | undefined | null} headerValue
 * @param {number} [hopCount] number of trusted proxies that append to this
 *   header before it reaches us. Defaults to 1.
 */
function readForwardedForClientIp(headerValue, hopCount = 1) {
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof raw !== "string") return null;
  const hops = Number.isInteger(hopCount) && hopCount > 0 ? hopCount : 1;
  const entries = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0 || entries.length <= hops) return null;
  const trimmed = entries[entries.length - hops];
  // IPv6 arrives bracketed and sometimes with a port: [::1]:1234.
  const unbracketed = /^\[(.+)\]/.exec(trimmed);
  return (unbracketed ? unbracketed[1] : trimmed) || null;
}

/**
 * Whether an incoming `X-Forwarded-For` chain has anything worth relaying.
 *
 * This is a shape check, not a trust decision — unlike
 * `readForwardedForClientIp`, it does not know how many hops the *next* leg
 * (the API) will trust, because that is the API's configuration, not this
 * proxy's. A single-entry chain (visitor IP, no hops appended yet) is exactly
 * what a first-party app normally has to relay, so this only rejects an
 * absent or blank header.
 *
 * @param {string | null | undefined} chain
 */
function hasForwardableClientValue(chain) {
  if (typeof chain !== "string") return false;
  return chain.split(",").some((entry) => entry.trim().length > 0);
}

/**
 * The headers a first-party proxy must merge into its outbound `fetch()` so the
 * API can still identify the visitor.
 *
 * The incoming chain is preserved and the proxy appends nothing of its own: the
 * hosting platform's edge has already written the visitor's address into
 * `X-Forwarded-For`, and re-appending would push the client entry away from the
 * position `readForwardedForClientIp` reads. When there is no incoming chain —
 * a direct call in local development — nothing is sent, and the API falls back
 * to the socket address, which is then genuinely the client.
 *
 * @param {Headers | { get(name: string): string | null }} incomingHeaders
 * @returns {Record<string, string>} headers to spread into the proxied request
 */
function buildForwardedClientHeaders(incomingHeaders) {
  const chain =
    typeof incomingHeaders?.get === "function"
      ? incomingHeaders.get(FORWARDED_FOR_HEADER)
      : null;

  if (!hasForwardableClientValue(chain)) return {};

  return { [FORWARDED_FOR_HEADER]: chain };
}

module.exports = {
  FORWARDED_FOR_HEADER,
  readForwardedForClientIp,
  buildForwardedClientHeaders,
};
