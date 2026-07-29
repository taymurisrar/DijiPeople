import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PayrollDefaultsService } from './payroll-defaults.service';

describe('PayrollDefaultsService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(1_784_937_600_000);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initializes a complete tenant foundation idempotently', async () => {
    const components = new Map<string, { id: string; isActive: boolean }>();
    const taxPolicies = new Map<string, Record<string, unknown>>();
    const accounts = new Map<string, Record<string, unknown>>();
    const postingRules = new Map<string, Record<string, unknown>>();
    const documentTemplates = new Map<string, { id: string }>();
    const periods = new Map<
      string,
      { id: string; payrollCycleId: string | null }
    >();
    let compensationPackage: Record<string, unknown> | null = null;
    let region: Record<string, unknown> | null = null;
    let calendar: Record<string, unknown> | null = null;
    let cycle: Record<string, unknown> | null = null;

    const prisma = {
      currency: {
        findFirst: jest.fn().mockResolvedValue({ id: 'currency-1' }),
      },
      payComponent: {
        findMany: jest.fn(() =>
          Promise.resolve(
            [...components.keys()].map((code) => ({
              code,
              name: code,
              componentType: 'EARNING',
            })),
          ),
        ),
        findUnique: jest.fn(({ where }) =>
          Promise.resolve(components.get(where.tenantId_code.code) ?? null),
        ),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(({ data }) => {
          const created = {
            id: `component-${String(data.code)}`,
            isActive: true,
          };
          components.set(String(data.code), created);
          return Promise.resolve(created);
        }),
        count: jest.fn().mockImplementation(() => Promise.resolve(11)),
      },
      salaryPackageRule: {
        findFirst: jest.fn(() => Promise.resolve(compensationPackage)),
        update: jest.fn(),
        create: jest.fn(({ data }) => {
          compensationPackage = {
            id: 'package-1',
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
            version: 1,
            components: [],
          };
          return Promise.resolve(compensationPackage);
        }),
        count: jest.fn().mockResolvedValue(1),
      },
      salaryPackageRuleComponent: {
        createMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      taxRule: {
        findUnique: jest.fn(({ where }) =>
          Promise.resolve(taxPolicies.get(where.tenantId_code.code) ?? null),
        ),
        update: jest.fn(),
        create: jest.fn(({ data }) => {
          const now = new Date();
          const created = {
            id: `tax-${String(data.code)}`,
            ...data,
            createdAt: now,
            updatedAt: now,
            version: 1,
          };
          taxPolicies.set(String(data.code), created);
          return Promise.resolve(created);
        }),
        count: jest.fn().mockResolvedValue(2),
      },
      taxRuleBracket: {
        createMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      payrollGlAccount: {
        findUnique: jest.fn(({ where }) =>
          Promise.resolve(accounts.get(where.tenantId_code.code) ?? null),
        ),
        update: jest.fn(),
        create: jest.fn(({ data }) => {
          const now = new Date();
          const created = {
            id: `account-${String(data.code)}`,
            ...data,
            createdAt: now,
            updatedAt: now,
            version: 1,
          };
          accounts.set(String(data.code), created);
          return Promise.resolve(created);
        }),
        count: jest.fn().mockResolvedValue(8),
      },
      payrollPostingRule: {
        findFirst: jest.fn(({ where }) =>
          Promise.resolve(postingRules.get(where.name) ?? null),
        ),
        update: jest.fn(),
        create: jest.fn(({ data }) => {
          const now = new Date();
          const created = {
            id: `posting-${postingRules.size + 1}`,
            ...data,
            createdAt: now,
            updatedAt: now,
            version: 1,
          };
          postingRules.set(String(data.name), created);
          return Promise.resolve(created);
        }),
        count: jest.fn().mockResolvedValue(8),
      },
      payrollCalendar: {
        findFirst: jest.fn(() => Promise.resolve(calendar)),
        create: jest.fn(({ data }) => {
          calendar = { id: 'calendar-1', ...data };
          return Promise.resolve(calendar);
        }),
        count: jest.fn().mockResolvedValue(1),
      },
      payrollCycle: {
        findFirst: jest.fn(() => Promise.resolve(cycle)),
        create: jest.fn(({ data }) => {
          cycle = { id: 'cycle-1', ...data };
          return Promise.resolve(cycle);
        }),
        update: jest.fn(({ data }) => {
          cycle = { ...cycle, ...data };
          return Promise.resolve(cycle);
        }),
        count: jest.fn().mockResolvedValue(1),
      },
      payrollPeriod: {
        findFirst: jest.fn(({ where }) =>
          Promise.resolve(
            periods.get(
              `${where.periodStart.toISOString()}:${where.periodEnd.toISOString()}`,
            ) ?? null,
          ),
        ),
        create: jest.fn(({ data }) => {
          const created = {
            id: `period-${periods.size + 1}`,
            payrollCycleId: data.payrollCycleId,
          };
          periods.set(
            `${data.periodStart.toISOString()}:${data.periodEnd.toISOString()}`,
            created,
          );
          return Promise.resolve(created);
        }),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(12),
      },
      organization: {
        findFirst: jest.fn().mockResolvedValue({ id: 'organization-1' }),
      },
      payrollRegion: {
        findFirst: jest.fn(() => Promise.resolve(region)),
        create: jest.fn(({ data }) => {
          const now = new Date();
          region = { id: 'region-1', ...data, createdAt: now, updatedAt: now };
          return Promise.resolve(region);
        }),
        update: jest.fn(),
      },
      tenantConfigurationRecord: {
        findUnique: jest.fn(({ where }) =>
          Promise.resolve(
            documentTemplates.get(where.tenantId_settingKey_code.code) ?? null,
          ),
        ),
        create: jest.fn(({ data }) => {
          const created = {
            id: `template-${documentTemplates.size + 1}`,
          };
          documentTemplates.set(String(data.code), created);
          return Promise.resolve(created);
        }),
      },
      employerBankAccount: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      tenantSetting: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const settings = {
      getPayrollSettings: jest
        .fn()
        .mockResolvedValue({ defaultCurrency: 'SAR' }),
      getOrganizationSettings: jest
        .fn()
        .mockResolvedValue({ timezone: 'Asia/Riyadh' }),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const tenantSettings = {
      updateTenantSettings: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PayrollDefaultsService(
      prisma as never,
      settings as never,
      tenantSettings as never,
      audit as never,
    );
    const user: AuthenticatedUser = {
      userId: 'user-1',
      tenantId: 'tenant-1',
      email: 'payroll@example.com',
      roleIds: [],
      roleKeys: [],
      permissionKeys: [],
    };

    const first = await service.initialize(user);
    const createCounts = {
      components: prisma.payComponent.create.mock.calls.length,
      packages: prisma.salaryPackageRule.create.mock.calls.length,
      taxPolicies: prisma.taxRule.create.mock.calls.length,
      accounts: prisma.payrollGlAccount.create.mock.calls.length,
      postingRules: prisma.payrollPostingRule.create.mock.calls.length,
      calendars: prisma.payrollCalendar.create.mock.calls.length,
      cycles: prisma.payrollCycle.create.mock.calls.length,
      periods: prisma.payrollPeriod.create.mock.calls.length,
    };
    const second = await service.initialize(user);

    expect(first.health).toMatchObject({
      ready: true,
      completenessPercentage: 100,
    });
    expect(first.created).toHaveLength(47);
    expect(second.created).toEqual([]);
    expect(second.health).toMatchObject({
      ready: true,
      completenessPercentage: 100,
    });
    expect(createCounts).toEqual({
      components: 11,
      packages: 1,
      taxPolicies: 2,
      accounts: 8,
      postingRules: 8,
      calendars: 1,
      cycles: 1,
      periods: 12,
    });
    expect(prisma.payComponent.create).toHaveBeenCalledTimes(
      createCounts.components,
    );
    expect(prisma.salaryPackageRule.create).toHaveBeenCalledTimes(
      createCounts.packages,
    );
    expect(prisma.taxRule.create).toHaveBeenCalledTimes(
      createCounts.taxPolicies,
    );
    expect(prisma.payrollGlAccount.create).toHaveBeenCalledTimes(
      createCounts.accounts,
    );
    expect(prisma.payrollPostingRule.create).toHaveBeenCalledTimes(
      createCounts.postingRules,
    );
    expect(prisma.payrollCalendar.create).toHaveBeenCalledTimes(
      createCounts.calendars,
    );
    expect(prisma.payrollCycle.create).toHaveBeenCalledTimes(
      createCounts.cycles,
    );
    expect(prisma.payrollPeriod.create).toHaveBeenCalledTimes(
      createCounts.periods,
    );
    for (const [{ data }] of prisma.payrollPeriod.create.mock.calls) {
      expect([0, 6]).not.toContain(data.cutoffDate.getUTCDay());
      expect([0, 6]).not.toContain(data.paymentDate.getUTCDay());
    }
    expect(audit.log).toHaveBeenCalledTimes(2);
  });
});
