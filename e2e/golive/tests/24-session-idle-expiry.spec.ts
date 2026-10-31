import { test, expect, env } from '../fixtures/test';
import { api, apiToken, TENANTS } from '../fixtures/tenants';
import type { APIRequestContext } from '@playwright/test';

/**
 * DPQA-SESS-02x: idle-session expiry WITHOUT waiting 8 hours - the tenant security policy exposes `idleTimeoutMinutes` (catalog category `security`), so a 1-minute policy is set on
 * tenant B, a disposable user signs in, and the session is probed with /auth/me.
 *   SESS-020 an idle session is refused after the policy window   SESS-021 activity inside the window keeps the session alive
 * The ABSOLUTE lifetime is configured in DAYS (`absoluteSessionLifetimeDays`) and cannot be exercised in a run: Not Run, documented in RUN-006-PREPARATION.
 * If the platform refuses a 1-minute policy (minimum validation) the tests record Blocked and skip - the refusal itself is then the finding to report, not a pass.
 * Authored before the RUN-006 candidate exists; category/key names are from the settings catalog and are verified on the first run.
 */
const run = Date.now().toString(36);
const hdr = { 'X-DijiPeople-App': 'web' };
const policy = (request: APIRequestContext, t: string, v: number) =>
  api(request, t, 'PATCH', '/tenant-settings', { updates: [{ category: 'security', key: 'idleTimeoutMinutes', value: v }] });

test.describe.configure({ mode: 'serial' });
test.describe('idle session expiry (tenant B, 1-minute policy)', () => {
  let owner: string; let employeeId = ''; let email = ''; let original: unknown = 480; let accepted = false;
  const password = `Idle!${run}Zz9a`;
  const signIn = async (request: APIRequestContext) => {
    let r = await request.post(`${env.QA_API_URL}/api/auth/login`, { headers: hdr, data: { email, password, tenantSlug: TENANTS.B.slug } });
    for (let i = 0; i < 12 && r.status() === 429; i++) { await new Promise((x) => setTimeout(x, 15_000)); r = await request.post(`${env.QA_API_URL}/api/auth/login`, { headers: hdr, data: { email, password, tenantSlug: TENANTS.B.slug } }); }
    expect(r.status()).toBeLessThan(300);
    const j = await r.json();
    return (j.accessToken ?? j.tokens?.accessToken) as string;
  };

  test.beforeAll(async ({ request }) => {
    owner = await apiToken(request, 'B', 'OWNER');
    const cur = (await api(request, owner, 'GET', '/tenant-settings/resolved')).body;
    original = cur.settings?.security?.idleTimeoutMinutes ?? cur.security?.idleTimeoutMinutes ?? 480;
    const set = await policy(request, owner, 1);
    accepted = set.status < 300;
    email = `idle-${run}@qa.dijipeople.test`;
    const rel = (await api(request, owner, 'GET', '/lookups/relation-types')).body;
    const e = await api(request, owner, 'POST', '/employees', { firstName: 'Idle', lastName: run, workEmail: email, hireDate: '2025-02-03', employmentStatus: 'ACTIVE', phone: '+97455500001', emergencyContactName: 'X Y', emergencyContactRelationTypeId: (Array.isArray(rel) ? rel : rel.items)[0].id, emergencyContactPhone: '+97455500002' });
    expect(e.status, JSON.stringify(e.body).slice(0, 200)).toBeLessThan(300);
    employeeId = e.body.id;
    expect((await api(request, owner, 'POST', '/users', { firstName: 'Idle', lastName: run, email, password, status: 'ACTIVE', employeeId })).status).toBeLessThan(300);
  });
  test.afterAll(async ({ request }) => {
    await policy(request, owner, Number(original) || 480).catch(() => undefined);
    if (employeeId) await api(request, owner, 'DELETE', `/employees/${employeeId}`).catch(() => undefined);
  });

  test('[DPQA-SESS-020] an idle session is refused (401) after the 1-minute idle window', async ({ request }) => {
    test.skip(!accepted, 'BLOCKED: the platform refused a 1-minute idle policy (minimum validation) - report the refusal, idle expiry cannot be exercised in a run');
    const token = await signIn(request);
    expect((await api(request, token, 'GET', '/auth/me')).status, 'session valid right after sign-in').toBe(200);
    await new Promise((r) => setTimeout(r, 75_000));
    expect((await api(request, token, 'GET', '/auth/me')).status, 'session after >60 s idle').toBe(401);
  });

  test('[DPQA-SESS-021] activity inside the idle window keeps the session alive for longer than the window', async ({ request }) => {
    test.skip(!accepted, 'BLOCKED: 1-minute idle policy refused');
    const token = await signIn(request);
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 30_000));
      expect((await api(request, token, 'GET', '/auth/me')).status, `active probe ${i + 1} (t=${(i + 1) * 30}s)`).toBe(200);
    }
  });
});
