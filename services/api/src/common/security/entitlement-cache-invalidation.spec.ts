import {
  ENTITLEMENT_CACHE_TTL_MS,
  TenantEntitlementService,
} from './tenant-entitlement.service';

/*
 * DP-QA-047: a subscription reassignment must reach the entitlement guard on the
 * very next check, and a stale snapshot must not outlive the approved 60 s limit
 * on any instance.
 */
const AGENT = 'desktop-agent';

/** A database whose subscription plan can be switched, like a reassignment. */
function database() {
  const state = {
    features: [AGENT] as string[],
    reads: 0,
    gate: null as null | Promise<void>,
  };
  const prisma = {
    platformSetting: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ value: { entitlementEnforcement: 'ENFORCE' } }),
    },
    subscription: {
      findUnique: jest.fn(async () => {
        state.reads += 1;
        // Snapshot the plan as of the START of the read, then optionally wait: this
        // is a request that began before the reassignment and finishes after it.
        const features = [...state.features];
        if (state.gate) await state.gate;
        return {
          status: 'ACTIVE',
          gracePeriodEndsAt: null,
          plan: {
            features: features.map((featureKey) => ({
              featureKey,
              isEnabled: true,
            })),
          },
        };
      }),
    },
    tenantFeature: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { state, prisma };
}

function instance(prisma: unknown) {
  const svc = new TenantEntitlementService(prisma as never);
  const logger = (svc as unknown as { logger: Record<string, unknown> }).logger;
  jest.spyOn(logger as never, 'warn').mockImplementation(() => undefined);
  return svc;
}

const allowed = async (svc: TenantEntitlementService, tenant = 't1') =>
  (await svc.decide(tenant, [AGENT])).allowed;

afterEach(() => jest.restoreAllMocks());

describe('the snapshot TTL', () => {
  it('leaves a safety margin inside the approved 60 s withdrawal limit', () => {
    // A TTL equal to the limit measured 60.01-60.10 s once latency was added.
    expect(ENTITLEMENT_CACHE_TTL_MS).toBeLessThanOrEqual(30_000);
  });
});

describe('invalidate() after a reassignment', () => {
  it('serves the new entitlement on the very next check, not after the TTL', async () => {
    const { state, prisma } = database();
    const svc = instance(prisma);
    expect(await allowed(svc)).toBe(true);

    state.features = []; // reassigned to a plan without the agent
    expect(await allowed(svc)).toBe(true); // cached: the stale answer
    svc.invalidate('t1');
    expect(await allowed(svc)).toBe(false); // flushed: the next check
  });

  it('is repeatable: every change is picked up by its own invalidation', async () => {
    const { state, prisma } = database();
    const svc = instance(prisma);
    const seen: boolean[] = [];
    for (const features of [[AGENT], [], [AGENT], [], []]) {
      state.features = features;
      svc.invalidate('t1');
      seen.push(await allowed(svc));
    }
    expect(seen).toEqual([true, false, true, false, false]);
  });

  it("only touches the affected tenant's entry", async () => {
    const { state, prisma } = database();
    const svc = instance(prisma);
    await allowed(svc, 't1');
    await allowed(svc, 't2');
    const before = state.reads;

    svc.invalidate('t1');
    await allowed(svc, 't2'); // still cached
    expect(state.reads).toBe(before);
    await allowed(svc, 't1'); // re-read
    expect(state.reads).toBe(before + 1);
  });
});

describe('concurrent requests during a change', () => {
  it('a read that began before the change cannot re-seed the stale snapshot', async () => {
    const { state, prisma } = database();
    const svc = instance(prisma);

    let release!: () => void;
    state.gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    // Request A starts reading while the tenant still has the agent...
    const inFlight = allowed(svc);
    // ...the operator reassigns the subscription and the control plane flushes...
    state.features = [];
    svc.invalidate('t1');
    // ...and only then does A's read return, carrying the pre-change plan.
    state.gate = null;
    release();
    expect(await inFlight).toBe(true); // A began before the change: its own answer

    // The pre-change snapshot must NOT have been cached: B sees the new plan.
    expect(await allowed(svc)).toBe(false);
  });

  it('invalidateAll() has the same protection for plan edits', async () => {
    const { state, prisma } = database();
    const svc = instance(prisma);
    let release!: () => void;
    state.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inFlight = allowed(svc);
    state.features = [];
    svc.invalidateAll();
    state.gate = null;
    release();
    await inFlight;
    expect(await allowed(svc)).toBe(false);
  });

  it('many simultaneous checks all converge on the new answer after one flush', async () => {
    const { state, prisma } = database();
    const svc = instance(prisma);
    await allowed(svc);
    state.features = [];
    svc.invalidate('t1');
    const answers = await Promise.all(
      Array.from({ length: 25 }, () => allowed(svc)),
    );
    expect(answers.every((a) => a === false)).toBe(true);
  });
});

describe('several application instances', () => {
  it('the instance that handled the change is current at once; the other converges within the TTL', async () => {
    const { state, prisma } = database();
    const a = instance(prisma);
    const b = instance(prisma);
    expect(await allowed(a)).toBe(true);
    expect(await allowed(b)).toBe(true);

    const start = Date.now();
    state.features = [];
    a.invalidate('t1'); // the operator's request landed on instance A
    expect(await allowed(a)).toBe(false);
    // B has its own cache: it is the staleness the TTL bounds.
    expect(await allowed(b)).toBe(true);

    jest
      .spyOn(Date, 'now')
      .mockReturnValue(start + ENTITLEMENT_CACHE_TTL_MS + 1);
    expect(await allowed(b)).toBe(false);
    // ...and that bound is inside the approved 60 s limit.
    expect(ENTITLEMENT_CACHE_TTL_MS + 1).toBeLessThan(60_000);
  });
});

describe('describeEnforcement (health payload for the deploy gate)', () => {
  const OLD = process.env.ENTITLEMENT_ENFORCEMENT_MODE;
  afterEach(() => {
    if (OLD === undefined) delete process.env.ENTITLEMENT_ENFORCEMENT_MODE;
    else process.env.ENTITLEMENT_ENFORCEMENT_MODE = OLD;
  });

  const withSetting = (value: unknown) => ({
    platformSetting: { findUnique: jest.fn().mockResolvedValue(value) },
  });

  it('reports not enforced for the production default (no row, no floor)', async () => {
    delete process.env.ENTITLEMENT_ENFORCEMENT_MODE;
    const svc = instance(withSetting(null));
    expect(await svc.describeEnforcement()).toMatchObject({
      mode: 'REPORT_ONLY',
      enforced: false,
    });
  });

  it('reports enforced when the environment floor is ENFORCE', async () => {
    process.env.ENTITLEMENT_ENFORCEMENT_MODE = 'ENFORCE';
    const svc = instance(withSetting(null));
    expect(await svc.describeEnforcement()).toMatchObject({
      mode: 'ENFORCE',
      enforced: true,
    });
  });

  it('a malformed floor fails closed to ENFORCE, which the health report shows', async () => {
    process.env.ENTITLEMENT_ENFORCEMENT_MODE = 'ENFORCED';
    const svc = instance(withSetting(null));
    jest
      .spyOn(
        (svc as unknown as { logger: { error: () => void } }).logger,
        'error',
      )
      .mockImplementation(() => undefined);
    expect((await svc.describeEnforcement()).enforced).toBe(true);
  });

  it('REPORT_ONLY is never reported as enforced, even with a stored row', async () => {
    delete process.env.ENTITLEMENT_ENFORCEMENT_MODE;
    const svc = instance(
      withSetting({ value: { entitlementEnforcement: 'REPORT_ONLY' } }),
    );
    expect((await svc.describeEnforcement()).enforced).toBe(false);
  });

  it('reports UNKNOWN / not enforced when the mode cannot be determined at all', async () => {
    const svc = instance(withSetting(null));
    jest.spyOn(svc, 'effectiveMode').mockRejectedValue(new Error('boom'));
    expect(await svc.describeEnforcement()).toMatchObject({
      mode: 'UNKNOWN',
      enforced: false,
    });
  });
});
