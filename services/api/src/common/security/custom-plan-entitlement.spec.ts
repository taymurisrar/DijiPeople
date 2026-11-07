import { TENANT_FEATURE_DEFINITIONS } from '../../modules/tenant-settings/tenant-settings.catalog';
import { TENANT_FEATURE_KEYS } from '../constants/tenant-features';
import { TenantEntitlementService } from './tenant-entitlement.service';

/*
 * The effective entitlement of a tenant on a custom plan, including a converted
 * legacy plan that is archived and custom-only. Contracted features stay; the plan's
 * sales state, window and kind never change what an existing subscriber can use.
 */
const AGENT = TENANT_FEATURE_KEYS.DESKTOP_AGENT;
const WHITE_LABEL = TENANT_FEATURE_KEYS.EMAIL_WHITE_LABEL;
const BASIC = TENANT_FEATURE_KEYS.DATA_IMPORT_EXPORT;
const ADVANCED = TENANT_FEATURE_KEYS.ADVANCED_DATA_MANAGEMENT;

type Override = { key: string; isEnabled: boolean; source: string };

function build(
  planFeatureKeys: string[],
  overrides: Override[] = [],
  status = 'ACTIVE',
) {
  const findUnique = jest.fn().mockResolvedValue({
    status,
    gracePeriodEndsAt: null,
    plan: {
      features: planFeatureKeys.map((featureKey) => ({
        featureKey,
        isEnabled: true,
      })),
    },
  });
  const prisma = {
    platformSetting: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ value: { entitlementEnforcement: 'ENFORCE' } }),
    },
    subscription: { findUnique },
    tenantFeature: { findMany: jest.fn().mockResolvedValue(overrides) },
  };
  const svc = new TenantEntitlementService(prisma as never);
  const logger = (svc as unknown as { logger: Record<string, unknown> }).logger;
  jest.spyOn(logger as never, 'warn').mockImplementation(() => undefined);
  return { svc, findUnique };
}

const allowed = async (svc: TenantEntitlementService, key: string) =>
  (await svc.decide('t', [key])).allowed;

afterEach(() => jest.restoreAllMocks());

describe('effective entitlement on a custom plan', () => {
  it('is the selected features plus the universal baseline, and nothing else', async () => {
    const { svc } = build([AGENT]);
    expect(await allowed(svc, AGENT)).toBe(true);
    expect(await allowed(svc, BASIC)).toBe(true);
    expect(await allowed(svc, WHITE_LABEL)).toBe(false);
    expect(await allowed(svc, ADVANCED)).toBe(false);
    for (const { key } of TENANT_FEATURE_DEFINITIONS) {
      if (![AGENT, BASIC].includes(key as never)) {
        expect(await allowed(svc, key)).toBe(false);
      }
    }
  });

  it('keeps every contracted feature of a converted legacy plan (no silent removal)', async () => {
    const contracted = TENANT_FEATURE_DEFINITIONS.map((f) => f.key);
    const { svc } = build(contracted);
    for (const key of contracted) {
      expect(await allowed(svc, key)).toBe(true);
    }
  });

  it('reads only the features: plan kind, window, sales model and publication state cannot change what a subscriber may use', async () => {
    const { svc, findUnique } = build([AGENT]);
    await allowed(svc, AGENT);
    expect(
      (findUnique.mock.calls as Array<[{ select: unknown }]>)[0][0].select,
    ).toEqual({
      status: true,
      gracePeriodEndsAt: true,
      plan: { select: { features: true } },
    });
  });

  it('a MANUAL tenant row can restrict a plan feature, and even the baseline', async () => {
    const { svc } = build(
      [AGENT],
      [
        { key: AGENT, isEnabled: false, source: 'MANUAL' },
        { key: BASIC, isEnabled: false, source: 'MANUAL' },
      ],
    );
    expect(await allowed(svc, AGENT)).toBe(false);
    expect(await allowed(svc, BASIC)).toBe(false);
  });

  it('a MANUAL row never grants what the plan lacks; only an explicit CUSTOM row does', async () => {
    const manual = build(
      [],
      [{ key: AGENT, isEnabled: true, source: 'MANUAL' }],
    );
    expect(await allowed(manual.svc, AGENT)).toBe(false);
    const grandfathered = build(
      [],
      [{ key: AGENT, isEnabled: true, source: 'CUSTOM' }],
    );
    expect(await allowed(grandfathered.svc, AGENT)).toBe(true);
  });

  it('a lapsed subscription is a billing state: the gate reports it, it does not re-decide the plan', async () => {
    const { svc } = build([AGENT], [], 'CANCELED');
    expect((await svc.decide('t', [AGENT])).outcome).toBe(
      'NO_LIVE_SUBSCRIPTION',
    );
  });
});
