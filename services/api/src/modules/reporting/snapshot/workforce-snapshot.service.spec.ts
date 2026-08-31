import { WorkforceSnapshotDerivation } from '@prisma/client';
import {
  RECENT_TERMINATION_WINDOW_DAYS,
  WorkforceSnapshotService,
  tenureDays,
  utcCivilDate,
} from './workforce-snapshot.service';
import { WorkforceSnapshotWorker } from './workforce-snapshot.worker';

/*
 * The snapshot table exists because Employee has no history: a reorg rewrites
 * every past breakdown. These tests hold the two properties that make the table
 * worth having — it is idempotent, and it never lets a reconstruction overwrite
 * something that was actually observed.
 */

function employee(overrides: Record<string, unknown> = {}) {
  return {
    id: 'employee-1',
    organizationId: 'org-1',
    businessUnitId: 'bu-1',
    departmentId: 'dept-1',
    teamId: null,
    designationId: null,
    employeeLevelId: null,
    employmentTypeId: null,
    locationId: 'loc-1',
    managerEmployeeId: 'manager-1',
    employmentStatus: 'ACTIVE',
    employeeType: 'FULL_TIME',
    workMode: null,
    gender: null,
    hireDate: new Date('2024-03-01T00:00:00.000Z'),
    terminationDate: null,
    ...overrides,
  };
}

function buildService(
  options: {
    pages?: Array<Array<Record<string, unknown>>>;
    existing?: Array<{ employeeId: string; derivation: string }>;
  } = {},
) {
  const pages = options.pages ?? [[employee()]];
  let call = 0;

  const employeeFindMany = jest.fn().mockImplementation(() => {
    const page = pages[call] ?? [];
    call += 1;
    return Promise.resolve(page);
  });

  const snapshotFindMany = jest.fn().mockResolvedValue(options.existing ?? []);
  const snapshotFindFirst = jest.fn().mockResolvedValue(null);
  const upsert = jest.fn().mockResolvedValue({});

  const prisma = {
    employee: { findMany: employeeFindMany },
    workforceSnapshotDaily: {
      findMany: snapshotFindMany,
      findFirst: snapshotFindFirst,
      upsert,
    },
  };

  return {
    service: new WorkforceSnapshotService(prisma as never),
    prisma,
    employeeFindMany,
    snapshotFindMany,
    snapshotFindFirst,
    upsert,
  };
}

/**
 * The first argument of a mock call, typed.
 *
 * A bare `jest.fn()` is `jest.Mock<any, any>`, so reading `.mock.calls[n][0]`
 * inline turns every assertion into an unsafe member access. One funnel keeps
 * the assertions readable and the rest of the file honest about its types.
 */
type PrismaCall = {
  where?: Record<string, unknown>;
  create?: Record<string, unknown>;
  update?: Record<string, unknown>;
  cursor?: Record<string, unknown>;
  skip?: number;
};

function callArg(mock: jest.Mock, index = 0): PrismaCall {
  return (mock.mock.calls[index] as PrismaCall[])[0];
}

describe('utcCivilDate', () => {
  it('reads a stored calendar date in UTC, not the server zone', () => {
    // Read locally on a server west of Greenwich this becomes the 28th, which
    // moves a joiner into the previous month.
    expect(utcCivilDate(new Date('2026-03-01T00:00:00.000Z'))).toBe(
      '2026-03-01',
    );
  });
});

describe('tenureDays', () => {
  it('is zero on the hire day', () => {
    expect(tenureDays('2026-08-31', null, '2026-08-31')).toBe(0);
  });

  it('counts whole days since the hire date', () => {
    expect(tenureDays('2026-08-01', null, '2026-08-31')).toBe(30);
  });

  it('never goes negative for an employee hired after the snapshot date', () => {
    expect(tenureDays('2026-09-15', null, '2026-08-31')).toBe(0);
  });

  it('freezes at the termination date instead of growing after someone leaves', () => {
    // Captured 10 days into the post-termination window, tenure is still the
    // tenure they had on their last day.
    expect(tenureDays('2026-01-01', '2026-06-30', '2026-07-10')).toBe(
      tenureDays('2026-01-01', '2026-06-30', '2026-06-30'),
    );
    expect(tenureDays('2026-01-01', '2026-06-30', '2026-07-10')).toBe(180);
  });

  it('counts across a leap day', () => {
    expect(tenureDays('2028-02-01', null, '2028-03-01')).toBe(29);
  });
});

describe('WorkforceSnapshotService.captureDay', () => {
  it('excludes soft-deleted employees, which the existing /reports endpoints do not', async () => {
    const harness = buildService();

    await harness.service.captureDay({
      tenantId: 'tenant-1',
      snapshotDate: '2026-08-30',
      derivation: WorkforceSnapshotDerivation.OBSERVED,
    });

    const where = callArg(harness.employeeFindMany).where;
    expect(where.tenantId).toBe('tenant-1');
    expect(where.isDeleted).toBe(false);
    expect(where.deletedAt).toBeNull();
  });

  it('includes people hired on the snapshot day and excludes those hired after', async () => {
    const harness = buildService();

    await harness.service.captureDay({
      tenantId: 'tenant-1',
      snapshotDate: '2026-08-30',
      derivation: WorkforceSnapshotDerivation.OBSERVED,
    });

    // Exclusive bound at the following midnight: somebody hired at 09:00 on the
    // 30th is in; somebody hired on the 31st is not.
    expect(callArg(harness.employeeFindMany).where.hireDate).toEqual({
      lt: new Date('2026-08-31T00:00:00.000Z'),
    });
  });

  it('keeps recently terminated employees inside the window and drops older ones', async () => {
    const harness = buildService();

    await harness.service.captureDay({
      tenantId: 'tenant-1',
      snapshotDate: '2026-08-30',
      derivation: WorkforceSnapshotDerivation.OBSERVED,
    });

    expect(callArg(harness.employeeFindMany).where.OR).toEqual([
      { terminationDate: null },
      { terminationDate: { gte: new Date('2026-06-01T00:00:00.000Z') } },
    ]);
    expect(RECENT_TERMINATION_WINDOW_DAYS).toBe(90);
  });

  it('upserts on the tenant/date/employee key, so re-running a day corrects it', async () => {
    const harness = buildService();

    await harness.service.captureDay({
      tenantId: 'tenant-1',
      snapshotDate: '2026-08-30',
      derivation: WorkforceSnapshotDerivation.OBSERVED,
    });

    const call = callArg(harness.upsert);
    expect(call.where).toEqual({
      tenantId_snapshotDate_employeeId: {
        tenantId: 'tenant-1',
        snapshotDate: new Date('2026-08-30T00:00:00.000Z'),
        employeeId: 'employee-1',
      },
    });
    expect(call.create).toMatchObject({
      tenantId: 'tenant-1',
      employeeId: 'employee-1',
      departmentId: 'dept-1',
      businessUnitId: 'bu-1',
      managerEmployeeId: 'manager-1',
      employmentStatus: 'ACTIVE',
      derivation: WorkforceSnapshotDerivation.OBSERVED,
    });
  });

  it('marks a joiner on their hire date only', async () => {
    const onTheDay = buildService({
      pages: [[employee({ hireDate: new Date('2026-08-30T00:00:00.000Z') })]],
    });
    const laterOn = buildService({
      pages: [[employee({ hireDate: new Date('2026-08-29T00:00:00.000Z') })]],
    });

    const first = await onTheDay.service.captureDay({
      tenantId: 'tenant-1',
      snapshotDate: '2026-08-30',
      derivation: WorkforceSnapshotDerivation.OBSERVED,
    });
    const second = await laterOn.service.captureDay({
      tenantId: 'tenant-1',
      snapshotDate: '2026-08-30',
      derivation: WorkforceSnapshotDerivation.OBSERVED,
    });

    expect(first.joiners).toBe(1);
    expect(callArg(onTheDay.upsert).create?.isJoiner).toBe(true);
    expect(second.joiners).toBe(0);
    expect(callArg(laterOn.upsert).create?.isJoiner).toBe(false);
  });

  it('marks a leaver on their termination date only', async () => {
    const onTheDay = buildService({
      pages: [
        [employee({ terminationDate: new Date('2026-08-30T00:00:00.000Z') })],
      ],
    });
    const afterwards = buildService({
      pages: [
        [employee({ terminationDate: new Date('2026-08-20T00:00:00.000Z') })],
      ],
    });

    const first = await onTheDay.service.captureDay({
      tenantId: 'tenant-1',
      snapshotDate: '2026-08-30',
      derivation: WorkforceSnapshotDerivation.OBSERVED,
    });
    const second = await afterwards.service.captureDay({
      tenantId: 'tenant-1',
      snapshotDate: '2026-08-30',
      derivation: WorkforceSnapshotDerivation.OBSERVED,
    });

    expect(first.leavers).toBe(1);
    expect(second.leavers).toBe(0);
  });

  it('pages through a large tenant rather than reading it all at once', async () => {
    const harness = buildService({
      pages: [
        [employee({ id: 'a' }), employee({ id: 'b' })],
        [employee({ id: 'c' })],
      ],
    });

    const result = await harness.service.captureDay({
      tenantId: 'tenant-1',
      snapshotDate: '2026-08-30',
      derivation: WorkforceSnapshotDerivation.OBSERVED,
      batchSize: 2,
    });

    expect(result.employeesConsidered).toBe(3);
    expect(result.written).toBe(3);
    // The second page continues from the last id of the first, not by offset.
    expect(callArg(harness.employeeFindMany, 1).cursor).toEqual({
      id: 'b',
    });
    expect(callArg(harness.employeeFindMany, 1).skip).toBe(1);
  });

  it('writes nothing on a dry run but still reports what it would have written', async () => {
    const harness = buildService();

    const result = await harness.service.captureDay({
      tenantId: 'tenant-1',
      snapshotDate: '2026-08-30',
      derivation: WorkforceSnapshotDerivation.BACKFILLED,
      dryRun: true,
    });

    expect(result.written).toBe(1);
    expect(result.dryRun).toBe(true);
    expect(harness.upsert).not.toHaveBeenCalled();
  });
});

describe('WorkforceSnapshotService derivation', () => {
  it('refuses to let a backfill overwrite an OBSERVED row', async () => {
    // The whole reason `derivation` is a column: a reconstruction can only
    // place an employee in their CURRENT department, so overwriting a row that
    // was captured on the day would trade real history for a guess.
    const harness = buildService({
      existing: [{ employeeId: 'employee-1', derivation: 'OBSERVED' }],
    });

    const result = await harness.service.captureDay({
      tenantId: 'tenant-1',
      snapshotDate: '2026-08-30',
      derivation: WorkforceSnapshotDerivation.BACKFILLED,
    });

    expect(result.skippedObserved).toBe(1);
    expect(result.written).toBe(0);
    expect(harness.upsert).not.toHaveBeenCalled();
  });

  it('lets a backfill correct a row an earlier backfill wrote', async () => {
    const harness = buildService({
      existing: [{ employeeId: 'employee-1', derivation: 'BACKFILLED' }],
    });

    const result = await harness.service.captureDay({
      tenantId: 'tenant-1',
      snapshotDate: '2026-08-30',
      derivation: WorkforceSnapshotDerivation.BACKFILLED,
    });

    expect(result.skippedObserved).toBe(0);
    expect(result.written).toBe(1);
    expect(callArg(harness.upsert).update?.derivation).toBe('BACKFILLED');
  });

  it('lets the daily job overwrite a backfilled row with an observed one', async () => {
    const harness = buildService({
      existing: [{ employeeId: 'employee-1', derivation: 'BACKFILLED' }],
    });

    const result = await harness.service.captureDay({
      tenantId: 'tenant-1',
      snapshotDate: '2026-08-30',
      derivation: WorkforceSnapshotDerivation.OBSERVED,
    });

    expect(result.written).toBe(1);
    expect(callArg(harness.upsert).update?.derivation).toBe('OBSERVED');
  });
});

function buildWorker(
  options: {
    tenants?: Array<{ id: string; slug: string }>;
    timezone?: string;
    enabled?: string;
    hasSnapshot?: boolean;
    captureThrows?: Error;
  } = {},
) {
  const tenantFindMany = jest
    .fn()
    .mockResolvedValue(options.tenants ?? [{ id: 'tenant-1', slug: 'demo' }]);

  const hasSnapshot = jest.fn().mockResolvedValue(options.hasSnapshot ?? false);
  const captureDay = options.captureThrows
    ? jest.fn().mockRejectedValue(options.captureThrows)
    : jest.fn().mockResolvedValue({
        tenantId: 'tenant-1',
        snapshotDate: '2026-08-30',
        employeesConsidered: 3,
        written: 3,
        skippedObserved: 0,
        joiners: 1,
        leavers: 0,
        dryRun: false,
        durationMs: 5,
      });

  const configService = {
    get: jest.fn(
      (key: string) =>
        ({
          REPORTS_WORKFORCE_SNAPSHOT_ENABLED: options.enabled ?? 'false',
        })[key],
    ),
  };

  const tenantSettings = {
    getOrganizationSettings: jest
      .fn()
      .mockResolvedValue({ timezone: options.timezone ?? 'Asia/Qatar' }),
  };

  const worker = new WorkforceSnapshotWorker(
    configService as never,
    { tenant: { findMany: tenantFindMany } } as never,
    { hasSnapshot, captureDay } as never,
    tenantSettings as never,
  );

  return { worker, tenantFindMany, hasSnapshot, captureDay, tenantSettings };
}

describe('WorkforceSnapshotWorker', () => {
  afterEach(() => jest.restoreAllMocks());

  it('is disabled by default and starts no timer', () => {
    const setInterval = jest.spyOn(global, 'setInterval');
    const harness = buildWorker();

    harness.worker.onModuleInit();

    expect(harness.worker.isEnabled()).toBe(false);
    expect(setInterval).not.toHaveBeenCalled();
  });

  it('captures each tenant yesterday in that tenant own timezone', async () => {
    // 2026-08-31T02:00Z is already the 31st in Asia/Qatar (05:00), so the
    // tenant's yesterday is the 30th. A server-local UTC reading would agree
    // here; the next test is the one that separates them.
    const harness = buildWorker();

    await harness.worker.sweep(new Date('2026-08-31T02:00:00.000Z'));

    expect(harness.captureDay).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      snapshotDate: '2026-08-30',
      derivation: WorkforceSnapshotDerivation.OBSERVED,
    });
  });

  it('resolves a different yesterday for a tenant west of the server', async () => {
    // At 2026-08-31T02:00Z it is still the 30th in America/Los_Angeles (19:00
    // on the 30th), so that tenant's yesterday is the 29th, not the 30th.
    // Capturing the 30th here would record a day that has not finished.
    const harness = buildWorker({ timezone: 'America/Los_Angeles' });

    await harness.worker.sweep(new Date('2026-08-31T02:00:00.000Z'));

    expect(harness.captureDay).toHaveBeenCalledWith(
      expect.objectContaining({ snapshotDate: '2026-08-29' }),
    );
  });

  it('skips a day that is already captured', async () => {
    const harness = buildWorker({ hasSnapshot: true });

    const result = await harness.worker.sweep(
      new Date('2026-08-31T02:00:00.000Z'),
    );

    expect(result.alreadyPresent).toBe(1);
    expect(harness.captureDay).not.toHaveBeenCalled();
  });

  it('only sweeps tenants whose people are worth measuring', async () => {
    const harness = buildWorker();

    await harness.worker.sweep(new Date('2026-08-31T02:00:00.000Z'));

    expect(callArg(harness.tenantFindMany).where).toEqual({
      status: { in: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] },
    });
  });

  it('keeps going when one tenant fails', async () => {
    const harness = buildWorker({
      tenants: [
        { id: 'tenant-1', slug: 'one' },
        { id: 'tenant-2', slug: 'two' },
      ],
    });
    harness.captureDay
      .mockRejectedValueOnce(new Error('settings row is corrupt'))
      .mockResolvedValueOnce({
        tenantId: 'tenant-2',
        snapshotDate: '2026-08-30',
        employeesConsidered: 1,
        written: 1,
        skippedObserved: 0,
        joiners: 0,
        leavers: 0,
        dryRun: false,
        durationMs: 1,
      });

    const result = await harness.worker.sweep(
      new Date('2026-08-31T02:00:00.000Z'),
    );

    expect(result).toEqual({
      tenantsConsidered: 2,
      captured: 1,
      alreadyPresent: 0,
      failed: 1,
    });
  });

  it('never lets an error escape a tick', async () => {
    const harness = buildWorker();
    harness.tenantFindMany.mockRejectedValue(new Error('recovery mode'));

    await expect(harness.worker.tick()).resolves.toBeUndefined();
  });

  it('does not start a second sweep while one is running', async () => {
    const harness = buildWorker();
    let release: (() => void) | null = null;
    harness.tenantFindMany.mockImplementation(
      () => new Promise((resolve) => (release = () => resolve([]))),
    );

    const first = harness.worker.tick();
    await harness.worker.tick();
    expect(harness.tenantFindMany).toHaveBeenCalledTimes(1);

    release?.();
    await first;
  });
});
