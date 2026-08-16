import type { Request } from 'express';
import { normalizeHostname } from '@repo/config';
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
 */
export function resolveRequestHostname(request: Request): string | null {
  if (isProxyTrusted(request)) {
    const forwarded =
      readForwardedHeaderHost(request.headers.forwarded) ??
      firstHeaderValue(request.headers['x-forwarded-host']);
    const normalized = normalizeHostname(forwarded);
    if (normalized) return normalized;
  }

  return normalizeHostname(firstHeaderValue(request.headers.host)) || null;
}

/**
 * `Forwarded: host=example.com;proto=https` — RFC 7239. Only the first element
 * is read, because that is the hop closest to the client.
 */
function readForwardedHeaderHost(value: string | string[] | undefined) {
  const header = firstHeaderValue(value);
  if (!header) return undefined;
  const firstElement = header.split(',')[0] ?? '';
  const match = /host\s*=\s*"?([^;",]+)"?/i.exec(firstElement);
  return match?.[1];
}

/**
 * A header can legitimately arrive as a comma-separated chain. Only the first
 * entry is used; taking the last would let an intermediate hop rewrite the host.
 */
function firstHeaderValue(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return undefined;
  const first = raw.split(',')[0];
  return first?.trim() || undefined;
}
