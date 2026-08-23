import { resolveVisitorCountry } from './controllers/public-billing.controller';

/**
 * REG — a server-rendered page must not quote the datacenter's currency.
 *
 * The requirement: Qatar sees QAR, Pakistan PKR, the United States USD, and
 * anywhere else USD. Every part of that machinery was correct — the country
 * mappings, the market resolver, the fallback — and it still produced the wrong
 * currency on the only path that matters, because of header precedence.
 *
 * `api.dijipeople.com` sits behind Cloudflare, which sets `cf-ipcountry` from
 * the peer it is talking to. The landing pages are server-rendered on Vercel
 * and call this API from a datacenter, so Cloudflare stamped the *renderer's*
 * country over the visitor's — and `cf-ipcountry` was read first.
 *
 * Measured on 2026-08-24 from a connection Cloudflare geolocates to Qatar:
 *
 *   GET /public/commercial-config   → QAR   (browser talks to Cloudflare)
 *   GET www.dijipeople.com/plans    → USD   (X-Vercel-Id: bom1::iad1)
 *
 * The forwarded header was present and correct the whole time. It lost.
 *
 * Worth noting how this hid: testing the API directly cannot reproduce it, and
 * neither can injecting `cf-ipcountry` by hand, because Cloudflare overwrites
 * whatever you send. The only probe that shows it is the rendered page.
 */
describe('resolveVisitorCountry', () => {
  it('prefers the forwarded visitor country over the CDN view of the caller', () => {
    /*
     * The regression, exactly as production had it: Vercel forwards the real
     * visitor country and Cloudflare reports the datacenter it rendered in.
     */
    expect(
      resolveVisitorCountry({
        cloudflareCountry: 'US',
        vercelCountry: 'QA',
      }),
    ).toBe('QA');
  });

  it('uses the CDN country when nothing is forwarded', () => {
    // A browser calling the API directly. Here `cf-ipcountry` is the visitor,
    // and it is the best signal available.
    expect(resolveVisitorCountry({ cloudflareCountry: 'PK' })).toBe('PK');
  });

  it('accepts the generic forwarded header too', () => {
    expect(
      resolveVisitorCountry({
        cloudflareCountry: 'US',
        customCountry: 'PK',
      }),
    ).toBe('PK');
  });

  it('ignores blank and whitespace-only headers rather than resolving to them', () => {
    /*
     * An empty forwarded header must fall through, not win. A proxy that sets
     * the header unconditionally would otherwise blank the country on every
     * request and send everyone to the fallback market — the original bug, with
     * a different cause.
     */
    expect(
      resolveVisitorCountry({ cloudflareCountry: 'QA', vercelCountry: '' }),
    ).toBe('QA');
    expect(
      resolveVisitorCountry({ cloudflareCountry: 'QA', vercelCountry: '   ' }),
    ).toBe('QA');
  });

  it('returns null when nothing at all is known', () => {
    // Null, not a guess. The market resolver treats it as "fall back", which is
    // a decision made in one place rather than invented here.
    expect(resolveVisitorCountry({})).toBeNull();
  });
});
