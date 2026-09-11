import type { Request } from 'express';
import { readForwardedForClientIp } from '@repo/config';
import { resolveTrustedProxyHopCount } from './proxy-trust';

/**
 * The single header Cloudflare itself computes and cannot be made to lie
 * about: it always overwrites any client-supplied value with the address that
 * actually connected to its edge (unlike `X-Forwarded-For`, which it only
 * appends to — see RATE-01). Preferring it, when present, closes the bypass
 * even if `TRUST_PROXY_HEADERS` is ever misconfigured with the wrong hop
 * count; the `X-Forwarded-For` path below remains for deployments and tests
 * that have no Cloudflare in front at all.
 */
const CF_CONNECTING_IP_HEADER = 'cf-connecting-ip';

function readCfConnectingIp(request: Request): string | null {
  const raw = request.headers[CF_CONNECTING_IP_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || null;
}

/**
 * The address to attribute a request to.
 *
 * WHY NOT JUST `request.ip`. Public traffic reaches this API through a Next
 * route handler in `apps/landing`, `apps/web` or `apps/admin`, which calls
 * `fetch()` from the server. The socket address is then that app's egress
 * address, identical for every visitor in the world. Anything keyed on it — the
 * public rate limit above all — stops being per-client and becomes global
 * (BUG-0032).
 *
 * `X-Forwarded-For` carries the real client, but only where a proxy we control
 * actually sits in front, and only when read at the position that specific
 * number of trusted hops append to (RATE-01 / INF-06): the API is directly
 * reachable, so the leftmost entry is an attacker-controlled string, and
 * trusting it unconditionally — as this used to — hands any caller an
 * unlimited supply of identities to rotate through. `resolveTrustedProxyHopCount`
 * supplies that hop count; `readForwardedForClientIp` indexes from the right by
 * it, and returns null rather than guessing when the chain is too short to
 * contain that many genuine hops. Untrusted requests, and requests where
 * neither signal is available, fall back to the socket address, which is then
 * genuinely the peer.
 *
 * Returns a stable string rather than null so callers cannot accidentally
 * collapse every unidentifiable request into one shared bucket by keying on
 * `undefined`.
 */
export function resolveClientIp(request: Request): string {
  const hopCount = resolveTrustedProxyHopCount(request);
  if (hopCount > 0) {
    const cfConnectingIp = readCfConnectingIp(request);
    if (cfConnectingIp) return cfConnectingIp;

    const rawForwardedFor = request.headers['x-forwarded-for'];
    if (rawForwardedFor) {
      /*
       * A header was actually sent. If it does not resolve to a confident
       * position, that is exactly the shape a forged header takes when it
       * does not know the real hop count (RATE-01) — do not fall through to
       * the socket address, which behind a trusted proxy is this
       * deployment's own edge, not a meaningful external identity. Reporting
       * 'unknown' is honest; reporting the edge's own address would just
       * accept a different attacker-adjacent value instead of the one it
       * forged.
       */
      return readForwardedForClientIp(rawForwardedFor, hopCount) ?? 'unknown';
    }
  }

  return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
}
