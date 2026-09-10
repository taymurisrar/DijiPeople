import type { Request } from 'express';
import { resolveTrustProxySetting } from '@repo/config';

/**
 * How many proxy hops in front of this process may be believed to have
 * appended truthfully to `X-Forwarded-For`, or `0` when none may.
 *
 * SECURITY (RATE-01 / INF-06). This used to be a boolean ("is some proxy
 * trusted?"), and `client-ip.ts` used that boolean alone to decide whether to
 * read the *leftmost* entry of `X-Forwarded-For` — which is exactly the entry
 * an attacker controls when the API is reachable directly (it is; see INF-06).
 * The number of hops matters, not just whether there are any: the address a
 * trusted hop can vouch for sits a fixed distance from the *right* end of the
 * chain, `hopCount` positions in, regardless of how much an attacker prepends
 * on the left. Collapsing that count to a boolean threw away the one piece of
 * information that made the header safe to read at all.
 *
 * Explicit configuration wins so a deployment can state the truth about its own
 * topology; otherwise Express's `trust proxy` setting is used, which is what the
 * hosting platform configuration in `main.ts` already sets — and which itself
 * is already the resolved hop count, not a boolean (see `main.ts`).
 *
 * This was extracted from `modules/tenant-domains/request-hostname.ts` when
 * client-IP resolution needed the same decision. Two copies of "do we believe
 * `X-Forwarded-*` here?" would be two things to get wrong: a deployment could
 * end up trusting the forwarded host while ignoring the forwarded address, and
 * the rate limiter and the tenant router would then disagree about what a
 * request is. It is one question, so it has one answer.
 *
 * The answer itself now lives in `@repo/config` rather than here, because
 * `apps/web` middleware asks it too and cannot reach an Express request. What
 * stays here is the part only the API can answer: whether *this* request's
 * Express app was configured with a proxy in front. The env-based half is
 * delegated, so a change to what `TRUST_PROXY_HEADERS` means cannot move the
 * API and the tenant router apart.
 */
export function resolveTrustedProxyHopCount(request: Request): number {
  /*
   * Only the explicitly configured value short-circuits. When the variable is
   * unset the shared rule would infer from the hosting platform, and that
   * inference is already what `main.ts` fed into `trust proxy` — so asking
   * Express keeps a single origin for the deployed answer instead of computing
   * it twice from different vantage points.
   */
  const configured = process.env.TRUST_PROXY_HEADERS;
  if (typeof configured === 'string' && configured.trim()) {
    const resolved = resolveTrustProxySetting({
      TRUST_PROXY_HEADERS: configured,
    });
    return typeof resolved === 'number' ? resolved : resolved ? 1 : 0;
  }

  const setting: unknown = request.app?.get?.('trust proxy');
  if (typeof setting === 'number') return setting;
  return setting ? 1 : 0;
}

/**
 * Whether the forwarded headers on this request can be believed at all.
 *
 * A boolean view of {@link resolveTrustedProxyHopCount} for callers (host
 * resolution) that only need "believe it or not", not the hop count itself.
 */
export function isProxyTrusted(request: Request): boolean {
  return resolveTrustedProxyHopCount(request) > 0;
}
