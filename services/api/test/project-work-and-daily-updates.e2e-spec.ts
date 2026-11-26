/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return -- supertest response bodies are untyped JSON */
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
 * DP-MASTER WP-06.S2 (projects on universal work items) and WP-27 (daily updates)
 * against a real database, real guard, real HTTP. Roles are real: an employee at
 * SELF reach, a manager at BUSINESS_UNIT reach, HR at TENANT reach.
 */
describeWithDatabase()('Project work and daily updates (e2e)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  let tenantId: string;
  let unit: string;
  let projectId: string;
  let ana: HttpActor;
  let bo: HttpActor;
  let maya: HttpActor;
  let hana: HttpActor;
  const emp: Record<string, string> = {};
  const suffix = randomUUID().slice(0, 6);

  const call = (
    actor: HttpActor,
    method: 'get' | 'post' | 'patch' | 'put' | 'delete',
    path: string,
    body?: object,
  ) => {
    const req = request(app.getHttpServer())
      [method](path)
      .set('Authorization', `Bearer ${actor.token}`)
      .set('X-DijiPeople-App', 'web');
    return body ? req.send(body) : req;
  };

  const employeeKeys = [
    'work-items.read',
    'work-items.write',
    'contributions.read',
    'contributions.write',
    'daily-updates.read',
    'daily-updates.write',
  ];
  const managerKeys = [...employeeKeys, 'daily-updates.acknowledge'];
  const hrKeys = [...managerKeys, 'daily-updates.manage'];

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
    fixtures = new DbFixtures(prisma, 'pwdu');
    actors = new HttpActors(app, suffix);

    const tenant = await fixtures.createTenant('pwd');
    tenantId = tenant.id;
    const org = await fixtures.createOrganization(tenantId);
    unit = await fixtures.createBusinessUnit(tenantId, org);
    const mk = async (
      label: string,
      keys: string[],
      level: SecurityAccessLevel,
      privileges: SecurityPrivilege[],
    ) => {
      const made = await scopedActor(prisma, actors, {
        tenantId,
        unit,
        label,
        suffix,
        keys,
        level,
        privileges,
      });
      emp[label] = made.employeeId;
      return made.actor;
    };
    const rw = [SecurityPrivilege.READ, SecurityPrivilege.WRITE];
    ana = await mk('ana', employeeKeys, SecurityAccessLevel.SELF, rw);
    bo = await mk('bo', employeeKeys, SecurityAccessLevel.SELF, rw);
    maya = await mk('maya', managerKeys, SecurityAccessLevel.BUSINESS_UNIT, rw);
    hana = await mk('hana', hrKeys, SecurityAccessLevel.TENANT, [
      ...rw,
      SecurityPrivilege.MANAGE,
    ]);
    projectId = (
      await prisma.project.create({
        data: { tenantId, name: `Project ${suffix}` },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    try {
      await prisma.dailyUpdate.deleteMany({ where: { tenantId } });
      await prisma.dailyUpdatePolicy.deleteMany({ where: { tenantId } });
      await prisma.contributionEntry.deleteMany({ where: { tenantId } });
      await prisma.workItem.deleteMany({ where: { tenantId } });
      await prisma.project.deleteMany({ where: { tenantId } });
      await prisma.employee.deleteMany({ where: { tenantId } });
      await actors.cleanup();
      await fixtures.cleanup();
    } finally {
      await app.close();
    }
  });

  // ---------------------------------------------------------------- projects

  describe('a project on universal work items', () => {
    let milestoneId: string;
    const taskIds: string[] = [];

    it('a milestone belongs to a project; tasks roll up into it and inherit the project', async () => {
      const bad = await call(maya, 'post', '/work-items', {
        kind: 'MILESTONE',
        title: 'No project',
      });
      expect(bad.status).toBe(400);
      expect(bad.body.code).toBe('WORK_ITEM_MILESTONE_NEEDS_PROJECT');

      const made = await call(maya, 'post', '/work-items', {
        kind: 'MILESTONE',
        title: 'Beta',
        projectId,
        dueAt: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      });
      expect(made.status).toBe(201);
      milestoneId = made.body.id;

      for (const [title, owner] of [
        ['Design', emp.ana],
        ['Build', emp.bo],
        ['Test', emp.ana],
      ] as const) {
        const task = await call(maya, 'post', '/work-items', {
          kind: 'TASK',
          title,
          milestoneId,
          ownerEmployeeId: owner,
        });
        expect(task.status).toBe(201);
        // The project comes from the milestone; nobody has to repeat it.
        expect(task.body.projectId).toBe(projectId);
        taskIds.push(task.body.id);
      }
      const rolled = await call(
        maya,
        'get',
        `/work-items?milestoneId=${milestoneId}`,
      );
      expect(rolled.body.total).toBe(3);

      const otherProject = await prisma.project.create({
        data: { tenantId, name: `Other ${suffix}` },
        select: { id: true },
      });
      const mismatch = await call(maya, 'post', '/work-items', {
        kind: 'TASK',
        title: 'Wrong project',
        milestoneId,
        projectId: otherProject.id,
      });
      expect(mismatch.body.code).toBe('WORK_ITEM_MILESTONE_PROJECT');
      await prisma.project.delete({ where: { id: otherProject.id } });
    });

    it('a milestone cannot be finished while its tasks are open', async () => {
      await call(maya, 'post', `/work-items/${milestoneId}/transition`, {
        to: 'IN_PROGRESS',
      });
      const early = await call(
        maya,
        'post',
        `/work-items/${milestoneId}/transition`,
        { to: 'DONE' },
      );
      expect(early.status).toBe(409);
      expect(early.body.code).toBe('WORK_ITEM_MILESTONE_OPEN');
    });

    it('progress counts only what the caller can see, sums each person once, and reports nothing as null', async () => {
      // Ana and Bo share the second task; Ana estimates 60 and Bo 30.
      await call(
        maya,
        'put',
        `/work-items/${taskIds[0]}/contributors/${emp.ana}`,
        { estimateMinutes: 60, actualMinutes: 20 },
      );
      await call(
        maya,
        'put',
        `/work-items/${taskIds[1]}/contributors/${emp.bo}`,
        { estimateMinutes: 30 },
      );
      await call(
        maya,
        'put',
        `/work-items/${taskIds[1]}/contributors/${emp.ana}`,
        { estimateMinutes: 30 },
      );
      await call(ana, 'post', `/work-items/${taskIds[0]}/transition`, {
        to: 'IN_PROGRESS',
      });
      await call(ana, 'post', `/work-items/${taskIds[0]}/transition`, {
        to: 'DONE',
      });

      const manager = await call(
        maya,
        'get',
        `/work-items/progress?projectId=${projectId}`,
      );
      expect(manager.status).toBe(200);
      expect(manager.body.tasks).toMatchObject({
        total: 3,
        counted: 3,
        done: 1,
      });
      expect(manager.body.percentDone).toBe(33);
      expect(manager.body.effort).toMatchObject({
        estimateMinutes: 120,
        actualMinutes: 20,
      });
      const ms = manager.body.milestones[0];
      expect(ms).toMatchObject({
        title: 'Beta',
        tasks: 3,
        done: 1,
        percent: 33,
        overdue: false,
      });

      // Bo sees only what he owns or shares: the one task.
      const mine = await call(
        bo,
        'get',
        `/work-items/progress?projectId=${projectId}`,
      );
      expect(mine.body.tasks.total).toBe(1);

      // A project nobody has work in measures nothing, not 0%.
      const empty = await prisma.project.create({
        data: { tenantId, name: `Empty ${suffix}` },
        select: { id: true },
      });
      const none = await call(
        maya,
        'get',
        `/work-items/progress?projectId=${empty.id}`,
      );
      expect(none.body.percentDone).toBeNull();
      await prisma.project.delete({ where: { id: empty.id } });
    });

    it('approved timesheet hours are reported (zero until an approved entry names one of the tasks)', async () => {
      // NOT covered here: an approved TimesheetEntry carrying a task id. Hanging one
      // on a week and a day is heavy, and no screen sets taskId to a work item yet
      // (WP-06.S3), so the aggregate is exercised only for its empty case.
      const none = await call(
        maya,
        'get',
        `/work-items/progress?projectId=${projectId}`,
      );
      expect(none.body.approvedTimesheetHours).toBe('0');
    });

    it('moving a task out of its milestone, and finishing the rest, lets the milestone close', async () => {
      await call(maya, 'post', `/work-items/${taskIds[2]}/milestone`, {});
      await call(ana, 'post', `/work-items/${taskIds[1]}/transition`, {
        to: 'IN_PROGRESS',
      }).catch(() => undefined);
      await call(maya, 'post', `/work-items/${taskIds[1]}/transition`, {
        to: 'IN_PROGRESS',
      });
      await call(maya, 'post', `/work-items/${taskIds[1]}/transition`, {
        to: 'DONE',
      });
      const done = await call(
        maya,
        'post',
        `/work-items/${milestoneId}/transition`,
        { to: 'DONE' },
      );
      expect(done.status).toBe(201);
      expect(done.body.status).toBe('DONE');
    });

    it('workload shows committed minutes per person on a named, plain basis, with unestimated work counted apart', async () => {
      const from = new Date().toISOString();
      const to = new Date(Date.now() + 7 * 86_400_000).toISOString();
      const open = await call(maya, 'post', '/work-items', {
        kind: 'TASK',
        title: 'Estimated',
        projectId,
        ownerEmployeeId: emp.bo,
      });
      await call(
        maya,
        'put',
        `/work-items/${open.body.id}/contributors/${emp.bo}`,
        { estimateMinutes: 240, actualMinutes: 40 },
      );
      await call(maya, 'post', '/work-items', {
        kind: 'TASK',
        title: 'Not estimated',
        projectId,
        ownerEmployeeId: emp.bo,
      }).then((r) =>
        call(
          maya,
          'put',
          `/work-items/${r.body.id}/contributors/${emp.bo}`,
          {},
        ),
      );

      const res = await call(
        maya,
        'get',
        `/work-items/workload?from=${from}&to=${to}&projectId=${projectId}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.basis).toBe('NET_OF_LEAVE_AND_HOLIDAYS');
      const bo2 = res.body.people.find(
        (p: { employeeId: string }) => p.employeeId === emp.bo,
      );
      // 240 - 40 remaining committed; the unestimated item is unknown, not zero.
      expect(bo2).toMatchObject({
        committedMinutes: 200,
        unestimatedItems: expect.any(Number),
      });
      expect(bo2.unestimatedItems).toBeGreaterThanOrEqual(1);
      expect(res.body.capacityMinutes).toBeGreaterThan(0);

      const refused = await call(
        maya,
        'get',
        `/work-items/workload?from=${to}&to=${from}`,
      );
      expect(refused.body.code).toBe('WORK_ITEM_PERIOD_INVALID');
    });
  });

  // ----------------------------------------------------------- daily updates

  describe('daily updates', () => {
    const today = new Date().toISOString().slice(0, 10);
    let updateId: string;

    it('is off by default and asks nobody for anything; HR turns it on, employees cannot', async () => {
      const policy = await call(ana, 'get', '/daily-updates/policy');
      expect(policy.body).toMatchObject({
        enabled: false,
        workingDays: [1, 2, 3, 4, 5],
      });

      expect(
        (await call(ana, 'put', '/daily-updates/policy', { enabled: true }))
          .status,
      ).toBe(403);
      const on = await call(hana, 'put', '/daily-updates/policy', {
        enabled: true,
        deadlineMinutes: 1,
        timezone: 'UTC',
        workingDays: [1, 2, 3, 4, 5, 6, 7],
      });
      expect(on.status).toBe(200);
      expect(on.body).toMatchObject({ enabled: true, deadlineMinutes: 1 });
      expect(
        (
          await call(hana, 'put', '/daily-updates/policy', {
            timezone: 'Not/AZone',
          })
        ).body.code,
      ).toBe('DAILY_UPDATE_POLICY_INVALID');
    });

    it('drafts from evidence the employee already has, and names every source', async () => {
      // Evidence: a recorded contribution, an unplanned one, downtime, an in-progress task.
      const now = Date.now();
      const iso = (offsetMin: number) =>
        new Date(now - offsetMin * 60_000).toISOString();
      for (const body of [
        {
          workKind: 'TASK',
          measure: 'INTERVAL',
          startsAt: iso(180),
          endsAt: iso(120),
          timezone: 'UTC',
        },
        {
          workKind: 'OUTPUT',
          measure: 'QUANTITY',
          quantity: '80',
          unitKey: 'unit',
          occurredAt: iso(60),
          timezone: 'UTC',
        },
        {
          workKind: 'EVENT',
          measure: 'OCCURRENCE',
          category: 'UNPLANNED',
          occurredAt: iso(50),
          timezone: 'UTC',
        },
        {
          workKind: 'TASK',
          measure: 'INTERVAL',
          category: 'DOWNTIME',
          startsAt: iso(45),
          endsAt: iso(30),
          timezone: 'UTC',
        },
      ]) {
        const r = await call(bo, 'post', '/contributions', body);
        expect(r.status).toBe(201);
      }
      const own = await call(bo, 'post', '/work-items', {
        kind: 'TASK',
        title: 'Working on it',
      });
      await call(bo, 'post', `/work-items/${own.body.id}/transition`, {
        to: 'IN_PROGRESS',
      });

      const draft = await call(bo, 'post', '/daily-updates/draft', {});
      expect(draft.status).toBe(201);
      updateId = draft.body.id;
      expect(draft.body.status).toBe('DRAFT');
      const bySection = (s: string) =>
        draft.body.items.filter((i: { section: string }) => i.section === s);
      // Evidence from recorded contributions: a count stays a count, never minutes.
      expect(
        bySection('COMPLETED')
          .filter(
            (i: { contributionEntryId: string | null }) =>
              i.contributionEntryId,
          )
          .map((i: { text: string }) => i.text),
      ).toEqual([
        'Planned work (task): 60 min',
        'Planned work (output): 80 unit',
      ]);
      // The task Bo finished earlier today appears as completed work, by its title.
      expect(
        bySection('COMPLETED').map((i: { text: string }) => i.text),
      ).toContain('Build');
      expect(bySection('UNPLANNED')).toHaveLength(1);
      expect(bySection('BLOCKER')).toHaveLength(1);
      expect(
        bySection('IN_PROGRESS').map((i: { text: string }) => i.text),
      ).toEqual(['Working on it']);
      expect(
        draft.body.items.every(
          (i: { origin: string }) => i.origin === 'DRAFTED',
        ),
      ).toBe(true);
      expect(
        draft.body.items.every(
          (i: {
            contributionEntryId: string | null;
            workItemId: string | null;
          }) => i.contributionEntryId || i.workItemId,
        ),
      ).toBe(true);
    });

    it('drafting again adds only new evidence and keeps what the employee wrote; two updates for a day cannot exist', async () => {
      const saved = await call(bo, 'put', `/daily-updates/${updateId}`, {
        summary: 'Good day',
        items: [
          ...(
            await call(bo, 'get', `/daily-updates/${updateId}`)
          ).body.items.map(
            (i: {
              section: string;
              text: string;
              contributionEntryId: string | null;
              workItemId: string | null;
            }) => ({
              section: i.section,
              text: i.text,
              ...(i.contributionEntryId
                ? { contributionEntryId: i.contributionEntryId }
                : {}),
              ...(i.workItemId ? { workItemId: i.workItemId } : {}),
            }),
          ),
          {
            section: 'ACHIEVEMENT',
            text: 'Helped a colleague unblock a release',
          },
        ],
      });
      expect(saved.status).toBe(200);
      const before = saved.body.items.length;

      await call(bo, 'post', '/contributions', {
        workKind: 'TASK',
        measure: 'OCCURRENCE',
        occurredAt: new Date(Date.now() - 5 * 60_000).toISOString(),
        timezone: 'UTC',
      });
      const again = await call(bo, 'post', '/daily-updates/draft', {});
      expect(again.body.id).toBe(updateId);
      expect(again.body.items.length).toBe(before + 1);
      expect(
        again.body.items.filter(
          (i: { section: string }) => i.section === 'ACHIEVEMENT',
        ),
      ).toHaveLength(1);
      expect(
        await prisma.dailyUpdate.count({
          where: { tenantId, employeeId: emp.bo },
        }),
      ).toBe(1);
    });

    it("refuses a line that points at someone else's evidence, a future day, and an empty submit", async () => {
      const other = await call(ana, 'post', '/contributions', {
        workKind: 'TASK',
        measure: 'OCCURRENCE',
        occurredAt: new Date(Date.now() - 60_000).toISOString(),
        timezone: 'UTC',
      });
      const steal = await call(bo, 'put', `/daily-updates/${updateId}`, {
        items: [
          {
            section: 'COMPLETED',
            text: 'Not mine',
            contributionEntryId: other.body.id,
          },
        ],
      });
      expect(steal.body.code).toBe('DAILY_UPDATE_EVIDENCE_INVALID');

      const tomorrow = new Date(Date.now() + 86_400_000 * 2)
        .toISOString()
        .slice(0, 10);
      expect(
        (await call(bo, 'post', '/daily-updates/draft', { date: tomorrow }))
          .body.code,
      ).toBe('DAILY_UPDATE_FUTURE');

      const yesterday = new Date(Date.now() - 86_400_000 * 3)
        .toISOString()
        .slice(0, 10);
      const empty = await call(bo, 'post', '/daily-updates/draft', {
        date: yesterday,
      });
      expect(
        (await call(bo, 'post', `/daily-updates/${empty.body.id}/submit`)).body
          .code,
      ).toBe('DAILY_UPDATE_EMPTY');
    });

    it('submitting records lateness against the deadline; a second submit is refused', async () => {
      const submitted = await call(
        bo,
        'post',
        `/daily-updates/${updateId}/submit`,
      );
      expect(submitted.status).toBe(201);
      expect(submitted.body.status).toBe('SUBMITTED');
      // The deadline was set one minute past midnight, so today's update is late.
      expect(submitted.body.late).toBe(true);
      expect(
        (await call(bo, 'post', `/daily-updates/${updateId}/submit`)).status,
      ).toBe(409);
    });

    it("scope: Ana cannot see Bo's update; Maya sees the unit and acknowledges; nobody acknowledges their own", async () => {
      expect(
        (await call(ana, 'get', `/daily-updates/${updateId}`)).status,
      ).toBe(404);
      expect(
        (await call(ana, 'get', '/daily-updates')).body.items.map(
          (i: { id: string }) => i.id,
        ),
      ).not.toContain(updateId);
      expect(
        (await call(maya, 'get', `/daily-updates/${updateId}`)).status,
      ).toBe(200);

      expect(
        (await call(bo, 'post', `/daily-updates/${updateId}/acknowledge`))
          .status,
      ).toBe(403);
      const acked = await call(
        maya,
        'post',
        `/daily-updates/${updateId}/acknowledge`,
      );
      expect(acked.status).toBe(201);
      expect(acked.body).toMatchObject({ status: 'ACKNOWLEDGED' });
      expect(
        (await call(maya, 'post', `/daily-updates/${updateId}/acknowledge`))
          .status,
      ).toBe(409);
    });

    it('correcting after submission bumps the version, reopens review and is audited with before and after', async () => {
      const prevVersion = (await call(bo, 'get', `/daily-updates/${updateId}`))
        .body.version as number;
      const edit = await call(bo, 'put', `/daily-updates/${updateId}`, {
        summary: 'Corrected',
        items: [{ section: 'COMPLETED', text: 'Corrected line' }],
      });
      expect(edit.status).toBe(200);
      // The version is the concurrency token: every save moves it on.
      expect(edit.body).toMatchObject({
        status: 'SUBMITTED',
        acknowledgedAt: null,
      });
      expect(edit.body.version).toBeGreaterThan(prevVersion);
      const trail = await prisma.auditLog.findMany({
        where: {
          tenantId,
          entityType: 'DailyUpdate',
          entityId: updateId,
          action: 'DAILY_UPDATE_SAVED',
        },
      });
      expect(trail.length).toBeGreaterThanOrEqual(2);
    });

    it('two saves racing from the same version: one wins, the other is told to reload; a stale tab is refused', async () => {
      const current = (await call(bo, 'get', `/daily-updates/${updateId}`))
        .body;
      const lines = [{ section: 'COMPLETED', text: 'Race line' }];
      const race = await Promise.all([
        call(bo, 'put', `/daily-updates/${updateId}`, {
          expectedVersion: current.version,
          items: lines,
          summary: 'tab one',
        }),
        call(bo, 'put', `/daily-updates/${updateId}`, {
          expectedVersion: current.version,
          items: lines,
          summary: 'tab two',
        }),
      ]);
      expect(race.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(race.find((r) => r.status === 409)?.body.code).toBe(
        'DAILY_UPDATE_CHANGED',
      );
      // The stale tab, even alone, is refused.
      const stale = await call(bo, 'put', `/daily-updates/${updateId}`, {
        expectedVersion: current.version,
        items: lines,
      });
      expect(stale.status).toBe(409);
      // Reloading gives the current version and the save goes through.
      const fresh = (await call(bo, 'get', `/daily-updates/${updateId}`)).body;
      expect(
        (
          await call(bo, 'put', `/daily-updates/${updateId}`, {
            expectedVersion: fresh.version,
            items: lines,
          })
        ).status,
      ).toBe(200);
    });

    it('an acknowledgement is of the text that was read: it is refused if the author corrected it first', async () => {
      // Submitted and acknowledged earlier; a correction reopened it. Ack now succeeds once.
      const acked = await call(
        maya,
        'post',
        `/daily-updates/${updateId}/acknowledge`,
      );
      expect(acked.status).toBe(201);
      // A second reviewer's acknowledgement of the same, already-acknowledged text is refused.
      expect(
        (await call(hana, 'post', `/daily-updates/${updateId}/acknowledge`))
          .status,
      ).toBe(409);
      // The author corrects: it is back to SUBMITTED and acknowledgeable again, once.
      await call(bo, 'put', `/daily-updates/${updateId}`, {
        items: [{ section: 'COMPLETED', text: 'Corrected after review' }],
      });
      const again = await Promise.all([
        call(maya, 'post', `/daily-updates/${updateId}/acknowledge`),
        call(hana, 'post', `/daily-updates/${updateId}/acknowledge`),
      ]);
      expect(again.map((r) => r.status).sort()).toEqual([201, 409]);
    });

    it('nobody is owed an update on a day they are on approved leave', async () => {
      const day = today;
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
          employeeId: emp.ana,
          leaveTypeId: type.id,
          startDate: new Date(`${day}T00:00:00.000Z`),
          endDate: new Date(`${day}T00:00:00.000Z`),
          totalDays: '1',
          status: 'APPROVED',
        },
      });
      await call(hana, 'put', '/daily-updates/policy', {
        enabled: true,
        workingDays: [1, 2, 3, 4, 5, 6, 7],
        deadlineMinutes: 1,
      });
      const res = await call(maya, 'get', `/daily-updates/missing?date=${day}`);
      expect(res.body.due).toBe(true);
      expect(
        res.body.people.map((p: { employeeId: string }) => p.employeeId),
      ).not.toContain(emp.ana);
      expect(res.body.excludedOnLeaveOrHoliday).toBeGreaterThanOrEqual(1);
      await prisma.leaveRequest.deleteMany({ where: { tenantId } });
      await prisma.leaveType.deleteMany({ where: { tenantId } });
    });

    it('missing updates are listed for the people in reach, only after the deadline, only on working days, and never for the submitted', async () => {
      const day = today;
      const res = await call(maya, 'get', `/daily-updates/missing?date=${day}`);
      expect(res.status).toBe(200);
      expect(res.body.due).toBe(true);
      const names = res.body.people.map(
        (p: { employeeId: string }) => p.employeeId,
      );
      expect(names).toContain(emp.ana); // owes one, has not submitted
      expect(names).not.toContain(emp.bo); // submitted

      // Ana (SELF) can only ever see herself in that list.
      const self = await call(ana, 'get', `/daily-updates/missing?date=${day}`);
      expect(
        self.body.people.map((p: { employeeId: string }) => p.employeeId),
      ).toEqual([emp.ana]);

      // Off day: nobody is owed an update.
      await call(hana, 'put', '/daily-updates/policy', {
        workingDays: [1, 2, 3, 4, 5],
      });
      const sunday = '2026-11-08';
      expect(
        (await call(maya, 'get', `/daily-updates/missing?date=${sunday}`)).body,
      ).toMatchObject({ due: false, people: [] });

      // Turned off: nobody is asked.
      await call(hana, 'put', '/daily-updates/policy', { enabled: false });
      expect(
        (await call(maya, 'get', `/daily-updates/missing?date=${day}`)).body
          .due,
      ).toBe(false);
    });

    it('nothing crosses tenants', async () => {
      const other = await fixtures.createTenant('pwdx');
      const orgX = await fixtures.createOrganization(other.id);
      const unitX = await fixtures.createBusinessUnit(other.id, orgX);
      const made = await scopedActor(prisma, actors, {
        tenantId: other.id,
        unit: unitX,
        label: 'outsider',
        suffix,
        keys: hrKeys,
        level: SecurityAccessLevel.TENANT,
      });
      expect(
        (await call(made.actor, 'get', `/daily-updates/${updateId}`)).status,
      ).toBe(404);
      expect(
        (await call(made.actor, 'get', '/daily-updates')).body.items,
      ).toEqual([]);
      await prisma.employee.deleteMany({ where: { tenantId: other.id } });
    });
  });
});
