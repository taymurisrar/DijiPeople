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
 * BUG-3157 — the lookups usage endpoints counted `Employee` rows with no
 * `tenantId`, so one tenant's administrator could read how many employees every
 * OTHER tenant has in a given country, state or city.
 *
 * Two tenants, different headcounts in the same country/state/city: each must
 * see only its own. Before the fix both saw the sum.
 */
describeWithDatabase()('Lookups usage is tenant-scoped (e2e, HTTP)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  let alpha: HttpActor;
  let beta: HttpActor;
  let countryId: string;
  let stateId: string;
  let cityId: string;
  const roleIds: string[] = [];
  const employeeIds: string[] = [];
  const suffix = randomUUID().slice(0, 6);

  async function adminIn(label: string) {
    const tenant = await fixtures.createTenant(label);
    const organizationId = await fixtures.createOrganization(tenant.id);
    const unit = await fixtures.createBusinessUnit(tenant.id, organizationId);
    const actor = await actors.tenantUser(tenant.id, unit, label);
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
      data: { tenantId: tenant.id, userId: actor.id, roleId: role.id },
    });
    return { actor, tenantId: tenant.id };
  }

  async function employees(tenantId: string, n: number, tag: string) {
    for (let i = 0; i < n; i += 1) {
      const e = await prisma.employee.create({
        data: {
          tenantId,
          employeeCode: `LK-${tag}-${i}-${suffix}`,
          firstName: 'Geo',
          lastName: `${tag}${i}`,
          phone: '000',
          hireDate: new Date('2024-01-01'),
          countryId,
          stateProvinceId: stateId,
          cityId,
        },
        select: { id: true },
      });
      employeeIds.push(e.id);
    }
  }

  const get = (a: HttpActor, path: string) =>
    request(app.getHttpServer())
      .get(`/${path}`)
      .set('Authorization', `Bearer ${a.token}`)
      .set('X-DijiPeople-App', 'web');

  const employeeCount = (body: unknown) =>
    (body as { usages: Array<{ area: string; count: number }> }).usages.find(
      (u) => u.area === 'Employee',
    )?.count;

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
    fixtures = new DbFixtures(prisma, 'lookups-iso');
    actors = new HttpActors(app, suffix);

    const city = await prisma.city.findFirstOrThrow({
      where: { stateProvinceId: { not: null }, isActive: true },
      select: { id: true, countryId: true, stateProvinceId: true },
    });
    cityId = city.id;
    countryId = city.countryId;
    stateId = city.stateProvinceId as string;

    const a = await adminIn('lka');
    const b = await adminIn('lkb');
    alpha = a.actor;
    beta = b.actor;
    await employees(a.tenantId, 2, 'a');
    await employees(b.tenantId, 3, 'b');
  });

  afterAll(async () => {
    await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
    await prisma.userRole.deleteMany({ where: { roleId: { in: roleIds } } });
    await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
    await actors.cleanup();
    await fixtures.cleanup();
    await app.close();
  });

  it('country usage counts only the caller’s own employees', async () => {
    const a = await get(alpha, `lookups/countries/${countryId}/usage`);
    const b = await get(beta, `lookups/countries/${countryId}/usage`);
    expect(a.status).toBe(200);
    expect(employeeCount(a.body)).toBe(2);
    expect(employeeCount(b.body)).toBe(3);
  });

  it('state usage counts only the caller’s own employees', async () => {
    const a = await get(alpha, `lookups/states/${stateId}/usage`);
    const b = await get(beta, `lookups/states/${stateId}/usage`);
    expect(employeeCount(a.body)).toBe(2);
    expect(employeeCount(b.body)).toBe(3);
  });

  it('city usage counts only the caller’s own employees', async () => {
    const a = await get(alpha, `lookups/cities/${cityId}/usage`);
    const b = await get(beta, `lookups/cities/${cityId}/usage`);
    expect(employeeCount(a.body)).toBe(2);
    expect(employeeCount(b.body)).toBe(3);
  });
});
