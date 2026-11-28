/* eslint-disable @typescript-eslint/no-unsafe-member-access -- supertest response bodies are untyped JSON */
import { INestApplication, Logger, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SecurityPrivilege, TenantFeatureSource } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { ENTITY_KEYS } from '../src/common/constants/rbac-matrix';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { WorkComponentsService } from '../src/modules/work-profiles/work-components.service';
import {
  ENTITLEMENT_ENV_VAR,
  ENTITLEMENT_SETTING_KEY,
  TenantEntitlementService,
  type EntitlementEnforcementMode,
} from '../src/common/security/tenant-entitlement.service';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { HttpActors, type HttpActor } from './helpers/http-actors';
import { roleActor } from './helpers/role-actors';
import { assertIsolatedUtf8Database } from './helpers/test-database';

/**
 * ENFORCE-mode plan entitlement, through the real guards over HTTP.
 *
 * WARNING - PARALLEL RUNS ARE UNSAFE. Run with `jest --runInBand` only, and never
 * alongside another suite against the same database. The enforcement mode is a
 * GLOBAL setting (one `PlatformSetting` row, plus a release-floor environment
 * variable), so any process that flips it changes what every other process sees.
 *
 * How this suite keeps that contract:
 *   - It aborts unless DATABASE_URL names `dp_master_e2e_test` or `dp_master_utf8`.
 *   - It never WRITES the platform setting. The mode is injected by stubbing
 *     `TenantEntitlementService.mode()` on this app's own instance (so the real
 *     guard, the real `decide()`, the real cache and the real database rows all
 *     run), and one test drives the real `effectiveMode()` through the
 *     ENTITLEMENT_ENFORCEMENT_MODE release floor. The environment variable is
 *     restored in a `finally`, and the last test proves both it and the stored
 *     setting row are exactly what they were at the start.
 *
 * Which routes are gated (verified by grep, asserted below): `/projects` carries
 * `@RequireEntitlement('projects')`; the work-management controllers
 * (`/work-items`, `/work-duties`, `/work-decisions`, `/work-meetings`,
 * `/work-blockers`, `/work-queues`, `/daily-updates`) carry
 * `@RequireEntitlement('work-management')` (ADR-0032, Growth and Enterprise).
 * Packaging work components for ALM needs `work-intelligence` (Enterprise), enforced
 * in `WorkComponentsService`, which is exercised directly below.
 */
// Same rule as test/helpers/test-database.ts: a database named as a throwaway
// (local dp_master_e2e_test / dp_master_utf8, CI dijipeople_e2e_test).
const SAFE_DATABASE = /(_e2e|_gui|_utf8)/;

describeWithDatabase()('Plan entitlement under ENFORCE (e2e)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  let entitlements: TenantEntitlementService;
  let modeStub: jest.SpyInstance;

  const suffix = randomUUID().slice(0, 6);
  const tenantIds: string[] = [];
  const planIds: string[] = [];
  let settingBefore: { key: string; value: unknown } | null;
  let envBefore: string | undefined;

  type Fixture = { tenantId: string; actor: HttpActor };
  let withPlan: Fixture; // plan sells projects
  let withoutPlan: Fixture; // plan does not sell projects
  let other: Fixture; // a different tenant on a plan without projects
  let growthLike: Fixture; // plan sells work-management only
  let enterpriseLike: Fixture; // plan sells work-management and work-intelligence

  const get = (actor: HttpActor, path: string) =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${actor.token}`)
      .set('X-DijiPeople-App', 'web');

  const setMode = (mode: EntitlementEnforcementMode) =>
    modeStub.mockResolvedValue(mode);

  const guardLog = (needle: string) =>
    (Logger.prototype.warn as unknown as jest.SpyInstance).mock.calls
      .map((call) => String(call[0]))
      .filter((line) => line.startsWith(needle));

  async function plan(label: string, features: Record<string, boolean>) {
    const created = await prisma.plan.create({
      data: {
        key: `ent-${label}-${suffix}`,
        name: `Entitlement ${label}`,
        features: {
          create: Object.entries(features).map(([featureKey, isEnabled]) => ({
            featureKey,
            isEnabled,
          })),
        },
      },
      select: { id: true },
    });
    planIds.push(created.id);
    return created.id;
  }

  async function tenant(label: string, planId: string): Promise<Fixture> {
    const t = await fixtures.createTenant(label);
    tenantIds.push(t.id);
    const org = await fixtures.createOrganization(t.id);
    const unit = await fixtures.createBusinessUnit(t.id, org);
    await prisma.subscription.create({
      data: {
        tenantId: t.id,
        planId,
        status: 'ACTIVE',
        startDate: new Date(),
      },
    });
    const actor = await roleActor(prisma, actors, {
      tenantId: t.id,
      unit,
      label,
      suffix,
      keys: [
        'projects.read',
        'work-items.read',
        'work-queues.read',
        'daily-updates.read',
      ],
      grants: [
        {
          entityKey: ENTITY_KEYS.PROJECTS,
          privileges: [SecurityPrivilege.READ],
        },
        {
          entityKey: ENTITY_KEYS.EMPLOYEES,
          privileges: [SecurityPrivilege.READ],
        },
      ],
    });
    return { tenantId: t.id, actor };
  }

  beforeAll(async () => {
    // Abort before anything is created: this suite touches a global setting.
    const url = process.env.DATABASE_URL ?? '';
    if (!SAFE_DATABASE.test(url)) {
      throw new Error(
        'entitlement-enforce.e2e-spec refuses to run: DATABASE_URL must name a throwaway database (_e2e, _gui or _utf8).',
      );
    }
    envBefore = process.env[ENTITLEMENT_ENV_VAR];
    delete process.env[ENTITLEMENT_ENV_VAR];

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    // As main.ts does: the refusal contract (`errorCode`) is what is asserted.
    app.useGlobalFilters(app.get(HttpExceptionFilter));
    await app.init();
    prisma = app.get(PrismaService);
    await assertIsolatedUtf8Database(prisma);

    settingBefore = await prisma.platformSetting.findUnique({
      where: { key: ENTITLEMENT_SETTING_KEY },
      select: { key: true, value: true },
    });
    entitlements = app.get(TenantEntitlementService);
    modeStub = jest.spyOn(entitlements, 'mode');
    jest.spyOn(Logger.prototype, 'warn');

    fixtures = new DbFixtures(prisma, 'entf');
    actors = new HttpActors(app, suffix);
    const sells = await plan('sells', { projects: true });
    const doesNot = await plan('doesnot', { payroll: true });
    withPlan = await tenant('with', sells);
    withoutPlan = await tenant('without', doesNot);
    other = await tenant('other', doesNot);
    growthLike = await tenant(
      'growth',
      await plan('growth', { 'work-management': true, payroll: true }),
    );
    enterpriseLike = await tenant(
      'ent',
      await plan('ent', {
        'work-management': true,
        'work-intelligence': true,
      }),
    );
  });

  afterAll(async () => {
    try {
      jest.restoreAllMocks();
      // The release floor is process-wide; put back exactly what was there.
      if (envBefore === undefined) delete process.env[ENTITLEMENT_ENV_VAR];
      else process.env[ENTITLEMENT_ENV_VAR] = envBefore;
      entitlements?.invalidateAll();

      for (const tenantId of tenantIds) {
        await prisma.errorLog.deleteMany({ where: { tenantId } });
        await prisma.tenantFeature.deleteMany({ where: { tenantId } });
      }
      await actors?.cleanup();
      // Tenants cascade their subscriptions; plans are not tenant-owned.
      await fixtures?.cleanup();
      if (planIds.length) {
        await prisma.plan.deleteMany({ where: { id: { in: planIds } } });
      }
    } finally {
      await app?.close();
    }
  });

  beforeEach(() => {
    (Logger.prototype.warn as unknown as jest.SpyInstance).mockClear();
    entitlements.invalidateAll();
  });

  /* -------------------------------------------------------------- ENFORCE */

  it('ENFORCE refuses a tenant whose plan does not sell the module, with the catalog error', async () => {
    setMode('ENFORCE');
    const res = await get(withoutPlan.actor, '/projects');
    expect(res.status).toBe(403);
    expect(res.body.errorCode).toBe('TENANT_FEATURE_NOT_ENTITLED');
    expect(
      guardLog('ENTITLEMENT_REFUSED').some(
        (line) =>
          line.includes(`tenant=${withoutPlan.tenantId}`) &&
          line.includes('features=projects') &&
          line.includes('route=GET /projects') &&
          line.includes('outcome=NOT_ENTITLED'),
      ),
    ).toBe(true);
  });

  it('ENFORCE allows a tenant whose plan sells the module', async () => {
    setMode('ENFORCE');
    const res = await get(withPlan.actor, '/projects');
    expect(res.status).toBe(200);
    expect(guardLog('ENTITLEMENT_REFUSED')).toHaveLength(0);
  });

  const WORK_PATHS = [
    '/work-items',
    '/work-duties/templates',
    '/work-decisions',
    '/work-meetings',
    '/work-blockers',
    '/work-queues',
    '/daily-updates',
  ];

  it('ENFORCE refuses a Starter-like tenant on every work route with TENANT_FEATURE_NOT_ENTITLED', async () => {
    setMode('ENFORCE');
    for (const path of WORK_PATHS) {
      const res = await get(withoutPlan.actor, path);
      expect({ path, status: res.status, code: res.body.errorCode }).toEqual({
        path,
        status: 403,
        code: 'TENANT_FEATURE_NOT_ENTITLED',
      });
    }
    expect(
      guardLog('ENTITLEMENT_REFUSED').some((line) =>
        line.includes('features=work-management'),
      ),
    ).toBe(true);
  });

  it('ENFORCE serves a Growth-like tenant (work-management) on every work route', async () => {
    setMode('ENFORCE');
    for (const path of WORK_PATHS) {
      const res = await get(growthLike.actor, path);
      expect({ path, status: res.status }).toEqual({ path, status: 200 });
    }
    expect(guardLog('ENTITLEMENT_REFUSED')).toHaveLength(0);
  });

  it('a CUSTOM override grants work-management to a Starter-like tenant; a MANUAL one cannot', async () => {
    setMode('ENFORCE');
    const tenantId = withoutPlan.tenantId;
    await prisma.tenantFeature.create({
      data: {
        tenantId,
        key: 'work-management',
        isEnabled: true,
        source: TenantFeatureSource.MANUAL,
      },
    });
    entitlements.invalidate(tenantId);
    expect((await get(withoutPlan.actor, '/work-items')).status).toBe(403);
    await prisma.tenantFeature.update({
      where: { tenantId_key: { tenantId, key: 'work-management' } },
      data: { source: TenantFeatureSource.CUSTOM },
    });
    entitlements.invalidate(tenantId);
    expect((await get(withoutPlan.actor, '/work-items')).status).toBe(200);
    await prisma.tenantFeature.deleteMany({ where: { tenantId } });
    entitlements.invalidate(tenantId);
  });

  it('work-intelligence: packaging work components is refused on Growth and allowed on Enterprise; MANUAL cannot exceed the plan', async () => {
    setMode('ENFORCE');
    const work = app.get(WorkComponentsService);
    const component = [{ type: 'workUnit', key: 'x', objectKey: 'x' }] as never;

    await expect(
      work.assertPackagingEntitled(growthLike.tenantId, 'test'),
    ).rejects.toMatchObject({ errorCode: 'TENANT_FEATURE_NOT_ENTITLED' });
    // The planner itself refuses before reading anything, so import analysis is covered.
    await expect(
      work.plan(prisma, growthLike.tenantId, component, {}),
    ).rejects.toMatchObject({ errorCode: 'TENANT_FEATURE_NOT_ENTITLED' });
    await expect(
      work.assertPackagingEntitled(enterpriseLike.tenantId, 'test'),
    ).resolves.toBeUndefined();

    await prisma.tenantFeature.create({
      data: {
        tenantId: growthLike.tenantId,
        key: 'work-intelligence',
        isEnabled: true,
        source: TenantFeatureSource.MANUAL,
      },
    });
    entitlements.invalidate(growthLike.tenantId);
    await expect(
      work.assertPackagingEntitled(growthLike.tenantId, 'test'),
    ).rejects.toMatchObject({ errorCode: 'TENANT_FEATURE_NOT_ENTITLED' });
    await prisma.tenantFeature.update({
      where: {
        tenantId_key: {
          tenantId: growthLike.tenantId,
          key: 'work-intelligence',
        },
      },
      data: { source: TenantFeatureSource.CUSTOM },
    });
    entitlements.invalidate(growthLike.tenantId);
    await expect(
      work.assertPackagingEntitled(growthLike.tenantId, 'test'),
    ).resolves.toBeUndefined();
    await prisma.tenantFeature.deleteMany({
      where: { tenantId: growthLike.tenantId },
    });
    entitlements.invalidate(growthLike.tenantId);
  });

  it('work-intelligence under REPORT_ONLY lets packaging through and logs the would-be refusal', async () => {
    setMode('REPORT_ONLY');
    const work = app.get(WorkComponentsService);
    await expect(
      work.assertPackagingEntitled(growthLike.tenantId, 'report-only-route'),
    ).resolves.toBeUndefined();
    expect(
      guardLog('ENTITLEMENT_WOULD_REFUSE').some(
        (line) =>
          line.includes(`tenant=${growthLike.tenantId}`) &&
          line.includes('features=work-intelligence'),
      ),
    ).toBe(true);
  });

  it('REPORT_ONLY lets a Starter-like tenant through work routes and logs it', async () => {
    setMode('REPORT_ONLY');
    const res = await get(withoutPlan.actor, '/work-items');
    expect(res.status).toBe(200);
    expect(
      guardLog('ENTITLEMENT_WOULD_REFUSE').some((line) =>
        line.includes('features=work-management'),
      ),
    ).toBe(true);
  });

  /* ------------------------------------------------------------ REPORT_ONLY */

  it('REPORT_ONLY lets the same request through and records the would-have-been refusal', async () => {
    setMode('REPORT_ONLY');
    const res = await get(withoutPlan.actor, '/projects');
    expect(res.status).toBe(200);
    expect(guardLog('ENTITLEMENT_REFUSED')).toHaveLength(0);
    expect(
      guardLog('ENTITLEMENT_WOULD_REFUSE').some(
        (line) =>
          line.includes(`tenant=${withoutPlan.tenantId}`) &&
          line.includes('features=projects') &&
          line.includes('route=GET /projects'),
      ),
    ).toBe(true);
  });

  it('OFF neither refuses nor records anything', async () => {
    setMode('OFF');
    const res = await get(withoutPlan.actor, '/projects');
    expect(res.status).toBe(200);
    expect(guardLog('ENTITLEMENT_REFUSED')).toHaveLength(0);
    expect(guardLog('ENTITLEMENT_WOULD_REFUSE')).toHaveLength(0);
  });

  it('the real mode resolution honours the release floor: ENFORCE from the environment refuses', async () => {
    modeStub.mockRestore(); // use the real mode()/effectiveMode() for this test
    process.env[ENTITLEMENT_ENV_VAR] = 'ENFORCE';
    try {
      entitlements.invalidateAll();
      const resolved = await entitlements.effectiveMode();
      expect(resolved.mode).toBe('ENFORCE');
      const res = await get(withoutPlan.actor, '/projects');
      expect(res.status).toBe(403);
      expect(res.body.errorCode).toBe('TENANT_FEATURE_NOT_ENTITLED');
    } finally {
      if (envBefore === undefined) delete process.env[ENTITLEMENT_ENV_VAR];
      else process.env[ENTITLEMENT_ENV_VAR] = envBefore;
      entitlements.invalidateAll();
      modeStub = jest.spyOn(entitlements, 'mode');
    }
  });

  /* ------------------------------------------------------------- overrides */

  it('a MANUAL override cannot exceed the plan cap; a CUSTOM override can grant', async () => {
    setMode('ENFORCE');
    const tenantId = withoutPlan.tenantId;

    await prisma.tenantFeature.create({
      data: {
        tenantId,
        key: 'projects',
        isEnabled: true,
        source: TenantFeatureSource.MANUAL,
      },
    });
    entitlements.invalidate(tenantId);
    expect((await get(withoutPlan.actor, '/projects')).status).toBe(403);

    await prisma.tenantFeature.update({
      where: { tenantId_key: { tenantId, key: 'projects' } },
      data: { source: TenantFeatureSource.CUSTOM },
    });
    entitlements.invalidate(tenantId);
    expect((await get(withoutPlan.actor, '/projects')).status).toBe(200);

    // A CUSTOM disable is authoritative the other way too.
    await prisma.tenantFeature.update({
      where: { tenantId_key: { tenantId, key: 'projects' } },
      data: { isEnabled: false },
    });
    entitlements.invalidate(tenantId);
    expect((await get(withoutPlan.actor, '/projects')).status).toBe(403);
    await prisma.tenantFeature.deleteMany({ where: { tenantId } });
    entitlements.invalidate(tenantId);
  });

  it('a MANUAL disable restricts a plan feature', async () => {
    setMode('ENFORCE');
    const tenantId = withPlan.tenantId;
    expect((await get(withPlan.actor, '/projects')).status).toBe(200);
    await prisma.tenantFeature.create({
      data: {
        tenantId,
        key: 'projects',
        isEnabled: false,
        source: TenantFeatureSource.MANUAL,
      },
    });
    entitlements.invalidate(tenantId);
    expect((await get(withPlan.actor, '/projects')).status).toBe(403);
    await prisma.tenantFeature.deleteMany({ where: { tenantId } });
    entitlements.invalidate(tenantId);
    expect((await get(withPlan.actor, '/projects')).status).toBe(200);
  });

  it('a change is not seen until the cache is invalidated, then is seen at once', async () => {
    setMode('ENFORCE');
    const tenantId = withoutPlan.tenantId;
    expect((await get(withoutPlan.actor, '/projects')).status).toBe(403); // caches

    await prisma.tenantFeature.create({
      data: {
        tenantId,
        key: 'projects',
        isEnabled: true,
        source: TenantFeatureSource.CUSTOM,
      },
    });
    // Within the TTL the snapshot still answers: this is the staleness bound.
    expect((await get(withoutPlan.actor, '/projects')).status).toBe(403);

    entitlements.invalidate(tenantId); // the seam TenantModulesService.update calls
    expect((await get(withoutPlan.actor, '/projects')).status).toBe(200);

    await prisma.tenantFeature.deleteMany({ where: { tenantId } });
    expect((await get(withoutPlan.actor, '/projects')).status).toBe(200); // stale
    entitlements.invalidate(tenantId);
    expect((await get(withoutPlan.actor, '/projects')).status).toBe(403);
  });

  it("another tenant's override never changes this tenant's answer", async () => {
    setMode('ENFORCE');
    expect((await get(withoutPlan.actor, '/projects')).status).toBe(403);
    expect((await get(other.actor, '/projects')).status).toBe(403);

    await prisma.tenantFeature.create({
      data: {
        tenantId: other.tenantId,
        key: 'projects',
        isEnabled: true,
        source: TenantFeatureSource.CUSTOM,
      },
    });
    // Invalidate the WRONG tenants as well: nothing may leak either way.
    entitlements.invalidate(other.tenantId);
    entitlements.invalidate(withPlan.tenantId);
    expect((await get(other.actor, '/projects')).status).toBe(200);
    expect((await get(withoutPlan.actor, '/projects')).status).toBe(403);
    expect((await get(withPlan.actor, '/projects')).status).toBe(200);

    await prisma.tenantFeature.deleteMany({
      where: { tenantId: other.tenantId },
    });
    entitlements.invalidate(other.tenantId);
  });

  /* ------------------------------------------------------- global state */

  it('leaves the global enforcement state exactly as it found it', async () => {
    expect(process.env[ENTITLEMENT_ENV_VAR]).toBeUndefined();
    const settingNow = await prisma.platformSetting.findUnique({
      where: { key: ENTITLEMENT_SETTING_KEY },
      select: { key: true, value: true },
    });
    expect(settingNow).toEqual(settingBefore);
  });
});
