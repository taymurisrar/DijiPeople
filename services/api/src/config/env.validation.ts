import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import {
  getAllowedCorsOrigins,
  getApiBaseUrl,
  getAppOrigin,
} from '@repo/config';

const PRODUCTION_REQUIRED_ENV = [
  'NODE_ENV',
  'API_BASE_URL',
  'API_ORIGIN',
  'DATABASE_URL',
  'CORS_ALLOWED_ORIGINS',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'ADMIN_APP_URL',
  'WEB_APP_URL',
  'LANDING_APP_URL',
  'ACCOUNT_ACTIVATION_LINK_BASE_URL',
  'PASSWORD_RESET_LINK_BASE_URL',
  'COOKIE_SECURE',
  'COOKIE_SAME_SITE',
] as const;

const RECOMMENDED_PRODUCTION_ENV = [
  'ADMIN_JWT_ACCESS_SECRET',
  'ADMIN_JWT_REFRESH_SECRET',
  'WEB_JWT_ACCESS_SECRET',
  'WEB_JWT_REFRESH_SECRET',
  'AGENT_JWT_ACCESS_SECRET',
  'AGENT_JWT_REFRESH_SECRET',
  'ADMIN_ACCESS_TOKEN_COOKIE',
  'ADMIN_REFRESH_TOKEN_COOKIE',
  'WEB_ACCESS_TOKEN_COOKIE',
  'WEB_REFRESH_TOKEN_COOKIE',
  'AGENT_ACCESS_TOKEN_COOKIE',
  'AGENT_REFRESH_TOKEN_COOKIE',
] as const;

export function validateApiEnvironment(env: NodeJS.ProcessEnv) {
  const production = isProductionLike(env);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (production) {
    for (const key of PRODUCTION_REQUIRED_ENV) {
      if (!hasValue(env[key])) {
        errors.push(`${key} is required in production.`);
      }
    }

    for (const key of RECOMMENDED_PRODUCTION_ENV) {
      if (!hasValue(env[key])) {
        warnings.push(`${key} is recommended for app-isolated auth.`);
      }
    }
  }

  for (const [key, value] of [
    ['API_BASE_URL', getApiBaseUrl(env)],
    ['API_ORIGIN', env.API_ORIGIN || getAppOrigin('api', env)],
    ['ADMIN_APP_URL', env.ADMIN_APP_URL],
    ['WEB_APP_URL', env.WEB_APP_URL],
    ['LANDING_APP_URL', env.LANDING_APP_URL],
  ]) {
    if (hasValue(value) && !isValidHttpUrl(value)) {
      errors.push(`${key} must be a valid http(s) URL.`);
    }
  }

  const corsOrigins = getAllowedCorsOrigins(env);
  if (parseBoolean(env.CORS_ALLOW_CREDENTIALS, true)) {
    if (corsOrigins.includes('*')) {
      errors.push(
        'CORS_ALLOWED_ORIGINS cannot include * when credentials are enabled.',
      );
    }
    if (corsOrigins.some((origin) => origin.includes('/api'))) {
      errors.push(
        'CORS_ALLOWED_ORIGINS must contain origins only, not /api paths.',
      );
    }
  }

  const sameSite = (
    env.COOKIE_SAME_SITE ||
    env.AUTH_COOKIE_SAME_SITE ||
    ''
  ).toLowerCase();
  const secure = parseBoolean(
    env.COOKIE_SECURE ?? env.AUTH_COOKIE_SECURE,
    production,
  );
  if (production && sameSite === 'none' && !secure) {
    errors.push(
      'COOKIE_SECURE must be true when COOKIE_SAME_SITE=none in production.',
    );
  }

  if (errors.length > 0) {
    throw new Error(
      `API environment validation failed:\n- ${errors.join('\n- ')}`,
    );
  }

  return {
    production,
    warnings,
    apiBaseUrl: getApiBaseUrl(env),
    apiOrigin: env.API_ORIGIN || getAppOrigin('api', env),
    corsOrigins,
  };
}

export function buildCorsOptions(env: NodeJS.ProcessEnv): CorsOptions {
  const configuredOrigins = getAllowedCorsOrigins(env);
  const allowedOrigins = new Set(configuredOrigins);
  const allowCredentials = parseBoolean(env.CORS_ALLOW_CREDENTIALS, true);

  return {
    origin(origin, callback) {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      if (matchesWildcardOrigin(origin, configuredOrigins)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS.`), false);
    },
    credentials: allowCredentials,
    methods:
      env.CORS_ALLOWED_METHODS || 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders:
      env.CORS_ALLOWED_HEADERS ||
      'Authorization,Content-Type,X-DijiPeople-App,X-DijiPeople-Client,X-Client-Id,X-Tenant-Slug,X-Requested-With,X-Trace-Id,X-Request-Id',
  };
}

function matchesWildcardOrigin(origin: string, configuredOrigins: string[]) {
  return configuredOrigins.some((allowedOrigin) => {
    if (!allowedOrigin.includes('*.')) {
      return false;
    }

    try {
      const originUrl = new URL(origin);
      const allowedUrl = new URL(allowedOrigin.replace('*.', 'wildcard.'));
      const suffix = allowedUrl.hostname.replace(/^wildcard\./, '.');

      return (
        originUrl.protocol === allowedUrl.protocol &&
        originUrl.hostname.endsWith(suffix)
      );
    } catch {
      return false;
    }
  });
}

export function getRuntimeHealthPayload(env: NodeJS.ProcessEnv) {
  return {
    app: 'dijipeople-api',
    status: 'ok',
    environment: env.NODE_ENV || 'development',
    version: env.npm_package_version || '0.0.1',
    apiBaseUrl: getApiBaseUrl(env),
    timestamp: new Date().toISOString(),
  };
}

function hasValue(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidHttpUrl(value: unknown) {
  if (!hasValue(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isProductionLike(env: NodeJS.ProcessEnv) {
  return ['production', 'staging'].includes(
    String(env.NODE_ENV || env.APP_ENV || '').toLowerCase(),
  );
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}
