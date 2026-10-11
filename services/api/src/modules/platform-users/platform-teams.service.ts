import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PlatformUserStatus, SupportCaseStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  AddPlatformTeamMemberDto,
  ArchivePlatformTeamDto,
  CreatePlatformTeamDto,
  PlatformTeamQueryDto,
  UpdatePlatformTeamDto,
  UpdatePlatformTeamMemberDto,
} from './dto/platform-team.dto';

/*
 * A case in one of these is finished with; reassigning it on archive would
 * rewrite history for no operational benefit, so it keeps pointing at the
 * archived team (archiving never deletes the row, so the reference stays valid).
 */
const CLOSED_CASE_STATUSES: SupportCaseStatus[] = [
  SupportCaseStatus.RESOLVED,
  SupportCaseStatus.CLOSED,
  SupportCaseStatus.CANCELLED,
];

const AUDIT_MODULE = 'platform-teams';

type Db = PrismaService | Prisma.TransactionClient;

const userName = (u: { firstName: string; lastName: string; email: string }) =>
  `${u.firstName} ${u.lastName}`.trim() || u.email;

@Injectable()
export class PlatformTeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PlatformTeamQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const search = query.search?.trim();

    const where: Prisma.PlatformTeamWhereInput = {
      ...(query.active === undefined ? {} : { isActive: query.active }),
      ...(query.category ? { category: query.category } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.platformTeam.findMany({
        where,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          leadUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          _count: { select: { members: true } },
        },
      }),
      this.prisma.platformTeam.count({ where }),
    ]);

    const openByTeam = await this.openCaseCounts(rows.map((row) => row.id));

    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        // The admin runtime lookups read `label`/`name`; carrying both keeps the
        // list usable as a picker source without a second endpoint.
        label: row.name,
        description: row.description,
        category: row.category,
        isActive: row.isActive,
        email: row.email,
        sortOrder: row.sortOrder,
        archivedAt: row.archivedAt,
        leadUser: row.leadUser
          ? {
              id: row.leadUser.id,
              fullName: userName(row.leadUser),
              email: row.leadUser.email,
            }
          : null,
        memberCount: row._count.members,
        openCaseCount: openByTeam.get(row.id) ?? 0,
      })),
      total,
      page,
      pageSize,
    };
  }

  async get(id: string) {
    const team = await this.prisma.platformTeam.findUnique({
      where: { id },
      include: {
        leadUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        members: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: {
            platformUser: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                status: true,
              },
            },
          },
        },
      },
    });
    if (!team) throw this.notFound();

    const openByTeam = await this.openCaseCounts([id]);
    return {
      id: team.id,
      name: team.name,
      label: team.name,
      description: team.description,
      category: team.category,
      isActive: team.isActive,
      email: team.email,
      sortOrder: team.sortOrder,
      archivedAt: team.archivedAt,
      leadUser: team.leadUser
        ? {
            id: team.leadUser.id,
            fullName: userName(team.leadUser),
            email: team.leadUser.email,
          }
        : null,
      memberCount: team.members.length,
      openCaseCount: openByTeam.get(id) ?? 0,
      members: team.members.map((member) => ({
        id: member.id,
        platformUserId: member.platformUserId,
        fullName: userName(member.platformUser),
        email: member.platformUser.email,
        status: member.platformUser.status,
        role: member.role,
        receivesAssignments: member.receivesAssignments,
      })),
    };
  }

  /** For callers that assign work: an archived team is never a valid target. */
  async findActiveTeamOrThrow(id: string) {
    const team = await this.prisma.platformTeam.findFirst({
      where: { id, isActive: true, archivedAt: null },
    });
    if (!team) {
      throw new NotFoundException({
        code: 'PLATFORM_TEAM_NOT_FOUND',
        message: 'That team does not exist or has been archived.',
      });
    }
    return team;
  }

  /**
   * Who a round-robin may hand work to. Ordered by when the person joined and
   * then id so the sequence is identical on every call - a cursor over a list
   * that reshuffles would skip some people and double-serve others.
   */
  async listEligibleAssignees(teamId: string) {
    const members = await this.prisma.platformTeamMember.findMany({
      where: {
        teamId,
        receivesAssignments: true,
        platformUser: { status: PlatformUserStatus.ACTIVE },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: {
        platformUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            status: true,
          },
        },
      },
    });
    return members.map((member) => ({
      memberId: member.id,
      platformUserId: member.platformUserId,
      fullName: userName(member.platformUser),
      email: member.platformUser.email,
    }));
  }

  async create(actor: AuthenticatedUser, dto: CreatePlatformTeamDto) {
    const name = dto.name.trim();
    await this.assertNameFree(name);
    if (dto.leadUserId)
      await this.assertActiveUser(this.prisma, dto.leadUserId);

    const actorId = actor.platform?.id;
    const id = await this.runUnique(() =>
      this.prisma.$transaction(async (tx) => {
        const team = await tx.platformTeam.create({
          data: {
            name,
            description: dto.description || null,
            category: dto.category ?? 'GENERAL',
            email: dto.email || null,
            leadUserId: dto.leadUserId ?? null,
            sortOrder: dto.sortOrder ?? 0,
            createdById: actorId,
            updatedById: actorId,
          },
        });
        if (dto.leadUserId) {
          await this.makeLead(tx, team.id, dto.leadUserId, actorId);
        }
        await this.audit(tx, actor, 'PLATFORM_TEAM_CREATED', team.id, null, {
          name: team.name,
          category: team.category,
          leadUserId: team.leadUserId,
        });
        return team.id;
      }),
    );
    return this.get(id);
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    dto: UpdatePlatformTeamDto,
  ) {
    const before = await this.requireTeam(this.prisma, id);
    const name = dto.name?.trim();
    if (
      name !== undefined &&
      name.toLowerCase() !== before.name.toLowerCase()
    ) {
      await this.assertNameFree(name, id);
    }
    if (dto.leadUserId && dto.leadUserId !== before.leadUserId) {
      await this.assertActiveUser(this.prisma, dto.leadUserId);
    }
    if (dto.isActive === false && before.isActive) {
      // Deactivation goes through the same guard as archive, otherwise a PATCH
      // would be a way around the in-use check.
      throw new BadRequestException({
        code: 'PLATFORM_TEAM_USE_ARCHIVE',
        message: 'Archive the team instead of deactivating it.',
      });
    }

    const actorId = actor.platform?.id;
    await this.runUnique(() =>
      this.prisma.$transaction(async (tx) => {
        const after = await tx.platformTeam.update({
          where: { id },
          data: {
            ...(name !== undefined ? { name } : {}),
            ...(dto.description !== undefined
              ? { description: dto.description || null }
              : {}),
            ...(dto.category !== undefined ? { category: dto.category } : {}),
            ...(dto.email !== undefined ? { email: dto.email || null } : {}),
            ...(dto.sortOrder !== undefined
              ? { sortOrder: dto.sortOrder }
              : {}),
            ...(dto.isActive === true
              ? { isActive: true, archivedAt: null }
              : {}),
            updatedById: actorId,
          },
        });
        if (dto.leadUserId && dto.leadUserId !== before.leadUserId) {
          await this.makeLead(tx, id, dto.leadUserId, actorId);
        }
        await this.audit(
          tx,
          actor,
          'PLATFORM_TEAM_UPDATED',
          id,
          this.snapshot(before),
          this.snapshot({
            ...after,
            leadUserId: dto.leadUserId ?? after.leadUserId,
          }),
        );
      }),
    );
    return this.get(id);
  }

  async archive(
    actor: AuthenticatedUser,
    id: string,
    dto: ArchivePlatformTeamDto,
  ) {
    const team = await this.requireTeam(this.prisma, id);
    if (!team.isActive) return this.get(id);

    const target = dto.reassignToTeamId;
    if (target === id) {
      throw new BadRequestException({
        code: 'PLATFORM_TEAM_REASSIGN_SELF',
        message: 'Choose a different team to move the work to.',
      });
    }
    const targetTeam = target ? await this.findActiveTeamOrThrow(target) : null;

    const actorId = actor.platform?.id;
    await this.prisma.$transaction(async (tx) => {
      // Counted inside the transaction so a case assigned between the check and
      // the archive cannot slip through.
      const openCases = await tx.supportCase.count({
        where: { assignedTeamId: id, status: { notIn: CLOSED_CASE_STATUSES } },
      });
      const activeRules = await tx.recordAssignmentRule.count({
        where: { targetTeamId: id, isActive: true },
      });

      let movedCases = 0;
      let movedRules = 0;
      if (openCases > 0 || activeRules > 0) {
        if (!targetTeam) {
          throw new ConflictException({
            code: 'PLATFORM_TEAM_IN_USE',
            message:
              'This team still has open support cases or active assignment rules. Choose a team to move them to.',
            details: { openCaseCount: openCases, activeRuleCount: activeRules },
          });
        }
        movedCases = (
          await tx.supportCase.updateMany({
            where: {
              assignedTeamId: id,
              status: { notIn: CLOSED_CASE_STATUSES },
            },
            data: {
              assignedTeamId: targetTeam.id,
              assignedTeam: targetTeam.name,
            },
          })
        ).count;
        movedRules = (
          await tx.recordAssignmentRule.updateMany({
            where: { targetTeamId: id, isActive: true },
            data: { targetTeamId: targetTeam.id, updatedById: actorId },
          })
        ).count;
      }

      await tx.platformTeam.update({
        where: { id },
        data: { isActive: false, archivedAt: new Date(), updatedById: actorId },
      });
      await this.audit(
        tx,
        actor,
        'PLATFORM_TEAM_ARCHIVED',
        id,
        this.snapshot(team),
        {
          isActive: false,
          reassignedToTeamId: targetTeam?.id ?? null,
          movedCases,
          movedRules,
        },
      );
    });
    return this.get(id);
  }

  async restore(actor: AuthenticatedUser, id: string) {
    const team = await this.requireTeam(this.prisma, id);
    if (team.isActive) return this.get(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.platformTeam.update({
        where: { id },
        data: {
          isActive: true,
          archivedAt: null,
          updatedById: actor.platform?.id,
        },
      });
      await this.audit(
        tx,
        actor,
        'PLATFORM_TEAM_RESTORED',
        id,
        this.snapshot(team),
        { isActive: true },
      );
    });
    return this.get(id);
  }

  async remove(actor: AuthenticatedUser, id: string) {
    const team = await this.requireTeam(this.prisma, id);
    await this.prisma.$transaction(async (tx) => {
      const cases = await tx.supportCase.count({
        where: { assignedTeamId: id },
      });
      const rules = await tx.recordAssignmentRule.count({
        where: { targetTeamId: id },
      });
      if (cases > 0 || rules > 0) {
        // The FKs are Restrict, so the database would refuse anyway; checking
        // first turns an opaque P2003 into advice the operator can act on.
        throw new ConflictException({
          code: 'PLATFORM_TEAM_IN_USE',
          message:
            'This team is referenced by support cases or assignment rules, so it cannot be deleted. Archive it instead.',
          details: { caseCount: cases, ruleCount: rules },
        });
      }
      await tx.platformTeamMember.deleteMany({ where: { teamId: id } });
      await tx.platformTeam.delete({ where: { id } });
      await this.audit(
        tx,
        actor,
        'PLATFORM_TEAM_DELETED',
        id,
        this.snapshot(team),
        null,
      );
    });
    return { id, deleted: true };
  }

  async addMember(
    actor: AuthenticatedUser,
    teamId: string,
    dto: AddPlatformTeamMemberDto,
  ) {
    await this.requireTeam(this.prisma, teamId);
    await this.assertActiveUser(this.prisma, dto.platformUserId);

    const existing = await this.prisma.platformTeamMember.findFirst({
      where: { teamId, platformUserId: dto.platformUserId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        code: 'PLATFORM_TEAM_MEMBER_EXISTS',
        message: 'That person is already on this team.',
      });
    }

    const actorId = actor.platform?.id;
    await this.prisma.$transaction(async (tx) => {
      const member = await tx.platformTeamMember.create({
        data: {
          teamId,
          platformUserId: dto.platformUserId,
          role: 'MEMBER',
          receivesAssignments: dto.receivesAssignments ?? true,
          createdById: actorId,
        },
      });
      if (dto.role === 'LEAD') {
        await this.makeLead(tx, teamId, dto.platformUserId, actorId);
      }
      await this.audit(tx, actor, 'PLATFORM_TEAM_MEMBER_ADDED', teamId, null, {
        memberId: member.id,
        platformUserId: dto.platformUserId,
        role: dto.role ?? 'MEMBER',
        receivesAssignments: member.receivesAssignments,
      });
    });
    return this.get(teamId);
  }

  async updateMember(
    actor: AuthenticatedUser,
    teamId: string,
    memberId: string,
    dto: UpdatePlatformTeamMemberDto,
  ) {
    const team = await this.requireTeam(this.prisma, teamId);
    const member = await this.requireMember(teamId, memberId);
    const actorId = actor.platform?.id;

    await this.prisma.$transaction(async (tx) => {
      if (dto.receivesAssignments !== undefined) {
        await tx.platformTeamMember.update({
          where: { id: memberId },
          data: { receivesAssignments: dto.receivesAssignments },
        });
      }
      if (dto.role === 'LEAD' && member.role !== 'LEAD') {
        await this.assertActiveUser(tx, member.platformUserId);
        await this.makeLead(tx, teamId, member.platformUserId, actorId);
      } else if (dto.role === 'MEMBER' && member.role === 'LEAD') {
        await tx.platformTeamMember.update({
          where: { id: memberId },
          data: { role: 'MEMBER' },
        });
        if (team.leadUserId === member.platformUserId) {
          await tx.platformTeam.update({
            where: { id: teamId },
            data: { leadUserId: null, updatedById: actorId },
          });
        }
      }
      await this.audit(
        tx,
        actor,
        'PLATFORM_TEAM_MEMBER_UPDATED',
        teamId,
        {
          memberId,
          role: member.role,
          receivesAssignments: member.receivesAssignments,
        },
        {
          memberId,
          role: dto.role ?? member.role,
          receivesAssignments:
            dto.receivesAssignments ?? member.receivesAssignments,
        },
      );
    });
    return this.get(teamId);
  }

  async removeMember(
    actor: AuthenticatedUser,
    teamId: string,
    memberId: string,
  ) {
    const team = await this.requireTeam(this.prisma, teamId);
    const member = await this.requireMember(teamId, memberId);
    await this.prisma.$transaction(async (tx) => {
      await tx.platformTeamMember.delete({ where: { id: memberId } });
      if (team.leadUserId === member.platformUserId) {
        // A lead who is no longer on the team must not stay recorded as its lead.
        await tx.platformTeam.update({
          where: { id: teamId },
          data: { leadUserId: null, updatedById: actor.platform?.id },
        });
      }
      await this.audit(
        tx,
        actor,
        'PLATFORM_TEAM_MEMBER_REMOVED',
        teamId,
        {
          memberId,
          platformUserId: member.platformUserId,
          role: member.role,
        },
        null,
      );
    });
    return this.get(teamId);
  }

  /* ------------------------------------------------------------------ */

  /**
   * One lead per team, kept consistent in both places it is recorded
   * (`PlatformTeam.leadUserId` and the member row's role). The person is added
   * as a member if they were not one already - a lead who receives no
   * membership row would be invisible to the member list.
   */
  private async makeLead(
    tx: Prisma.TransactionClient,
    teamId: string,
    platformUserId: string,
    actorId: string | undefined,
  ) {
    await tx.platformTeamMember.updateMany({
      where: { teamId, role: 'LEAD', NOT: { platformUserId } },
      data: { role: 'MEMBER' },
    });
    const existing = await tx.platformTeamMember.findFirst({
      where: { teamId, platformUserId },
      select: { id: true },
    });
    if (existing) {
      await tx.platformTeamMember.update({
        where: { id: existing.id },
        data: { role: 'LEAD' },
      });
    } else {
      await tx.platformTeamMember.create({
        data: { teamId, platformUserId, role: 'LEAD', createdById: actorId },
      });
    }
    await tx.platformTeam.update({
      where: { id: teamId },
      data: { leadUserId: platformUserId, updatedById: actorId },
    });
  }

  private async openCaseCounts(teamIds: string[]) {
    const counts = new Map<string, number>();
    if (teamIds.length === 0) return counts;
    const grouped = await this.prisma.supportCase.groupBy({
      by: ['assignedTeamId'],
      where: {
        assignedTeamId: { in: teamIds },
        status: { notIn: CLOSED_CASE_STATUSES },
      },
      _count: { _all: true },
    });
    for (const row of grouped) {
      if (row.assignedTeamId) counts.set(row.assignedTeamId, row._count._all);
    }
    return counts;
  }

  private async requireTeam(db: Db, id: string) {
    const team = await db.platformTeam.findUnique({ where: { id } });
    if (!team) throw this.notFound();
    return team;
  }

  private async requireMember(teamId: string, memberId: string) {
    const member = await this.prisma.platformTeamMember.findFirst({
      where: { id: memberId, teamId },
    });
    if (!member) {
      throw new NotFoundException({
        code: 'PLATFORM_TEAM_MEMBER_NOT_FOUND',
        message: 'That person is not on this team.',
      });
    }
    return member;
  }

  private notFound() {
    return new NotFoundException({
      code: 'PLATFORM_TEAM_NOT_FOUND',
      message: 'That team does not exist.',
    });
  }

  private async assertActiveUser(db: Db, platformUserId: string) {
    const user = await db.platformUser.findUnique({
      where: { id: platformUserId },
      select: { id: true, status: true },
    });
    if (!user) {
      throw new NotFoundException({
        code: 'PLATFORM_USER_NOT_FOUND',
        message: 'That platform user does not exist.',
      });
    }
    if (user.status !== PlatformUserStatus.ACTIVE) {
      throw new BadRequestException({
        code: 'PLATFORM_USER_NOT_ACTIVE',
        message: 'Only active platform users can be on a team.',
      });
    }
  }

  /** Case-insensitive: the column's unique index is case-sensitive. */
  private async assertNameFree(name: string, exceptId?: string) {
    const clash = await this.prisma.platformTeam.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw this.nameTaken();
  }

  private nameTaken() {
    return new ConflictException({
      code: 'PLATFORM_TEAM_NAME_TAKEN',
      message: 'A team with that name already exists.',
    });
  }

  /** The pre-check can race; the unique index is the backstop. */
  private async runUnique<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw this.nameTaken();
      }
      throw error;
    }
  }

  private snapshot(team: {
    name: string;
    description: string | null;
    category: string;
    isActive: boolean;
    email: string | null;
    sortOrder: number;
    leadUserId: string | null;
  }) {
    return {
      name: team.name,
      description: team.description,
      category: team.category,
      isActive: team.isActive,
      email: team.email,
      sortOrder: team.sortOrder,
      leadUserId: team.leadUserId,
    };
  }

  private async audit(
    db: Db,
    actor: AuthenticatedUser,
    action: string,
    entityId: string,
    beforeSnapshot: Prisma.InputJsonValue | null,
    afterSnapshot: Prisma.InputJsonValue | null,
  ) {
    if (!actor.platform?.id) {
      throw new ForbiddenException('Platform user access is required.');
    }
    // Written the way PlatformUsersService writes its own audit rows: straight
    // to PlatformAuditLog, on the caller's transaction so the row commits or
    // rolls back with the change it describes.
    await db.platformAuditLog.create({
      data: {
        platformActorUserId: actor.platform.id,
        action,
        entityType: 'PlatformTeam',
        entityId,
        sourceModule: AUDIT_MODULE,
        ...(beforeSnapshot ? { beforeSnapshot } : {}),
        ...(afterSnapshot ? { afterSnapshot } : {}),
      },
    });
  }
}
