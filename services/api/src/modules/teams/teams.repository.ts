import { Injectable } from '@nestjs/common';
import { Prisma, TeamType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type PrismaDb = PrismaService | Prisma.TransactionClient;

@Injectable()
export class TeamsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByTenant(
    tenantId: string,
    filters: {
      departmentId?: string;
      businessUnitId?: string;
      teamType?: TeamType;
    } = {},
    db: PrismaDb = this.prisma,
  ) {
    return db.team.findMany({
      where: {
        tenantId,
        ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
        ...(filters.businessUnitId
          ? { businessUnitId: filters.businessUnitId }
          : {}),
        ...(filters.teamType ? { teamType: filters.teamType } : {}),
      },
      include: {
        businessUnit: {
          select: { id: true, name: true, organizationId: true },
        },
        department: {
          select: { id: true, name: true, businessUnitId: true },
        },
        ownerUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        teamRoles: {
          include: {
            role: {
              select: {
                id: true,
                key: true,
                name: true,
                description: true,
                accessLevel: true,
                roleType: true,
                isSystem: true,
                isActive: true,
              },
            },
          },
        },
        _count: {
          select: {
            employees: true,
            members: true,
            teamRoles: true,
          },
        },
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  findByIdAndTenant(
    tenantId: string,
    teamId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.team.findFirst({
      where: { id: teamId, tenantId },
      include: {
        businessUnit: {
          select: { id: true, name: true, organizationId: true },
        },
        department: {
          select: { id: true, name: true, businessUnitId: true },
        },
        ownerUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
        teamRoles: {
          include: {
            role: {
              select: {
                id: true,
                key: true,
                name: true,
                description: true,
                accessLevel: true,
                roleType: true,
                isSystem: true,
                isActive: true,
              },
            },
          },
        },
        _count: {
          select: {
            employees: true,
            members: true,
            teamRoles: true,
          },
        },
      },
    });
  }

  create(data: Prisma.TeamUncheckedCreateInput, db: PrismaDb = this.prisma) {
    return db.team.create({ data });
  }

  update(
    teamId: string,
    data: Prisma.TeamUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.team.update({ where: { id: teamId }, data });
  }

  findDepartmentById(
    tenantId: string,
    departmentId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.department.findFirst({
      where: { tenantId, id: departmentId },
      select: { id: true, businessUnitId: true },
    });
  }

  async replaceMembers(
    tenantId: string,
    teamId: string,
    userIds: string[],
    actorId: string,
    db: PrismaDb = this.prisma,
  ) {
    await db.teamMember.deleteMany({ where: { tenantId, teamId } });

    if (userIds.length > 0) {
      await db.teamMember.createMany({
        data: userIds.map((userId) => ({
          tenantId,
          teamId,
          userId,
          createdById: actorId,
        })),
        skipDuplicates: true,
      });
    }
  }

  findMemberById(
    tenantId: string,
    teamId: string,
    memberId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.teamMember.findFirst({
      where: { id: memberId, tenantId, teamId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  addMember(
    tenantId: string,
    teamId: string,
    userId: string,
    actorId: string,
    isOwner = false,
    db: PrismaDb = this.prisma,
  ) {
    return db.teamMember.upsert({
      where: { teamId_userId: { teamId, userId } },
      create: {
        tenantId,
        teamId,
        userId,
        isOwner,
        createdById: actorId,
        updatedById: actorId,
      },
      update: {
        isOwner,
        updatedById: actorId,
      },
    });
  }

  updateMember(
    memberId: string,
    data: Prisma.TeamMemberUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.teamMember.update({ where: { id: memberId }, data });
  }

  deleteMember(memberId: string, db: PrismaDb = this.prisma) {
    return db.teamMember.delete({ where: { id: memberId } });
  }

  async replaceRoles(
    tenantId: string,
    teamId: string,
    roleIds: string[],
    actorId: string,
    db: PrismaDb = this.prisma,
  ) {
    await db.teamRole.deleteMany({ where: { tenantId, teamId } });

    if (roleIds.length > 0) {
      await db.teamRole.createMany({
        data: roleIds.map((roleId) => ({
          tenantId,
          teamId,
          roleId,
          createdById: actorId,
        })),
        skipDuplicates: true,
      });
    }
  }

  findRoleAssignmentById(
    tenantId: string,
    teamId: string,
    assignmentId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.teamRole.findFirst({
      where: { id: assignmentId, tenantId, teamId },
      include: {
        role: {
          select: {
            id: true,
            key: true,
            name: true,
            description: true,
            accessLevel: true,
            roleType: true,
            isSystem: true,
            isActive: true,
          },
        },
      },
    });
  }

  addRole(
    tenantId: string,
    teamId: string,
    roleId: string,
    actorId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.teamRole.upsert({
      where: { teamId_roleId: { teamId, roleId } },
      create: {
        tenantId,
        teamId,
        roleId,
        createdById: actorId,
        updatedById: actorId,
      },
      update: {
        updatedById: actorId,
      },
    });
  }

  deleteRoleAssignment(assignmentId: string, db: PrismaDb = this.prisma) {
    return db.teamRole.delete({ where: { id: assignmentId } });
  }
}
