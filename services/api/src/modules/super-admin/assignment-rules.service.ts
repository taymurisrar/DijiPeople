import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PlatformUserStatus,
  Prisma,
  RecordAssignmentStrategy,
} from '@prisma/client';
import type { RecordAssignmentRule } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AuditService } from '../audit/audit.service';
import type {
  CreateAssignmentRuleDto,
  UpdateAssignmentRuleDto,
} from './dto/assignment-rule.dto';
import {
  ASSIGNMENT_CONDITION_FIELDS,
  isAssignmentModuleKey,
} from './record-assignment.constants';

type RuleShape = {
  moduleKey: string;
  strategy: RecordAssignmentStrategy;
  conditions: Record<string, unknown>;
  targetUserId: string | null;
  targetTeamId: string | null;
  candidateUserIds: string[];
};

/**
 * Administration of record assignment rules (WS07). Rules are created
 * disabled and have no default owner: an administrator turns one on
 * deliberately, after reading what it would do in the dry-run panel.
 */
@Injectable()
export class AssignmentRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(moduleKey?: string) {
    const rules = await this.prisma.recordAssignmentRule.findMany({
      where: moduleKey ? { moduleKey } : {},
      orderBy: [
        { moduleKey: 'asc' },
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
      include: this.include(),
    });
    return { items: rules.map((rule) => this.present(rule)) };
  }

  async get(id: string) {
    return this.present(await this.load(id));
  }

  async create(actor: AuthenticatedUser, dto: CreateAssignmentRuleDto) {
    const shape: RuleShape = {
      moduleKey: dto.moduleKey,
      strategy: dto.strategy,
      conditions: dto.conditions ?? {},
      targetUserId: dto.targetUserId ?? null,
      targetTeamId: dto.targetTeamId ?? null,
      candidateUserIds: dto.candidateUserIds ?? [],
    };
    await this.validate(shape);
    const created = await this.prisma.recordAssignmentRule.create({
      data: {
        moduleKey: shape.moduleKey,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        // Explicitly disabled: a new rule must never start re-owning records
        // before somebody has looked at it.
        isActive: false,
        priority: dto.priority ?? 100,
        conditions: shape.conditions as Prisma.InputJsonObject,
        strategy: shape.strategy,
        targetUserId: shape.targetUserId,
        targetTeamId: shape.targetTeamId,
        candidateUserIds: shape.candidateUserIds,
        createdById: actor.userId,
        updatedById: actor.userId,
      },
      include: this.include(),
    });
    await this.log(
      actor,
      'PLATFORM_ASSIGNMENT_RULE_CREATED',
      created.id,
      null,
      created,
    );
    return this.present(created);
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdateAssignmentRuleDto,
  ) {
    const before = await this.load(id);
    const shape: RuleShape = {
      moduleKey: before.moduleKey,
      strategy: dto.strategy ?? before.strategy,
      conditions:
        dto.conditions ?? (before.conditions as Record<string, unknown>),
      targetUserId:
        dto.targetUserId !== undefined ? dto.targetUserId : before.targetUserId,
      targetTeamId:
        dto.targetTeamId !== undefined ? dto.targetTeamId : before.targetTeamId,
      candidateUserIds: dto.candidateUserIds ?? before.candidateUserIds,
    };
    await this.validate(shape);
    const updated = await this.prisma.recordAssignmentRule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() || null }
          : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        conditions: shape.conditions as Prisma.InputJsonObject,
        strategy: shape.strategy,
        // Fields the strategy does not use are cleared so a rule never
        // carries a stale target from a previous strategy.
        targetUserId:
          shape.strategy === RecordAssignmentStrategy.SPECIFIC_USER
            ? shape.targetUserId
            : null,
        targetTeamId:
          shape.strategy === RecordAssignmentStrategy.TEAM_ROUND_ROBIN
            ? shape.targetTeamId
            : null,
        candidateUserIds:
          shape.strategy === RecordAssignmentStrategy.USER_ROUND_ROBIN
            ? shape.candidateUserIds
            : [],
        updatedById: actor.userId,
      },
      include: this.include(),
    });
    await this.log(
      actor,
      'PLATFORM_ASSIGNMENT_RULE_UPDATED',
      id,
      before,
      updated,
    );
    return this.present(updated);
  }

  async setActive(actor: AuthenticatedUser, id: string, isActive: boolean) {
    const before = await this.load(id);
    if (isActive) {
      // Re-validated on enable: the user or team it pointed at may have been
      // disabled or archived since it was written.
      await this.validate({
        moduleKey: before.moduleKey,
        strategy: before.strategy,
        conditions: before.conditions as Record<string, unknown>,
        targetUserId: before.targetUserId,
        targetTeamId: before.targetTeamId,
        candidateUserIds: before.candidateUserIds,
      });
    }
    const updated = await this.prisma.recordAssignmentRule.update({
      where: { id },
      data: { isActive, updatedById: actor.userId },
      include: this.include(),
    });
    await this.log(
      actor,
      isActive
        ? 'PLATFORM_ASSIGNMENT_RULE_ENABLED'
        : 'PLATFORM_ASSIGNMENT_RULE_DISABLED',
      id,
      before,
      updated,
    );
    return this.present(updated);
  }

  async remove(actor: AuthenticatedUser, id: string) {
    const before = await this.load(id);
    await this.prisma.recordAssignmentRule.delete({ where: { id } });
    await this.log(actor, 'PLATFORM_ASSIGNMENT_RULE_DELETED', id, before, null);
    return { deleted: true };
  }

  private async validate(shape: RuleShape) {
    if (!isAssignmentModuleKey(shape.moduleKey)) {
      throw new BadRequestException('Unsupported assignment module.');
    }
    const allowed = ASSIGNMENT_CONDITION_FIELDS[shape.moduleKey];
    for (const [key, value] of Object.entries(shape.conditions)) {
      if (!allowed.includes(key)) {
        throw new BadRequestException(
          `Condition field "${key}" is not available for ${shape.moduleKey}. Allowed: ${allowed.join(', ')}.`,
        );
      }
      if (!['string', 'number', 'boolean'].includes(typeof value)) {
        throw new BadRequestException(
          `Condition "${key}" must be a single text, number or yes/no value.`,
        );
      }
    }

    if (shape.strategy === RecordAssignmentStrategy.SPECIFIC_USER) {
      if (!shape.targetUserId) {
        throw new BadRequestException(
          'A specific-user rule needs a target user.',
        );
      }
      await this.assertActiveUsers([shape.targetUserId]);
    } else if (shape.strategy === RecordAssignmentStrategy.TEAM_ROUND_ROBIN) {
      if (!shape.targetTeamId) {
        throw new BadRequestException(
          'A team round-robin rule needs a target team.',
        );
      }
      const team = await this.prisma.platformTeam.findUnique({
        where: { id: shape.targetTeamId },
        select: { isActive: true, archivedAt: true },
      });
      if (!team || !team.isActive || team.archivedAt) {
        throw new BadRequestException(
          'The target team must exist and be active.',
        );
      }
    } else {
      const unique = [...new Set(shape.candidateUserIds)];
      if (unique.length === 0) {
        throw new BadRequestException(
          'A user round-robin rule needs at least one candidate user.',
        );
      }
      await this.assertActiveUsers(unique);
    }
  }

  private async assertActiveUsers(ids: string[]) {
    const found = await this.prisma.platformUser.count({
      where: { id: { in: ids }, status: PlatformUserStatus.ACTIVE },
    });
    if (found !== new Set(ids).size) {
      throw new BadRequestException(
        'Every assignee must be an active platform user.',
      );
    }
  }

  private async load(id: string) {
    const rule = await this.prisma.recordAssignmentRule.findUnique({
      where: { id },
      include: this.include(),
    });
    if (!rule) throw new NotFoundException('Assignment rule not found.');
    return rule;
  }

  private include() {
    return {
      targetUser: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
      targetTeam: { select: { id: true, name: true } },
    } satisfies Prisma.RecordAssignmentRuleInclude;
  }

  private present(
    rule: RecordAssignmentRule & {
      targetUser?: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
      } | null;
      targetTeam?: { id: string; name: string } | null;
    },
  ) {
    return {
      ...rule,
      targetUser: rule.targetUser
        ? {
            ...rule.targetUser,
            fullName:
              `${rule.targetUser.firstName} ${rule.targetUser.lastName}`.trim(),
          }
        : null,
    };
  }

  private async log(
    actor: AuthenticatedUser,
    action: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ) {
    await this.audit.log({
      tenantId: 'platform',
      actorUserId: actor.userId,
      action,
      sourceModule: 'super-admin',
      entityType: 'RecordAssignmentRule',
      entityId,
      beforeSnapshot: before,
      afterSnapshot: after,
    });
  }
}
