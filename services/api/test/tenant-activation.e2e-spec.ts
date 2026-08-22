import { randomUUID } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';

/**
 * REG-222 — ITEM-0004.
 *
 * The commercial onboarding E2E of 2026-08-15 proved every activation **gate**
 * — A16.01 through A16.05, five negative scenarios — and never once reached a
 * successful activation, because [[BUG-0015]] stranded the test tenant with no
 * owner. Its verdict table recorded `TENANT_PROVISIONING = FAIL`, and its Known
 * Limitations said so plainly: "the successful activation path, post-activation
 * owner/session behaviour and the final eight-tab tenant verification (A17) are
 * unproven".
 *
 * The gates are the easy half to test, because a gate fails loudly. This is the
 * end of the primary commercial journey — the product's most important flow had
 * a proven beginning, a proven middle, and an unobserved end.
 *
 * ## What is driven here
 *
 * Everything over real HTTP against a real database, as a real platform
 * operator who signed in through `POST /api/admin/auth/login`:
 *
 *   1. activation is refused while the workspace has no address (the gate);
 *   2. the address is issued, and activation succeeds — the tenant is `ACTIVE`;
 *   3. the owner, who could not sign in a moment ago, now can;
 *   4. all eight tenant tabs return data for that tenant.
 *
 * ## Why the gate is re-proven here rather than cited
 *
 * A16.01–A16.05 already cover the gates, and repeating them would be waste. One
 * is re-driven — the routing blocker — for a different reason: it is what makes
 * step 2 mean something. Without a refusal immediately before it, "activation
 * returned 201" is consistent with a build where the gate was deleted.
 *
 * ## Why the owner sign-in is a pair, not a single assertion
 *
 * `AuthService.login` refuses a non-`ACTIVE` tenant. Asserting only that the
 * owner can sign in *after* activation would pass on a build that let them sign
 * in all along — which would mean a suspended workspace never actually locked
 * anybody out. The refusal before is the half with the security consequence.
 *
 * ## The eight tabs
 *
 * `TENANT_PANEL_TABS` in `apps/admin/app/_components/tenants/` names them:
 * overview, configuration, access-security, commercial, apps-modules,
 * operations, timeline, system. Each is rendered from a control-plane endpoint,
 * and it is the endpoint that is driven here. A browser would additionally prove
 * the panels paint; it would not prove anything more about the tenant, and this
 * runs in CI on every push, which A17 never did.
 */
/**
 * The response shapes this suite reads.
 *
 * `supertest`'s `Response.body` is `any`, so every field access off it is an
 * unsafe-member-access warning and, worse, a typo in an assertion silently reads
 * `undefined` and passes. Narrowing once at the boundary is both the fix for the
 * lint family and the thing that makes these assertions mean what they say.
 */
interface SignInBody {
  user?: { email?: string };
  tenant?: { id?: string };
  tokens?: { accessToken?: string };
}

interface ErrorBody {
  message?: string;
}

interface ReadinessCheck {
  key: string;
  label: string;
  severity: string;
  message: string;
}

interface ReadinessBody {
  checks?: ReadinessCheck[];
}

/** One cast, at the boundary, instead of one per field read. */
function body<T>(response: { body: unknown }): T {
  return response.body as T;
}

describeWithDatabase()('Tenant activation reaches ACTIVE (DB-backed)', () => {
  jest.setTimeout(300_000);

  let app: INestApplication<App>;
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let fixtures: DbFixtures;

  const runId = randomUUID().slice(0, 8);
  const OPERATOR_PASSWORD = `platform-operator-${runId}`;
  const OWNER_PASSWORD = `tenant-owner-${runId}`;

  let tenant: Awaited<ReturnType<DbFixtures['createTenantWithBusinessUnit']>>;
  let ownerEmail: string;
  let operatorToken: string;
  let platformUserId: string;
  let planId: string;

  /**
   * `isWildcardDnsReady()` reads one platform setting, and the routing gate
   * depends on it. It is shared state rather than fixture state, so it is
   * snapshotted and put back — a test that leaves the platform configured
   * differently than it found it has changed the next suite's preconditions.
   */
  let provisioningSettingExisted = false;
  let provisioningSettingValue: unknown = null;

  beforeAll(async () => {
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
    app.setGlobalPrefix('api');
    await app.init();

    prisma = app.get(PrismaService);
    fixtures = new DbFixtures(prisma, 'activation');

    const existing = await prisma.platformSetting.findUnique({
      where: { key: 'tenant-provisioning' },
    });
    provisioningSettingExisted = existing !== null;
    provisioningSettingValue = existing?.value ?? null;

    tenant = await fixtures.createTenantWithBusinessUnit('workspace');
    /*
     * `Tenant.status` defaults to ACTIVE in the schema, which is right for the
     * many fixtures that only need a tenant to exist. This suite is about
     * *reaching* ACTIVE, so it starts where a freshly provisioned workspace
     * starts — and a tenant created already-active would make every assertion
     * below vacuous.
     */
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { status: 'PENDING_SETUP' },
    });

    const plan = await prisma.plan.create({
      data: { key: fixtures.name('plan'), name: fixtures.name('plan') },
      select: { id: true },
    });
    planId = plan.id;
    await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId,
        startDate: new Date('2026-01-01'),
        status: 'ACTIVE',
      },
    });

    // The owner rule counts ACTIVE users holding the global-admin role, so the
    // fixture has to build the role and the assignment, not just the user.
    const role = await prisma.role.create({
      data: { tenantId: tenant.id, key: 'global-admin', name: 'Global Admin' },
      select: { id: true },
    });
    ownerEmail = `owner-${runId}@example.invalid`;
    const owner = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        businessUnitId: tenant.businessUnitId,
        firstName: 'Tenant',
        lastName: 'Owner',
        email: ownerEmail,
        passwordHash: await bcrypt.hash(OWNER_PASSWORD, 10),
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    await prisma.userRole.create({
      data: { tenantId: tenant.id, userId: owner.id, roleId: role.id },
    });

    const operator = await prisma.platformUser.create({
      data: {
        email: `operator-${runId}@example.invalid`,
        firstName: 'Platform',
        lastName: 'Operator',
        passwordHash: await bcrypt.hash(OPERATOR_PASSWORD, 10),
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
      },
      select: { id: true },
    });
    platformUserId = operator.id;

    // A real sign-in, not a hand-minted token. The whole point of this suite is
    // that the journey is driven the way the product drives it.
    const signIn = await request(app.getHttpServer())
      .post('/api/admin/auth/login')
      .set('X-DijiPeople-App', 'admin')
      .send({
        email: `operator-${runId}@example.invalid`,
        password: OPERATOR_PASSWORD,
      });
    expect(signIn.status).toBeLessThan(400);
    operatorToken = body<SignInBody>(signIn).tokens?.accessToken ?? '';
    expect(operatorToken).not.toBe('');
  });

  afterAll(async () => {
    await prisma.platformRefreshToken.deleteMany({ where: { platformUserId } });
    await prisma.platformUser.deleteMany({ where: { id: platformUserId } });

    if (provisioningSettingExisted) {
      await prisma.platformSetting.update({
        where: { key: 'tenant-provisioning' },
        data: { value: provisioningSettingValue as never },
      });
    } else {
      await prisma.platformSetting
        .deleteMany({ where: { key: 'tenant-provisioning' } })
        .catch(() => undefined);
    }

    await fixtures?.cleanup();
    if (planId) {
      await prisma.plan
        .deleteMany({ where: { id: planId } })
        .catch(() => undefined);
    }
    await app?.close();
  });

  function asOperator(path: string) {
    return request(app.getHttpServer())
      .get(`/api/platform/tenants/${tenant.id}${path}`)
      .set('X-DijiPeople-App', 'admin')
      .set('Authorization', `Bearer ${operatorToken}`);
  }

  function activate(reason: string) {
    return request(app.getHttpServer())
      .post(`/api/platform/tenants/${tenant.id}/status`)
      .set('X-DijiPeople-App', 'admin')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ status: 'ACTIVE', reason });
  }

  function blockersOf(response: { body: unknown }): ReadinessCheck[] {
    return (body<ReadinessBody>(response).checks ?? []).filter(
      (check) => check.severity === 'BLOCKER',
    );
  }

  function signInAsOwner() {
    return request(app.getHttpServer())
      .post('/api/auth/login')
      .set('X-DijiPeople-App', 'web')
      .send({
        email: ownerEmail,
        password: OWNER_PASSWORD,
        tenantSlug: tenant.slug,
      });
  }

  it('refuses activation while the workspace has no address', async () => {
    // A16-class gate, re-driven here so the success below means something. A
    // workspace nobody can reach produces an owner who is told it is live and
    // finds nothing at the address.
    const response = await activate('Activation attempt before routing exists');

    expect(response.status).toBe(400);
    expect(body<ErrorBody>(response).message ?? '').toMatch(
      /not reachable yet/i,
    );

    const row = await prisma.tenant.findUnique({
      where: { id: tenant.id },
      select: { status: true },
    });
    expect(row?.status).not.toBe('ACTIVE');
  });

  it('refuses the owner a sign-in while the tenant is not active', async () => {
    // The half of the pair with the security consequence: if this passed, a
    // suspended workspace would never actually lock anybody out.
    const response = await signInAsOwner();
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('activates once the workspace has an owner and an address', async () => {
    await prisma.platformSetting.upsert({
      where: { key: 'tenant-provisioning' },
      create: {
        key: 'tenant-provisioning',
        value: { wildcardDnsReady: true },
      },
      update: {
        value: { wildcardDnsReady: true },
      },
    });
    await prisma.tenantDomain.create({
      data: {
        tenantId: tenant.id,
        domain: `${tenant.slug}.workspace.invalid`,
        type: 'SYSTEM_SUBDOMAIN',
        isPrimary: true,
        verificationStatus: 'VERIFIED',
        verifiedAt: new Date(),
        tlsStatus: 'ACTIVE',
        sslStatus: 'ACTIVE',
      },
    });

    const response = await activate('Commercial onboarding complete');

    // Asserted against the refusal message, not just the code: a readiness
    // refusal names which of six checks fired, and "expected < 400, received
    // 400" would send the next reader hunting for it.
    expect(body<ErrorBody>(response).message ?? '').toBe('');
    expect(response.status).toBeLessThan(400);

    // The record, not the response. A handler that returned the requested
    // status without writing it would satisfy the line above.
    const row = await prisma.tenant.findUnique({
      where: { id: tenant.id },
      select: { status: true, subStatus: true },
    });
    expect(row?.status).toBe('ACTIVE');
    expect(row?.subStatus).toBe('Commercial onboarding complete');
  });

  it('lets the owner sign in once the tenant is active', async () => {
    /*
     * ITEM-0004's second acceptance criterion, and the first thing a real
     * customer does after being told their workspace is live. It is asserted
     * against the same account that was refused above, so the difference is the
     * activation and nothing else.
     */
    const response = await signInAsOwner();

    expect(response.status).toBeLessThan(400);
    const signedIn = body<SignInBody>(response);
    expect(signedIn.user?.email).toBe(ownerEmail);
    expect(signedIn.tenant?.id).toBe(tenant.id);
    expect(typeof signedIn.tokens?.accessToken).toBe('string');
  });

  it('records the activation in the audit trail', async () => {
    // An unexplained lifecycle change on a customer's workspace is not
    // something anyone can defend later, which is why `reason` is required.
    const entries = await prisma.auditLog.findMany({
      where: { tenantId: tenant.id, entityType: 'Tenant' },
      select: { action: true, afterSnapshot: true },
    });

    const activation = entries.find(
      (entry) => entry.action === 'TENANT_LIFECYCLE_CHANGED',
    );
    expect(activation).toBeDefined();
    expect(JSON.stringify(activation?.afterSnapshot)).toContain('ACTIVE');
  });

  /**
   * A17, at the level that decides whether a tab has anything to show. The
   * eight names come from `TENANT_PANEL_TABS`; the paths are the control-plane
   * endpoints each panel reads.
   */
  const TABS: Array<{ tab: string; path: string }> = [
    { tab: 'overview', path: '/overview' },
    { tab: 'overview (readiness)', path: '/readiness' },
    { tab: 'configuration', path: '/configuration' },
    { tab: 'access-security', path: '/access' },
    { tab: 'commercial', path: '/commercial' },
    { tab: 'apps-modules (modules)', path: '/modules' },
    { tab: 'apps-modules (apps)', path: '/apps' },
    { tab: 'operations', path: '/operations' },
    { tab: 'timeline', path: '/timeline' },
    { tab: 'system', path: '/system' },
  ];

  it.each(TABS)(
    'serves the $tab tab for the activated tenant',
    async ({ path }) => {
      const response = await asOperator(path);

      expect(response.status).toBeLessThan(400);
      expect(response.body).toBeTruthy();
      expect(response.body).not.toEqual({});
    },
  );

  it('leaves no reachability blocker standing after activation', async () => {
    /*
     * The tabs returning 200 says the endpoints answer. This says the workspace
     * is in the state activation claimed for it: owner present, address issued,
     * routing configured.
     *
     * Scoped to the checks the gate actually enforces, and not to "readiness is
     * clean", because those are different claims — see the test below, which
     * exists because the difference is not obvious and is worth stating.
     */
    const response = await asOperator('/readiness');
    const gated = blockersOf(response).filter((check) =>
      [
        'owner',
        'workspace-slug',
        'workspace-domain',
        'workspace-routing',
      ].includes(check.key),
    );

    expect(gated).toEqual([]);
  });

  it('activates a workspace that still has nothing a user can open', async () => {
    /*
     * ITEM-0079, recorded as an observation rather than asserted as correct.
     *
     * The activation gate reasons about two ways a workspace can be live and
     * useless, and its own comments say so: one nobody can administer, and one
     * nobody can reach. Readiness names a third — no module enabled, "so the
     * workspace has nothing a user can open" — and the gate does not check it.
     *
     * So this passes: the tenant is ACTIVE, the owner signs in successfully (the
     * test above), and lands somewhere with nothing to open.
     *
     * This suite's plan entitles no modules, which is why the case is visible
     * here. In an ordinary provisioning run the plan entitles something and the
     * blocker never appears — which is exactly why nobody would find this by
     * using the product, and why it is pinned here rather than left as a note.
     *
     * The test asserts today's behaviour deliberately. If the gate is later
     * extended to cover modules, this fails, and the failure is the reminder to
     * come back and close ITEM-0079 rather than a regression.
     */
    const tenantRow = await prisma.tenant.findUnique({
      where: { id: tenant.id },
      select: { status: true },
    });
    expect(tenantRow?.status).toBe('ACTIVE');

    const response = await asOperator('/readiness');

    expect(blockersOf(response).map((check) => check.key)).toEqual(['modules']);
  });
});
