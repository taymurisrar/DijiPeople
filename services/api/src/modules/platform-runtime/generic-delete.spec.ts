import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PlatformRuntimeService } from './platform-runtime.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';

/**
 * Deleting one record and deleting a selection are the same decision.
 *
 * They were two switch statements, and they had drifted: `leads` was reachable
 * through `remove` and absent from `bulkDelete`, so an operator who selected
 * five leads in the console got
 * `400 Bulk delete is not available for this module` while deleting the same
 * five one at a time worked. That reached production on 2026-08-28.
 *
 * The tempting fix is to add the missing `leads` arm to the second list. This
 * suite is written so that fix fails: the assertion is not "leads can be bulk
 * deleted", it is **"every module behaves identically through both paths"**,
 * checked by driving both for every module the runtime knows. A second list
 * that happens to agree today would pass; a second list is what cannot exist.
 */

const MODULES = [
  'leads',
  'partners',
  'partner-inquiries',
  'partner-onboarding',
  'customers',
  'customer-onboarding',
  'tenants',
  'subscriptions',
  'plans',
  'invoices',
  'payments',
  'commissions',
  'contracts',
  'contract-templates',
  'signature-requests',
  'support-cases',
  'monitoring-incidents',
] as const;

/** Modules that hold records the business must be able to produce later. */
const RETENTION_REFUSED = [
  'tenants',
  'subscriptions',
  'plans',
  'invoices',
  'payments',
  'commissions',
  'contracts',
  'contract-templates',
  'signature-requests',
  'support-cases',
  'monitoring-incidents',
];

const DELETABLE = MODULES.filter((key) => !RETENTION_REFUSED.includes(key));

function owner(): AuthenticatedUser {
  return {
    userId: 'platform-owner',
    tenantId: 'platform',
    roleIds: [],
    roleKeys: [],
    permissionKeys: [],
    rolePrivileges: [],
    platform: {
      id: 'p1',
      role: 'PLATFORM_OWNER',
      permissionKeys: ['platform.*'],
    },
  } as unknown as AuthenticatedUser;
}

/** A platform user who may write leads but is not an administrator. */
function presales(): AuthenticatedUser {
  return {
    userId: 'presales',
    tenantId: 'platform',
    roleIds: [],
    roleKeys: [],
    permissionKeys: [],
    rolePrivileges: [],
    platform: {
      id: 'p2',
      role: 'PRESALES_MANAGER',
      permissionKeys: ['leads.read', 'leads.update'],
    },
  } as unknown as AuthenticatedUser;
}

type Calls = { method: string; ids: string[] }[];

function buildService() {
  const calls: Calls = [];
  const record = (method: string) => (ids: string[]) => {
    calls.push({ method, ids });
    return Promise.resolve({ deleted: ids.length });
  };

  const leads = {
    bulkDeleteLeads: (_u: unknown, ids: string[]) => record('leads')(ids),
  };
  const superAdmin = {
    bulkDeleteCustomers: (_u: unknown, dto: { ids: string[] }) =>
      record('customers')(dto.ids),
    bulkDeleteCustomerOnboardings: (_u: unknown, dto: { ids: string[] }) =>
      record('customer-onboarding')(dto.ids),
  };
  const partnerDeletion = {
    deletePartners: (_u: unknown, ids: string[]) => record('partners')(ids),
    deletePartnerInquiries: (_u: unknown, ids: string[]) =>
      record('partner-inquiries')(ids),
    deletePartnerOnboarding: (_u: unknown, ids: string[]) =>
      record('partner-onboarding')(ids),
  };

  const service = new PlatformRuntimeService(
    {} as never,
    leads as never,
    {} as never,
    superAdmin as never,
    partnerDeletion as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return { service, calls };
}

/** Whatever happened — a resolved value or a thrown error — described the same way. */
async function outcome(run: () => Promise<unknown>) {
  try {
    await run();
    return { threw: false as const, message: null };
  } catch (error) {
    return {
      threw: true as const,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

describe('platform runtime — one deletion rule for one record and for many', () => {
  it.each(MODULES)(
    'answers %s identically through remove and through bulk-delete',
    async (moduleKey) => {
      const single = buildService();
      const bulk = buildService();

      const singleOutcome = await outcome(() =>
        single.service.remove(owner(), moduleKey, 'id-1'),
      );
      const bulkOutcome = await outcome(() =>
        bulk.service.execute(owner(), moduleKey, 'bulk-delete', {
          ids: ['id-1'],
        }),
      );

      // The point of the suite: not what the answer is, that it is the same one.
      expect(bulkOutcome).toEqual(singleOutcome);
      expect(bulk.calls).toEqual(single.calls);
    },
  );

  it.each(DELETABLE)('deletes %s through both paths', async (moduleKey) => {
    const single = buildService();
    await single.service.remove(owner(), moduleKey, 'id-1');
    expect(single.calls).toEqual([{ method: moduleKey, ids: ['id-1'] }]);

    const bulk = buildService();
    await bulk.service.execute(owner(), moduleKey, 'bulk-delete', {
      ids: ['id-1', 'id-2', 'id-3'],
    });
    expect(bulk.calls).toEqual([
      { method: moduleKey, ids: ['id-1', 'id-2', 'id-3'] },
    ]);
  });

  it.each(RETENTION_REFUSED)(
    'refuses %s for retention, in both directions and with one message',
    async (moduleKey) => {
      const single = buildService();
      const bulk = buildService();

      await expect(
        single.service.remove(owner(), moduleKey, 'id-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        bulk.service.execute(owner(), moduleKey, 'bulk-delete', {
          ids: ['id-1'],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      // Nothing reached a domain service on the way to the refusal.
      expect(single.calls).toEqual([]);
      expect(bulk.calls).toEqual([]);
    },
  );

  it('includes leads, which is the case that reached production as a 400', async () => {
    const { service, calls } = buildService();
    await service.execute(owner(), 'leads', 'bulk-delete', {
      ids: ['a', 'b', 'c', 'd', 'e'],
    });
    expect(calls).toEqual([
      { method: 'leads', ids: ['a', 'b', 'c', 'd', 'e'] },
    ]);
  });

  it('requires a platform administrator for either path', async () => {
    /*
     * Decided 2026-08-28. The two paths asked for different things — module
     * write for one record, an admin role for many — and the union is the rule.
     * It narrows single-record delete for the presales roles, which hold
     * `leads.*` without being administrators, and that narrowing is the point:
     * removing a commercial record is an administrative act at any quantity.
     */
    const single = buildService();
    await expect(
      single.service.remove(presales(), 'leads', 'id-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const bulk = buildService();
    await expect(
      bulk.service.execute(presales(), 'leads', 'bulk-delete', {
        ids: ['id-1'],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(single.calls).toEqual([]);
    expect(bulk.calls).toEqual([]);
  });
});
