/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument -- supertest response bodies are untyped JSON */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import {
  ENTITY_KEYS,
  ROLE_KEYS,
  SYSTEM_ROLE_PRIVILEGES,
} from '../src/common/constants/rbac-matrix';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { HttpActors, type HttpActor } from './helpers/http-actors';

/**
 * DP-MASTER WP-06.S1 and WP-30.S1 against a real database, real guard, real HTTP.
 *
 * What is proved here is the part a unit test cannot: that the access level a
 * role holds on EMPLOYEES decides whose work and whose evidence a caller reaches
 * (an employee their own, a manager their business unit, HR the tenant), that an
 * out-of-scope record does not exist for the caller, that queues work with no
 * Project and stamp their SLA onto each item, and that the ledger counts
 * overlapping evidence once, never turns a quantity into time and keeps every
 * correction.
 */
describeWithDatabase()(
  'Work scope, queues and the contribution ledger (e2e)',
  () => {
    jest.setTimeout(600_000);

    let moduleRef: TestingModule;
    let app: INestApplication<App>;
    let prisma: PrismaService;
    let fixtures: DbFixtures;
    let actors: HttpActors;
    let tenantA: string;
    let tenantB: string;
    let unitA: string;
    let unitOther: string;
    let teamId: string;
    let ana: HttpActor; // employee, SELF
    let bo: HttpActor; // employee, SELF, same unit
    let cy: HttpActor; // employee, SELF, a different business unit
    let maya: HttpActor; // manager, BUSINESS_UNIT
    let hana: HttpActor; // HR, TENANT
    let adminB: HttpActor;
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

    const KEYS = {
      employee: [
        'work-items.read',
        'work-items.write',
        'work-queues.read',
        'contributions.read',
        'contributions.write',
      ],
      manager: [
        'work-items.read',
        'work-items.write',
        'work-queues.read',
        'contributions.read',
        'contributions.write',
        'contributions.verify',
      ],
      hr: [
        'work-items.read',
        'work-items.write',
        'work-queues.read',
        'work-queues.manage',
        'contributions.read',
        'contributions.write',
        'contributions.verify',
      ],
    } as const;

    /** A user holding exactly these permission keys and this access level. */
    async function actorWith(
      tenantId: string,
      unit: string,
      label: string,
      keys: readonly string[],
      level: SecurityAccessLevel,
      privileges: SecurityPrivilege[] = [
        SecurityPrivilege.READ,
        SecurityPrivilege.WRITE,
        SecurityPrivilege.MANAGE,
      ],
    ) {
      const actor = await actors.tenantUser(tenantId, unit, label);
      const role = await prisma.role.create({
        data: { tenantId, key: `ws-${label}-${suffix}`, name: `WS ${label}` },
        select: { id: true },
      });
      const perms = [];
      for (const key of keys) {
        perms.push(
          await prisma.permission.upsert({
            where: { tenantId_key: { tenantId, key } },
            update: {},
            create: { tenantId, key, name: `${key} (${suffix})` },
            select: { id: true },
          }),
        );
      }
      await prisma.rolePermission.createMany({
        data: perms.map((p) => ({
          tenantId,
          roleId: role.id,
          permissionId: p.id,
        })),
      });
      await prisma.rolePrivilege.createMany({
        data: privileges.map((privilege) => ({
          tenantId,
          roleId: role.id,
          entityKey: ENTITY_KEYS.EMPLOYEES,
          privilege,
          accessLevel: level,
        })),
      });
      await prisma.userRole.create({
        data: { tenantId, userId: actor.id, roleId: role.id },
      });
      return actor;
    }

    const person = async (
      tenantId: string,
      unit: string,
      code: string,
      userId?: string,
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
            employmentStatus: 'ACTIVE',
            ...(userId ? { userId } : {}),
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
      fixtures = new DbFixtures(prisma, 'wscope');
      actors = new HttpActors(app, suffix);

      const a = await fixtures.createTenant('wsa');
      const b = await fixtures.createTenant('wsb');
      tenantA = a.id;
      tenantB = b.id;
      const orgA = await fixtures.createOrganization(tenantA);
      unitA = await fixtures.createBusinessUnit(tenantA, orgA);
      unitOther = await fixtures.createBusinessUnit(tenantA, orgA, 'other');
      const orgB = await fixtures.createOrganization(tenantB);
      const unitB = await fixtures.createBusinessUnit(tenantB, orgB);

      ana = await actorWith(
        tenantA,
        unitA,
        'ana',
        KEYS.employee,
        SecurityAccessLevel.SELF,
        [SecurityPrivilege.READ, SecurityPrivilege.WRITE],
      );
      bo = await actorWith(
        tenantA,
        unitA,
        'bo',
        KEYS.employee,
        SecurityAccessLevel.SELF,
        [SecurityPrivilege.READ, SecurityPrivilege.WRITE],
      );
      cy = await actorWith(
        tenantA,
        unitOther,
        'cy',
        KEYS.employee,
        SecurityAccessLevel.SELF,
        [SecurityPrivilege.READ, SecurityPrivilege.WRITE],
      );
      maya = await actorWith(
        tenantA,
        unitA,
        'maya',
        KEYS.manager,
        SecurityAccessLevel.BUSINESS_UNIT,
        [SecurityPrivilege.READ, SecurityPrivilege.WRITE],
      );
      hana = await actorWith(
        tenantA,
        unitA,
        'hana',
        KEYS.hr,
        SecurityAccessLevel.TENANT,
      );
      emp.ana = await person(tenantA, unitA, 'Ana', ana.id);
      emp.bo = await person(tenantA, unitA, 'Bo', bo.id);
      emp.cy = await person(tenantA, unitOther, 'Cy', cy.id);
      emp.maya = await person(tenantA, unitA, 'Maya', maya.id);
      emp.hana = await person(tenantA, unitA, 'Hana', hana.id);

      const team = await prisma.team.create({
        data: {
          tenantId: tenantA,
          name: `Desk ${suffix}`,
          key: `desk-${suffix}`,
        },
        select: { id: true },
      });
      teamId = team.id;
      await prisma.teamMember.create({
        data: { tenantId: tenantA, teamId, userId: ana.id },
      });

      adminB = await actors.tenantUser(tenantB, unitB, 'wsb-admin');
      const role = await prisma.role.create({
        data: {
          tenantId: tenantB,
          key: ROLE_KEYS.GLOBAL_ADMIN,
          name: 'Admin B',
        },
        select: { id: true },
      });
      await prisma.userRole.create({
        data: { tenantId: tenantB, userId: adminB.id, roleId: role.id },
      });
      void SYSTEM_ROLE_PRIVILEGES;
    });

    afterAll(async () => {
      try {
        const tenants = { in: [tenantA, tenantB] };
        await prisma.contributionEntry.deleteMany({
          where: { tenantId: tenants },
        });
        await prisma.workItem.deleteMany({ where: { tenantId: tenants } });
        await prisma.workQueue.deleteMany({ where: { tenantId: tenants } });
        await prisma.teamMember.deleteMany({ where: { tenantId: tenants } });
        await prisma.team.deleteMany({ where: { tenantId: tenants } });
        await prisma.employee.deleteMany({ where: { tenantId: tenants } });
        await actors.cleanup();
        await fixtures.cleanup();
      } finally {
        await app.close();
      }
    });

    // ------------------------------------------------------------ work items

    describe('work items follow the access level on the person', () => {
      it('an employee creating work with no owner gets it as its owner, and only they and their manager see it', async () => {
        const res = await call(ana, 'post', '/work-items', {
          kind: 'TASK',
          title: 'Ana plans',
        });
        expect(res.status).toBe(201);
        expect(res.body.ownerEmployeeId).toBe(emp.ana);
        const id = res.body.id as string;

        expect((await call(ana, 'get', `/work-items/${id}`)).status).toBe(200);
        expect((await call(maya, 'get', `/work-items/${id}`)).status).toBe(200);
        expect((await call(hana, 'get', `/work-items/${id}`)).status).toBe(200);
        // A colleague with the same permissions but SELF reach, and a person in
        // another business unit, are told it does not exist.
        expect((await call(bo, 'get', `/work-items/${id}`)).status).toBe(404);
        expect((await call(cy, 'get', `/work-items/${id}`)).status).toBe(404);
        expect((await call(adminB, 'get', `/work-items/${id}`)).status).toBe(
          404,
        );

        const list = await call(bo, 'get', '/work-items');
        expect(list.status).toBe(200);
        expect(list.body.items.map((i: { id: string }) => i.id)).not.toContain(
          id,
        );
      });

      it('work a manager creates for nobody in particular is theirs, so it shows in their own list', async () => {
        const made = await call(maya, 'post', '/work-items', {
          kind: 'TASK',
          title: 'Maya own default',
        });
        expect(made.status).toBe(201);
        expect(made.body.ownerEmployeeId).toBe(emp.maya);
        const mine = await call(maya, 'get', '/work-items?mine=true');
        expect(mine.body.items.map((i: { id: string }) => i.id)).toContain(
          made.body.id,
        );
      });

      it('an employee cannot assign work to someone else, create it for them, or change theirs', async () => {
        const own = await call(ana, 'post', '/work-items', {
          kind: 'TASK',
          title: 'Ana only',
        });
        const id = own.body.id as string;

        const forBo = await call(ana, 'post', '/work-items', {
          kind: 'TASK',
          title: 'For Bo',
          ownerEmployeeId: emp.bo,
        });
        expect(forBo.status).toBe(403);
        expect(forBo.body.code).toBe('WORK_ITEM_OUT_OF_SCOPE');

        const handOver = await call(ana, 'post', `/work-items/${id}/reassign`, {
          ownerEmployeeId: emp.bo,
        });
        expect(handOver.status).toBe(403);

        const boItem = await call(bo, 'post', '/work-items', {
          kind: 'TASK',
          title: 'Bo only',
        });
        const boId = boItem.body.id as string;
        for (const [method, path, body] of [
          ['patch', `/work-items/${boId}`, { title: 'hijack' }],
          ['post', `/work-items/${boId}/transition`, { to: 'IN_PROGRESS' }],
          ['post', `/work-items/${boId}/archive`, undefined],
        ] as const) {
          expect((await call(ana, method, path, body)).status).toBe(404);
        }
        expect((await call(bo, 'get', `/work-items/${boId}`)).body.title).toBe(
          'Bo only',
        );
      });

      it('a manager assigns and reassigns inside their business unit, not outside it; the chain is kept', async () => {
        const made = await call(maya, 'post', '/work-items', {
          kind: 'SERVICE_JOB',
          title: 'Fix the counter',
          ownerEmployeeId: emp.ana,
        });
        expect(made.status).toBe(201);
        const id = made.body.id as string;

        const moved = await call(maya, 'post', `/work-items/${id}/reassign`, {
          ownerEmployeeId: emp.bo,
          reason: 'Ana is out',
        });
        expect(moved.status).toBe(201);
        expect(moved.body.ownerEmployeeId).toBe(emp.bo);

        const outside = await call(maya, 'post', `/work-items/${id}/reassign`, {
          ownerEmployeeId: emp.cy,
        });
        expect(outside.status).toBe(403);

        const history = await call(
          maya,
          'get',
          `/work-items/${id}/owner-history`,
        );
        expect(history.status).toBe(200);
        expect(
          history.body.map(
            (h: { fromEmployeeId: string; toEmployeeId: string }) => [
              h.fromEmployeeId,
              h.toEmployeeId,
            ],
          ),
        ).toEqual([[emp.ana, emp.bo]]);
        // The new owner now sees it; the old one, no longer involved, does not.
        expect((await call(bo, 'get', `/work-items/${id}`)).status).toBe(200);
        expect((await call(ana, 'get', `/work-items/${id}`)).status).toBe(404);
      });

      it('"mine" is the work I own or share, and nothing else', async () => {
        const shared = await call(maya, 'post', '/work-items', {
          kind: 'TASK',
          title: 'Shared by Bo and Ana',
          ownerEmployeeId: emp.bo,
        });
        const id = shared.body.id as string;
        await call(maya, 'put', `/work-items/${id}/contributors/${emp.ana}`, {
          estimateMinutes: 30,
        });
        const mine = await call(ana, 'get', '/work-items?mine=true');
        const ids = mine.body.items.map((i: { id: string }) => i.id);
        expect(ids).toContain(id);
        const hers = await call(cy, 'get', '/work-items?mine=true');
        expect(hers.body.items.map((i: { id: string }) => i.id)).not.toContain(
          id,
        );
      });
    });

    // ---------------------------------------------------------------- queues

    describe('queues need no project and stamp their SLA onto each item', () => {
      let queueId: string;

      it('HR creates a team queue with an SLA; an employee cannot', async () => {
        const denied = await call(ana, 'post', '/work-queues', {
          key: `desk-${suffix}`,
          name: 'IT desk',
        });
        expect(denied.status).toBe(403);

        const made = await call(hana, 'post', '/work-queues', {
          key: `desk-${suffix}`,
          name: 'IT desk',
          teamId,
          responseSlaMinutes: 60,
          resolutionSlaMinutes: 240,
        });
        expect(made.status).toBe(201);
        queueId = made.body.id as string;

        const dupe = await call(hana, 'post', '/work-queues', {
          key: `desk-${suffix}`,
          name: 'again',
        });
        expect(dupe.status).toBe(409);
      });

      it('an unowned queued item is visible to the team and to managers, not to other employees, and is claimed once', async () => {
        const made = await call(hana, 'post', '/work-items', {
          kind: 'SERVICE_JOB',
          title: 'Printer jam',
          queueId,
        });
        expect(made.status).toBe(201);
        const id = made.body.id as string;
        expect(made.body.projectId).toBeNull();
        expect(made.body.ownerEmployeeId).toBeNull();
        expect(new Date(made.body.responseDueAt).getTime()).toBe(
          new Date(made.body.createdAt).getTime() + 60 * 60_000,
        );
        expect(new Date(made.body.resolutionDueAt).getTime()).toBe(
          new Date(made.body.createdAt).getTime() + 240 * 60_000,
        );
        expect(made.body.sla).toMatchObject({
          response: 'ON_TRACK',
          resolution: 'ON_TRACK',
        });

        // Ana is on the team; Bo is not.
        expect((await call(ana, 'get', `/work-items/${id}`)).status).toBe(200);
        expect((await call(bo, 'get', `/work-items/${id}`)).status).toBe(404);
        const unassigned = await call(
          ana,
          'get',
          `/work-items?queueId=${queueId}&unassigned=true`,
        );
        expect(unassigned.body.items.map((i: { id: string }) => i.id)).toEqual([
          id,
        ]);

        // Bo cannot claim what he cannot see.
        expect((await call(bo, 'post', `/work-items/${id}/claim`)).status).toBe(
          404,
        );
        const claimed = await call(ana, 'post', `/work-items/${id}/claim`);
        expect(claimed.status).toBe(201);
        expect(claimed.body.ownerEmployeeId).toBe(emp.ana);
        expect(claimed.body.respondedAt).not.toBeNull();
        expect(claimed.body.sla.response).toBe('MET');
        // Once owned it cannot be claimed again.
        expect(
          (await call(ana, 'post', `/work-items/${id}/claim`)).status,
        ).toBe(409);
      });

      it('a later change to the queue SLA does not rewrite what an item was promised', async () => {
        const made = await call(hana, 'post', '/work-items', {
          kind: 'SERVICE_JOB',
          title: 'Promised 240',
          queueId,
        });
        const before = made.body.resolutionDueAt as string;
        expect(
          (
            await call(hana, 'patch', `/work-queues/${queueId}`, {
              resolutionSlaMinutes: 10,
            })
          ).status,
        ).toBe(200);
        const after = await call(hana, 'get', `/work-items/${made.body.id}`);
        expect(after.body.resolutionDueAt).toBe(before);
        await call(hana, 'patch', `/work-queues/${queueId}`, {
          resolutionSlaMinutes: 240,
        });
      });

      it('overdue, at-risk and unassigned are counted; the summary only counts what the caller can see', async () => {
        const late = await call(hana, 'post', '/work-items', {
          kind: 'SERVICE_JOB',
          title: 'Already late',
          queueId,
        });
        await prisma.workItem.update({
          where: { id: late.body.id },
          data: {
            responseDueAt: new Date(Date.now() - 3_600_000),
            resolutionDueAt: new Date(Date.now() - 60_000),
          },
        });
        const risky = await call(hana, 'post', '/work-items', {
          kind: 'SERVICE_JOB',
          title: 'Nearly late',
          queueId,
        });
        await prisma.workItem.update({
          where: { id: risky.body.id },
          data: {
            createdAt: new Date(Date.now() - 3_000_000),
            resolutionDueAt: new Date(Date.now() + 300_000),
          },
        });

        const overdue = await call(
          hana,
          'get',
          `/work-items?queueId=${queueId}&overdue=true`,
        );
        expect(overdue.body.items.map((i: { id: string }) => i.id)).toContain(
          late.body.id,
        );
        expect(
          overdue.body.items.map((i: { id: string }) => i.id),
        ).not.toContain(risky.body.id);

        const full = await call(hana, 'get', `/work-queues/${queueId}/summary`);
        expect(full.status).toBe(200);
        expect(full.body.sla.breached).toBeGreaterThanOrEqual(1);
        expect(full.body.sla.atRisk).toBeGreaterThanOrEqual(1);
        expect(full.body.unassigned).toBeGreaterThanOrEqual(2);

        // Bo is not on the team, so for him the queue holds nothing visible.
        const narrow = await call(bo, 'get', `/work-queues/${queueId}/summary`);
        expect(narrow.status).toBe(200);
        expect(narrow.body.open).toBe(0);
      });

      it('moving an item out of a queue clears its promises; a queue is deactivated, never deleted', async () => {
        const made = await call(hana, 'post', '/work-items', {
          kind: 'TASK',
          title: 'Briefly queued',
          queueId,
        });
        const moved = await call(
          hana,
          'post',
          `/work-items/${made.body.id}/queue`,
          {},
        );
        expect(moved.status).toBe(201);
        expect(moved.body.queueId).toBeNull();
        expect(moved.body.resolutionDueAt).toBeNull();
        expect(moved.body.sla.resolution).toBe('NONE');

        expect(
          (await call(hana, 'delete', `/work-queues/${queueId}`)).status,
        ).toBe(404);
        const off = await call(hana, 'patch', `/work-queues/${queueId}`, {
          isActive: false,
        });
        expect(off.body.isActive).toBe(false);
        const refused = await call(hana, 'post', '/work-items', {
          kind: 'TASK',
          title: 'No queue',
          queueId,
        });
        expect(refused.status).toBe(400);
        await call(hana, 'patch', `/work-queues/${queueId}`, {
          isActive: true,
        });
      });

      it('a queue of another tenant is not reachable', async () => {
        const res = await call(adminB, 'post', '/work-items', {
          kind: 'TASK',
          title: 'wrong tenant',
          queueId,
        });
        expect(res.status).toBe(400);
      });
    });

    // --------------------------------------------------------------- ledger

    describe('the contribution ledger', () => {
      const day = '2026-10-05';
      const at = (hhmm: string) => `${day}T${hhmm}:00.000Z`;
      const interval = (from: string, to: string, extra: object = {}) => ({
        workKind: 'TASK',
        measure: 'INTERVAL',
        startsAt: at(from),
        endsAt: at(to),
        timezone: 'Asia/Karachi',
        note: 'recorded late on purpose, system test',
        ...extra,
      });
      const summary = (actor: HttpActor, employeeId?: string) =>
        call(
          actor,
          'get',
          `/contributions/summary?from=${at('00:00')}&to=${day}T23:59:00.000Z${
            employeeId ? `&employeeId=${employeeId}` : ''
          }`,
        );

      it('records each of the seven work types and takes provenance from who is calling', async () => {
        const kinds = [
          [
            'TASK',
            { measure: 'INTERVAL', startsAt: at('08:00'), endsAt: at('08:30') },
          ],
          [
            'TRANSACTION',
            {
              measure: 'QUANTITY',
              quantity: '42',
              unitKey: 'call',
              occurredAt: at('09:00'),
            },
          ],
          ['DUTY', { measure: 'OCCURRENCE', occurredAt: at('09:00') }],
          [
            'OUTPUT',
            {
              measure: 'QUANTITY',
              quantity: '80',
              unitKey: 'unit',
              occurredAt: at('10:00'),
            },
          ],
          [
            'SERVICE',
            { measure: 'INTERVAL', startsAt: at('10:00'), endsAt: at('10:20') },
          ],
          ['EVENT', { measure: 'OCCURRENCE', occurredAt: at('11:00') }],
          [
            'CONTRIBUTION',
            {
              measure: 'INTERVAL',
              startsAt: at('11:00'),
              endsAt: at('11:45'),
              category: 'MENTORING',
            },
          ],
        ] as const;
        for (const [workKind, shape] of kinds) {
          const res = await call(bo, 'post', '/contributions', {
            workKind,
            timezone: 'Asia/Karachi',
            note: 'recorded for the system test',
            ...shape,
          });
          expect(res.status).toBe(201);
          expect(res.body).toMatchObject({
            workKind,
            source: 'SELF_REPORT',
            verification: 'UNVERIFIED',
            employeeId: emp.bo,
            revision: 1,
          });
        }
        // A manager recording for someone else is supervision, not self-report.
        const supervised = await call(maya, 'post', '/contributions', {
          employeeId: emp.bo,
          ...interval('12:00', '12:30', { workKind: 'DUTY' }),
        });
        expect(supervised.status).toBe(201);
        expect(supervised.body.source).toBe('SUPERVISOR');
      });

      it('refuses what the client must not decide: provenance, verification, someone else, malformed shapes', async () => {
        const forged = await call(ana, 'post', '/contributions', {
          ...interval('08:00', '09:00'),
          source: 'SUPERVISOR',
          verification: 'VERIFIED',
        });
        expect(forged.status).toBe(400); // unknown fields are refused outright

        const forOther = await call(ana, 'post', '/contributions', {
          employeeId: emp.bo,
          ...interval('08:00', '09:00'),
        });
        expect(forOther.status).toBe(404);

        for (const bad of [
          { measure: 'INTERVAL', startsAt: at('09:00'), endsAt: at('09:00') },
          {
            measure: 'INTERVAL',
            startsAt: at('08:00'),
            endsAt: at('09:00'),
            quantity: '3',
            unitKey: 'unit',
          },
          {
            measure: 'QUANTITY',
            quantity: '0',
            unitKey: 'unit',
            occurredAt: at('09:00'),
          },
          { measure: 'QUANTITY', quantity: '5', occurredAt: at('09:00') },
          {
            measure: 'OCCURRENCE',
            startsAt: at('08:00'),
            occurredAt: at('09:00'),
          },
        ]) {
          const res = await call(ana, 'post', '/contributions', {
            workKind: 'TASK',
            timezone: 'UTC',
            note: 'a long enough reason for the system test',
            ...bad,
          });
          expect(res.status).toBe(400);
          expect(res.body.code).toBe('CONTRIBUTION_INVALID');
        }

        const future = await call(ana, 'post', '/contributions', {
          workKind: 'TASK',
          measure: 'OCCURRENCE',
          occurredAt: new Date(Date.now() + 3_600_000).toISOString(),
        });
        expect(future.body.code).toBe('CONTRIBUTION_FUTURE');
      });

      it('work recorded long after the fact needs a reason', async () => {
        const bare = await call(ana, 'post', '/contributions', {
          workKind: 'TASK',
          measure: 'OCCURRENCE',
          occurredAt: '2026-01-05T08:00:00.000Z',
        });
        expect(bare.status).toBe(400);
        expect(bare.body.code).toBe('CONTRIBUTION_RETROSPECTIVE_REASON');
        const reasoned = await call(ana, 'post', '/contributions', {
          workKind: 'TASK',
          measure: 'OCCURRENCE',
          occurredAt: '2026-01-05T08:00:00.000Z',
          note: 'Device was offline for the whole week',
        });
        expect(reasoned.status).toBe(201);
        expect(reasoned.body.retrospective).toBe(true);
      });

      it('an offline upload retried is one entry', async () => {
        const body = {
          workKind: 'DUTY',
          measure: 'OCCURRENCE',
          occurredAt: new Date(Date.now() - 600_000).toISOString(),
          capturedOffline: true,
          capturedAt: new Date(Date.now() - 600_000).toISOString(),
          clientRequestId: `offline-${suffix}-1`,
        };
        const first = await call(cy, 'post', '/contributions', body);
        const again = await call(cy, 'post', '/contributions', body);
        expect(first.status).toBe(201);
        expect(again.status).toBe(201);
        expect(again.body.id).toBe(first.body.id);
        expect(again.body.deduplicated).toBe(true);
        expect(
          await prisma.contributionEntry.count({
            where: { tenantId: tenantA, employeeId: emp.cy },
          }),
        ).toBe(1);
        // Two uploads racing do not make two entries either.
        const racing = { ...body, clientRequestId: `offline-${suffix}-2` };
        const both = await Promise.all([
          call(cy, 'post', '/contributions', racing),
          call(cy, 'post', '/contributions', racing),
        ]);
        expect(both.map((r) => r.status)).toEqual([201, 201]);
        expect(both[0].body.id).toBe(both[1].body.id);
      });

      it('counts overlapping evidence once and never turns a quantity into time', async () => {
        // Hana is a fresh person with a clean day.
        const record = (body: object) =>
          call(hana, 'post', '/contributions', body);
        const a = await record(interval('09:00', '11:00'));
        const b = await record(interval('10:00', '12:00'));
        await record({
          workKind: 'OUTPUT',
          measure: 'QUANTITY',
          quantity: '80',
          unitKey: 'unit',
          occurredAt: at('13:00'),
          note: 'system test output count',
        });
        await record({
          workKind: 'OUTPUT',
          measure: 'QUANTITY',
          quantity: '12.5',
          unitKey: 'unit',
          occurredAt: at('14:00'),
          note: 'system test output count',
        });
        expect([a.status, b.status]).toEqual([201, 201]);

        // Nobody has verified anything yet: all of it is unverified, and the two
        // overlapping hours are three hours, not four.
        const before = await summary(hana);
        expect(before.status).toBe(200);
        expect(before.body.time).toMatchObject({
          verifiedMinutes: 0,
          unverifiedMinutes: 180,
          overlapRemovedMinutes: 60,
        });
        expect(before.body.quantities).toEqual([
          { unitKey: 'unit', verified: '0', unverified: '92.5', disputed: '0' },
        ]);

        // A reviewer verifies the first entry; the second now only adds the hour
        // the first does not cover.
        const verified = await call(
          maya,
          'post',
          `/contributions/${a.body.id}/review`,
          {
            decision: 'VERIFIED',
          },
        );
        expect(verified.status).toBe(201);
        const after = await summary(hana);
        expect(after.body.time).toMatchObject({
          verifiedMinutes: 120,
          unverifiedMinutes: 60,
          overlapRemovedMinutes: 60,
        });
      });

      it('nobody reviews their own record; a reject or dispute needs a reason; an employee cannot verify', async () => {
        const own = await call(maya, 'post', '/contributions', {
          workKind: 'TASK',
          measure: 'OCCURRENCE',
          occurredAt: new Date(Date.now() - 60_000).toISOString(),
        });
        const self = await call(
          maya,
          'post',
          `/contributions/${own.body.id}/review`,
          {
            decision: 'VERIFIED',
          },
        );
        expect(self.status).toBe(403);
        expect(self.body.code).toBe('CONTRIBUTION_SELF_REVIEW');

        const theirs = await call(bo, 'post', '/contributions', {
          workKind: 'TASK',
          measure: 'OCCURRENCE',
          occurredAt: new Date(Date.now() - 60_000).toISOString(),
        });
        const silent = await call(
          maya,
          'post',
          `/contributions/${theirs.body.id}/review`,
          {
            decision: 'REJECTED',
          },
        );
        expect(silent.body.code).toBe('CONTRIBUTION_NOTE_REQUIRED');
        expect(
          (
            await call(ana, 'post', `/contributions/${theirs.body.id}/review`, {
              decision: 'VERIFIED',
            })
          ).status,
        ).toBe(403);
        const rejected = await call(
          maya,
          'post',
          `/contributions/${theirs.body.id}/review`,
          {
            decision: 'REJECTED',
            note: 'Not on my roster that day',
          },
        );
        expect(rejected.body.verification).toBe('REJECTED');
      });

      it('an employee can see, dispute and correct their own entry; the correction is a new revision and the old one stays', async () => {
        const first = await call(bo, 'post', '/contributions', {
          ...interval('15:00', '16:00'),
        });
        const id = first.body.id as string;
        await call(maya, 'post', `/contributions/${id}/review`, {
          decision: 'VERIFIED',
        });

        // Only the person it concerns can dispute it.
        expect(
          (
            await call(cy, 'post', `/contributions/${id}/dispute`, {
              reason: 'not mine to say',
            })
          ).status,
        ).toBe(404);
        const disputed = await call(
          bo,
          'post',
          `/contributions/${id}/dispute`,
          {
            reason: 'I stopped at half past three',
          },
        );
        expect(disputed.body.verification).toBe('DISPUTED');

        const corrected = await call(
          bo,
          'post',
          `/contributions/${id}/correct`,
          {
            endsAt: at('15:30'),
            reason: 'I stopped at half past three',
          },
        );
        expect(corrected.status).toBe(201);
        expect(corrected.body).toMatchObject({
          revision: 2,
          supersedesId: id,
          verification: 'UNVERIFIED',
          correctionReason: 'I stopped at half past three',
        });

        const old = await prisma.contributionEntry.findUniqueOrThrow({
          where: { id },
        });
        expect(old.state).toBe('SUPERSEDED');
        // Corrections cannot be applied twice to a superseded revision.
        expect(
          (
            await call(bo, 'post', `/contributions/${id}/correct`, {
              reason: 'again please',
              endsAt: at('15:20'),
            })
          ).body.code,
        ).toBe('CONTRIBUTION_NOT_CURRENT');

        const detail = await call(
          bo,
          'get',
          `/contributions/${corrected.body.id}`,
        );
        expect(
          detail.body.history.map((h: { revision: number }) => h.revision),
        ).toEqual([1, 2]);

        // Both revisions exist in the audit trail.
        expect(
          await prisma.auditLog.count({
            where: {
              tenantId: tenantA,
              entityType: 'ContributionEntry',
              action: 'CONTRIBUTION_CORRECTED',
              entityId: corrected.body.id,
            },
          }),
        ).toBe(1);
      });

      it('a withdrawn entry stays in history and counts for nothing', async () => {
        const made = await call(cy, 'post', '/contributions', {
          ...interval('17:00', '18:00'),
        });
        const withdrawn = await call(
          cy,
          'post',
          `/contributions/${made.body.id}/withdraw`,
          {
            reason: 'recorded by mistake',
          },
        );
        expect(withdrawn.body.state).toBe('WITHDRAWN');
        const s = await summary(cy);
        expect(s.body.time.unverifiedMinutes).toBe(0);
        const history = await call(
          cy,
          'get',
          '/contributions?includeHistory=true',
        );
        expect(history.body.items.map((i: { id: string }) => i.id)).toContain(
          made.body.id,
        );
        const current = await call(cy, 'get', '/contributions');
        expect(
          current.body.items.map((i: { id: string }) => i.id),
        ).not.toContain(made.body.id);
      });

      it('whose evidence you can read follows your reach, and nothing crosses tenants', async () => {
        const mineOnly = await call(ana, 'get', '/contributions?take=200');
        expect(
          mineOnly.body.items.every(
            (i: { employeeId: string }) => i.employeeId === emp.ana,
          ),
        ).toBe(true);
        const peek = await summary(ana, emp.bo);
        expect(peek.status).toBe(404);

        const team = await call(maya, 'get', '/contributions?take=200');
        const people = new Set(
          team.body.items.map((i: { employeeId: string }) => i.employeeId),
        );
        expect(people.has(emp.bo)).toBe(true);
        expect(people.has(emp.cy)).toBe(false); // another business unit

        const all = await call(hana, 'get', '/contributions?take=200');
        expect(
          new Set(
            all.body.items.map((i: { employeeId: string }) => i.employeeId),
          ).has(emp.cy),
        ).toBe(true);

        expect(
          (await call(adminB, 'get', '/contributions?take=200')).body.items,
        ).toEqual([]);
        const someone = await prisma.contributionEntry.findFirstOrThrow({
          where: { tenantId: tenantA },
          select: { id: true },
        });
        expect(
          (await call(adminB, 'get', `/contributions/${someone.id}`)).status,
        ).toBe(404);
      });
    });
  },
);
