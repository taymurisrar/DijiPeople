import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

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
 * This resolver deliberately does **not** fall back to the `AUTH_*`
 * environment variables ITEM-0162 also measured, even though the record's
 * proposed approach suggested making them the policy's default. Production
 * has all three set (`AUTH_ACCESS_TOKEN_TTL_SECONDS=15m`,
 * `AUTH_IDLE_SESSION_TIMEOUT_SECONDS=30m`,
 * `AUTH_ABSOLUTE_SESSION_TIMEOUT_SECONDS=8h`) to values far shorter than the
 * hardcoded defaults every tenant with no `security` settings row is
 * currently living on (480 minutes, 480 minutes, 30 days respectively).
 * Wiring those variables in as the fallback the moment this ships would force
 * every such tenant's absolute session lifetime from 30 days to 8 hours —
 * full re-authentication, daily, for every user, with no settings change and
 * no announcement. That is a product decision for the account owner, not
 * something to flip silently in a bug-fix batch headed to production. See
 * `docs/environment-variables.md` and `ITEM-0162`'s Resolution for the
 * decision to defer this half.
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
 * Hardcoded fallbacks, used when the tenant has no setting row. Unchanged
 * from what `AuthService`'s own (now-removed) `resolveTenantAuthPolicy` and
 * `JwtAuthGuard`'s own idle-timeout lookup each separately defaulted to
 * before this consolidation, so a tenant that has never configured these
 * values sees no behavioural change from the refactor itself.
 */
const HARDCODED_DEFAULTS = {
  sessionTimeoutMinutes: 480,
  refreshTokenExpiryDays: 30,
  absoluteSessionLifetimeDays: 30,
  idleTimeoutMinutes: 480,
} as const;

@Injectable()
export class TenantAuthPolicyService {
  constructor(
    private readonly prisma: PrismaService,
    // Not read for defaults today — see the class doc comment. Kept as a
    // constructor dependency because every enforcement point already
    // resolves a `ConfigService` and a future, deliberate decision to wire
    // environment defaults back in should not need to touch every call site
    // that constructs this service.
    private readonly configService: ConfigService,
  ) {}

  async resolveEffectivePolicy(tenantId: string): Promise<TenantAuthPolicy> {
    void this.configService;
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
        HARDCODED_DEFAULTS.sessionTimeoutMinutes,
        15,
        1440,
      ),
      refreshTokenExpiryDays: readNumberSetting(
        values.get('refreshTokenExpiryDays'),
        HARDCODED_DEFAULTS.refreshTokenExpiryDays,
        1,
        365,
      ),
      absoluteSessionLifetimeDays: readNumberSetting(
        values.get('absoluteSessionLifetimeDays'),
        HARDCODED_DEFAULTS.absoluteSessionLifetimeDays,
        1,
        365,
      ),
      idleTimeoutMinutes: readNumberSetting(
        values.get('idleTimeoutMinutes'),
        HARDCODED_DEFAULTS.idleTimeoutMinutes,
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
