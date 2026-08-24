import type { Request } from 'express';
import { readForwardedHost, readHost } from '@repo/config';
import { isProxyTrusted } from '../../common/security/proxy-trust';

/**
 * The hostname a request actually arrived on.
 *
 * WHY THIS IS NOT JUST `req.hostname`. In production the API sits behind a
 * proxy, so the browser's hostname arrives in `X-Forwarded-Host` and the `Host`
 * header holds the internal address. In development, and for anything that can
 * reach the API directly, the opposite is true — and `X-Forwarded-Host` is then
 * an attacker-controlled string.
 *
 * So the forwarded chain is trusted only when the deployment says a proxy is in
 * front (`TRUST_PROXY_HEADERS`, or Express's own `trust proxy` setting, which
 * `main.ts` configures for the hosting platform). Otherwise `Host` wins.
 *
 * Nothing here reads a tenant id from a header. The hostname is the only routing
 * input, and it is resolved against the database — a caller that lies about the
 * host can only ask about a workspace it could already ask about.
 *
 * The header parsing — `Forwarded` before `X-Forwarded-Host`, first hop only —
 * comes from `@repo/config`, which `apps/web` middleware reads too. The
 * *decision* stays here because only the API has an Express app to ask.
 */
export function resolveRequestHostname(request: Request): string | null {
  const headers = expressHeaders(request);

  if (isProxyTrusted(request)) {
    const forwarded = readForwardedHost(headers);
    if (forwarded) return forwarded;
  }

  return readHost(headers);
}

/**
 * Node's `IncomingHttpHeaders` as the `get(name)` shape the shared reader takes.
 *
 * Header names arrive lowercased by Node, and a repeated header arrives as an
 * array; the shared reader handles the array, so this only has to find it.
 */
function expressHeaders(request: Request) {
  return {
    get(name: string): string | null {
      const value = request.headers[name.toLowerCase()];
      if (Array.isArray(value)) return value[0] ?? null;
      return typeof value === 'string' ? value : null;
    },
  };
}
