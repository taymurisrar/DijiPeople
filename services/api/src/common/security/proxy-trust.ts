import type { Request } from 'express';

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
 */
export function isProxyTrusted(request: Request): boolean {
  const configured = process.env.TRUST_PROXY_HEADERS;
  if (typeof configured === 'string' && configured.trim()) {
    const value = configured.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(value)) return true;
    if (['0', 'false', 'no', 'off'].includes(value)) return false;
  }

  const setting: unknown = request.app?.get?.('trust proxy');
  return Boolean(setting);
}
