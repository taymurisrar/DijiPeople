import { ConfigService } from '@nestjs/config';

type QueryValue = string | number | boolean | null | undefined;

type TenantUrlInput = {
  slug: string;
  path?: string;
  token?: string;
  query?: Record<string, QueryValue>;
};

export function buildTenantLoginUrl(
  configService: ConfigService,
  input: TenantUrlInput,
) {
  return buildTenantPortalUrl(configService, {
    ...input,
    path: input.path ?? '/login',
  });
}

export function buildTenantActivationUrl(
  configService: ConfigService,
  input: Omit<TenantUrlInput, 'path'>,
) {
  return buildTenantPortalUrl(configService, {
    ...input,
    path: '/activate',
  });
}

export function buildTenantInviteUrl(
  configService: ConfigService,
  input: Omit<TenantUrlInput, 'path'>,
) {
  return buildTenantPortalUrl(configService, {
    ...input,
    path: '/activate',
  });
}

export function buildTenantPortalUrl(
  configService: ConfigService,
  input: TenantUrlInput,
) {
  const slug = input.slug.trim().toLowerCase();
  const path = normalizePath(input.path ?? '/login');

  const appEnv =
    configService.get<string>('APP_ENV') ??
    process.env.NODE_ENV ??
    'development';

  const appUrl =
    configService.get<string>('APP_BASE_URL') ??
    configService.get<string>('NEXT_PUBLIC_APP_BASE_URL') ??
    configService.get<string>('WEB_APP_URL') ??
    configService.get<string>('NEXT_PUBLIC_APP_URL') ??
    'http://localhost:3001';

  const parsedAppUrl = new URL(appUrl);
  const hostname = parsedAppUrl.hostname;
  const tenantRootDomain = normalizeHost(
    configService.get<string>('WEB_APP_PROD_ROOT_DOMAIN') ??
      configService.get<string>('NEXT_PUBLIC_WEB_ROOT_DOMAIN') ??
      '',
  );

  const isLocalHost =
    hostname === 'localhost' || hostname === '127.0.0.1';

  const url =
    appEnv === 'production' && !isLocalHost && tenantRootDomain
      ? new URL(`${parsedAppUrl.protocol}//${slug}.${tenantRootDomain}${path}`)
      : new URL(path, appUrl);

  if (isLocalHost) {
    url.searchParams.set('tenant', slug);
  }

  if (input.token) {
    url.searchParams.set('token', input.token);
  }

  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== null && value !== undefined && String(value).length > 0) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function normalizePath(path: string) {
  return path.startsWith('/') ? path : `/${path}`;
}

function normalizeHost(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}
