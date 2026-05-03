import { ConfigService } from '@nestjs/config';

export const AUTH_CONFIG_DEFAULTS = {
  accessSecret: 'dijipeople-access-secret-dev',
  refreshSecret: 'dijipeople-refresh-secret-dev',
  accessTtl: '15m',
  refreshTtl: '7d',
  agentAccessTtl: '15m',
  agentRefreshTtl: '7d',
} as const;

export function getAccessTokenSecret(configService: ConfigService) {
  return (
    configService.get<string>('JWT_ACCESS_SECRET') ??
    AUTH_CONFIG_DEFAULTS.accessSecret
  );
}

export function getRefreshTokenSecret(configService: ConfigService) {
  return (
    configService.get<string>('JWT_REFRESH_SECRET') ??
    AUTH_CONFIG_DEFAULTS.refreshSecret
  );
}

export function getAccessTokenTtl(configService: ConfigService) {
  return (
    configService.get<string>('JWT_ACCESS_TTL') ??
    AUTH_CONFIG_DEFAULTS.accessTtl
  );
}

export function getRefreshTokenTtl(configService: ConfigService) {
  return (
    configService.get<string>('JWT_REFRESH_TTL') ??
    AUTH_CONFIG_DEFAULTS.refreshTtl
  );
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
  const match = normalized.match(/^(\d+)(ms|s|m|h|d)$/i);

  if (!match) {
    throw new Error(
      `Unsupported token duration "${value}". Use values like 15m, 12h, or 7d.`,
    );
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const multiplierByUnit: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return amount * multiplierByUnit[unit];
}
