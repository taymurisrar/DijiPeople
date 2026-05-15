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
  const appEnv = configService.get<string>('APP_ENV') ?? process.env.NODE_ENV;
  const rootDomain = stripProtocol(
    configService.get<string>('WEB_APP_PROD_ROOT_DOMAIN') ?? '',
  );
  const protocol =
    configService.get<string>('WEB_APP_PROD_PROTOCOL')?.replace(/:$/, '') ||
    'https';
  const isProduction = appEnv === 'production' && rootDomain.length > 0;

  const url = isProduction
    ? new URL(`${protocol}://${slug}.${rootDomain}${path}`)
    : new URL(
        path,
        configService.get<string>('WEB_APP_DEV_ORIGIN') ??
          'http://localhost:3001',
      );

  if (!isProduction) {
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

function stripProtocol(value: string) {
  return value
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
}
