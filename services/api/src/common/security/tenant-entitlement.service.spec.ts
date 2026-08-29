import {
  DEFAULT_ENTITLEMENT_ENFORCEMENT_MODE,
  ENTITLEMENT_CACHE_TTL_MS,
  TenantEntitlementService,
  parseEnforcementMode,
} from './tenant-entitlement.service';

/*
 * BUG-1952: plan entitlements gated nothing. These cover the resolver the new
 * gate depends on, and in particular the three cases that decide whether
 * enforcement is safe to switch on at all — a lookup fault over a warm cache, a
 * lookup fault over a cold one, and a subscription that is not live.
 */

type PrismaStub = {
  subscription: { findUnique: jest.Mock };
  tenantFeature: { findMany: jest.Mock };
  platformSetting: { findUnique: jest.Mock };
};

function buildPrisma(): PrismaStub {
  return {
    subscription: {
      findUnique: jest.fn().mockResolvedValue({
        status: 'ACTIVE',
        plan: {
          features: [
            { featureKey: 'employees', isEnabled: true },
            { featureKey: 'leave', isEnabled: true },
            { featureKey: 'payroll', isEnabled: false },
            { featureKey: 'projects', isEnabled: false },
          ],
        },
      }),
    },
    tenantFeature: { findMany: jest.fn().mockResolvedValue([]) },
    platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
  };
}

function buildService(prisma: PrismaStub) {
  const service = new TenantEntitlementService(prisma as never);
  /*
   * The warn and error paths are deliberate behaviour that several tests below
   * exercise on purpose; silenced so a passing run stays readable.
   */
  const logger = (service as unknown as { logger: Record<string, unknown> })
    .logger;
  jest.spyOn(logger as never, 'warn').mockImplementation(() => undefined);
  jest.spyOn(logger as never, 'error').mockImplementation(() => undefined);
  return service;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('TenantEntitlementService.decide', () => {
  it('allows a module the plan includes', async () => {
    const service = buildService(buildPrisma());

    const decision = await service.decide('tenant-1', ['leave']);

    expect(decision.outcome).toBe('ENTITLED');
    expect(decision.allowed).toBe(true);
  });

  it('refuses a module the plan excludes', async () => {
    const service = buildService(buildPrisma());

    const decision = await service.decide('tenant-1', ['payroll']);

    expect(decision.outcome).toBe('NOT_ENTITLED');
    expect(decision.allowed).toBe(false);
  });

  it('allows when any one of several declared keys is entitled', async () => {
    const service = buildService(buildPrisma());

    const decision = await service.decide('tenant-1', ['payroll', 'leave']);

    expect(decision.allowed).toBe(true);
  });

  /*
   * The override rule the platform-admin module screen also relies on: an
   * override can restrict what the plan sells and can never grant what it does
   * not. TenantModulesService refuses to write such a row, but the rule has to
   * hold regardless of how one reached the table.
   */
  it('lets a tenant override disable an entitled module', async () => {
    const prisma = buildPrisma();
    prisma.tenantFeature.findMany.mockResolvedValue([
      { key: 'leave', isEnabled: false },
    ]);
    const service = buildService(prisma);

    const decision = await service.decide('tenant-1', ['leave']);

    expect(decision.allowed).toBe(false);
    expect(decision.outcome).toBe('NOT_ENTITLED');
  });

  it('does not let a tenant override grant a module the plan excludes', async () => {
    const prisma = buildPrisma();
    prisma.tenantFeature.findMany.mockResolvedValue([
      { key: 'payroll', isEnabled: true },
    ]);
    const service = buildService(prisma);

    const decision = await service.decide('tenant-1', ['payroll']);

    expect(decision.allowed).toBe(false);
  });

  /*
   * The deliberate carve-out, and the one a reviewer should push back on if
   * they disagree with it. A lapsed subscription resolves to nothing entitled,
   * which is right for the screen that has to explain why a customer's modules
   * went dark — but refusing every gated request on that basis would lock a
   * tenant out of its own data over an unpaid invoice. Dunning is a separate
   * product decision with its own notice period.
   */
  it('allows, and says so, when there is no live subscription', async () => {
    const prisma = buildPrisma();
    prisma.subscription.findUnique.mockResolvedValue({
      status: 'CANCELLED',
      plan: { features: [{ featureKey: 'payroll', isEnabled: true }] },
    });
    const service = buildService(prisma);

    const decision = await service.decide('tenant-1', ['payroll']);

    expect(decision.outcome).toBe('NO_LIVE_SUBSCRIPTION');
    expect(decision.allowed).toBe(true);
  });

  it('allows when the tenant has no subscription row at all', async () => {
    const prisma = buildPrisma();
    prisma.subscription.findUnique.mockResolvedValue(null);
    const service = buildService(prisma);

    const decision = await service.decide('tenant-1', ['payroll']);

    expect(decision.outcome).toBe('NO_LIVE_SUBSCRIPTION');
    expect(decision.allowed).toBe(true);
  });

  it('treats a trialing subscription as live', async () => {
    const prisma = buildPrisma();
    prisma.subscription.findUnique.mockResolvedValue({
      status: 'TRIALING',
      plan: { features: [{ featureKey: 'payroll', isEnabled: false }] },
    });
    const service = buildService(prisma);

    const decision = await service.decide('tenant-1', ['payroll']);

    expect(decision.outcome).toBe('NOT_ENTITLED');
  });
});

describe('TenantEntitlementService resolver faults', () => {
  /*
   * Fail closed, but bounded. Failing closed on every lookup error would mean a
   * database blip takes the product down for every tenant at once; discarding a
   * snapshot that was true a minute ago buys nothing, because a commercial
   * answer does not change that fast.
   */
  it('serves the last known snapshot when a refresh fails', async () => {
    const prisma = buildPrisma();
    const service = buildService(prisma);
    const start = Date.now();

    const first = await service.decide('tenant-1', ['leave']);
    expect(first.allowed).toBe(true);
    expect(first.stale).toBe(false);

    jest
      .spyOn(Date, 'now')
      .mockReturnValue(start + ENTITLEMENT_CACHE_TTL_MS + 1);
    prisma.subscription.findUnique.mockRejectedValue(
      new Error('connection lost'),
    );

    const second = await service.decide('tenant-1', ['leave']);

    expect(second.allowed).toBe(true);
    expect(second.stale).toBe(true);
    expect(second.outcome).toBe('ENTITLED');
  });

  it('denies as unresolvable when the lookup fails with a cold cache', async () => {
    const prisma = buildPrisma();
    prisma.subscription.findUnique.mockRejectedValue(
      new Error('connection lost'),
    );
    const service = buildService(prisma);

    const decision = await service.decide('tenant-1', ['leave']);

    expect(decision.outcome).toBe('UNRESOLVABLE');
    expect(decision.allowed).toBe(false);
  });
});

describe('TenantEntitlementService caching', () => {
  it('reads once inside the TTL', async () => {
    const prisma = buildPrisma();
    const service = buildService(prisma);

    await service.decide('tenant-1', ['leave']);
    await service.decide('tenant-1', ['payroll']);

    expect(prisma.subscription.findUnique).toHaveBeenCalledTimes(1);
  });

  it('re-reads after the TTL expires', async () => {
    const prisma = buildPrisma();
    const service = buildService(prisma);
    const start = Date.now();

    await service.decide('tenant-1', ['leave']);
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(start + ENTITLEMENT_CACHE_TTL_MS + 1);
    await service.decide('tenant-1', ['leave']);

    expect(prisma.subscription.findUnique).toHaveBeenCalledTimes(2);
  });

  it('re-reads immediately after invalidate', async () => {
    const prisma = buildPrisma();
    const service = buildService(prisma);

    await service.decide('tenant-1', ['leave']);
    service.invalidate('tenant-1');
    await service.decide('tenant-1', ['leave']);

    expect(prisma.subscription.findUnique).toHaveBeenCalledTimes(2);
  });

  it('keys the cache by tenant', async () => {
    const prisma = buildPrisma();
    const service = buildService(prisma);

    await service.decide('tenant-1', ['leave']);
    await service.decide('tenant-2', ['leave']);

    expect(prisma.subscription.findUnique).toHaveBeenCalledTimes(2);
  });

  it('scopes both reads to the caller tenant', async () => {
    const prisma = buildPrisma();
    const service = buildService(prisma);

    await service.decide('tenant-9', ['leave']);

    expect(prisma.subscription.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-9' } }),
    );
    expect(prisma.tenantFeature.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 'tenant-9' } }),
    );
  });
});

describe('enforcement mode', () => {
  /*
   * The rollout control. Enforcing entitlements cuts off every tenant already
   * using a module it never bought, so the default has to be the one that
   * changes nothing about what a request does.
   */
  it('defaults to report-only when the platform setting row is absent', async () => {
    const service = buildService(buildPrisma());

    await expect(service.mode()).resolves.toBe('REPORT_ONLY');
    expect(DEFAULT_ENTITLEMENT_ENFORCEMENT_MODE).toBe('REPORT_ONLY');
  });

  it('reads ENFORCE from the module-settings row', async () => {
    const prisma = buildPrisma();
    prisma.platformSetting.findUnique.mockResolvedValue({
      value: { entitlementEnforcement: 'ENFORCE' },
    });
    const service = buildService(prisma);

    await expect(service.mode()).resolves.toBe('ENFORCE');
    expect(prisma.platformSetting.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'module-settings' } }),
    );
  });

  it('falls back to report-only when the mode cannot be read', async () => {
    const prisma = buildPrisma();
    prisma.platformSetting.findUnique.mockRejectedValue(new Error('down'));
    const service = buildService(prisma);

    await expect(service.mode()).resolves.toBe('REPORT_ONLY');
  });

  it('caches the mode inside the TTL', async () => {
    const prisma = buildPrisma();
    const service = buildService(prisma);

    await service.mode();
    await service.mode();

    expect(prisma.platformSetting.findUnique).toHaveBeenCalledTimes(1);
  });
});

describe('parseEnforcementMode', () => {
  it.each([
    [null, 'REPORT_ONLY'],
    [undefined, 'REPORT_ONLY'],
    [{}, 'REPORT_ONLY'],
    [[], 'REPORT_ONLY'],
    ['ENFORCE', 'REPORT_ONLY'],
    [{ entitlementEnforcement: 'OFF' }, 'OFF'],
    [{ entitlementEnforcement: 'enforce' }, 'ENFORCE'],
    [{ entitlementEnforcement: ' Enforce ' }, 'ENFORCE'],
    [{ entitlementEnforcement: 'REPORT_ONLY' }, 'REPORT_ONLY'],
    [{ entitlementEnforcement: 42 }, 'REPORT_ONLY'],
    /*
     * A typo must not silently mean "enforce" — nor "off", which would quietly
     * disable the logging the platform owner measures the cutover with.
     */
    [{ entitlementEnforcement: 'ENFORCED' }, 'REPORT_ONLY'],
  ])('parses %p as %s', (value, expected) => {
    expect(parseEnforcementMode(value)).toBe(expected);
  });
});
