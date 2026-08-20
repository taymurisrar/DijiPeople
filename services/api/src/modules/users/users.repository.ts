import { Injectable } from '@nestjs/common';
import { Prisma, TeamType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ensureIdentityForEmail,
  mirrorPasswordToIdentity,
} from './identity.service';

type PrismaDb = PrismaService | Prisma.TransactionClient;
/**
 * What a caller has to supply to create a user.
 *
 * `businessUnitId` and `identityId` are both optional here and both required on
 * the model: this repository derives them. The tenant's default business unit
 * is looked up, and the identity is resolved or created from the email.
 *
 * Making `identityId` optional in this type is what keeps the contract phase
 * from becoming a six-file change — the compiler listed exactly six callers
 * when it briefly was required, which is also the clearest evidence that this
 * method is the right chokepoint for the rule.
 */
type UserCreateInput = Omit<
  Prisma.UserUncheckedCreateInput,
  'businessUnitId' | 'identityId'
> & {
  businessUnitId?: string;
  identityId?: string;
};

const roleAccessInclude = {
  rolePermissions: {
    include: {
      permission: true,
    },
  },
  rolePrivileges: true,
  miscPermissions: true,
} satisfies Prisma.RoleInclude;

const teamMembershipAccessInclude = {
  team: {
    include: {
      teamRoles: {
        include: {
          role: {
            include: roleAccessInclude,
          },
        },
      },
    },
  },
} satisfies Prisma.TeamMemberInclude;

const linkedEmployeeSelect = {
  id: true,
  employeeCode: true,
  firstName: true,
  lastName: true,
  email: true,
  employmentStatus: true,
  hireDate: true,
  organization: { select: { id: true, name: true } },
  businessUnitId: true,
  businessUnit: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  team: { select: { id: true, name: true } },
  designation: { select: { id: true, name: true } },
  manager: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
} satisfies Prisma.EmployeeSelect;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByTenant(
    tenantId: string,
    accessWhere: Prisma.UserWhereInput = {},
    db: PrismaDb = this.prisma,
  ) {
    return db.user.findMany({
      where: { AND: [{ tenantId }, accessWhere] },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            ownerUserId: true,
          },
        },
        businessUnit: {
          select: {
            id: true,
            name: true,
            organizationId: true,
            organization: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        employee: { select: linkedEmployeeSelect },
        userPermissions: {
          include: {
            permission: true,
          },
        },
        userRoles: {
          include: {
            role: {
              include: roleAccessInclude,
            },
          },
        },
        teamMemberships: {
          include: teamMembershipAccessInclude,
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  findByTenantSlugAndEmail(
    tenantSlug: string,
    email: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.user.findFirst({
      where: {
        email: email.trim().toLowerCase(),
        tenant: {
          slug: tenantSlug.trim(),
        },
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            ownerUserId: true,
          },
        },
        businessUnit: {
          select: {
            id: true,
            name: true,
            organizationId: true,
            organization: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        employee: { select: linkedEmployeeSelect },
        userPermissions: {
          include: {
            permission: true,
          },
        },
        userRoles: {
          include: {
            role: {
              include: roleAccessInclude,
            },
          },
        },
        teamMemberships: {
          include: teamMembershipAccessInclude,
        },
      },
    });
  }

  findByTenantIdAndEmail(
    tenantId: string,
    email: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.user.findFirst({
      where: {
        tenantId,
        email: email.trim().toLowerCase(),
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            ownerUserId: true,
          },
        },
        businessUnit: {
          select: {
            id: true,
            name: true,
            organizationId: true,
            organization: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        employee: { select: linkedEmployeeSelect },
        userPermissions: {
          include: {
            permission: true,
          },
        },
        userRoles: {
          include: {
            role: {
              include: roleAccessInclude,
            },
          },
        },
        teamMemberships: {
          include: teamMembershipAccessInclude,
        },
      },
    });
  }

  findByEmail(email: string, db: PrismaDb = this.prisma) {
    return db.user.findFirst({
      where: {
        email: email.trim().toLowerCase(),
      },
    });
  }

  findByEmailWithAccess(email: string, db: PrismaDb = this.prisma) {
    return db.user.findFirst({
      where: {
        email: email.trim().toLowerCase(),
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            ownerUserId: true,
          },
        },
        businessUnit: {
          select: {
            id: true,
            name: true,
            organizationId: true,
            organization: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        employee: { select: linkedEmployeeSelect },
        userPermissions: {
          include: {
            permission: true,
          },
        },
        userRoles: {
          include: {
            role: {
              include: roleAccessInclude,
            },
          },
        },
        teamMemberships: {
          include: teamMembershipAccessInclude,
        },
      },
    });
  }

  findManyByEmailWithAccess(email: string, db: PrismaDb = this.prisma) {
    return db.user.findMany({
      where: {
        email: email.trim().toLowerCase(),
      },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            ownerUserId: true,
          },
        },
        businessUnit: {
          select: {
            id: true,
            name: true,
            organizationId: true,
            organization: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        employee: { select: linkedEmployeeSelect },
        userPermissions: {
          include: {
            permission: true,
          },
        },
        userRoles: {
          include: {
            role: {
              include: roleAccessInclude,
            },
          },
        },
        teamMemberships: {
          include: teamMembershipAccessInclude,
        },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  findByIdWithAccess(id: string, db: PrismaDb = this.prisma) {
    return db.user.findUnique({
      where: { id },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            ownerUserId: true,
          },
        },
        businessUnit: {
          select: {
            id: true,
            name: true,
            organizationId: true,
            organization: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        employee: { select: linkedEmployeeSelect },
        userPermissions: {
          include: {
            permission: true,
          },
        },
        userRoles: {
          include: {
            role: {
              include: roleAccessInclude,
            },
          },
        },
        teamMemberships: {
          include: teamMembershipAccessInclude,
        },
      },
    });
  }

  create(data: UserCreateInput, db: PrismaDb = this.prisma) {
    return this.createWithDefaultBusinessUnit(data, db);
  }

  async update(
    userId: string,
    data: Prisma.UserUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    const updated = await db.user.update({
      where: { id: userId },
      data,
    });

    /*
     * A password set through this path has to reach the identity too.
     *
     * Invitation acceptance is the caller that matters — somebody choosing
     * their password for the first time. Once login reads the identity, a
     * password that landed only on `User` would leave them unable to sign in
     * with the password they had just chosen and watched be accepted.
     *
     * Guarded on the field being present rather than mirroring unconditionally,
     * because most updates here are names and status and have no business
     * touching a credential. `typeof === 'string'` because Prisma's update
     * input also permits `{ set: … }`, and passing that object through as a
     * hash would store the literal `[object Object]`.
     */
    if (typeof data.passwordHash === 'string') {
      await mirrorPasswordToIdentity(db, userId, data.passwordHash);
    }

    return updated;
  }

  delete(userId: string, db: PrismaDb = this.prisma) {
    return db.user.delete({
      where: { id: userId },
    });
  }

  markLastLogin(userId: string, db: PrismaDb = this.prisma) {
    return db.user.update({
      where: { id: userId },
      data: {
        lastLoginAt: new Date(),
      },
    });
  }

  async replaceRoles(
    tenantId: string,
    userId: string,
    roleIds: string[],
    createdById: string,
    db: PrismaDb = this.prisma,
  ) {
    await db.userRole.deleteMany({
      where: { userId },
    });

    if (roleIds.length > 0) {
      await db.userRole.createMany({
        data: roleIds.map((roleId) => ({
          tenantId,
          userId,
          roleId,
          createdById,
        })),
      });
    }

    return this.findByIdWithAccess(userId, db);
  }

  async replaceDirectPermissions(
    tenantId: string,
    userId: string,
    permissionIds: string[],
    createdById: string,
    db: PrismaDb = this.prisma,
  ) {
    await db.userPermission.deleteMany({
      where: { tenantId, userId },
    });

    if (permissionIds.length > 0) {
      await db.userPermission.createMany({
        data: permissionIds.map((permissionId) => ({
          tenantId,
          userId,
          permissionId,
          createdById,
        })),
        skipDuplicates: true,
      });
    }

    return this.findByIdWithAccess(userId, db);
  }

  async findTenantOwnerUserId(tenantId: string, db: PrismaDb = this.prisma) {
    const tenant = await db.tenant.findUnique({
      where: { id: tenantId },
      select: {
        ownerUserId: true,
      },
    });

    return tenant?.ownerUserId ?? null;
  }

  findBusinessUnitById(
    tenantId: string,
    businessUnitId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.businessUnit.findFirst({
      where: {
        id: businessUnitId,
        tenantId,
      },
      select: {
        id: true,
      },
    });
  }

  findEmployeeForLinking(
    tenantId: string,
    employeeId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.employee.findFirst({
      where: {
        id: employeeId,
        tenantId,
      },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        email: true,
        businessUnitId: true,
        userId: true,
      },
    });
  }

  linkEmployee(
    tenantId: string,
    userId: string,
    employeeId: string,
    actorId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.employee.updateMany({
      where: {
        id: employeeId,
        tenantId,
        OR: [{ userId: null }, { userId }],
      },
      data: {
        userId,
        updatedById: actorId,
      },
    });
  }

  unlinkEmployee(
    tenantId: string,
    userId: string,
    actorId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.employee.updateMany({
      where: {
        tenantId,
        userId,
      },
      data: {
        userId: null,
        updatedById: actorId,
      },
    });
  }

  listUserRoles(tenantId: string, userId: string, db: PrismaDb = this.prisma) {
    return db.userRole.findMany({
      where: { tenantId, userId },
      include: {
        role: {
          select: {
            id: true,
            name: true,
            key: true,
            description: true,
            roleType: true,
            accessLevel: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  addUserRole(
    tenantId: string,
    userId: string,
    roleId: string,
    actorId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.userRole.create({
      data: { tenantId, userId, roleId, createdById: actorId },
      include: {
        role: {
          select: {
            id: true,
            name: true,
            key: true,
            description: true,
            roleType: true,
            accessLevel: true,
            isActive: true,
          },
        },
      },
    });
  }

  removeUserRole(
    tenantId: string,
    userId: string,
    userRoleId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.userRole.deleteMany({
      where: { id: userRoleId, tenantId, userId },
    });
  }

  listAccessTeamMemberships(
    tenantId: string,
    userId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.teamMember.findMany({
      where: { tenantId, userId, team: { teamType: TeamType.ACCESS } },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            key: true,
            description: true,
            teamType: true,
            isActive: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  addAccessTeamMembership(
    tenantId: string,
    userId: string,
    teamId: string,
    isOwner: boolean,
    actorId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.teamMember.create({
      data: { tenantId, userId, teamId, isOwner, createdById: actorId },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            key: true,
            description: true,
            teamType: true,
            isActive: true,
          },
        },
      },
    });
  }

  updateAccessTeamMembership(
    tenantId: string,
    userId: string,
    teamMemberId: string,
    data: Prisma.TeamMemberUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.teamMember.updateMany({
      where: {
        id: teamMemberId,
        tenantId,
        userId,
        team: { teamType: 'ACCESS' },
      },
      data,
    });
  }

  removeAccessTeamMembership(
    tenantId: string,
    userId: string,
    teamMemberId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.teamMember.deleteMany({
      where: {
        id: teamMemberId,
        tenantId,
        userId,
        team: { teamType: 'ACCESS' },
      },
    });
  }

  findActiveAccessTeam(
    tenantId: string,
    teamId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.team.findFirst({
      where: {
        id: teamId,
        tenantId,
        teamType: TeamType.ACCESS,
        isActive: true,
      },
      select: { id: true },
    });
  }

  listSessions(tenantId: string, userId: string, db: PrismaDb = this.prisma) {
    return db.refreshToken.findMany({
      where: { tenantId, userId },
      select: {
        id: true,
        appClientId: true,
        sessionId: true,
        deviceId: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        lastActivityAt: true,
        lastUsedAt: true,
        expiresAt: true,
        absoluteExpiresAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  revokeSession(
    tenantId: string,
    userId: string,
    sessionRecordId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.refreshToken.updateMany({
      where: {
        tenantId,
        userId,
        revokedAt: null,
        OR: [{ id: sessionRecordId }, { sessionId: sessionRecordId }],
      },
      data: { revokedAt: new Date() },
    });
  }

  revokeAllSessions(
    tenantId: string,
    userId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.refreshToken.updateMany({
      where: { tenantId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  listLoginHistory(
    tenantId: string,
    userId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.auditLog.findMany({
      where: {
        tenantId,
        OR: [
          { actorUserId: userId, entityType: 'AUTH_LOGIN' },
          { entityType: 'AUTH_LOGIN', entityId: userId },
        ],
      },
      include: {
        actorUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  private async createWithDefaultBusinessUnit(
    data: UserCreateInput,
    db: PrismaDb,
  ) {
    const businessUnitId =
      data.businessUnitId ??
      (await this.ensureTenantDefaultBusinessUnitId(data.tenantId, db));

    /*
     * Every account belongs to a person, and this is the path almost every
     * account is created through.
     *
     * `identityId` is nullable during the expand phase, which makes forgetting
     * this silent: the user is created, everything works, and the row is
     * invisible until the contract phase in WP-09 tries to make the column
     * required and finds rows it cannot fill. `user-creation-links-identity`
     * fails the build rather than leaving that to be discovered later.
     *
     * A caller that already resolved the identity — because it is attaching an
     * existing person to a second workspace — passes it and is not overridden.
     */
    const identityId =
      data.identityId ??
      (await ensureIdentityForEmail(db, data.email, data.passwordHash));

    return db.user.create({
      data: {
        ...data,
        businessUnitId,
        identityId,
      },
    });
  }

  private async ensureTenantDefaultBusinessUnitId(
    tenantId: string,
    db: PrismaDb,
  ) {
    const existingBusinessUnit = await db.businessUnit.findFirst({
      where: { tenantId },
      orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
      select: { id: true },
    });

    if (existingBusinessUnit) {
      return existingBusinessUnit.id;
    }

    const organization =
      (await db.organization.findFirst({
        where: { tenantId },
        orderBy: [{ createdAt: 'asc' }, { name: 'asc' }],
        select: { id: true },
      })) ??
      (await db.organization.create({
        data: {
          tenantId,
          name: 'Default Organization',
        },
        select: { id: true },
      }));

    const businessUnit = await db.businessUnit.create({
      data: {
        tenantId,
        organizationId: organization.id,
        name: 'Default Business Unit',
      },
      select: { id: true },
    });

    return businessUnit.id;
  }
}
