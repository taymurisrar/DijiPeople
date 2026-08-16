import type { Request } from 'express';
import { readForwardedForClientIp } from '@repo/config';
import { isProxyTrusted } from './proxy-trust';

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
 * actually sits in front; reachable directly, it is an attacker-controlled
 * string and trusting it would hand any caller an unlimited supply of identities
 * to rotate through. So the same `isProxyTrusted` decision that governs the
 * forwarded *host* governs the forwarded *address*, and untrusted requests fall
 * back to the socket address, which is then genuinely the peer.
 *
 * Returns a stable string rather than null so callers cannot accidentally
 * collapse every unidentifiable request into one shared bucket by keying on
 * `undefined`.
 */
export function resolveClientIp(request: Request): string {
  if (isProxyTrusted(request)) {
    const forwarded = readForwardedForClientIp(
      request.headers['x-forwarded-for'],
    );
    if (forwarded) return forwarded;
  }

  return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
}
