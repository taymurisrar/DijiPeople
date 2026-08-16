import type { Request } from 'express';
import { resolveClientIp } from './client-ip';

/**
 * These assertions are the two halves of BUG-0032. The first group proves the
 * rate limiter can tell two visitors apart behind the Next proxies; the second
 * proves it cannot be handed a forged identity when nothing trustworthy sits in
 * front. Both must hold — a fix for one that breaks the other is not a fix.
 */
describe('resolveClientIp', () => {
  const originalTrustProxy = process.env.TRUST_PROXY_HEADERS;

  afterEach(() => {
    if (originalTrustProxy === undefined) {
      delete process.env.TRUST_PROXY_HEADERS;
    } else {
      process.env.TRUST_PROXY_HEADERS = originalTrustProxy;
    }
  });

  function buildRequest(options: {
    forwardedFor?: string;
    ip?: string;
    trustProxySetting?: unknown;
  }): Request {
    return {
      headers: options.forwardedFor
        ? { 'x-forwarded-for': options.forwardedFor }
        : {},
      ip: options.ip,
      socket: { remoteAddress: options.ip },
      app: {
        get: (key: string) =>
          key === 'trust proxy' ? options.trustProxySetting : undefined,
      },
    } as unknown as Request;
  }

  describe('when a proxy is trusted', () => {
    beforeEach(() => {
      process.env.TRUST_PROXY_HEADERS = 'true';
    });

    it('reads the visitor rather than the proxy that forwarded them', () => {
      // The exact shape the landing app now sends: visitor first, edge after.
      const request = buildRequest({
        forwardedFor: '203.0.113.7, 198.51.100.2',
        ip: '10.0.0.5',
      });

      expect(resolveClientIp(request)).toBe('203.0.113.7');
    });

    it('separates two visitors arriving through the same proxy', () => {
      // This is the whole point: one shared socket address, two identities.
      const first = buildRequest({
        forwardedFor: '203.0.113.7',
        ip: '10.0.0.5',
      });
      const second = buildRequest({
        forwardedFor: '203.0.113.9',
        ip: '10.0.0.5',
      });

      expect(resolveClientIp(first)).not.toBe(resolveClientIp(second));
    });

    it('unwraps a bracketed IPv6 address', () => {
      const request = buildRequest({
        forwardedFor: '[2001:db8::1]',
        ip: '10.0.0.5',
      });

      expect(resolveClientIp(request)).toBe('2001:db8::1');
    });

    it('falls back to the socket address when no chain was forwarded', () => {
      // Direct call in local development: the peer really is the client.
      const request = buildRequest({ ip: '10.0.0.5' });

      expect(resolveClientIp(request)).toBe('10.0.0.5');
    });
  });

  describe('when no proxy is trusted', () => {
    beforeEach(() => {
      process.env.TRUST_PROXY_HEADERS = 'false';
    });

    it('ignores a forwarded chain a caller supplied for itself', () => {
      // Otherwise any caller mints a fresh identity per request and the rate
      // limit becomes decorative.
      const request = buildRequest({
        forwardedFor: '203.0.113.7',
        ip: '198.51.100.44',
      });

      expect(resolveClientIp(request)).toBe('198.51.100.44');
    });
  });

  it('never returns an empty identity', () => {
    // A blank key would collapse every unidentifiable request into one bucket —
    // reintroducing the defect for exactly the traffic least worth trusting.
    process.env.TRUST_PROXY_HEADERS = 'true';
    const request = buildRequest({ forwardedFor: '  ,  ' });

    expect(resolveClientIp(request)).toBe('unknown');
  });
});
