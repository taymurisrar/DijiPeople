import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { ROLE_KEYS } from '../src/common/constants/rbac-matrix';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { HttpActors, type HttpActor } from './helpers/http-actors';

/**
 * WP3 (SESSION-0137) — the platform-administration / tenant-administration
 * boundary, in both directions.
 *
 * EVIDENCE CLASS: database-backed HTTP integration.
 *
 *   tenant → platform: a tenant GLOBAL_ADMIN, the most privileged tenant role,
 *     must not reach any platform route, on either app client.
 *   platform → tenant: a platform SUPER_ADMIN must not be served by tenant
 *     routes as if it were a tenant user (it has no tenant).
 *
 * Every platform route is paired with a control: the SAME GET as a platform
 * super admin answers 200, so a refusal of the tenant caller is the boundary
 * working and not a wrong URL.
 */
describeWithDatabase()('Platform / tenant boundary (e2e, HTTP)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  let tenantAdmin: HttpActor;
  let tenantId: string;
  let platformAdmin: HttpActor;
  const suffix = randomUUID().slice(0, 6);
  const employeeMarker = `Boundarymark${suffix}`;

  const PLATFORM_ROUTES = [
    'super-admin/dashboard-summary',
    'super-admin/lifecycle-options',
    'super-admin/assignment-rules',
    'platform-teams',
    'platform-users',
    'platform-users/owner-candidates',
    'platform/monitoring/health',
    'platform/logs',
    'platform/logs/events',
    'platform/storage/readiness',
    'platform/events',
    'platform/events/overview',
    'platform/tenants/provisioning-queue',
    'app-releases/manage',
  ];

  const TENANT_ROUTES = [
    'employees',
    'roles',
    'teams',
    'users',
    'module-views',
  ];

  const get = (as: HttpActor, path: string, client: 'web' | 'admin') =>
    request(app.getHttpServer())
      .get(`/${path}`)
      .set('Authorization', `Bearer ${as.token}`)
      .set('X-DijiPeople-App', client);

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
    await app.init();
    prisma = app.get(PrismaService);
    fixtures = new DbFixtures(prisma, 'boundary');
    actors = new HttpActors(app, suffix);

    const tenant = await fixtures.createTenant('bnd');
    tenantId = tenant.id;
    const organizationId = await fixtures.createOrganization(tenant.id);
    const unit = await fixtures.createBusinessUnit(tenant.id, organizationId);
    tenantAdmin = await actors.tenantUser(tenant.id, unit, 'bnd-admin');
    const role = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        key: ROLE_KEYS.GLOBAL_ADMIN,
        name: 'Admin bnd',
      },
      select: { id: true },
    });
    await prisma.userRole.create({
      data: { tenantId: tenant.id, userId: tenantAdmin.id, roleId: role.id },
    });
    platformAdmin = await actors.platformUser('SUPER_ADMIN', 'bnd-platform');
    await prisma.employee.create({
      data: {
        tenantId: tenant.id,
        employeeCode: `BND-${suffix}`,
        firstName: 'Boundary',
        lastName: employeeMarker,
        phone: '000',
        hireDate: new Date('2024-01-01'),
      },
    });
  });

  afterAll(async () => {
    // try/finally so a cleanup failure can never leave the Nest app open and the
    // jest process hanging (CI has no --forceExit).
    try {
      await actors.cleanup();
      await fixtures.cleanup();
    } finally {
      await app.close();
    }
  });

  describe('controls', () => {
    it.each(PLATFORM_ROUTES)(
      'a platform super admin reaches %s (200)',
      async (route) => {
        const res = await get(platformAdmin, route, 'admin');
        expect({ route, status: res.status }).toEqual({ route, status: 200 });
      },
    );

    it.each(TENANT_ROUTES)(
      'a tenant GLOBAL_ADMIN reaches its own %s (200)',
      async (route) => {
        const res = await get(tenantAdmin, route, 'web');
        expect({ route, status: res.status }).toEqual({ route, status: 200 });
      },
    );
  });

  describe('tenant admin → platform routes', () => {
    it.each(PLATFORM_ROUTES)(
      'is refused on %s with the web client (403)',
      async (route) => {
        const res = await get(tenantAdmin, route, 'web');
        expect({ route, status: res.status }).toEqual({ route, status: 403 });
      },
    );

    it('BUG-4625: a refused platform-log request is audited against the tenant, not the platform table', async () => {
      // Before the fix the denial audit wrote a TENANT user id into the platform
      // audit table's actor foreign key; the insert failed inside a discarded
      // promise, which ends the process on a booted API (observed: one request,
      // API down). The failure also left no audit row, and THAT is what this
      // asserts. Collecting 'unhandledRejection' here was tried and removed:
      // jest installs its own handler, so such a listener never fires and would
      // make the assertion vacuous.
      const res = await get(tenantAdmin, 'platform/logs', 'web');
      expect(res.status).toBe(403);
      // The audit write is not awaited by the request, so poll for the row.
      let audit = null;
      for (let attempt = 0; attempt < 20 && !audit; attempt += 1) {
        audit = await prisma.auditLog.findFirst({
          where: {
            tenantId,
            action: 'PLATFORM_ERROR_LOG_ACCESS_DENIED',
            actorUserId: tenantAdmin.id,
          },
        });
        if (!audit) await new Promise((resolve) => setTimeout(resolve, 250));
      }
      expect(audit).not.toBeNull();
    });

    it.each(PLATFORM_ROUTES)(
      'is refused on %s when claiming the admin client (401)',
      async (route) => {
        // The token is signed with the web secret, so the admin client rejects
        // it at signature verification.
        const res = await get(tenantAdmin, route, 'admin');
        expect({ route, status: res.status }).toEqual({ route, status: 401 });
      },
    );
  });

  describe('platform super admin → tenant routes', () => {
    // A platform token carries tenantId "platform", which no tenant row has, so
    // these routes answer 200 with an EMPTY result. That is isolation by
    // emptiness, and it is only meaningful if the tenant really has rows, so the
    // tenant is given an employee and the platform caller must not see it.
    it('the tenant has data the platform caller could leak (control)', async () => {
      const res = await get(tenantAdmin, 'employees', 'web');
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).toContain(employeeMarker);
    });

    it.each(TENANT_ROUTES)(
      'is served an empty %s, never the tenant rows',
      async (route) => {
        const res = await get(platformAdmin, route, 'admin');
        expect(res.status).toBeLessThan(500);
        expect(JSON.stringify(res.body)).not.toContain(employeeMarker);
        expect(JSON.stringify(res.body)).not.toContain(tenantAdmin.email);
        const body = res.body as { items?: unknown[] } | unknown[];
        const rows = Array.isArray(body) ? body : (body.items ?? []);
        expect(rows).toEqual([]);
      },
    );

    it.each(TENANT_ROUTES)(
      'is refused %s when the platform token is sent as the web client',
      async (route) => {
        const res = await get(platformAdmin, route, 'web');
        expect([401, 403]).toContain(res.status);
      },
    );
  });
});
