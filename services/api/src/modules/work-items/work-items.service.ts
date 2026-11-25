import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, WorkItemStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AuditService } from '../audit/audit.service';
import {
  AddDependencyDto,
  CreateWorkItemDto,
  ListWorkItemsDto,
  ReassignWorkItemDto,
  SetContributorDto,
  TransitionWorkItemDto,
  UpdateWorkItemDto,
} from './dto/work-item.dto';
import {
  canTransition,
  MAX_SUBTASK_DEPTH,
  TERMINAL_STATUSES,
  totalEffort,
  wouldCreateCycle,
  type WorkItemStatusValue,
} from './work-item-lifecycle';

/*
 * DP-MASTER/WP-02.S1 (ADR-0030). Work items: tasks, service jobs and duty
 * occurrences with a lifecycle of their own. Every query filters tenantId from the
 * authenticated user; nothing is deleted (archive instead); every state change is
 * audited with before/after snapshots.
 */
const AUDIT = {
  CREATED: 'WORK_ITEM_CREATED',
  UPDATED: 'WORK_ITEM_UPDATED',
  TRANSITIONED: 'WORK_ITEM_TRANSITIONED',
  REASSIGNED: 'WORK_ITEM_REASSIGNED',
  ARCHIVED: 'WORK_ITEM_ARCHIVED',
  UNARCHIVED: 'WORK_ITEM_UNARCHIVED',
  CONTRIBUTOR_SET: 'WORK_ITEM_CONTRIBUTOR_SET',
  CONTRIBUTOR_REMOVED: 'WORK_ITEM_CONTRIBUTOR_REMOVED',
  DEPENDENCY_ADDED: 'WORK_ITEM_DEPENDENCY_ADDED',
  DEPENDENCY_REMOVED: 'WORK_ITEM_DEPENDENCY_REMOVED',
} as const;

const ITEM_SELECT = {
  id: true,
  kind: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  ownerEmployeeId: true,
  projectId: true,
  parentId: true,
  workTypeKey: true,
  workProfileVersionId: true,
  dueAt: true,
  startedAt: true,
  completedAt: true,
  archivedAt: true,
  externalSystem: true,
  externalRef: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WorkItemSelect;

function problem(code: string, message: string): never {
  throw new BadRequestException({ code, message });
}

@Injectable()
export class WorkItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(tenantId: string, query: ListWorkItemsDto) {
    const where: Prisma.WorkItemWhereInput = {
      tenantId,
      ...(query.includeArchived ? {} : { archivedAt: null }),
      ...(query.status ? { status: query.status as WorkItemStatus } : {}),
      ...(query.kind ? { kind: query.kind as never } : {}),
      ...(query.ownerEmployeeId
        ? { ownerEmployeeId: query.ownerEmployeeId }
        : {}),
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.parentId ? { parentId: query.parentId } : {}),
      ...(query.search
        ? { title: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.workItem.findMany({
        where,
        select: ITEM_SELECT,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: query.take ?? 50,
        skip: query.skip ?? 0,
      }),
      this.prisma.workItem.count({ where }),
    ]);
    return { items, total };
  }

  async findOne(tenantId: string, id: string) {
    const item = await this.prisma.workItem.findFirst({
      where: { id, tenantId },
      select: {
        ...ITEM_SELECT,
        contributors: {
          select: {
            employeeId: true,
            estimateMinutes: true,
            actualMinutes: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        dependsOn: { select: { dependsOnId: true } },
        children: {
          where: { tenantId },
          select: { id: true, title: true, status: true },
        },
      },
    });
    if (!item) throw new NotFoundException('Work item not found.');
    return {
      ...item,
      effort: totalEffort(item.contributors),
    };
  }

  async create(user: AuthenticatedUser, dto: CreateWorkItemDto) {
    const tenantId = user.tenantId;
    if (dto.ownerEmployeeId)
      await this.assertEmployee(tenantId, dto.ownerEmployeeId);
    if (dto.projectId) {
      const project = await this.prisma.project.findFirst({
        where: { id: dto.projectId, tenantId },
        select: { id: true },
      });
      if (!project) problem('WORK_ITEM_PROJECT_INVALID', 'Project not found.');
    }
    if (dto.workProfileVersionId) {
      const version = await this.prisma.workProfileVersion.findFirst({
        where: {
          id: dto.workProfileVersionId,
          tenantId,
          status: 'PUBLISHED',
        },
        select: { id: true },
      });
      if (!version) {
        problem(
          'WORK_ITEM_PROFILE_VERSION_INVALID',
          'The work profile version is not a published version of this tenant.',
        );
      }
    }
    if (dto.parentId) await this.assertParentDepth(tenantId, dto.parentId);

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.workItem.create({
        data: {
          tenantId,
          kind: dto.kind,
          title: dto.title.trim(),
          description: dto.description ?? null,
          priority: dto.priority ?? 'NORMAL',
          ownerEmployeeId: dto.ownerEmployeeId ?? null,
          projectId: dto.projectId ?? null,
          parentId: dto.parentId ?? null,
          workTypeKey: dto.workTypeKey ?? null,
          workProfileVersionId: dto.workProfileVersionId ?? null,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          externalSystem: dto.externalSystem ?? null,
          externalRef: dto.externalRef ?? null,
          createdById: user.userId,
          updatedById: user.userId,
        },
        select: ITEM_SELECT,
      });
      await this.audit.log(
        {
          tenantId,
          actorUserId: user.userId,
          action: AUDIT.CREATED,
          entityType: 'WorkItem',
          entityId: created.id,
          afterSnapshot: created,
        },
        tx,
      );
      return created;
    });
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateWorkItemDto) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, user.tenantId, id);
      const updated = await tx.workItem.update({
        where: { id: before.id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description }
            : {}),
          ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
          ...(dto.dueAt !== undefined ? { dueAt: new Date(dto.dueAt) } : {}),
          ...(dto.externalSystem !== undefined
            ? { externalSystem: dto.externalSystem }
            : {}),
          ...(dto.externalRef !== undefined
            ? { externalRef: dto.externalRef }
            : {}),
          updatedById: user.userId,
        },
        select: ITEM_SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.UPDATED,
          entityType: 'WorkItem',
          entityId: id,
          beforeSnapshot: before,
          afterSnapshot: updated,
        },
        tx,
      );
      return updated;
    });
  }

  async transition(
    user: AuthenticatedUser,
    id: string,
    dto: TransitionWorkItemDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, user.tenantId, id);
      if (before.archivedAt) {
        throw new ConflictException({
          code: 'WORK_ITEM_ARCHIVED',
          message: 'An archived work item cannot change status.',
        });
      }
      const from = before.status as WorkItemStatusValue;
      if (!canTransition(from, dto.to)) {
        throw new ConflictException({
          code: 'WORK_ITEM_TRANSITION_INVALID',
          message: `A work item cannot move from ${from} to ${dto.to}.`,
        });
      }
      if (dto.to === 'DONE') {
        // Prerequisites must be finished (done or cancelled) first.
        const open = await tx.workItemDependency.count({
          where: {
            tenantId: user.tenantId,
            workItemId: id,
            dependsOn: { status: { notIn: [...TERMINAL_STATUSES] } },
          },
        });
        if (open > 0) {
          throw new ConflictException({
            code: 'WORK_ITEM_BLOCKED_BY_DEPENDENCY',
            message: `${open} prerequisite work item(s) are not finished.`,
          });
        }
      }
      const now = new Date();
      const updated = await tx.workItem.update({
        where: { id },
        data: {
          status: dto.to,
          startedAt:
            dto.to === 'IN_PROGRESS' && !before.startedAt ? now : undefined,
          completedAt: dto.to === 'DONE' ? now : null,
          updatedById: user.userId,
        },
        select: ITEM_SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.TRANSITIONED,
          entityType: 'WorkItem',
          entityId: id,
          beforeSnapshot: { status: from },
          afterSnapshot: { status: dto.to, reason: dto.reason ?? null },
        },
        tx,
      );
      return updated;
    });
  }

  async reassign(
    user: AuthenticatedUser,
    id: string,
    dto: ReassignWorkItemDto,
  ) {
    if (dto.ownerEmployeeId) {
      await this.assertEmployee(user.tenantId, dto.ownerEmployeeId);
    }
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, user.tenantId, id);
      if (before.archivedAt) {
        throw new ConflictException({
          code: 'WORK_ITEM_ARCHIVED',
          message: 'An archived work item cannot be reassigned.',
        });
      }
      const updated = await tx.workItem.update({
        where: { id },
        data: {
          ownerEmployeeId: dto.ownerEmployeeId ?? null,
          updatedById: user.userId,
        },
        select: ITEM_SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.REASSIGNED,
          entityType: 'WorkItem',
          entityId: id,
          beforeSnapshot: { ownerEmployeeId: before.ownerEmployeeId },
          afterSnapshot: {
            ownerEmployeeId: updated.ownerEmployeeId,
            reason: dto.reason ?? null,
          },
        },
        tx,
      );
      return updated;
    });
  }

  /** Archive, never delete: an item may carry evidence and time. Finished items only. */
  async archive(user: AuthenticatedUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, user.tenantId, id);
      if (!TERMINAL_STATUSES.includes(before.status as WorkItemStatusValue)) {
        throw new ConflictException({
          code: 'WORK_ITEM_NOT_FINISHED',
          message: 'Only a done or cancelled work item can be archived.',
        });
      }
      const updated = await tx.workItem.update({
        where: { id },
        data: {
          archivedAt: before.archivedAt ?? new Date(),
          updatedById: user.userId,
        },
        select: ITEM_SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.ARCHIVED,
          entityType: 'WorkItem',
          entityId: id,
          beforeSnapshot: { archivedAt: before.archivedAt },
          afterSnapshot: { archivedAt: updated.archivedAt },
        },
        tx,
      );
      return updated;
    });
  }

  async unarchive(user: AuthenticatedUser, id: string) {
    return this.prisma.$transaction(async (tx) => {
      const before = await this.lock(tx, user.tenantId, id);
      const updated = await tx.workItem.update({
        where: { id },
        data: { archivedAt: null, updatedById: user.userId },
        select: ITEM_SELECT,
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.UNARCHIVED,
          entityType: 'WorkItem',
          entityId: id,
          beforeSnapshot: { archivedAt: before.archivedAt },
          afterSnapshot: { archivedAt: null },
        },
        tx,
      );
      return updated;
    });
  }

  // ---------------------------------------------------------- contributors

  async setContributor(
    user: AuthenticatedUser,
    id: string,
    employeeId: string,
    dto: SetContributorDto,
  ) {
    await this.assertEmployee(user.tenantId, employeeId);
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, user.tenantId, id);
      // One row per person: setting again updates, never adds a second share.
      const row = await tx.workItemContributor.upsert({
        where: { workItemId_employeeId: { workItemId: id, employeeId } },
        create: {
          tenantId: user.tenantId,
          workItemId: id,
          employeeId,
          estimateMinutes: dto.estimateMinutes ?? null,
          actualMinutes: dto.actualMinutes ?? null,
        },
        update: {
          ...(dto.estimateMinutes !== undefined
            ? { estimateMinutes: dto.estimateMinutes }
            : {}),
          ...(dto.actualMinutes !== undefined
            ? { actualMinutes: dto.actualMinutes }
            : {}),
        },
        select: {
          employeeId: true,
          estimateMinutes: true,
          actualMinutes: true,
        },
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.CONTRIBUTOR_SET,
          entityType: 'WorkItem',
          entityId: id,
          afterSnapshot: row,
        },
        tx,
      );
      return row;
    });
  }

  async removeContributor(
    user: AuthenticatedUser,
    id: string,
    employeeId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, user.tenantId, id);
      const removed = await tx.workItemContributor.deleteMany({
        where: { tenantId: user.tenantId, workItemId: id, employeeId },
      });
      if (!removed.count) throw new NotFoundException('Contributor not found.');
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.CONTRIBUTOR_REMOVED,
          entityType: 'WorkItem',
          entityId: id,
          beforeSnapshot: { employeeId },
        },
        tx,
      );
      return { removed: true };
    });
  }

  // ---------------------------------------------------------- dependencies

  async addDependency(
    user: AuthenticatedUser,
    id: string,
    dto: AddDependencyDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      // The cycle check reads every edge of the tenant and the insert must see the
      // same graph another writer sees. A tenant-wide advisory lock serialises
      // dependency writes, so two edges that are each fine alone cannot together
      // close a loop.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`work-item-deps:${user.tenantId}`}))`;
      await this.lock(tx, user.tenantId, id);
      const prerequisite = await tx.workItem.findFirst({
        where: { id: dto.dependsOnId, tenantId: user.tenantId },
        select: { id: true },
      });
      if (!prerequisite) {
        throw new NotFoundException('Prerequisite work item not found.');
      }
      const all = await tx.workItemDependency.findMany({
        where: { tenantId: user.tenantId },
        select: { workItemId: true, dependsOnId: true },
      });
      const edges = new Map<string, string[]>();
      for (const e of all) {
        edges.set(e.workItemId, [
          ...(edges.get(e.workItemId) ?? []),
          e.dependsOnId,
        ]);
      }
      if (wouldCreateCycle(edges, id, dto.dependsOnId)) {
        throw new ConflictException({
          code: 'WORK_ITEM_DEPENDENCY_CYCLE',
          message:
            'That dependency would make the work items wait on each other.',
        });
      }
      const row = await tx.workItemDependency.upsert({
        where: {
          workItemId_dependsOnId: {
            workItemId: id,
            dependsOnId: dto.dependsOnId,
          },
        },
        create: {
          tenantId: user.tenantId,
          workItemId: id,
          dependsOnId: dto.dependsOnId,
          createdById: user.userId,
        },
        update: {},
        select: { workItemId: true, dependsOnId: true },
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.DEPENDENCY_ADDED,
          entityType: 'WorkItem',
          entityId: id,
          afterSnapshot: row,
        },
        tx,
      );
      return row;
    });
  }

  async removeDependency(
    user: AuthenticatedUser,
    id: string,
    dependsOnId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.lock(tx, user.tenantId, id);
      const removed = await tx.workItemDependency.deleteMany({
        where: { tenantId: user.tenantId, workItemId: id, dependsOnId },
      });
      if (!removed.count) throw new NotFoundException('Dependency not found.');
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.DEPENDENCY_REMOVED,
          entityType: 'WorkItem',
          entityId: id,
          beforeSnapshot: { dependsOnId },
        },
        tx,
      );
      return { removed: true };
    });
  }

  // --------------------------------------------------------------- helpers

  /** Row-locks the item inside the tenant and returns it; 404 if it is not the tenant's. */
  private async lock(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
  ) {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "WorkItem"
      WHERE "id" = ${id} AND "tenantId" = ${tenantId}
      FOR UPDATE`;
    if (!locked.length) throw new NotFoundException('Work item not found.');
    return tx.workItem.findFirstOrThrow({
      where: { id, tenantId },
      select: ITEM_SELECT,
    });
  }

  private async assertEmployee(tenantId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, tenantId },
      select: { id: true, employmentStatus: true },
    });
    if (!employee) problem('WORK_ITEM_EMPLOYEE_INVALID', 'Employee not found.');
    if (employee.employmentStatus === 'TERMINATED') {
      problem(
        'WORK_ITEM_EMPLOYEE_TERMINATED',
        'A terminated employee cannot be given work.',
      );
    }
  }

  private async assertParentDepth(tenantId: string, parentId: string) {
    let depth = 1;
    let cursor: string | null = parentId;
    while (cursor) {
      const row: { id: string; parentId: string | null } | null =
        await this.prisma.workItem.findFirst({
          where: { id: cursor, tenantId },
          select: { id: true, parentId: true },
        });
      if (!row)
        problem('WORK_ITEM_PARENT_INVALID', 'Parent work item not found.');
      cursor = row.parentId;
      if (cursor) depth += 1;
      if (depth >= MAX_SUBTASK_DEPTH) {
        problem(
          'WORK_ITEM_TOO_DEEP',
          `Subtasks can be nested at most ${MAX_SUBTASK_DEPTH} levels deep.`,
        );
      }
    }
  }
}
