import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pg = require('pg') as typeof import('pg');

import { AppModule } from '../src/app.module';
import { ROLE_KEYS } from '../src/common/constants/rbac-matrix';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { HttpActors, type HttpActor } from './helpers/http-actors';

/**
 * Query budget for one authenticated request (ORCH-04, 2026-09-10 audit).
 *
 * Counts every SQL statement the pg driver is asked to run while one request is
 * served, against real PostgreSQL. It exists so the cost of authentication is a
 * measured number with a ceiling rather than an impression, and so a change
 * that quietly adds round trips to every request fails here.
 *
 * The ceiling (27) is the value measured after the first optimisation; the baseline was 39 (see
 * docs/engineering/audits/2026-11-21-reliability-cost-audit/). Lower it when
 * the cost is reduced; never raise it to make a failing run pass — find the new
 * query. Nothing here caches anything: revocation tests below prove the
 * optimised path still honours a role/status change on the very next request.
 */
describeWithDatabase()('Authenticated request query budget (e2e, HTTP)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  let admin: HttpActor;
  let tenantId: string;
  const roleIds: string[] = [];
  const employeeIds: string[] = [];
  const suffix = randomUUID().slice(0, 6);

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
    fixtures = new DbFixtures(prisma, 'qbudget');
    actors = new HttpActors(app, suffix);
    const tenant = await fixtures.createTenant('qb');
    tenantId = tenant.id;
    const organizationId = await fixtures.createOrganization(tenant.id);
    const unit = await fixtures.createBusinessUnit(tenant.id, organizationId);
    admin = await actors.tenantUser(tenant.id, unit, 'qb');
    const role = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        key: ROLE_KEYS.GLOBAL_ADMIN,
        name: 'Admin qb',
      },
      select: { id: true },
    });
    roleIds.push(role.id);
    await prisma.userRole.create({
      data: { tenantId: tenant.id, userId: admin.id, roleId: role.id },
    });
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

  const get = (path: string) =>
    request(app.getHttpServer())
      .get(`/${path}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set('X-DijiPeople-App', 'web');

  type QueryFn = (this: unknown, ...args: unknown[]) => unknown;

  async function countStatements<T>(run: () => Promise<T>) {
    const seen: string[] = [];
    // Every statement the driver runs passes through Client.query, whether it
    // came from Prisma's adapter, a transaction or a raw query.
    const proto = pg.Client.prototype as unknown as { query: QueryFn };
    const original = proto.query;
    proto.query = function (this: unknown, ...args: unknown[]) {
      const first = args[0];
      const text =
        typeof first === 'string'
          ? first
          : typeof first === 'object' && first !== null && 'text' in first
            ? String((first as { text: unknown }).text)
            : '';
      seen.push(text.replace(/s+/g, ' ').slice(0, 110));
      return original.apply(this, args);
    };
    try {
      const result = await run();
      return { result, seen };
    } finally {
      proto.query = original;
    }
  }

  it('measures the statements one authenticated GET costs', async () => {
    await get('documents/types'); // warm any lazy per-process state
    const { result, seen } = await countStatements(() =>
      get('documents/types'),
    );
    expect(result.status).toBe(200);
    console.log(
      `AUTH_QUERY_COUNT=${seen.length}\n` +
        seen.map((s, i) => `${i + 1}. ${s}`).join('\n'),
    );
    expect(seen.length).toBeLessThanOrEqual(
      Number(process.env.AUTH_QUERY_CEILING ?? 27),
    );
  });

  it('times the same request (informational — never asserted)', async () => {
    // Local, single-connection, warm: useful for before/after comparison of the
    // same machine only. It says nothing about production latency.
    await get('documents/types');
    const samples: number[] = [];
    for (let i = 0; i < 60; i += 1) {
      const started = process.hrtime.bigint();
      const res = await get('documents/types');
      samples.push(Number(process.hrtime.bigint() - started) / 1e6);
      expect(res.status).toBe(200);
    }
    samples.sort((a, b) => a - b);
    const at = (p: number) =>
      samples[Math.min(samples.length - 1, Math.floor(p * samples.length))];
    console.log(
      `AUTH_LATENCY_MS p50=${at(0.5).toFixed(1)} p95=${at(0.95).toFixed(1)} max=${samples[samples.length - 1].toFixed(1)} n=${samples.length}`,
    );
  });

  it('honours revocation on the very next request: role removed', async () => {
    const ok = await get('documents/types');
    expect(ok.status).toBe(200);
    await prisma.userRole.deleteMany({ where: { userId: admin.id } });
    const denied = await get('documents/types');
    expect([401, 403]).toContain(denied.status);
    // Put the grant back so later tests start from the same state.
    await prisma.userRole.create({
      data: { tenantId, userId: admin.id, roleId: roleIds[0] },
    });
  });

  it('honours revocation on the very next request: account disabled', async () => {
    await prisma.user.update({
      where: { id: admin.id },
      data: { status: 'DISABLED' as never },
    });
    const denied = await get('documents/types');
    expect(denied.status).toBe(401);
    await prisma.user.update({
      where: { id: admin.id },
      data: { status: 'ACTIVE' as never },
    });
  });

  it('applies a timesheet restriction on the very next request, then lifts it', async () => {
    const employee = await prisma.employee.create({
      data: {
        tenantId,
        userId: admin.id,
        employeeCode: `QB-${suffix}`,
        firstName: 'Budget',
        lastName: 'Test',
        phone: '000',
        hireDate: new Date('2024-01-01'),
      },
      select: { id: true },
    });
    employeeIds.push(employee.id);
    // No restriction yet: one employee, nothing blocking.
    expect((await get('documents/types')).status).toBe(200);

    const restriction = await prisma.timesheetAccessRestriction.create({
      data: {
        tenantId,
        employeeId: employee.id,
        isActive: true,
        restrictionMode: 'TIMESHEET_ONLY',
        reason: 'budget test',
        sourceTimesheetIds: [],
        startAt: new Date(Date.now() - 60_000),
      },
    });
    const blocked = await get('documents/types');
    expect(blocked.status).toBe(403);
    expect((blocked.body as { code?: string }).code).toBe(
      'TIMESHEET_ACCESS_RESTRICTED',
    );

    await prisma.timesheetAccessRestriction.update({
      where: { id: restriction.id },
      data: { isActive: false },
    });
    expect((await get('documents/types')).status).toBe(200);

    // Active again but expired: must not apply.
    await prisma.timesheetAccessRestriction.update({
      where: { id: restriction.id },
      data: { isActive: true, expiryAt: new Date(Date.now() - 1000) },
    });
    expect((await get('documents/types')).status).toBe(200);
  });

  it('ignores a restriction that belongs to someone else in the same tenant', async () => {
    const other = await prisma.employee.create({
      data: {
        tenantId,
        employeeCode: `QB-O-${suffix}`,
        firstName: 'Other',
        lastName: 'Person',
        phone: '000',
        hireDate: new Date('2024-01-01'),
      },
      select: { id: true },
    });
    employeeIds.push(other.id);
    await prisma.timesheetAccessRestriction.create({
      data: {
        tenantId,
        employeeId: other.id,
        isActive: true,
        restrictionMode: 'TIMESHEET_ONLY',
        reason: 'someone else',
        sourceTimesheetIds: [],
        startAt: new Date(Date.now() - 60_000),
      },
    });
    expect((await get('documents/types')).status).toBe(200);
  });
});
