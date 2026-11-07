import { DEFAULT_PLAN_DEFINITIONS } from '../../modules/super-admin/plans.catalog';
import { TENANT_FEATURE_DEFINITIONS } from '../../modules/tenant-settings/tenant-settings.catalog';
import { TENANT_FEATURE_KEYS } from '../constants/tenant-features';
import { TenantEntitlementService } from './tenant-entitlement.service';

/*
 * Final product decisions (RUN-005 follow-up), asserted against the REAL plan
 * catalog and the REAL resolver rather than a hand-copied list:
 *   - basic import/export on every plan; advanced data management above Starter
 *   - the desktop agent on Enterprise and Custom only
 * A custom plan entitles exactly the features selected on it (plus basic
 * import/export). It never inherits Enterprise's optional capabilities (desktop
 * agent, white-label e-mail).
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
  it.each(['starter', 'growth', 'enterprise'])(
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

  describe('custom plans entitle exactly what they list (no inheritance from Enterprise)', () => {
    const customPlan = (...keys: string[]) => [...keys];

    it('the catalogue has exactly three predefined plans', () => {
      expect(DEFAULT_PLAN_DEFINITIONS.map((p) => p.key)).toEqual([
        'starter',
        'growth',
        'enterprise',
      ]);
    });

    it.each([
      ['desktop agent', AGENT],
      ['white-label e-mail', WHITE_LABEL],
    ])(
      'a custom plan that does not select the %s does not have it',
      async (_label, key) => {
        const svc = service(
          customPlan(TENANT_FEATURE_KEYS.LEAVE, TENANT_FEATURE_KEYS.ATTENDANCE),
        );
        expect((await svc.decide('t', [key])).allowed).toBe(false);
      },
    );

    it.each([
      ['desktop agent', AGENT],
      ['white-label e-mail', WHITE_LABEL],
    ])('a custom plan that selects the %s has it', async (_label, key) => {
      const svc = service(customPlan(TENANT_FEATURE_KEYS.LEAVE, key));
      expect((await svc.decide('t', [key])).allowed).toBe(true);
    });

    it('selecting one optional capability does not bring the other', async () => {
      const svc = service(customPlan(AGENT));
      expect((await svc.decide('t', [AGENT])).allowed).toBe(true);
      expect((await svc.decide('t', [WHITE_LABEL])).allowed).toBe(false);
    });

    it('may offer fewer capabilities than Starter', async () => {
      const svc = service(customPlan(TENANT_FEATURE_KEYS.LEAVE));
      expect((await svc.decide('t', [TENANT_FEATURE_KEYS.LEAVE])).allowed).toBe(
        true,
      );
      expect(
        (await svc.decide('t', [TENANT_FEATURE_KEYS.ATTENDANCE])).allowed,
      ).toBe(false);
    });

    it('basic import/export is available on a custom plan that does not list it', async () => {
      const svc = service(customPlan(TENANT_FEATURE_KEYS.LEAVE));
      expect((await svc.decide('t', [BASIC])).allowed).toBe(true);
      // ...but advanced data management is a separate, selectable capability.
      expect((await svc.decide('t', [ADVANCED])).allowed).toBe(false);
    });

    it('removing the agent from the plan takes it away (the next snapshot)', async () => {
      const withAgent = service(customPlan(AGENT));
      const without = service(customPlan());
      expect((await withAgent.decide('t', [AGENT])).allowed).toBe(true);
      expect((await without.decide('t', [AGENT])).allowed).toBe(false);
    });

    it('a MANUAL tenant row can still only restrict, never grant past the custom plan', async () => {
      const svc = service(customPlan(), [
        { key: AGENT, isEnabled: true, source: 'MANUAL' },
      ]);
      expect((await svc.decide('t', [AGENT])).allowed).toBe(false);
    });

    it('assertEntitled refuses the agent on a custom plan that omits it (login/refresh path)', async () => {
      await expect(
        service(customPlan()).assertEntitled(
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
