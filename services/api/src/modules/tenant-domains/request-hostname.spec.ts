import type { Request } from 'express';
import { resolveRequestHostname } from './request-hostname';

/**
 * The hostname is the only routing input for workspace resolution, so whether a
 * forwarded header can be believed is a security decision, not a convenience.
 * An API reachable directly that trusts `X-Forwarded-Host` lets any caller name
 * any workspace.
 */
describe('resolveRequestHostname', () => {
  const originalTrustProxy = process.env.TRUST_PROXY_HEADERS;

  afterEach(() => {
    if (originalTrustProxy === undefined) {
      delete process.env.TRUST_PROXY_HEADERS;
    } else {
      process.env.TRUST_PROXY_HEADERS = originalTrustProxy;
    }
  });

  const request = (
    headers: Record<string, string | string[]>,
    trustProxy: unknown = false,
  ) =>
    ({
      headers,
      app: {
        get: (key: string) => (key === 'trust proxy' ? trustProxy : undefined),
      },
    }) as unknown as Request;

  it('uses the Host header when no proxy is declared', () => {
    expect(
      resolveRequestHostname(request({ host: 'maseer.dijipeople.com' })),
    ).toBe('maseer.dijipeople.com');
  });

  it('ignores X-Forwarded-Host when no proxy is declared', () => {
    /*
     * The attack: a request sent straight to the API carrying a forged
     * X-Forwarded-Host naming another customer's workspace.
     */
    delete process.env.TRUST_PROXY_HEADERS;
    expect(
      resolveRequestHostname(
        request({
          host: 'api.internal',
          'x-forwarded-host': 'victim.dijipeople.com',
        }),
      ),
    ).toBe('api.internal');
  });

  it('trusts X-Forwarded-Host when the deployment declares a proxy', () => {
    process.env.TRUST_PROXY_HEADERS = 'true';
    expect(
      resolveRequestHostname(
        request({
          host: 'api.internal',
          'x-forwarded-host': 'maseer.dijipeople.com',
        }),
      ),
    ).toBe('maseer.dijipeople.com');
  });

  it('honours the Express trust proxy setting when the env var is unset', () => {
    delete process.env.TRUST_PROXY_HEADERS;
    expect(
      resolveRequestHostname(
        request(
          { host: 'api.internal', 'x-forwarded-host': 'maseer.dijipeople.com' },
          1,
        ),
      ),
    ).toBe('maseer.dijipeople.com');
  });

  it('lets an explicit env var override a permissive Express setting', () => {
    process.env.TRUST_PROXY_HEADERS = 'false';
    expect(
      resolveRequestHostname(
        request(
          { host: 'api.internal', 'x-forwarded-host': 'victim.dijipeople.com' },
          1,
        ),
      ),
    ).toBe('api.internal');
  });

  it('takes the first hop of a forwarded chain, not the last', () => {
    /*
     * Taking the last entry would let any intermediate hop — or an attacker who
     * can append to the header — rewrite the host the API resolves.
     */
    process.env.TRUST_PROXY_HEADERS = 'true';
    expect(
      resolveRequestHostname(
        request({
          host: 'api.internal',
          'x-forwarded-host': 'maseer.dijipeople.com, attacker.dijipeople.com',
        }),
      ),
    ).toBe('maseer.dijipeople.com');
  });

  it('reads the RFC 7239 Forwarded header in preference to X-Forwarded-Host', () => {
    process.env.TRUST_PROXY_HEADERS = 'true';
    expect(
      resolveRequestHostname(
        request({
          host: 'api.internal',
          forwarded: 'host="maseer.dijipeople.com";proto=https',
          'x-forwarded-host': 'attacker.dijipeople.com',
        }),
      ),
    ).toBe('maseer.dijipeople.com');
  });

  it('normalizes case and port, and returns null when there is no host at all', () => {
    expect(
      resolveRequestHostname(request({ host: 'MASEER.DijiPeople.com:443' })),
    ).toBe('maseer.dijipeople.com');
    expect(resolveRequestHostname(request({}))).toBeNull();
  });

  it('falls back to Host when the trusted forwarded header is empty', () => {
    process.env.TRUST_PROXY_HEADERS = 'true';
    expect(
      resolveRequestHostname(
        request({ host: 'maseer.dijipeople.com', 'x-forwarded-host': '  ' }),
      ),
    ).toBe('maseer.dijipeople.com');
  });
});
