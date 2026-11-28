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
 * Statement census across modules, at two data volumes (SESSION-0136, P6).
 *
 * The 27-statement budget measures one route. This measures many, and — the
 * point — measures each TWICE: with a handful of rows and with an order of
 * magnitude more. A route whose statement count grows with the number of rows
 * is an N+1; a route whose ROW count grows without bound is unpaginated. Both
 * are read straight off the table this prints, against real PostgreSQL.
 *
 * Assertions are limited to what has been measured and judged acceptable:
 * the routes in `CONSTANT` must not gain statements as data grows.
 */
const SMALL = 5;
const LARGE = 65;

type Route = { name: string; path: string };

const ROUTES: Route[] = [
  { name: 'employees', path: 'employees?pageSize=100' },
  { name: 'users', path: 'users' },
  { name: 'roles', path: 'roles' },
  { name: 'teams', path: 'teams' },
  { name: 'departments', path: 'departments' },
  { name: 'designations', path: 'designations' },
  { name: 'business-units', path: 'business-units' },
  { name: 'locations', path: 'locations' },
  { name: 'projects', path: 'projects' },
  { name: 'customers', path: 'customers' },
  { name: 'documents', path: 'documents' },
  { name: 'leave-types', path: 'leave-types' },
  { name: 'leave-policies', path: 'leave-policies' },
  { name: 'timesheet-policies', path: 'timesheet-policies' },
  { name: 'approvals', path: 'approvals' },
  { name: 'approval-matrices', path: 'approval-matrices' },
  { name: 'candidates', path: 'candidates' },
  { name: 'job-openings', path: 'job-openings' },
  { name: 'applications', path: 'applications' },
];

/**
 * Routes that were actually exercised with data at both volumes and measured
 * flat, with the statement count measured on 2026-11-21 as a ceiling.
 *
 * Only these six are asserted. The others return zero rows here (nothing is
 * seeded for them), so "flat" would be vacuous and a budget would pin nothing.
 * Add an entity to `seed` before adding its route here. Lower a ceiling when
 * the cost is reduced; never raise one to make a failing run pass — find the
 * query that was added.
 */
const BUDGETS: Record<string, number> = {
  employees: 47,
  teams: 34,
  departments: 39,
  designations: 28,
  projects: 35,
  customers: 26,
};

describeWithDatabase()('API statement census at two volumes (e2e)', () => {
  jest.setTimeout(900_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  let admin: HttpActor;
  let tenantId = '';
  let unitId = '';
  const roleIds: string[] = [];
  const suffix = randomUUID().slice(0, 6);
  let serial = 0;

  async function seed(n: number) {
    const base = serial;
    serial += n;
    const idx = Array.from({ length: n }, (_, i) => base + i);
    await prisma.employee.createMany({
      data: idx.map((i) => ({
        tenantId,
        businessUnitId: unitId,
        employeeCode: `CEN-${i}-${suffix}`,
        firstName: 'Census',
        lastName: `E${i}`,
        phone: '000',
        hireDate: new Date('2024-01-01'),
      })),
    });
    await prisma.department.createMany({
      data: idx.map((i) => ({ tenantId, name: `Dept ${i} ${suffix}` })),
    });
    await prisma.designation.createMany({
      data: idx.map((i) => ({ tenantId, name: `Desig ${i} ${suffix}` })),
    });
    await prisma.team.createMany({
      data: idx.map((i) => ({
        tenantId,
        name: `Team ${i} ${suffix}`,
        key: `team-${i}-${suffix}`,
      })),
    });
    await prisma.customer.createMany({
      data: idx.map((i) => ({
        tenantId,
        name: `Cust ${i} ${suffix}`,
        code: `C${i}-${suffix}`,
      })),
    });
    await prisma.project.createMany({
      data: idx.map((i) => ({ tenantId, name: `Proj ${i} ${suffix}` })),
    });
  }

  const get = (path: string) =>
    request(app.getHttpServer())
      .get(`/${path}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .set('X-DijiPeople-App', 'web');

  async function count<T>(run: () => Promise<T>) {
    let n = 0;
    const proto = pg.Client.prototype as unknown as {
      query: (this: unknown, ...a: unknown[]) => unknown;
    };
    const original = proto.query;
    proto.query = function (this: unknown, ...args: unknown[]) {
      n += 1;
      return original.apply(this, args);
    };
    try {
      return { result: await run(), n };
    } finally {
      proto.query = original;
    }
  }

  const rowsIn = (body: unknown): number | null => {
    if (Array.isArray(body)) return body.length;
    if (body && typeof body === 'object') {
      const o = body as Record<string, unknown>;
      for (const k of ['items', 'data', 'rows', 'results']) {
        if (Array.isArray(o[k])) return (o[k] as unknown[]).length;
      }
    }
    return null;
  };

  async function measure() {
    const out: Record<
      string,
      { status: number; stmts: number; rows: number | null; kb: number }
    > = {};
    for (const route of ROUTES) {
      await get(route.path); // warm lazy per-process state
      const { result, n } = await count(() => get(route.path));
      out[route.name] = {
        status: result.status,
        stmts: n,
        rows: rowsIn(result.body),
        kb:
          Math.round(Buffer.byteLength(JSON.stringify(result.body)) / 102.4) /
          10,
      };
    }
    return out;
  }

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
    fixtures = new DbFixtures(prisma, 'census');
    actors = new HttpActors(app, suffix);
    const tenant = await fixtures.createTenant('cen');
    tenantId = tenant.id;
    const org = await fixtures.createOrganization(tenant.id);
    unitId = await fixtures.createBusinessUnit(tenant.id, org);
    admin = await actors.tenantUser(tenant.id, unitId, 'cen');
    const role = await prisma.role.create({
      data: {
        tenantId,
        key: ROLE_KEYS.GLOBAL_ADMIN,
        name: `Admin cen ${suffix}`,
      },
      select: { id: true },
    });
    roleIds.push(role.id);
    await prisma.userRole.create({
      data: { tenantId, userId: admin.id, roleId: role.id },
    });
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { tenantId } });
    await prisma.customer.deleteMany({ where: { tenantId } });
    await prisma.team.deleteMany({ where: { tenantId } });
    await prisma.designation.deleteMany({ where: { tenantId } });
    await prisma.department.deleteMany({ where: { tenantId } });
    await prisma.employee.deleteMany({ where: { tenantId } });
    await prisma.userRole.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await actors.cleanup();
    await fixtures.cleanup();
    await app.close();
  });

  it(`prints statements, rows and payload at ${SMALL} then ${LARGE} rows per entity`, async () => {
    await seed(SMALL);
    const small = await measure();
    await seed(LARGE - SMALL);
    const large = await measure();

    const lines = ROUTES.map((r) => {
      const a = small[r.name];
      const b = large[r.name];
      const verdict =
        a.status !== 200
          ? `NOT-MEASURED(${a.status})`
          : b.stmts > a.stmts
            ? `GROWS(+${b.stmts - a.stmts})`
            : 'flat';
      const unbounded =
        a.status === 200 &&
        a.rows !== null &&
        b.rows !== null &&
        b.rows > a.rows
          ? ' rows-grow-unbounded'
          : '';
      return `${r.name.padEnd(20)} status=${a.status} stmts ${String(a.stmts).padStart(3)} -> ${String(b.stmts).padStart(3)}  rows ${a.rows ?? '-'} -> ${b.rows ?? '-'}  kb ${a.kb} -> ${b.kb}  ${verdict}${unbounded}`;
    });
    console.log(`CENSUS_TABLE\n${lines.join('\n')}`);

    for (const [name, ceiling] of Object.entries(BUDGETS)) {
      // No N+1: the count must not grow with the number of rows...
      expect({ name, grew: large[name].stmts - small[name].stmts }).toEqual({
        name,
        grew: 0,
      });
      // ...and must not exceed what was measured when the budget was set.
      expect({ name, withinBudget: large[name].stmts <= ceiling }).toEqual({
        name,
        withinBudget: true,
      });
    }
  });
});
