import { ConfigService } from '@nestjs/config';
import { PublicTenantsService } from './public-tenants.service';

/**
 * Which workspace a hostname addresses.
 *
 * This existed as a third private copy of a rule `@repo/config` owns, keyed on
 * `WEB_APP_PROD_ROOT_DOMAIN` while the web app keyed on `TENANT_BASE_DOMAIN`.
 * With the tenant base domain configured, the web app routed
 * `xoul-ltd.localhost` to a workspace and the API — reading a different, unset
 * variable — resolved no slug from the same hostname and answered
 * `TENANT_NOT_FOUND` for a tenant that exists and is ACTIVE.
 *
 * Only the parsing is exercised here. It is a pure function of the hostname and
 * the configuration, and it is the half that was wrong.
 */
describe('workspace hostname resolution', () => {
  function service(env: Record<string, string>) {
    const config = {
      get: (key: string) => env[key],
    } as unknown as ConfigService;
    return new PublicTenantsService(
      // The parser touches none of these.
      null as never,
      config,
      null as never,
      null as never,
    );
  }

  const LOCAL = {
    PLATFORM_ENVIRONMENT: 'development',
    TENANT_BASE_DOMAIN: 'localhost',
  };

  it('resolves a workspace subdomain in local development', () => {
    expect(service(LOCAL).getTenantSlugFromHost('xoul-ltd.localhost')).toBe(
      'xoul-ltd',
    );
  });

  it('ignores the port, which a Host header carries and a slug never does', () => {
    expect(
      service(LOCAL).getTenantSlugFromHost('xoul-ltd.localhost:3001'),
    ).toBe('xoul-ltd');
  });

  it('resolves the same shape against a deployed base domain', () => {
    const deployed = service({
      PLATFORM_ENVIRONMENT: 'production',
      TENANT_BASE_DOMAIN: 'dijipeople.com',
    });
    expect(deployed.getTenantSlugFromHost('maseer.dijipeople.com')).toBe(
      'maseer',
    );
  });

  it('refuses a platform hostname rather than treating it as a workspace', () => {
    /*
     * `admin.dijipeople.com` is the console, not a customer called "admin".
     * Resolving it would hand whoever registered that slug the platform's own
     * hostname.
     */
    const deployed = service({
      PLATFORM_ENVIRONMENT: 'production',
      TENANT_BASE_DOMAIN: 'dijipeople.com',
    });
    for (const host of [
      'admin.dijipeople.com',
      'api.dijipeople.com',
      'app.dijipeople.com',
      'dijipeople.com',
    ]) {
      expect(deployed.getTenantSlugFromHost(host)).toBeNull();
    }
  });

  it('refuses a nested label rather than resolving the leftmost one', () => {
    // `evil.maseer.dijipeople.com` must not resolve as "evil" or as "maseer".
    const deployed = service({
      PLATFORM_ENVIRONMENT: 'production',
      TENANT_BASE_DOMAIN: 'dijipeople.com',
    });
    expect(
      deployed.getTenantSlugFromHost('evil.maseer.dijipeople.com'),
    ).toBeNull();
  });

  it('refuses a hostname that merely ends with the base domain as a substring', () => {
    const deployed = service({
      PLATFORM_ENVIRONMENT: 'production',
      TENANT_BASE_DOMAIN: 'dijipeople.com',
    });
    expect(
      deployed.getTenantSlugFromHost('maseer.notdijipeople.com'),
    ).toBeNull();
  });

  it('resolves nothing when no tenant base domain is configured', () => {
    // Failing closed is correct: with no configured base domain, any hostname
    // could be anything, and guessing is how one customer reaches another.
    expect(
      service({ PLATFORM_ENVIRONMENT: 'development' }).getTenantSlugFromHost(
        'xoul-ltd.localhost',
      ),
    ).toBeNull();
  });
});
