import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { resolveEffectiveAccessLevel } from '../../common/security/rbac-query-scope';
import { AuditService } from '../audit/audit.service';
import type {
  CreateWorkQueueDto,
  UpdateWorkQueueDto,
} from './dto/work-queue.dto';

/*
 * DP-MASTER WP-06.S1. Work queues: where work waits before and while someone does
 * it, with no Project required. A queue's SLA minutes are defaults; each item is
 * stamped with its own due times when it joins, so editing a queue never rewrites
 * a promise already made. Queues are deactivated, never deleted.
 */
const SELECT = {
  id: true,
  key: true,
  name: true,
  description: true,
  teamId: true,
  businessUnitId: true,
  responseSlaMinutes: true,
  resolutionSlaMinutes: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WorkQueueSelect;

@Injectable()
export class WorkQueuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Managers of queues see every queue; everyone else sees their teams' queues. */
  async list(user: AuthenticatedUser, includeInactive = false) {
    const level = resolveEffectiveAccessLevel(
      user,
      ENTITY_KEYS.EMPLOYEES,
      SecurityPrivilege.READ,
    );
    const ownOnly =
      level === SecurityAccessLevel.SELF || level === SecurityAccessLevel.USER;
    const teamIds = user.accessContext?.teamIds ?? [];
    return this.prisma.workQueue.findMany({
      where: {
        tenantId: user.tenantId,
        ...(includeInactive ? {} : { isActive: true }),
        ...(ownOnly ? { teamId: { in: teamIds } } : {}),
      },
      select: SELECT,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 200,
    });
  }

  async create(user: AuthenticatedUser, dto: CreateWorkQueueDto) {
    await this.assertTeam(user.tenantId, dto.teamId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const created = await tx.workQueue.create({
          data: {
            tenantId: user.tenantId,
            key: dto.key,
            name: dto.name.trim(),
            description: dto.description ?? null,
            teamId: dto.teamId ?? null,
            businessUnitId: dto.businessUnitId ?? null,
            responseSlaMinutes: dto.responseSlaMinutes ?? null,
            resolutionSlaMinutes: dto.resolutionSlaMinutes ?? null,
            createdById: user.userId,
          },
          select: SELECT,
        });
        await this.audit.log(
          {
            tenantId: user.tenantId,
            actorUserId: user.userId,
            action: 'WORK_QUEUE_CREATED',
            entityType: 'WorkQueue',
            entityId: created.id,
            afterSnapshot: created,
          },
          tx,
        );
        return created;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException({
          code: 'WORK_QUEUE_KEY_TAKEN',
          message: 'A queue with that key already exists.',
        });
      }
      throw error;
    }
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateWorkQueueDto) {
    if (dto.teamId) await this.assertTeam(user.tenantId, dto.teamId);
    const before = await this.prisma.workQueue.findFirst({
      where: { id, tenantId: user.tenantId },
      select: SELECT,
    });
    if (!before) throw new NotFoundException('Queue not found.');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.workQueue.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.teamId !== undefined ? { teamId: dto.teamId } : {}),
          ...(dto.responseSlaMinutes !== undefined
            ? { responseSlaMinutes: dto.responseSlaMinutes }
            : {}),
          ...(dto.resolutionSlaMinutes !== undefined
            ? { resolutionSlaMinutes: dto.resolutionSlaMinutes }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
        select: SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: 'WORK_QUEUE_UPDATED',
          entityType: 'WorkQueue',
          entityId: id,
          beforeSnapshot: before,
          afterSnapshot: updated,
        },
        tx,
      );
      return updated;
    });
  }

  private async assertTeam(tenantId: string, teamId?: string) {
    if (!teamId) return;
    const team = await this.prisma.team.findFirst({
      where: { id: teamId, tenantId },
      select: { id: true },
    });
    if (!team) {
      throw new BadRequestException({
        code: 'WORK_QUEUE_TEAM_INVALID',
        message: 'The team was not found.',
      });
    }
  }
}
