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
 * WP3 (SESSION-0137) — the employee surface, across the tenant boundary.
 *
 * EVIDENCE CLASS: database-backed HTTP integration. Tenant ALPHA's GLOBAL_ADMIN
 * (so RBAC is not what refuses) reads, searches, exports, counts, mutates and
 * bulk-mutates tenant BETA's employee, and tries mass assignment of `tenantId`.
 * BETA's rows must be unchanged. Positive controls show ALPHA sees its own rows
 * through the same endpoints, so an empty result is isolation, not breakage.
 */
describeWithDatabase()(
  'Employee surface is tenant-isolated (e2e, HTTP)',
  () => {
    jest.setTimeout(600_000);

    let moduleRef: TestingModule;
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let fixtures: DbFixtures;
    let actors: HttpActors;
    const suffix = randomUUID().slice(0, 6);
    const markerA = `Alphamark${suffix}`;
    const markerB = `Betamark${suffix}`;

    let alphaTenantId: string;
    let betaTenantId: string;
    let alpha: HttpActor;
    let beta: HttpActor;
    let alphaEmployeeId: string;
    let betaEmployeeId: string;
    let betaOwnerCandidateId: string;

    async function admin(label: string) {
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
      await prisma.userRole.create({
        data: { tenantId: tenant.id, userId: actor.id, roleId: role.id },
      });
      return { tenantId: tenant.id, actor };
    }

    const employee = async (tenantId: string, lastName: string, code: string) =>
      (
        await prisma.employee.create({
          data: {
            tenantId,
            employeeCode: `${code}-${suffix}`,
            firstName: 'Surface',
            lastName,
            phone: '000',
            hireDate: new Date('2024-01-01'),
          },
          select: { id: true },
        })
      ).id;

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
    const text = (res: request.Response): string =>
      typeof res.text === 'string' && res.text
        ? res.text
        : Buffer.isBuffer(res.body)
          ? res.body.toString('utf8')
          : JSON.stringify(res.body);
    const refused = (status: number) => expect([403, 404]).toContain(status);

    const betaSnapshot = async () =>
      JSON.parse(
        JSON.stringify({
          employee: await prisma.employee.findUnique({
            where: { id: betaEmployeeId },
          }),
          owner: await prisma.employee.findUnique({
            where: { id: betaOwnerCandidateId },
          }),
          count: await prisma.employee.count({
            where: { tenantId: betaTenantId },
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
      fixtures = new DbFixtures(prisma, 'emp-surface');
      actors = new HttpActors(app, suffix);

      const a = await admin('ea');
      const b = await admin('eb');
      alphaTenantId = a.tenantId;
      betaTenantId = b.tenantId;
      alpha = a.actor;
      beta = b.actor;
      alphaEmployeeId = await employee(alphaTenantId, markerA, 'EA1');
      await employee(alphaTenantId, `${markerA}2`, 'EA2');
      betaEmployeeId = await employee(betaTenantId, markerB, 'EB1');
      betaOwnerCandidateId = await employee(betaTenantId, `${markerB}2`, 'EB2');
    });

    afterAll(async () => {
      await prisma.employee.deleteMany({
        where: { tenantId: { in: [alphaTenantId, betaTenantId] } },
      });
      await actors.cleanup();
      await fixtures.cleanup();
      await app.close();
    });

    describe('positive controls', () => {
      it('each admin lists, searches and exports its own employees', async () => {
        for (const [who, marker] of [
          [alpha, markerA],
          [beta, markerB],
        ] as const) {
          const list = await call('get', who, `employees?search=${marker}`);
          expect(list.status).toBe(200);
          expect(text(list)).toContain(marker);
          const exp = await call(
            'get',
            who,
            `employees/export?search=${marker}`,
          );
          expect(exp.status).toBe(200);
          expect(text(exp)).toContain(marker);
        }
      });
    });

    describe('read paths do not cross the boundary', () => {
      it('list and search for the other tenant’s marker find nothing', async () => {
        const list = await call('get', alpha, `employees?search=${markerB}`);
        expect(list.status).toBe(200);
        // The response echoes the search term in `filters`, so assert on the
        // result set itself rather than on the raw text.
        const body = list.body as {
          items: unknown[];
          meta: { total: number };
        };
        expect(body.items).toEqual([]);
        expect(body.meta.total).toBe(0);
      });

      it('an unfiltered list contains only the caller’s rows', async () => {
        const list = await call('get', alpha, 'employees?pageSize=100');
        expect(list.status).toBe(200);
        expect(text(list)).toContain(markerA);
        expect(text(list)).not.toContain(markerB);
      });

      it('export, filtered and unfiltered, never contains the other tenant', async () => {
        for (const q of [`?search=${markerB}`, '']) {
          const exp = await call('get', alpha, `employees/export${q}`);
          expect(exp.status).toBe(200);
          expect(text(exp)).not.toContain(markerB);
        }
      });

      it('by-id reads and sub-resources are refused', async () => {
        for (const sub of [
          '',
          '/export',
          '/history',
          '/education',
          '/compensation',
          '/previous-employments',
          '/documents',
          '/hierarchy',
          '/reporting-structure',
          '/direct-reports',
        ]) {
          const res = await call(
            'get',
            alpha,
            `employees/${betaEmployeeId}${sub}`,
          );
          refused(res.status);
          expect(text(res)).not.toContain(markerB);
        }
      });
    });

    describe('write paths do not cross the boundary', () => {
      let before: unknown;
      beforeAll(async () => {
        before = await betaSnapshot();
      });

      it('single-record mutations are refused', async () => {
        refused(
          (
            await call('patch', alpha, `employees/${betaEmployeeId}`, {
              firstName: 'HIJACKED',
            })
          ).status,
        );
        refused(
          (
            await call('patch', alpha, `employees/${betaEmployeeId}/manager`, {
              reportingManagerEmployeeId: alphaEmployeeId,
            })
          ).status,
        );
        refused(
          (
            await call(
              'patch',
              alpha,
              `employees/${betaEmployeeId}/assign-owner`,
              {
                ownerUserId: alpha.id,
              },
            )
          ).status,
        );
        refused(
          (
            await call(
              'post',
              alpha,
              `employees/${betaEmployeeId}/resend-invite`,
            )
          ).status,
        );
        refused(
          (await call('delete', alpha, `employees/${betaEmployeeId}`)).status,
        );
      });

      it('bulk delete and bulk assign leave the other tenant untouched', async () => {
        const del = await call('delete', alpha, 'employees/bulk-delete', {
          ids: [betaEmployeeId, betaOwnerCandidateId],
        });
        expect(del.status).toBeLessThan(500);
        const assign = await call('patch', alpha, 'employees/assign-owner', {
          employeeIds: [betaEmployeeId],
          ownerUserId: alpha.id,
        });
        expect(assign.status).toBeLessThan(500);
      });

      it('an ALPHA employee cannot be given a BETA manager', async () => {
        const res = await call(
          'patch',
          alpha,
          `employees/${alphaEmployeeId}/manager`,
          { reportingManagerEmployeeId: betaEmployeeId },
        );
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
        const row = await prisma.employee.findUniqueOrThrow({
          where: { id: alphaEmployeeId },
          select: { managerEmployeeId: true },
        });
        expect(row.managerEmployeeId).not.toBe(betaEmployeeId);
      });

      it('left every BETA row byte-for-byte unchanged', async () => {
        expect(await betaSnapshot()).toEqual(before);
      });
    });

    describe('mass assignment and privilege escalation', () => {
      it('a client-supplied tenantId is rejected and does not move the row', async () => {
        const res = await call('patch', alpha, `employees/${alphaEmployeeId}`, {
          tenantId: betaTenantId,
        });
        expect(res.status).toBe(400);
        const row = await prisma.employee.findUniqueOrThrow({
          where: { id: alphaEmployeeId },
          select: { tenantId: true },
        });
        expect(row.tenantId).toBe(alphaTenantId);
      });

      it('a client-supplied id, createdById or isDeleted is rejected', async () => {
        for (const body of [
          { id: randomUUID() },
          { createdById: alpha.id },
          { isDeleted: true },
        ]) {
          const res = await call(
            'patch',
            alpha,
            `employees/${alphaEmployeeId}`,
            body,
          );
          expect(res.status).toBe(400);
        }
      });
    });
  },
);
