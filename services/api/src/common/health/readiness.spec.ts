import { probeReadiness } from './readiness';

describe('probeReadiness', () => {
  it('is ready when the database answers', async () => {
    const report = await probeReadiness(async () => 1);
    expect(report.ready).toBe(true);
    expect(report.checks.database.status).toBe('ok');
  });

  it('is not ready when the probe rejects, and does not leak the driver message', async () => {
    const report = await probeReadiness(async () => {
      throw new Error('connect ECONNREFUSED postgres://user:secret@host/db');
    });
    expect(report.ready).toBe(false);
    expect(report.checks.database.status).toBe('fail');
    expect(JSON.stringify(report)).not.toContain('secret');
  });

  it('is not ready when the probe hangs past the timeout', async () => {
    const report = await probeReadiness(() => new Promise(() => undefined), 20);
    expect(report.ready).toBe(false);
    expect(report.checks.database.status).toBe('fail');
  });

  it('does not leave a timer pending after a fast success', async () => {
    jest.useFakeTimers();
    const pending = probeReadiness(async () => 1, 10_000);
    await pending;
    expect(jest.getTimerCount()).toBe(0);
    jest.useRealTimers();
  });
});
