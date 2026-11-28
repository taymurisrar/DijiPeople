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
 * WP3 (SESSION-0137) — leave: requests, types and policies.
 *
 * Leave requests carry a person's absence reason (often medical), and the
 * approve/reject routes change another person's entitlement, so a cross-tenant
 * slip is both a disclosure and a write. Each tenant has an employee, a leave
 * type, a PENDING request carrying a unique marker in its reason and a policy.
 * ALPHA's admin attacks BETA's rows by id on every verb; BETA's admin is the
 * owner control on the same route, and BETA's persisted rows are re-read after
 * every attack.
 *
 * EVIDENCE CLASS: database-backed HTTP integration, persisted state verified.
 */
describeWithDatabase()('Leave cross-tenant (e2e, HTTP)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  const suffix = randomUUID().slice(0, 6);

  interface Side {
    tenantId: string;
    admin: HttpActor;
    employeeId: string;
    leaveTypeId: string;
    leaveRequestId: string;
    policyId: string;
    marker: string;
  }
  let alpha: Side;
  let beta: Side;

  const api = (
    method: 'get' | 'post' | 'patch' | 'delete',
    as: HttpActor,
    path: string,
  ) =>
    request(app.getHttpServer())
      [method](`/${path}`)
      .set('Authorization', `Bearer ${as.token}`)
      .set('X-DijiPeople-App', 'web');

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
        // Linked to the admin user: submitting a request needs a current employee,
        // and without one every submit is refused for that reason alone.
        userId: admin.id,
        employeeCode: `LV-${label}-${suffix}`,
        firstName: 'Leave',
        lastName: label,
        phone: '000',
        hireDate: new Date('2024-01-01'),
      },
      select: { id: true },
    });
    const marker = `reason-${label}-${suffix}`;
    const leaveType = await prisma.leaveType.create({
      data: {
        tenantId: tenant.id,
        name: `Annual ${label}`,
        code: `AL-${label}-${suffix}`.toUpperCase(),
        category: 'ANNUAL',
      },
      select: { id: true },
    });
    // A balance, or an own-type submit is refused for insufficient balance.
    await prisma.leaveBalance.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.id,
        leaveTypeId: leaveType.id,
        totalAllocated: 30,
        totalRemaining: 30,
      },
    });
    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        tenantId: tenant.id,
        employeeId: employee.id,
        leaveTypeId: leaveType.id,
        startDate: new Date('2030-03-04'),
        endDate: new Date('2030-03-05'),
        totalDays: 2,
        reason: marker,
      },
      select: { id: true },
    });
    const policy = await prisma.leavePolicy.create({
      data: { tenantId: tenant.id, name: `Policy ${label} ${suffix}` },
      select: { id: true },
    });
    return {
      tenantId: tenant.id,
      admin,
      employeeId: employee.id,
      leaveTypeId: leaveType.id,
      leaveRequestId: leaveRequest.id,
      policyId: policy.id,
      marker,
    };
  }

  const betaRequest = () =>
    prisma.leaveRequest.findUniqueOrThrow({
      where: { id: beta.leaveRequestId },
    });

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
    fixtures = new DbFixtures(prisma, 'leave');
    actors = new HttpActors(app, suffix);
    alpha = await side('lvalpha');
    beta = await side('lvbeta');
  });

  afterAll(async () => {
    // Filing a request creates an ApprovalRequest that restricts deleting its
    // submitter, so those go first. try/finally so a cleanup failure can never
    // leave the Nest app open and the jest process hanging.
    try {
      const tenantIds = [alpha?.tenantId, beta?.tenantId].filter(
        (id): id is string => Boolean(id),
      );
      await prisma.approvalRequest.deleteMany({
        where: { tenantId: { in: tenantIds } },
      });
      await actors.cleanup();
      await fixtures.cleanup();
    } finally {
      await app.close();
    }
  });

  describe('controls (BETA admin on BETA rows)', () => {
    it.each([
      (s: Side) => `leave-requests/${s.leaveRequestId}`,
      (s: Side) => `leave-requests/${s.leaveRequestId}/timeline`,
      (s: Side) => `leave-types/${s.leaveTypeId}`,
      (s: Side) => `leave-types/${s.leaveTypeId}/usage`,
      (s: Side) => `leave-policies/${s.policyId}`,
      (s: Side) => `leave-policies/${s.policyId}/rules`,
    ])('the owner reads its own row (%#)', async (route) => {
      const path = route(beta);
      const res = await api('get', beta.admin, path);
      expect({ path, status: res.status }).toEqual({ path, status: 200 });
    });

    it('the owner list and export contain the owner marker', async () => {
      const list = await api('get', beta.admin, 'leave-requests/team');
      expect(list.status).toBe(200);
      const exported = await api(
        'get',
        beta.admin,
        'leave-requests/export',
      ).buffer(true);
      expect(exported.status).toBe(200);
      const text = Buffer.isBuffer(exported.body)
        ? exported.body.toString('utf8')
        : (exported.text ?? '');
      expect(text).toContain(beta.marker);
    });
  });

  describe('ALPHA admin → BETA rows: reads', () => {
    it.each([
      (s: Side) => `leave-requests/${s.leaveRequestId}`,
      (s: Side) => `leave-requests/${s.leaveRequestId}/timeline`,
      (s: Side) => `leave-types/${s.leaveTypeId}`,
      (s: Side) => `leave-types/${s.leaveTypeId}/usage`,
      (s: Side) => `leave-types/${s.leaveTypeId}/policy-rules`,
      (s: Side) => `leave-policies/${s.policyId}`,
      (s: Side) => `leave-policies/${s.policyId}/rules`,
      (s: Side) => `leave-policies/${s.policyId}/assignments`,
    ])('is refused (%#) and leaks no BETA marker', async (route) => {
      const path = route(beta);
      const res = await api('get', alpha.admin, path);
      expect({ path, refused: [403, 404].includes(res.status) }).toEqual({
        path,
        refused: true,
      });
      expect(JSON.stringify(res.body)).not.toContain(beta.marker);
    });

    it('list and export never contain BETA rows', async () => {
      for (const route of [
        'leave-requests/team',
        'leave-requests/mine',
        'leave-requests/export',
        'leave-types',
        'leave-policies',
      ]) {
        const res = await api('get', alpha.admin, route).buffer(true);
        const text = Buffer.isBuffer(res.body)
          ? res.body.toString('utf8')
          : JSON.stringify(res.body) + (res.text ?? '');
        expect({ route, leaked: text.includes(beta.marker) }).toEqual({
          route,
          leaked: false,
        });
        expect({
          route,
          leakedId: text.includes(beta.leaveRequestId),
        }).toEqual({ route, leakedId: false });
      }
    });
  });

  describe('ALPHA admin → BETA rows: writes', () => {
    it.each(['approve', 'reject', 'cancel'])(
      'cannot %s a BETA leave request, and it stays PENDING',
      async (verb) => {
        const res = await api(
          'post',
          alpha.admin,
          `leave-requests/${beta.leaveRequestId}/${verb}`,
        ).send({});
        expect(res.status).toBe(404);
        const after = await betaRequest();
        expect(after.status).toBe('PENDING');
        expect(after.reason).toBe(beta.marker);
      },
    );

    it('control: BETA admin can act on its own request (route and body are valid)', async () => {
      const own = await prisma.leaveRequest.create({
        data: {
          tenantId: beta.tenantId,
          employeeId: beta.employeeId,
          leaveTypeId: beta.leaveTypeId,
          startDate: new Date('2030-04-01'),
          endDate: new Date('2030-04-01'),
          totalDays: 1,
          reason: `${beta.marker}-control`,
        },
        select: { id: true },
      });
      const res = await api(
        'post',
        beta.admin,
        `leave-requests/${own.id}/cancel`,
      ).send({});
      expect(res.status).toBeLessThan(300);
      expect(
        (await prisma.leaveRequest.findUniqueOrThrow({ where: { id: own.id } }))
          .status,
      ).not.toBe('PENDING');
    });

    it('cannot edit or delete a BETA leave type, which stays as it was', async () => {
      const before = await prisma.leaveType.findUniqueOrThrow({
        where: { id: beta.leaveTypeId },
      });
      const patch = await api(
        'patch',
        alpha.admin,
        `leave-types/${beta.leaveTypeId}`,
      ).send({ name: 'HIJACKED' });
      expect(patch.status).toBe(404);
      const del = await api(
        'delete',
        alpha.admin,
        `leave-types/${beta.leaveTypeId}`,
      );
      expect(del.status).toBe(404);
      const after = await prisma.leaveType.findUniqueOrThrow({
        where: { id: beta.leaveTypeId },
      });
      expect(after.name).toBe(before.name);
      expect(after.isActive).toBe(before.isActive);
    });

    it('cannot edit or delete a BETA leave policy', async () => {
      const before = await prisma.leavePolicy.findUniqueOrThrow({
        where: { id: beta.policyId },
      });
      const patch = await api(
        'patch',
        alpha.admin,
        `leave-policies/${beta.policyId}`,
      ).send({ name: 'HIJACKED' });
      expect(patch.status).toBe(404);
      const del = await api(
        'delete',
        alpha.admin,
        `leave-policies/${beta.policyId}`,
      );
      expect(del.status).toBe(404);
      const after = await prisma.leavePolicy.findUniqueOrThrow({
        where: { id: beta.policyId },
      });
      expect(after.name).toBe(before.name);
      expect(after.isActive).toBe(before.isActive);
    });
  });

  describe('foreign parent ids on create', () => {
    it('control: ALPHA can file a request against its OWN leave type', async () => {
      const res = await api('post', alpha.admin, 'leave-requests').send({
        leaveTypeId: alpha.leaveTypeId,
        startDate: '2030-06-10',
        endDate: '2030-06-10',
        reason: 'own type control',
      });
      expect(res.status).toBeLessThan(300);
    });

    it('cannot file a request against a BETA leave type (exactly the foreign-type refusal)', async () => {
      const before = await prisma.leaveRequest.count({
        where: { leaveTypeId: beta.leaveTypeId },
      });
      const res = await api('post', alpha.admin, 'leave-requests').send({
        leaveTypeId: beta.leaveTypeId,
        startDate: '2030-06-03',
        endDate: '2030-06-03',
        reason: 'foreign type',
      });
      // The tenant-scoped type lookup is what refuses, not a missing employee or balance.
      expect(res.status).toBe(400);
      expect((res.body as { message?: string }).message).toBe(
        'Selected leave type is not active for this tenant.',
      );
      expect(
        await prisma.leaveRequest.count({
          where: { leaveTypeId: beta.leaveTypeId },
        }),
      ).toBe(before);
    });

    it('control: ALPHA can assign its OWN policy to its OWN employee with this body shape', async () => {
      const res = await api(
        'post',
        alpha.admin,
        'leave-policies/assignments',
      ).send({
        leavePolicyId: alpha.policyId,
        scopeType: 'EMPLOYEE',
        scopeId: alpha.employeeId,
        employeeId: alpha.employeeId,
        effectiveFrom: '2030-01-01',
      });
      expect(res.status).toBeLessThan(300);
    });

    it('cannot assign a BETA policy, or assign to a BETA employee', async () => {
      const attempts = [
        // BETA policy, ALPHA scope: the policy lookup is tenant-scoped.
        {
          status: 404,
          body: {
            leavePolicyId: beta.policyId,
            scopeType: 'TENANT',
            effectiveFrom: '2030-01-01',
          },
        },
        // ALPHA policy, BETA employee as the scope: same shape as the control.
        {
          status: 400,
          body: {
            leavePolicyId: alpha.policyId,
            scopeType: 'EMPLOYEE',
            scopeId: beta.employeeId,
            employeeId: beta.employeeId,
            effectiveFrom: '2030-01-01',
          },
        },
      ];
      for (const attempt of attempts) {
        const res = await api(
          'post',
          alpha.admin,
          'leave-policies/assignments',
        ).send(attempt.body);
        expect(res.status).toBe(attempt.status);
      }
      expect(
        await prisma.leavePolicyAssignment.count({
          where: {
            OR: [
              { leavePolicyId: beta.policyId },
              { employeeId: beta.employeeId },
            ],
          },
        }),
      ).toBe(0);
    });

    it('rejects tenantId and status in a leave type or request body (mass assignment)', async () => {
      const type = await api('post', alpha.admin, 'leave-types').send({
        name: `Mass ${suffix}`,
        code: `MASS-${suffix}`,
        category: 'ANNUAL',
        tenantId: beta.tenantId,
      });
      expect(type.status).toBe(400);
      const req = await api('post', alpha.admin, 'leave-requests').send({
        leaveTypeId: alpha.leaveTypeId,
        startDate: '2030-06-03',
        endDate: '2030-06-03',
        status: 'APPROVED',
        tenantId: beta.tenantId,
      });
      expect(req.status).toBe(400);
      expect(
        await prisma.leaveType.count({ where: { code: `MASS-${suffix}` } }),
      ).toBe(0);
    });
  });
});
