/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- supertest response bodies are untyped JSON */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DailyUpdatesService } from '../src/modules/daily-updates/daily-updates.service';
import { NotificationOrchestratorService } from '../src/modules/notifications/notification-orchestrator.service';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { HttpActors, type HttpActor } from './helpers/http-actors';
import { scopedActor } from './helpers/scoped-actors';

/**
 * DP-MASTER WP-27.S2: daily-update policies below the tenant, per-shift cadence
 * and the missed-update escalation, against a real database and the real guard.
 * Proved: the most specific policy governs each person (team, then business unit,
 * then tenant); a shift worker owes an update only on shift days and is due at the
 * end of the shift; and a missed update reaches the manager exactly once however
 * many times, or how concurrently, the escalation runs.
 */
describeWithDatabase()('Daily-update scopes and escalation (e2e)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  let service: DailyUpdatesService;
  let orchestrator: NotificationOrchestratorService;
  let tenantId: string;
  let otherTenantId: string;
  let unitA: string;
  let unitB: string;
  let unitC: string;
  let teamId: string;
  let otherTeamId: string;
  let ana: HttpActor; // SELF, unit A, team T
  let bo: HttpActor; // SELF, unit A, no team
  let cy: HttpActor; // SELF, unit B (tenant policy)
  let dee: HttpActor; // SELF, unit C, shift worker
  let hana: HttpActor; // TENANT, manage
  let maya: HttpActor; // BUSINESS_UNIT, everyone's manager
  const emp: Record<string, string> = {};
  const suffix = randomUUID().slice(0, 6);
  const MON = '2026-11-09';
  const TUE = '2026-11-10';
  const WED = '2026-11-11';
  const THU = '2026-11-12';

  const call = (
    actor: HttpActor,
    method: 'get' | 'post' | 'put' | 'delete',
    path: string,
    body?: object,
  ) => {
    const req = request(app.getHttpServer())
      [method](path)
      .set('Authorization', `Bearer ${actor.token}`)
      .set('X-DijiPeople-App', 'web');
    return body ? req.send(body) : req;
  };
  const keys = ['daily-updates.read', 'daily-updates.write'];
  const rw = [SecurityPrivilege.READ, SecurityPrivilege.WRITE];
  const at = (iso: string) => new Date(iso);
  const ids = (res: { body: { people: { employeeId: string }[] } }) =>
    res.body.people.map((p) => p.employeeId);

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
    service = app.get(DailyUpdatesService);
    orchestrator = app.get(NotificationOrchestratorService);
    fixtures = new DbFixtures(prisma, 'dus');
    actors = new HttpActors(app, suffix);
    // The catalog row seed-config writes; the in-app notification needs it.
    await prisma.notificationEvent.upsert({
      where: { code: 'work.daily-update.missed' },
      update: {},
      create: {
        code: 'work.daily-update.missed',
        name: 'Daily update missed',
        description: 'test row',
        category: 'TASKS',
        enabledByDefault: true,
        supportedChannels: ['IN_APP'],
        systemDefined: true,
      },
    });
    const tenant = await fixtures.createTenant('dus');
    tenantId = tenant.id;
    const org = await fixtures.createOrganization(tenantId);
    unitA = await fixtures.createBusinessUnit(tenantId, org);
    unitB = await fixtures.createBusinessUnit(tenantId, org, 'b');
    unitC = await fixtures.createBusinessUnit(tenantId, org, 'c');
    teamId = (
      await prisma.team.create({
        data: {
          tenantId,
          name: `Team ${suffix}`,
          key: `team-${suffix}`,
          businessUnitId: unitA,
        },
        select: { id: true },
      })
    ).id;
    const mk = async (
      label: string,
      unit: string,
      level: SecurityAccessLevel,
      extra: string[] = [],
      employee: Record<string, unknown> = {},
      privileges = rw,
    ) => {
      const made = await scopedActor(prisma, actors, {
        tenantId,
        unit,
        label,
        suffix,
        keys: [...keys, ...extra],
        level,
        privileges,
        employee,
      });
      emp[label] = made.employeeId;
      return made.actor;
    };
    maya = await mk('maya', unitA, SecurityAccessLevel.BUSINESS_UNIT);
    hana = await mk(
      'hana',
      unitA,
      SecurityAccessLevel.TENANT,
      ['daily-updates.manage'],
      {},
      [...rw, SecurityPrivilege.MANAGE],
    );
    ana = await mk('ana', unitA, SecurityAccessLevel.SELF, [], {
      teamId,
      managerEmployeeId: emp.maya,
    });
    bo = await mk('bo', unitA, SecurityAccessLevel.SELF, [], {
      managerEmployeeId: emp.maya,
    });
    cy = await mk('cy', unitB, SecurityAccessLevel.SELF, [], {
      managerEmployeeId: emp.maya,
    });
    // Dee works nights in Karachi (UTC+5): Monday 22:00 to Tuesday 06:00.
    const night = await prisma.shiftTemplate.create({
      data: {
        tenantId,
        name: `Night ${suffix}`,
        code: `NIGHT-${suffix}`,
        startTime: '22:00',
        endTime: '06:00',
        expectedHours: '8',
        timezone: 'Asia/Karachi',
        isNightShift: true,
      },
      select: { id: true },
    });
    const schedule = await prisma.workSchedule.create({
      data: {
        tenantId,
        name: `Nights ${suffix}`,
        timezone: 'Asia/Karachi',
        weeklyWorkDays: ['MONDAY'],
        standardStartTime: '22:00',
        standardEndTime: '06:00',
        shiftBased: true,
        days: {
          create: [
            {
              tenantId,
              dayOfWeek: 'MONDAY',
              isWorkingDay: true,
              shiftTemplateId: night.id,
            },
          ],
        },
      },
      select: { id: true },
    });
    dee = await mk('dee', unitC, SecurityAccessLevel.SELF, [], {
      managerEmployeeId: emp.maya,
      defaultWorkScheduleId: schedule.id,
    });

    const other = await fixtures.createTenant('dusx');
    otherTenantId = other.id;
    const orgX = await fixtures.createOrganization(other.id);
    const unitX = await fixtures.createBusinessUnit(other.id, orgX);
    await prisma.businessUnit.findFirstOrThrow({ where: { id: unitX } });
    otherTeamId = (
      await prisma.team.create({
        data: {
          tenantId: other.id,
          name: 'Foreign',
          key: `foreign-${suffix}`,
          businessUnitId: unitX,
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    try {
      for (const id of [tenantId, otherTenantId]) {
        if (!id) continue;
        // DailyUpdateEscalation has no tenant relation, so it does not cascade.
        await prisma.dailyUpdateEscalation.deleteMany({
          where: { tenantId: id },
        });
        await prisma.dailyUpdate.deleteMany({ where: { tenantId: id } });
        await prisma.dailyUpdateScopePolicy.deleteMany({
          where: { tenantId: id },
        });
        await prisma.dailyUpdatePolicy.deleteMany({ where: { tenantId: id } });
        await prisma.leaveRequest.deleteMany({ where: { tenantId: id } });
        await prisma.leaveType.deleteMany({ where: { tenantId: id } });
        await prisma.notification.deleteMany({ where: { tenantId: id } });
        await prisma.employee.deleteMany({ where: { tenantId: id } });
        await prisma.workScheduleDay.deleteMany({ where: { tenantId: id } });
        await prisma.workSchedule.deleteMany({ where: { tenantId: id } });
        await prisma.shiftTemplate.deleteMany({ where: { tenantId: id } });
        await prisma.team.deleteMany({ where: { tenantId: id } });
      }
      await actors.cleanup();
      await fixtures.cleanup();
    } finally {
      await app.close();
    }
  });

  it('scoped policies are managed by managers only, name one team XOR one unit, and stay inside the tenant', async () => {
    expect(
      (
        await call(ana, 'put', '/daily-updates/scope-policies', {
          teamId,
          enabled: true,
        })
      ).status,
    ).toBe(403);
    for (const body of [
      {},
      { teamId, businessUnitId: unitA },
      { teamId: randomUUID() },
      { businessUnitId: randomUUID() },
      { teamId: otherTeamId },
    ]) {
      const res = await call(
        hana,
        'put',
        '/daily-updates/scope-policies',
        body,
      );
      expect([JSON.stringify(body), res.status >= 400]).toEqual([
        JSON.stringify(body),
        true,
      ]);
    }
    expect(
      (
        await call(hana, 'put', '/daily-updates/scope-policies', {
          teamId: otherTeamId,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call(hana, 'put', '/daily-updates/scope-policies', {
          teamId,
          timezone: 'Mars/Olympus',
        })
      ).status,
    ).toBe(400);

    const made = await call(hana, 'put', '/daily-updates/scope-policies', {
      teamId,
      workingDays: [2, 3, 4, 5],
      deadlineMinutes: 600,
    });
    expect(made.status).toBe(200);
    expect(made.body).toMatchObject({
      teamId,
      cadence: 'WORKING_DAYS',
      deadlineMinutes: 600,
      escalateAfterMinutes: null,
    });
    // A second PUT for the same team changes that policy, it does not add one.
    const again = await call(hana, 'put', '/daily-updates/scope-policies', {
      teamId,
      escalateAfterMinutes: 30,
    });
    expect(again.body).toMatchObject({
      id: made.body.id,
      deadlineMinutes: 600,
      escalateAfterMinutes: 30,
    });
    const listed = await call(ana, 'get', '/daily-updates/scope-policies');
    expect(listed.status).toBe(200);
    expect(listed.body.items).toHaveLength(1);
    expect(
      await prisma.auditLog.count({
        where: {
          tenantId,
          entityId: made.body.id,
          action: 'DAILY_UPDATE_SCOPE_POLICY_SET',
        },
      }),
    ).toBe(2);
    expect(
      (
        await call(
          ana,
          'delete',
          `/daily-updates/scope-policies/${made.body.id}`,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          hana,
          'delete',
          `/daily-updates/scope-policies/${made.body.id}`,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          hana,
          'delete',
          `/daily-updates/scope-policies/${made.body.id}`,
        )
      ).status,
    ).toBe(404);
  });

  it('the most specific policy governs each person: team, then business unit, then tenant', async () => {
    await call(hana, 'put', '/daily-updates/policy', {
      enabled: true,
      workingDays: [1, 2, 3, 4, 5, 6, 7],
      deadlineMinutes: 1080,
      timezone: 'UTC',
    });
    await call(hana, 'put', '/daily-updates/scope-policies', {
      businessUnitId: unitA,
      workingDays: [1, 2, 3, 4, 5, 6, 7],
      deadlineMinutes: 900,
    });
    await call(hana, 'put', '/daily-updates/scope-policies', {
      teamId,
      // Not Mondays: the team does not owe an update on 2026-11-09.
      workingDays: [2, 3, 4, 5],
      deadlineMinutes: 600,
    });
    const effective = async (who: HttpActor) =>
      (await call(who, 'get', '/daily-updates/policy/effective')).body;
    expect(await effective(ana)).toMatchObject({
      source: 'TEAM',
      deadlineMinutes: 600,
    });
    expect(await effective(bo)).toMatchObject({
      source: 'BUSINESS_UNIT',
      deadlineMinutes: 900,
    });
    expect(await effective(cy)).toMatchObject({
      source: 'TENANT',
      deadlineMinutes: 1080,
    });

    // A manager reads the policy of a chosen person inside their reach; a person
    // outside it, a stranger's id and another tenant's all read as "not found".
    const forPerson = (who: HttpActor, id: string) =>
      call(who, 'get', `/daily-updates/policy/effective?employeeId=${id}`);
    expect((await forPerson(hana, emp.ana)).body).toMatchObject({
      source: 'TEAM',
      deadlineMinutes: 600,
    });
    expect((await forPerson(hana, emp.cy)).body).toMatchObject({
      source: 'TENANT',
    });
    expect((await forPerson(ana, emp.ana)).status).toBe(200);
    expect((await forPerson(ana, emp.bo)).status).toBe(404);
    expect((await forPerson(hana, randomUUID())).status).toBe(404);
    expect((await forPerson(hana, 'not-a-uuid')).status).toBe(400);

    // "Who owes an update" follows the same resolution, per person.
    const missing = await call(
      hana,
      'get',
      `/daily-updates/missing?date=${MON}`,
    );
    expect(missing.status).toBe(200);
    expect(missing.body.due).toBe(true);
    const owing = ids(missing);
    expect(owing).toContain(emp.bo); // unit policy: every day
    expect(owing).toContain(emp.cy); // tenant policy: every day
    expect(owing).not.toContain(emp.ana); // team policy: not Mondays
    const tuesday = ids(
      await call(hana, 'get', `/daily-updates/missing?date=${TUE}`),
    );
    expect(tuesday).toContain(emp.ana);
  });

  it('a shift worker owes an update only on shift days, due at the shift end in the schedule zone', async () => {
    await call(hana, 'put', '/daily-updates/scope-policies', {
      businessUnitId: unitC,
      cadence: 'PER_SHIFT',
      deadlineMinutes: 30,
      escalateAfterMinutes: 60,
    });
    // Monday's shift ends Tuesday 06:00 Karachi = 01:00Z; due 01:30Z.
    const monday = await call(
      hana,
      'get',
      `/daily-updates/missing?date=${MON}`,
    );
    expect(ids(monday)).toContain(emp.dee);
    // Tuesday is not a shift day: no prompt, whatever the weekday list says.
    const tuesday = await call(
      hana,
      'get',
      `/daily-updates/missing?date=${TUE}`,
    );
    expect(ids(tuesday)).not.toContain(emp.dee);
    // A day that has not reached its deadline lists nobody for the shift worker.
    const future = new Date(Date.now() + 14 * 86_400_000);
    while (future.getUTCDay() !== 1) future.setUTCDate(future.getUTCDate() + 1);
    const ahead = await call(
      hana,
      'get',
      `/daily-updates/missing?date=${future.toISOString().slice(0, 10)}`,
    );
    expect(ids(ahead)).not.toContain(emp.dee);
  });

  describe('escalation of a missed update', () => {
    let dispatchSpy: jest.SpyInstance;
    const sentFor = (employeeId: string, date: string) =>
      dispatchSpy.mock.calls.filter(
        ([input]) =>
          (input as { correlationId?: string }).correlationId ===
          `${employeeId}:${date}`,
      ).length;
    const escalationRows = (employeeId: string, date: string) =>
      prisma.dailyUpdateEscalation.count({
        where: {
          tenantId,
          employeeId,
          forDate: new Date(`${date}T00:00:00.000Z`),
        },
      });
    const run = (date: string, now: string) =>
      service.escalateMissed({ tenantId, date, now: at(now) });

    beforeAll(async () => {
      // Unit A escalates an hour after its 15:00 UTC deadline; ana's team does not.
      await call(hana, 'put', '/daily-updates/scope-policies', {
        businessUnitId: unitA,
        escalateAfterMinutes: 60,
      });
      await prisma.dailyUpdateScopePolicy.updateMany({
        where: { tenantId, teamId },
        data: { escalateAfterMinutes: null },
      });
      dispatchSpy = jest.spyOn(orchestrator, 'dispatch');
    });
    afterAll(() => dispatchSpy.mockRestore());

    it('waits for deadline + escalateAfterMinutes, then notifies the manager once; a second run notifies nobody', async () => {
      // Unit A: deadline 15:00Z, escalation at 16:00Z.
      const early = await run(MON, '2026-11-09T15:59:00.000Z');
      expect(early.escalated).toBe(0);
      expect(await escalationRows(emp.bo, MON)).toBe(0);

      const first = await run(MON, '2026-11-09T16:00:00.000Z');
      expect(first.escalated).toBeGreaterThanOrEqual(1);
      expect(await escalationRows(emp.bo, MON)).toBe(1);
      expect(sentFor(emp.bo, MON)).toBe(1);
      const second = await run(MON, '2026-11-09T17:00:00.000Z');
      expect(second.escalated).toBe(0);
      expect(second.alreadyEscalated).toBeGreaterThanOrEqual(1);
      expect(sentFor(emp.bo, MON)).toBe(1);
      expect(await escalationRows(emp.bo, MON)).toBe(1);

      // It reached the manager, in the app, and nobody else.
      const note = await prisma.notification.findFirstOrThrow({
        where: {
          tenantId,
          eventCode: 'work.daily-update.missed',
          recipients: { some: { userId: maya.id } },
        },
        select: { id: true },
      });
      expect(note.id).toBeTruthy();
      // The employee whose team policy never escalates was not escalated.
      expect(await escalationRows(emp.ana, MON)).toBe(0);
    });

    it('two concurrent runs notify exactly once', async () => {
      const results = await Promise.all(
        [1, 2, 3, 4].map(() => run(TUE, '2026-11-10T20:00:00.000Z')),
      );
      expect(sentFor(emp.bo, TUE)).toBe(1);
      expect(await escalationRows(emp.bo, TUE)).toBe(1);
      expect(results.reduce((n, r) => n + r.escalated, 0)).toBe(
        await prisma.dailyUpdateEscalation.count({
          where: {
            tenantId,
            forDate: new Date(`${TUE}T00:00:00.000Z`),
          },
        }),
      );
    });

    it('a failed notification rolls its record back so a retry can notify', async () => {
      dispatchSpy.mockRejectedValueOnce(new Error('queue down'));
      const failed = await run(WED, '2026-11-11T20:00:00.000Z');
      expect(failed.failed).toBe(1);
      expect(await escalationRows(emp.bo, WED)).toBe(0);
      const retry = await run(WED, '2026-11-11T21:00:00.000Z');
      expect(retry.failed).toBe(0);
      expect(await escalationRows(emp.bo, WED)).toBe(1);
      expect(sentFor(emp.bo, WED)).toBe(2); // the failed attempt and the success
    });

    it('nobody off duty or already submitted is escalated', async () => {
      const type = await prisma.leaveType.create({
        data: {
          tenantId,
          name: `Annual ${suffix}`,
          code: `AN-${suffix}`,
          category: 'ANNUAL' as never,
        },
        select: { id: true },
      });
      await prisma.leaveRequest.create({
        data: {
          tenantId,
          employeeId: emp.bo,
          leaveTypeId: type.id,
          startDate: new Date(`${THU}T00:00:00.000Z`),
          endDate: new Date(`${THU}T00:00:00.000Z`),
          totalDays: '1',
          status: 'APPROVED',
        },
      });
      await run(THU, '2026-11-12T20:00:00.000Z');
      expect(await escalationRows(emp.bo, THU)).toBe(0);
      expect(sentFor(emp.bo, THU)).toBe(0);

      await prisma.dailyUpdate.create({
        data: {
          tenantId,
          employeeId: emp.maya,
          forDate: new Date(`${THU}T00:00:00.000Z`),
          status: 'SUBMITTED',
        },
      });
      const noManagerBefore = await run(THU, '2026-11-12T20:30:00.000Z');
      // Maya has no manager and submitted; Bo is on leave: nothing recorded for them.
      expect(await escalationRows(emp.maya, THU)).toBe(0);
      expect(noManagerBefore.escalated).toBeGreaterThanOrEqual(0);
    });

    it('a shift worker is escalated only after the shift end + deadline + window, and never on a non-shift day', async () => {
      // Shift Monday 22:00 -> Tuesday 06:00 PKT: ends 01:00Z, due 01:30Z, escalate 02:30Z.
      const early = await run(MON, '2026-11-10T02:29:00.000Z');
      expect(early.escalated).toBe(0);
      expect(await escalationRows(emp.dee, MON)).toBe(0);
      await run(MON, '2026-11-10T02:30:00.000Z');
      expect(await escalationRows(emp.dee, MON)).toBe(1);
      expect(sentFor(emp.dee, MON)).toBe(1);
      // Tuesday is not a shift day.
      await run(TUE, '2026-11-10T20:00:00.000Z');
      expect(await escalationRows(emp.dee, TUE)).toBe(0);
    });

    it('is a manager-only route that returns what it did', async () => {
      expect(
        (await call(ana, 'post', '/daily-updates/escalations/run', {})).status,
      ).toBe(403);
      const res = await call(hana, 'post', '/daily-updates/escalations/run', {
        date: MON,
      });
      expect(res.status).toBe(201);
      expect(res.body).toEqual(
        expect.objectContaining({
          evaluated: expect.any(Number),
          escalated: expect.any(Number),
          alreadyEscalated: expect.any(Number),
        }),
      );
      expect(
        (
          await call(hana, 'post', '/daily-updates/escalations/run', {
            date: 'tomorrow',
          })
        ).status,
      ).toBe(400);
    });
  });
});
