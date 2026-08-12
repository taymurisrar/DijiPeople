import {
  buildPublicSiteUrl,
  getPublicSiteOrigin,
} from './public-site-url.config';

describe('public site URL configuration', () => {
  it('uses localhost only for local development', () => {
    expect(
      buildPublicSiteUrl('/sign/token-123', {
        APP_ENV: 'development',
        PUBLIC_SITE_URL: 'http://localhost:3000',
      }),
    ).toBe('http://localhost:3000/sign/token-123');
  });

  it('rejects a loopback signing URL in production', () => {
    expect(() =>
      buildPublicSiteUrl('/sign/token-123', {
        APP_ENV: 'production',
        PUBLIC_SITE_URL: 'http://localhost:3000',
      }),
    ).toThrow('cannot use a loopback host');
  });

  it('requires deployment configuration in production', () => {
    expect(() =>
      getPublicSiteOrigin({
        APP_ENV: 'production',
      }),
    ).toThrow('must be configured in production');
  });

  it('preserves an explicitly configured production public origin', () => {
    expect(
      getPublicSiteOrigin({
        APP_ENV: 'production',
        PUBLIC_SITE_URL: 'https://sign.dijipeople.com/base-path',
      }),
    ).toBe('https://sign.dijipeople.com');
  });
});
