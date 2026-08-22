import { ConfigService } from '@nestjs/config';

import {
  buildTenantActivationUrl,
  buildTenantLoginUrl,
} from './tenant-url.config';

/**
 * REG-228 — BUG-0714.
 *
 * The URLs this builds are mailed to customers: activation, invitation,
 * password reset, sign-in. Production was configured so that every one of them
 * pointed at `https://diji-people-web.vercel.app` rather than the customer's own
 * workspace address.
 *
 * Not a code defect — four environment variables — but the reason nothing
 * caught it *is* in the code's neighbourhood. `tenant-url.config.spec.ts`
 * contains a passing test named "keeps production single-host login URLs on the
 * configured app host" that asserts exactly `https://diji-people-web.vercel.app/login`.
 * It is a true statement about the function and it encoded the misconfiguration
 * as the expected result, so the suite agreed with production and both were
 * wrong together.
 *
 * This asserts the shape production is *supposed* to have. It is deliberately
 * separate from that file: the existing tests describe the function's behaviour
 * across configurations, which is worth keeping, while these describe the one
 * configuration DijiPeople actually deploys.
 *
 * ## The variable that made it possible
 *
 * The per-tenant rewrite fires only when `WEB_APP_PROD_ROOT_DOMAIN` (or
 * `NEXT_PUBLIC_WEB_ROOT_DOMAIN`) is set. Production had `TENANT_BASE_DOMAIN`
 * set instead — read by the hostname *issuer*, not by this *builder*. Two
 * variables for one concept, and setting half of them is not an error today.
 * The last test below is about that half-configured state specifically, because
 * it is the one that produces a plausible-looking wrong answer rather than a
 * loud failure.
 */
describe('BUG-0714 — production tenant URLs resolve on the customer domain', () => {
  /** The four values as they now stand on the Render service. */
  const PRODUCTION = {
    APP_ENV: 'production',
    WEB_APP_URL: 'https://app.dijipeople.com',
    WEB_APP_PROD_ROOT_DOMAIN: 'ws.dijipeople.com',
    NEXT_PUBLIC_WEB_ROOT_DOMAIN: 'ws.dijipeople.com',
    TENANT_BASE_DOMAIN: 'ws.dijipeople.com',
  };

  function config(overrides: Record<string, string> = {}) {
    const values = { ...PRODUCTION, ...overrides };
    return {
      get(key: string) {
        return values[key];
      },
    } as ConfigService;
  }

  it('builds a login URL on the tenant workspace subdomain', () => {
    expect(buildTenantLoginUrl(config(), { slug: 'abc-cpa' })).toBe(
      'https://abc-cpa.ws.dijipeople.com/login',
    );
  });

  it('builds an activation URL on the tenant workspace subdomain', () => {
    /*
     * The one that matters most. This is the first link a workspace owner ever
     * receives, and it is what they will compare against the domain on their
     * contract.
     */
    expect(
      buildTenantActivationUrl(config(), { slug: 'abc-cpa', token: 'tok-1' }),
    ).toBe('https://abc-cpa.ws.dijipeople.com/activate?token=tok-1');
  });

  it.each(['login', 'activation'])(
    'never emits a deployment host in a %s URL',
    (kind) => {
      /*
       * The assertion aimed squarely at the defect. A URL on `vercel.app` or
       * `onrender.com` resolves and looks fine, which is exactly why nobody
       * noticed — it fails no request, it just sends a paying customer somewhere
       * that is not their address and will not survive a project rename.
       */
      const url =
        kind === 'login'
          ? buildTenantLoginUrl(config(), { slug: 'abc-cpa' })
          : buildTenantActivationUrl(config(), { slug: 'abc-cpa', token: 't' });

      expect(url).not.toContain('vercel.app');
      expect(url).not.toContain('onrender.com');
      expect(url.startsWith('https://')).toBe(true);
    },
  );

  it('falls back to the app host when the root domain is not configured', () => {
    /*
     * Documents the half-configured state rather than asserting it is correct,
     * because this is what production was doing: `TENANT_BASE_DOMAIN` set,
     * `WEB_APP_PROD_ROOT_DOMAIN` absent, so the per-tenant rewrite never fired
     * and every customer got the same host.
     *
     * The value here is honest either way — with `WEB_APP_URL` now correct, the
     * fallback lands on `app.dijipeople.com` instead of the Vercel host. That is
     * the difference between a wrong address and a shared one, and it is why the
     * two fixes were made together.
     */
    const url = buildTenantLoginUrl(
      config({
        WEB_APP_PROD_ROOT_DOMAIN: '',
        NEXT_PUBLIC_WEB_ROOT_DOMAIN: '',
      }),
      { slug: 'abc-cpa' },
    );

    expect(url).toBe('https://app.dijipeople.com/login');
    expect(url).not.toContain('vercel.app');
  });
});
