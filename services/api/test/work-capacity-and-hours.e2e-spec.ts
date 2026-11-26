/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return -- supertest response bodies are untyped JSON */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { HttpActors, type HttpActor } from './helpers/http-actors';
import { scopedActor } from './helpers/scoped-actors';

/**
 * DP-MASTER WP-06.S3: approved timesheet hours beside self-reported actuals, and
 * workload capacity that is net of approved leave and holidays. Real database,
 * real guard, real HTTP.
 */
describeWithDatabase()(
  'Work hours reconciliation and net capacity (e2e)',
  () => {
    jest.setTimeout(600_000);

    let moduleRef: TestingModule;
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let fixtures: DbFixtures;
    let actors: HttpActors;
    let tenantId: string;
    let unit: string;
    let ana: HttpActor;
    let bo: HttpActor;
    let maya: HttpActor;
    const emp: Record<string, string> = {};
    const suffix = randomUUID().slice(0, 6);

    const call = (
      actor: HttpActor,
      method: 'get' | 'post' | 'put',
      path: string,
      body?: object,
    ) => {
      const req = request(app.getHttpServer())
        [method](path)
        .set('Authorization', `Bearer ${actor.token}`)
        .set('X-DijiPeople-App', 'web');
      return body ? req.send(body) : req;
    };
    const keys = ['work-items.read', 'work-items.write'];
    const rw = [SecurityPrivilege.READ, SecurityPrivilege.WRITE];

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
      fixtures = new DbFixtures(prisma, 'wcap');
      actors = new HttpActors(app, suffix);
      const tenant = await fixtures.createTenant('wcap');
      tenantId = tenant.id;
      const org = await fixtures.createOrganization(tenantId);
      unit = await fixtures.createBusinessUnit(tenantId, org);
      const mk = async (label: string, level: SecurityAccessLevel) => {
        const made = await scopedActor(prisma, actors, {
          tenantId,
          unit,
          label,
          suffix,
          keys,
          level,
          privileges: rw,
        });
        emp[label] = made.employeeId;
        return made.actor;
      };
      ana = await mk('ana', SecurityAccessLevel.SELF);
      bo = await mk('bo', SecurityAccessLevel.SELF);
      maya = await mk('maya', SecurityAccessLevel.BUSINESS_UNIT);
    });

    afterAll(async () => {
      try {
        await prisma.timesheetEntry.deleteMany({ where: { tenantId } });
        await prisma.timesheet.deleteMany({ where: { tenantId } });
        await prisma.leaveRequest.deleteMany({ where: { tenantId } });
        await prisma.leaveType.deleteMany({ where: { tenantId } });
        await prisma.holidayCalendarAssignment.deleteMany({
          where: { tenantId },
        });
        await prisma.holiday.deleteMany({ where: { tenantId } });
        await prisma.holidayCalendar.deleteMany({ where: { tenantId } });
        await prisma.workItem.deleteMany({ where: { tenantId } });
        await prisma.employee.deleteMany({ where: { tenantId } });
        await actors.cleanup();
        await fixtures.cleanup();
      } finally {
        await app.close();
      }
    });

    const sheet = async (employeeId: string) =>
      prisma.timesheet.create({
        data: {
          tenantId,
          employeeId,
          periodStart: new Date('2026-11-01'),
          periodEnd: new Date('2026-11-30'),
          month: 11,
          year: 2026,
        },
        select: { id: true },
      });
    const book = (
      timesheetId: string,
      employeeId: string,
      taskId: string,
      hours: string,
      approvalStatus: 'APPROVED' | 'PENDING' | 'DRAFT',
    ) =>
      prisma.timesheetEntry.create({
        data: {
          tenantId,
          timesheetId,
          employeeId,
          taskId,
          approvalStatus,
          date: new Date('2026-11-03'),
          dayOfWeek: 'TUESDAY',
          hours,
        },
      });

    it('puts reported actuals beside approved timesheet hours and names the gap, never merging them', async () => {
      const made = await call(maya, 'post', '/work-items', {
        kind: 'TASK',
        title: 'Booked',
        ownerEmployeeId: emp.ana,
      });
      const id = made.body.id as string;
      await call(maya, 'put', `/work-items/${id}/contributors/${emp.ana}`, {
        estimateMinutes: 240,
        actualMinutes: 120,
      });
      const ts = await sheet(emp.ana);
      await book(ts.id, emp.ana, id, '1.50', 'APPROVED');
      await book(ts.id, emp.ana, id, '0.50', 'PENDING');
      await book(ts.id, emp.ana, id, '9.00', 'DRAFT'); // a draft is pending, not approved

      const res = await call(maya, 'get', `/work-items/${id}/hours`);
      expect(res.status).toBe(200);
      expect(res.body.people).toHaveLength(1);
      expect(res.body.people[0]).toMatchObject({
        employeeId: emp.ana,
        estimateMinutes: 240,
        reportedActualMinutes: 120,
        approvedTimesheetMinutes: 90,
        pendingTimesheetMinutes: 30 + 540,
        differenceMinutes: 30,
        reconciliation: 'REPORTED_NOT_YET_APPROVED',
      });

      // After the remaining time is approved the two agree.
      await call(maya, 'put', `/work-items/${id}/contributors/${emp.ana}`, {
        actualMinutes: 90,
      });
      expect(
        (await call(maya, 'get', `/work-items/${id}/hours`)).body.people[0]
          .reconciliation,
      ).toBe('MATCHES');
      await call(maya, 'put', `/work-items/${id}/contributors/${emp.ana}`, {
        actualMinutes: 60,
      });
      expect(
        (await call(maya, 'get', `/work-items/${id}/hours`)).body.people[0]
          .reconciliation,
      ).toBe('APPROVED_EXCEEDS_REPORTED');

      // Not visible to someone who cannot see the item.
      expect((await call(bo, 'get', `/work-items/${id}/hours`)).status).toBe(
        404,
      );
      // The owner sees their own line.
      expect(
        (await call(ana, 'get', `/work-items/${id}/hours`)).body.people.map(
          (p: { employeeId: string }) => p.employeeId,
        ),
      ).toEqual([emp.ana]);
    });

    it('a person with time booked but no reported actual is flagged, and nothing booked is said plainly', async () => {
      const made = await call(maya, 'post', '/work-items', {
        kind: 'TASK',
        title: 'Booked silently',
        ownerEmployeeId: emp.bo,
      });
      const id = made.body.id as string;
      await call(maya, 'put', `/work-items/${id}/contributors/${emp.bo}`, {
        estimateMinutes: 60,
      });
      expect(
        (await call(maya, 'get', `/work-items/${id}/hours`)).body.people[0]
          .reconciliation,
      ).toBe('NOTHING_BOOKED');
      const ts = await sheet(emp.bo);
      await book(ts.id, emp.bo, id, '1.00', 'APPROVED');
      expect(
        (await call(maya, 'get', `/work-items/${id}/hours`)).body.people[0],
      ).toMatchObject({
        reconciliation: 'NO_ACTUAL_REPORTED',
        differenceMinutes: null,
        approvedTimesheetMinutes: 60,
      });
    });

    it('workload capacity is net of approved leave and holidays, each day removed once, with the limits named', async () => {
      // A Monday-to-Sunday week well away from the other tests: 2027-02-01 is a Monday.
      const from = '2027-02-01T00:00:00.000Z';
      const to = '2027-02-08T00:00:00.000Z';
      const make = async (title: string, owner: string) => {
        const r = await call(maya, 'post', '/work-items', {
          kind: 'TASK',
          title,
          ownerEmployeeId: owner,
        });
        await call(
          maya,
          'put',
          `/work-items/${r.body.id}/contributors/${owner}`,
          { estimateMinutes: 480 },
        );
      };
      await make('Ana cap', emp.ana);
      await make('Bo cap', emp.bo);

      const type = await prisma.leaveType.create({
        data: {
          tenantId,
          name: `Annual ${suffix}`,
          code: `AN-${suffix}`,
          category: 'ANNUAL' as never,
        },
        select: { id: true },
      });
      // Ana is on leave Tuesday and Wednesday (2 weekdays).
      await prisma.leaveRequest.create({
        data: {
          tenantId,
          employeeId: emp.ana,
          leaveTypeId: type.id,
          startDate: new Date('2027-02-02'),
          endDate: new Date('2027-02-03'),
          totalDays: '2',
          status: 'APPROVED',
        },
      });
      // The tenant default calendar has a holiday on Wednesday (already a leave day
      // for Ana) and on Friday.
      const calendar = await prisma.holidayCalendar.create({
        data: { tenantId, name: `Cal ${suffix}` },
        select: { id: true },
      });
      for (const [name, day] of [
        ['Midweek', '2027-02-03'],
        ['Friday off', '2027-02-05'],
      ] as const) {
        await prisma.holiday.create({
          data: {
            tenantId,
            holidayCalendarId: calendar.id,
            name,
            holidayDate: new Date(day),
          },
        });
      }
      await prisma.holidayCalendarAssignment.create({
        data: { tenantId, holidayCalendarId: calendar.id, isDefault: true },
      });

      const res = await call(
        maya,
        'get',
        `/work-items/workload?from=${from}&to=${to}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.basis).toBe('NET_OF_LEAVE_AND_HOLIDAYS');
      expect(res.body.limits).toBe('WEEKDAYS_ONLY_NO_SHIFTS_NO_HALF_DAYS');
      const person = (employeeId: string) =>
        res.body.people.find(
          (p: { employeeId: string }) => p.employeeId === employeeId,
        );
      // Ana: 5 weekdays - 2 leave (Tue, Wed) - 1 holiday (Fri; Wed was already off) = 2 days.
      expect(person(emp.ana)).toMatchObject({
        leaveDays: 2,
        holidayDays: 1,
        netCapacityMinutes: 2 * 480,
        // 480 here + 180 left on the item booked in the first test (240 - 60).
        committedMinutes: 480 + 180,
        loadPercent: 69,
      });
      // Bo: 5 - 0 leave - 2 holidays = 3 days.
      expect(person(emp.bo)).toMatchObject({
        leaveDays: 0,
        holidayDays: 2,
        netCapacityMinutes: 3 * 480,
        // 480 here + 60 estimated on the second test's item.
        committedMinutes: 480 + 60,
        loadPercent: 38,
      });
      // The plain-week figure is still given, as a reference.
      expect(res.body.capacityMinutes).toBe(5 * 480);
    });

    it('a person with no capacity left in the period is unavailable, not a division by zero', async () => {
      const r = await call(maya, 'post', '/work-items', {
        kind: 'TASK',
        title: 'No room',
        ownerEmployeeId: emp.ana,
      });
      await call(
        maya,
        'put',
        `/work-items/${r.body.id}/contributors/${emp.ana}`,
        { estimateMinutes: 60 },
      );
      // 2027-02-02 and 2027-02-03 are Ana's leave days and the middle of the holiday week:
      // a two-day period is leave on both days.
      const res = await call(
        maya,
        'get',
        '/work-items/workload?from=2027-02-02T00:00:00.000Z&to=2027-02-04T00:00:00.000Z',
      );
      const ana2 = res.body.people.find(
        (p: { employeeId: string }) => p.employeeId === emp.ana,
      );
      expect(ana2.netCapacityMinutes).toBe(0);
      expect(ana2.loadPercent).toBeNull();
    });
  },
);
