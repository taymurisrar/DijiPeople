/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- supertest response bodies are untyped JSON */
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
 * DP-MASTER WP-28.S1: meetings and the decision register, against a real
 * database, real guard, real HTTP. What is proved: a held meeting keeps its agenda,
 * a decision is never rewritten (it is superseded, once, even under contention),
 * visibility follows the employee access level, nothing crosses a tenant, and an
 * action is a real work item linked to the decision that produced it.
 */
describeWithDatabase()('Meetings and decision register (e2e)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  let tenantId: string;
  let otherTenantId: string;
  let ana: HttpActor; // SELF, unit A
  let bo: HttpActor; // SELF, unit A
  let cy: HttpActor; // SELF, unit B
  let maya: HttpActor; // BUSINESS_UNIT, unit A
  let outsider: HttpActor; // another tenant, TENANT level
  let outsiderEmp: string;
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
  const keys = ['work-items.read', 'work-items.write'];
  const rw = [SecurityPrivilege.READ, SecurityPrivilege.WRITE];
  const future = () => new Date(Date.now() + 86_400_000).toISOString();

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
    fixtures = new DbFixtures(prisma, 'wdec');
    actors = new HttpActors(app, suffix);
    const tenant = await fixtures.createTenant('wdec');
    tenantId = tenant.id;
    const org = await fixtures.createOrganization(tenantId);
    const unitA = await fixtures.createBusinessUnit(tenantId, org);
    const unitB = await fixtures.createBusinessUnit(tenantId, org, 'other');
    const mk = async (
      label: string,
      unit: string,
      level: SecurityAccessLevel,
    ) => {
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
    ana = await mk('ana', unitA, SecurityAccessLevel.SELF);
    bo = await mk('bo', unitA, SecurityAccessLevel.SELF);
    cy = await mk('cy', unitB, SecurityAccessLevel.SELF);
    maya = await mk('maya', unitA, SecurityAccessLevel.BUSINESS_UNIT);
    const other = await fixtures.createTenant('wdecx');
    otherTenantId = other.id;
    const orgX = await fixtures.createOrganization(other.id);
    const unitX = await fixtures.createBusinessUnit(other.id, orgX);
    const made = await scopedActor(prisma, actors, {
      tenantId: other.id,
      unit: unitX,
      label: 'outsider',
      suffix,
      keys,
      level: SecurityAccessLevel.TENANT,
      privileges: rw,
    });
    outsider = made.actor;
    outsiderEmp = made.employeeId;
  });

  afterAll(async () => {
    try {
      for (const id of [tenantId, otherTenantId]) {
        await prisma.decisionAction.deleteMany({ where: { tenantId: id } });
        // supersedes is SetNull, so order does not matter
        await prisma.workDecision.deleteMany({ where: { tenantId: id } });
        await prisma.meetingRecord.deleteMany({ where: { tenantId: id } });
        await prisma.workItemBlocker.deleteMany({ where: { tenantId: id } });
        await prisma.workItem.deleteMany({ where: { tenantId: id } });
      }
      await prisma.employee.deleteMany({});
      await actors.cleanup();
      await fixtures.cleanup();
    } finally {
      await app.close();
    }
  });

  const meeting = async (
    by: HttpActor,
    body: Record<string, unknown> = {},
  ): Promise<string> => {
    const made = await call(by, 'post', '/work-meetings', {
      title: 'Weekly sync',
      agenda: 'Roadmap',
      scheduledAt: future(),
      ...body,
    });
    expect(made.status).toBe(201);
    return made.body.id as string;
  };
  const decision = async (
    by: HttpActor,
    body: Record<string, unknown> = {},
  ): Promise<string> => {
    const made = await call(by, 'post', '/work-decisions', {
      title: 'Pick vendor',
      decision: 'Use vendor A',
      ...body,
    });
    expect(made.status).toBe(201);
    return made.body.id as string;
  };

  it('a meeting is planned, held, then keeps its agenda while its notes stay editable', async () => {
    const id = await meeting(maya, {
      attendeeEmployeeIds: [emp.ana, emp.bo],
      facilitatorEmployeeId: emp.maya,
    });
    const planned = await call(maya, 'patch', `/work-meetings/${id}`, {
      agenda: 'Roadmap and hiring',
      attendeeEmployeeIds: [emp.ana],
    });
    expect(planned.status).toBe(200);
    expect(planned.body.agenda).toBe('Roadmap and hiring');
    expect(planned.body.attendees).toHaveLength(1);
    // Attendance is written up after, not before.
    expect(
      (
        await call(maya, 'post', `/work-meetings/${id}/attendance`, {
          entries: [{ employeeId: emp.ana, attended: true }],
        })
      ).status,
    ).toBe(409);

    const held = await call(maya, 'post', `/work-meetings/${id}/hold`, {});
    expect(held.status).toBe(201);
    expect(held.body).toMatchObject({ status: 'HELD' });
    expect(held.body.heldAt).toBeTruthy();

    for (const body of [
      { agenda: 'rewritten history' },
      { title: 'new title' },
      { scheduledAt: future() },
      { attendeeEmployeeIds: [emp.bo] },
    ]) {
      const refused = await call(maya, 'patch', `/work-meetings/${id}`, body);
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe('WORK_MEETING_AGENDA_LOCKED');
    }
    const notes = await call(maya, 'patch', `/work-meetings/${id}`, {
      notes: 'Agreed to hire in Q3.',
    });
    expect(notes.status).toBe(200);
    expect(notes.body).toMatchObject({
      agenda: 'Roadmap and hiring',
      notes: 'Agreed to hire in Q3.',
    });
    // Holding twice, or cancelling a held meeting, is refused.
    expect(
      (await call(maya, 'post', `/work-meetings/${id}/hold`, {})).status,
    ).toBe(409);
    expect(
      (await call(maya, 'post', `/work-meetings/${id}/cancel`, {})).status,
    ).toBe(409);
    // An invitee cannot be marked who was never invited.
    expect(
      (
        await call(maya, 'post', `/work-meetings/${id}/attendance`, {
          entries: [{ employeeId: emp.bo, attended: true }],
        })
      ).status,
    ).toBe(400);
    const att = await call(maya, 'post', `/work-meetings/${id}/attendance`, {
      entries: [{ employeeId: emp.ana, attended: false }],
    });
    expect(att.status).toBe(201);
    expect(att.body.attendees).toEqual([
      { employeeId: emp.ana, attended: false },
    ]);

    const second = await meeting(maya);
    expect(
      (await call(maya, 'post', `/work-meetings/${second}/cancel`, {})).status,
    ).toBe(201);
    expect(
      (await call(maya, 'patch', `/work-meetings/${second}`, { notes: 'x' }))
        .status,
    ).toBe(409);
    // Required fields.
    expect(
      (await call(maya, 'post', '/work-meetings', { title: 'No time' })).status,
    ).toBe(400);
  });

  it('meeting and decision visibility follows who created, owns or attends them', async () => {
    const mine = await meeting(ana, { title: 'Ana one-to-one' });
    const invited = await meeting(maya, {
      title: 'Team meeting',
      attendeeEmployeeIds: [emp.ana],
    });
    const idsOf = (res: { body: { items: { id: string }[] } }) =>
      res.body.items.map((i) => i.id);

    const anaList = idsOf(await call(ana, 'get', '/work-meetings?take=100'));
    expect(anaList).toEqual(expect.arrayContaining([mine, invited]));
    const boList = idsOf(await call(bo, 'get', '/work-meetings?take=100'));
    expect(boList).not.toContain(mine);
    expect(boList).not.toContain(invited);
    const cyList = idsOf(await call(cy, 'get', '/work-meetings?take=100'));
    expect(cyList).not.toContain(mine);
    // The unit's manager reaches Ana's own meeting through its creator.
    expect(idsOf(await call(maya, 'get', '/work-meetings?take=100'))).toEqual(
      expect.arrayContaining([mine, invited]),
    );
    expect((await call(bo, 'get', `/work-meetings/${mine}`)).status).toBe(404);
    expect((await call(cy, 'get', `/work-meetings/${invited}`)).status).toBe(
      404,
    );
    // A SELF user cannot invite someone they do not reach.
    expect(
      (
        await call(ana, 'post', '/work-meetings', {
          title: 'x1',
          scheduledAt: future(),
          attendeeEmployeeIds: [emp.bo],
        })
      ).status,
    ).toBe(403);
    // An attendee sees the meeting but cannot rewrite it.
    expect(
      (await call(ana, 'patch', `/work-meetings/${invited}`, { notes: 'x' }))
        .status,
    ).toBe(403);

    // Decisions.
    const own = await decision(ana, { title: 'Ana decides' });
    const inMeeting = await decision(maya, {
      title: 'Taken in the team meeting',
      meetingId: invited,
    });
    const hidden = await decision(maya, { title: 'Maya private' });
    const anaDecisions = idsOf(
      await call(ana, 'get', '/work-decisions?take=100'),
    );
    expect(anaDecisions).toEqual(expect.arrayContaining([own, inMeeting]));
    expect(anaDecisions).not.toContain(hidden);
    expect((await call(ana, 'get', `/work-decisions/${hidden}`)).status).toBe(
      404,
    );
    expect(
      idsOf(await call(bo, 'get', '/work-decisions?take=100')),
    ).toHaveLength(0);
    const mayaDecisions = idsOf(
      await call(maya, 'get', '/work-decisions?take=100'),
    );
    expect(mayaDecisions).toEqual(
      expect.arrayContaining([own, inMeeting, hidden]),
    );
    expect(
      idsOf(await call(cy, 'get', '/work-decisions?take=100')),
    ).not.toContain(own);
    // Filters and paging.
    const byMeeting = idsOf(
      await call(maya, 'get', `/work-decisions?meetingId=${invited}`),
    );
    expect(byMeeting).toEqual([inMeeting]);
    expect((await call(maya, 'get', '/work-decisions?take=101')).status).toBe(
      400,
    );
    // Naming someone outside your reach as owner is refused.
    expect(
      (
        await call(ana, 'post', '/work-decisions', {
          title: 'for bo',
          decision: 'bo does it',
          ownerEmployeeId: emp.bo,
        })
      ).status,
    ).toBe(403);
    // A cancelled meeting takes no decisions.
    const dead = await meeting(maya);
    await call(maya, 'post', `/work-meetings/${dead}/cancel`, {});
    expect(
      (
        await call(maya, 'post', '/work-decisions', {
          title: 'late',
          decision: 'too late',
          meetingId: dead,
        })
      ).status,
    ).toBe(409);
  });

  it('nothing crosses a tenant: every read and write route is a 404 for another tenant', async () => {
    const m = await meeting(maya, { attendeeEmployeeIds: [emp.ana] });
    const d = await decision(maya);
    const wi = (
      await call(maya, 'post', '/work-items', { kind: 'TASK', title: 'T' })
    ).body.id as string;

    const routes: Array<['get' | 'post' | 'patch', string, object?]> = [
      ['get', `/work-meetings/${m}`],
      ['patch', `/work-meetings/${m}`, { notes: 'x' }],
      ['post', `/work-meetings/${m}/hold`, {}],
      ['post', `/work-meetings/${m}/cancel`, {}],
      [
        'post',
        `/work-meetings/${m}/attendance`,
        { entries: [{ employeeId: emp.ana, attended: true }] },
      ],
      ['get', `/work-decisions/${d}`],
      ['post', `/work-decisions/${d}/decide`, {}],
      ['post', `/work-decisions/${d}/supersede`, { decision: 'taken over' }],
      ['post', `/work-decisions/${d}/reverse`, { reason: 'because' }],
      [
        'post',
        `/work-decisions/${d}/actions`,
        { title: 'a', ownerEmployeeId: outsiderEmp, dueAt: future() },
      ],
    ];
    for (const [method, path, body] of routes) {
      const res = await call(outsider, method, path, body);
      expect([path, res.status]).toEqual([path, 404]);
    }
    // Lists never contain another tenant's rows.
    expect(
      (await call(outsider, 'get', '/work-meetings')).body.items,
    ).toHaveLength(0);
    expect(
      (await call(outsider, 'get', '/work-decisions')).body.items,
    ).toHaveLength(0);
    expect(
      (await call(outsider, 'get', '/work-decisions/open-actions')).body.items,
    ).toHaveLength(0);
    // Links and people from another tenant do not resolve.
    for (const body of [
      { meetingId: m },
      { workItemId: wi },
      { blockerId: randomUUID() },
      { projectId: randomUUID() },
    ]) {
      const res = await call(outsider, 'post', '/work-decisions', {
        title: 'probe',
        decision: 'probe',
        ...body,
      });
      expect([JSON.stringify(body), res.status]).toEqual([
        JSON.stringify(body),
        404,
      ]);
    }
    expect(
      (
        await call(outsider, 'post', '/work-meetings', {
          title: 'probe',
          scheduledAt: future(),
          workItemId: wi,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call(outsider, 'post', '/work-decisions', {
          title: 'probe',
          decision: 'probe',
          ownerEmployeeId: emp.ana,
        })
      ).status,
    ).toBe(400);
    // The row is untouched.
    const row = await prisma.workDecision.findFirstOrThrow({
      where: { id: d },
    });
    expect(row.status).toBe('DECIDED');
    expect(row.decision).toBe('Use vendor A');
  });

  it('superseding builds a chain, and concurrent supersedes of one decision produce exactly one successor', async () => {
    const original = await decision(maya, { decision: 'Use vendor A' });
    const results = await Promise.all(
      [1, 2, 3, 4].map((n) =>
        call(maya, 'post', `/work-decisions/${original}/supersede`, {
          decision: `Use vendor B${n}`,
        }),
      ),
    );
    const won = results.filter((r) => r.status === 201);
    const lost = results.filter((r) => r.status !== 201);
    expect(won).toHaveLength(1);
    expect(lost.map((r) => r.status)).toEqual([409, 409, 409]);
    // A late loser is stopped by the status pre-check, a true racer by the guard.
    for (const r of lost) {
      expect(['WORK_DECISION_CHANGED', 'WORK_DECISION_NOT_DECIDED']).toContain(
        r.body.code,
      );
    }
    expect(
      await prisma.workDecision.count({
        where: { tenantId, supersedesId: original },
      }),
    ).toBe(1);
    const old = await prisma.workDecision.findFirstOrThrow({
      where: { id: original },
    });
    expect(old).toMatchObject({
      status: 'SUPERSEDED',
      decision: 'Use vendor A', // never rewritten
    });

    const second = won[0].body.id as string;
    expect(won[0].body).toMatchObject({
      status: 'DECIDED',
      supersedesId: original,
      title: 'Pick vendor',
    });
    const third = (
      await call(maya, 'post', `/work-decisions/${second}/supersede`, {
        decision: 'Use vendor C',
        title: 'Vendor final',
      })
    ).body.id as string;

    const mid = (await call(maya, 'get', `/work-decisions/${second}`)).body;
    expect(mid.previous.map((p: { id: string }) => p.id)).toEqual([original]);
    expect(mid.next.map((p: { id: string }) => p.id)).toEqual([third]);
    const tip = (await call(maya, 'get', `/work-decisions/${third}`)).body;
    expect(tip.previous.map((p: { id: string }) => p.id)).toEqual([
      second,
      original,
    ]);
    expect(tip.next).toHaveLength(0);
    // A superseded decision cannot be superseded or reversed again.
    expect(
      (
        await call(maya, 'post', `/work-decisions/${original}/supersede`, {
          decision: 'again',
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call(maya, 'post', `/work-decisions/${original}/reverse`, {
          reason: 'too late',
        })
      ).status,
    ).toBe(409);
    // The audit trail carries both halves.
    const audited = await prisma.auditLog.count({
      where: {
        tenantId,
        entityId: original,
        action: 'WORK_DECISION_SUPERSEDED',
      },
    });
    expect(audited).toBe(1);
  });

  it('a decision text is immutable: there is no edit or delete route, and reversal needs a reason', async () => {
    const id = await decision(maya, { decision: 'Original wording' });
    for (const method of ['patch', 'put', 'delete'] as const) {
      const res = await call(maya, method, `/work-decisions/${id}`, {
        decision: 'edited',
      });
      expect([method, res.status]).toEqual([method, 404]);
    }
    expect(
      (await call(maya, 'post', `/work-decisions/${id}`, { decision: 'x' }))
        .status,
    ).toBe(404);
    expect(
      (await prisma.workDecision.findFirstOrThrow({ where: { id } })).decision,
    ).toBe('Original wording');

    // Proposed -> decided only through /decide.
    const proposed = await decision(maya, { status: 'PROPOSED' });
    expect(
      (
        await call(maya, 'post', `/work-decisions/${proposed}/supersede`, {
          decision: 'nope',
        })
      ).status,
    ).toBe(409);
    expect(
      (await call(maya, 'post', `/work-decisions/${proposed}/decide`, {})).body
        .status,
    ).toBe('DECIDED');
    expect(
      (await call(maya, 'post', `/work-decisions/${proposed}/decide`, {}))
        .status,
    ).toBe(409);

    expect(
      (await call(maya, 'post', `/work-decisions/${id}/reverse`, {})).status,
    ).toBe(400);
    const reversed = await call(maya, 'post', `/work-decisions/${id}/reverse`, {
      reason: 'Budget was cut',
    });
    expect(reversed.status).toBe(201);
    expect(reversed.body.status).toBe('REVERSED');
    expect(reversed.body.decision).toBe('Original wording');
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { tenantId, entityId: id, action: 'WORK_DECISION_REVERSED' },
    });
    expect(audit.afterSnapshot).toMatchObject({ reason: 'Budget was cut' });
  });

  it('only the owner, the creator or a manager can supersede or reverse', async () => {
    const m = await meeting(maya, { attendeeEmployeeIds: [emp.ana] });
    const d = await decision(maya, { meetingId: m });
    // Ana sees it through the meeting, but it is neither hers nor within her reach.
    expect((await call(ana, 'get', `/work-decisions/${d}`)).status).toBe(200);
    expect(
      (
        await call(ana, 'post', `/work-decisions/${d}/supersede`, {
          decision: 'mine now',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await call(ana, 'post', `/work-decisions/${d}/reverse`, {
          reason: 'abc',
        })
      ).status,
    ).toBe(403);
    // The owner can, even though they do not manage anyone.
    const owned = await decision(maya, { ownerEmployeeId: emp.ana });
    expect(
      (
        await call(ana, 'post', `/work-decisions/${owned}/reverse`, {
          reason: 'I own it',
        })
      ).status,
    ).toBe(201);
  });

  it('an action is a real work item linked to its decision, and the open-actions report follows it', async () => {
    const d = await decision(maya);
    const created = await call(maya, 'post', `/work-decisions/${d}/actions`, {
      title: 'Sign the vendor contract',
      ownerEmployeeId: emp.ana,
      dueAt: future(),
    });
    expect(created.status).toBe(201);
    const itemId = created.body.workItemId as string;
    expect(
      await prisma.decisionAction.count({
        where: { tenantId, decisionId: d, workItemId: itemId },
      }),
    ).toBe(1);
    // Ana owns it, so she can see it.
    const seen = await call(ana, 'get', `/work-items/${itemId}`);
    expect(seen.status).toBe(200);
    expect(seen.body).toMatchObject({
      kind: 'TASK',
      ownerEmployeeId: emp.ana,
    });
    expect((await call(bo, 'get', `/work-items/${itemId}`)).status).toBe(404);

    const detail = (await call(maya, 'get', `/work-decisions/${d}`)).body;
    expect(detail).toMatchObject({ actionCount: 1, openActionCount: 1 });
    expect(detail.actions[0]).toMatchObject({ workItemId: itemId });
    const listed = (
      await call(maya, 'get', `/work-decisions?take=100`)
    ).body.items.find((i: { id: string }) => i.id === d);
    expect(listed).toMatchObject({ actionCount: 1, openActionCount: 1 });

    const report = await call(maya, 'get', '/work-decisions/open-actions');
    expect(report.status).toBe(200);
    const row = report.body.items.find((i: { id: string }) => i.id === d);
    expect(
      row.openActions.map((a: { workItemId: string }) => a.workItemId),
    ).toEqual([itemId]);
    // Cy has no reach to it.
    expect(
      (await call(cy, 'get', '/work-decisions/open-actions')).body.items.map(
        (i: { id: string }) => i.id,
      ),
    ).not.toContain(d);

    // Finishing the work closes the action.
    for (const to of ['IN_PROGRESS', 'DONE']) {
      const moved = await call(
        ana,
        'post',
        `/work-items/${itemId}/transition`,
        {
          to,
        },
      );
      expect(moved.status).toBeLessThan(300);
    }
    expect(
      (await call(maya, 'get', `/work-decisions/${d}`)).body,
    ).toMatchObject({ actionCount: 1, openActionCount: 0 });
    expect(
      (await call(maya, 'get', '/work-decisions/open-actions')).body.items.map(
        (i: { id: string }) => i.id,
      ),
    ).not.toContain(d);
  });

  it('actions respect reach and leave no orphan work item behind', async () => {
    const d = await decision(ana, { title: 'Ana decision' });
    const title = `Orphan probe ${suffix}`;
    // Ana (SELF) cannot hand work to Bo.
    expect(
      (
        await call(ana, 'post', `/work-decisions/${d}/actions`, {
          title,
          ownerEmployeeId: emp.bo,
          dueAt: future(),
        })
      ).status,
    ).toBe(403);
    // Bo cannot touch Ana's decision at all.
    expect(
      (
        await call(bo, 'post', `/work-decisions/${d}/actions`, {
          title,
          ownerEmployeeId: emp.bo,
          dueAt: future(),
        })
      ).status,
    ).toBe(404);
    // She can take one herself.
    expect(
      (
        await call(ana, 'post', `/work-decisions/${d}/actions`, {
          title: `${title} self`,
          ownerEmployeeId: emp.ana,
          dueAt: future(),
        })
      ).status,
    ).toBe(201);
    // A reversed decision takes no actions.
    await call(ana, 'post', `/work-decisions/${d}/reverse`, {
      reason: 'drop it',
    });
    expect(
      (
        await call(ana, 'post', `/work-decisions/${d}/actions`, {
          title: `${title} late`,
          ownerEmployeeId: emp.ana,
          dueAt: future(),
        })
      ).status,
    ).toBe(409);
    expect(
      await prisma.workItem.count({
        where: { tenantId, title: { startsWith: title } },
      }),
    ).toBe(1); // only the one that was linked
    expect(
      await prisma.decisionAction.count({ where: { tenantId, decisionId: d } }),
    ).toBe(1);
  });
});
