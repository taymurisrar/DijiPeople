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
 * DP-MASTER WP-38.S1: blockers and accountability on work items, against a real
 * database, real guard, real HTTP. The point of the suite is the accountability
 * rules: nothing assigns blame by itself, a party to the delay cannot judge it,
 * concurrent closers and escalators collapse to one, and blocked time is reported
 * by cause without being mistaken for effort.
 */
describeWithDatabase()('Work blockers and accountability (e2e)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  let tenantId: string;
  let unitA: string;
  let unitB: string;
  let ana: HttpActor; // employee, SELF
  let bo: HttpActor; // employee, SELF, same unit
  let cy: HttpActor; // employee, SELF, another unit: a blocker can wait on cy
  let maya: HttpActor; // manager, BUSINESS_UNIT of unitA
  let outsider: HttpActor; // another tenant
  const emp: Record<string, string> = {};
  const suffix = randomUUID().slice(0, 6);

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
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    prisma = app.get(PrismaService);
    fixtures = new DbFixtures(prisma, 'wblk');
    actors = new HttpActors(app, suffix);
    const tenant = await fixtures.createTenant('wblk');
    tenantId = tenant.id;
    const org = await fixtures.createOrganization(tenantId);
    unitA = await fixtures.createBusinessUnit(tenantId, org);
    unitB = await fixtures.createBusinessUnit(tenantId, org, 'other');
    const mk = async (label: string, unit: string, level: SecurityAccessLevel) => {
      const made = await scopedActor(prisma, actors, {
        tenantId, unit, label, suffix, keys, level, privileges: rw,
      });
      emp[label] = made.employeeId;
      return made.actor;
    };
    ana = await mk('ana', unitA, SecurityAccessLevel.SELF);
    bo = await mk('bo', unitA, SecurityAccessLevel.SELF);
    cy = await mk('cy', unitB, SecurityAccessLevel.SELF);
    maya = await mk('maya', unitA, SecurityAccessLevel.BUSINESS_UNIT);
    const other = await fixtures.createTenant('wblkx');
    const orgX = await fixtures.createOrganization(other.id);
    const unitX = await fixtures.createBusinessUnit(other.id, orgX);
    outsider = (
      await scopedActor(prisma, actors, {
        tenantId: other.id, unit: unitX, label: 'outsider', suffix, keys,
        level: SecurityAccessLevel.TENANT, privileges: rw,
      })
    ).actor;
  });

  afterAll(async () => {
    try {
      await prisma.workItemBlocker.deleteMany({ where: { tenantId } });
      await prisma.workItem.deleteMany({ where: { tenantId } });
      await prisma.employee.deleteMany({});
      await actors.cleanup();
      await fixtures.cleanup();
    } finally {
      await app.close();
    }
  });

  const task = async (owner: HttpActor, title: string, start = true) => {
    const made = await call(owner, 'post', '/work-items', { kind: 'TASK', title });
    const id = made.body.id as string;
    if (start) await call(owner, 'post', `/work-items/${id}/transition`, { to: 'IN_PROGRESS' });
    return id;
  };
  const statusOf = async (id: string) => (await call(maya, 'get', `/work-items/${id}`)).body.status as string;

  it('raising a blocker on work in progress moves it to BLOCKED, starts UNDETERMINED, and nobody else can see it', async () => {
    const id = await task(ana, 'Waiting on legal');
    const raised = await call(ana, 'post', `/work-items/${id}/blockers`, {
      category: 'WAITING_ON_APPROVAL',
      reason: 'Contract needs sign-off',
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(raised.status).toBe(201);
    expect(raised.body).toMatchObject({
      status: 'OPEN',
      cause: 'UNDETERMINED', // never inferred
      causeSetById: null,
      overdue: false,
      escalationLevel: 0,
    });
    expect(await statusOf(id)).toBe('BLOCKED');

    expect((await call(maya, 'get', `/work-items/${id}/blockers`)).body).toHaveLength(1);
    // Bo is a colleague with the same keys and SELF reach: it does not exist for him.
    expect((await call(bo, 'get', `/work-items/${id}/blockers`)).status).toBe(404);
    expect((await call(outsider, 'get', `/work-items/${id}/blockers`)).status).toBe(404);
    expect(
      (await call(bo, 'get', '/work-blockers')).body.items.map((b: { id: string }) => b.id),
    ).not.toContain(raised.body.id);
    // Nobody may raise one on work they cannot change.
    expect((await call(bo, 'post', `/work-items/${id}/blockers`, { category: 'OTHER', reason: 'not mine' })).status).toBe(404);
  });

  it('a person a blocker waits on can see that one item, resolve it, and cannot judge its cause', async () => {
    const id = await task(ana, 'Needs Cy');
    const raised = await call(ana, 'post', `/work-items/${id}/blockers`, {
      category: 'WAITING_ON_PERSON',
      reason: 'Cy holds the key',
      ownerEmployeeId: emp.cy,
    });
    const blockerId = raised.body.id as string;

    // Cy is in another unit with SELF reach, yet sees this work and this blocker.
    expect((await call(cy, 'get', `/work-items/${id}`)).status).toBe(200);
    expect((await call(cy, 'get', '/work-blockers?mine=true')).body.items.map((b: { id: string }) => b.id)).toContain(blockerId);
    // But only that one: Ana's other work stays hidden.
    const other = await task(ana, 'Not for Cy');
    expect((await call(cy, 'get', `/work-items/${other}`)).status).toBe(404);

    // Cy cannot set the cause of the delay they are accountable for.
    const self = await call(cy, 'post', `/work-blockers/${blockerId}/cause`, { cause: 'EXTERNAL' });
    expect(self.status).toBe(403);
    // Nor can Ana, who is doing the delayed work: a cause is a reviewer's judgement.
    const party = await call(ana, 'post', `/work-blockers/${blockerId}/cause`, { cause: 'EXTERNAL' });
    expect(party.status).toBe(403);
    expect(party.body.code).toBe('WORK_BLOCKER_CAUSE_PARTY');
    // A reviewer can, on the record.
    const judged = await call(maya, 'post', `/work-blockers/${blockerId}/cause`, { cause: 'TEAM_CONTROLLABLE', note: 'Key was never shared' });
    expect(judged.status).toBe(201);
    expect(judged.body).toMatchObject({ cause: 'TEAM_CONTROLLABLE' });
    expect(judged.body.causeSetById).not.toBeNull();
    expect(
      await prisma.auditLog.count({ where: { tenantId, entityId: blockerId, action: 'WORK_BLOCKER_CAUSE_SET' } }),
    ).toBe(1);

    const resolved = await call(cy, 'post', `/work-blockers/${blockerId}/resolve`, { resolution: 'Shared the key' });
    expect(resolved.status).toBe(201);
    expect(resolved.body).toMatchObject({ status: 'RESOLVED', resolution: 'Shared the key' });
    expect(await statusOf(id)).toBe('IN_PROGRESS');
    // Once resolved, Cy no longer sees the work.
    expect((await call(cy, 'get', `/work-items/${id}`)).status).toBe(404);
  });

  it('an item stays blocked until the LAST open blocker is closed; concurrent closers collapse to one', async () => {
    const id = await task(ana, 'Two blockers');
    const a = (await call(ana, 'post', `/work-items/${id}/blockers`, { category: 'MATERIAL_OR_STOCK', reason: 'No stock' })).body.id;
    const b = (await call(ana, 'post', `/work-items/${id}/blockers`, { category: 'DECISION_NEEDED', reason: 'Needs a decision' })).body.id;
    await call(ana, 'post', `/work-blockers/${a}/resolve`, { resolution: 'Stock arrived' });
    expect(await statusOf(id)).toBe('BLOCKED');

    const both = await Promise.all([
      call(ana, 'post', `/work-blockers/${b}/resolve`, { resolution: 'Decided, closing now' }),
      call(maya, 'post', `/work-blockers/${b}/resolve`, { resolution: 'Decided, closing too' }),
    ]);
    expect(both.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await statusOf(id)).toBe('IN_PROGRESS');
    expect(
      await prisma.auditLog.count({ where: { tenantId, entityId: b, action: 'WORK_BLOCKER_RESOLVED' } }),
    ).toBe(1);
    // A closed blocker cannot be changed.
    expect((await call(ana, 'patch', `/work-blockers/${b}`, { reason: 'rewrite history' })).status).toBe(409);
  });

  it('escalation is deliberate, bounded and race-safe', async () => {
    const id = await task(ana, 'Escalate me');
    const blockerId = (await call(ana, 'post', `/work-items/${id}/blockers`, { category: 'EXTERNAL_PARTY', reason: 'Vendor silent' })).body.id as string;

    const race = await Promise.all([
      call(ana, 'post', `/work-blockers/${blockerId}/escalate`, { note: 'now' }),
      call(maya, 'post', `/work-blockers/${blockerId}/escalate`, { note: 'now too' }),
    ]);
    // Two escalations at once: each 201 raised the level exactly once, and a loser
    // (if the requests truly overlapped) is told the blocker changed, never lost.
    const won = race.filter((r) => r.status === 201).length;
    expect(won).toBeGreaterThanOrEqual(1);
    expect(race.filter((r) => r.status !== 201).every((r) => r.status === 409 && r.body.code === 'WORK_BLOCKER_CHANGED')).toBe(true);
    expect((await prisma.workItemBlocker.findUniqueOrThrow({ where: { id: blockerId } })).escalationLevel).toBe(won);

    // Bring it to the ceiling one deliberate step at a time.
    for (let level = won; level < 3; level += 1) {
      expect((await call(maya, 'post', `/work-blockers/${blockerId}/escalate`, {})).status).toBe(201);
    }
    const fourth = await call(maya, 'post', `/work-blockers/${blockerId}/escalate`, {});
    expect(fourth.status).toBe(409);
    expect(fourth.body.code).toBe('WORK_BLOCKER_MAX_ESCALATION');
    expect((await call(bo, 'post', `/work-blockers/${blockerId}/escalate`, {})).status).toBe(404);
  });

  it('a finished item cannot be blocked, and an OPEN item gets the blocker without changing column', async () => {
    const done = await task(ana, 'Finished');
    await call(ana, 'post', `/work-items/${done}/transition`, { to: 'DONE' });
    const refused = await call(ana, 'post', `/work-items/${done}/blockers`, { category: 'OTHER', reason: 'too late now' });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('WORK_BLOCKER_ITEM_FINISHED');

    const open = await task(ana, 'Not started', false);
    await call(ana, 'post', `/work-items/${open}/blockers`, { category: 'ACCESS_OR_TOOLING', reason: 'No licence yet' });
    expect(await statusOf(open)).toBe('OPEN');
  });

  it('the list shows overdue and mine; the summary reports blocked time by cause and category, apart from effort', async () => {
    const id = await task(ana, 'Reported on');
    const late = await call(ana, 'post', `/work-items/${id}/blockers`, {
      category: 'EQUIPMENT_OR_SYSTEM_DOWNTIME',
      reason: 'Line 2 is down',
      dueAt: new Date(Date.now() - 3_600_000).toISOString(),
      ownerEmployeeId: emp.bo,
    });
    // Back-date the blocker so there is blocked time to report: 3 hours.
    await prisma.workItemBlocker.update({
      where: { id: late.body.id },
      data: { raisedAt: new Date(Date.now() - 3 * 3_600_000) },
    });
    await call(maya, 'post', `/work-blockers/${late.body.id}/cause`, { cause: 'EXTERNAL' });

    const overdue = await call(maya, 'get', '/work-blockers?overdue=true');
    expect(overdue.body.items.map((b: { id: string }) => b.id)).toContain(late.body.id);
    const mine = await call(bo, 'get', '/work-blockers?mine=true');
    expect(mine.body.items.map((b: { id: string }) => b.id)).toEqual([late.body.id]);

    const from = new Date(Date.now() - 86_400_000).toISOString();
    const to = new Date(Date.now() + 3_600_000).toISOString();
    const summary = await call(maya, 'get', `/work-blockers/summary?from=${from}&to=${to}`);
    expect(summary.status).toBe(200);
    const external = summary.body.byCause.find((c: { cause: string }) => c.cause === 'EXTERNAL');
    expect(external.open).toBeGreaterThanOrEqual(1);
    expect(external.minutes).toBeGreaterThanOrEqual(180);
    const downtime = summary.body.byCategory.find((c: { category: string }) => c.category === 'EQUIPMENT_OR_SYSTEM_DOWNTIME');
    expect(downtime.minutes).toBeGreaterThanOrEqual(180);
    // Judged and unjudged delay are separate rows: the undetermined ones stay visible.
    expect(summary.body.byCause.some((c: { cause: string }) => c.cause === 'UNDETERMINED')).toBe(true);
    // The effort of the item is untouched by the time it was blocked.
    expect((await call(maya, 'get', `/work-items/${id}`)).body.effort).toMatchObject({ estimateMinutes: null, actualMinutes: null });

    // Scope: Bo's summary only counts blockers on work he can see (the one waiting on him).
    const narrow = await call(bo, 'get', `/work-blockers/summary?from=${from}&to=${to}`);
    expect(narrow.body.blockers).toBe(1);
    expect((await call(maya, 'get', `/work-blockers/summary?from=${to}&to=${from}`)).body.code).toBe('WORK_BLOCKER_PERIOD_INVALID');
    expect((await call(outsider, 'get', `/work-blockers/summary?from=${from}&to=${to}`)).body.blockers).toBe(0);
  });

  it('validation: category and cause are closed sets, unknown fields are refused', async () => {
    const id = await task(ana, 'Validated');
    expect((await call(ana, 'post', `/work-items/${id}/blockers`, { category: 'LAZY', reason: 'whatever' })).status).toBe(400);
    expect((await call(ana, 'post', `/work-items/${id}/blockers`, { category: 'OTHER', reason: 'ok reason', status: 'RESOLVED' })).status).toBe(400);
    expect((await call(ana, 'post', `/work-items/${id}/blockers`, { category: 'OTHER', reason: 'ok reason', cause: 'EMPLOYEE_IS_LAZY' })).status).toBe(400);
    expect((await call(ana, 'post', `/work-items/${id}/blockers`, { category: 'OTHER', reason: 'ab' })).status).toBe(400);
  });
});
