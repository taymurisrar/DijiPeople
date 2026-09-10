import type { Request } from 'express';
import { resolveClientIp } from './client-ip';

/**
 * RATE-01 / INF-06. The previous version of this suite enshrined the
 * vulnerability: it asserted that the *leftmost* entry of `X-Forwarded-For` is
 * "the visitor", which is true only when nothing untrusted ever gets to write
 * that position. The API is directly reachable (confirmed in the 2026-09-10
 * audit), so an external caller can put anything it likes at the leftmost
 * position and rotate it per request — every rate limit keyed on the old
 * result was decorative. The fix reads the entry a *trusted hop itself
 * appended*, counted a fixed distance from the right, which an attacker cannot
 * move no matter how many fake entries they prepend on the left.
 *
 * The trade-off this buys (documented, not hidden): traffic proxied through
 * this product's own first-party Next.js apps (`apps/web`, `apps/admin`,
 * `apps/landing`) can no longer be told apart per browser visitor once it is
 * read this way, because Cloudflare/Render append the *relay's* address, not
 * the original browser's, for that path too. That is a granularity loss for a
 * handful of already-throttled public forms (BUG-0032's original scenario),
 * not a security hole — see BUG record for RATE-01 for the follow-up (an
 * authenticated internal channel between the apps and the API) that would
 * recover it without reopening the forgery.
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
    cfConnectingIp?: string;
    ip?: string;
    trustProxySetting?: unknown;
  }): Request {
    const headers: Record<string, string> = {};
    if (options.forwardedFor) headers['x-forwarded-for'] = options.forwardedFor;
    if (options.cfConnectingIp)
      headers['cf-connecting-ip'] = options.cfConnectingIp;
    return {
      headers,
      ip: options.ip,
      socket: { remoteAddress: options.ip },
      app: {
        get: (key: string) =>
          key === 'trust proxy' ? options.trustProxySetting : undefined,
      },
    } as unknown as Request;
  }

  describe('when one hop is trusted (TRUST_PROXY_HEADERS=true)', () => {
    beforeEach(() => {
      process.env.TRUST_PROXY_HEADERS = 'true';
    });

    it('reads the entry the trusted hop itself appended, not the leftmost one a caller controls', () => {
      // Shape: "<whatever arrived before our one trusted hop>, <that hop's own
      // observed peer>". The second entry is the only one this deployment can
      // vouch for; the first is exactly what RATE-01 let an attacker forge.
      const request = buildRequest({
        forwardedFor: '203.0.113.7, 198.51.100.2',
        ip: '10.0.0.5',
      });

      expect(resolveClientIp(request)).toBe('198.51.100.2');
      expect(resolveClientIp(request)).not.toBe('203.0.113.7');
    });

    it('is not moved by how many fake entries a caller prepends (the RATE-01 bypass)', () => {
      // Before this fix, each of these produced a distinct identity — the
      // whole point of the attack. Now both collapse to the one position the
      // trusted hop actually wrote.
      const short = buildRequest({
        forwardedFor: 'attacker-fake-1, 198.51.100.2',
        ip: '10.0.0.5',
      });
      const long = buildRequest({
        forwardedFor:
          'attacker-fake-2, attacker-fake-3, attacker-fake-4, 198.51.100.2',
        ip: '10.0.0.5',
      });

      expect(resolveClientIp(short)).toBe('198.51.100.2');
      expect(resolveClientIp(long)).toBe('198.51.100.2');
    });

    it('unwraps a bracketed IPv6 address at the trusted position', () => {
      const request = buildRequest({
        forwardedFor: '203.0.113.7, [2001:db8::1]',
        ip: '10.0.0.5',
      });

      expect(resolveClientIp(request)).toBe('2001:db8::1');
    });

    it('falls back to the socket address when no chain was forwarded at all', () => {
      // Direct call in local development, no proxy in the path: the peer
      // really is the client, and there is no header to be ambiguous about.
      const request = buildRequest({ ip: '10.0.0.5' });

      expect(resolveClientIp(request)).toBe('10.0.0.5');
    });

    it('does not fall back to the socket address when the header is present but too short for the trusted hop count', () => {
      // A single entry with one trusted hop configured is exactly the shape a
      // caller produces by sending nothing and letting the hop write one
      // value — indistinguishable here from a caller who sent one fake entry
      // and got no real append at all. Refuse to guess either way.
      const request = buildRequest({
        forwardedFor: '203.0.113.7',
        ip: '10.0.0.5',
      });

      expect(resolveClientIp(request)).toBe('unknown');
      expect(resolveClientIp(request)).not.toBe('10.0.0.5');
    });
  });

  describe('when two hops are trusted (Cloudflare + Render, TRUST_PROXY_HEADERS=2)', () => {
    beforeEach(() => {
      process.env.TRUST_PROXY_HEADERS = '2';
    });

    it('reads the entry two positions from the right, regardless of how much a caller prepends', () => {
      // The exact scenario INF-06 traced end to end: "<attacker string>, <real
      // client>, <edge>". Two trusted hops means the middle entry is the one
      // Cloudflare itself appended — genuinely the caller's real address, even
      // though the caller controls the first entry outright.
      const request = buildRequest({
        forwardedFor: 'attacker-string, 203.0.113.9, 198.51.100.5',
        ip: '10.0.0.5',
      });

      expect(resolveClientIp(request)).toBe('203.0.113.9');
    });

    it('resolves to neither the forged leftmost entry nor the socket address when the chain is too short for the configured hop count', () => {
      // Exactly the regression this fix exists to prevent: a two-entry chain
      // under a two-hop trust setting could equally be "no forgery, both real
      // hops wrote fresh entries" or "one forged entry plus one real append".
      // Only two trusted hops can tell those apart from *three* entries; with
      // two, refuse to guess rather than default to the attacker-controlled
      // value.
      const request = buildRequest({
        forwardedFor: '1.2.3.4, 203.0.113.9',
        ip: '10.0.0.9',
      });

      const resolved = resolveClientIp(request);
      expect(resolved).not.toBe('1.2.3.4');
      expect(resolved).not.toBe('10.0.0.9');
    });

    it('prefers cf-connecting-ip over X-Forwarded-For, because Cloudflare rewrites it and a caller cannot', () => {
      const request = buildRequest({
        forwardedFor: 'attacker-fake, 203.0.113.9, 198.51.100.5',
        cfConnectingIp: '203.0.113.9',
        ip: '10.0.0.5',
      });

      expect(resolveClientIp(request)).toBe('203.0.113.9');
    });

    it('ignores a caller-supplied cf-connecting-ip when no proxy is trusted', () => {
      process.env.TRUST_PROXY_HEADERS = 'false';
      const request = buildRequest({
        cfConnectingIp: '203.0.113.9',
        ip: '198.51.100.44',
      });

      expect(resolveClientIp(request)).toBe('198.51.100.44');
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
