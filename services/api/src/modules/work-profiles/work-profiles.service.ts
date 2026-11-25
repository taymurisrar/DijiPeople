import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  WorkProfileVersionStatus,
  type WorkUnitKind,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AuditService } from '../audit/audit.service';
import {
  CreateAssignmentDto,
  CreateWorkProfileDto,
  CreateWorkUnitDto,
  EndAssignmentDto,
  ListAssignmentsDto,
  ListWorkProfilesDto,
  PublishWorkProfileVersionDto,
  UpdateWorkProfileDto,
  UpdateWorkProfileVersionDto,
  UpdateWorkUnitDto,
} from './dto/work-profile.dto';
import {
  validateUnitCompatibility,
  validateWorkProfileDefinition,
  type WorkProfileDefinition,
} from './work-profile-definition';

/*
 * DP-MASTER/WP-35.S1 (ADR-0030). Configurable work units, profiles and immutable
 * profile versions, plus time-effective employee assignments.
 *
 * Every query filters tenantId taken from the authenticated user. A published
 * version is never edited: changing a profile publishes the next version, and the
 * previous one stays exactly as records created under it saw it.
 */
const AUDIT = {
  UNIT_CREATED: 'WORK_UNIT_CREATED',
  UNIT_UPDATED: 'WORK_UNIT_UPDATED',
  PROFILE_CREATED: 'WORK_PROFILE_CREATED',
  PROFILE_UPDATED: 'WORK_PROFILE_UPDATED',
  VERSION_DRAFTED: 'WORK_PROFILE_VERSION_DRAFTED',
  VERSION_EDITED: 'WORK_PROFILE_VERSION_EDITED',
  VERSION_PUBLISHED: 'WORK_PROFILE_VERSION_PUBLISHED',
  ASSIGNED: 'WORK_PROFILE_ASSIGNED',
  ASSIGNMENT_ENDED: 'WORK_PROFILE_ASSIGNMENT_ENDED',
} as const;

const VERSION_SELECT = {
  id: true,
  version: true,
  status: true,
  definition: true,
  effectiveFrom: true,
  effectiveTo: true,
  publishedAt: true,
  createdAt: true,
} satisfies Prisma.WorkProfileVersionSelect;

function checksum(definition: unknown): string {
  return createHash('sha256').update(JSON.stringify(definition)).digest('hex');
}

/**
 * WP-21.S1: every write below may run inside a transaction the caller already
 * holds (the package engine applies a whole import in one), in which case the
 * caller's client is used for reads AND writes so the method sees what the same
 * transaction wrote earlier. Without one, the method opens its own as before.
 */
type Db = Prisma.TransactionClient;

function badRequest(code: string, problems: string[]): never {
  throw new BadRequestException({ code, message: problems.join(' ') });
}

@Injectable()
export class WorkProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- units

  listUnits(tenantId: string, isActive?: boolean) {
    return this.prisma.workUnit.findMany({
      where: { tenantId, ...(isActive !== undefined ? { isActive } : {}) },
      select: { id: true, key: true, name: true, kind: true, isActive: true },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  private run<T>(db: Db | undefined, work: (tx: Db) => Promise<T>): Promise<T> {
    return db ? work(db) : this.prisma.$transaction(work);
  }

  async createUnit(user: AuthenticatedUser, dto: CreateWorkUnitDto, db?: Db) {
    const exists = await (db ?? this.prisma).workUnit.findFirst({
      where: { tenantId: user.tenantId, key: dto.key },
      select: { id: true },
    });
    if (exists) throw this.keyTaken('unit', dto.key);
    const unit = await this.run(db, async (tx) => {
      const created = await tx.workUnit.create({
        data: {
          tenantId: user.tenantId,
          key: dto.key,
          name: dto.name.trim(),
          kind: dto.kind as WorkUnitKind,
          createdById: user.userId,
          updatedById: user.userId,
        },
        select: { id: true, key: true, name: true, kind: true, isActive: true },
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.UNIT_CREATED,
          entityType: 'WorkUnit',
          entityId: created.id,
          afterSnapshot: created,
        },
        tx,
      );
      return created;
    });
    return unit;
  }

  async updateUnit(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateWorkUnitDto,
    db?: Db,
  ) {
    const before = await (db ?? this.prisma).workUnit.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { id: true, key: true, name: true, kind: true, isActive: true },
    });
    if (!before) throw new NotFoundException('Work unit was not found.');
    return this.run(db, async (tx) => {
      const updated = await tx.workUnit.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          updatedById: user.userId,
        },
        select: { id: true, key: true, name: true, kind: true, isActive: true },
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.UNIT_UPDATED,
          entityType: 'WorkUnit',
          entityId: id,
          beforeSnapshot: before,
          afterSnapshot: updated,
        },
        tx,
      );
      return updated;
    });
  }

  // ------------------------------------------------------------- profiles

  async list(tenantId: string, query: ListWorkProfilesDto) {
    const search = query.search?.trim();
    const now = new Date();
    const rows = await this.prisma.workProfile.findMany({
      where: {
        tenantId,
        ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { key: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        isActive: true,
        versions: {
          orderBy: { version: 'desc' },
          select: {
            id: true,
            version: true,
            status: true,
            effectiveFrom: true,
            effectiveTo: true,
          },
        },
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
    return rows.map(({ versions, ...profile }) => ({
      ...profile,
      currentVersion:
        versions.find(
          (v) =>
            v.status === WorkProfileVersionStatus.PUBLISHED &&
            v.effectiveFrom !== null &&
            v.effectiveFrom <= now &&
            (v.effectiveTo === null || v.effectiveTo > now),
        ) ?? null,
      hasDraft: versions.some(
        (v) => v.status === WorkProfileVersionStatus.DRAFT,
      ),
    }));
  }

  async findOne(tenantId: string, id: string, db?: Db) {
    const profile = await (db ?? this.prisma).workProfile.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        isActive: true,
        versions: { orderBy: { version: 'desc' }, select: VERSION_SELECT },
      },
    });
    if (!profile) throw new NotFoundException('Work profile was not found.');
    return profile;
  }

  async create(user: AuthenticatedUser, dto: CreateWorkProfileDto, db?: Db) {
    const problems = validateWorkProfileDefinition(dto.definition);
    if (problems.length)
      badRequest('WORK_PROFILE_DEFINITION_INVALID', problems);

    const exists = await (db ?? this.prisma).workProfile.findFirst({
      where: { tenantId: user.tenantId, key: dto.key },
      select: { id: true },
    });
    if (exists) throw this.keyTaken('profile', dto.key);

    const id = await this.run(db, async (tx) => {
      const profile = await tx.workProfile.create({
        data: {
          tenantId: user.tenantId,
          key: dto.key,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          createdById: user.userId,
          updatedById: user.userId,
          versions: {
            create: {
              tenantId: user.tenantId,
              version: 1,
              status: WorkProfileVersionStatus.DRAFT,
              definition: dto.definition as Prisma.InputJsonValue,
              createdById: user.userId,
            },
          },
        },
        select: { id: true, key: true, name: true },
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.PROFILE_CREATED,
          entityType: 'WorkProfile',
          entityId: profile.id,
          afterSnapshot: { key: profile.key, name: profile.name, version: 1 },
        },
        tx,
      );
      return profile.id;
    });
    return this.findOne(user.tenantId, id, db);
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateWorkProfileDto,
    db?: Db,
  ) {
    const before = await (db ?? this.prisma).workProfile.findFirst({
      where: { id, tenantId: user.tenantId },
      select: { name: true, description: true, isActive: true },
    });
    if (!before) throw new NotFoundException('Work profile was not found.');
    await this.run(db, async (tx) => {
      await tx.workProfile.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description.trim() || null }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          updatedById: user.userId,
        },
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.PROFILE_UPDATED,
          entityType: 'WorkProfile',
          entityId: id,
          beforeSnapshot: before,
          afterSnapshot: { ...before, ...dto },
        },
        tx,
      );
    });
    return this.findOne(user.tenantId, id, db);
  }

  // ------------------------------------------------------------- versions

  /** Starts the next draft as a copy of the latest version. One draft at a time. */
  async createDraft(user: AuthenticatedUser, profileId: string, db?: Db) {
    await this.run(db, async (tx) => {
      await this.lockProfile(tx, user.tenantId, profileId);
      const versions = await tx.workProfileVersion.findMany({
        where: { profileId, tenantId: user.tenantId },
        orderBy: { version: 'desc' },
        select: { version: true, status: true, definition: true },
      });
      if (versions.some((v) => v.status === WorkProfileVersionStatus.DRAFT)) {
        throw new ConflictException({
          code: 'WORK_PROFILE_DRAFT_EXISTS',
          message:
            'This profile already has a draft. Edit or publish it first.',
        });
      }
      const latest = versions[0];
      const created = await tx.workProfileVersion.create({
        data: {
          tenantId: user.tenantId,
          profileId,
          version: (latest?.version ?? 0) + 1,
          status: WorkProfileVersionStatus.DRAFT,
          definition: (latest?.definition ?? {
            workTypes: [],
          }) as Prisma.InputJsonValue,
          createdById: user.userId,
        },
        select: { id: true, version: true },
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.VERSION_DRAFTED,
          entityType: 'WorkProfileVersion',
          entityId: created.id,
          afterSnapshot: { profileId, version: created.version },
        },
        tx,
      );
    });
    return this.findOne(user.tenantId, profileId, db);
  }

  async updateDraft(
    user: AuthenticatedUser,
    profileId: string,
    versionId: string,
    dto: UpdateWorkProfileVersionDto,
    db?: Db,
  ) {
    const problems = validateWorkProfileDefinition(dto.definition);
    if (problems.length)
      badRequest('WORK_PROFILE_DEFINITION_INVALID', problems);

    await this.run(db, async (tx) => {
      await this.lockProfile(tx, user.tenantId, profileId);
      const version = await this.findVersion(
        tx,
        user.tenantId,
        profileId,
        versionId,
      );
      if (version.status !== WorkProfileVersionStatus.DRAFT) {
        throw new ConflictException({
          code: 'WORK_PROFILE_VERSION_IMMUTABLE',
          message:
            'A published version cannot be edited. Start a new draft instead.',
        });
      }
      await tx.workProfileVersion.update({
        where: { id: versionId },
        data: { definition: dto.definition as Prisma.InputJsonValue },
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.VERSION_EDITED,
          entityType: 'WorkProfileVersion',
          entityId: versionId,
          afterSnapshot: { profileId, version: version.version },
        },
        tx,
      );
    });
    return this.findOne(user.tenantId, profileId, db);
  }

  /**
   * Publishes a draft: validates the definition against the tenant's units, makes
   * it immutable, and closes the previous version's window at the new start so
   * exactly one version is in force at any instant.
   */
  async publish(
    user: AuthenticatedUser,
    profileId: string,
    versionId: string,
    dto: PublishWorkProfileVersionDto,
    db?: Db,
  ) {
    await this.run(db, async (tx) => {
      const profile = await this.lockProfile(tx, user.tenantId, profileId);
      if (!profile.isActive) {
        throw new ConflictException({
          code: 'WORK_PROFILE_INACTIVE',
          message: 'An inactive profile cannot publish a version.',
        });
      }
      const version = await this.findVersion(
        tx,
        user.tenantId,
        profileId,
        versionId,
      );
      if (version.status !== WorkProfileVersionStatus.DRAFT) {
        throw new ConflictException({
          code: 'WORK_PROFILE_VERSION_IMMUTABLE',
          message: 'Only a draft can be published.',
        });
      }

      const structural = validateWorkProfileDefinition(version.definition);
      const definition = version.definition as unknown as WorkProfileDefinition;
      const units = structural.length
        ? []
        : await tx.workUnit.findMany({
            where: { tenantId: user.tenantId },
            select: { key: true, kind: true, isActive: true },
          });
      const problems = [
        ...structural,
        ...(structural.length
          ? []
          : validateUnitCompatibility(definition, units)),
      ];
      if (problems.length)
        badRequest('WORK_PROFILE_DEFINITION_INVALID', problems);

      const effectiveFrom = dto.effectiveFrom
        ? new Date(dto.effectiveFrom)
        : new Date();
      const current = await tx.workProfileVersion.findFirst({
        where: {
          profileId,
          tenantId: user.tenantId,
          status: WorkProfileVersionStatus.PUBLISHED,
          effectiveTo: null,
        },
        select: { id: true, effectiveFrom: true },
      });
      if (current?.effectiveFrom && effectiveFrom <= current.effectiveFrom) {
        badRequest('WORK_PROFILE_EFFECTIVE_DATE_INVALID', [
          'The new version must start after the version it replaces.',
        ]);
      }
      if (current) {
        await tx.workProfileVersion.update({
          where: { id: current.id },
          data: { effectiveTo: effectiveFrom },
        });
      }
      await tx.workProfileVersion.update({
        where: { id: versionId },
        data: {
          status: WorkProfileVersionStatus.PUBLISHED,
          checksum: checksum(version.definition),
          effectiveFrom,
          publishedAt: new Date(),
          publishedById: user.userId,
        },
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.VERSION_PUBLISHED,
          entityType: 'WorkProfileVersion',
          entityId: versionId,
          afterSnapshot: {
            profileId,
            version: version.version,
            effectiveFrom,
            replaced: current?.id ?? null,
          },
        },
        tx,
      );
    });
    return this.findOne(user.tenantId, profileId, db);
  }

  // ---------------------------------------------------------- assignments

  listAssignments(tenantId: string, query: ListAssignmentsDto) {
    return this.prisma.employeeWorkProfileAssignment.findMany({
      where: {
        tenantId,
        ...(query.employeeId ? { employeeId: query.employeeId } : {}),
        ...(query.profileId ? { profileId: query.profileId } : {}),
      },
      select: {
        id: true,
        employeeId: true,
        profileId: true,
        effectiveFrom: true,
        effectiveTo: true,
        profile: { select: { key: true, name: true } },
      },
      orderBy: [{ employeeId: 'asc' }, { effectiveFrom: 'desc' }],
      take: 500,
    });
  }

  async assign(user: AuthenticatedUser, dto: CreateAssignmentDto) {
    const from = new Date(dto.effectiveFrom);
    const to = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
    if (to && to <= from) {
      badRequest('WORK_PROFILE_ASSIGNMENT_INVALID', [
        'effectiveTo must be after effectiveFrom.',
      ]);
    }

    const id = await this.prisma.$transaction(async (tx) => {
      const profile = await tx.workProfile.findFirst({
        where: { id: dto.profileId, tenantId: user.tenantId },
        select: { id: true, isActive: true },
      });
      if (!profile) throw new NotFoundException('Work profile was not found.');
      if (!profile.isActive) {
        throw new ConflictException({
          code: 'WORK_PROFILE_INACTIVE',
          message: 'An inactive profile cannot be assigned.',
        });
      }
      // Locking the employee serialises concurrent assignments for the same person.
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Employee"
         WHERE "id" = ${dto.employeeId} AND "tenantId" = ${user.tenantId}
           AND "isDeleted" = false AND "deletedAt" IS NULL
           FOR UPDATE`;
      if (!locked.length)
        throw new NotFoundException('Employee was not found for this tenant.');

      const overlap = await tx.employeeWorkProfileAssignment.findFirst({
        where: {
          tenantId: user.tenantId,
          employeeId: dto.employeeId,
          profileId: dto.profileId,
          ...(to ? { effectiveFrom: { lt: to } } : {}),
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: from } }],
        },
        select: { id: true },
      });
      if (overlap) {
        throw new ConflictException({
          code: 'WORK_PROFILE_ASSIGNMENT_OVERLAP',
          message:
            'This employee already holds this profile during that period.',
        });
      }
      const created = await tx.employeeWorkProfileAssignment.create({
        data: {
          tenantId: user.tenantId,
          employeeId: dto.employeeId,
          profileId: dto.profileId,
          effectiveFrom: from,
          effectiveTo: to,
          createdById: user.userId,
        },
        select: { id: true },
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.ASSIGNED,
          entityType: 'EmployeeWorkProfileAssignment',
          entityId: created.id,
          afterSnapshot: {
            employeeId: dto.employeeId,
            profileId: dto.profileId,
            effectiveFrom: from,
            effectiveTo: to,
          },
        },
        tx,
      );
      return created.id;
    });
    return this.prisma.employeeWorkProfileAssignment.findFirstOrThrow({
      where: { id, tenantId: user.tenantId },
      select: {
        id: true,
        employeeId: true,
        profileId: true,
        effectiveFrom: true,
        effectiveTo: true,
      },
    });
  }

  /** Closing an assignment is the only edit: history is ended, never rewritten or deleted. */
  async endAssignment(
    user: AuthenticatedUser,
    id: string,
    dto: EndAssignmentDto,
  ) {
    const to = new Date(dto.effectiveTo);
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.employeeWorkProfileAssignment.findFirst({
        where: { id, tenantId: user.tenantId },
        select: { effectiveFrom: true, effectiveTo: true },
      });
      if (!existing) throw new NotFoundException('Assignment was not found.');
      if (to <= existing.effectiveFrom) {
        badRequest('WORK_PROFILE_ASSIGNMENT_INVALID', [
          'effectiveTo must be after the assignment starts.',
        ]);
      }
      if (existing.effectiveTo && to > existing.effectiveTo) {
        badRequest('WORK_PROFILE_ASSIGNMENT_INVALID', [
          'An assignment can be shortened, not extended.',
        ]);
      }
      await tx.employeeWorkProfileAssignment.update({
        where: { id },
        data: { effectiveTo: to },
      });
      await this.audit.log(
        {
          tenantId: user.tenantId,
          actorUserId: user.userId,
          action: AUDIT.ASSIGNMENT_ENDED,
          entityType: 'EmployeeWorkProfileAssignment',
          entityId: id,
          beforeSnapshot: existing,
          afterSnapshot: { effectiveTo: to },
        },
        tx,
      );
    });
    return this.prisma.employeeWorkProfileAssignment.findFirstOrThrow({
      where: { id, tenantId: user.tenantId },
      select: {
        id: true,
        employeeId: true,
        profileId: true,
        effectiveFrom: true,
        effectiveTo: true,
      },
    });
  }

  // -------------------------------------------------------------- helpers

  private keyTaken(what: string, key: string) {
    return new ConflictException({
      code: 'WORK_KEY_TAKEN',
      message: `A work ${what} with the key "${key}" already exists.`,
    });
  }

  /** Row-locks the profile within the tenant; concurrent publishes and drafts queue here. */
  private async lockProfile(
    tx: Prisma.TransactionClient,
    tenantId: string,
    profileId: string,
  ) {
    const rows = await tx.$queryRaw<{ id: string; isActive: boolean }[]>`
      SELECT "id", "isActive" FROM "WorkProfile"
       WHERE "id" = ${profileId} AND "tenantId" = ${tenantId}
       FOR UPDATE`;
    if (!rows.length)
      throw new NotFoundException('Work profile was not found.');
    return rows[0];
  }

  private async findVersion(
    tx: Prisma.TransactionClient,
    tenantId: string,
    profileId: string,
    versionId: string,
  ) {
    const version = await tx.workProfileVersion.findFirst({
      where: { id: versionId, profileId, tenantId },
      select: { id: true, version: true, status: true, definition: true },
    });
    if (!version)
      throw new NotFoundException('Work profile version was not found.');
    return version;
  }
}
