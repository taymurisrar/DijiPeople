import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantStatus, WorkforceSnapshotDerivation } from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TenantSettingsResolverService } from '../../tenant-settings/tenant-settings-resolver.service';
import { addDays, civilDate } from '../engine/period.engine';
import { WorkforceSnapshotService } from './workforce-snapshot.service';

const DEFAULT_POLL_INTERVAL_MS = 60 * 60 * 1000;
const MIN_POLL_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Tenants whose people are real enough to measure.
 *
 * A tenant mid-provisioning has no employees worth a row, and an archived one
 * has employees nobody will ever chart. Both would still cost a full table scan
 * every hour.
 */
const CAPTURED_TENANT_STATUSES: TenantStatus[] = [
  TenantStatus.ACTIVE,
  TenantStatus.INACTIVE,
  TenantStatus.SUSPENDED,
];

export interface SnapshotSweepResult {
  tenantsConsidered: number;
  captured: number;
  alreadyPresent: number;
  failed: number;
}

/**
 * Captures yesterday, once a day, for every tenant that has people.
 *
 * "Yesterday" is resolved in EACH TENANT'S OWN TIMEZONE, not the server's. A
 * tenant in Asia/Qatar reaches the end of a day nine hours before a tenant in
 * America/Los_Angeles, and a server-local midnight would capture one of them a
 * day early — putting a day's joiners in the wrong bucket for that tenant only,
 * which is the kind of discrepancy that gets blamed on the data rather than the
 * clock. This is the same defect `/reports/attendance-summary` already has, and
 * the reason `period.engine.ts` exists.
 *
 * It polls hourly rather than firing once at a fixed hour, because "the tenant's
 * yesterday" becomes complete at a different UTC instant for every tenant, and
 * because a poll that finds the day already captured costs one indexed lookup.
 * Idempotence, not scheduling precision, is what makes this safe.
 *
 * OFF BY DEFAULT, for the same reason every worker here is: a job that starts
 * itself in every process starts in tests and in `ts-node` seeds too.
 *
 * IT ONLY EVER CAPTURES YESTERDAY. Days missed while the worker was off stay
 * missed, and are filled by `prisma/backfill-workforce-snapshots.ts` as
 * BACKFILLED. Quietly catching up and calling those rows OBSERVED would be a
 * lie about how the data was obtained, and `derivation` is the column that
 * lets a chart shade the reconstructed part of the line.
 */
@Injectable()
export class WorkforceSnapshotWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkforceSnapshotWorker.name);

  private timer: NodeJS.Timeout | null = null;

  private running = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly snapshots: WorkforceSnapshotService,
    private readonly tenantSettings: TenantSettingsResolverService,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) {
      this.logger.log(
        'Workforce snapshot worker disabled (REPORTS_WORKFORCE_SNAPSHOT_ENABLED is not "true"); headcount history is not being recorded.',
      );
      return;
    }

    const interval = this.pollIntervalMs();
    this.timer = setInterval(() => {
      void this.tick();
    }, interval);
    this.timer.unref?.();

    this.logger.log(
      `Workforce snapshot worker started; checking every ${interval}ms.`,
    );
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  isEnabled(): boolean {
    return (
      this.configService.get<string>('REPORTS_WORKFORCE_SNAPSHOT_ENABLED') ===
      'true'
    );
  }

  private pollIntervalMs(): number {
    const raw = Number(
      this.configService.get<string>(
        'REPORTS_WORKFORCE_SNAPSHOT_POLL_INTERVAL_MS',
      ),
    );
    if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_POLL_INTERVAL_MS;
    return Math.max(MIN_POLL_INTERVAL_MS, Math.trunc(raw));
  }

  /** One poll. Never throws; the next one retries. */
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      const result = await this.sweep(new Date());
      if (result.captured > 0 || result.failed > 0) {
        this.logger.log(
          `report.snapshot.sweep tenants=${result.tenantsConsidered} captured=${result.captured} present=${result.alreadyPresent} failed=${result.failed}`,
        );
      }
    } catch (error) {
      this.logger.error(
        `report.snapshot.sweep_failed reason=${describe(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  /** Capture each tenant's yesterday. Exposed for tests and diagnostics. */
  async sweep(now: Date): Promise<SnapshotSweepResult> {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: { in: CAPTURED_TENANT_STATUSES } },
      orderBy: { id: 'asc' },
      select: { id: true, slug: true },
    });

    const result: SnapshotSweepResult = {
      tenantsConsidered: tenants.length,
      captured: 0,
      alreadyPresent: 0,
      failed: 0,
    };

    for (const tenant of tenants) {
      try {
        const timezone = await this.timezone(tenant.id);
        const yesterday = addDays(civilDate(now, timezone), -1);

        if (await this.snapshots.hasSnapshot(tenant.id, yesterday)) {
          result.alreadyPresent += 1;
          continue;
        }

        const captured = await this.snapshots.captureDay({
          tenantId: tenant.id,
          snapshotDate: yesterday,
          derivation: WorkforceSnapshotDerivation.OBSERVED,
        });

        result.captured += 1;
        this.logger.log(
          `report.snapshot.captured tenant=${tenant.slug} date=${yesterday} tz=${timezone} rows=${captured.written} joiners=${captured.joiners} leavers=${captured.leavers} ms=${captured.durationMs}`,
        );
      } catch (error) {
        // One tenant's failure must not stop the others: a single bad settings
        // row would otherwise silently stop recording history for everybody
        // sorted after it.
        result.failed += 1;
        this.logger.error(
          `report.snapshot.tenant_failed tenant=${tenant.id} reason=${describe(error)}`,
        );
      }
    }

    return result;
  }

  /**
   * The tenant's timezone.
   *
   * Falls back to UTC and says so, rather than to the server's zone. A silent
   * server-local fallback is exactly the defect this worker exists to avoid,
   * and it would be invisible on a server that happens to run in UTC anyway —
   * until the day it does not.
   */
  private async timezone(tenantId: string): Promise<string> {
    try {
      const settings =
        await this.tenantSettings.getOrganizationSettings(tenantId);
      return settings.timezone || 'UTC';
    } catch (error) {
      this.logger.warn(
        `report.snapshot.timezone_fallback tenant=${tenantId} reason=${describe(error)}`,
      );
      return 'UTC';
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
