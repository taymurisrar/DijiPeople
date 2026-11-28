import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmployeeEmploymentStatus, UserStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { revokeAccessIfDue } from './employee-access-revocation';

const DEFAULT_POLL_INTERVAL_MS = 60 * 1000;
const MIN_POLL_INTERVAL_MS = 30 * 1000;
const BATCH_SIZE = 200;
const MAX_PAGES_PER_TICK = 25;

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

  /*
   * Keyset position carried across ticks. Rows the sweeper deliberately leaves
   * (the tenant owner, a user it cannot revoke yet) stay eligible forever; a
   * "take the first N each time" query would fill every batch with them and
   * starve everyone behind. Walking by id and remembering where we stopped means
   * every eligible employee is reached within a bounded number of ticks.
   */
  private cursor: string | null = null;

  /** Page size and pages per tick. Public only so a test can force paging. */
  batchSize = BATCH_SIZE;
  maxPagesPerTick = MAX_PAGES_PER_TICK;

  /** One sweep. Never throws. */
  async tick(): Promise<{ revoked: number; failed: number }> {
    if (this.running) return { revoked: 0, failed: 0 };
    this.running = true;
    let revoked = 0;
    let failed = 0;
    try {
      for (let page = 0; page < this.maxPagesPerTick; page += 1) {
        const due = await this.prisma.employee.findMany({
          where: {
            employmentStatus: EmployeeEmploymentStatus.TERMINATED,
            terminationDate: { lte: new Date() },
            isDeleted: false,
            deletedAt: null,
            userId: { not: null },
            ...(this.cursor ? { id: { gt: this.cursor } } : {}),
            // Not only enabled users: a user who is already DISABLED but still
            // holds a live token (a crash in an older build, a token minted in
            // the race window) is recovered here too.
            user: {
              OR: [
                { status: { not: UserStatus.DISABLED } },
                { refreshTokens: { some: { revokedAt: null } } },
                { agentRefreshTokens: { some: { revokedAt: null } } },
              ],
            },
          },
          select: { id: true, tenantId: true },
          orderBy: { id: 'asc' },
          take: this.batchSize,
        });

        for (const employee of due) {
          try {
            const result = await revokeAccessIfDue(
              this.prisma,
              this.auditService,
              {
                tenantId: employee.tenantId,
                employeeId: employee.id,
              },
            );
            if (result.revoked) revoked += 1;
          } catch (error) {
            failed += 1;
            this.logger.error(
              `Access revocation failed for employee ${employee.id}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }

        if (due.length < this.batchSize) {
          this.cursor = null; // reached the end; start from the top next tick
          break;
        }
        this.cursor = due[due.length - 1].id;
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
