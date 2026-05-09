import { ConfigService } from '@nestjs/config';
import type { CookieOptions } from 'express';

export const AUTH_CONFIG_DEFAULTS = {
  accessSecret: 'dijipeople-access-secret-dev',
  refreshSecret: 'dijipeople-refresh-secret-dev',
  accessTtl: '15m',
  refreshTtl: '7d',
  idleTimeout: '30m',
  absoluteTimeout: '8h',
  activityThrottle: '60s',
  agentAccessTtl: '15m',
  agentRefreshTtl: '7d',
} as const;

const PRODUCTION_ENVIRONMENTS = new Set(['production', 'staging']);

export function getAccessTokenSecret(configService: ConfigService) {
  return getRequiredOrDevDefault(
    configService,
    'JWT_ACCESS_SECRET',
    AUTH_CONFIG_DEFAULTS.accessSecret,
  );
}

export function getRefreshTokenSecret(configService: ConfigService) {
  return getRequiredOrDevDefault(
    configService,
    'JWT_REFRESH_SECRET',
    AUTH_CONFIG_DEFAULTS.refreshSecret,
  );
}

export function getAccessTokenTtl(configService: ConfigService) {
  return (
    configService.get<string>('JWT_ACCESS_TOKEN_TTL') ??
    configService.get<string>('JWT_ACCESS_TTL') ??
    AUTH_CONFIG_DEFAULTS.accessTtl
  );
}

export function getRefreshTokenTtl(configService: ConfigService) {
  return (
    configService.get<string>('JWT_REFRESH_TOKEN_TTL') ??
    configService.get<string>('JWT_REFRESH_TTL') ??
    AUTH_CONFIG_DEFAULTS.refreshTtl
  );
}

export function getSessionIdleTimeoutMs(configService: ConfigService) {
  return getDurationConfigMs(
    configService,
    'SESSION_IDLE_TIMEOUT_SECONDS',
    AUTH_CONFIG_DEFAULTS.idleTimeout,
  );
}

export function getSessionAbsoluteTimeoutMs(configService: ConfigService) {
  return getDurationConfigMs(
    configService,
    'SESSION_ABSOLUTE_TIMEOUT_SECONDS',
    AUTH_CONFIG_DEFAULTS.absoluteTimeout,
  );
}

export function getSessionActivityThrottleMs(configService: ConfigService) {
  return getDurationConfigMs(
    configService,
    'SESSION_ACTIVITY_THROTTLE_SECONDS',
    AUTH_CONFIG_DEFAULTS.activityThrottle,
  );
}

export function isSlidingSessionEnabled(configService: ConfigService) {
  return configService.get<string>('SESSION_SLIDING_ENABLED') !== 'false';
}

export function getAuthCookieNames(configService: ConfigService) {
  return {
    access:
      configService.get<string>('AUTH_COOKIE_ACCESS_NAME') ?? 'dp_access_token',
    refresh:
      configService.get<string>('AUTH_COOKIE_REFRESH_NAME') ??
      'dp_refresh_token',
    session:
      configService.get<string>('AUTH_COOKIE_SESSION_NAME') ?? 'dp_session_id',
  };
}

export function buildAuthCookieOptions(
  configService: ConfigService,
  maxAgeMs?: number,
): CookieOptions {
  const secure = parseBooleanConfig(
    configService.get<string>('AUTH_COOKIE_SECURE'),
    isProductionLike(configService),
  );
  const httpOnly = parseBooleanConfig(
    configService.get<string>('AUTH_COOKIE_HTTP_ONLY'),
    true,
  );
  const sameSite =
    normalizeSameSite(configService.get<string>('AUTH_COOKIE_SAME_SITE')) ??
    (secure ? 'none' : 'lax');
  const domain = configService.get<string>('AUTH_COOKIE_DOMAIN') || undefined;
  const path = configService.get<string>('AUTH_COOKIE_PATH') || '/';
  const configuredMaxAge = configService.get<string>(
    'AUTH_COOKIE_MAX_AGE_SECONDS',
  );
  const maxAge =
    typeof maxAgeMs === 'number'
      ? maxAgeMs
      : configuredMaxAge
        ? parseDurationToMilliseconds(configuredMaxAge)
        : undefined;

  return {
    httpOnly,
    secure,
    sameSite,
    path,
    domain,
    maxAge,
  };
}

export function assertAuthEnvironment(configService: ConfigService) {
  const requiredInProduction = [
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'JWT_ACCESS_TOKEN_TTL',
    'JWT_REFRESH_TOKEN_TTL',
    'SESSION_IDLE_TIMEOUT_SECONDS',
    'SESSION_ABSOLUTE_TIMEOUT_SECONDS',
    'SESSION_ACTIVITY_THROTTLE_SECONDS',
  ];
  const missing = requiredInProduction.filter((key) => {
    const value = configService.get<string>(key);
    return isProductionLike(configService) && (!value || !value.trim());
  });

  if (missing.length > 0) {
    throw new Error(
      `Missing required auth environment variables: ${missing.join(', ')}`,
    );
  }

  [
    getAccessTokenTtl(configService),
    getRefreshTokenTtl(configService),
    String(configService.get<string>('SESSION_IDLE_TIMEOUT_SECONDS') ?? '30m'),
    String(
      configService.get<string>('SESSION_ABSOLUTE_TIMEOUT_SECONDS') ?? '8h',
    ),
    String(
      configService.get<string>('SESSION_ACTIVITY_THROTTLE_SECONDS') ?? '60s',
    ),
  ].forEach((duration) => parseDurationToMilliseconds(duration));
}

export function getAgentAccessTokenTtl(configService: ConfigService) {
  return (
    configService.get<string>('AGENT_ACCESS_TOKEN_TTL') ??
    AUTH_CONFIG_DEFAULTS.agentAccessTtl
  );
}

export function getAgentRefreshTokenTtl(configService: ConfigService) {
  return (
    configService.get<string>('AGENT_REFRESH_TOKEN_TTL') ??
    AUTH_CONFIG_DEFAULTS.agentRefreshTtl
  );
}

export function parseDurationToMilliseconds(value: string) {
  const normalized = value.trim();
  const match = normalized.match(/^(\d+)(ms|s|m|h|d)?$/i);

  if (!match) {
    throw new Error(
      `Unsupported duration "${value}". Use values like 900, 15m, 12h, or 7d.`,
    );
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = (match[2] ?? 's').toLowerCase();
  const multiplierByUnit: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return amount * multiplierByUnit[unit];
}

function getDurationConfigMs(
  configService: ConfigService,
  key: string,
  fallback: string,
) {
  const value = configService.get<string>(key) ?? fallback;
  return parseDurationToMilliseconds(value);
}

function getRequiredOrDevDefault(
  configService: ConfigService,
  key: string,
  devDefault: string,
) {
  const value = configService.get<string>(key);

  if (value?.trim()) {
    return value.trim();
  }

  if (isProductionLike(configService)) {
    throw new Error(`Missing required auth environment variable: ${key}`);
  }

  return devDefault;
}

function isProductionLike(configService: ConfigService) {
  const appEnv =
    configService.get<string>('APP_ENV') ??
    configService.get<string>('NODE_ENV') ??
    'development';

  return PRODUCTION_ENVIRONMENTS.has(appEnv.toLowerCase());
}

function parseBooleanConfig(value: string | undefined, fallback: boolean) {
  if (!value) {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function normalizeSameSite(value: string | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.toLowerCase();
  if (
    normalized === 'strict' ||
    normalized === 'lax' ||
    normalized === 'none'
  ) {
    return normalized;
  }

  return null;
}
