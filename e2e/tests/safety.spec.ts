import { expect, test } from '@playwright/test';
import { assessSafety } from '../fixtures/safety';

/**
 * The guard that stops the writing flows (M, N) from touching a real
 * environment. Pure: no network, no database, so it runs everywhere and a
 * regression in a refusal is caught even when no stack is up.
 */
const local = {
  urls: { api: 'http://localhost:4000', web: 'http://localhost:3001' },
  databaseUrl: 'postgresql://u:p@localhost:5432/dijipeople_growthqa_test',
  apiEnvironment: 'development',
};

test.describe('assessSafety', () => {
  test('SAF-1 a disposable local stack is allowed', () => {
    expect(assessSafety(local)).toEqual({ safe: true });
  });

  test('SAF-2 a CI-style stack (127.0.0.1, _test database) is allowed', () => {
    expect(
      assessSafety({
        urls: { api: 'http://127.0.0.1:4000' },
        databaseUrl: 'postgresql://ci:ci@127.0.0.1:5432/dijipeople_browser_test',
        apiEnvironment: 'test',
      }),
    ).toEqual({ safe: true });
  });

  for (const host of [
    'https://api.dijipeople.com',
    'https://admin.dijipeople.com',
    'https://app.dijipeople.com',
    'https://dijipeople.com',
  ]) {
    test(`SAF-3 a production URL is refused: ${host}`, () => {
      const verdict = assessSafety({ ...local, urls: { api: host } });
      expect(verdict.safe).toBe(false);
    });
  }

  test('SAF-4 a non-loopback host is refused even if it is not ours', () => {
    const verdict = assessSafety({ ...local, urls: { api: 'https://staging.example.com' } });
    expect(verdict).toMatchObject({ safe: false });
  });

  test('SAF-5 a non-disposable database name is refused', () => {
    for (const name of ['dijipeople', 'dijipeople_prod', 'postgres']) {
      const verdict = assessSafety({
        ...local,
        databaseUrl: `postgresql://u:p@localhost:5432/${name}`,
      });
      expect(verdict.safe, name).toBe(false);
    }
  });

  test('SAF-6 a remote database is refused even with a test-looking name', () => {
    const verdict = assessSafety({
      ...local,
      databaseUrl: 'postgresql://u:p@ep-x.neon.tech:5432/app_test',
    });
    expect(verdict.safe).toBe(false);
  });

  test('SAF-7 a missing database URL is refused, not assumed fine', () => {
    expect(assessSafety({ ...local, databaseUrl: undefined }).safe).toBe(false);
  });

  test('SAF-8 an API that reports production is refused', () => {
    expect(assessSafety({ ...local, apiEnvironment: 'production' }).safe).toBe(false);
  });

  test('SAF-9 every reason is reported, not just the first', () => {
    const verdict = assessSafety({
      urls: { api: 'https://api.dijipeople.com' },
      databaseUrl: 'postgresql://u:p@db.example.com:5432/dijipeople',
      apiEnvironment: 'production',
    });
    expect(verdict.safe).toBe(false);
    if (!verdict.safe) expect(verdict.reasons.length).toBeGreaterThanOrEqual(4);
  });
});
