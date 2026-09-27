import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { ROLE_KEYS } from '../src/common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../src/common/interfaces/authenticated-request.interface';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { CustomizationService } from '../src/modules/customization/customization.service';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { HttpActors, type HttpActor } from './helpers/http-actors';

/**
 * Custom field values on system modules through the generic hook — TASK-0035,
 * ADR-0024.
 *
 * The full AppModule over HTTP, with the ValidationPipe configured exactly as
 * `main.ts` configures it (`forbidNonWhitelisted: true`). That is the claim
 * under test: the interceptor lifts `customFields` out of the body before the
 * module's own DTO sees it, so a strict DTO such as CreateDepartmentDto does not
 * refuse it. Departments stand for the plain-record modules, holidays for a
 * record created under a parent route.
 */
describeWithDatabase()(
  'Custom fields on system modules (e2e, HTTP, DB-backed)',
  () => {
    jest.setTimeout(600_000);

    let moduleRef: TestingModule;
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let customization: CustomizationService;
    let fixtures: DbFixtures;
    let actors: HttpActors;
    let admin: HttpActor;
    let other: HttpActor;
    let adminUser: AuthenticatedUser;
    let businessUnitId: string;
    const roleIds: string[] = [];

    async function adminOf(label: string) {
      const tenant = await fixtures.createTenant(label);
      const organizationId = await fixtures.createOrganization(tenant.id);
      const unit = await fixtures.createBusinessUnit(tenant.id, organizationId);
      const actor = await actors.tenantUser(tenant.id, unit, label);
      /* The real elevated role key: the guard passes as it does for a tenant admin. */
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
      return { actor, tenantId: tenant.id, businessUnitId: unit };
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
      customization = app.get(CustomizationService);
      fixtures = new DbFixtures(prisma, 'cf-system');
      actors = new HttpActors(app, randomUUID().slice(0, 8));

      const a = await adminOf('cfsa');
      admin = a.actor;
      businessUnitId = a.businessUnitId;
      adminUser = {
        userId: admin.id,
        tenantId: a.tenantId,
        email: admin.email,
        roleIds: [],
        roleKeys: [ROLE_KEYS.GLOBAL_ADMIN],
        permissionKeys: ['customization.read', 'customization.publish'],
      } as AuthenticatedUser;
      other = (await adminOf('cfsb')).actor;

      await customization.createColumn(adminUser, 'departments', {
        columnKey: 'ad_costCenter',
        displayName: 'Cost center',
        dataType: 'select',
        optionSetJson: {
          options: [
            { value: 'CC1', label: 'CC 1' },
            { value: 'CC2', label: 'CC 2' },
          ],
        } as unknown as Record<string, unknown>,
      });
      await customization.createColumn(adminUser, 'holidays', {
        columnKey: 'ad_region',
        displayName: 'Region',
        dataType: 'text',
        maxLength: 20,
      });
      await customization.publish(adminUser);
    });

    afterAll(async () => {
      if (roleIds.length) {
        await prisma.userRole.deleteMany({
          where: { roleId: { in: roleIds } },
        });
        await prisma.role.deleteMany({ where: { id: { in: roleIds } } });
      }
      await actors.cleanup();
      await fixtures.cleanup();
      await app.close();
    });

    const as = (actor: HttpActor) => ({
      get: (path: string) =>
        request(app.getHttpServer())
          .get(`/${path}`)
          .set('Authorization', `Bearer ${actor.token}`)
          .set('X-DijiPeople-App', 'web'),
      post: (path: string, body: object) =>
        request(app.getHttpServer())
          .post(`/${path}`)
          .set('Authorization', `Bearer ${actor.token}`)
          .set('X-DijiPeople-App', 'web')
          .send(body),
      patch: (path: string, body: object) =>
        request(app.getHttpServer())
          .patch(`/${path}`)
          .set('Authorization', `Bearer ${actor.token}`)
          .set('X-DijiPeople-App', 'web')
          .send(body),
    });

    let departmentId: string;

    it('a strict DTO accepts customFields, and the created record answers with them', async () => {
      const created = await as(admin).post('departments', {
        businessUnitId,
        name: `Finance ${randomUUID().slice(0, 6)}`,
        customFields: { ad_costCenter: 'CC1' },
      });
      expect(created.status).toBe(201);
      expect(created.body.customFields).toEqual({ ad_costCenter: 'CC1' });
      departmentId = created.body.id;

      const read = await as(admin).get(`departments/${departmentId}`);
      expect(read.body.customFields).toEqual({ ad_costCenter: 'CC1' });
    });

    it('refuses a bad value with a field error, before the module writes anything', async () => {
      const before = await prisma.department.count({
        where: { businessUnitId },
      });
      const refused = await as(admin).post('departments', {
        businessUnitId,
        name: `Refused ${randomUUID().slice(0, 6)}`,
        customFields: { ad_costCenter: 'CC9' },
      });
      expect(refused.status).toBe(400);
      expect(JSON.stringify(refused.body)).toContain(
        'customFields.ad_costCenter',
      );
      expect(await prisma.department.count({ where: { businessUnitId } })).toBe(
        before,
      );
    });

    it('updates by the route id, keeps unrelated edits apart, and audits the change', async () => {
      const updated = await as(admin).patch(`departments/${departmentId}`, {
        customFields: { ad_costCenter: 'CC2' },
      });
      expect(updated.status).toBe(200);
      expect(updated.body.customFields).toEqual({ ad_costCenter: 'CC2' });

      const renamed = await as(admin).patch(`departments/${departmentId}`, {
        description: 'no custom fields sent',
      });
      expect(renamed.body.customFields).toEqual({ ad_costCenter: 'CC2' });

      const audit = await prisma.auditLog.findFirst({
        where: {
          entityType: 'departments',
          entityId: departmentId,
          action: 'CUSTOM_FIELD_VALUES_UPDATED',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit?.afterSnapshot).toEqual({ ad_costCenter: 'CC2' });
    });

    it('attaches values to the rows of a list', async () => {
      const list = await as(admin).get('departments');
      const rows: Array<{ id: string; customFields?: unknown }> = Array.isArray(
        list.body,
      )
        ? list.body
        : list.body.items;
      expect(rows.find((row) => row.id === departmentId)?.customFields).toEqual(
        { ad_costCenter: 'CC2' },
      );
    });

    it('stores values on a record created under a parent route', async () => {
      const calendar = await as(admin).post('holiday-calendars', {
        name: `Cal ${randomUUID().slice(0, 6)}`,
      });
      expect(calendar.status).toBe(201);
      const holiday = await as(admin).post(
        `holiday-calendars/${calendar.body.id}/holidays`,
        {
          name: 'Founders day',
          holidayDate: '2026-12-01',
          customFields: { ad_region: 'North' },
        },
      );
      expect(holiday.status).toBe(201);
      expect(holiday.body.customFields).toEqual({ ad_region: 'North' });
      const stored = await prisma.customRecordExtension.findFirst({
        where: { tableKey: 'holidays', recordId: holiday.body.id },
      });
      expect(stored?.values).toEqual({ ad_region: 'North' });
    });

    it('another tenant neither sees the fields nor reaches the values', async () => {
      const definitions = await as(other).get('custom-fields/departments');
      expect(definitions.status).toBe(200);
      expect(definitions.body).toEqual([]);
      const read = await as(other).get(`departments/${departmentId}`);
      expect(read.status).toBe(404);
    });

    it('serves definitions to the tenant, and refuses a table that takes none', async () => {
      const definitions = await as(admin).get('custom-fields/departments');
      expect(
        definitions.body.map(
          (field: { logicalName: string }) => field.logicalName,
        ),
      ).toEqual(['ad_costCenter']);
      const closed = await as(admin).get('custom-fields/payslips');
      expect(closed.status).toBe(404);
    });

    it('refuses a custom field on a table no route edits (BUG-3786)', async () => {
      await expect(
        customization.createColumn(adminUser, 'payslips', {
          columnKey: 'ad_note',
          displayName: 'Note',
          dataType: 'text',
        }),
      ).rejects.toMatchObject({
        response: { code: 'CUSTOMIZATION_TABLE_NOT_CUSTOMIZABLE' },
      });
    });
  },
);
