import { test, expect, env } from '../fixtures/test';
import { api, apiToken, TENANTS } from '../fixtures/tenants';
import { sql } from '../fixtures/mail-db';
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
const GUARDED = '/notifications/in-app/unread-count'; // any authenticated route behind JwtAuthGuard (the guard enforces idle expiry; /auth/me is @Public)
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
    // RUN-006 hygiene: always restore the PRODUCT DEFAULT (480). Restoring the value read at start leaked 15 into later runs, which then expired tenant B's cached sessions mid-run.
    await policy(request, owner, 480).catch(() => undefined);
    if (employeeId) await api(request, owner, 'DELETE', `/employees/${employeeId}`).catch(() => undefined);
  });

  // RUN-006 test-side correction: the platform clamps `idleTimeoutMinutes` to a 15-minute MINIMUM (tenant-auth-policy.service.ts: min 15, max 1440), so a 1-minute policy is accepted
  // but enforced as 15. The window is therefore exercised honestly at 15 minutes by ageing the session's lastActivityAt in the throwaway database (the guard compares exactly that column).
  const ageSession = (minutes: number) =>
    sql(`update "RefreshToken" set "lastActivityAt" = (now() at time zone 'utc') - ($2 || ' minutes')::interval where "userId" = (select u.id from "User" u where lower(u.email) = lower($1) limit 1) and "revokedAt" is null`, [email, String(minutes)]);

  test('[DPQA-SESS-020] a session idle for longer than the 15-minute window is refused (401 SESSION_EXPIRED)', async ({ request }) => {
    test.skip(!accepted, 'BLOCKED: idle policy update refused');
    const token = await signIn(request);
    expect((await api(request, token, 'GET', GUARDED)).status, 'session accepted right after sign-in').not.toBe(401);
    await ageSession(16);
    const r = await api(request, token, 'GET', GUARDED);
    expect(r.status, 'session idle 16 min with a 15 min floor').toBe(401);
    expect(JSON.stringify(r.body)).toMatch(/SESSION_EXPIRED|inactivity/i);
  });

  test('[DPQA-SESS-021] activity inside the idle window keeps the session alive (10 minutes idle is still valid)', async ({ request }) => {
    test.skip(!accepted, 'BLOCKED: idle policy update refused');
    const token = await signIn(request);
    await ageSession(10);
    expect((await api(request, token, 'GET', GUARDED)).status, 'idle 10 min < 15 min window').not.toBe(401);
  });

  test('[DPQA-SESS-022] the idle policy cannot be set below the 15-minute product floor: a 1-minute value is accepted but enforced as 15 (documented clamp)', async ({ request }) => {
    const resolved = (await api(request, owner, 'GET', '/tenant-settings/resolved')).body;
    const shown = resolved.settings?.security?.idleTimeoutMinutes ?? resolved.security?.idleTimeoutMinutes;
    test.info().annotations.push({ type: 'observation', description: `stored/advertised idleTimeoutMinutes after setting 1 = ${String(shown)}; enforced minimum = 15` });
    const token = await signIn(request);
    await ageSession(5);
    expect((await api(request, token, 'GET', GUARDED)).status, 'a 5-minute idle session is not expired even though the stored policy is 1').not.toBe(401);
  });
  test('[DPQA-SESS-023] /auth/me and the guarded API agree about an idle-expired session (observation: /auth/me is @Public and does not apply the idle policy)', async ({ request }, info) => {
    test.skip(!accepted, 'BLOCKED: idle policy update refused');
    const token = await signIn(request);
    await ageSession(16);
    const guarded = (await api(request, token, 'GET', GUARDED)).status;
    const me = (await api(request, token, 'GET', '/auth/me')).status;
    info.annotations.push({ type: 'observation', description: `idle 16 min: guarded endpoint ${guarded}, /auth/me ${me}` });
    expect(guarded, 'guarded endpoint refuses an idle-expired session').toBe(401);
    expect(me, '/auth/me must not report an idle-expired session as live').not.toBe(200);
  });
});
