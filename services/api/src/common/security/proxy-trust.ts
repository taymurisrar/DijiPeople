import type { Request } from 'express';
import { isForwardedHostTrusted } from '@repo/config';

/**
 * Whether the forwarded headers on this request can be believed.
 *
 * Explicit configuration wins so a deployment can state the truth about its own
 * topology; otherwise Express's `trust proxy` setting is used, which is what the
 * hosting platform configuration in `main.ts` already sets.
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
export function isProxyTrusted(request: Request): boolean {
  /*
   * Only the explicitly configured value short-circuits. When the variable is
   * unset the shared rule would infer from the hosting platform, and that
   * inference is already what `main.ts` fed into `trust proxy` — so asking
   * Express keeps a single origin for the deployed answer instead of computing
   * it twice from different vantage points.
   */
  const configured = process.env.TRUST_PROXY_HEADERS;
  if (typeof configured === 'string' && configured.trim()) {
    return isForwardedHostTrusted({ TRUST_PROXY_HEADERS: configured });
  }

  const setting: unknown = request.app?.get?.('trust proxy');
  return Boolean(setting);
}
