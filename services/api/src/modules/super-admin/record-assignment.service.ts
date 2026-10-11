import { Injectable, Logger } from '@nestjs/common';
import {
  PlatformUserStatus,
  Prisma,
  RecordAssignmentStrategy,
} from '@prisma/client';
import type { RecordAssignmentRule } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  ASSIGNMENT_CONDITION_FIELDS,
  isAssignmentModuleKey,
} from './record-assignment.constants';
import type { AssignmentModuleKey } from './record-assignment.constants';

type Db = Prisma.TransactionClient | PrismaService;

export type RecordAssignmentResult = {
  userId?: string;
  /** Only set by TEAM_ROUND_ROBIN rules; support cases keep a team as well as an owner. */
  teamId?: string;
  ruleId: string;
};

export type AssignmentOptions = {
  /** Evaluate and report without advancing any cursor or counter. */
  dryRun?: boolean;
};

/**
 * Picks an owner for a record that is being created without one (WS07).
 *
 * Three promises shape everything below.
 *
 * 1. It never blocks creation. A broken rule, an empty team or a database
 *    hiccup returns `null` and the record is created unowned, exactly as it was
 *    before this existed. Being unassigned is recoverable; a lost lead or
 *    support case is not.
 * 2. It never overwrites a deliberate owner. Callers invoke it only when the
 *    record arrived with no owner, and it applies to NEW records only; there
 *    is intentionally no backfill of existing ones (owner decision).
 * 3. Round robin is race-safe. The cursor is advanced with an atomic
 *    `increment` and the pick derives from the value that update returned, so
 *    two concurrent creations hold different cursor values and so different
 *    positions. A read-then-write of the cursor would hand both the same user.
 */
@Injectable()
export class RecordAssignmentService {
  private readonly logger = new Logger(RecordAssignmentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async assignOnCreate(
    moduleKey: string,
    record: Record<string, unknown>,
    tx: Db = this.prisma,
    options: AssignmentOptions = {},
  ): Promise<RecordAssignmentResult | null> {
    if (!isAssignmentModuleKey(moduleKey)) return null;
    try {
      const rules = await tx.recordAssignmentRule.findMany({
        where: { moduleKey, isActive: true },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      });
      for (const rule of rules) {
        if (!this.matches(moduleKey, rule.conditions, record)) continue;
        const result = await this.tryRule(rule, tx, options.dryRun === true);
        if (result) return result;
        // A matching rule that cannot assign falls through to the next one:
        // a lower-priority catch-all is exactly the fallback an administrator
        // writes for the day the preferred owner is on leave.
      }
      return null;
    } catch (error) {
      this.logger.error(
        `Auto-assignment failed for ${moduleKey}; creating the record unowned: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /**
   * Audit row for an assignment the engine made. Separate from
   * `assignOnCreate` because the record's id does not exist until it is
   * created; callers invoke it right after, inside the same transaction.
   */
  async recordAssigned(
    moduleKey: string,
    entityId: string,
    result: RecordAssignmentResult,
    tx: Db = this.prisma,
  ): Promise<void> {
    try {
      await this.audit.log(
        {
          tenantId: 'platform',
          actorUserId: null,
          action: 'PLATFORM_RECORD_AUTO_ASSIGNED',
          sourceModule: 'super-admin',
          entityType: `AssignmentRule:${moduleKey}`,
          entityId,
          afterSnapshot: {
            ruleId: result.ruleId,
            userId: result.userId ?? null,
            teamId: result.teamId ?? null,
          },
        },
        tx as Prisma.TransactionClient,
      );
    } catch (error) {
      this.logger.warn(
        `Could not audit auto-assignment of ${moduleKey} ${entityId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /** Dry run for the "Test rule" panel: first match and its pick, no side effects. */
  async test(moduleKey: string, record: Record<string, unknown>) {
    if (!isAssignmentModuleKey(moduleKey)) return { matched: false };
    const result = await this.assignOnCreate(moduleKey, record, this.prisma, {
      dryRun: true,
    });
    if (!result) return { matched: false };
    const [rule, user] = await Promise.all([
      this.prisma.recordAssignmentRule.findUnique({
        where: { id: result.ruleId },
        select: { id: true, name: true, strategy: true, priority: true },
      }),
      result.userId
        ? this.prisma.platformUser.findUnique({
            where: { id: result.userId },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : Promise.resolve(null),
    ]);
    return {
      matched: true,
      rule,
      userId: result.userId ?? null,
      teamId: result.teamId ?? null,
      user: user
        ? { ...user, fullName: `${user.firstName} ${user.lastName}`.trim() }
        : null,
    };
  }

  private matches(
    moduleKey: AssignmentModuleKey,
    conditions: Prisma.JsonValue,
    record: Record<string, unknown>,
  ): boolean {
    if (
      !conditions ||
      typeof conditions !== 'object' ||
      Array.isArray(conditions)
    ) {
      return true;
    }
    const allowed = ASSIGNMENT_CONDITION_FIELDS[moduleKey];
    for (const [field, expected] of Object.entries(conditions)) {
      // An unknown key can never be satisfied: failing closed beats a rule
      // that quietly widens to match everything.
      if (!allowed.includes(field)) return false;
      const actual = record[field];
      if (actual === undefined || actual === null) return false;
      if (normalise(actual) !== normalise(expected)) return false;
    }
    return true;
  }

  private async tryRule(
    rule: RecordAssignmentRule,
    tx: Db,
    dryRun: boolean,
  ): Promise<RecordAssignmentResult | null> {
    switch (rule.strategy) {
      case RecordAssignmentStrategy.SPECIFIC_USER: {
        const user = rule.targetUserId
          ? await tx.platformUser.findFirst({
              where: {
                id: rule.targetUserId,
                status: PlatformUserStatus.ACTIVE,
              },
              select: { id: true },
            })
          : null;
        if (!user) {
          await this.recordFailure(
            rule,
            'The target user is not active.',
            tx,
            dryRun,
          );
          return null;
        }
        if (!dryRun) {
          await tx.recordAssignmentRule.update({
            where: { id: rule.id },
            data: {
              matchCount: { increment: 1 },
              lastAssignedAt: new Date(),
              lastAssignedUserId: user.id,
            },
          });
        }
        return { userId: user.id, ruleId: rule.id };
      }
      case RecordAssignmentStrategy.TEAM_ROUND_ROBIN: {
        const eligible = await this.teamAssignees(rule.targetTeamId, tx);
        if (eligible.length === 0) {
          await this.recordFailure(
            rule,
            'The target team has no active members who receive assignments.',
            tx,
            dryRun,
          );
          return null;
        }
        const userId = await this.roundRobin(rule, eligible, tx, dryRun);
        return {
          userId,
          teamId: rule.targetTeamId ?? undefined,
          ruleId: rule.id,
        };
      }
      case RecordAssignmentStrategy.USER_ROUND_ROBIN: {
        const active = await tx.platformUser.findMany({
          where: {
            id: { in: rule.candidateUserIds },
            status: PlatformUserStatus.ACTIVE,
          },
          select: { id: true },
        });
        const activeIds = new Set(active.map((user) => user.id));
        // The administrator's candidate order is the rotation order.
        const eligible = rule.candidateUserIds.filter((id) =>
          activeIds.has(id),
        );
        if (eligible.length === 0) {
          await this.recordFailure(
            rule,
            'None of the candidate users is active.',
            tx,
            dryRun,
          );
          return null;
        }
        const userId = await this.roundRobin(rule, eligible, tx, dryRun);
        return { userId, ruleId: rule.id };
      }
      default:
        return null;
    }
  }

  private async roundRobin(
    rule: RecordAssignmentRule,
    eligible: string[],
    tx: Db,
    dryRun: boolean,
  ): Promise<string> {
    if (dryRun) {
      // The user the NEXT real creation would get; nothing is advanced.
      return eligible[rule.roundRobinCursor % eligible.length];
    }
    // Atomic increment first: the returned cursor is this caller's private
    // position, which is what makes concurrent picks distinct.
    const advanced = await tx.recordAssignmentRule.update({
      where: { id: rule.id },
      data: {
        roundRobinCursor: { increment: 1 },
        matchCount: { increment: 1 },
      },
      select: { roundRobinCursor: true },
    });
    const userId = eligible[(advanced.roundRobinCursor - 1) % eligible.length];
    // Same row, same transaction: the row lock taken above is still held, so
    // this second write cannot interleave with another caller's.
    await tx.recordAssignmentRule.update({
      where: { id: rule.id },
      data: { lastAssignedAt: new Date(), lastAssignedUserId: userId },
    });
    return userId;
  }

  /**
   * Members of a team who may be picked: they receive assignments and their
   * platform account is ACTIVE. Ordered by when they joined so the rotation is
   * stable between calls.
   */
  private async teamAssignees(
    teamId: string | null,
    tx: Db,
  ): Promise<string[]> {
    if (!teamId) return [];
    const team = await tx.platformTeam.findUnique({
      where: { id: teamId },
      select: { isActive: true, archivedAt: true },
    });
    if (!team || !team.isActive || team.archivedAt) return [];
    const members = await tx.platformTeamMember.findMany({
      where: {
        teamId,
        receivesAssignments: true,
        platformUser: { status: PlatformUserStatus.ACTIVE },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { platformUserId: true },
    });
    return members.map((member) => member.platformUserId);
  }

  private async recordFailure(
    rule: RecordAssignmentRule,
    reason: string,
    tx: Db,
    dryRun: boolean,
  ) {
    if (dryRun) return;
    await tx.recordAssignmentRule.update({
      where: { id: rule.id },
      data: { lastFailureAt: new Date(), lastFailureReason: reason },
    });
  }
}

function normalise(value: unknown): string {
  return String(value).trim().toLowerCase();
}
