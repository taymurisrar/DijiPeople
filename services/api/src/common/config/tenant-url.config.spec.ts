import { ConfigService } from '@nestjs/config';
import * as dotenv from 'dotenv';
import {
  buildTenantActivationUrl,
  buildTenantLoginUrl,
} from './tenant-url.config';

dotenv.config({ path: 'services/api/.env' });

function envConfig(overrides: Record<string, string> = {}) {
  return {
    get(key: string) {
      return overrides[key] ?? process.env[key];
    },
  } as ConfigService;
}

describe('tenant URL config', () => {
  it('builds development login URLs from .env', () => {
    expect(buildTenantLoginUrl(envConfig(), { slug: 'abc-cpa' })).toBe(
      'http://localhost:3001/login?tenant=abc-cpa',
    );
  });

  it('builds production login URLs', () => {
    expect(
      buildTenantLoginUrl(
        envConfig({
          APP_ENV: 'production',
          WEB_APP_URL: 'https://dijipeople.com',
          WEB_APP_PROD_ROOT_DOMAIN: 'dijipeople.com',
        }),
        { slug: 'abc-cpa' },
      ),
    ).toBe('https://abc-cpa.dijipeople.com/login');
  });

  it('keeps production single-host login URLs on the configured app host', () => {
    expect(
      buildTenantLoginUrl(
        envConfig({
          APP_ENV: 'production',
          WEB_APP_URL: 'https://diji-people-web.vercel.app',
        }),
        { slug: 'diji-people-web' },
      ),
    ).toBe('https://diji-people-web.vercel.app/login');
  });

  it('builds tenant-aware activation URLs from .env', () => {
    expect(
      buildTenantActivationUrl(envConfig(), {
        slug: 'abc-cpa',
        token: 'token-1',
      }),
    ).toBe('http://localhost:3001/activate?tenant=abc-cpa&token=token-1');
  });
});
