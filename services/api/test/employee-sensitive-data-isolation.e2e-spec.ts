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
 * WP3 (SESSION-0137) — the most sensitive employee data: salary, bank details,
 * personal details, address, emergency contact, employment history.
 *
 * EVIDENCE CLASS: database-backed HTTP integration. Every attack is paired with
 * a control that performs the SAME verb on the caller's OWN employee and must
 * succeed, so a refusal is an isolation result and not a wrong URL, a rejected
 * body or a missing permission. Attacks must be exactly 404 and the foreign
 * rows, including salary and bank fields, must be unchanged in the database.
 */
describeWithDatabase()('Sensitive employee data isolation (e2e, HTTP)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  const suffix = randomUUID().slice(0, 6);
  const SECRET_SALARY = '98765.43';
  const SECRET_BANK = `BetaBank-${suffix}`;

  interface Side {
    tenantId: string;
    admin: HttpActor;
    employeeId: string;
  }
  let alpha: Side;
  let beta: Side;

  async function side(label: string): Promise<Side> {
    const tenant = await fixtures.createTenant(label);
    const organizationId = await fixtures.createOrganization(tenant.id);
    const unit = await fixtures.createBusinessUnit(tenant.id, organizationId);
    const admin = await actors.tenantUser(tenant.id, unit, label);
    const role = await prisma.role.create({
      data: {
        tenantId: tenant.id,
        key: ROLE_KEYS.GLOBAL_ADMIN,
        name: `Admin ${label}`,
      },
      select: { id: true },
    });
    await prisma.userRole.create({
      data: { tenantId: tenant.id, userId: admin.id, roleId: role.id },
    });
    const employee = await prisma.employee.create({
      data: {
        tenantId: tenant.id,
        employeeCode: `SENS-${label}-${suffix}`,
        firstName: 'Sensitive',
        lastName: label,
        phone: '000',
        hireDate: new Date('2024-01-01'),
      },
      select: { id: true },
    });
    return { tenantId: tenant.id, admin, employeeId: employee.id };
  }

  const call = (
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    as: HttpActor,
    path: string,
    body?: object,
  ) => {
    const req = request(app.getHttpServer())
      [method](`/${path}`)
      .set('Authorization', `Bearer ${as.token}`)
      .set('X-DijiPeople-App', 'web');
    return body ? req.send(body) : req;
  };

  const compensationBody = (salary: string, bank: string) => ({
    basicSalary: salary,
    payFrequency: 'MONTHLY',
    effectiveDate: '2025-01-01',
    bankName: bank,
  });

  const betaState = async () =>
    JSON.parse(
      JSON.stringify({
        employee: await prisma.employee.findUnique({
          where: { id: beta.employeeId },
        }),
        compensation: await prisma.employeeCompensation.findMany({
          where: { employeeId: beta.employeeId },
          orderBy: { id: 'asc' },
        }),
        compensationHistory: await prisma.employeeCompensationHistory.findMany({
          where: { employeeId: beta.employeeId },
          orderBy: { id: 'asc' },
        }),
        history: await prisma.employeeHistory.findMany({
          where: { employeeId: beta.employeeId },
          orderBy: { id: 'asc' },
        }),
      }),
    ) as unknown;

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
    fixtures = new DbFixtures(prisma, 'sens');
    actors = new HttpActors(app, suffix);
    alpha = await side('alpha');
    beta = await side('beta');

    // BETA's own admin sets BETA's salary and bank, through the real endpoint.
    const set = await call(
      'put',
      beta.admin,
      `employees/${beta.employeeId}/compensation`,
      compensationBody(SECRET_SALARY, SECRET_BANK),
    );
    expect(set.status).toBe(200);
  });

  afterAll(async () => {
    await prisma.employee.deleteMany({
      where: { tenantId: { in: [alpha.tenantId, beta.tenantId] } },
    });
    await actors.cleanup();
    await fixtures.cleanup();
    await app.close();
  });

  describe('compensation (salary and bank)', () => {
    it('control: the owner reads its own salary and bank details', async () => {
      const res = await call(
        'get',
        beta.admin,
        `employees/${beta.employeeId}/compensation`,
      );
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).toContain('98765.43');
      expect(JSON.stringify(res.body)).toContain(SECRET_BANK);
    });

    it('control: ALPHA can set compensation on its own employee', async () => {
      const res = await call(
        'put',
        alpha.admin,
        `employees/${alpha.employeeId}/compensation`,
        compensationBody('1111.00', 'AlphaBank'),
      );
      expect(res.status).toBe(200);
      const row = await prisma.employeeCompensation.findFirstOrThrow({
        where: { employeeId: alpha.employeeId },
      });
      expect(row.tenantId).toBe(alpha.tenantId);
    });

    it('attack: ALPHA cannot read BETA salary or bank details (404, no leak)', async () => {
      const res = await call(
        'get',
        alpha.admin,
        `employees/${beta.employeeId}/compensation`,
      );
      expect(res.status).toBe(404);
      expect(res.text).not.toContain('98765');
      expect(res.text).not.toContain(SECRET_BANK);
    });

    it('attack: ALPHA cannot overwrite BETA salary (404) and BETA rows are unchanged', async () => {
      const before = await betaState();
      const res = await call(
        'put',
        alpha.admin,
        `employees/${beta.employeeId}/compensation`,
        compensationBody('1.00', 'Stolen'),
      );
      expect(res.status).toBe(404);
      expect(await betaState()).toEqual(before);
    });

    it('the stored BETA salary is still the original after every attack', async () => {
      const row = await prisma.employeeCompensation.findFirstOrThrow({
        where: { employeeId: beta.employeeId },
      });
      expect(row.basicSalary.toString()).toBe(SECRET_SALARY);
      expect(row.bankName).toBe(SECRET_BANK);
    });
  });

  describe.each([
    {
      name: 'personal details',
      path: (id: string) => `employees/${id}/personal-info`,
      body: { preferredName: 'HIJACKED' },
    },
    {
      name: 'address',
      path: (id: string) => `employees/${id}/address`,
      body: { postalCode: '00000' },
    },
    {
      name: 'emergency contact',
      path: (id: string) => `employees/${id}/emergency-contact`,
      body: { emergencyContactName: 'HIJACKED' },
    },
  ])('$name', ({ path, body }) => {
    it('control: ALPHA updates its own employee (2xx)', async () => {
      const res = await call(
        'patch',
        alpha.admin,
        path(alpha.employeeId),
        body,
      );
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
    });

    it('attack: ALPHA against BETA is refused, BETA is unchanged, and the refusal is indistinguishable from a nonexistent id', async () => {
      const before = await betaState();
      const res = await call('patch', alpha.admin, path(beta.employeeId), body);
      // Some handlers refuse a foreign id with 403 (the write-permission check
      // runs first and finds no record), others with 404. Either is isolation.
      // What matters is that the answer is the SAME as for an id that exists in
      // no tenant at all, so the status cannot be used to learn that an id
      // exists in another tenant.
      const nonexistent = await call(
        'patch',
        alpha.admin,
        path(randomUUID()),
        body,
      );
      expect([403, 404]).toContain(res.status);
      expect(res.status).toBe(nonexistent.status);
      expect(await betaState()).toEqual(before);
    });
  });

  describe('employment history', () => {
    const entry = {
      eventType: 'PROMOTION',
      eventDate: '2025-02-01',
      title: 'Promoted',
    };
    it('control: ALPHA records history on its own employee (2xx)', async () => {
      const res = await call(
        'post',
        alpha.admin,
        `employees/${alpha.employeeId}/history`,
        entry,
      );
      expect(res.status).toBeGreaterThanOrEqual(200);
      expect(res.status).toBeLessThan(300);
    });

    it('attack: ALPHA cannot write BETA history (404) and BETA gains no rows', async () => {
      const before = await betaState();
      const res = await call(
        'post',
        alpha.admin,
        `employees/${beta.employeeId}/history`,
        entry,
      );
      expect(res.status).toBe(404);
      expect(await betaState()).toEqual(before);
    });
  });
});
