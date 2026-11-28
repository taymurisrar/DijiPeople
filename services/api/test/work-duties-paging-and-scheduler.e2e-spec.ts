/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return -- supertest response bodies are untyped JSON */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { WorkDutiesService } from '../src/modules/work-items/work-duties.service';
import { WorkDutyGenerationScheduler } from '../src/modules/work-items/work-duty-generation.scheduler';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { HttpActors, type HttpActor } from './helpers/http-actors';
import { scopedActor } from './helpers/scoped-actors';

/**
 * DP-MASTER WP-36.S2: the occurrence list is paged in the database-facing layer
 * with an exact visible total (no cap-then-filter), and the duty generation
 * scheduler is idempotent, isolates a failing tenant, takes a per-tenant lock and
 * writes its audit as the system.
 */
describeWithDatabase()('Duty paging and generation scheduler (e2e)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  let scheduler: WorkDutyGenerationScheduler;
  let duties: WorkDutiesService;
  let tenantId: string;
  let otherTenantId: string;
  let ana: HttpActor; // SELF, unit A
  let bo: HttpActor; // SELF, unit A
  let cy: HttpActor; // SELF, unit B
  let maya: HttpActor; // BUSINESS_UNIT, unit A
  let outsider: HttpActor; // other tenant, TENANT level
  const emp: Record<string, string> = {};
  const suffix = randomUUID().slice(0, 6);
  const keys = ['work-items.read', 'work-items.write'];
  const rw = [SecurityPrivilege.READ, SecurityPrivilege.WRITE];

  const call = (actor: HttpActor, method: 'get' | 'post', path: string) =>
    request(app.getHttpServer())
      [method](path)
      .set('Authorization', `Bearer ${actor.token}`)
      .set('X-DijiPeople-App', 'web');

  const addDays = (n: number) =>
    new Date(Date.UTC(2027, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);

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
    scheduler = app.get(WorkDutyGenerationScheduler);
    duties = app.get(WorkDutiesService);
    fixtures = new DbFixtures(prisma, 'wdpage');
    actors = new HttpActors(app, suffix);
    const tenant = await fixtures.createTenant('wdpage');
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
    const other = await fixtures.createTenant('wdpagex');
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
    emp.outsider = made.employeeId;
  });

  afterAll(async () => {
    try {
      jest.restoreAllMocks();
      for (const id of [tenantId, otherTenantId]) {
        if (!id) continue;
        await prisma.dutyTemplate.deleteMany({ where: { tenantId: id } });
        await prisma.workItem.deleteMany({ where: { tenantId: id } });
        await prisma.employee.deleteMany({ where: { tenantId: id } });
      }
      await actors.cleanup();
      await fixtures.cleanup();
    } finally {
      await app.close();
    }
  });

  /** Direct inserts: 2 templates x `perTemplate` dates, owners rotating ana, bo, cy. */
  const seedOccurrences = async (
    forTenant: string,
    owners: string[],
    perTemplate: number,
  ) => {
    const templates: string[] = [];
    for (const n of [1, 2]) {
      templates.push(
        (
          await prisma.dutyTemplate.create({
            data: {
              tenantId: forTenant,
              key: `page-${n}-${suffix}`,
              name: `Page ${n}`,
              weekdays: [1, 2, 3, 4, 5, 6, 7],
              timezone: 'UTC',
            },
            select: { id: true },
          })
        ).id,
      );
    }
    const itemRows: Array<{
      id: string;
      tenantId: string;
      kind: 'DUTY_OCCURRENCE';
      title: string;
      ownerEmployeeId: string;
    }> = [];
    const occurrenceRows: Array<{
      tenantId: string;
      dutyTemplateId: string;
      forDate: Date;
      workItemId: string;
    }> = [];
    let i = 0;
    for (let d = 0; d < perTemplate; d += 1) {
      for (const dutyTemplateId of templates) {
        const id = randomUUID();
        itemRows.push({
          id,
          tenantId: forTenant,
          kind: 'DUTY_OCCURRENCE',
          title: `Item ${i}`,
          ownerEmployeeId: owners[i % owners.length],
        });
        occurrenceRows.push({
          tenantId: forTenant,
          dutyTemplateId,
          forDate: new Date(`${addDays(d)}T00:00:00.000Z`),
          workItemId: id,
        });
        i += 1;
      }
    }
    for (let at = 0; at < itemRows.length; at += 1000) {
      await prisma.workItem.createMany({
        data: itemRows.slice(at, at + 1000),
      });
      await prisma.dutyOccurrence.createMany({
        data: occurrenceRows.slice(at, at + 1000),
      });
    }
    // Bulk-loaded rows have no statistics yet; autovacuum would analyse them in
    // production, and without it the planner picks a bad plan for the first list.
    await prisma.$executeRawUnsafe('ANALYZE "WorkItem", "DutyOccurrence"');
    return itemRows;
  };

  /** Every id the API returns for an actor, paged with the given page size. */
  const walk = async (actor: HttpActor, take: number, extra = '') => {
    const ids: string[] = [];
    const totals = new Set<number>();
    for (let skip = 0; ; skip += take) {
      const res = await call(
        actor,
        'get',
        `/work-duties/occurrences?take=${take}&skip=${skip}${extra}`,
      );
      expect(res.status).toBe(200);
      const body = res.body as { total: number; items: Array<{ id: string }> };
      totals.add(body.total);
      ids.push(...body.items.map((x) => x.id));
      if (body.items.length === 0 || body.items.length < take) break;
    }
    return { ids, totals };
  };

  it('pages visible occurrences exactly: mixed visibility, page boundaries, chunk boundaries, other tenant excluded', async () => {
    // 2 x 1150 = 2300 occurrences: more than two internal chunks of 1000.
    const items = await seedOccurrences(
      tenantId,
      [emp.ana, emp.bo, emp.cy],
      1150,
    );
    const ownerOf = new Map(items.map((r) => [r.id, r.ownerEmployeeId]));
    // The other tenant has occurrences for ITS people, same template keys and dates.
    await seedOccurrences(otherTenantId, [emp.outsider], 5);

    // Truth, computed without the visibility code under test.
    const all = await prisma.dutyOccurrence.findMany({
      where: { tenantId },
      select: { id: true, workItemId: true },
      orderBy: [{ forDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(all).toHaveLength(2300);
    const expectedFor = (people: string[]) =>
      all
        .filter((o) => people.includes(ownerOf.get(o.workItemId) as string))
        .map((o) => o.id);

    const cases: Array<[string, HttpActor, string[], number]> = [
      ['ana (SELF)', ana, expectedFor([emp.ana]), 100],
      ['bo (SELF), odd page size', bo, expectedFor([emp.bo]), 37],
      ['cy (SELF)', cy, expectedFor([emp.cy]), 100],
      ['maya (unit A)', maya, expectedFor([emp.ana, emp.bo]), 100],
    ];
    for (const [label, actor, expected, take] of cases) {
      const { ids, totals } = await walk(actor, take);
      // Exact visible total on every page, not the cap, not the candidate count.
      expect([label, [...totals]]).toEqual([label, [expected.length]]);
      // Same rows, same order, no duplicates and nothing skipped between pages.
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toEqual(expected);
    }
    // Visibility is genuinely mixed.
    expect(expectedFor([emp.ana]).length).toBeGreaterThan(120);
    expect(expectedFor([emp.ana]).length).toBeLessThan(2300 / 2);

    // Query count is constant per request: it does not grow with the page number.
    const countCalls = async (skip: number) => {
      const occ = jest.spyOn(prisma.dutyOccurrence, 'findMany');
      const cnt = jest.spyOn(prisma.dutyOccurrence, 'count');
      const wi = jest.spyOn(prisma.workItem, 'findMany');
      const res = await call(
        ana,
        'get',
        `/work-duties/occurrences?take=100&skip=${skip}`,
      );
      expect(res.status).toBe(200);
      const seen = [
        occ.mock.calls.length,
        cnt.mock.calls.length,
        wi.mock.calls.length,
      ];
      jest.restoreAllMocks();
      return seen;
    };
    const first = await countCalls(0);
    expect(first.slice(0, 2)).toEqual([1, 1]);
    expect(await countCalls(500)).toEqual(first);
    expect(await countCalls(700)).toEqual(first);

    // A page that straddles the end, a page past the end, and the first page.
    const total = expectedFor([emp.ana]).length;
    const straddle = await call(
      ana,
      'get',
      `/work-duties/occurrences?take=100&skip=${total - 5}`,
    );
    expect(straddle.body.items).toHaveLength(5);
    expect(straddle.body.total).toBe(total);
    const past = await call(
      ana,
      'get',
      `/work-duties/occurrences?take=100&skip=${total}`,
    );
    expect(past.body).toEqual({ items: [], total });

    // Filters narrow both the page and the total.
    const day = addDays(10);
    const filtered = await call(
      maya,
      'get',
      `/work-duties/occurrences?date=${day}&take=100`,
    );
    const onDay = await prisma.dutyOccurrence.findMany({
      where: { tenantId, forDate: new Date(`${day}T00:00:00.000Z`) },
      select: { workItemId: true },
    });
    expect(filtered.body.total).toBe(
      onDay.filter((o) =>
        [emp.ana, emp.bo].includes(ownerOf.get(o.workItemId) as string),
      ).length,
    );
    expect(filtered.body.items.every((x: any) => x.forDate === day)).toBe(true);

    // Another tenant sees only its own five-times-two occurrences, never ours.
    const theirs = await walk(outsider, 100);
    expect(theirs.ids).toHaveLength(10);
    expect([...theirs.totals]).toEqual([10]);
    const mine = new Set(all.map((o) => o.id));
    expect(theirs.ids.some((id) => mine.has(id))).toBe(false);
  });

  it('the open-handover list is paged in the database with an exact total', async () => {
    // Already skip/take + count in SQL; this pins that it stays that way.
    const res = await call(maya, 'get', '/work-duties/handovers?take=1&skip=0');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], total: 0 });
  });

  it('searches templates by name or key inside the tenant, so none is out of reach of a lookup', async () => {
    const tag = `srch${suffix}`;
    await prisma.dutyTemplate.createMany({
      data: [
        {
          tenantId,
          key: `${tag}-alpha`,
          name: 'Zebra opening',
          weekdays: [1],
          timezone: 'UTC',
          assigneeEmployeeId: emp.maya,
        },
        {
          tenantId,
          key: `other-${suffix}`,
          name: `Closing ${tag.toUpperCase()}`,
          weekdays: [1],
          timezone: 'UTC',
          assigneeEmployeeId: emp.maya,
        },
        {
          tenantId: otherTenantId,
          key: `${tag}-foreign`,
          name: 'Foreign opening',
          weekdays: [1],
          timezone: 'UTC',
        },
      ],
    });
    const found = await call(
      maya,
      'get',
      `/work-duties/templates?search=${tag}&take=20`,
    );
    expect(found.status).toBe(200);
    const keys = (found.body.items as Array<{ key: string }>).map((t) => t.key);
    // matched on the key (case-insensitively) and on the name; the other tenant's is never offered
    expect(keys.sort()).toEqual([`${tag}-alpha`, `other-${suffix}`].sort());
    expect(found.body.total).toBe(2);
    const none = await call(
      maya,
      'get',
      `/work-duties/templates?search=${tag}-nomatch`,
    );
    expect(none.body).toEqual({ items: [], total: 0 });
    const tooLong = await call(
      maya,
      'get',
      `/work-duties/templates?search=${'x'.repeat(101)}`,
    );
    expect(tooLong.status).toBe(400);
  });

  describe('generation scheduler', () => {
    const monday = new Date('2027-03-01T10:00:00.000Z'); // a Monday
    let templateIds: string[] = [];

    const makeTemplates = async (
      forTenant: string,
      count: number,
      tag: string,
    ) => {
      const ids: string[] = [];
      for (let n = 0; n < count; n += 1) {
        ids.push(
          (
            await prisma.dutyTemplate.create({
              data: {
                tenantId: forTenant,
                key: `sch-${tag}-${n}-${suffix}`,
                name: `Sched ${tag} ${n}`,
                weekdays: [1, 2, 3, 4, 5, 6, 7],
                timezone: 'UTC',
                assigneeEmployeeId: forTenant === tenantId ? emp.ana : null,
              },
              select: { id: true },
            })
          ).id,
        );
      }
      return ids;
    };
    const countFor = (forTenant: string, ids: string[]) =>
      prisma.dutyOccurrence.count({
        where: { tenantId: forTenant, dutyTemplateId: { in: ids } },
      });

    beforeAll(async () => {
      // Quiet the paging fixtures: only the templates created here are active.
      await prisma.dutyTemplate.updateMany({
        where: { tenantId: { in: [tenantId, otherTenantId] } },
        data: { isActive: false },
      });
      templateIds = await makeTemplates(tenantId, 2, 'a');
    });

    afterEach(() => jest.restoreAllMocks());

    it('is off unless WORK_DUTY_GENERATION_ENABLED is true', () => {
      expect(scheduler.isEnabled()).toBe(false);
    });

    it('runs twice and still leaves one occurrence per template and date, audited as the system', async () => {
      const first = await scheduler.tick({
        now: monday,
        daysAhead: 2,
        tenantIds: [tenantId],
      });
      expect(first).toMatchObject({
        tenants: 1,
        created: 4,
        existing: 0,
        failed: 0,
        lockedOut: 0,
      });
      const second = await scheduler.tick({
        now: monday,
        daysAhead: 2,
        tenantIds: [tenantId],
      });
      expect(second).toMatchObject({
        created: 0,
        existing: 4,
        failed: 0,
      });
      expect(await countFor(tenantId, templateIds)).toBe(4);
      const dates = (
        await prisma.dutyOccurrence.findMany({
          where: { tenantId, dutyTemplateId: templateIds[0] },
          select: { forDate: true },
          orderBy: { forDate: 'asc' },
        })
      ).map((o) => o.forDate.toISOString().slice(0, 10));
      expect(dates).toEqual(['2027-03-01', '2027-03-02']);

      // The work item belongs to the assignee, was created by the system, and the
      // audit row names no user but says where it came from.
      const occurrence = await prisma.dutyOccurrence.findFirstOrThrow({
        where: { tenantId, dutyTemplateId: templateIds[0] },
        select: { id: true, workItemId: true },
      });
      const item = await prisma.workItem.findFirstOrThrow({
        where: { id: occurrence.workItemId, tenantId },
        select: { createdById: true, ownerEmployeeId: true },
      });
      expect(item).toEqual({ createdById: null, ownerEmployeeId: emp.ana });
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: {
          tenantId,
          action: 'DUTY_OCCURRENCE_GENERATED',
          entityId: occurrence.id,
        },
        select: { actorUserId: true, sourceModule: true },
      });
      expect(audit).toEqual({
        actorUserId: null,
        sourceModule: 'work-duties.scheduler',
      });
    });

    it('bounds how far ahead it generates', async () => {
      const only = await makeTemplates(tenantId, 1, 'far');
      await scheduler.tick({
        now: monday,
        daysAhead: 500,
        tenantIds: [tenantId],
      });
      expect(await countFor(tenantId, only)).toBe(14);
      await prisma.dutyTemplate.updateMany({
        where: { id: { in: only } },
        data: { isActive: false },
      });
    });

    it("generates each template for its own zone's local today, idempotently", async () => {
      // 12:00 UTC on Mon 2027-03-01 is already Tue 2027-03-02 in Auckland and
      // still Mon 2027-03-01 in Los Angeles.
      const instant = new Date('2027-03-01T12:00:00.000Z');
      const mk = async (tz: string, tag: string) =>
        (
          await prisma.dutyTemplate.create({
            data: {
              tenantId,
              key: `tz-${tag}-${suffix}`,
              name: `Zone ${tag}`,
              weekdays: [1, 2, 3, 4, 5, 6, 7],
              timezone: tz,
              assigneeEmployeeId: emp.ana,
            },
            select: { id: true },
          })
        ).id;
      const auckland = await mk('Pacific/Auckland', 'akl');
      const la = await mk('America/Los_Angeles', 'la');
      const datesOf = async (id: string) =>
        (
          await prisma.dutyOccurrence.findMany({
            where: { tenantId, dutyTemplateId: id },
            select: { forDate: true },
            orderBy: { forDate: 'asc' },
          })
        ).map((o) => o.forDate.toISOString().slice(0, 10));
      try {
        await scheduler.tick({
          now: instant,
          daysAhead: 2,
          tenantIds: [tenantId],
        });
        expect(await datesOf(auckland)).toEqual(['2027-03-02', '2027-03-03']);
        expect(await datesOf(la)).toEqual(['2027-03-01', '2027-03-02']);
        const again = await scheduler.tick({
          now: instant,
          daysAhead: 2,
          tenantIds: [tenantId],
        });
        expect(again.failed).toBe(0);
        expect(await datesOf(auckland)).toHaveLength(2);
        expect(await datesOf(la)).toHaveLength(2);
      } finally {
        await prisma.dutyTemplate.updateMany({
          where: { id: { in: [auckland, la] } },
          data: { isActive: false },
        });
      }
    });

    it('one tenant failing does not stop another, and is counted', async () => {
      const theirs = await makeTemplates(otherTenantId, 1, 'x');
      const real = duties.generateForTenantAsSystem.bind(duties);
      jest
        .spyOn(duties, 'generateForTenantAsSystem')
        .mockImplementation((tid: string, date: string) => {
          if (tid === tenantId) return Promise.reject(new Error('boom'));
          return real(tid, date);
        });
      const before = await countFor(tenantId, templateIds);
      const result = await scheduler.tick({
        now: new Date('2027-03-08T10:00:00.000Z'),
        tenantIds: [tenantId, otherTenantId],
      });
      expect(result).toMatchObject({ tenants: 2, failed: 1 });
      expect(result.created).toBe(1);
      expect(await countFor(otherTenantId, theirs)).toBe(1);
      expect(await countFor(tenantId, templateIds)).toBe(before);
    });

    it('skips a tenant another instance is already generating for, then catches up', async () => {
      const day = new Date('2027-03-15T10:00:00.000Z');
      let during: Awaited<ReturnType<typeof scheduler.tick>> | undefined;
      await prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`work-duty-generation:${tenantId}`}))`;
          during = await scheduler.tick({ now: day, tenantIds: [tenantId] });
        },
        { timeout: 120_000 },
      );
      expect(during).toMatchObject({ lockedOut: 1, created: 0, failed: 0 });
      expect(
        await prisma.dutyOccurrence.count({
          where: {
            tenantId,
            dutyTemplateId: { in: templateIds },
            forDate: new Date('2027-03-15T00:00:00.000Z'),
          },
        }),
      ).toBe(0);
      const after = await scheduler.tick({ now: day, tenantIds: [tenantId] });
      expect(after).toMatchObject({ lockedOut: 0, created: 2, failed: 0 });
    });
  });
});
