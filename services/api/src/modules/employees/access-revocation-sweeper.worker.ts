import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmployeeEmploymentStatus, UserStatus } from '@prisma/client';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
} from '../../common/constants/audit-actions';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { revokeLinkedUserAccess } from './employee-access-revocation';

const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000;
const MIN_POLL_INTERVAL_MS = 30 * 1000;
const BATCH_SIZE = 200;

/**
 * Ends access for employees whose termination date has arrived — WP-08.S0b,
 * the future-dated half of BUG-4774.
 *
 * Unlike the other sweepers it is ON by default and is switched off only by an
 * explicit `ACCESS_REVOCATION_SWEEPER_ENABLED=false`. It is a security control:
 * a default that silently leaves terminated staff signed in until someone
 * remembers to set a flag is the defect this exists to close. Disabling it is
 * logged on every start.
 *
 * Level-triggered, not event-triggered: each tick selects TERMINATED employees
 * whose date has passed and whose user is still enabled, so a missed tick, a
 * restart or a crash between ticks just means the next tick finds the same work.
 * One employee failing never stops the others.
 */
@Injectable()
export class AccessRevocationSweeperWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(AccessRevocationSweeperWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  onModuleInit(): void {
    if (!this.isEnabled()) {
      this.logger.warn(
        'Access revocation sweeper DISABLED (ACCESS_REVOCATION_SWEEPER_ENABLED=false): future-dated terminations will NOT revoke access.',
      );
      return;
    }
    const interval = this.pollIntervalMs();
    this.timer = setInterval(() => void this.tick(), interval);
    this.timer.unref?.();
    this.logger.log(`Access revocation sweeper started; every ${interval}ms.`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** On unless explicitly set to the string "false". */
  isEnabled(): boolean {
    return (
      this.configService.get<string>('ACCESS_REVOCATION_SWEEPER_ENABLED') !==
      'false'
    );
  }

  private pollIntervalMs(): number {
    const raw = Number(
      this.configService.get<string>(
        'ACCESS_REVOCATION_SWEEPER_POLL_INTERVAL_MS',
      ),
    );
    if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_POLL_INTERVAL_MS;
    return Math.max(MIN_POLL_INTERVAL_MS, Math.trunc(raw));
  }

  /** One sweep. Never throws. */
  async tick(): Promise<{ revoked: number; failed: number }> {
    if (this.running) return { revoked: 0, failed: 0 };
    this.running = true;
    let revoked = 0;
    let failed = 0;
    try {
      const due = await this.prisma.employee.findMany({
        where: {
          employmentStatus: EmployeeEmploymentStatus.TERMINATED,
          terminationDate: { lte: new Date() },
          isDeleted: false,
          userId: { not: null },
          user: { status: { not: UserStatus.DISABLED } },
        },
        select: { id: true, tenantId: true, userId: true },
        orderBy: { terminationDate: 'asc' },
        take: BATCH_SIZE,
      });

      for (const employee of due) {
        try {
          const result = await revokeLinkedUserAccess(this.prisma, {
            tenantId: employee.tenantId,
            userId: employee.userId,
          });
          if (!result.revoked) continue;
          revoked += 1;
          await this.auditService.log({
            tenantId: employee.tenantId,
            actorUserId: null,
            action: AUDIT_ACTIONS.EMPLOYEE_ACCESS_REVOKED,
            entityType: AUDIT_ENTITY_TYPES.EMPLOYEE,
            entityId: employee.id,
            afterSnapshot: {
              source: 'ACCESS_REVOCATION_SWEEPER',
              note: result.note,
            },
          });
        } catch (error) {
          failed += 1;
          this.logger.error(
            `Access revocation failed for employee ${employee.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      if (revoked || failed) {
        this.logger.log(
          `Access revocation sweep: revoked ${revoked}, failed ${failed}.`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Access revocation sweep failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running = false;
    }
    return { revoked, failed };
  }
}
