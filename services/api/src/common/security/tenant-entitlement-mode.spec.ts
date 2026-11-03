import {
  ENTITLEMENT_CACHE_TTL_MS,
  ENTITLEMENT_ENV_VAR,
  TenantEntitlementService,
  readEnvEnforcementFloor,
  stricterMode,
} from './tenant-entitlement.service';

/**
 * DP-QA-005. The enforcement posture must not depend solely on a database row
 * that a fresh or restored environment does not have, and a database fault must
 * not silently relax it.
 */
function build(stored: unknown) {
  const findUnique = jest
    .fn()
    .mockResolvedValue(
      stored === null ? null : { value: { entitlementEnforcement: stored } },
    );
  const service = new TenantEntitlementService({
    platformSetting: { findUnique },
  } as never);
  const logger = (service as unknown as { logger: Record<string, unknown> })
    .logger;
  jest.spyOn(logger as never, 'warn').mockImplementation(() => undefined);
  const error = jest
    .spyOn(logger as never, 'error')
    .mockImplementation(() => undefined);
  return { service, findUnique, error };
}

describe('entitlement enforcement release floor', () => {
  const original = process.env[ENTITLEMENT_ENV_VAR];
  afterEach(() => {
    if (original === undefined) delete process.env[ENTITLEMENT_ENV_VAR];
    else process.env[ENTITLEMENT_ENV_VAR] = original;
    jest.restoreAllMocks();
  });

  it('stays REPORT_ONLY with no row and no variable (shipping this changes nothing)', async () => {
    delete process.env[ENTITLEMENT_ENV_VAR];
    const { service } = build(null);
    await expect(service.effectiveMode()).resolves.toEqual({
      mode: 'REPORT_ONLY',
      source: 'DEFAULT',
    });
  });

  it('enforces on a database with no row when the release sets ENFORCE', async () => {
    process.env[ENTITLEMENT_ENV_VAR] = 'ENFORCE';
    const { service } = build(null);
    await expect(service.effectiveMode()).resolves.toEqual({
      mode: 'ENFORCE',
      source: 'ENV',
    });
  });

  it('does not let the database setting weaken the release floor', async () => {
    process.env[ENTITLEMENT_ENV_VAR] = 'ENFORCE';
    const { service } = build('OFF');
    expect((await service.effectiveMode()).mode).toBe('ENFORCE');
  });

  it('lets the database setting be stricter than the floor', async () => {
    process.env[ENTITLEMENT_ENV_VAR] = 'REPORT_ONLY';
    const { service } = build('ENFORCE');
    await expect(service.effectiveMode()).resolves.toEqual({
      mode: 'ENFORCE',
      source: 'PLATFORM_SETTING',
    });
  });

  it('fails closed on a malformed variable and says so', async () => {
    process.env[ENTITLEMENT_ENV_VAR] = 'ENFORCED';
    const { service, error } = build(null);
    expect((await service.effectiveMode()).mode).toBe('ENFORCE');
    expect(error).toHaveBeenCalled();
  });

  it('keeps ENFORCE through a later database fault', async () => {
    delete process.env[ENTITLEMENT_ENV_VAR];
    const { service, findUnique } = build('ENFORCE');
    expect(await service.mode()).toBe('ENFORCE');

    const realNow = Date.now();
    jest
      .spyOn(Date, 'now')
      .mockReturnValue(realNow + ENTITLEMENT_CACHE_TTL_MS + 1000);
    findUnique.mockRejectedValue(new Error('connection reset'));

    expect(await service.mode()).toBe('ENFORCE');
  });

  it('still defaults to REPORT_ONLY when the first read ever fails', async () => {
    delete process.env[ENTITLEMENT_ENV_VAR];
    const { service, findUnique } = build(null);
    findUnique.mockRejectedValue(new Error('down'));
    expect(await service.mode()).toBe('REPORT_ONLY');
  });

  it('orders modes by strictness', () => {
    expect(stricterMode('OFF', 'REPORT_ONLY')).toBe('REPORT_ONLY');
    expect(stricterMode('ENFORCE', 'REPORT_ONLY')).toBe('ENFORCE');
    expect(readEnvEnforcementFloor({})).toEqual({ floor: null, invalid: null });
    expect(readEnvEnforcementFloor({ [ENTITLEMENT_ENV_VAR]: '  ' })).toEqual({
      floor: null,
      invalid: null,
    });
  });

  it('warns loudly at boot in production when not enforcing, and never throws', async () => {
    delete process.env[ENTITLEMENT_ENV_VAR];
    const nodeEnv = process.env.NODE_ENV;
    (process.env as Record<string, string>).NODE_ENV = 'production';
    try {
      const { service, error } = build(null);
      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('ENTITLEMENT_NOT_ENFORCED'),
      );
    } finally {
      (process.env as Record<string, string>).NODE_ENV = nodeEnv as string;
    }
  });
});
