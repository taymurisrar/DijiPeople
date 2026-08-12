import { getAppOrigin, isProductionLike } from '@repo/config';

export function getPublicSiteOrigin(env: NodeJS.ProcessEnv = process.env) {
  const explicitlyConfigured =
    env.PUBLIC_SITE_URL?.trim() ||
    env.LANDING_APP_URL?.trim() ||
    env.NEXT_PUBLIC_LANDING_APP_URL?.trim();

  if (isProductionLike(env) && !explicitlyConfigured) {
    throw new Error(
      'PUBLIC_SITE_URL or LANDING_APP_URL must be configured in production.',
    );
  }

  const configured = explicitlyConfigured || getAppOrigin('landing', env);
  const parsed = parseHttpOrigin(configured);

  if (isProductionLike(env) && isLoopbackHost(parsed.hostname)) {
    throw new Error(
      'PUBLIC_SITE_URL or LANDING_APP_URL cannot use a loopback host in production.',
    );
  }

  return parsed.origin;
}

export function buildPublicSiteUrl(
  path: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return new URL(normalizedPath, `${getPublicSiteOrigin(env)}/`).toString();
}

function parseHttpOrigin(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('PUBLIC_SITE_URL must be a valid absolute URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('PUBLIC_SITE_URL must use http or https.');
  }

  return parsed;
}

function isLoopbackHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized === '[::1]'
  );
}
