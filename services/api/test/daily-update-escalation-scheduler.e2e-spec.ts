/* eslint-disable @typescript-eslint/no-unsafe-assignment -- the fake config and dispatch spy calls are untyped */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import type { App } from 'supertest/types';
import { randomUUID } from 'node:crypto';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { DailyUpdateEscalationScheduler } from '../src/modules/daily-updates/daily-update-escalation.scheduler';
import { DailyUpdatesService } from '../src/modules/daily-updates/daily-updates.service';
import { NotificationOrchestratorService } from '../src/modules/notifications/notification-orchestrator.service';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';
import { HttpActors } from './helpers/http-actors';
import { scopedActor } from './helpers/scoped-actors';

/**
 * DP-MASTER WP-27.S3: the missed-update escalation scheduler. It is off unless
 * WORK_DAILY_UPDATE_ESCALATION_ENABLED=true; a tick notifies each missed day once
 * however often it runs; one tenant failing does not stop another; each person is
 * judged by the time zone of the policy that governs them; and a tenant with no
 * escalating policy is never visited.
 */
describeWithDatabase()('Daily-update escalation scheduler (e2e)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fixtures: DbFixtures;
  let actors: HttpActors;
  let scheduler: DailyUpdateEscalationScheduler;
  let service: DailyUpdatesService;
  let orchestrator: NotificationOrchestratorService;
  let tenantA: string;
  let tenantB: string;
  let tenantC: string;
  const emp: Record<string, string> = {};
  const suffix = randomUUID().slice(0, 6);
  const MON = '2026-11-09';
  const TUE = '2026-11-10';
  // Monday 20:00 UTC: past a UTC 18:00 deadline plus a 60 minute window.
  const NOW = new Date('2026-11-09T20:00:00.000Z');
  const keys = ['daily-updates.read', 'daily-updates.write'];
  const rw = [SecurityPrivilege.READ, SecurityPrivilege.WRITE];
  const created: string[] = [];

  const policy = (
    tenantId: string,
    businessUnitId: string,
    extra: Record<string, unknown> = {},
  ) =>
    prisma.dailyUpdateScopePolicy.create({
      data: {
        tenantId,
        businessUnitId,
        enabled: true,
        cadence: 'WORKING_DAYS',
        workingDays: [1, 2, 3, 4, 5],
        deadlineMinutes: 1080,
        timezone: 'UTC',
        requireAcknowledgement: false,
        escalateAfterMinutes: 60,
        ...extra,
      },
    });

  const rows = (tenantId: string, employeeId: string, date: string) =>
    prisma.dailyUpdateEscalation.count({
      where: {
        tenantId,
        employeeId,
        forDate: new Date(`${date}T00:00:00.000Z`),
      },
    });

  let dispatchSpy: jest.SpyInstance;
  const sentFor = (employeeId: string, date: string) =>
    dispatchSpy.mock.calls.filter(
      ([input]) =>
        (input as { correlationId?: string }).correlationId ===
        `${employeeId}:${date}`,
    ).length;

  const person = async (
    tenantId: string,
    unit: string,
    label: string,
    managerEmployeeId?: string,
  ) => {
    const made = await scopedActor(prisma, actors, {
      tenantId,
      unit,
      label,
      suffix,
      keys,
      level: SecurityAccessLevel.SELF,
      privileges: rw,
      employee: managerEmployeeId ? { managerEmployeeId } : {},
    });
    emp[label] = made.employeeId;
    return made.actor;
  };

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
    scheduler = app.get(DailyUpdateEscalationScheduler);
    service = app.get(DailyUpdatesService);
    orchestrator = app.get(NotificationOrchestratorService);
    fixtures = new DbFixtures(prisma, 'dues');
    actors = new HttpActors(app, suffix);
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

    // Tenant A: a UTC unit and an Auckland unit, both escalating after 60 minutes.
    const a = await fixtures.createTenant('dues');
    tenantA = a.id;
    const orgA = await fixtures.createOrganization(tenantA);
    const utcUnit = await fixtures.createBusinessUnit(tenantA, orgA, 'utc');
    const nzUnit = await fixtures.createBusinessUnit(tenantA, orgA, 'nz');
    await policy(tenantA, utcUnit);
    await policy(tenantA, nzUnit, { timezone: 'Pacific/Auckland' });
    await person(tenantA, utcUnit, 'mgrA');
    await person(tenantA, utcUnit, 'utcA', emp.mgrA);
    await person(tenantA, nzUnit, 'nzA', emp.mgrA);

    // Tenant B: one escalating UTC unit.
    const b = await fixtures.createTenant('duesb');
    tenantB = b.id;
    const orgB = await fixtures.createOrganization(tenantB);
    const unitB = await fixtures.createBusinessUnit(tenantB, orgB);
    await policy(tenantB, unitB);
    await person(tenantB, unitB, 'mgrB');
    await person(tenantB, unitB, 'utcB', emp.mgrB);

    // Tenant C: a policy that never escalates.
    const c = await fixtures.createTenant('duesc');
    tenantC = c.id;
    const orgC = await fixtures.createOrganization(tenantC);
    const unitC = await fixtures.createBusinessUnit(tenantC, orgC);
    await policy(tenantC, unitC, { escalateAfterMinutes: null });
    await person(tenantC, unitC, 'mgrC');
    await person(tenantC, unitC, 'utcC', emp.mgrC);
    created.push(tenantA, tenantB, tenantC);
  });

  beforeEach(() => {
    dispatchSpy = jest.spyOn(orchestrator, 'dispatch');
  });

  afterEach(async () => {
    dispatchSpy.mockRestore();
    jest.restoreAllMocks();
    // Each test starts from a day nobody has been escalated for.
    await prisma.dailyUpdateEscalation.deleteMany({
      where: { tenantId: { in: created } },
    });
  });

  afterAll(async () => {
    try {
      for (const id of created) {
        await prisma.dailyUpdateEscalation.deleteMany({
          where: { tenantId: id },
        });
        await prisma.dailyUpdateScopePolicy.deleteMany({
          where: { tenantId: id },
        });
        await prisma.notification.deleteMany({ where: { tenantId: id } });
        await prisma.employee.deleteMany({ where: { tenantId: id } });
      }
      await actors.cleanup();
      await fixtures.cleanup();
    } finally {
      await app.close();
    }
  });

  it('is off by default and starts no timer', () => {
    expect(scheduler.isEnabled()).toBe(false);
    scheduler.onModuleInit();
    expect((scheduler as unknown as { timer: unknown }).timer).toBeNull();

    const on = new DailyUpdateEscalationScheduler(
      { get: () => 'true' } as unknown as ConfigService,
      prisma,
      service,
    );
    expect(on.isEnabled()).toBe(true);
    on.onModuleInit();
    expect((on as unknown as { timer: unknown }).timer).not.toBeNull();
    on.onModuleDestroy();
    expect((on as unknown as { timer: unknown }).timer).toBeNull();

    const other = new DailyUpdateEscalationScheduler(
      { get: () => 'yes' } as unknown as ConfigService,
      prisma,
      service,
    );
    expect(other.isEnabled()).toBe(false);
  });

  it('two ticks notify a missed day once', async () => {
    const first = await scheduler.tick({ now: NOW, tenantIds: [tenantB] });
    expect(first.tenants).toBe(1);
    expect(first.escalated).toBeGreaterThanOrEqual(1);
    expect(await rows(tenantB, emp.utcB, MON)).toBe(1);
    expect(sentFor(emp.utcB, MON)).toBe(1);

    const second = await scheduler.tick({ now: NOW, tenantIds: [tenantB] });
    expect(second.escalated).toBe(0);
    expect(second.alreadyEscalated).toBeGreaterThanOrEqual(1);
    expect(sentFor(emp.utcB, MON)).toBe(1);
    expect(await rows(tenantB, emp.utcB, MON)).toBe(1);

    // It reached the manager, in the app.
    const manager = await prisma.employee.findFirstOrThrow({
      where: { id: emp.mgrB, tenantId: tenantB },
      select: { userId: true },
    });
    expect(
      await prisma.notification.count({
        where: {
          tenantId: tenantB,
          eventCode: 'work.daily-update.missed',
          recipients: { some: { userId: manager.userId as string } },
        },
      }),
    ).toBe(1);
  });

  it('a failing tenant does not stop another', async () => {
    const real: DailyUpdatesService['escalateMissed'] =
      service.escalateMissed.bind(service);
    jest
      .spyOn(service, 'escalateMissed')
      .mockImplementation((input: Parameters<typeof real>[0]) =>
        input.tenantId === tenantA
          ? Promise.reject(new Error('tenant A is broken'))
          : real(input),
      );
    const result = await scheduler.tick({
      now: NOW,
      tenantIds: [tenantA, tenantB],
    });
    expect(result.tenants).toBe(2);
    expect(result.failed).toBe(1);
    expect(await rows(tenantA, emp.utcA, MON)).toBe(0);
    expect(await rows(tenantB, emp.utcB, MON)).toBe(1);
  });

  it('visits only tenants with an enabled escalating policy', async () => {
    const result = await scheduler.tick({
      now: NOW,
      tenantIds: [tenantA, tenantB, tenantC],
    });
    expect(result.tenants).toBe(2);
    expect(await rows(tenantC, emp.utcC, MON)).toBe(0);

    await prisma.dailyUpdateScopePolicy.updateMany({
      where: { tenantId: tenantB },
      data: { enabled: false },
    });
    try {
      const without = await scheduler.tick({ now: NOW, tenantIds: [tenantB] });
      expect(without.tenants).toBe(0);
    } finally {
      await prisma.dailyUpdateScopePolicy.updateMany({
        where: { tenantId: tenantB },
        data: { enabled: true },
      });
    }
  });

  it('judges each person by the time zone of the policy that governs them', async () => {
    // Monday 18:30 UTC: past nobody's UTC window (19:00 UTC), but Auckland is
    // already deep into Tuesday and its Monday deadline passed hours ago.
    const at = new Date('2026-11-09T18:30:00.000Z');
    await scheduler.tick({ now: at, tenantIds: [tenantA] });
    expect(await rows(tenantA, emp.nzA, MON)).toBe(1);
    expect(await rows(tenantA, emp.utcA, MON)).toBe(0);
    // Auckland's own Tuesday has not reached its deadline.
    expect(await rows(tenantA, emp.nzA, TUE)).toBe(0);

    // An hour and a half later the UTC person's window has passed too.
    await scheduler.tick({
      now: new Date('2026-11-09T19:00:00.000Z'),
      tenantIds: [tenantA],
    });
    expect(await rows(tenantA, emp.utcA, MON)).toBe(1);
    expect(sentFor(emp.nzA, MON)).toBe(1);
    expect(sentFor(emp.utcA, MON)).toBe(1);
  });

  it('does not overlap itself: a tick during a tick does nothing', async () => {
    const real: DailyUpdatesService['escalateMissed'] =
      service.escalateMissed.bind(service);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    jest
      .spyOn(service, 'escalateMissed')
      .mockImplementation(async (input: Parameters<typeof real>[0]) => {
        await gate;
        return real(input);
      });
    const running = scheduler.tick({ now: NOW, tenantIds: [tenantB] });
    const overlapping = await scheduler.tick({
      now: NOW,
      tenantIds: [tenantB],
    });
    expect(overlapping.tenants).toBe(0);
    release();
    const done = await running;
    expect(done.tenants).toBe(1);
    expect(sentFor(emp.utcB, MON)).toBe(1);
  });
});
