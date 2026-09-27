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
 * Custom field values on the twelve/thirteen system modules TASK-0035 bound
 * but that had no demo data to exercise them live — TASK-0036.
 *
 * Same claim as `custom-fields-system-modules.e2e-spec.ts`, extended to the
 * modules that suite never touched: payroll calendars (`payrollCycles`),
 * payroll periods, payroll runs, employee levels, teams, leave policies,
 * claim types, claim requests, policies, policy assignments, recruitment
 * candidates, job openings and job applications. Each gets a real
 * `CustomizationColumn`, a create through the module's own HTTP route with
 * `customFields` in the body, and a read back (by id where the module has one,
 * by list where it does not) that proves the value survived — the full
 * AppModule over HTTP, with the ValidationPipe configured exactly as
 * `main.ts` configures it (`forbidNonWhitelisted: true`), so a strict DTO such
 * as `CreatePayrollCycleDto` never sees the `customFields` key the interceptor
 * lifts out first.
 */
describeWithDatabase()(
  'Custom fields on bound-but-unexercised modules (e2e, HTTP, DB-backed)',
  () => {
    jest.setTimeout(600_000);

    let moduleRef: TestingModule;
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let customization: CustomizationService;
    let fixtures: DbFixtures;
    let actors: HttpActors;
    let admin: HttpActor;
    let adminUser: AuthenticatedUser;
    let tenantId: string;
    let employeeId: string;
    const roleIds: string[] = [];

    /** The one custom field every bound table gets, so one loop creates them all. */
    const COLUMN_KEY = 'bm_note';
    const BOUND_TABLE_KEYS = [
      'payrollCycles',
      'payrollPeriods',
      'payrollRuns',
      'employeeLevels',
      'teams',
      'leavePolicies',
      'claimTypes',
      'claimRequests',
      'policies',
      'policyAssignments',
      'candidates',
      'jobOpenings',
      'applications',
    ] as const;

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
      fixtures = new DbFixtures(prisma, 'cf-bound');
      actors = new HttpActors(app, randomUUID().slice(0, 8));

      const tenant = await fixtures.createTenant('bm');
      tenantId = tenant.id;
      const organizationId = await fixtures.createOrganization(tenantId);
      const businessUnitId = await fixtures.createBusinessUnit(
        tenantId,
        organizationId,
      );
      admin = await actors.tenantUser(tenantId, businessUnitId, 'bmadmin');

      /* The real elevated role key: the guard passes as it does for a tenant admin. */
      const role = await prisma.role.create({
        data: {
          tenantId,
          key: ROLE_KEYS.GLOBAL_ADMIN,
          name: 'Admin bm',
        },
        select: { id: true },
      });
      roleIds.push(role.id);
      await prisma.userRole.create({
        data: { tenantId, userId: admin.id, roleId: role.id },
      });

      adminUser = {
        userId: admin.id,
        tenantId,
        email: admin.email,
        roleIds: [],
        roleKeys: [ROLE_KEYS.GLOBAL_ADMIN],
        permissionKeys: ['customization.read', 'customization.publish'],
      } as AuthenticatedUser;

      for (const tableKey of BOUND_TABLE_KEYS) {
        await customization.createColumn(adminUser, tableKey, {
          columnKey: COLUMN_KEY,
          displayName: 'Note',
          dataType: 'text',
          maxLength: 200,
        });
      }
      await customization.publish(adminUser);

      /*
       * A claim request writes against an Employee, not the requesting user
       * directly (ClaimsService.findEmployeeForUser). The admin actor here is a
       * bare User row with no Employee profile, so claims/types is fine but
       * claims itself needs a real employee to attach to.
       */
      const employee = await prisma.employee.create({
        data: {
          tenantId,
          employeeCode: `CF-${randomUUID().slice(0, 8)}`,
          firstName: 'Custom',
          lastName: 'Fields',
          phone: '0000000000',
          hireDate: new Date('2026-01-01'),
        },
        select: { id: true },
      });
      employeeId = employee.id;
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
    });

    type Row = { id: string; customFields?: unknown };
    const record = (response: { body: unknown }) => response.body as Row;
    const rows = (response: { body: unknown }): Row[] => {
      const body = response.body as Row[] | { items: Row[] };
      return Array.isArray(body) ? body : body.items;
    };

    it('payroll calendars (payrollCycles): create carries customFields, GET by id reads them back', async () => {
      const created = await as(admin).post('payroll/cycles', {
        customFields: { bm_note: 'calendar note' },
      });
      expect(created.status).toBe(201);
      expect(record(created).customFields).toEqual({
        bm_note: 'calendar note',
      });

      const read = await as(admin).get(`payroll/cycles/${record(created).id}`);
      expect(read.status).toBe(200);
      expect(record(read).customFields).toEqual({ bm_note: 'calendar note' });
    });

    let payrollPeriodId: string;

    it('payroll periods (payrollPeriods): create under a payroll calendar carries customFields, GET by id reads them back', async () => {
      const calendar = await as(admin).post('payroll/calendars', {
        name: `Calendar ${randomUUID().slice(0, 6)}`,
        frequency: 'MONTHLY',
        currencyCode: 'USD',
      });
      expect(calendar.status).toBe(201);

      const created = await as(admin).post('payroll/periods', {
        payrollCalendarId: record(calendar).id,
        name: `Period ${randomUUID().slice(0, 6)}`,
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
        customFields: { bm_note: 'period note' },
      });
      expect(created.status).toBe(201);
      expect(record(created).customFields).toEqual({ bm_note: 'period note' });
      payrollPeriodId = record(created).id;

      const read = await as(admin).get(`payroll/periods/${payrollPeriodId}`);
      expect(read.status).toBe(200);
      expect(record(read).customFields).toEqual({ bm_note: 'period note' });
    });

    it('payroll runs (payrollRuns): create against a payroll period carries customFields, GET by id reads them back', async () => {
      expect(payrollPeriodId).toBeDefined();
      const created = await as(admin).post('payroll/runs', {
        payrollPeriodId,
        customFields: { bm_note: 'run note' },
      });
      expect(created.status).toBe(201);
      expect(record(created).customFields).toEqual({ bm_note: 'run note' });

      const read = await as(admin).get(`payroll/runs/${record(created).id}`);
      expect(read.status).toBe(200);
      expect(record(read).customFields).toEqual({ bm_note: 'run note' });
    });

    it('employee levels (employeeLevels): create carries customFields, GET by id reads them back', async () => {
      const created = await as(admin).post('employee-levels', {
        name: `Level ${randomUUID().slice(0, 6)}`,
        rank: 1,
        customFields: { bm_note: 'level note' },
      });
      expect(created.status).toBe(201);
      expect(record(created).customFields).toEqual({ bm_note: 'level note' });

      const read = await as(admin).get(`employee-levels/${record(created).id}`);
      expect(read.status).toBe(200);
      expect(record(read).customFields).toEqual({ bm_note: 'level note' });
    });

    it('teams (teams): create carries customFields, GET by id reads them back', async () => {
      const created = await as(admin).post('teams', {
        name: `Team ${randomUUID().slice(0, 6)}`,
        customFields: { bm_note: 'team note' },
      });
      expect(created.status).toBe(201);
      expect(record(created).customFields).toEqual({ bm_note: 'team note' });

      const read = await as(admin).get(`teams/${record(created).id}`);
      expect(read.status).toBe(200);
      expect(record(read).customFields).toEqual({ bm_note: 'team note' });
    });

    it('leave policies (leavePolicies): create carries customFields, GET by id reads them back', async () => {
      const created = await as(admin).post('leave-policies', {
        name: `Leave policy ${randomUUID().slice(0, 6)}`,
        customFields: { bm_note: 'leave policy note' },
      });
      expect(created.status).toBe(201);
      expect(record(created).customFields).toEqual({
        bm_note: 'leave policy note',
      });

      const read = await as(admin).get(`leave-policies/${record(created).id}`);
      expect(read.status).toBe(200);
      expect(record(read).customFields).toEqual({
        bm_note: 'leave policy note',
      });
    });

    it('claim types (claimTypes): create carries customFields, GET by id reads them back', async () => {
      const created = await as(admin).post('claims/types', {
        name: `Claim type ${randomUUID().slice(0, 6)}`,
        customFields: { bm_note: 'claim type note' },
      });
      expect(created.status).toBe(201);
      expect(record(created).customFields).toEqual({
        bm_note: 'claim type note',
      });

      const read = await as(admin).get(`claims/types/${record(created).id}`);
      expect(read.status).toBe(200);
      expect(record(read).customFields).toEqual({
        bm_note: 'claim type note',
      });
    });

    it('claim requests (claimRequests, "claims"): create against an employee carries customFields, GET by id reads them back', async () => {
      const created = await as(admin).post('claims', {
        employeeId,
        title: `Claim ${randomUUID().slice(0, 6)}`,
        currencyCode: 'USD',
        customFields: { bm_note: 'claim note' },
      });
      expect(created.status).toBe(201);
      expect(record(created).customFields).toEqual({ bm_note: 'claim note' });

      const read = await as(admin).get(`claims/${record(created).id}`);
      expect(read.status).toBe(200);
      expect(record(read).customFields).toEqual({ bm_note: 'claim note' });
    });

    let policyId: string;

    it('policies (policies): create carries customFields, GET by id reads them back', async () => {
      const created = await as(admin).post('policies', {
        policyType: 'LEAVE',
        name: `Policy ${randomUUID().slice(0, 6)}`,
        version: 1,
        effectiveFrom: '2026-01-01',
        customFields: { bm_note: 'policy note' },
      });
      expect(created.status).toBe(201);
      expect(record(created).customFields).toEqual({ bm_note: 'policy note' });
      policyId = record(created).id;

      const read = await as(admin).get(`policies/${policyId}`);
      expect(read.status).toBe(200);
      expect(record(read).customFields).toEqual({ bm_note: 'policy note' });
    });

    it('policy assignments (policyAssignments): create against a policy carries customFields, read back through the list (no GET-by-id route exists)', async () => {
      expect(policyId).toBeDefined();
      const created = await as(admin).post('policies/assignments', {
        policyId,
        scopeType: 'TENANT',
        priority: 1,
        customFields: { bm_note: 'assignment note' },
      });
      expect(created.status).toBe(201);
      expect(record(created).customFields).toEqual({
        bm_note: 'assignment note',
      });

      const list = await as(admin).get(
        `policies/assignments?policyId=${policyId}`,
      );
      expect(list.status).toBe(200);
      const found = rows(list).find((row) => row.id === record(created).id);
      expect(found?.customFields).toEqual({ bm_note: 'assignment note' });
    });

    let candidateId: string;
    let jobOpeningId: string;

    it('recruitment candidates (candidates): create carries customFields, GET by id reads them back', async () => {
      const created = await as(admin).post('candidates', {
        firstName: 'Cand',
        lastName: `Idate${randomUUID().slice(0, 6)}`,
        email: `candidate-${randomUUID().slice(0, 8)}@example.invalid`,
        phone: '0000000000',
        customFields: { bm_note: 'candidate note' },
      });
      expect(created.status).toBe(201);
      expect(record(created).customFields).toEqual({
        bm_note: 'candidate note',
      });
      candidateId = record(created).id;

      const read = await as(admin).get(`candidates/${candidateId}`);
      expect(read.status).toBe(200);
      expect(record(read).customFields).toEqual({ bm_note: 'candidate note' });
    });

    it('job openings (jobOpenings): create carries customFields, GET by id reads them back', async () => {
      const created = await as(admin).post('job-openings', {
        title: `Opening ${randomUUID().slice(0, 6)}`,
        customFields: { bm_note: 'opening note' },
      });
      expect(created.status).toBe(201);
      expect(record(created).customFields).toEqual({
        bm_note: 'opening note',
      });
      jobOpeningId = record(created).id;

      const read = await as(admin).get(`job-openings/${jobOpeningId}`);
      expect(read.status).toBe(200);
      expect(record(read).customFields).toEqual({ bm_note: 'opening note' });
    });

    it('job applications (applications): create against a candidate and a job opening carries customFields, GET by id reads them back', async () => {
      expect(candidateId).toBeDefined();
      expect(jobOpeningId).toBeDefined();
      const created = await as(admin).post('applications', {
        candidateId,
        jobOpeningId,
        customFields: { bm_note: 'application note' },
      });
      expect(created.status).toBe(201);
      expect(record(created).customFields).toEqual({
        bm_note: 'application note',
      });

      const read = await as(admin).get(`applications/${record(created).id}`);
      expect(read.status).toBe(200);
      expect(record(read).customFields).toEqual({
        bm_note: 'application note',
      });
    });
  },
);
