import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { ROLE_KEYS } from '../src/common/constants/rbac-matrix';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { HttpActors, type HttpActor } from './helpers/http-actors';

/**
 * BUG-4518 + BUG-3164 — the timesheet restriction, against real PostgreSQL and
 * set up the way production is: the global `/api` prefix and the real
 * `HttpExceptionFilter`, which the other e2e suites omit (and which is why the
 * allow-list that never matched in production could not be seen).
 *
 * Expected, exactly:
 *   - a restricted employee is refused a blocked route with 403
 *     `TIMESHEET_ACCESS_RESTRICTED`, never 401 `INVALID_TOKEN`;
 *   - the response carries the restriction's reason and the real allow-list;
 *   - the allow-listed routes stay reachable, so the restriction can be lifted;
 *   - the session is NOT revoked by being refused;
 *   - adding, lifting, expiring or overriding a restriction takes effect on the
 *     very next request (nothing is cached);
 *   - another employee's restriction, in the same or another tenant, is
 *     irrelevant.
 */
describeWithDatabase()('Timesheet restriction (e2e, HTTP, /api prefix)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  let actor: HttpActor;
  let tenantId: string;
  let employeeId: string;
  let otherTenantActor: HttpActor;
  const roleIds: string[] = [];
  const employeeIds: string[] = [];
  const suffix = randomUUID().slice(0, 6);

  const BLOCKED = 'api/documents/types';
  const ALLOWED = 'api/notifications/events';
  const REASON = `Overdue timesheets ${suffix}`;

  async function adminIn(label: string) {
    const tenant = await fixtures.createTenant(label);
    const organizationId = await fixtures.createOrganization(tenant.id);
    const unit = await fixtures.createBusinessUnit(tenant.id, organizationId);
    const a = await actors.tenantUser(tenant.id, unit, label);
    const role = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        key: ROLE_KEYS.GLOBAL_ADMIN,
        name: `Admin ${label}`,
      },
      select: { id: true },
    });
    roleIds.push(role.id);
    await prisma.userRole.create({
      data: { tenantId: tenant.id, userId: a.id, roleId: role.id },
    });
    return { actor: a, tenantId: tenant.id };
  }

  async function employeeFor(
    tenant: string,
    userId: string | null,
    code: string,
  ) {
    const e = await prisma.employee.create({
      data: {
        tenantId: tenant,
        ...(userId ? { userId } : {}),
        employeeCode: code,
        firstName: 'Restr',
        lastName: 'Test',
        phone: '000',
        hireDate: new Date('2024-01-01'),
      },
      select: { id: true },
    });
    employeeIds.push(e.id);
    return e.id;
  }

  const restrict = (
    forEmployee: string,
    forTenant: string,
    over: Record<string, unknown> = {},
  ) =>
    prisma.timesheetAccessRestriction.create({
      data: {
        tenantId: forTenant,
        employeeId: forEmployee,
        isActive: true,
        restrictionMode: 'TIMESHEET_ONLY',
        reason: REASON,
        sourceTimesheetIds: [],
        startAt: new Date(Date.now() - 60_000),
        ...over,
      } as never,
    });

  const call = (a: HttpActor, method: 'get' | 'post', path: string) => {
    const req = request(app.getHttpServer())
      [method](`/${path}`)
      .set('Authorization', `Bearer ${a.token}`)
      .set('X-DijiPeople-App', 'web');
    return method === 'post' ? req.send({}) : req;
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(app.get(HttpExceptionFilter));
    await app.init();
    prisma = app.get(PrismaService);
    fixtures = new DbFixtures(prisma, 'tsrestr');
    actors = new HttpActors(app, suffix);
    const a = await adminIn('tsa');
    actor = a.actor;
    tenantId = a.tenantId;
    employeeId = await employeeFor(tenantId, actor.id, `TR-${suffix}`);
    otherTenantActor = (await adminIn('tsb')).actor;
  });

  afterAll(async () => {
    await prisma.timesheetAccessRestriction.deleteMany({
      where: { employeeId: { in: employeeIds } },
    });
    await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
    await prisma.userRole.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await actors.cleanup();
    await fixtures.cleanup();
    await app.close();
  });

  afterEach(async () => {
    await prisma.timesheetAccessRestriction.deleteMany({
      where: { employeeId: { in: employeeIds } },
    });
  });

  it('without a restriction nothing is blocked', async () => {
    expect((await call(actor, 'get', BLOCKED)).status).toBe(200);
    expect((await call(actor, 'get', ALLOWED)).status).toBe(200);
  });

  it('TIMESHEET_ONLY: a blocked route is 403 TIMESHEET_ACCESS_RESTRICTED with reason and real allow-list', async () => {
    await restrict(employeeId, tenantId);
    const res = await call(actor, 'get', BLOCKED);
    expect(res.status).toBe(403);
    const body = res.body as Record<string, unknown>;
    expect(body.statusCode).toBe(403);
    expect(body.errorCode).toBe('TIMESHEET_ACCESS_RESTRICTED');
    expect(body.message).toBe(REASON);
    expect(body.code).not.toBe('INVALID_TOKEN');
    const details = body.details as Record<string, unknown>;
    expect(details.restrictionMode).toBe('TIMESHEET_ONLY');
    expect(details.allowedRoutes).toEqual(
      expect.arrayContaining([
        '/api/timesheets',
        '/api/notifications',
        '/api/my-profile',
      ]),
    );
  });

  it('TIMESHEET_ONLY: allow-listed routes stay reachable so the restriction can be lifted', async () => {
    await restrict(employeeId, tenantId);
    for (const path of [
      ALLOWED,
      'api/timesheets/access-restriction',
      'api/timesheets/mine',
    ]) {
      const res = await call(actor, 'get', path);
      expect({ path, status: res.status }).toEqual({ path, status: 200 });
    }
  });

  it('being refused does NOT revoke or expire the session', async () => {
    await restrict(employeeId, tenantId);
    const before = await prisma.refreshToken.count({
      where: { userId: actor.id, revokedAt: null },
    });
    expect((await call(actor, 'get', BLOCKED)).status).toBe(403);
    expect((await call(actor, 'get', BLOCKED)).status).toBe(403);
    const after = await prisma.refreshToken.count({
      where: { userId: actor.id, revokedAt: null },
    });
    expect(after).toBe(before);
    expect(after).toBeGreaterThan(0);
  });

  it('LIMITED_ACCESS: reads pass, writes are 403', async () => {
    await restrict(employeeId, tenantId, { restrictionMode: 'LIMITED_ACCESS' });
    expect((await call(actor, 'get', BLOCKED)).status).toBe(200);
    const write = await call(actor, 'post', BLOCKED);
    expect(write.status).toBe(403);
    expect((write.body as Record<string, unknown>).errorCode).toBe(
      'TIMESHEET_ACCESS_RESTRICTED',
    );
  });

  it('WARNING_ONLY never blocks', async () => {
    await restrict(employeeId, tenantId, { restrictionMode: 'WARNING_ONLY' });
    expect((await call(actor, 'get', BLOCKED)).status).toBe(200);
  });

  it('immediate revocation: lifting, expiring and overriding take effect on the next request', async () => {
    const r = await restrict(employeeId, tenantId);
    expect((await call(actor, 'get', BLOCKED)).status).toBe(403);

    await prisma.timesheetAccessRestriction.update({
      where: { id: r.id },
      data: { isActive: false },
    });
    expect((await call(actor, 'get', BLOCKED)).status).toBe(200);

    await prisma.timesheetAccessRestriction.update({
      where: { id: r.id },
      data: { isActive: true, expiryAt: new Date(Date.now() - 1000) },
    });
    expect((await call(actor, 'get', BLOCKED)).status).toBe(200);

    await prisma.timesheetAccessRestriction.update({
      where: { id: r.id },
      data: { expiryAt: null, overriddenAt: new Date() },
    });
    expect((await call(actor, 'get', BLOCKED)).status).toBe(200);

    await prisma.timesheetAccessRestriction.update({
      where: { id: r.id },
      data: { overriddenAt: null },
    });
    expect((await call(actor, 'get', BLOCKED)).status).toBe(403);
  });

  it("another employee's restriction in the same tenant does not apply", async () => {
    const other = await employeeFor(tenantId, null, `TR-O-${suffix}`);
    await restrict(other, tenantId);
    expect((await call(actor, 'get', BLOCKED)).status).toBe(200);
  });

  it("a restriction in another tenant does not apply, and the other tenant's user is unaffected by ours", async () => {
    const theirs = await employeeFor(
      (
        await prisma.user.findUniqueOrThrow({
          where: { id: otherTenantActor.id },
          select: { tenantId: true },
        })
      ).tenantId,
      otherTenantActor.id,
      `TR-T-${suffix}`,
    );
    const theirTenant = (
      await prisma.user.findUniqueOrThrow({
        where: { id: otherTenantActor.id },
        select: { tenantId: true },
      })
    ).tenantId;
    await restrict(theirs, theirTenant);
    expect((await call(actor, 'get', BLOCKED)).status).toBe(200);
    expect((await call(otherTenantActor, 'get', BLOCKED)).status).toBe(403);
  });

  it('a restriction row whose tenantId disagrees with its employee is ignored', async () => {
    // Defence in depth: the predicate requires BOTH to name this tenant.
    const theirTenant = (
      await prisma.user.findUniqueOrThrow({
        where: { id: otherTenantActor.id },
        select: { tenantId: true },
      })
    ).tenantId;
    await restrict(employeeId, theirTenant);
    expect((await call(actor, 'get', BLOCKED)).status).toBe(200);
  });
});
