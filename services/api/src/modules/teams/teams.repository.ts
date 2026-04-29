import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

type PrismaDb = PrismaService | Prisma.TransactionClient;

@Injectable()
export class TeamsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByTenant(tenantId: string, db: PrismaDb = this.prisma) {
    return db.team.findMany({
      where: { tenantId },
      include: {
        businessUnit: {
          select: { id: true, name: true, organizationId: true },
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
                roleType: true,
                isSystem: true,
                isActive: true,
              },
            },
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
                roleType: true,
                isSystem: true,
                isActive: true,
              },
            },
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
}
