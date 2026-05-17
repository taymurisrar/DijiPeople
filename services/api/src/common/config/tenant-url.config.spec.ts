import { ConfigService } from '@nestjs/config';
import {
  buildTenantActivationUrl,
  buildTenantLoginUrl,
} from './tenant-url.config';

function config(values: Record<string, string>) {
  return {
    get(key: string) {
      return values[key];
    },
  } as ConfigService;
}

describe('tenant URL config', () => {
  it('builds development login URLs', () => {
    expect(
      buildTenantLoginUrl(
        config({
          APP_ENV: 'development',
          WEB_APP_URL: 'http://localhost:3001',
        }),
        { slug: 'abc-cpa' },
      ),
    ).toBe('http://localhost:3001/login?tenant=abc-cpa');
  });

  it('builds production login URLs', () => {
    expect(
      buildTenantLoginUrl(
        config({
          APP_ENV: 'production',
          WEB_APP_URL: 'https://dijipeople.com',
        }),
        { slug: 'abc-cpa' },
      ),
    ).toBe('https://abc-cpa.dijipeople.com/login');
  });

  it('builds tenant-aware activation URLs', () => {
    expect(
      buildTenantActivationUrl(
        config({
          APP_ENV: 'development',
          ACCOUNT_ACTIVATION_LINK_BASE_URL: 'http://localhost:3001',
          WEB_APP_URL: 'http://localhost:3001',
        }),
        { slug: 'abc-cpa', token: 'token-1' },
      ),
    ).toBe('http://localhost:3001/activate?tenant=abc-cpa&token=token-1');
  });
});
