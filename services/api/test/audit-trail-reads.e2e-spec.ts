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
 * BUG-3184 (employee termination wrote no audit row) and BUG-3185 (reading or
 * downloading a document was recorded nowhere).
 *
 * Each case pairs the owner action, which must leave exactly one row naming the
 * actor, with a refusal that must leave none: an auditor trusts the trail only if
 * it contains everything that happened and nothing that did not.
 *
 * EVIDENCE CLASS: database-backed HTTP integration, persisted state verified.
 */
describeWithDatabase()(
  'Audit trail for terminations and document reads (e2e)',
  () => {
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
      documentId: string;
    }
    let alpha: Side;
    let beta: Side;

    const api = (method: 'get' | 'post', as: HttpActor, path: string) =>
      request(app.getHttpServer())
        [method](`/${path}`)
        .set('Authorization', `Bearer ${as.token}`)
        .set('X-DijiPeople-App', 'web');

    const rowsFor = (tenantId: string, action: string, entityId: string) =>
      prisma.auditLog.findMany({ where: { tenantId, action, entityId } });

    /** The audit write follows the response, so wait for it to land. */
    const waitForRows = async (
      tenantId: string,
      action: string,
      entityId: string,
      count: number,
    ) => {
      let rows = await rowsFor(tenantId, action, entityId);
      for (let attempt = 0; attempt < 20 && rows.length < count; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        rows = await rowsFor(tenantId, action, entityId);
      }
      return rows;
    };

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
          employeeCode: `AT-${label}-${suffix}`,
          firstName: 'Trail',
          lastName: label,
          phone: '000',
          hireDate: new Date('2024-01-01'),
        },
        select: { id: true },
      });
      const category = await prisma.documentCategory.create({
        data: {
          tenantId: tenant.id,
          code: `C_${label}_${suffix}`.toUpperCase(),
          name: `Category ${label} ${suffix}`,
        },
        select: { id: true },
      });
      const upload = await api('post', admin, 'documents/upload')
        .field('entityType', 'EMPLOYEE')
        .field('entityId', employee.id)
        .field('documentCategoryId', category.id)
        .field('title', `Trail ${label}`)
        .attach('file', Buffer.from(`%PDF-1.4\n%trail-${label}\n%%EOF\n`), {
          filename: 'trail.pdf',
          contentType: 'application/pdf',
        });
      if (upload.status >= 300) {
        throw new Error(`fixture upload failed: ${upload.status}`);
      }
      return {
        tenantId: tenant.id,
        admin,
        employeeId: employee.id,
        documentId: (upload.body as { id: string }).id,
      };
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
      fixtures = new DbFixtures(prisma, 'trail');
      actors = new HttpActors(app, suffix);
      alpha = await side('trailalpha');
      beta = await side('trailbeta');
    });

    afterAll(async () => {
      // try/finally so a cleanup failure can never leave the app open.
      try {
        await actors.cleanup();
        await fixtures.cleanup();
      } finally {
        await app.close();
      }
    });

    describe('BUG-3184: terminating an employee is audited', () => {
      it('control: the owner terminates its employee and exactly one row names the actor and the change', async () => {
        const res = await api(
          'post',
          beta.admin,
          `employees/${beta.employeeId}/terminate`,
        ).send({ terminationDate: '2026-11-01' });
        expect(res.status).toBe(201);
        const rows = await waitForRows(
          beta.tenantId,
          'EMPLOYEE_TERMINATED',
          beta.employeeId,
          1,
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].actorUserId).toBe(beta.admin.id);
        expect(JSON.stringify(rows[0].afterSnapshot)).toContain('TERMINATED');
      });

      it("ALPHA's admin cannot terminate BETA's employee: 404, no row, status unchanged", async () => {
        const victim = await prisma.employee.create({
          data: {
            tenantId: beta.tenantId,
            employeeCode: `AT-victim-${suffix}`,
            firstName: 'Victim',
            lastName: 'Trail',
            phone: '000',
            hireDate: new Date('2024-01-01'),
          },
          select: { id: true, employmentStatus: true },
        });
        const res = await api(
          'post',
          alpha.admin,
          `employees/${victim.id}/terminate`,
        ).send({});
        expect(res.status).toBe(404);
        await new Promise((resolve) => setTimeout(resolve, 500));
        expect(
          await prisma.auditLog.count({
            where: { action: 'EMPLOYEE_TERMINATED', entityId: victim.id },
          }),
        ).toBe(0);
        expect(
          (
            await prisma.employee.findUniqueOrThrow({
              where: { id: victim.id },
            })
          ).employmentStatus,
        ).toBe(victim.employmentStatus);
      });
    });

    describe('BUG-3185: reading a document is audited', () => {
      it.each([
        ['view', 'DOCUMENT_VIEWED'],
        ['download', 'DOCUMENT_DOWNLOADED'],
      ])(
        'control: the owner %s writes exactly one %s row naming the actor',
        async (verb, action) => {
          const res = await api(
            'get',
            beta.admin,
            `documents/${beta.documentId}/${verb}`,
          ).buffer(true);
          expect(res.status).toBe(200);
          const rows = await waitForRows(
            beta.tenantId,
            action,
            beta.documentId,
            1,
          );
          expect(rows).toHaveLength(1);
          expect(rows[0].actorUserId).toBe(beta.admin.id);
          // The row names the document and carries none of its content.
          expect(JSON.stringify(rows[0])).not.toContain('trail-trailbeta');
        },
      );

      it("a refused read of another tenant's document writes no row in either tenant", async () => {
        const before = await prisma.auditLog.count({
          where: {
            action: { in: ['DOCUMENT_VIEWED', 'DOCUMENT_DOWNLOADED'] },
            entityId: beta.documentId,
          },
        });
        for (const verb of ['view', 'download']) {
          const res = await api(
            'get',
            alpha.admin,
            `documents/${beta.documentId}/${verb}`,
          ).buffer(true);
          expect(res.status).toBe(404);
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
        expect(
          await prisma.auditLog.count({
            where: {
              action: { in: ['DOCUMENT_VIEWED', 'DOCUMENT_DOWNLOADED'] },
              entityId: beta.documentId,
            },
          }),
        ).toBe(before);
      });
    });
  },
);
