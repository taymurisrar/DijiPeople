import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PlatformUserRole, PlatformUserStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { platformAccessForRole } from '../platform-auth/platform-permissions';
import { PlatformUsersService } from './platform-users.service';

/*
 * ADR-0018 and BUG-3547. Managing platform users is the `platform-users.manage`
 * platform permission, and PLATFORM_OWNER and MEMBER are no longer given to
 * anyone new. Actors are built from `platformAccessForRole`, the same function
 * a real platform session is built from.
 */
function actorFor(role: PlatformUserRole): AuthenticatedUser {
  const access = platformAccessForRole(role);
  return {
    userId: `actor-${role}`,
    tenantId: 'platform',
    roleIds: [role],
    roleKeys: access.roleKeys,
    permissionKeys: access.permissionKeys,
    rolePrivileges: [],
    authSubjectType: 'platform-user',
    platform: {
      id: `actor-${role}`,
      role,
      status: PlatformUserStatus.ACTIVE,
    },
  } as unknown as AuthenticatedUser;
}

describe('platform user management authorization (ADR-0018)', () => {
  const prisma = {
    platformUser: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    platformRefreshToken: { updateMany: jest.fn() },
    platformAuditLog: { create: jest.fn() },
  };
  const service = new PlatformUsersService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.platformUser.findMany.mockResolvedValue([]);
    prisma.platformUser.create.mockResolvedValue({
      id: 'new-user',
      email: 'new@dijipeople.local',
      role: PlatformUserRole.PLATFORM_ADMIN,
      status: PlatformUserStatus.ACTIVE,
    });
  });

  const MANAGERS = [
    PlatformUserRole.SUPER_ADMIN,
    PlatformUserRole.PLATFORM_OWNER,
  ];

  it.each(MANAGERS)('lets %s list platform users', async (role) => {
    await expect(service.list(actorFor(role))).resolves.toEqual([]);
  });

  it.each(
    Object.values(PlatformUserRole).filter((role) => !MANAGERS.includes(role)),
  )('refuses %s, which does not hold platform-users.manage', async (role) => {
    await expect(service.list(actorFor(role))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.platformUser.findMany).not.toHaveBeenCalled();
  });

  it('refuses a tenant user carrying the system-admin role key', async () => {
    const tenantUser = {
      userId: 'tenant-user',
      tenantId: 'tenant-a',
      roleIds: [],
      roleKeys: ['system-admin', 'SUPER_ADMIN'],
      permissionKeys: ['platform.*'],
      rolePrivileges: [],
    } as unknown as AuthenticatedUser;
    await expect(service.list(tenantUser)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  describe('BUG-3547 new assignments of retired roles', () => {
    const createDto = (role: PlatformUserRole) => ({
      email: 'new@dijipeople.local',
      firstName: 'New',
      lastName: 'User',
      password: 'Sufficiently-Long-1',
      role,
    });

    it.each([PlatformUserRole.PLATFORM_OWNER, PlatformUserRole.MEMBER])(
      'refuses to create a user as %s',
      async (role) => {
        await expect(
          service.create(
            actorFor(PlatformUserRole.SUPER_ADMIN),
            createDto(role),
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.platformUser.create).not.toHaveBeenCalled();
      },
    );

    it('names the role to use instead', async () => {
      await expect(
        service.create(
          actorFor(PlatformUserRole.SUPER_ADMIN),
          createDto(PlatformUserRole.PLATFORM_OWNER),
        ),
      ).rejects.toMatchObject({
        response: {
          code: 'PLATFORM_ROLE_NOT_ASSIGNABLE',
          message: expect.stringContaining('Platform Super Admin') as unknown,
        },
      });
    });

    it('still creates an assignable role', async () => {
      await expect(
        service.create(
          actorFor(PlatformUserRole.SUPER_ADMIN),
          createDto(PlatformUserRole.PLATFORM_ADMIN),
        ),
      ).resolves.toEqual({ userId: 'new-user', id: 'new-user' });
    });

    it.each([PlatformUserRole.PLATFORM_OWNER, PlatformUserRole.MEMBER])(
      'refuses to change an existing user to %s',
      async (role) => {
        prisma.platformUser.findUnique.mockResolvedValue({
          id: 'user-1',
          role: PlatformUserRole.PLATFORM_ADMIN,
          status: PlatformUserStatus.ACTIVE,
        });
        await expect(
          service.update(actorFor(PlatformUserRole.SUPER_ADMIN), 'user-1', {
            role,
          }),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.platformUser.update).not.toHaveBeenCalled();
      },
    );

    it('keeps an existing MEMBER working: saving them with their own role is allowed', async () => {
      const member = {
        id: 'member-1',
        email: 'member@dijipeople.local',
        firstName: 'Legacy',
        lastName: 'Member',
        role: PlatformUserRole.MEMBER,
        status: PlatformUserStatus.ACTIVE,
      };
      prisma.platformUser.findUnique.mockResolvedValue(member);
      prisma.platformUser.update.mockResolvedValue({
        ...member,
        firstName: 'Renamed',
      });

      await expect(
        service.update(actorFor(PlatformUserRole.SUPER_ADMIN), 'member-1', {
          firstName: 'Renamed',
          role: PlatformUserRole.MEMBER,
        }),
      ).resolves.toMatchObject({ role: PlatformUserRole.MEMBER });
    });
  });

  it('still enforces the last-Super-Admin invariant for a Super Admin actor', async () => {
    prisma.platformUser.findUnique.mockResolvedValue({
      id: 'sa-2',
      role: PlatformUserRole.SUPER_ADMIN,
      status: PlatformUserStatus.ACTIVE,
    });
    prisma.platformUser.count.mockResolvedValue(1);

    await expect(
      service.update(actorFor(PlatformUserRole.SUPER_ADMIN), 'sa-2', {
        role: PlatformUserRole.PLATFORM_ADMIN,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.platformUser.update).not.toHaveBeenCalled();
  });
});
