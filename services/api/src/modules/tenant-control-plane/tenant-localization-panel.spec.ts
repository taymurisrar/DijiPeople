import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { TenantControlPlaneService } from './tenant-control-plane.service';

/**
 * BUG-1977 — the Configuration tab's Localization panel queried
 * `TenantSetting.key IN ('organization.country', …)`. `category` and `key` are
 * separate columns and no writer ever puts a dotted composite in `key`, so the
 * query returned nothing for every tenant and the panel asserted the tenant had
 * configured no localization at all — for tenants that had.
 *
 * These tests pin the three things the obvious fix still gets wrong: the values
 * must come from the resolver rather than raw rows, `locale` must come from the
 * `system` category (there is no `organization.locale`), and `dateFormat` must
 * come from the `organization` copy, which is the one the tenant application
 * renders with.
 */

const admin = {
  userId: 'platform-user-1',
  tenantId: 'platform',
  email: 'ops@dijipeople.com',
  roleIds: [],
  roleKeys: [],
  permissionKeys: [],
  platform: { id: 'platform-user-1', role: 'PLATFORM_ADMIN', status: 'ACTIVE' },
} as unknown as AuthenticatedUser;

type LoadDetailShape = { loadDetail: (tenantId: string) => Promise<unknown> };

function build(storedRows: Array<{ id: string }>) {
  const findMany = jest.fn().mockResolvedValue(storedRows);
  const prisma = {
    tenantDomain: { findMany: jest.fn().mockResolvedValue([]) },
    tenantSetting: { findMany },
  };
  const resolver = {
    getOrganizationSettings: jest.fn().mockResolvedValue({
      companyDisplayName: 'DijiPeople Demo',
      legalBusinessName: '',
      industry: '',
      businessEmail: '',
      businessPhone: '',
      timezone: 'UTC',
      currency: 'USD',
      country: 'QA',
      dateFormat: 'MM/dd/yyyy',
      timeFormat: '12h',
      weekStartsOn: 'MONDAY',
    }),
    getSystemSettings: jest.fn().mockResolvedValue({
      locale: 'en-US',
      // The system copy of dateFormat deliberately differs from the
      // organization copy so a regression that reads the wrong one is visible.
      dateFormat: 'dd/MM/yyyy',
      timeFormat: '24h',
    }),
  };

  const service = new TenantControlPlaneService(
    prisma as never,
    {} as never, // access
    {} as never, // modules
    {} as never, // apps
    {} as never, // operations
    {} as never, // domains
    { log: jest.fn() } as never, // audit
    { record: jest.fn() } as never, // platform events
    resolver as never,
  );

  jest
    .spyOn(service as unknown as LoadDetailShape, 'loadDetail')
    .mockResolvedValue({
      id: 'tenant-1',
      name: 'DijiPeople Demo',
      displayName: 'DijiPeople Demo',
      legalName: null,
      tenantCode: 'DEM-000001',
      slug: 'demo',
      status: 'ACTIVE',
      subStatus: null,
      environmentType: 'PRODUCTION',
      environmentGroupName: null,
      customerAccount: null,
      attribution: {
        originatingLead: null,
        originatingPartner: null,
        referralCodeSnapshot: null,
      },
    });

  return { service, prisma, resolver, findMany };
}

describe('tenant control plane localization panel', () => {
  it('returns the tenant configured localization instead of an empty object', async () => {
    const { service } = build([{ id: 'row-1' }]);

    const result = await service.configuration(admin, 'tenant-1');

    expect(result.localization.values).toEqual({
      country: 'QA',
      timezone: 'UTC',
      locale: 'en-US',
      currency: 'USD',
      dateFormat: 'MM/dd/yyyy',
    });
    expect(result.localization.configured).toBe(true);
  });

  it('reads locale from the system category, which is the only one that has it', async () => {
    const { service, resolver } = build([{ id: 'row-1' }]);

    const result = await service.configuration(admin, 'tenant-1');

    expect(resolver.getSystemSettings).toHaveBeenCalledWith('tenant-1');
    expect(result.localization.values.locale).toBe('en-US');
  });

  it('reads dateFormat from the organization category, not the system copy', async () => {
    const { service } = build([{ id: 'row-1' }]);

    const result = await service.configuration(admin, 'tenant-1');

    // `ConfigurationResolverService.resolveAppContext` computes
    // `organization.dateFormat || system.dateFormat`, so the organization copy
    // is what the tenant actually renders with.
    expect(result.localization.values.dateFormat).toBe('MM/dd/yyyy');
    expect(result.localization.values.dateFormat).not.toBe('dd/MM/yyyy');
  });

  it('never filters TenantSetting on a dotted composite key', async () => {
    const { service, findMany } = build([{ id: 'row-1' }]);

    await service.configuration(admin, 'tenant-1');

    const serialised = JSON.stringify(findMany.mock.calls);
    expect(serialised).not.toContain('organization.');
    expect(serialised).not.toContain('system.');
  });

  it('reports configured=false when the tenant has written no localization row', async () => {
    const { service } = build([]);

    const result = await service.configuration(admin, 'tenant-1');

    expect(result.localization.configured).toBe(false);
    // The values are still returned — they are the platform defaults, and an
    // operator needs to see them. Only the "configured" flag changes.
    expect(result.localization.values.timezone).toBe('UTC');
  });
});
