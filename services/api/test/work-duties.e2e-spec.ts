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
 * DP-MASTER WP-36.S1: duties, checklists and handovers, against a real database,
 * real guard, real HTTP. The point of the suite: generation is idempotent even
 * under concurrency, nobody off that day is given the duty, an occurrence keeps its
 * own copy of the checklist, a required check really blocks completion, and a
 * handover is acknowledged only by the one it is addressed to.
 */
describeWithDatabase()('Work duties (e2e)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  let tenantId: string;
  let otherTenantId: string;
  let ana: HttpActor; // employee, SELF
  let bo: HttpActor; // employee, SELF, member of the team
  let cy: HttpActor; // employee, SELF, another unit
  let maya: HttpActor; // manager, BUSINESS_UNIT of unit A
  let outsider: HttpActor; // another tenant
  let teamId: string;
  const emp: Record<string, string> = {};
  const suffix = randomUUID().slice(0, 6);
  const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

  const call = (
    actor: HttpActor,
    method: 'get' | 'post' | 'patch',
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
    fixtures = new DbFixtures(prisma, 'wduty');
    actors = new HttpActors(app, suffix);
    const tenant = await fixtures.createTenant('wduty');
    tenantId = tenant.id;
    const org = await fixtures.createOrganization(tenantId);
    const unitA = await fixtures.createBusinessUnit(tenantId, org);
    const unitB = await fixtures.createBusinessUnit(tenantId, org, 'other');
    teamId = (
      await prisma.team.create({
        data: { tenantId, name: `Night ${suffix}`, key: `night-${suffix}` },
        select: { id: true },
      })
    ).id;
    const mk = async (
      label: string,
      unit: string,
      level: SecurityAccessLevel,
      employee: { teamId?: string } = {},
    ) => {
      const made = await scopedActor(prisma, actors, {
        tenantId,
        unit,
        label,
        suffix,
        keys,
        level,
        privileges: rw,
        employee,
      });
      emp[label] = made.employeeId;
      return made.actor;
    };
    ana = await mk('ana', unitA, SecurityAccessLevel.SELF);
    bo = await mk('bo', unitA, SecurityAccessLevel.SELF, { teamId });
    cy = await mk('cy', unitB, SecurityAccessLevel.SELF);
    maya = await mk('maya', unitA, SecurityAccessLevel.BUSINESS_UNIT);
    const other = await fixtures.createTenant('wdutyx');
    otherTenantId = other.id;
    const orgX = await fixtures.createOrganization(other.id);
    const unitX = await fixtures.createBusinessUnit(other.id, orgX);
    outsider = (
      await scopedActor(prisma, actors, {
        tenantId: other.id,
        unit: unitX,
        label: 'outsider',
        suffix,
        keys,
        level: SecurityAccessLevel.TENANT,
        privileges: rw,
      })
    ).actor;
  });

  afterAll(async () => {
    try {
      for (const id of [tenantId, otherTenantId]) {
        if (!id) continue;
        await prisma.dutyHandover.deleteMany({ where: { tenantId: id } });
        const occurrences = await prisma.dutyOccurrence.findMany({
          where: { tenantId: id },
          select: { workItemId: true },
        });
        await prisma.dutyTemplate.deleteMany({ where: { tenantId: id } });
        await prisma.workItem.deleteMany({
          where: {
            tenantId: id,
            id: { in: occurrences.map((o) => o.workItemId) },
          },
        });
        await prisma.leaveRequest.deleteMany({ where: { tenantId: id } });
        await prisma.leaveType.deleteMany({ where: { tenantId: id } });
        await prisma.workItem.deleteMany({ where: { tenantId: id } });
        await prisma.employee.deleteMany({ where: { tenantId: id } });
        await prisma.team.deleteMany({ where: { tenantId: id } });
      }
      await actors.cleanup();
      await fixtures.cleanup();
    } finally {
      await app.close();
    }
  });

  let counter = 0;
  const template = async (
    actor: HttpActor,
    over: Record<string, unknown> = {},
  ) => {
    counter += 1;
    const key = `duty-${counter}-${suffix}`;
    const made = await call(actor, 'post', '/work-duties/templates', {
      key,
      name: `Duty ${counter} ${suffix}`,
      weekdays: ALL_DAYS,
      timezone: 'Asia/Karachi',
      dueMinutes: 480,
      assigneeEmployeeId: emp.ana,
      ...over,
    });
    expect(made.status).toBe(201);
    return { id: made.body.id as string, key, name: made.body.name as string };
  };
  const generate = async (actor: HttpActor, date: string) => {
    const res = await call(actor, 'post', '/work-duties/generate', { date });
    expect(res.status).toBe(201);
    return res.body;
  };
  const createdFor = (body: any, key: string) =>
    body.created.find((c: any) => c.templateKey === key);

  it('template CRUD validates input, keeps keys unique per tenant, and respects write scope', async () => {
    const t = await template(maya, {
      checklist: [
        { label: 'Lock the till' },
        { label: 'Note', required: false },
      ],
    });
    const got = await call(maya, 'get', `/work-duties/templates/${t.id}`);
    expect(got.status).toBe(200);
    expect(got.body.checklist.map((c: any) => c.label)).toEqual([
      'Lock the till',
      'Note',
    ]);
    expect(got.body.checklist[1].required).toBe(false);

    // Key is unique per tenant.
    const dup = await call(maya, 'post', '/work-duties/templates', {
      key: t.key,
      name: 'again',
      weekdays: [1],
      timezone: 'UTC',
    });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('DUTY_TEMPLATE_KEY_TAKEN');

    // Validation.
    const bad = (over: object) =>
      call(maya, 'post', '/work-duties/templates', {
        key: `bad-${randomUUID().slice(0, 6)}`,
        name: 'bad',
        weekdays: [1],
        timezone: 'UTC',
        ...over,
      });
    expect((await bad({ timezone: 'Mars/Olympus' })).body.code).toBe(
      'DUTY_TIMEZONE_INVALID',
    );
    expect((await bad({ weekdays: [0] })).status).toBe(400);
    expect((await bad({ weekdays: [8] })).status).toBe(400);
    expect((await bad({ weekdays: [] })).status).toBe(400);
    expect((await bad({ weekdays: [1, 1] })).status).toBe(400);
    expect((await bad({ dueMinutes: 1440 })).status).toBe(400);
    expect((await bad({ startMinutes: -1 })).status).toBe(400);
    expect((await bad({ key: 'Has Spaces' })).status).toBe(400);

    // A SELF-level actor cannot assign someone else; can assign themselves.
    const other = await call(ana, 'post', '/work-duties/templates', {
      key: `ana-bo-${suffix}`,
      name: 'for bo',
      weekdays: [1],
      timezone: 'UTC',
      assigneeEmployeeId: emp.bo,
    });
    expect(other.status).toBe(403);
    expect(other.body.code).toBe('DUTY_OUT_OF_SCOPE');
    const own = await call(ana, 'post', '/work-duties/templates', {
      key: `ana-self-${suffix}`,
      name: 'for ana',
      weekdays: [1],
      timezone: 'UTC',
      assigneeEmployeeId: emp.ana,
    });
    expect(own.status).toBe(201);
    // ...nor re-assign an existing one to someone else.
    expect(
      (
        await call(ana, 'patch', `/work-duties/templates/${own.body.id}`, {
          assigneeEmployeeId: emp.bo,
        })
      ).status,
    ).toBe(403);

    // Update, then deactivate; never deleted.
    const upd = await call(maya, 'patch', `/work-duties/templates/${t.id}`, {
      name: 'Renamed',
      weekdays: [5, 1],
    });
    expect(upd.status).toBe(200);
    expect(upd.body.weekdays).toEqual([1, 5]);
    const off = await call(
      maya,
      'post',
      `/work-duties/templates/${t.id}/deactivate`,
    );
    expect(off.body.isActive).toBe(false);
    expect(
      (await call(maya, 'post', `/work-duties/templates/${t.id}/deactivate`))
        .status,
    ).toBe(201);
    const active = await call(
      maya,
      'get',
      '/work-duties/templates?active=true',
    );
    expect(active.body.items.map((x: any) => x.id)).not.toContain(t.id);
    const all = await call(maya, 'get', '/work-duties/templates');
    expect(all.body.items.map((x: any) => x.id)).toContain(t.id);

    // Another tenant, and an unrelated SELF colleague, cannot see or change it.
    expect(
      (await call(outsider, 'get', `/work-duties/templates/${t.id}`)).status,
    ).toBe(404);
    expect(
      (
        await call(outsider, 'patch', `/work-duties/templates/${t.id}`, {
          name: 'x',
        })
      ).status,
    ).toBe(404);
    expect(
      (await call(bo, 'get', `/work-duties/templates/${t.id}`)).status,
    ).toBe(404);
  });

  it('generation is idempotent and concurrent calls create exactly one occurrence and one work item', async () => {
    const t = await template(maya);
    const date = '2026-12-07';
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        call(maya, 'post', '/work-duties/generate', { date }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    const createdCount = results.filter((r) =>
      createdFor(r.body, t.key),
    ).length;
    expect(createdCount).toBe(1);

    expect(
      await prisma.dutyOccurrence.count({
        where: { tenantId, dutyTemplateId: t.id },
      }),
    ).toBe(1);
    // No orphan work item from a lost race.
    expect(
      await prisma.workItem.count({
        where: {
          tenantId,
          kind: 'DUTY_OCCURRENCE',
          title: `${t.name} - ${date}`,
        },
      }),
    ).toBe(1);

    const again = await generate(maya, date);
    expect(createdFor(again, t.key)).toBeUndefined();
    expect(again.existing.some((e: any) => e.templateKey === t.key)).toBe(true);

    // The occurrence is a work item owned by the assignee, due in the template zone.
    const link = await prisma.dutyOccurrence.findFirstOrThrow({
      where: { tenantId, dutyTemplateId: t.id },
      select: { workItemId: true },
    });
    const occurrence = {
      workItem: await prisma.workItem.findFirstOrThrow({
        where: { id: link.workItemId, tenantId },
        select: { ownerEmployeeId: true, dueAt: true },
      }),
    };
    expect(occurrence.workItem.ownerEmployeeId).toBe(emp.ana);
    // 08:00 on 2026-12-07 in Karachi (UTC+5).
    expect(occurrence.workItem.dueAt?.toISOString()).toBe(
      '2026-12-07T03:00:00.000Z',
    );

    // A date that is not a real date, and a template that does not recur that day.
    expect(
      (
        await call(maya, 'post', '/work-duties/generate', {
          date: '2026-02-30',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(maya, 'post', '/work-duties/generate', {
          date: '07/12/2026',
        })
      ).status,
    ).toBe(400);
    const weekly = await template(maya, { weekdays: [3] }); // Wednesdays only
    const monday = await generate(maya, '2026-12-14');
    expect(createdFor(monday, weekly.key)).toBeUndefined();
    expect(monday.skipped.find((s: any) => s.key === weekly.key)?.reason).toBe(
      'NOT_ON_THIS_WEEKDAY',
    );
  });

  it('a SELF actor cannot generate a duty assigned to someone outside their reach', async () => {
    const t = await template(maya, { assigneeEmployeeId: emp.bo });
    const date = '2026-12-15';
    const res = await generate(ana, date);
    expect(createdFor(res, t.key)).toBeUndefined();
    expect(res.skipped.find((s: any) => s.key === t.key)?.reason).toBe(
      'OUT_OF_SCOPE',
    );
    expect(
      await prisma.dutyOccurrence.count({
        where: { tenantId, dutyTemplateId: t.id },
      }),
    ).toBe(0);
  });

  it('an assignee on approved leave, or not scheduled that day, leaves the occurrence unassigned with the reason', async () => {
    const leaveType = await prisma.leaveType.create({
      data: {
        tenantId,
        name: `Annual ${suffix}`,
        code: `AL${suffix}`,
        category: 'ANNUAL',
      },
      select: { id: true },
    });
    await prisma.leaveRequest.create({
      data: {
        tenantId,
        employeeId: emp.ana,
        leaveTypeId: leaveType.id,
        startDate: new Date('2026-12-08T00:00:00.000Z'),
        endDate: new Date('2026-12-08T00:00:00.000Z'),
        totalDays: 1,
        status: 'APPROVED',
      },
    });
    // A pending request does not count.
    await prisma.leaveRequest.create({
      data: {
        tenantId,
        employeeId: emp.ana,
        leaveTypeId: leaveType.id,
        startDate: new Date('2026-12-09T00:00:00.000Z'),
        endDate: new Date('2026-12-09T00:00:00.000Z'),
        totalDays: 1,
        status: 'PENDING',
      },
    });
    const t = await template(maya);

    const onLeave = await generate(maya, '2026-12-08');
    const entry = createdFor(onLeave, t.key);
    expect(entry).toMatchObject({
      assigned: false,
      ownerEmployeeId: null,
      unassignedReason: 'LEAVE',
    });
    const item = await prisma.workItem.findFirstOrThrow({
      where: { tenantId, id: entry.workItemId },
      select: { ownerEmployeeId: true, kind: true },
    });
    expect(item).toMatchObject({
      ownerEmployeeId: null,
      kind: 'DUTY_OCCURRENCE',
    });

    // The next day is a working day and the pending request is not leave: assigned.
    const working = await generate(maya, '2026-12-09');
    expect(createdFor(working, t.key)).toMatchObject({
      assigned: true,
      ownerEmployeeId: emp.ana,
    });

    // 2026-12-12 is a Saturday: no schedule applies, so the plain Mon-Fri week does.
    const saturday = await generate(maya, '2026-12-12');
    expect(createdFor(saturday, t.key)).toMatchObject({
      assigned: false,
      unassignedReason: 'NOT_SCHEDULED',
    });

    // A template with no assignee is generated unassigned and says why.
    const nobody = await template(maya, { assigneeEmployeeId: undefined });
    const nobodyRes = await generate(maya, '2026-12-09');
    expect(createdFor(nobodyRes, nobody.key)).toMatchObject({
      assigned: false,
      unassignedReason: 'NO_ASSIGNEE_ON_TEMPLATE',
    });
  });

  it('an occurrence keeps its own checklist when the template is edited later', async () => {
    const t = await template(maya, {
      checklist: [
        { label: 'A', required: true },
        { label: 'B', required: false },
      ],
    });
    const first = createdFor(await generate(maya, '2026-12-16'), t.key);
    const edit = await call(maya, 'patch', `/work-duties/templates/${t.id}`, {
      checklist: [{ label: 'X' }],
    });
    expect(edit.status).toBe(200);
    expect(edit.body.checklist.map((c: any) => c.label)).toEqual(['X']);

    const old = await call(
      maya,
      'get',
      `/work-duties/occurrences/${first.occurrenceId}`,
    );
    expect(old.body.checks.map((c: any) => c.label)).toEqual(['A', 'B']);
    expect(old.body.checks.map((c: any) => c.required)).toEqual([true, false]);

    const next = createdFor(await generate(maya, '2026-12-17'), t.key);
    const fresh = await call(
      maya,
      'get',
      `/work-duties/occurrences/${next.occurrenceId}`,
    );
    expect(fresh.body.checks.map((c: any) => c.label)).toEqual(['X']);
  });

  it('a required check blocks completion; completing and unchecking are idempotent and audited by who did them', async () => {
    const t = await template(maya, {
      checklist: [{ label: 'Must' }, { label: 'Nice', required: false }],
    });
    const made = createdFor(await generate(maya, '2026-12-11'), t.key);
    const occId = made.occurrenceId as string;
    const read = () => call(ana, 'get', `/work-duties/occurrences/${occId}`);
    const checks = (await read()).body.checks as any[];
    const must = checks.find((c) => c.label === 'Must');
    const nice = checks.find((c) => c.label === 'Nice');

    const blocked = await call(
      ana,
      'post',
      `/work-duties/occurrences/${occId}/complete`,
    );
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('DUTY_REQUIRED_CHECKS_INCOMPLETE');
    // Finishing only the optional one still does not unblock it.
    await call(ana, 'post', `/work-duties/checks/${nice.id}/complete`, {});
    expect(
      (await call(ana, 'post', `/work-duties/occurrences/${occId}/complete`))
        .status,
    ).toBe(409);
    // The generic work-item route cannot be used to go round the guard.
    await call(ana, 'post', `/work-items/${made.workItemId}/transition`, {
      to: 'IN_PROGRESS',
    });
    const viaGeneric = await call(
      ana,
      'post',
      `/work-items/${made.workItemId}/transition`,
      { to: 'DONE' },
    );
    expect(viaGeneric.status).toBe(409);
    expect(viaGeneric.body.code).toBe('WORK_DUTY_REQUIRED_CHECKS_OPEN');
    expect(
      (
        await prisma.workItem.findFirstOrThrow({
          where: { id: made.workItemId },
        })
      ).status,
    ).not.toBe('DONE');

    // A colleague with no reach over the item cannot touch it.
    expect(
      (await call(bo, 'post', `/work-duties/checks/${must.id}/complete`, {}))
        .status,
    ).toBe(404);
    expect(
      (await call(cy, 'post', `/work-duties/occurrences/${occId}/complete`))
        .status,
    ).toBe(404);
    expect(
      (
        await call(
          outsider,
          'post',
          `/work-duties/checks/${must.id}/complete`,
          {},
        )
      ).status,
    ).toBe(404);

    const done = await call(
      ana,
      'post',
      `/work-duties/checks/${must.id}/complete`,
      {
        note: 'locked',
      },
    );
    expect(done.status).toBe(201);
    const stamp = done.body.checks.find((c: any) => c.id === must.id);
    expect(stamp.completedAt).toBeTruthy();
    expect(stamp.completedById).toBe(ana.id);
    expect(stamp.note).toBe('locked');
    // The same move twice keeps the first completion.
    const twice = await call(
      ana,
      'post',
      `/work-duties/checks/${must.id}/complete`,
      {
        note: 'other',
      },
    );
    expect(
      twice.body.checks.find((c: any) => c.id === must.id).completedAt,
    ).toBe(stamp.completedAt);
    // Unchecking re-blocks completion.
    const undone = await call(
      ana,
      'post',
      `/work-duties/checks/${must.id}/uncomplete`,
    );
    expect(
      undone.body.checks.find((c: any) => c.id === must.id).completedAt,
    ).toBeNull();
    expect(
      (await call(ana, 'post', `/work-duties/occurrences/${occId}/complete`))
        .status,
    ).toBe(409);
    await call(ana, 'post', `/work-duties/checks/${must.id}/complete`, {});

    const finished = await call(
      ana,
      'post',
      `/work-duties/occurrences/${occId}/complete`,
    );
    expect(finished.status).toBe(201);
    expect(finished.body.status).toBe('DONE');
    expect(finished.body.requiredIncomplete).toBe(0);
    expect(
      (await call(ana, 'post', `/work-duties/occurrences/${occId}/complete`))
        .body.status,
    ).toBe('DONE');
    const row = await prisma.workItem.findFirstOrThrow({
      where: { id: made.workItemId },
    });
    expect(row.status).toBe('DONE');
    expect(row.completedAt).not.toBeNull();
    // A finished duty's checklist is history.
    const late = await call(
      ana,
      'post',
      `/work-duties/checks/${must.id}/uncomplete`,
    );
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('DUTY_OCCURRENCE_CLOSED');
  });

  it('a handover is acknowledged only by its receiver, idempotently, and stays listed until then', async () => {
    const t = await template(maya);
    const occ = createdFor(await generate(maya, '2026-12-18'), t.key);
    const made = await call(ana, 'post', '/work-duties/handovers', {
      toEmployeeId: emp.bo,
      note: 'Keys are in the safe',
      occurrenceId: occ.occurrenceId,
    });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({
      status: 'OPEN',
      fromEmployeeId: emp.ana,
      toEmployeeId: emp.bo,
    });
    const id = made.body.id as string;
    const ids = async (actor: HttpActor, qs = '') =>
      (
        (await call(actor, 'get', `/work-duties/handovers${qs}`)).body
          .items as any[]
      ).map((h) => h.id);

    expect(await ids(bo)).toContain(id); // receiver
    expect(await ids(ana)).toContain(id); // sender
    expect(await ids(maya)).toContain(id); // scope over both
    expect(await ids(cy)).not.toContain(id); // unrelated
    expect(await ids(outsider)).not.toContain(id);

    // Not the sender, not a bystander, not another tenant.
    const bySender = await call(
      ana,
      'post',
      `/work-duties/handovers/${id}/acknowledge`,
    );
    expect(bySender.status).toBe(403);
    expect(bySender.body.code).toBe('DUTY_HANDOVER_NOT_RECEIVER');
    expect(
      (await call(cy, 'post', `/work-duties/handovers/${id}/acknowledge`))
        .status,
    ).toBe(404);
    expect(
      (await call(outsider, 'post', `/work-duties/handovers/${id}/acknowledge`))
        .status,
    ).toBe(404);
    expect(
      (await prisma.dutyHandover.findFirstOrThrow({ where: { id } })).status,
    ).toBe('OPEN');
    expect(await ids(bo)).toContain(id); // still in front of people

    const acked = await Promise.all([
      call(bo, 'post', `/work-duties/handovers/${id}/acknowledge`),
      call(bo, 'post', `/work-duties/handovers/${id}/acknowledge`),
    ]);
    expect(acked.map((r) => r.status)).toEqual([201, 201]);
    expect(acked[0].body.status).toBe('ACKNOWLEDGED');
    expect(acked[0].body.acknowledgedAt).toBe(acked[1].body.acknowledgedAt);
    const third = await call(
      bo,
      'post',
      `/work-duties/handovers/${id}/acknowledge`,
    );
    expect(third.body.acknowledgedAt).toBe(acked[0].body.acknowledgedAt);
    expect(third.body.acknowledgedById).toBe(bo.id);

    expect(await ids(bo)).not.toContain(id);
    expect(await ids(bo, '?status=ACKNOWLEDGED')).toContain(id);

    // Shape rules.
    const both = await call(ana, 'post', '/work-duties/handovers', {
      toEmployeeId: emp.bo,
      teamId,
      note: 'both',
    });
    expect(both.body.code).toBe('DUTY_HANDOVER_TARGET');
    expect(
      (await call(ana, 'post', '/work-duties/handovers', { note: 'nobody' }))
        .body.code,
    ).toBe('DUTY_HANDOVER_TARGET');
    expect(
      (
        await call(ana, 'post', '/work-duties/handovers', {
          toEmployeeId: emp.bo,
        })
      ).status,
    ).toBe(400); // note is required
    // A handover tied to work the sender cannot change is refused.
    expect(
      (
        await call(cy, 'post', '/work-duties/handovers', {
          toEmployeeId: emp.bo,
          note: 'not mine',
          occurrenceId: occ.occurrenceId,
        })
      ).status,
    ).toBe(404);
  });

  it('a handover to a team is acknowledged by a member of that team', async () => {
    const made = await call(ana, 'post', '/work-duties/handovers', {
      teamId,
      note: 'Night shift please check the fridge',
    });
    expect(made.status).toBe(201);
    const id = made.body.id as string;
    expect(
      (await call(ana, 'post', `/work-duties/handovers/${id}/acknowledge`))
        .status,
    ).toBe(403);
    expect(
      (await call(cy, 'post', `/work-duties/handovers/${id}/acknowledge`))
        .status,
    ).toBe(404);
    const ok = await call(
      bo,
      'post',
      `/work-duties/handovers/${id}/acknowledge`,
    );
    expect(ok.status).toBe(201);
    expect(ok.body.status).toBe('ACKNOWLEDGED');
  });

  it('another tenant cannot read, complete or act on this tenant duties', async () => {
    const t = await template(maya);
    const occ = createdFor(await generate(maya, '2026-12-19'), t.key);
    expect(
      (
        await call(
          outsider,
          'get',
          `/work-duties/occurrences/${occ.occurrenceId}`,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await call(
          outsider,
          'post',
          `/work-duties/occurrences/${occ.occurrenceId}/complete`,
        )
      ).status,
    ).toBe(404);
    const list = await call(
      outsider,
      'get',
      '/work-duties/occurrences?date=2026-12-19',
    );
    expect(list.body.items).toEqual([]);
    const theirs = await generate(outsider, '2026-12-19');
    expect(theirs.created).toEqual([]);
    expect(
      (
        await call(outsider, 'post', '/work-duties/handovers', {
          toEmployeeId: emp.bo,
          note: 'cross tenant',
        })
      ).status,
    ).toBe(400);
    expect(
      await prisma.dutyOccurrence.count({ where: { tenantId: otherTenantId } }),
    ).toBe(0);
  });
});
