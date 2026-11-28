import { resolveDataJobWorkerSettings } from './data-job-worker.service';

describe('resolveDataJobWorkerSettings', () => {
  it('keeps the historical behaviour by default: on, every 5 s', () => {
    expect(resolveDataJobWorkerSettings({})).toEqual({
      enabled: true,
      pollIntervalMs: 5000,
    });
  });

  it('is only disabled by an explicit false (a typo must not stop imports)', () => {
    expect(
      resolveDataJobWorkerSettings({ DATA_JOB_WORKER_ENABLED: 'false' })
        .enabled,
    ).toBe(false);
    expect(
      resolveDataJobWorkerSettings({ DATA_JOB_WORKER_ENABLED: ' FALSE ' })
        .enabled,
    ).toBe(false);
    for (const v of ['true', '0', 'no', 'off', '']) {
      expect(
        resolveDataJobWorkerSettings({ DATA_JOB_WORKER_ENABLED: v }).enabled,
      ).toBe(true);
    }
  });

  it('floors the interval at 1 s and ignores unusable values', () => {
    const at = (v: string) =>
      resolveDataJobWorkerSettings({ DATA_JOB_WORKER_POLL_INTERVAL_MS: v })
        .pollIntervalMs;
    expect(at('200')).toBe(1000);
    expect(at('30000')).toBe(30000);
    for (const v of ['0', '-1', 'abc', '']) expect(at(v)).toBe(5000);
  });
});
