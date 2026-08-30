import { ReportRunStatus } from '@prisma/client';
import {
  MAX_CONSECUTIVE_FAILURES,
  REPORT_SCHEDULE_DELIVERY_EVENT,
  ReportSchedulerWorker,
} from './report-scheduler.worker';

/**
 * The scheduler is the platform's first recurring job (BUG-2618), so these
 * tests are as much about the *pattern* as about this class: off by default, a
 * re-entrancy guard, a claim that produces one winner, a tick that cannot take
 * the process down, and — the one that matters most — no path on which a
 * background run acquires more access than the person who scheduled it.
 *
 * No test here sends mail. Tenant email is live in production, so every address
 * below is a non-deliverable @demo.dijipeople.com one and the notification
 * orchestrator is a double that records rather than sends.
 */

const NOW = new Date('2026-08-31T06:00:00.000Z');

function scheduleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'schedule-1',
    tenantId: 'tenant-1',
    name: 'Weekly headcount',
    targetKey: 'std:headcount',
    reportDefinitionId: null,
    ownerUserId: 'owner-1',
    frequency: 'DAILY',
    hour: 6,
    minute: 0,
    dayOfWeek: null,
    dayOfMonth: null,
    timezone: 'UTC',
    format: 'XLSX',
    periodPreset: 'previous_month',
    filtersJson: null,
    recipientUserIds: ['recipient-1'],
    isEnabled: true,
    nextRunAt: new Date('2026-08-31T06:00:00.000Z'),
    lastRunAt: null,
    lastRunStatus: null,
    lastFailureReason: null,
    consecutiveFailureCount: 0,
    createdAt: NOW,
    updatedAt: NOW,
    createdById: null,
    updatedById: null,
    ...overrides,
  };
}

type Harness = ReturnType<typeof buildWorker>;

function buildWorker(
  options: {
    schedules?: Array<Record<string, unknown>>;
    /** How many rows each reportSchedule.updateMany claims to have touched. */
    claimCount?: number;
    config?: Record<string, string>;
    ownerContext?: unknown;
    ownerThrows?: Error;
    runAll?: jest.Mock;
    buildFile?: jest.Mock;
    dispatch?: jest.Mock;
    recipients?: Array<{
      id: string;
      email: string;
      firstName: string | null;
      lastName: string | null;
    }>;
  } = {},
) {
  const scheduleUpdateMany = jest
    .fn()
    .mockResolvedValue({ count: options.claimCount ?? 1 });
  const runCreate = jest.fn().mockResolvedValue({ id: 'run-1' });
  const runUpdate = jest.fn().mockResolvedValue({});
  const scheduleFindMany = jest
    .fn()
    .mockResolvedValue(options.schedules ?? [scheduleRow()]);
  const userFindMany = jest
    .fn()
    .mockResolvedValue(
      options.recipients ?? [
        {
          id: 'recipient-1',
          email: 'recipient-1@demo.dijipeople.com',
          firstName: 'Rita',
          lastName: 'Recipient',
        },
      ],
    );

  const prisma = {
    reportSchedule: { findMany: scheduleFindMany, updateMany: scheduleUpdateMany },
    reportRun: { create: runCreate, update: runUpdate },
    user: { findMany: userFindMany },
  };

  const configValues: Record<string, string> = {
    REPORTS_SCHEDULER_ENABLED: 'false',
    ...(options.config ?? {}),
  };
  const configService = {
    get: jest.fn((key: string) => configValues[key]),
  };

  const loadAccessContext = options.ownerThrows
    ? jest.fn().mockRejectedValue(options.ownerThrows)
    : jest.fn().mockResolvedValue(
        options.ownerContext ?? {
          authUser: {
            userId: 'owner-1',
            tenantId: 'tenant-1',
            email: 'owner-1@demo.dijipeople.com',
            roleIds: [],
            roleKeys: ['hr'],
            permissionKeys: ['reports.read'],
          },
        },
      );

  const runAll =
    options.runAll ??
    jest.fn().mockResolvedValue({
      targetKey: 'std:headcount',
      name: 'Headcount',
      description: '',
      sourceKey: 'workforce',
      columns: [],
      rows: [{ id: 'e-1', href: null, values: {} }],
      total: 1,
      page: 1,
      pageSize: 1,
      caveats: [],
      generatedAt: NOW.toISOString(),
    });

  const buildFile =
    options.buildFile ??
    jest.fn().mockResolvedValue({
      buffer: Buffer.from('report-bytes'),
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: 'xlsx',
      fileName: 'headcount-2026-08-31.xlsx',
      rowCount: 1,
      truncated: false,
    });

  const dispatch = options.dispatch ?? jest.fn().mockResolvedValue({});

  const tenantSettings = {
    getOrganizationSettings: jest.fn().mockResolvedValue({
      timezone: 'Asia/Qatar',
      currency: 'QAR',
      dateFormat: 'dd/MM/yyyy',
      timeFormat: '24h',
      companyDisplayName: 'Demo Workspace',
    }),
    getSystemSettings: jest.fn().mockResolvedValue({ locale: 'en-GB' }),
  };

  const worker = new ReportSchedulerWorker(
    configService as never,
    prisma as never,
    { loadAccessContext } as never,
    { runAll } as never,
    { buildFile } as never,
    { dispatch } as never,
    tenantSettings as never,
  );

  return {
    worker,
    prisma,
    configService,
    loadAccessContext,
    runAll,
    buildFile,
    dispatch,
    tenantSettings,
    scheduleUpdateMany,
    scheduleFindMany,
    runCreate,
    runUpdate,
    userFindMany,
  };
}

/** Every `reportSchedule.updateMany` call, as `[where, data]` pairs. */
function scheduleWrites(harness: Harness) {
  return harness.scheduleUpdateMany.mock.calls.map(
    (call) => call[0] as { where: Record<string, unknown>; data: Record<string, unknown> },
  );
}

/** Every `reportRun.update` call. */
function runWrites(harness: Harness) {
  return harness.runUpdate.mock.calls.map(
    (call) => call[0] as { where: { id: string }; data: Record<string, unknown> },
  );
}

describe('ReportSchedulerWorker lifecycle', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is disabled by default and starts no timer', () => {
    const setInterval = jest.spyOn(global, 'setInterval');
    const harness = buildWorker();

    harness.worker.onModuleInit();

    expect(harness.worker.isEnabled()).toBe(false);
    expect(setInterval).not.toHaveBeenCalled();
  });

  it('stays disabled for any value that is not the literal string "true"', () => {
    for (const value of ['TRUE', '1', 'yes', 'True', '']) {
      const harness = buildWorker({
        config: { REPORTS_SCHEDULER_ENABLED: value },
      });
      expect(harness.worker.isEnabled()).toBe(false);
    }
  });

  it('starts an interval and unrefs it when explicitly enabled', () => {
    const unref = jest.fn();
    const setInterval = jest
      .spyOn(global, 'setInterval')
      .mockReturnValue({ unref } as never);

    const harness = buildWorker({
      config: { REPORTS_SCHEDULER_ENABLED: 'true' },
    });
    harness.worker.onModuleInit();

    expect(setInterval).toHaveBeenCalledTimes(1);
    expect(setInterval.mock.calls[0][1]).toBe(60_000);
    // Without unref, every CLI invocation that loads the container becomes a
    // process that has to be killed.
    expect(unref).toHaveBeenCalled();

    harness.worker.onModuleDestroy();
  });

  it('clamps the poll interval to the 15s floor and falls back on nonsense', () => {
    const setInterval = jest
      .spyOn(global, 'setInterval')
      .mockReturnValue({ unref: jest.fn() } as never);

    for (const [configured, expected] of [
      ['1000', 15_000],
      ['120000', 120_000],
      ['not-a-number', 60_000],
      ['-5', 60_000],
    ] as Array<[string, number]>) {
      setInterval.mockClear();
      const harness = buildWorker({
        config: {
          REPORTS_SCHEDULER_ENABLED: 'true',
          REPORTS_SCHEDULER_POLL_INTERVAL_MS: configured,
        },
      });
      harness.worker.onModuleInit();
      expect(setInterval.mock.calls[0][1]).toBe(expected);
      harness.worker.onModuleDestroy();
    }
  });

  it('clears the timer on shutdown', () => {
    const clearInterval = jest.spyOn(global, 'clearInterval');
    jest.spyOn(global, 'setInterval').mockReturnValue({
      unref: jest.fn(),
    } as never);

    const harness = buildWorker({
      config: { REPORTS_SCHEDULER_ENABLED: 'true' },
    });
    harness.worker.onModuleInit();
    harness.worker.onModuleDestroy();

    expect(clearInterval).toHaveBeenCalledTimes(1);
  });
});

describe('ReportSchedulerWorker tick safety', () => {
  it('never lets an error escape a tick', async () => {
    const harness = buildWorker();
    harness.scheduleFindMany.mockRejectedValue(
      new Error('the database system is in recovery mode'),
    );

    await expect(harness.worker.tick()).resolves.toBeUndefined();
  });

  it('does not start a second drain while one is still running', async () => {
    const harness = buildWorker();

    let release: (() => void) | null = null;
    harness.scheduleFindMany.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve([]);
        }),
    );

    const first = harness.worker.tick();
    // The guard is synchronous, so the second tick returns without ever
    // reaching the query.
    const second = harness.worker.tick();
    await second;

    expect(harness.scheduleFindMany).toHaveBeenCalledTimes(1);

    release?.();
    await first;

    // Once the first finishes the guard is released again.
    await harness.worker.tick();
    expect(harness.scheduleFindMany).toHaveBeenCalledTimes(2);
  });

  it('releases the guard even when the drain throws', async () => {
    const harness = buildWorker();
    harness.scheduleFindMany.mockRejectedValueOnce(new Error('blip'));
    harness.scheduleFindMany.mockResolvedValueOnce([]);

    await harness.worker.tick();
    await harness.worker.tick();

    expect(harness.scheduleFindMany).toHaveBeenCalledTimes(2);
  });
});

describe('ReportSchedulerWorker claiming', () => {
  it('claims by advancing nextRunAt with the old value still in the filter', async () => {
    const harness = buildWorker();

    await harness.worker.drain(NOW);

    const claim = scheduleWrites(harness)[0];
    expect(claim.where).toEqual({
      id: 'schedule-1',
      tenantId: 'tenant-1',
      isEnabled: true,
      // The old cursor is part of the filter: that is what makes two workers
      // produce one winner and one no-op.
      nextRunAt: new Date('2026-08-31T06:00:00.000Z'),
    });
    expect((claim.data.nextRunAt as Date).toISOString()).toBe(
      '2026-09-01T06:00:00.000Z',
    );
  });

  it('does nothing at all when it loses the claim race', async () => {
    const harness = buildWorker({ claimCount: 0 });

    const result = await harness.worker.drain(NOW);

    expect(result).toEqual({
      due: 1,
      claimed: 0,
      completed: 0,
      failed: 0,
      disabled: 0,
    });
    // No run row, no report execution, no email. The loser is silent, not
    // duplicative.
    expect(harness.runCreate).not.toHaveBeenCalled();
    expect(harness.runAll).not.toHaveBeenCalled();
    expect(harness.dispatch).not.toHaveBeenCalled();
  });

  it('only considers enabled schedules whose nextRunAt has arrived', async () => {
    const harness = buildWorker();

    await harness.worker.drain(NOW);

    expect(harness.scheduleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isEnabled: true, nextRunAt: { not: null, lte: NOW } },
      }),
    );
  });

  it('disables a schedule whose stored timing cannot be resolved', async () => {
    const harness = buildWorker({
      schedules: [scheduleRow({ timezone: 'Mars/Olympus_Mons' })],
    });

    const result = await harness.worker.drain(NOW);

    expect(result.disabled).toBe(1);
    expect(result.claimed).toBe(0);
    const write = scheduleWrites(harness)[0];
    expect(write.data.isEnabled).toBe(false);
    expect(write.data.nextRunAt).toBeNull();
    expect(String(write.data.lastFailureReason)).toMatch(/timing is invalid/);
    expect(harness.runCreate).not.toHaveBeenCalled();
  });
});

describe('ReportSchedulerWorker execution', () => {
  it('runs the report as the owner and records a completed run', async () => {
    const harness = buildWorker();

    const result = await harness.worker.drain(NOW);

    expect(result).toEqual({
      due: 1,
      claimed: 1,
      completed: 1,
      failed: 0,
      disabled: 0,
    });

    expect(harness.loadAccessContext).toHaveBeenCalledWith(
      'owner-1',
      'tenant-1',
    );
    // The report is executed with the OWNER's access context, not a privileged
    // one and not the recipient's.
    expect(harness.runAll).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'owner-1', tenantId: 'tenant-1' }),
      'std:headcount',
      { preset: 'previous_month', filters: [] },
    );

    const created = harness.runCreate.mock.calls[0][0].data;
    expect(created).toMatchObject({
      tenantId: 'tenant-1',
      scheduleId: 'schedule-1',
      trigger: 'SCHEDULED',
      status: ReportRunStatus.QUEUED,
      executedAsUserId: 'owner-1',
      attemptCount: 1,
    });
    expect(created.claimedBy).toEqual(expect.stringContaining('report-scheduler-'));

    const writes = runWrites(harness);
    expect(writes[0].data.status).toBe(ReportRunStatus.RUNNING);
    expect(writes[1].data).toMatchObject({
      status: ReportRunStatus.COMPLETED,
      rowCount: 1,
      fileName: 'headcount-2026-08-31.xlsx',
      fileSizeBytes: Buffer.from('report-bytes').length,
    });
    expect(writes[1].data.durationMs).toEqual(expect.any(Number));
  });

  it('renders with the tenant timezone, never the server one', async () => {
    const harness = buildWorker();

    await harness.worker.drain(NOW);

    expect(harness.buildFile).toHaveBeenCalledWith(
      expect.anything(),
      'XLSX',
      expect.objectContaining({
        timezone: 'Asia/Qatar',
        currency: 'QAR',
        locale: 'en-GB',
      }),
    );
  });

  it('emails every recipient with the file attached', async () => {
    const harness = buildWorker({
      schedules: [
        scheduleRow({ recipientUserIds: ['recipient-1', 'recipient-2'] }),
      ],
      recipients: [
        {
          id: 'recipient-1',
          email: 'recipient-1@demo.dijipeople.com',
          firstName: 'Rita',
          lastName: 'Recipient',
        },
        {
          id: 'recipient-2',
          email: 'recipient-2@demo.dijipeople.com',
          firstName: null,
          lastName: null,
        },
      ],
    });

    await harness.worker.drain(NOW);

    expect(harness.dispatch).toHaveBeenCalledTimes(2);
    const first = harness.dispatch.mock.calls[0][0];
    expect(first.eventCode).toBe(REPORT_SCHEDULE_DELIVERY_EVENT);
    expect(first.channels).toEqual(['EMAIL']);
    expect(first.email.recipient).toBe('recipient-1@demo.dijipeople.com');
    expect(first.email.attachments).toEqual([
      {
        filename: 'headcount-2026-08-31.xlsx',
        content: Buffer.from('report-bytes'),
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    ]);
  });

  it('re-reads recipients against the tenant instead of trusting the stored ids', async () => {
    const harness = buildWorker();

    await harness.worker.drain(NOW);

    expect(harness.userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['recipient-1'] }, tenantId: 'tenant-1' },
      }),
    );
  });

  it('completes the run when some recipients fail but at least one succeeds', async () => {
    const dispatch = jest
      .fn()
      .mockRejectedValueOnce(new Error('mailbox full'))
      .mockResolvedValueOnce({});

    const harness = buildWorker({
      dispatch,
      schedules: [
        scheduleRow({ recipientUserIds: ['recipient-1', 'recipient-2'] }),
      ],
      recipients: [
        {
          id: 'recipient-1',
          email: 'recipient-1@demo.dijipeople.com',
          firstName: null,
          lastName: null,
        },
        {
          id: 'recipient-2',
          email: 'recipient-2@demo.dijipeople.com',
          firstName: null,
          lastName: null,
        },
      ],
    });

    const result = await harness.worker.drain(NOW);

    expect(result.completed).toBe(1);
    expect(runWrites(harness)[1].data.status).toBe(ReportRunStatus.COMPLETED);
  });

  it('fails the run when no recipient could be reached', async () => {
    const harness = buildWorker({
      dispatch: jest.fn().mockRejectedValue(new Error('smtp down')),
    });

    const result = await harness.worker.drain(NOW);

    expect(result.failed).toBe(1);
    expect(runWrites(harness)[1].data).toMatchObject({
      status: ReportRunStatus.FAILED,
    });
  });

  it('fails the run when the stored recipients no longer exist in the tenant', async () => {
    const harness = buildWorker({ recipients: [] });

    const result = await harness.worker.drain(NOW);

    expect(result.failed).toBe(1);
    expect(harness.dispatch).not.toHaveBeenCalled();
  });
});

describe('ReportSchedulerWorker owner authorization', () => {
  it('fails the run when the owner context throws, and never escalates', async () => {
    const harness = buildWorker({
      ownerThrows: new Error('User account is deactivated'),
    });

    const result = await harness.worker.drain(NOW);

    expect(result.failed).toBe(1);
    // The decisive assertions: the report was never executed, and nothing was
    // mailed. There is no service-identity fallback to find.
    expect(harness.runAll).not.toHaveBeenCalled();
    expect(harness.buildFile).not.toHaveBeenCalled();
    expect(harness.dispatch).not.toHaveBeenCalled();

    expect(String(runWrites(harness)[1].data.failureReason)).toMatch(
      /can no longer be authorized/,
    );
  });

  it('fails the run when the owner context resolves to nothing', async () => {
    const harness = buildWorker({ ownerContext: { authUser: null } });

    const result = await harness.worker.drain(NOW);

    expect(result.failed).toBe(1);
    expect(harness.runAll).not.toHaveBeenCalled();
    expect(String(runWrites(harness)[1].data.failureReason)).toMatch(
      /no longer has access/,
    );
  });

  it('refuses an owner context belonging to a different tenant', async () => {
    const harness = buildWorker({
      ownerContext: {
        authUser: {
          userId: 'owner-1',
          tenantId: 'tenant-2',
          email: 'owner-1@demo.dijipeople.com',
          roleIds: [],
          roleKeys: [],
          permissionKeys: [],
        },
      },
    });

    const result = await harness.worker.drain(NOW);

    expect(result.failed).toBe(1);
    expect(harness.runAll).not.toHaveBeenCalled();
  });
});

describe('ReportSchedulerWorker failure streak', () => {
  it('records a failure without disabling below the threshold', async () => {
    const harness = buildWorker({
      schedules: [scheduleRow({ consecutiveFailureCount: 2 })],
      runAll: jest.fn().mockRejectedValue(new Error('source unavailable')),
    });

    const result = await harness.worker.drain(NOW);

    expect(result.disabled).toBe(0);
    const update = scheduleWrites(harness)[1];
    expect(update.data).toMatchObject({
      lastRunStatus: ReportRunStatus.FAILED,
      consecutiveFailureCount: 3,
    });
    expect(update.data.isEnabled).toBeUndefined();
  });

  it(`disables the schedule on the ${MAX_CONSECUTIVE_FAILURES}th consecutive failure`, async () => {
    const harness = buildWorker({
      schedules: [
        scheduleRow({ consecutiveFailureCount: MAX_CONSECUTIVE_FAILURES - 1 }),
      ],
      runAll: jest.fn().mockRejectedValue(new Error('source unavailable')),
    });

    const result = await harness.worker.drain(NOW);

    expect(result.disabled).toBe(1);
    const update = scheduleWrites(harness)[1];
    expect(update.data).toMatchObject({
      isEnabled: false,
      nextRunAt: null,
      consecutiveFailureCount: MAX_CONSECUTIVE_FAILURES,
    });
    expect(String(update.data.lastFailureReason)).toMatch(
      /Disabled after 5 consecutive failures/,
    );
    // A schedule that fails every morning stops; it does not mail the error.
    expect(harness.dispatch).not.toHaveBeenCalled();
  });

  it('resets the streak after a success', async () => {
    const harness = buildWorker({
      schedules: [scheduleRow({ consecutiveFailureCount: 3 })],
    });

    await harness.worker.drain(NOW);

    expect(scheduleWrites(harness)[1].data).toMatchObject({
      lastRunStatus: ReportRunStatus.COMPLETED,
      consecutiveFailureCount: 0,
      lastFailureReason: null,
    });
  });

  it('keeps draining the batch after one schedule fails', async () => {
    const harness = buildWorker({
      schedules: [
        scheduleRow({ id: 'schedule-1' }),
        scheduleRow({ id: 'schedule-2' }),
      ],
    });
    harness.runAll
      .mockRejectedValueOnce(new Error('source unavailable'))
      .mockResolvedValueOnce({
        targetKey: 'std:headcount',
        name: 'Headcount',
        description: '',
        sourceKey: 'workforce',
        columns: [],
        rows: [],
        total: 0,
        page: 1,
        pageSize: 0,
        caveats: [],
        generatedAt: NOW.toISOString(),
      });

    const result = await harness.worker.drain(NOW);

    expect(result).toMatchObject({ due: 2, claimed: 2, completed: 1, failed: 1 });
  });
});
