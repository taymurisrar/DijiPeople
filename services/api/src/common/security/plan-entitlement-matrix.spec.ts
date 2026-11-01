import { DEFAULT_PLAN_DEFINITIONS } from '../../modules/super-admin/plans.catalog';
import { TENANT_FEATURE_DEFINITIONS } from '../../modules/tenant-settings/tenant-settings.catalog';
import { TENANT_FEATURE_KEYS } from '../constants/tenant-features';
import { TenantEntitlementService } from './tenant-entitlement.service';

/*
 * Final product decisions (RUN-005 follow-up), asserted against the REAL plan
 * catalog and the REAL resolver rather than a hand-copied list:
 *   - basic import/export on every plan; advanced data management above Starter
 *   - the desktop agent on Enterprise and Custom only
 * Custom is the `enterprise-plus` contract plan plus `TenantFeature` rows with
 * source CUSTOM. It does NOT inherit the optional capabilities (desktop agent,
 * white-label e-mail): they are switched on only by an explicit CUSTOM grant.
 */
const AGENT = TENANT_FEATURE_KEYS.DESKTOP_AGENT;
const BASIC = TENANT_FEATURE_KEYS.DATA_IMPORT_EXPORT;
const ADVANCED = TENANT_FEATURE_KEYS.ADVANCED_DATA_MANAGEMENT;
const WHITE_LABEL = TENANT_FEATURE_KEYS.EMAIL_WHITE_LABEL;

type Override = { key: string; isEnabled: boolean; source: string };

function service(
  enabled: readonly string[],
  overrides: Override[] = [],
  mode = 'ENFORCE',
) {
  const all = TENANT_FEATURE_DEFINITIONS.map((feature) => feature.key);
  const prisma = {
    platformSetting: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ value: { entitlementEnforcement: mode } }),
    },
    subscription: {
      findUnique: jest.fn().mockResolvedValue({
        status: 'ACTIVE',
        plan: {
          features: all.map((key) => ({
            featureKey: key,
            isEnabled: enabled.includes(key),
          })),
        },
      }),
    },
    tenantFeature: { findMany: jest.fn().mockResolvedValue(overrides) },
  };
  const svc = new TenantEntitlementService(prisma as never);
  const logger = (svc as unknown as { logger: Record<string, unknown> }).logger;
  jest.spyOn(logger as never, 'warn').mockImplementation(() => undefined);
  return svc;
}

const plan = (key: string) => {
  const found = DEFAULT_PLAN_DEFINITIONS.find((p) => p.key === key);
  if (!found) throw new Error(`no plan ${key}`);
  return found.enabledFeatureKeys as readonly string[];
};

afterEach(() => jest.restoreAllMocks());

describe('plan entitlement matrix', () => {
  it.each(['starter', 'growth', 'enterprise', 'enterprise-plus'])(
    '%s sells basic import/export',
    (key) => {
      expect(plan(key)).toContain(BASIC);
    },
  );

  it('keeps advanced data management off Starter', () => {
    expect(plan('starter')).not.toContain(ADVANCED);
    expect(plan('growth')).toContain(ADVANCED);
    expect(plan('enterprise')).toContain(ADVANCED);
  });

  it('retired the Growth-only data-management key', () => {
    for (const p of DEFAULT_PLAN_DEFINITIONS) {
      expect(p.enabledFeatureKeys as readonly string[]).not.toContain(
        'data-management',
      );
    }
  });

  it.each([
    ['starter', false],
    ['growth', false],
    ['enterprise', true],
    ['enterprise-plus', false],
  ])('%s desktop agent entitled = %s', async (key, expected) => {
    const decision = await service(plan(key)).decide('t', [AGENT]);
    expect(decision.allowed).toBe(expected);
  });

  it('lets a Starter tenant use basic import/export but not advanced', async () => {
    const svc = service(plan('starter'));
    expect((await svc.decide('t', [BASIC])).allowed).toBe(true);
    expect((await svc.decide('t', [ADVANCED])).allowed).toBe(false);
  });

  it('refuses a downgraded tenant the agent with no implicit access', async () => {
    // Plan changed from Enterprise to Growth; no override row exists.
    await expect(
      service(plan('growth')).assertEntitled(
        't',
        [AGENT],
        'POST /agent/auth/refresh',
      ),
    ).rejects.toMatchObject({ errorCode: 'TENANT_FEATURE_NOT_ENTITLED' });
  });

  it('honours an explicit CUSTOM grandfather override for the agent', async () => {
    const svc = service(plan('growth'), [
      { key: AGENT, isEnabled: true, source: 'CUSTOM' },
    ]);
    await expect(
      svc.assertEntitled('t', [AGENT], 'POST /agent/auth/login'),
    ).resolves.toBeUndefined();
  });

  it('does not let an ordinary MANUAL override grant the agent on Growth', async () => {
    const svc = service(plan('growth'), [
      { key: AGENT, isEnabled: true, source: 'MANUAL' },
    ]);
    await expect(
      svc.assertEntitled('t', [AGENT], 'POST /agent/auth/login'),
    ).rejects.toMatchObject({ errorCode: 'TENANT_FEATURE_NOT_ENTITLED' });
  });

  describe('Custom (enterprise-plus) optional capabilities need an explicit grant', () => {
    it.each([
      ['desktop agent', AGENT],
      ['white-label e-mail', WHITE_LABEL],
    ])('does not inherit the %s from the plan', async (_label, key) => {
      expect(plan('enterprise-plus')).not.toContain(key);
      expect(
        (await service(plan('enterprise-plus')).decide('t', [key])).allowed,
      ).toBe(false);
    });

    it.each([
      ['desktop agent', AGENT],
      ['white-label e-mail', WHITE_LABEL],
    ])('has the %s once a CUSTOM grant exists', async (_label, key) => {
      const svc = service(plan('enterprise-plus'), [
        { key, isEnabled: true, source: 'CUSTOM' },
      ]);
      expect((await svc.decide('t', [key])).allowed).toBe(true);
    });

    it('a grant for one capability does not grant the other', async () => {
      const svc = service(plan('enterprise-plus'), [
        { key: AGENT, isEnabled: true, source: 'CUSTOM' },
      ]);
      expect((await svc.decide('t', [AGENT])).allowed).toBe(true);
      expect((await svc.decide('t', [WHITE_LABEL])).allowed).toBe(false);
    });

    it('a MANUAL row never counts as an explicit grant', async () => {
      const svc = service(plan('enterprise-plus'), [
        { key: AGENT, isEnabled: true, source: 'MANUAL' },
      ]);
      expect((await svc.decide('t', [AGENT])).allowed).toBe(false);
    });

    it('withdrawing the grant (row removed or set off) takes the capability away', async () => {
      const off = service(plan('enterprise-plus'), [
        { key: AGENT, isEnabled: false, source: 'CUSTOM' },
      ]);
      expect((await off.decide('t', [AGENT])).allowed).toBe(false);
      const gone = service(plan('enterprise-plus'), []);
      expect((await gone.decide('t', [AGENT])).allowed).toBe(false);
    });

    it('assertEntitled refuses the agent without a grant (login/refresh path)', async () => {
      await expect(
        service(plan('enterprise-plus')).assertEntitled(
          't',
          [AGENT],
          'POST /agent/auth/refresh',
        ),
      ).rejects.toMatchObject({ errorCode: 'TENANT_FEATURE_NOT_ENTITLED' });
    });
  });

  it.each([
    ['starter', false],
    ['growth', false],
    ['enterprise', true],
  ])('%s white-label e-mail entitled = %s', async (key, expected) => {
    expect((await service(plan(key)).decide('t', [WHITE_LABEL])).allowed).toBe(
      expected,
    );
  });

  it('Enterprise can still have the agent switched off by a CUSTOM row', async () => {
    const svc = service(plan('enterprise'), [
      { key: AGENT, isEnabled: false, source: 'CUSTOM' },
    ]);
    expect((await svc.decide('t', [AGENT])).allowed).toBe(false);
  });

  it('only reports, and does not refuse, in REPORT_ONLY', async () => {
    await expect(
      service(plan('starter'), [], 'REPORT_ONLY').assertEntitled(
        't',
        [AGENT],
        'x',
      ),
    ).resolves.toBeUndefined();
  });

  it('offers a feature only when it would not be refused (menus, module lists)', async () => {
    const leave = TENANT_FEATURE_KEYS.LEAVE;
    // A custom plan that withdrew Leave: hidden under ENFORCE, shown otherwise.
    const without = plan('starter').filter((key) => key !== leave);
    expect(await service(without).isOffered('t', [leave])).toBe(false);
    expect(
      await service(without, [], 'REPORT_ONLY').isOffered('t', [leave]),
    ).toBe(true);
    expect(await service(plan('starter')).isOffered('t', [leave])).toBe(true);
  });
});
