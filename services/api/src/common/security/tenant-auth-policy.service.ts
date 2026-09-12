import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { parseDurationToMilliseconds } from '../config/auth.config';

/**
 * The effective session policy for a tenant.
 *
 * ITEM-0162 — this used to be computed twice: once by `AuthService` for the
 * login/refresh response, and again, differently, by `JwtAuthGuard` for
 * enforcement. The two read different tenant-setting keys through different
 * code paths and fell back to different hardcoded defaults, so the
 * `idleTimeoutMinutes` a login response advertised and the idle timeout the
 * guard actually enforced could — and in production did — disagree by a
 * factor of sixteen (480 advertised, 30 enforced). One resolver, used by both,
 * removes the possibility of that drift by construction.
 *
 * BUG-3355 — `allowMultipleActiveSessions` used to be resolved by a private
 * method on `AuthService` alone (`allowsMultipleActiveSessions`), reading
 * `setting?.value === true` so an absent row meant "single session only". The
 * owner decided concurrent sessions are the default; an absent row now reads
 * as `true`. It is resolved here, alongside the rest of the policy, because a
 * session policy has one home.
 */
export type TenantAuthPolicy = {
  allowRememberMe: boolean;
  sessionTimeoutMinutes: number;
  refreshTokenExpiryDays: number;
  absoluteSessionLifetimeDays: number;
  idleTimeoutMinutes: number;
  allowMultipleActiveSessions: boolean;
};

const SECURITY_SETTING_KEYS = [
  'allowRememberMe',
  'sessionTimeoutMinutes',
  'refreshTokenExpiryDays',
  'absoluteSessionLifetimeDays',
  'idleTimeoutMinutes',
  'allowMultipleActiveSessions',
] as const;

/*
 * Hardcoded fallbacks, used only when BOTH the tenant has no setting row AND
 * no environment variable is explicitly configured. These match the values
 * this policy has always defaulted to, so a deployment that sets neither a
 * tenant setting nor an env var sees no behavioural change from this refactor.
 */
const HARDCODED_DEFAULTS = {
  sessionTimeoutMinutes: 480,
  refreshTokenExpiryDays: 30,
  absoluteSessionLifetimeDays: 30,
  idleTimeoutMinutes: 480,
} as const;

/*
 * Environment-variable names that, when explicitly set, become the *default*
 * this policy falls back to for a tenant with no setting row — never a value
 * read instead of the tenant setting. Listed in the same precedence order the
 * corresponding `auth.config.ts` getter already uses, so wiring these in here
 * does not introduce a second, disagreeing precedence order (ITEM-0162, "two
 * same-purpose variables with different values").
 */
const SESSION_TIMEOUT_MINUTES_ENV_KEYS = [
  'AUTH_ACCESS_TOKEN_TTL_SECONDS',
  'AUTH_ACCESS_TOKEN_TTL',
  'JWT_ACCESS_TOKEN_TTL_SECONDS',
  'JWT_ACCESS_TOKEN_TTL',
  'JWT_ACCESS_TTL',
];
const REFRESH_TOKEN_EXPIRY_DAYS_ENV_KEYS = [
  'AUTH_REFRESH_TOKEN_TTL_SECONDS',
  'AUTH_REFRESH_TOKEN_TTL',
  'JWT_REFRESH_TOKEN_TTL_SECONDS',
  'JWT_REFRESH_TOKEN_TTL',
  'JWT_REFRESH_TTL',
];
const ABSOLUTE_SESSION_LIFETIME_DAYS_ENV_KEYS = [
  'AUTH_ABSOLUTE_SESSION_TIMEOUT_SECONDS',
  'SESSION_ABSOLUTE_TIMEOUT_SECONDS',
];
const IDLE_TIMEOUT_MINUTES_ENV_KEYS = [
  'AUTH_IDLE_SESSION_TIMEOUT_SECONDS',
  'SESSION_IDLE_TIMEOUT_SECONDS',
];

@Injectable()
export class TenantAuthPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async resolveEffectivePolicy(tenantId: string): Promise<TenantAuthPolicy> {
    const rows = await this.prisma.tenantSetting.findMany({
      where: {
        tenantId,
        category: 'security',
        key: { in: [...SECURITY_SETTING_KEYS] },
      },
      select: { key: true, value: true },
    });
    const values = new Map(rows.map((row) => [row.key, row.value]));

    return {
      allowRememberMe: readBooleanSetting(values.get('allowRememberMe'), true),
      sessionTimeoutMinutes: readNumberSetting(
        values.get('sessionTimeoutMinutes'),
        this.defaultMinutesFromEnv(
          SESSION_TIMEOUT_MINUTES_ENV_KEYS,
          HARDCODED_DEFAULTS.sessionTimeoutMinutes,
        ),
        15,
        1440,
      ),
      refreshTokenExpiryDays: readNumberSetting(
        values.get('refreshTokenExpiryDays'),
        this.defaultDaysFromEnv(
          REFRESH_TOKEN_EXPIRY_DAYS_ENV_KEYS,
          HARDCODED_DEFAULTS.refreshTokenExpiryDays,
        ),
        1,
        365,
      ),
      absoluteSessionLifetimeDays: readNumberSetting(
        values.get('absoluteSessionLifetimeDays'),
        this.defaultDaysFromEnv(
          ABSOLUTE_SESSION_LIFETIME_DAYS_ENV_KEYS,
          HARDCODED_DEFAULTS.absoluteSessionLifetimeDays,
        ),
        1,
        365,
      ),
      idleTimeoutMinutes: readNumberSetting(
        values.get('idleTimeoutMinutes'),
        this.defaultMinutesFromEnv(
          IDLE_TIMEOUT_MINUTES_ENV_KEYS,
          HARDCODED_DEFAULTS.idleTimeoutMinutes,
        ),
        15,
        1440,
      ),
      /*
       * BUG-3355 — absent row means concurrent sessions are ALLOWED. This is a
       * product decision, not a technical default chosen for convenience: see
       * ADR-0009.
       */
      allowMultipleActiveSessions: readBooleanSetting(
        values.get('allowMultipleActiveSessions'),
        true,
      ),
    };
  }

  private defaultMinutesFromEnv(envKeys: string[], fallback: number): number {
    const ms = this.readDurationEnv(envKeys);
    return ms === null ? fallback : Math.max(1, Math.round(ms / 60_000));
  }

  private defaultDaysFromEnv(envKeys: string[], fallback: number): number {
    const ms = this.readDurationEnv(envKeys);
    return ms === null ? fallback : Math.max(1, Math.round(ms / 86_400_000));
  }

  private readDurationEnv(envKeys: string[]): number | null {
    for (const key of envKeys) {
      const raw = this.configService.get<string>(key);
      if (raw?.trim()) {
        try {
          return parseDurationToMilliseconds(raw.trim());
        } catch {
          // An unparseable value is treated as "not set" rather than crashing
          // policy resolution for every request; env validation at boot is
          // what should have caught this.
          continue;
        }
      }
    }
    return null;
  }
}

function readBooleanSetting(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function readNumberSetting(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.min(maximum, Math.max(minimum, Math.trunc(numeric)))
    : fallback;
}
