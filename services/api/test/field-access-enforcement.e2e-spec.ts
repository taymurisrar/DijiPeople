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
 * BUG-3155 — the API, not the browser, decides which field values leave it.
 *
 * Two tenants hold IDENTICAL sensitive values (random sentinels). ALPHA has
 * configured field-security policies; BETA has none. The same GLOBAL_ADMIN role
 * reads the same routes in both:
 *
 *   - BETA is the control: every sentinel IS present, so the routes work and
 *     the sentinels are really in the data;
 *   - ALPHA must not carry a hidden value anywhere in the serialised body, and
 *     must carry exactly the masked form of a masked one;
 *   - a policy scoped to a role the caller does not hold changes nothing.
 *
 * EVIDENCE CLASS: database-backed HTTP integration, persisted state verified.
 */
describeWithDatabase()('Field access enforcement (e2e, HTTP)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  const suffix = randomUUID().slice(0, 6);
  const CNIC = `42101-${suffix}-9`;
  const TAX = `NTN-${suffix}-0099887`;
  const SALARY = '98765.43';
  const PHONE = `0300${suffix}`;

  interface Side {
    tenantId: string;
    admin: HttpActor;
    employeeId: string;
    compensationId: string;
  }
  let alpha: Side;
  let beta: Side;
  let gamma: Side;

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
        employeeCode: `FA-${label}-${suffix}`,
        firstName: 'Field',
        lastName: label,
        phone: PHONE,
        cnic: CNIC,
        taxIdentifier: TAX,
        hireDate: new Date('2024-01-01'),
      },
      select: { id: true },
    });
    const set = await call(
      'put',
      admin,
      `employees/${employee.id}/compensation`,
      {
        basicSalary: SALARY,
        payFrequency: 'MONTHLY',
        effectiveDate: '2025-01-01',
      },
    );
    expect(set.status).toBe(200);
    const compensation = await prisma.employeeCompensation.findFirstOrThrow({
      where: { tenantId: tenant.id, employeeId: employee.id },
      select: { id: true },
    });
    return {
      tenantId: tenant.id,
      admin,
      employeeId: employee.id,
      compensationId: compensation.id,
    };
  }

  const call = (
    method: 'get' | 'put' | 'patch',
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

  const policy = async (
    tenantId: string,
    name: string,
    entityKey: string,
    moduleKey: string,
    rules: Array<{
      fieldKey: string;
      visibility: string;
      maskingPattern?: string;
    }>,
    roleId?: string,
  ) => {
    const created = await prisma.fieldSecurityPolicy.create({
      data: {
        tenantId,
        name,
        moduleKey,
        entityKey,
        rules: {
          create: rules.map((rule) => ({
            tenantId,
            fieldKey: rule.fieldKey,
            fieldLabel: rule.fieldKey,
            visibility: rule.visibility,
            maskingPattern: rule.maskingPattern ?? null,
          })),
        },
      },
      select: { id: true },
    });
    if (roleId) {
      await prisma.fieldSecurityPolicyRole.create({
        data: { tenantId, policyId: created.id, roleId },
      });
    }
  };

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
    fixtures = new DbFixtures(prisma, 'fieldaccess');
    actors = new HttpActors(app, suffix);
    alpha = await side('alpha');
    beta = await side('beta');
    gamma = await side('gamma');
    await policy(gamma.tenantId, `phone-${suffix}`, 'employees', 'EMPLOYEES', [
      { fieldKey: 'phone', visibility: 'HIDDEN' },
    ]);

    await policy(
      alpha.tenantId,
      `identity-${suffix}`,
      'employees',
      'EMPLOYEES',
      [
        { fieldKey: 'cnic', visibility: 'HIDDEN' },
        {
          fieldKey: 'taxIdentifier',
          visibility: 'MASKED',
          maskingPattern: 'LAST_4',
        },
      ],
    );
    await policy(
      alpha.tenantId,
      `pay-${suffix}`,
      'employeeCompensations',
      'PAYROLL',
      [{ fieldKey: 'basicSalary', visibility: 'HIDDEN' }],
    );
    // A policy for a role the admin does NOT hold must change nothing.
    const otherRole = await prisma.role.create({
      data: {
        tenantId: alpha.tenantId,
        key: `OTHER_${suffix}`,
        name: `Other ${suffix}`,
      },
      select: { id: true },
    });
    await policy(
      alpha.tenantId,
      `other-role-${suffix}`,
      'employees',
      'EMPLOYEES',
      [{ fieldKey: 'phone', visibility: 'HIDDEN' }],
      otherRole.id,
    );
  });

  afterAll(async () => {
    // try/finally so a cleanup failure can never leave the app open.
    try {
      await fixtures.cleanup();
    } finally {
      await app.close();
    }
  });

  const routes = (s: Side) => [
    { name: 'employee list', path: 'employees' },
    { name: 'employee detail', path: `employees/${s.employeeId}` },
    { name: 'employee hierarchy', path: `employees/${s.employeeId}/hierarchy` },
  ];
  const payRoutes = (s: Side) => [
    { name: 'compensation list', path: 'payroll/compensations' },
    {
      name: 'compensation detail',
      path: `payroll/compensations/${s.compensationId}`,
    },
  ];

  describe('control: a tenant with no policy sees every value', () => {
    it('every employee route carries the identity sentinels', async () => {
      for (const route of routes(beta)) {
        const res = await call('get', beta.admin, route.path);
        expect({ route: route.name, status: res.status }).toEqual({
          route: route.name,
          status: 200,
        });
        const text = JSON.stringify(res.body);
        expect(text).toContain(CNIC);
        expect(text).toContain(TAX);
      }
    });

    it('compensation routes carry the salary', async () => {
      for (const route of payRoutes(beta)) {
        const res = await call('get', beta.admin, route.path);
        expect(res.status).toBe(200);
        const text = JSON.stringify(res.body);
        expect(text).toContain(SALARY);
      }
    });
  });

  describe('a tenant with policies', () => {
    it('hidden and masked identity values never appear on any employee route', async () => {
      for (const route of routes(alpha)) {
        const res = await call('get', alpha.admin, route.path);
        expect({ route: route.name, status: res.status }).toEqual({
          route: route.name,
          status: 200,
        });
        const text = JSON.stringify(res.body);
        expect({ route: route.name, leaked: text.includes(CNIC) }).toEqual({
          route: route.name,
          leaked: false,
        });
        expect({ route: route.name, leaked: text.includes(TAX) }).toEqual({
          route: route.name,
          leaked: false,
        });
        // Exactly the masked form, so the field is restricted and not dropped.
        expect(text).toContain('****9887');
        // Non-restricted values are untouched.
        expect(text).toContain(PHONE);
      }
    });

    it('hidden salary never appears on compensation routes', async () => {
      for (const route of payRoutes(alpha)) {
        const res = await call('get', alpha.admin, route.path);
        expect(res.status).toBe(200);
        const text = JSON.stringify(res.body);
        expect({ route: route.name, leaked: text.includes(SALARY) }).toEqual({
          route: route.name,
          leaked: false,
        });
        // The salary key stays (shape unchanged) with a null value.
        expect(text).toContain('"basicSalary":null');
      }
    });

    it('enforcement does not change the stored data', async () => {
      const row = await prisma.employee.findUniqueOrThrow({
        where: { id: alpha.employeeId },
        select: { cnic: true, taxIdentifier: true },
      });
      expect(row).toEqual({ cnic: CNIC, taxIdentifier: TAX });
    });

    it('an echoed hidden/masked value does not overwrite the stored one', async () => {
      const res = await call(
        'patch',
        alpha.admin,
        `employees/${alpha.employeeId}`,
        {
          cnic: null,
          taxIdentifier: '****9887',
          firstName: 'Echo',
        },
      );
      expect(res.status).toBe(200);
      const row = await prisma.employee.findUniqueOrThrow({
        where: { id: alpha.employeeId },
        select: { cnic: true, taxIdentifier: true, firstName: true },
      });
      expect(row).toEqual({
        cnic: CNIC,
        taxIdentifier: TAX,
        firstName: 'Echo',
      });
    });

    it('a genuine change to a restricted field is refused, not silently dropped', async () => {
      const res = await call(
        'patch',
        alpha.admin,
        `employees/${alpha.employeeId}`,
        {
          cnic: '11111-1111111-1',
        },
      );
      expect(res.status).toBe(403);
      const row = await prisma.employee.findUniqueOrThrow({
        where: { id: alpha.employeeId },
        select: { cnic: true },
      });
      expect(row.cnic).toBe(CNIC);
    });

    it('a filter on a hidden column is refused before any query runs', async () => {
      const refused = await call(
        'get',
        gamma.admin,
        `employees?contactFilter=${PHONE}&contactFilterOperator=contains`,
      );
      expect(refused.status).toBe(403);
      expect(JSON.stringify(refused.body)).toContain('FIELD_ACCESS_FORBIDDEN');
      // Control: the same filter works where the column is not restricted.
      const allowed = await call(
        'get',
        beta.admin,
        `employees?contactFilter=${PHONE}&contactFilterOperator=contains`,
      );
      expect(allowed.status).toBe(200);
      expect(allowed.body.items.length).toBeGreaterThan(0);
    });

    it('the per-employee compensation route masks the salary (control: unmasked elsewhere)', async () => {
      const masked = await call(
        'get',
        alpha.admin,
        `employees/${alpha.employeeId}/compensation`,
      );
      expect(masked.status).toBe(200);
      expect(JSON.stringify(masked.body)).not.toContain(SALARY);
      const control = await call(
        'get',
        beta.admin,
        `employees/${beta.employeeId}/compensation`,
      );
      expect(JSON.stringify(control.body)).toContain(SALARY);
    });

    it('linking search never carries a hidden identity value', async () => {
      const res = await call(
        'get',
        alpha.admin,
        'employees/linking-search?q=Field',
      );
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain(CNIC);
    });

    it("another tenant's policies never affect this tenant (control already shows BETA unmasked)", async () => {
      const res = await call('get', beta.admin, 'employees');
      expect(JSON.stringify(res.body)).toContain(CNIC);
    });
  });
});
