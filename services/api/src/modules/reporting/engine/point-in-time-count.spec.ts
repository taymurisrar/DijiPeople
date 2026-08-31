import { ReportQueryExecutor } from './query-executor';
import { getDataSource } from '../semantic/data-sources';
import { getMetric } from '../metrics/metric.registry';

/**
 * Headcount is a stock, not a flow.
 *
 * BUG-2685 / REG-389. `workforce_history` holds one row per employee per day,
 * and "Historical headcount" was a plain `count` over the period — so a company
 * of twelve read **323** across thirty days and **70** across seven, growing
 * with the length of the window rather than describing the workforce.
 *
 * The number was true and the answer was wrong, which is the worst combination
 * for a headline tile: nothing about it looks broken. It carried a caveat
 * explaining that a reader wanting headcount should count a single snapshot
 * date instead — the caveat telling the reader the tile was wrong rather than
 * the tile being right.
 *
 * It only became visible once the surface had data at all: before the backfill
 * the tile showed an empty state, so the defect had never been on screen.
 */

type Call = { where?: unknown; _max?: unknown };

function executorWith(maxDate: Date | null) {
  const calls: { aggregate: Call[]; count: Call[] } = {
    aggregate: [],
    count: [],
  };

  const delegate = {
    aggregate: jest.fn((args: Call) => {
      calls.aggregate.push(args);
      return Promise.resolve({ _max: { snapshotDate: maxDate } });
    }),
    count: jest.fn((args: Call) => {
      calls.count.push(args);
      // 12 people on the day; 360 rows would be the employee-day count.
      return Promise.resolve(12);
    }),
    groupBy: jest.fn(() => Promise.resolve([])),
    findMany: jest.fn(() => Promise.resolve([])),
  };

  const prisma = { workforceSnapshotDaily: delegate };
  const executor = new ReportQueryExecutor(prisma as never);
  return { executor, delegate, calls };
}

const source = getDataSource('workforce_history');
const metric = getMetric('workforce.historical_headcount');

describe('workforce.historical_headcount', () => {
  it('is declared as a point-in-time count, not a row count', () => {
    // The registry is the contract; if this reverts to `count` the number goes
    // wrong again everywhere at once.
    expect(metric.calculation).toEqual({
      kind: 'point_in_time_count',
      dateField: 'workforce_history.snapshot_date',
    });
  });

  it('counts one day, not every employee-day in the period', async () => {
    const day = new Date('2026-08-30T00:00:00.000Z');
    const { executor, calls } = executorWith(day);

    const value = await executor.metricValue(source, metric, {
      tenantId: 'tenant-1',
    });

    expect(value).toBe(12);

    // It asked for the latest date first...
    expect(calls.aggregate).toHaveLength(1);
    // ...then counted with that date pinned, not the bare period where.
    expect(calls.count).toHaveLength(1);
    expect(JSON.stringify(calls.count[0].where)).toContain(
      day.toISOString(),
    );
  });

  it('resolves the latest date present rather than the end of the period', async () => {
    /*
     * The snapshot worker captures YESTERDAY, so the final day of a period that
     * ends today has no rows. Pinning the period's end date would report a
     * headcount of zero every morning; pinning the newest date that exists
     * reports the workforce.
     */
    const yesterday = new Date('2026-08-30T00:00:00.000Z');
    const { executor, calls } = executorWith(yesterday);

    await executor.metricValue(source, metric, { tenantId: 'tenant-1' });

    expect(JSON.stringify(calls.count[0].where)).toContain(
      yesterday.toISOString(),
    );
    expect(JSON.stringify(calls.count[0].where)).not.toContain('2026-08-31');
  });

  it('reports nothing, not zero, when the period holds no snapshot', async () => {
    // Unmeasured is not unstaffed. Zero would be a data point that never
    // happened, and a chart would draw it.
    const { executor, delegate } = executorWith(null);

    const value = await executor.metricValue(source, metric, {
      tenantId: 'tenant-1',
    });

    expect(value).toBeNull();
    expect(delegate.count).not.toHaveBeenCalled();
  });
});
