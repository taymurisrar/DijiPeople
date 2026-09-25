import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRuntimeHealthPayload } from '../../config/env.validation';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';

export type HealthStatus = 'OK' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';

export type HealthComponent = {
  status: HealthStatus;
  reason: string;
  drillDownHref: string | null;
  /**
   * False only for a component whose UNKNOWN reflects a known architectural
   * absence (no queue is deployed) rather than an inconclusive check. Such a
   * component still reports UNKNOWN honestly but must not, on its own, turn an
   * otherwise-healthy platform's overall reading amber every time this
   * endpoint is polled.
   */
  votesOnOverallStatus?: boolean;
  [key: string]: unknown;
};

const PROBE_TIMEOUT_MS = 3_000;
const DB_DEGRADED_LATENCY_MS = 500;
/** BUG-1754's numbers, reused as the "worth a look" line for the outbox. */
const OUTBOX_PENDING_DEGRADED_THRESHOLD = 200;
const OUTBOX_OLDEST_PENDING_DEGRADED_MINUTES = 15;
const AUTH_FAILED_LOGIN_SPIKE_MULTIPLIER = 3;
const AUTH_FAILED_LOGIN_MIN_FOR_SPIKE = 10;
const AUTH_LOCKOUT_DEGRADED_THRESHOLD = 5;

/**
 * TASK-0032 WP-06. Answers, in one call, the question every incident starts
 * with: is the platform healthy, and which of its dependencies is not.
 *
 * Every field is a real query against the same tables the rest of monitoring
 * already reads (`ErrorLog`'s sibling tables, `OutboxEvent`, `AuditLog`,
 * `EmailDeliveryLog`, `User.lockedUntil`) or a real reachability probe
 * (`StorageService.checkReadiness()`, `SELECT 1`). Where no real signal exists
 * — there is no deployed async notification queue, only a synchronous
 * fallback — the component reports `UNKNOWN` with the reason stated, never a
 * fabricated `OK`. Every probe is time-boxed; a probe that does not answer
 * within `PROBE_TIMEOUT_MS` reports `UNKNOWN`, not `DOWN` — a timeout means the
 * check was inconclusive, not that the dependency is confirmed unreachable.
 */
@Injectable()
export class PlatformHealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly storage: StorageService,
  ) {}

  async getHealth() {
    const [
      database,
      backgroundProcessing,
      notificationQueue,
      authentication,
      storage,
      email,
    ] = await Promise.all([
      this.checkDatabase(),
      this.checkBackgroundProcessing(),
      this.checkNotificationQueue(),
      this.checkAuthentication(),
      this.checkStorage(),
      this.checkEmail(),
    ]);

    const components = {
      api: this.checkApi(),
      database,
      backgroundProcessing,
      notificationQueue,
      authentication,
      storage,
      email,
    };

    return {
      status: overallStatus(Object.values(components)),
      timestamp: new Date().toISOString(),
      components,
    };
  }

  private checkApi(): HealthComponent {
    const payload = getRuntimeHealthPayload(process.env);
    return {
      status: 'OK',
      reason: 'Process is responding.',
      version: payload.version,
      commit: payload.commit,
      commitShort: payload.commitShort,
      environment: payload.environment,
      drillDownHref: null,
    };
  }

  private async checkDatabase(): Promise<HealthComponent> {
    const startedAt = Date.now();
    try {
      await withTimeout(
        this.prisma.$queryRaw`SELECT 1`,
        PROBE_TIMEOUT_MS,
      );
      const latencyMs = Date.now() - startedAt;
      if (latencyMs >= DB_DEGRADED_LATENCY_MS) {
        return {
          status: 'DEGRADED',
          reason: `Query answered slowly (${latencyMs}ms).`,
          latencyMs,
          drillDownHref: null,
        };
      }
      return {
        status: 'OK',
        reason: 'SELECT 1 answered.',
        latencyMs,
        drillDownHref: null,
      };
    } catch (error) {
      if (isTimeout(error)) {
        return {
          status: 'UNKNOWN',
          reason: `Database check timed out after ${PROBE_TIMEOUT_MS}ms.`,
          latencyMs: null,
          drillDownHref: null,
        };
      }
      return {
        status: 'DOWN',
        reason: describeError(error, 'Database is unreachable.'),
        latencyMs: null,
        drillDownHref: null,
      };
    }
  }

  private async checkBackgroundProcessing(): Promise<HealthComponent> {
    const windowStart = new Date(Date.now() - 60 * 60 * 1000);
    try {
      const [pendingCount, oldestPending, failedCountWindow] =
        await withTimeout(
          Promise.all([
            this.prisma.outboxEvent.count({
              where: { status: { in: ['PENDING', 'RETRY_SCHEDULED'] } },
            }),
            this.prisma.outboxEvent.findFirst({
              where: { status: { in: ['PENDING', 'RETRY_SCHEDULED'] } },
              orderBy: { availableAt: 'asc' },
              select: { availableAt: true },
            }),
            this.prisma.outboxEvent.count({
              where: { status: 'FAILED', updatedAt: { gte: windowStart } },
            }),
          ]),
          PROBE_TIMEOUT_MS,
        );

      const oldestPendingAgeSeconds = oldestPending
        ? Math.round((Date.now() - oldestPending.availableAt.getTime()) / 1000)
        : 0;
      const oldestPendingMinutes = oldestPendingAgeSeconds / 60;

      const degraded =
        pendingCount >= OUTBOX_PENDING_DEGRADED_THRESHOLD ||
        oldestPendingMinutes >= OUTBOX_OLDEST_PENDING_DEGRADED_MINUTES ||
        failedCountWindow > 0;

      return {
        status: degraded ? 'DEGRADED' : 'OK',
        reason: degraded
          ? `${pendingCount} pending, oldest ${Math.round(oldestPendingMinutes)}m, ${failedCountWindow} failed in the last hour.`
          : 'Outbox is draining normally.',
        pendingCount,
        oldestPendingAgeSeconds,
        failedCountWindow,
        windowHours: 1,
        drillDownHref: '/settings/monitoring/events',
      };
    } catch (error) {
      if (isTimeout(error)) {
        return {
          status: 'UNKNOWN',
          reason: `Outbox check timed out after ${PROBE_TIMEOUT_MS}ms.`,
          drillDownHref: '/settings/monitoring/events',
        };
      }
      return {
        status: 'DOWN',
        reason: describeError(error, 'Could not query the outbox.'),
        drillDownHref: '/settings/monitoring/events',
      };
    }
  }

  /*
   * There is no deployed async notification queue — `NotificationQueueService`
   * (notifications module) confirms `BullMQ`/Redis are not wired and every
   * send executes synchronously in the request or job that triggered it. That
   * is a real, intentional architecture (see its own comment), not a
   * monitoring gap, but it does mean there is no backlog depth to measure —
   * reporting `OK` would assert a queue is healthy when none exists, and
   * `DOWN` would assert a dependency is broken when none is deployed. `UNKNOWN`
   * is the honest answer. Read directly from config rather than importing
   * `NotificationsModule` (a large module graph) for two flags.
   */
  private checkNotificationQueue(): HealthComponent {
    const enabled =
      this.configService.get<string>('NOTIFICATIONS_QUEUE_ENABLED') ===
      'true';
    const redisConfigured = Boolean(
      this.configService.get<string>('REDIS_HOST'),
    );
    return {
      status: 'UNKNOWN',
      votesOnOverallStatus: false,
      reason: enabled
        ? 'A queue backend is requested but not wired; notifications execute synchronously (sync fallback).'
        : 'No async notification queue is deployed; notifications execute synchronously in the triggering request or job.',
      enabled,
      redisConfigured,
      drillDownHref: '/settings/monitoring/integrations',
    };
  }

  private async checkAuthentication(): Promise<HealthComponent> {
    const now = Date.now();
    const lastHourStart = new Date(now - 60 * 60 * 1000);
    const previousHourStart = new Date(now - 2 * 60 * 60 * 1000);
    try {
      const [failedLastHour, failedPreviousHour, lockedAccounts] =
        await withTimeout(
          Promise.all([
            this.prisma.auditLog.count({
              where: {
                action: 'AUTH_LOGIN_FAILED',
                createdAt: { gte: lastHourStart },
              },
            }),
            this.prisma.auditLog.count({
              where: {
                action: 'AUTH_LOGIN_FAILED',
                createdAt: { gte: previousHourStart, lt: lastHourStart },
              },
            }),
            this.prisma.user.count({
              where: { lockedUntil: { gt: new Date() } },
            }),
          ]),
          PROBE_TIMEOUT_MS,
        );

      const spike =
        failedLastHour >= AUTH_FAILED_LOGIN_MIN_FOR_SPIKE &&
        failedLastHour >=
          failedPreviousHour * AUTH_FAILED_LOGIN_SPIKE_MULTIPLIER;
      const manyLockouts = lockedAccounts >= AUTH_LOCKOUT_DEGRADED_THRESHOLD;
      const degraded = spike || manyLockouts;

      return {
        status: degraded ? 'DEGRADED' : 'OK',
        reason: degraded
          ? `${failedLastHour} failed sign-ins in the last hour (baseline ${failedPreviousHour}), ${lockedAccounts} accounts currently locked.`
          : `${failedLastHour} failed sign-ins in the last hour, ${lockedAccounts} accounts currently locked.`,
        failedLoginsLastHour: failedLastHour,
        failedLoginsBaselineHour: failedPreviousHour,
        lockedAccounts,
        drillDownHref:
          '/settings/monitoring/error-logs?category=AUTH_TOKEN_INVALID',
      };
    } catch (error) {
      if (isTimeout(error)) {
        return {
          status: 'UNKNOWN',
          reason: `Authentication check timed out after ${PROBE_TIMEOUT_MS}ms.`,
          drillDownHref: null,
        };
      }
      return {
        status: 'DOWN',
        reason: describeError(error, 'Could not read sign-in audit data.'),
        drillDownHref: null,
      };
    }
  }

  private async checkStorage(): Promise<HealthComponent> {
    try {
      const readiness = await withTimeout(
        this.storage.checkReadiness(),
        PROBE_TIMEOUT_MS,
      );
      return {
        status: readiness.ready ? 'OK' : 'DOWN',
        reason: readiness.detail,
        provider: readiness.provider,
        durable: readiness.provider !== 'local',
        latencyMs: readiness.latencyMs,
        drillDownHref: '/settings/monitoring/integrations',
      };
    } catch (error) {
      if (isTimeout(error)) {
        return {
          status: 'UNKNOWN',
          reason: `Storage check timed out after ${PROBE_TIMEOUT_MS}ms.`,
          drillDownHref: '/settings/monitoring/integrations',
        };
      }
      return {
        status: 'DOWN',
        reason: describeError(error, 'Storage readiness check failed.'),
        drillDownHref: '/settings/monitoring/integrations',
      };
    }
  }

  private async checkEmail(): Promise<HealthComponent> {
    const windowStart = new Date(Date.now() - 60 * 60 * 1000);
    try {
      const [lastDelivery, failedCountWindow, enabledProviderCount] =
        await withTimeout(
          Promise.all([
            this.prisma.emailDeliveryLog.findFirst({
              orderBy: { requestedAt: 'desc' },
              select: { status: true, requestedAt: true },
            }),
            this.prisma.emailDeliveryLog.count({
              where: { status: 'FAILED', requestedAt: { gte: windowStart } },
            }),
            this.prisma.emailProviderSetting.count({
              where: { enabled: true },
            }),
          ]),
          PROBE_TIMEOUT_MS,
        );

      const providerConfigured =
        enabledProviderCount > 0 ||
        Boolean(this.configService.get<string>('EMAIL_PROVIDER'));

      if (!lastDelivery) {
        return {
          status: 'UNKNOWN',
          reason: 'No email has been sent yet; nothing to assess.',
          providerConfigured,
          drillDownHref: '/settings/monitoring/integrations',
        };
      }

      const degraded = !providerConfigured || failedCountWindow > 0;

      return {
        status: degraded ? 'DEGRADED' : 'OK',
        reason: degraded
          ? `${failedCountWindow} failed sends in the last hour${providerConfigured ? '' : '; no provider is configured'}.`
          : 'Last send succeeded and a provider is configured.',
        providerConfigured,
        lastSendStatus: lastDelivery.status,
        lastSendAt: lastDelivery.requestedAt.toISOString(),
        failedCountWindow,
        drillDownHref: '/settings/monitoring/integrations',
      };
    } catch (error) {
      if (isTimeout(error)) {
        return {
          status: 'UNKNOWN',
          reason: `Email check timed out after ${PROBE_TIMEOUT_MS}ms.`,
          drillDownHref: '/settings/monitoring/integrations',
        };
      }
      return {
        status: 'DOWN',
        reason: describeError(error, 'Could not read email delivery data.'),
        drillDownHref: '/settings/monitoring/integrations',
      };
    }
  }
}

class ProbeTimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new ProbeTimeoutError(`Timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function isTimeout(error: unknown) {
  return error instanceof ProbeTimeoutError;
}

function describeError(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/*
 * `notificationQueue` reports UNKNOWN unconditionally (see
 * checkNotificationQueue) — an intentional architecture, not a monitoring gap
 * — so it is excluded from the vote via `votesOnOverallStatus: false`. Every
 * other UNKNOWN (a timed-out probe, or "no email sent yet") is a real "we
 * could not confirm this is fine" and demotes the overall reading, but only
 * to UNKNOWN itself, not to DEGRADED: an inconclusive check is not evidence of
 * a problem.
 */
function overallStatus(components: HealthComponent[]): HealthStatus {
  if (components.some((component) => component.status === 'DOWN'))
    return 'DOWN';
  if (components.some((component) => component.status === 'DEGRADED'))
    return 'DEGRADED';
  if (
    components.some(
      (component) =>
        component.status === 'UNKNOWN' &&
        component.votesOnOverallStatus !== false,
    )
  )
    return 'UNKNOWN';
  return 'OK';
}
