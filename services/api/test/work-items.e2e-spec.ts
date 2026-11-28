/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- supertest response bodies are untyped JSON; assertions read them directly. */
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
 * DP-MASTER WP-02.S1 (ADR-0030) against a real database, real guard, real HTTP.
 * Acceptance: a task, a recurring duty occurrence and a quantity-based service job
 * work with correct ownership and history; contributors are not double counted;
 * status changes, reassignment and archiving are safe; a dependency cycle is
 * refused even when two writers race; nothing crosses tenants.
 */
describeWithDatabase()('Work items (e2e, HTTP)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  let tenantA: string;
  let tenantB: string;
  let adminA: HttpActor;
  let adminB: HttpActor;
  let plainA: HttpActor;
  let nora: string;
  let omar: string;
  let terminated: string;
  let unitA: string;
  const suffix = randomUUID().slice(0, 6);

  const call = (
    actor: HttpActor,
    method: 'get' | 'post' | 'patch' | 'put' | 'delete',
    path: string,
    body?: object,
  ) => {
    const req = request(app.getHttpServer())
      [method](`/work-items${path}`)
      .set('Authorization', `Bearer ${actor.token}`)
      .set('X-DijiPeople-App', 'web');
    return body ? req.send(body) : req;
  };
  const create = async (body: object, actor = adminA) => {
    const res = await call(actor, 'post', '', body);
    expect(res.status).toBe(201);
    return res.body.id as string;
  };
  const statusOf = async (id: string) =>
    (await call(adminA, 'get', `/${id}`)).body.status as string;

  async function tenantWithAdmin(label: string) {
    const tenant = await fixtures.createTenant(label);
    const org = await fixtures.createOrganization(tenant.id);
    const unit = await fixtures.createBusinessUnit(tenant.id, org);
    const admin = await actors.tenantUser(tenant.id, unit, `${label}-admin`);
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
    return { tenant, unit, admin };
  }

  const employee = async (
    tenantId: string,
    unit: string,
    code: string,
    status: 'ACTIVE' | 'TERMINATED' = 'ACTIVE',
  ) =>
    (
      await prisma.employee.create({
        data: {
          tenantId,
          employeeCode: `${code}-${suffix}`,
          firstName: code,
          lastName: 'Test',
          phone: '0',
          hireDate: new Date('2024-01-01'),
          businessUnitId: unit,
          employmentStatus: status,
        },
        select: { id: true },
      })
    ).id;

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
    fixtures = new DbFixtures(prisma, 'witem');
    actors = new HttpActors(app, suffix);

    const a = await tenantWithAdmin('wia');
    const b = await tenantWithAdmin('wib');
    tenantA = a.tenant.id;
    tenantB = b.tenant.id;
    adminA = a.admin;
    adminB = b.admin;
    unitA = a.unit;
    plainA = await actors.tenantUser(tenantA, a.unit, 'wia-plain');
    nora = await employee(tenantA, a.unit, 'Nora');
    omar = await employee(tenantA, a.unit, 'Omar');
    terminated = await employee(tenantA, a.unit, 'Gone', 'TERMINATED');
  });

  afterAll(async () => {
    try {
      const tenants = { in: [tenantA, tenantB] };
      await prisma.workItem.deleteMany({ where: { tenantId: tenants } });
      await prisma.employee.deleteMany({ where: { tenantId: tenantA } });
      await actors.cleanup();
      await fixtures.cleanup();
    } finally {
      await app.close();
    }
  });

  it('refuses a user without the permission (403) and an unauthenticated caller (401)', async () => {
    expect((await call(plainA, 'get', '')).status).toBe(403);
    expect(
      (await call(plainA, 'post', '', { kind: 'TASK', title: 'x' })).status,
    ).toBe(403);
    const anon = await request(app.getHttpServer())
      .get('/work-items')
      .set('X-DijiPeople-App', 'web');
    expect(anon.status).toBe(401);
  });

  it('operates a task, a duty occurrence and a quantity-based service job with owners and history', async () => {
    const task = await create({
      kind: 'TASK',
      title: 'Prepare the rota',
      ownerEmployeeId: nora,
      priority: 'HIGH',
    });
    const duty = await create({
      kind: 'DUTY_OCCURRENCE',
      title: 'Opening checklist 2026-12-01',
      workTypeKey: 'opening-check',
    });
    const service = await create({
      kind: 'SERVICE_JOB',
      title: 'Claims batch 114',
      ownerEmployeeId: omar,
      externalSystem: 'queue',
      externalRef: 'batch-114',
    });

    const list = await call(adminA, 'get', '?take=10');
    expect(list.status).toBe(200);
    expect(list.body.items.map((i: { id: string }) => i.id)).toEqual(
      expect.arrayContaining([task, duty, service]),
    );
    const byOwner = await call(adminA, 'get', `?ownerEmployeeId=${nora}`);
    expect(byOwner.body.items.map((i: { id: string }) => i.id)).toEqual([task]);

    const one = await call(adminA, 'get', `/${service}`);
    expect(one.body).toMatchObject({
      kind: 'SERVICE_JOB',
      status: 'OPEN',
      ownerEmployeeId: omar,
      externalRef: 'batch-114',
    });

    // Created with an audit row carrying the after snapshot.
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { tenantId: tenantA, entityId: task, action: 'WORK_ITEM_CREATED' },
    });
    expect(audit.actorUserId).toBe(adminA.id);
  });

  it('moves status only along the table, stamps the times, and audits each change', async () => {
    const id = await create({ kind: 'TASK', title: 'Lifecycle' });
    const move = (to: string) =>
      call(adminA, 'post', `/${id}/transition`, { to, reason: 'test' });

    expect((await move('DONE')).status).toBe(409); // OPEN -> DONE is not allowed
    expect((await move('IN_PROGRESS')).status).toBe(201);
    const started = (await call(adminA, 'get', `/${id}`)).body.startedAt;
    expect(started).toBeTruthy();
    expect((await move('IN_REVIEW')).status).toBe(201);
    expect((await move('DONE')).status).toBe(201);
    const done = (await call(adminA, 'get', `/${id}`)).body;
    expect(done.completedAt).toBeTruthy();
    expect((await move('IN_PROGRESS')).status).toBe(201); // reopen
    const reopened = (await call(adminA, 'get', `/${id}`)).body;
    expect(reopened.completedAt).toBeNull();
    expect(reopened.startedAt).toBe(started); // the first start is kept

    const audits = await prisma.auditLog.count({
      where: {
        tenantId: tenantA,
        entityId: id,
        action: 'WORK_ITEM_TRANSITIONED',
      },
    });
    expect(audits).toBe(4);
  });

  it('counts each contributor once: setting a person again updates their share', async () => {
    const id = await create({ kind: 'TASK', title: 'Shared work' });
    const set = (employeeId: string, body: object) =>
      call(adminA, 'put', `/${id}/contributors/${employeeId}`, body);
    expect(
      (await set(nora, { estimateMinutes: 60, actualMinutes: 30 })).status,
    ).toBe(200);
    expect((await set(omar, { estimateMinutes: 30 })).status).toBe(200);
    // Nora again: same row, new numbers, not a second share.
    expect((await set(nora, { actualMinutes: 45 })).status).toBe(200);

    const one = (await call(adminA, 'get', `/${id}`)).body;
    expect(one.contributors).toHaveLength(2);
    expect(one.effort).toEqual({
      estimateMinutes: 90,
      actualMinutes: 45,
      contributors: 2,
    });
    expect(
      await prisma.workItemContributor.count({ where: { workItemId: id } }),
    ).toBe(2);

    expect(
      (await call(adminA, 'delete', `/${id}/contributors/${omar}`)).status,
    ).toBe(200);
    expect((await call(adminA, 'get', `/${id}`)).body.effort.contributors).toBe(
      1,
    );
    expect((await set(terminated, { estimateMinutes: 5 })).status).toBe(400);
  });

  it('refuses a dependency cycle, including two writers racing to close one', async () => {
    const a = await create({ kind: 'TASK', title: 'A' });
    const b = await create({ kind: 'TASK', title: 'B' });
    const c = await create({ kind: 'TASK', title: 'C' });
    const dep = (id: string, on: string) =>
      call(adminA, 'post', `/${id}/dependencies`, { dependsOnId: on });

    expect((await dep(b, a)).status).toBe(201); // b waits on a
    expect((await dep(c, b)).status).toBe(201); // c waits on b
    expect((await dep(a, a)).status).toBe(409);
    expect((await dep(a, b)).status).toBe(409);
    const viaChain = await dep(a, c);
    expect(viaChain.status).toBe(409);
    expect(viaChain.body.code ?? viaChain.body.message?.code).toBeDefined();

    // Two edges that are each fine alone but close a loop together. Repeated,
    // because a race that usually passes proves nothing: without the tenant lock
    // at least one pair in a dozen lets both edges in.
    for (let round = 0; round < 12; round += 1) {
      const x = await create({ kind: 'TASK', title: `X${round}` });
      const y = await create({ kind: 'TASK', title: `Y${round}` });
      const [first, second] = await Promise.all([dep(x, y), dep(y, x)]);
      expect([first.status, second.status].sort()).toEqual([201, 409]);
      const edges = await prisma.workItemDependency.count({
        where: { workItemId: { in: [x, y] } },
      });
      expect(edges).toBe(1);
    }
  });

  it('will not finish an item while a prerequisite is unfinished', async () => {
    const pre = await create({ kind: 'TASK', title: 'Prerequisite' });
    const main = await create({ kind: 'TASK', title: 'Main' });
    await call(adminA, 'post', `/${main}/dependencies`, { dependsOnId: pre });
    await call(adminA, 'post', `/${main}/transition`, { to: 'IN_PROGRESS' });
    const blocked = await call(adminA, 'post', `/${main}/transition`, {
      to: 'DONE',
    });
    expect(blocked.status).toBe(409);
    expect(await statusOf(main)).toBe('IN_PROGRESS');

    await call(adminA, 'post', `/${pre}/transition`, { to: 'CANCELLED' });
    expect(
      (await call(adminA, 'post', `/${main}/transition`, { to: 'DONE' }))
        .status,
    ).toBe(201);
  });

  it('reassigns with before/after audit, refusing a terminated or unknown employee', async () => {
    const id = await create({
      kind: 'TASK',
      title: 'Hand over',
      ownerEmployeeId: nora,
    });
    expect(
      (
        await call(adminA, 'post', `/${id}/reassign`, {
          ownerEmployeeId: terminated,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(adminA, 'post', `/${id}/reassign`, {
          ownerEmployeeId: randomUUID(),
        })
      ).status,
    ).toBe(400);
    const ok = await call(adminA, 'post', `/${id}/reassign`, {
      ownerEmployeeId: omar,
      reason: 'leaving',
    });
    expect(ok.status).toBe(201);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        tenantId: tenantA,
        entityId: id,
        action: 'WORK_ITEM_REASSIGNED',
      },
    });
    expect(audit.beforeSnapshot).toMatchObject({ ownerEmployeeId: nora });
    expect(audit.afterSnapshot).toMatchObject({
      ownerEmployeeId: omar,
      reason: 'leaving',
    });
  });

  it('archives finished items only, never deletes, and an archived item does not change status', async () => {
    const id = await create({ kind: 'TASK', title: 'Archive me' });
    expect((await call(adminA, 'post', `/${id}/archive`)).status).toBe(409);
    await call(adminA, 'post', `/${id}/transition`, { to: 'CANCELLED' });
    expect((await call(adminA, 'post', `/${id}/archive`)).status).toBe(201);
    expect(
      (await call(adminA, 'post', `/${id}/transition`, { to: 'OPEN' })).status,
    ).toBe(409);

    const hidden = await call(adminA, 'get', '?take=100');
    expect(hidden.body.items.map((i: { id: string }) => i.id)).not.toContain(
      id,
    );
    const shown = await call(adminA, 'get', '?includeArchived=true&take=100');
    expect(shown.body.items.map((i: { id: string }) => i.id)).toContain(id);

    expect((await call(adminA, 'post', `/${id}/unarchive`)).status).toBe(201);
    expect((await call(adminA, 'delete', `/${id}`)).status).toBe(404); // no delete route
    expect(await prisma.workItem.count({ where: { id } })).toBe(1);
  });

  it('nests subtasks to a bounded depth and validates project and profile version inside the tenant', async () => {
    let parent = await create({ kind: 'TASK', title: 'L1' });
    for (let level = 2; level <= 4; level += 1) {
      parent = await create({
        kind: 'TASK',
        title: `L${level}`,
        parentId: parent,
      });
    }
    // 5th level is allowed, the 6th is not.
    const fifth = await create({ kind: 'TASK', title: 'L5', parentId: parent });
    expect(
      (
        await call(adminA, 'post', '', {
          kind: 'TASK',
          title: 'L6',
          parentId: fifth,
        })
      ).status,
    ).toBe(400);

    expect(
      (
        await call(adminA, 'post', '', {
          kind: 'TASK',
          title: 'p',
          projectId: randomUUID(),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call(adminA, 'post', '', {
          kind: 'TASK',
          title: 'v',
          workProfileVersionId: randomUUID(),
        })
      ).status,
    ).toBe(400);
  });

  it('keeps tenants apart: another tenant cannot read, change or link a work item', async () => {
    const id = await create({
      kind: 'TASK',
      title: 'Tenant A only',
      ownerEmployeeId: nora,
    });
    expect((await call(adminB, 'get', `/${id}`)).status).toBe(404);
    expect(
      (await call(adminB, 'post', `/${id}/transition`, { to: 'IN_PROGRESS' }))
        .status,
    ).toBe(404);
    expect(
      (await call(adminB, 'patch', `/${id}`, { title: 'hijack' })).status,
    ).toBe(404);
    const list = await call(adminB, 'get', '?take=100');
    expect(list.body.items.map((i: { id: string }) => i.id)).not.toContain(id);

    // B cannot make its item depend on A's, nor assign A's employee.
    const mine = await create({ kind: 'TASK', title: 'B item' }, adminB);
    expect(
      (await call(adminB, 'post', `/${mine}/dependencies`, { dependsOnId: id }))
        .status,
    ).toBe(404);
    expect(
      (
        await call(adminB, 'post', `/${mine}/reassign`, {
          ownerEmployeeId: nora,
        })
      ).status,
    ).toBe(400);
    expect(unitA).toBeDefined();
  });

  it('rejects unknown fields (400) so a client cannot set tenantId or status directly', async () => {
    const res = await call(adminA, 'post', '', {
      kind: 'TASK',
      title: 'x',
      tenantId: tenantB,
      status: 'DONE',
    });
    expect(res.status).toBe(400);
  });
});
