import {
  ENTITLEMENT_ENV_VAR,
  TenantEntitlementService,
} from './tenant-entitlement.service';

/*
 * DP-QA-052. Production enforced entitlements through one database row while the
 * Render variable said ENFORCE and did nothing, and nothing outside the database
 * could tell the two apart. The health payload now says which input decided the
 * mode, what each input holds, and the service shouts when the variable is the
 * only thing holding ENFORCE up. Fail-closed behaviour (the floor, a fault keeping
 * the last known mode, a typo meaning ENFORCE) is asserted here as well, because
 * it is what keeps production from silently falling back to REPORT_ONLY.
 */
function build(storedValue: unknown, opts: { reject?: boolean } = {}) {
  const prisma = {
    platformSetting: {
      findUnique: opts.reject
        ? jest.fn().mockRejectedValue(new Error('database down'))
        : jest
            .fn()
            .mockResolvedValue(
              storedValue === undefined ? null : { value: storedValue },
            ),
    },
  };
  const service = new TenantEntitlementService(prisma as never);
  const logger = (
    service as unknown as { logger: { warn: jest.Mock; error: jest.Mock } }
  ).logger;
  const warn = jest
    .spyOn(logger as never, 'warn')
    .mockImplementation(() => undefined);
  const error = jest
    .spyOn(logger as never, 'error')
    .mockImplementation(() => undefined);
  return { service, prisma, warn, error };
}

const ORIGINAL = { ...process.env };
afterEach(() => {
  process.env = { ...ORIGINAL };
  jest.restoreAllMocks();
});

describe('describeEnforcement reports the inputs, not just the answer', () => {
  it('stored ENFORCE, no floor: source PLATFORM_SETTING', async () => {
    delete process.env[ENTITLEMENT_ENV_VAR];
    const { service } = build({ entitlementEnforcement: 'ENFORCE' });

    await expect(service.describeEnforcement()).resolves.toEqual({
      mode: 'ENFORCE',
      enforced: true,
      source: 'PLATFORM_SETTING',
      stored: 'ENFORCE',
      floor: null,
    });
  });

  it('floor ENFORCE over a stored REPORT_ONLY: enforced, source ENV, drift visible', async () => {
    process.env[ENTITLEMENT_ENV_VAR] = 'ENFORCE';
    const { service } = build({ entitlementEnforcement: 'REPORT_ONLY' });

    await expect(service.describeEnforcement()).resolves.toEqual({
      mode: 'ENFORCE',
      enforced: true,
      source: 'ENV',
      stored: 'REPORT_ONLY',
      floor: 'ENFORCE',
    });
  });

  it('an absent stored row with a floor is still enforced (a restore from an older backup)', async () => {
    process.env[ENTITLEMENT_ENV_VAR] = 'ENFORCE';
    const { service } = build(undefined);

    const state = await service.describeEnforcement();
    expect(state.enforced).toBe(true);
    expect(state.source).toBe('ENV');
    expect(state.stored).toBe('REPORT_ONLY');
  });

  it('an unreadable setting is reported as not enforced only when nothing holds it up', async () => {
    delete process.env[ENTITLEMENT_ENV_VAR];
    const { service } = build(undefined, { reject: true });

    const state = await service.describeEnforcement();
    expect(state.mode).toBe('REPORT_ONLY');
    expect(state.enforced).toBe(false);
  });
});

describe('fail closed', () => {
  it('a database fault keeps the last known ENFORCE instead of dropping to REPORT_ONLY', async () => {
    delete process.env[ENTITLEMENT_ENV_VAR];
    const { service, prisma } = build({ entitlementEnforcement: 'ENFORCE' });
    await expect(service.mode()).resolves.toBe('ENFORCE');

    service.invalidateAll();
    // invalidateAll clears the last-known value too; re-prime it, then fault
    await service.mode();
    prisma.platformSetting.findUnique.mockRejectedValue(
      new Error('database down'),
    );
    (service as unknown as { modeCache: null }).modeCache = null;

    await expect(service.mode()).resolves.toBe('ENFORCE');
  });

  it('a fault with a floor set is ENFORCE even when nothing was ever read', async () => {
    process.env[ENTITLEMENT_ENV_VAR] = 'ENFORCE';
    const { service } = build(undefined, { reject: true });

    await expect(service.mode()).resolves.toBe('ENFORCE');
  });

  it('a mistyped floor means ENFORCE and says so', async () => {
    process.env[ENTITLEMENT_ENV_VAR] = 'ENFORCED';
    const { service, error } = build({ entitlementEnforcement: 'REPORT_ONLY' });

    await expect(service.mode()).resolves.toBe('ENFORCE');
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('failing closed to ENFORCE'),
    );
  });
});

describe('boot-time monitoring in production', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
  });

  it('warns ENTITLEMENT_SETTING_DRIFT when the floor alone holds ENFORCE up', async () => {
    process.env[ENTITLEMENT_ENV_VAR] = 'ENFORCE';
    const { service, warn, error } = build({
      entitlementEnforcement: 'REPORT_ONLY',
    });

    await service.onApplicationBootstrap();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('ENTITLEMENT_SETTING_DRIFT'),
    );
    expect(error).not.toHaveBeenCalled();
  });

  it('is quiet when the stored setting and the floor agree', async () => {
    process.env[ENTITLEMENT_ENV_VAR] = 'ENFORCE';
    const { service, warn, error } = build({
      entitlementEnforcement: 'ENFORCE',
    });

    await service.onApplicationBootstrap();

    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('logs ENTITLEMENT_NOT_ENFORCED as an error when nothing enforces', async () => {
    delete process.env[ENTITLEMENT_ENV_VAR];
    const { service, error } = build({ entitlementEnforcement: 'REPORT_ONLY' });

    await service.onApplicationBootstrap();

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('ENTITLEMENT_NOT_ENFORCED'),
    );
  });
});
