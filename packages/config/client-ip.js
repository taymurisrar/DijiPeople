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
 * The header is `client, proxy1, proxy2` — appended left to right — so the first
 * entry is the original client. Reading from the right instead would let any
 * intermediate hop present itself as the client.
 *
 * This value is only meaningful when the deployment says a proxy is in front;
 * the caller decides that, because only the API knows its own topology.
 */
function readForwardedForClientIp(headerValue) {
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (typeof raw !== "string") return null;
  const first = raw.split(",")[0];
  const trimmed = typeof first === "string" ? first.trim() : "";
  if (!trimmed) return null;
  // IPv6 arrives bracketed and sometimes with a port: [::1]:1234.
  const unbracketed = /^\[(.+)\]/.exec(trimmed);
  return (unbracketed ? unbracketed[1] : trimmed) || null;
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

  const clientIp = readForwardedForClientIp(chain);
  if (!clientIp) return {};

  return { [FORWARDED_FOR_HEADER]: chain };
}

module.exports = {
  FORWARDED_FOR_HEADER,
  readForwardedForClientIp,
  buildForwardedClientHeaders,
};
