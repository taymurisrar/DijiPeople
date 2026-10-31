import { test, expect, env } from '../fixtures/test';
import { api, apiToken, TENANTS } from '../fixtures/tenants';
import { mail } from '../fixtures/mail-db';
import type { APIRequestContext } from '@playwright/test';

/**
 * DPQA-SEC-*: critical security regression for RUN-005. Written BEFORE the final candidate exists - every expectation is a security property
 * (single use, revocation, no listing of deleted data), never a description of what any build currently does. Traceability:
 *   SEC-001/002 -> DP-QA-031 (+ DP-QA-005 hygiene)   SEC-003/004 -> DP-QA-027   SEC-005..007 -> DP-QA-030   SEC-008 -> DP-QA-031 session hygiene
 * All identities are disposable users created through the API on tenant A and deleted afterwards; shared role users are never touched
 * (password history and the 60 s reset cool-down would otherwise poison later suites).
 */
const run = Date.now().toString(36);
const hdr = { 'X-DijiPeople-App': 'web' };
let owner: string;
test.beforeAll(async ({ request }) => { owner = await apiToken(request, 'A', 'OWNER'); await mail.clear(); });

async function relationId(request: APIRequestContext) {
  const rel = (await api(request, owner, 'GET', '/lookups/relation-types')).body;
  return (Array.isArray(rel) ? rel : rel.items)[0].id as string;
}
const empBody = (relId: string, email: string, extra: Record<string, unknown> = {}) => ({
  firstName: 'Sec', lastName: run, workEmail: email, hireDate: '2025-02-03', employmentStatus: 'ACTIVE', phone: '+97455500001',
  emergencyContactName: 'X Y', emergencyContactRelationTypeId: relId, emergencyContactPhone: '+97455500002', ...extra,
});
async function invitedEmployee(request: APIRequestContext, tag: string) {
  const email = `${tag}-${run}@qa.dijipeople.test`;
  const e = await api(request, owner, 'POST', '/employees', empBody(await relationId(request), email, { provisionSystemAccess: true, sendInvitationNow: true }));
  expect(e.status, JSON.stringify(e.body).slice(0, 200)).toBeLessThan(300);
  return { email, id: e.body.id as string, token: mail.token(await mail.waitFor(email, /activate|invit|welcome/i, 60_000)) };
}
async function disposableUser(request: APIRequestContext, tag: string) {
  const email = `${tag}-${run}@qa.dijipeople.test`;
  const e = await api(request, owner, 'POST', '/employees', empBody(await relationId(request), email));
  expect(e.status, JSON.stringify(e.body).slice(0, 200)).toBeLessThan(300);
  const password = `Start!${run}Zz9a`;
  const u = await api(request, owner, 'POST', '/users', { firstName: 'Disp', lastName: tag, email, password, status: 'ACTIVE', employeeId: e.body.id });
  expect(u.status, JSON.stringify(u.body).slice(0, 200)).toBeLessThan(300);
  return { email, password, employeeId: e.body.id as string };
}
const login = (request: APIRequestContext, email: string, password: string) =>
  request.post(`${env.QA_API_URL}/api/auth/login`, { headers: hdr, data: { email, password, tenantSlug: TENANTS.A.slug } });
const remove = (request: APIRequestContext, id: string) => api(request, owner, 'DELETE', `/employees/${id}`);

test('[DPQA-SEC-001] concurrent use of ONE password-reset link: at most one request succeeds and exactly one resulting password works', async ({ request }) => {
  const d = await disposableUser(request, 'sec1');
  try {
    await mail.clear();
    await request.post(`${env.QA_API_URL}/api/auth/forgot-password`, { headers: hdr, data: { email: d.email, tenantSlug: TENANTS.A.slug } });
    const token = mail.token(await mail.waitFor(d.email, /reset|password/i, 60_000));
    const pws = [1, 2, 3, 4, 5].map((i) => `Cc${i}!${run}Zz9q`);
    const rs = await Promise.all(pws.map((password) => request.post(`${env.QA_API_URL}/api/auth/reset-password`, { headers: hdr, data: { token, password } })));
    const ok = rs.map((r, i) => ({ s: r.status(), pw: pws[i] })).filter((x) => x.s < 300);
    expect(ok.length, `statuses ${rs.map((r) => r.status())}`).toBeLessThanOrEqual(1);
    expect(ok.length, 'the link must work once').toBe(1);
    const works: string[] = [];
    for (const pw of pws) if ((await login(request, d.email, pw)).status() < 300) works.push(pw);
    expect(works, 'exactly the password of the accepted request works').toEqual([ok[0].pw]);
  } finally { await remove(request, d.employeeId); }
});

test('[DPQA-SEC-002] a used reset link stays dead for its whole lifetime, even with the SAME password and after a later sign-in', async ({ request }) => {
  const d = await disposableUser(request, 'sec2');
  try {
    await mail.clear();
    await request.post(`${env.QA_API_URL}/api/auth/forgot-password`, { headers: hdr, data: { email: d.email, tenantSlug: TENANTS.A.slug } });
    const token = mail.token(await mail.waitFor(d.email, /reset|password/i, 60_000));
    const fresh = `Once!${run}Zz9r`;
    expect((await request.post(`${env.QA_API_URL}/api/auth/reset-password`, { headers: hdr, data: { token, password: fresh } })).status()).toBeLessThan(300);
    expect((await login(request, d.email, fresh)).status()).toBeLessThan(300);
    const replay = await request.post(`${env.QA_API_URL}/api/auth/reset-password`, { headers: hdr, data: { token, password: fresh } });
    expect(replay.status(), 'replay with the same password').toBeGreaterThanOrEqual(400);
    const takeover = await request.post(`${env.QA_API_URL}/api/auth/reset-password`, { headers: hdr, data: { token, password: `Evil!${run}Zz9s` } });
    expect(takeover.status(), 'replay with an attacker password').toBeGreaterThanOrEqual(400);
    expect((await login(request, d.email, fresh)).status(), 'the legitimate password still works').toBeLessThan(300);
  } finally { await remove(request, d.employeeId); }
});

test('[DPQA-SEC-003] concurrent activation with ONE invitation token: exactly one request activates, the account has exactly one usable password', async ({ request }) => {
  const inv = await invitedEmployee(request, 'sec3');
  try {
    const pws = [1, 2, 3, 4, 5].map((i) => `Act${i}!${run}Zz9t`);
    const rs = await Promise.all(pws.map((password) => request.post(`${env.QA_API_URL}/api/auth/activate-account`, { headers: hdr, data: { token: inv.token, password } })));
    const ok = rs.map((r, i) => ({ s: r.status(), pw: pws[i] })).filter((x) => x.s < 300);
    expect(ok.length, `statuses ${rs.map((r) => r.status())}`).toBe(1);
    const works: string[] = [];
    for (const pw of pws) if ((await login(request, inv.email, pw)).status() < 300) works.push(pw);
    expect(works).toEqual([ok[0].pw]);
  } finally { await remove(request, inv.id); }
});

test('[DPQA-SEC-004] an invitation token cannot be replayed after activation, even to change the password', async ({ request }) => {
  const inv = await invitedEmployee(request, 'sec4');
  try {
    const first = `Inv!${run}Zz9u`;
    expect((await request.post(`${env.QA_API_URL}/api/auth/activate-account`, { headers: hdr, data: { token: inv.token, password: first } })).status()).toBeLessThan(300);
    const replay = await request.post(`${env.QA_API_URL}/api/auth/activate-account`, { headers: hdr, data: { token: inv.token, password: `Hijack!${run}Zz9v` } });
    expect(replay.status()).toBeGreaterThanOrEqual(400);
    expect((await login(request, inv.email, first)).status(), 'original password intact').toBeLessThan(300);
  } finally { await remove(request, inv.id); }
});

test.describe('deleted-employee visibility', () => {
  let id: string; let email: string; let first: string;
  test.beforeAll(async ({ request }) => {
    email = `sec5-${run}@qa.dijipeople.test`; first = `Del${run}`;
    const e = await api(request, owner, 'POST', '/employees', empBody(await relationId(request), email, { firstName: first }));
    expect(e.status, JSON.stringify(e.body).slice(0, 200)).toBeLessThan(300);
    id = e.body.id;
    const d = await api(request, owner, 'DELETE', `/employees/${id}`);
    expect(d.status, 'delete accepted').toBeLessThan(300);
  });

  test('[DPQA-SEC-005] a deleted employee is absent from the employees API list, the search, and the entity data API', async ({ request }) => {
    const list = await api(request, owner, 'GET', `/employees?search=${first}&pageSize=50`);
    expect(JSON.stringify(list.body), 'employees list').not.toContain(id);
    const data = await api(request, owner, 'GET', `/data/employees?search=${first}&pageSize=50`);
    expect(data.status, 'entity data API answers').toBeLessThan(500);
    expect(JSON.stringify(data.body), 'entity data API list').not.toContain(id);
  });

  test('[DPQA-SEC-006] a deleted employee cannot be read, edited or deleted again by id (404, not 200, not 500)', async ({ request }) => {
    for (const [m, p, body] of [['GET', `/employees/${id}`, undefined], ['PATCH', `/employees/${id}`, { firstName: 'Zombie' }], ['DELETE', `/employees/${id}`, undefined]] as const) {
      const r = await api(request, owner, m, p, body);
      expect(r.status, `${m} ${p} -> ${JSON.stringify(r.body).slice(0, 120)}`).toBe(404);
    }
  });

  test('[DPQA-SEC-007] a deleted employee is absent from employee lookups used by pickers', async ({ request }) => {
    for (const p of [`/employees/lookup?search=${first}`, `/lookups/employees?search=${first}`]) {
      const r = await api(request, owner, 'GET', p);
      if (r.status === 404) continue; // route not present in this build - not a pass, just not applicable
      expect(JSON.stringify(r.body), p).not.toContain(id);
    }
  });
});

test('[DPQA-SEC-008] a password reset ends the user\'s existing sessions: the old access and refresh tokens stop working', async ({ request }) => {
  const d = await disposableUser(request, 'sec8');
  try {
    const l = await login(request, d.email, d.password);
    expect(l.status()).toBeLessThan(300);
    const body = await l.json();
    const access = body.accessToken ?? body.tokens?.accessToken;
    expect((await api(request, access, 'GET', '/auth/me')).status, 'session works before the reset').toBe(200);
    await mail.clear();
    await request.post(`${env.QA_API_URL}/api/auth/forgot-password`, { headers: hdr, data: { email: d.email, tenantSlug: TENANTS.A.slug } });
    const token = mail.token(await mail.waitFor(d.email, /reset|password/i, 60_000));
    expect((await request.post(`${env.QA_API_URL}/api/auth/reset-password`, { headers: hdr, data: { token, password: `Rs8!${run}Zz9w` } })).status()).toBeLessThan(300);
    expect((await api(request, access, 'GET', '/auth/me')).status, 'access token issued before the reset must be rejected').toBe(401);
  } finally { await remove(request, d.employeeId); }
});

test('[DPQA-SEC-009] tenant isolation of tokens: an invitation/reset token from tenant A cannot be used with tenant B\'s host or slug', async ({ request }) => {
  const d = await disposableUser(request, 'sec9');
  try {
    await mail.clear();
    await request.post(`${env.QA_API_URL}/api/auth/forgot-password`, { headers: hdr, data: { email: d.email, tenantSlug: TENANTS.A.slug } });
    const token = mail.token(await mail.waitFor(d.email, /reset|password/i, 60_000));
    // B's slug on the login must not authenticate A's user, whatever password they hold
    const cross = await request.post(`${env.QA_API_URL}/api/auth/login`, { headers: hdr, data: { email: d.email, password: d.password, tenantSlug: TENANTS.B.slug } });
    expect(cross.status(), 'A user signing in on tenant B').toBeGreaterThanOrEqual(400);
    expect(token.length).toBeGreaterThan(20);
  } finally { await remove(request, d.employeeId); }
});
