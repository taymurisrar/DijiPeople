import { ForbiddenException } from '@nestjs/common';
import { PlatformUserRole } from '@prisma/client';
import { PlatformLifecycleService } from './platform-lifecycle.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';

/*
 * BUG-3564 (WP-02 follow-up). `DELETE /super-admin/customers` and
 * `/customer-onboarding` used to decide who may bulk-delete on a weaker rule
 * than the identical action through the generic runtime delete path
 * (`PlatformRuntimeService.assertAdmin`): a non-admin-tier role holding
 * `customers.update`/`onboarding.update` — PLATFORM_OPERATIONS, MEMBER,
 * PRESALES_MANAGER — could still bulk-delete records it "owned" via
 * `assignedToUserId`/`onboardingOwnerUserId`. This proves the fix at the
 * service the REST route delegates to: the ownership question is never
 * reached for a non-admin-tier actor, even one that owns every record.
 * `bulkDeleteCustomers`/`bulkDeleteCustomerOnboardings` did not check the
 * role at all before this package, so every `.toThrow` below fails against
 * the pre-fix service.
 */

function actor(
  role: PlatformUserRole,
  platformId = 'platform-user-1',
): AuthenticatedUser {
  return {
    userId: 'platform-user-1',
    tenantId: 'platform',
    roleIds: [],
    roleKeys: [],
    permissionKeys: [],
    rolePrivileges: [],
    platform: { id: platformId, role, status: 'ACTIVE' },
  } as unknown as AuthenticatedUser;
}

function buildService() {
  const customerAccount = {
    findMany: jest.fn(async () => []),
    deleteMany: jest.fn(async (args: { where: { id: { in: string[] } } }) => ({
      count: args.where.id.in.length,
    })),
    count: jest.fn(async () => 0),
  };
  const customerOnboarding = {
    findMany: jest.fn(async () => []),
    deleteMany: jest.fn(async (args: { where: { id: { in: string[] } } }) => ({
      count: args.where.id.in.length,
    })),
    count: jest.fn(async () => 0),
  };
  const prisma = { customerAccount, customerOnboarding };
  const auditService = { log: jest.fn() };

  const service = new PlatformLifecycleService(
    prisma as never,
    auditService as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return { service, customerAccount, customerOnboarding, auditService };
}

const NON_ADMIN_TIER_ROLES_THAT_COULD_REACH_THE_ROUTE = [
  PlatformUserRole.PLATFORM_OPERATIONS,
  PlatformUserRole.MEMBER,
  PlatformUserRole.PRESALES_MANAGER,
];

const ADMIN_TIER_ROLES = [
  PlatformUserRole.SUPER_ADMIN,
  PlatformUserRole.PLATFORM_OWNER,
  PlatformUserRole.PLATFORM_ADMIN,
];

describe('bulkDeleteCustomers applies the same admin tier as the runtime delete path', () => {
  it.each(NON_ADMIN_TIER_ROLES_THAT_COULD_REACH_THE_ROUTE)(
    'refuses %s outright, even when it "owns" every targeted record',
    async (role) => {
      const { service, customerAccount } = buildService();
      // Simulate "owns every record" — the old rule this replaces would have
      // let this through by counting exactly this many owned rows.
      customerAccount.count.mockResolvedValue(2);

      await expect(
        service.bulkDeleteCustomers(actor(role), ['c-1', 'c-2']),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(customerAccount.findMany).not.toHaveBeenCalled();
      expect(customerAccount.deleteMany).not.toHaveBeenCalled();
    },
  );

  it.each(ADMIN_TIER_ROLES)('lets %s proceed', async (role) => {
    const { service, customerAccount } = buildService();

    const result = await service.bulkDeleteCustomers(actor(role), [
      'c-1',
      'c-2',
    ]);

    expect(result).toEqual({ deletedCount: 2 });
    expect(customerAccount.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['c-1', 'c-2'] } },
    });
  });
});

describe('bulkDeleteCustomerOnboardings applies the same admin tier as the runtime delete path', () => {
  it.each(NON_ADMIN_TIER_ROLES_THAT_COULD_REACH_THE_ROUTE)(
    'refuses %s outright, even when it "owns" every targeted record',
    async (role) => {
      const { service, customerOnboarding } = buildService();
      customerOnboarding.count.mockResolvedValue(2);

      await expect(
        service.bulkDeleteCustomerOnboardings(actor(role), ['o-1', 'o-2']),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(customerOnboarding.findMany).not.toHaveBeenCalled();
      expect(customerOnboarding.deleteMany).not.toHaveBeenCalled();
    },
  );

  it.each(ADMIN_TIER_ROLES)('lets %s proceed', async (role) => {
    const { service, customerOnboarding } = buildService();

    const result = await service.bulkDeleteCustomerOnboardings(actor(role), [
      'o-1',
      'o-2',
    ]);

    expect(result).toEqual({ deletedCount: 2 });
    expect(customerOnboarding.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['o-1', 'o-2'] } },
    });
  });
});
