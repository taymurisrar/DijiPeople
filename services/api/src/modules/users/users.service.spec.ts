import { ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';
import { ROLE_KEYS } from '../../common/constants/rbac-matrix';

/**
 * AUTHZ-01 (CRITICAL/P0, confirmed privilege escalation). `POST
 * /users/:userId/roles` (`addRole`) let any actor holding
 * `users.assign-roles` + `USERS:assign` grant `GLOBAL_ADMIN` to any user in
 * the tenant — including themselves — with none of the escalation checks its
 * sibling `PUT /users/:userId/roles` (`assignRoles`) already applied under
 * the identical permission pair. Both endpoints now call one shared method,
 * `assertRoleGrantWithinActorAuthority` — this spec fails if either stops
 * calling it, not just if the logic itself regresses.
 */
describe('UsersService role-grant escalation guard (AUTHZ-01)', () => {
  const TENANT_ID = 'tenant-1';
  const OWNER_ID = 'owner-1';
  const ACTOR_ID = 'actor-non-owner';
  const TARGET_ID = 'target-non-owner';
  const GLOBAL_ADMIN_ROLE_ID = 'role-global-admin';
  const ORDINARY_ROLE_ID = 'role-ordinary';

  function buildUser(id: string, overrides: Record<string, unknown> = {}) {
    return {
      id,
      tenantId: TENANT_ID,
      firstName: 'First',
      lastName: 'Last',
      email: `${id}@example.com`,
      status: 'ACTIVE',
      isServiceAccount: false,
      lastLoginAt: null,
      createdById: null,
      businessUnitId: null,
      businessUnit: null,
      employee: null,
      tenant: { ownerUserId: OWNER_ID },
      userRoles: [],
      teamMemberships: [],
      userPermissions: [],
      ...overrides,
    };
  }

  function buildService(options: {
    actorRoleKeys?: string[];
    roleRows: Array<{
      id: string;
      isSystem: boolean;
      key: string;
      isActive: boolean;
    }>;
  }) {
    const actor = buildUser(ACTOR_ID, {
      userRoles: (options.actorRoleKeys ?? []).map((key, index) => ({
        role: { id: `actor-role-${index}`, key, isActive: true },
      })),
    });
    const target = buildUser(TARGET_ID);

    const usersRepository = {
      findByIdWithAccess: jest.fn((id: string) =>
        Promise.resolve(id === ACTOR_ID ? actor : target),
      ),
      findTenantOwnerUserId: jest.fn().mockResolvedValue(OWNER_ID),
      addUserRole: jest.fn().mockResolvedValue({
        id: 'user-role-1',
        roleId: GLOBAL_ADMIN_ROLE_ID,
        createdAt: new Date(),
        createdById: ACTOR_ID,
        role: {
          name: 'Global Admin',
          description: '',
          roleType: 'SYSTEM',
          accessLevel: 'FULL',
        },
      }),
      replaceRoles: jest.fn().mockResolvedValue(target),
    };

    const rolesRepository = {
      findByIds: jest.fn().mockResolvedValue(options.roleRows),
      findByKeyAndTenant: jest.fn().mockResolvedValue(null),
    };

    const service = new UsersService(
      usersRepository as never,
      rolesRepository as never,
      {} as never,
      { log: jest.fn() } as never,
      {} as never,
    );

    return { service, usersRepository, rolesRepository };
  }

  const globalAdminRole = {
    id: GLOBAL_ADMIN_ROLE_ID,
    isSystem: true,
    key: ROLE_KEYS.GLOBAL_ADMIN,
    isActive: true,
  };
  const ordinaryRole = {
    id: ORDINARY_ROLE_ID,
    isSystem: false,
    key: 'employee',
    isActive: true,
  };

  it('addRole rejects a non-owner, non-system-admin actor granting GLOBAL_ADMIN to a non-owner target', async () => {
    const { service } = buildService({ roleRows: [globalAdminRole] });

    await expect(
      service.addRole(TENANT_ID, TARGET_ID, GLOBAL_ADMIN_ROLE_ID, ACTOR_ID),
    ).rejects.toThrow(ForbiddenException);
  });

  it('assignRoles rejects the identical scenario — proving both endpoints enforce the same rule', async () => {
    const { service } = buildService({ roleRows: [globalAdminRole] });

    await expect(
      service.assignRoles(
        TENANT_ID,
        TARGET_ID,
        [GLOBAL_ADMIN_ROLE_ID],
        ACTOR_ID,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('addRole rejects granting a system role without SYSTEM_ADMIN or owner standing', async () => {
    const systemRole = {
      ...ordinaryRole,
      isSystem: true,
      key: 'some-system-role',
    };
    const { service } = buildService({ roleRows: [systemRole] });

    await expect(
      service.addRole(TENANT_ID, TARGET_ID, ORDINARY_ROLE_ID, ACTOR_ID),
    ).rejects.toThrow(ForbiddenException);
  });

  it('addRole allows an ordinary, non-system role with no elevated standing required', async () => {
    const { service, usersRepository } = buildService({
      roleRows: [ordinaryRole],
    });

    await expect(
      service.addRole(TENANT_ID, TARGET_ID, ORDINARY_ROLE_ID, ACTOR_ID),
    ).resolves.toBeDefined();
    expect(usersRepository.addUserRole).toHaveBeenCalled();
  });

  it('addRole allows GLOBAL_ADMIN when the actor is a SYSTEM_ADMIN and the target is the tenant owner', async () => {
    const { service, usersRepository } = buildService({
      actorRoleKeys: [ROLE_KEYS.SYSTEM_ADMIN],
      roleRows: [globalAdminRole],
    });

    await expect(
      service.addRole(TENANT_ID, OWNER_ID, GLOBAL_ADMIN_ROLE_ID, ACTOR_ID),
    ).resolves.toBeDefined();
    expect(usersRepository.addUserRole).toHaveBeenCalled();
  });

  /**
   * The seam, not the ends. Both `addRole` and `assignRoles` can each look
   * correctly guarded while a future refactor quietly stops one of them from
   * calling the shared check (e.g. inlining it again "for clarity") — this
   * would still pass every test above that only exercises one method at a
   * time if the *other* one also inlines a copy that drifts. Asserting the
   * shared method is the same function reference reached from both call
   * sites, and spying on it, guards the wiring itself.
   */
  it('both addRole and assignRoles invoke the one shared escalation guard', async () => {
    const { service } = buildService({ roleRows: [ordinaryRole] });
    const spy = jest.spyOn(
      service as unknown as {
        assertRoleGrantWithinActorAuthority: (...args: unknown[]) => unknown;
      },
      'assertRoleGrantWithinActorAuthority',
    );

    await service.addRole(TENANT_ID, TARGET_ID, ORDINARY_ROLE_ID, ACTOR_ID);
    expect(spy).toHaveBeenCalledTimes(1);

    await service.assignRoles(
      TENANT_ID,
      TARGET_ID,
      [ORDINARY_ROLE_ID],
      ACTOR_ID,
    );
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
