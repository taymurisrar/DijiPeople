import { ConfigService } from '@nestjs/config';
import type { CookieOptions } from 'express';

export const AUTH_CLIENT_IDS = {
  WEB: 'web',
  ADMIN: 'admin',
  AGENT_DESKTOP: 'agent-desktop',
} as const;

export type AuthClientId =
  (typeof AUTH_CLIENT_IDS)[keyof typeof AUTH_CLIENT_IDS];

export const AUTH_CONFIG_DEFAULTS = {
  accessSecret: 'dijipeople-access-secret-dev',
  refreshSecret: 'dijipeople-refresh-secret-dev',
  accessTtl: '15m',
  refreshTtl: '1h',
  idleTimeout: '1h',
  absoluteTimeout: '8h',
  activityThrottle: '60s',
  agentAccessTtl: '15m',
  agentRefreshTtl: '8h',
  agentIdleTimeout: '8h',
  agentAbsoluteTimeout: '30d',
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

export function getClientAccessTokenSecret(
  configService: ConfigService,
  clientId: AuthClientId,
) {
  const key = `${getPublicClientEnvPrefix(clientId)}_JWT_ACCESS_SECRET`;
  const value = configService.get<string>(key);

  if (value?.trim()) {
    return value.trim();
  }

  return getAccessTokenSecret(configService);
}

export function getClientRefreshTokenSecret(
  configService: ConfigService,
  clientId: AuthClientId,
) {
  const key = `${getPublicClientEnvPrefix(clientId)}_JWT_REFRESH_SECRET`;
  const value = configService.get<string>(key);

  if (value?.trim()) {
    return value.trim();
  }

  return getRefreshTokenSecret(configService);
}

export function getAccessTokenTtl(configService: ConfigService) {
  return (
    configService.get<string>('AUTH_ACCESS_TOKEN_TTL_SECONDS') ??
    configService.get<string>('AUTH_ACCESS_TOKEN_TTL') ??
    configService.get<string>('JWT_ACCESS_TOKEN_TTL') ??
    configService.get<string>('JWT_ACCESS_TTL') ??
    AUTH_CONFIG_DEFAULTS.accessTtl
  );
}

export function getRefreshTokenTtl(configService: ConfigService) {
  return (
    configService.get<string>('AUTH_REFRESH_TOKEN_TTL_SECONDS') ??
    configService.get<string>('AUTH_REFRESH_TOKEN_TTL') ??
    configService.get<string>('JWT_REFRESH_TOKEN_TTL') ??
    configService.get<string>('JWT_REFRESH_TTL') ??
    AUTH_CONFIG_DEFAULTS.refreshTtl
  );
}

export function getSessionIdleTimeoutMs(configService: ConfigService) {
  return getDurationConfigMs(
    configService,
    'AUTH_IDLE_SESSION_TIMEOUT_SECONDS',
    configService.get<string>('SESSION_IDLE_TIMEOUT_SECONDS') ??
      AUTH_CONFIG_DEFAULTS.idleTimeout,
  );
}

export function getSessionAbsoluteTimeoutMs(configService: ConfigService) {
  return getDurationConfigMs(
    configService,
    'AUTH_ABSOLUTE_SESSION_TIMEOUT_SECONDS',
    configService.get<string>('SESSION_ABSOLUTE_TIMEOUT_SECONDS') ??
      AUTH_CONFIG_DEFAULTS.absoluteTimeout,
  );
}

export function getSessionActivityThrottleMs(configService: ConfigService) {
  return getDurationConfigMs(
    configService,
    'AUTH_SESSION_ACTIVITY_THROTTLE_SECONDS',
    configService.get<string>('SESSION_ACTIVITY_THROTTLE_SECONDS') ??
      AUTH_CONFIG_DEFAULTS.activityThrottle,
  );
}

export function getAgentAccessTokenTtl(configService: ConfigService) {
  return (
    configService.get<string>('AUTH_AGENT_ACCESS_TOKEN_TTL_SECONDS') ??
    configService.get<string>('AGENT_ACCESS_TOKEN_TTL') ??
    AUTH_CONFIG_DEFAULTS.agentAccessTtl
  );
}

export function getAgentRefreshTokenTtl(configService: ConfigService) {
  return (
    configService.get<string>('AUTH_AGENT_REFRESH_TOKEN_TTL_SECONDS') ??
    configService.get<string>('AGENT_REFRESH_TOKEN_TTL') ??
    AUTH_CONFIG_DEFAULTS.agentRefreshTtl
  );
}

export function getAgentSessionIdleTimeoutMs(configService: ConfigService) {
  return getDurationConfigMs(
    configService,
    'AUTH_AGENT_IDLE_SESSION_TIMEOUT_SECONDS',
    configService.get<string>('AGENT_IDLE_SESSION_TIMEOUT_SECONDS') ??
      AUTH_CONFIG_DEFAULTS.agentIdleTimeout,
  );
}

export function getAgentSessionAbsoluteTimeoutMs(configService: ConfigService) {
  return getDurationConfigMs(
    configService,
    'AUTH_AGENT_ABSOLUTE_SESSION_TIMEOUT_SECONDS',
    configService.get<string>('AGENT_ABSOLUTE_SESSION_TIMEOUT_SECONDS') ??
      AUTH_CONFIG_DEFAULTS.agentAbsoluteTimeout,
  );
}

export function getClientAccessTokenTtl(
  configService: ConfigService,
  clientId: AuthClientId,
) {
  if (clientId === AUTH_CLIENT_IDS.AGENT_DESKTOP) {
    return getAgentAccessTokenTtl(configService);
  }

  return (
    configService.get<string>(
      `${getClientEnvPrefix(clientId)}_ACCESS_TOKEN_TTL_SECONDS`,
    ) ??
    configService.get<string>(
      `${getPublicClientEnvPrefix(clientId)}_JWT_ACCESS_TTL`,
    ) ??
    getAccessTokenTtl(configService)
  );
}

export function getClientRefreshTokenTtl(
  configService: ConfigService,
  clientId: AuthClientId,
) {
  if (clientId === AUTH_CLIENT_IDS.AGENT_DESKTOP) {
    return getAgentRefreshTokenTtl(configService);
  }

  return (
    configService.get<string>(
      `${getClientEnvPrefix(clientId)}_REFRESH_TOKEN_TTL_SECONDS`,
    ) ??
    configService.get<string>(
      `${getPublicClientEnvPrefix(clientId)}_JWT_REFRESH_TTL`,
    ) ??
    getRefreshTokenTtl(configService)
  );
}

export function getClientIdleTimeoutMs(
  configService: ConfigService,
  clientId: AuthClientId,
) {
  if (clientId === AUTH_CLIENT_IDS.AGENT_DESKTOP) {
    return getAgentSessionIdleTimeoutMs(configService);
  }

  return getDurationConfigMs(
    configService,
    `${getClientEnvPrefix(clientId)}_IDLE_SESSION_TIMEOUT_SECONDS`,
    configService.get<string>('AUTH_IDLE_SESSION_TIMEOUT_SECONDS') ??
      configService.get<string>('SESSION_IDLE_TIMEOUT_SECONDS') ??
      AUTH_CONFIG_DEFAULTS.idleTimeout,
  );
}

export function getClientAbsoluteTimeoutMs(
  configService: ConfigService,
  clientId: AuthClientId,
) {
  if (clientId === AUTH_CLIENT_IDS.AGENT_DESKTOP) {
    return getAgentSessionAbsoluteTimeoutMs(configService);
  }

  return getDurationConfigMs(
    configService,
    `${getClientEnvPrefix(clientId)}_ABSOLUTE_SESSION_TIMEOUT_SECONDS`,
    configService.get<string>('AUTH_ABSOLUTE_SESSION_TIMEOUT_SECONDS') ??
      configService.get<string>('SESSION_ABSOLUTE_TIMEOUT_SECONDS') ??
      AUTH_CONFIG_DEFAULTS.absoluteTimeout,
  );
}

export function isRefreshRotationEnabled(configService: ConfigService) {
  return parseBooleanConfig(
    configService.get<string>('AUTH_REFRESH_ROTATION_ENABLED'),
    true,
  );
}

export function isSlidingSessionEnabled(configService: ConfigService) {
  return configService.get<string>('SESSION_SLIDING_ENABLED') !== 'false';
}

export function normalizeAuthClientId(
  value: string | null | undefined,
  fallback: AuthClientId = AUTH_CLIENT_IDS.WEB,
): AuthClientId {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === AUTH_CLIENT_IDS.WEB ||
    normalized === AUTH_CLIENT_IDS.ADMIN ||
    normalized === AUTH_CLIENT_IDS.AGENT_DESKTOP
  ) {
    return normalized;
  }

  return fallback;
}

export function getAuthClientIdFromHeaders(headers: {
  [key: string]: string | string[] | undefined;
}): AuthClientId {
  const raw =
    readHeader(headers, 'x-dijipeople-app') ??
    readHeader(headers, 'x-dijipeople-client') ??
    readHeader(headers, 'x-client-id');

  return normalizeAuthClientId(raw);
}

export function getAuthCookieNames(
  configService: ConfigService,
  clientId: AuthClientId = AUTH_CLIENT_IDS.WEB,
) {
  const envPrefix = getClientEnvPrefix(clientId);
  const publicEnvPrefix = getPublicClientEnvPrefix(clientId);
  const cookiePrefix = getCookiePrefix(configService, clientId);

  return {
    access:
      configService.get<string>(`${envPrefix}_COOKIE_ACCESS_NAME`) ??
      configService.get<string>(`${publicEnvPrefix}_ACCESS_TOKEN_COOKIE`) ??
      (clientId === AUTH_CLIENT_IDS.WEB
        ? configService.get<string>('ACCESS_TOKEN_COOKIE')
        : undefined) ??
      `${cookiePrefix}_access_token`,
    refresh:
      configService.get<string>(`${envPrefix}_COOKIE_REFRESH_NAME`) ??
      configService.get<string>(`${publicEnvPrefix}_REFRESH_TOKEN_COOKIE`) ??
      (clientId === AUTH_CLIENT_IDS.WEB
        ? configService.get<string>('REFRESH_TOKEN_COOKIE')
        : undefined) ??
      `${cookiePrefix}_refresh_token`,
    session:
      configService.get<string>(`${envPrefix}_COOKIE_SESSION_NAME`) ??
      `${cookiePrefix}_session_id`,
  };
}

export function buildAuthCookieOptions(
  configService: ConfigService,
  maxAgeMs?: number,
  clientId?: AuthClientId,
): CookieOptions {
  const secure = parseBooleanConfig(
    configService.get<string>('AUTH_COOKIE_SECURE') ??
      configService.get<string>('COOKIE_SECURE'),
    isProductionLike(configService),
  );
  const httpOnly = parseBooleanConfig(
    configService.get<string>('AUTH_COOKIE_HTTP_ONLY'),
    true,
  );
  const sameSite =
    normalizeSameSite(
      configService.get<string>('AUTH_COOKIE_SAME_SITE') ??
        configService.get<string>('COOKIE_SAME_SITE'),
    ) ?? (secure ? 'none' : 'lax');
  const domain =
    (clientId
      ? configService.get<string>(
          `${getPublicClientEnvPrefix(clientId)}_COOKIE_DOMAIN`,
        )
      : undefined) ||
    configService.get<string>('AUTH_COOKIE_DOMAIN') ||
    configService.get<string>('COOKIE_DOMAIN') ||
    undefined;
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
    'AUTH_ACCESS_TOKEN_TTL_SECONDS',
    'AUTH_REFRESH_TOKEN_TTL_SECONDS',
    'AUTH_IDLE_SESSION_TIMEOUT_SECONDS',
    'AUTH_ABSOLUTE_SESSION_TIMEOUT_SECONDS',
    'AUTH_SESSION_ACTIVITY_THROTTLE_SECONDS',
    'AUTH_REFRESH_ROTATION_ENABLED',
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
    getAgentAccessTokenTtl(configService),
    getAgentRefreshTokenTtl(configService),
    String(
      configService.get<string>('AUTH_IDLE_SESSION_TIMEOUT_SECONDS') ?? '1h',
    ),
    String(
      configService.get<string>('AUTH_ABSOLUTE_SESSION_TIMEOUT_SECONDS') ??
        '8h',
    ),
    String(
      configService.get<string>('AUTH_SESSION_ACTIVITY_THROTTLE_SECONDS') ??
        '60s',
    ),
    String(
      configService.get<string>('AUTH_AGENT_IDLE_SESSION_TIMEOUT_SECONDS') ??
        '8h',
    ),
    String(
      configService.get<string>(
        'AUTH_AGENT_ABSOLUTE_SESSION_TIMEOUT_SECONDS',
      ) ?? '30d',
    ),
  ].forEach((duration) => parseDurationToMilliseconds(duration));
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

function getClientEnvPrefix(clientId: AuthClientId) {
  if (clientId === AUTH_CLIENT_IDS.ADMIN) return 'AUTH_ADMIN';
  if (clientId === AUTH_CLIENT_IDS.AGENT_DESKTOP) return 'AUTH_AGENT';
  return 'AUTH_WEB';
}

function getPublicClientEnvPrefix(clientId: AuthClientId) {
  if (clientId === AUTH_CLIENT_IDS.ADMIN) return 'ADMIN';
  if (clientId === AUTH_CLIENT_IDS.AGENT_DESKTOP) return 'AGENT';
  return 'WEB';
}

function getCookiePrefix(configService: ConfigService, clientId: AuthClientId) {
  if (clientId === AUTH_CLIENT_IDS.ADMIN) {
    return configService.get<string>('AUTH_ADMIN_COOKIE_PREFIX') ?? 'dp_admin';
  }

  if (clientId === AUTH_CLIENT_IDS.AGENT_DESKTOP) {
    return configService.get<string>('AUTH_AGENT_COOKIE_PREFIX') ?? 'dp_agent';
  }

  return configService.get<string>('AUTH_WEB_COOKIE_PREFIX') ?? 'dp_web';
}

function readHeader(
  headers: { [key: string]: string | string[] | undefined },
  key: string,
) {
  const value = headers[key] ?? headers[key.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
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
