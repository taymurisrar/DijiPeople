import { test, expect, env } from '../fixtures/test';
import { api, apiToken, credentials, stateFile, tenantUrl, TENANTS } from '../fixtures/tenants';
import type { APIRequestContext } from '@playwright/test';

/**
 * DPQA-SESS-*  session lifetime, logout invalidation, tampering, cookie loss.
 * DPQA-PWD-*   forgot / reset password. DPQA-INV-* invitation + activation.
 * DPQA-CONC-*  duplicate submission and concurrent writes.
 * Logins here are limited (throttle: 20 / 10 min); the API tests that need a fresh session use at most two.
 */
const run = Date.now().toString(36);
const login = (request: APIRequestContext, slug: string, email: string, password: string) =>
  request.post(`${env.QA_API_URL}/api/auth/login`, { headers: { 'X-DijiPeople-App': 'web' }, data: { email, password, tenantSlug: slug } });

test('[DPQA-SESS-001] logout invalidates the access token server-side', async ({ request }) => {
  const c = credentials('B', 'EMPLOYEE');
  const r = await login(request, TENANTS.B.slug, c.email, c.password);
  const body = await r.json();
  const token = body.accessToken ?? body.tokens?.accessToken;
  expect(token).toBeTruthy();
  expect((await api(request, token, 'GET', '/employees?pageSize=1')).status).toBe(200);
  const out = await request.post(`${env.QA_API_URL}/api/auth/logout`, { headers: { authorization: `Bearer ${token}`, 'X-DijiPeople-App': 'web' } });
  expect(out.status()).toBeLessThan(300);
  const after = await api(request, token, 'GET', '/employees?pageSize=1');
  expect(after.status, 'a logged-out token must not keep working').toBe(401);
});

test('[DPQA-SESS-002] tampered and malformed tokens are 401', async ({ request }) => {
  const t = await apiToken(request, 'A', 'OWNER');
  const flipped = t.slice(0, -4) + (t.endsWith('AAAA') ? 'BBBB' : 'AAAA');
  for (const bad of [flipped, `${t}x`, 'Bearer', '', 'null']) {
    const r = await request.get(`${env.QA_API_URL}/api/employees?pageSize=1`, { headers: { authorization: `Bearer ${bad}`, 'X-DijiPeople-App': 'web' } });
    expect(r.status(), `token "${bad.slice(0, 12)}…"`).toBe(401);
  }
});

test('[DPQA-SESS-003] a token issued for the web client is refused when presented as the admin client', async ({ request }) => {
  const t = await apiToken(request, 'A', 'OWNER');
  const r = await request.get(`${env.QA_API_URL}/api/employees?pageSize=1`, { headers: { authorization: `Bearer ${t}`, 'X-DijiPeople-App': 'admin' } });
  expect([401, 403]).toContain(r.status());
});

test.describe('browser session loss', () => {
  test.use({ storageState: stateFile('A', 'EMPLOYEE') });
  test('[DPQA-SESS-004] deleting the session cookies mid-session sends the user to login on the next navigation', async ({ page, context, diag }) => {
    diag.allow(/documents\/[0-9a-f-]+\/view|status of 40[14]/); // branding logo 404 for non-admin users = DP-QA-016, 401 on the cleared session is expected
    await page.goto(tenantUrl('A', '/leaves'), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await expect(page).not.toHaveURL(/\/login/);
    await context.clearCookies();
    await page.goto(tenantUrl('A', '/employees'), { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/\/login/);
  });
  test('[DPQA-SESS-005] an expired/garbled access cookie with no refresh token ends in login, not an error page', async ({ page, context, diag }) => {
    diag.allow(/documents\/[0-9a-f-]+\/view|status of 40[14]/); // branding logo 404 for non-admin users = DP-QA-016, 401 on the cleared session is expected
    await page.goto(tenantUrl('A', '/leaves'), { waitUntil: 'domcontentloaded' });
    const cookies = await context.cookies();
    await context.clearCookies();
    await context.addCookies(cookies.filter((c) => /access/i.test(c.name)).map((c) => ({ ...c, value: 'garbled.token.value' })));
    await page.goto(tenantUrl('A', '/employees'), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/we hit an unexpected problem/i)).toHaveCount(0);
  });
});

test('[DPQA-PWD-001] forgot-password answers identically for a known and an unknown address (no account enumeration)', async ({ request }) => {
  const post = (email: string) => request.post(`${env.QA_API_URL}/api/auth/forgot-password`, { headers: { 'X-DijiPeople-App': 'web' }, data: { email, tenantSlug: TENANTS.B.slug } });
  const known = await post(credentials('B', 'PAYROLL').email);
  const unknown = await post(`nobody-${run}@qa.dijipeople.test`);
  expect(known.status()).toBe(unknown.status());
  const strip = (j: any) => JSON.stringify(j).replace(/"(traceId|timestamp|devLink|resetLink|token)":"[^"]*",?/g, '');
  expect(strip(await known.json().catch(() => ({})))).toBe(strip(await unknown.json().catch(() => ({}))));
});

test('[DPQA-PWD-002] reset with an invalid or malformed token is refused; a weak password is refused', async ({ request }) => {
  for (const data of [{ token: 'not-a-real-token', password: 'GoodPassw0rd!x' }, { token: '', password: 'GoodPassw0rd!x' }, { token: 'abc', password: '1' }]) {
    const r = await request.post(`${env.QA_API_URL}/api/auth/reset-password`, { headers: { 'X-DijiPeople-App': 'web' }, data });
    expect(r.status()).toBeGreaterThanOrEqual(400);
    expect(r.status()).toBeLessThan(500);
  }
});

test('[DPQA-PWD-003] full reset: link -> new password works, old password stops working, then restore', async ({ request }) => {
  const c = credentials('B', 'PAYROLL');
  const f = await request.post(`${env.QA_API_URL}/api/auth/forgot-password`, { headers: { 'X-DijiPeople-App': 'web' }, data: { email: c.email, tenantSlug: TENANTS.B.slug } });
  const text = JSON.stringify(await f.json().catch(() => ({})));
  const tok = (text.match(/[?&]token=([A-Za-z0-9_\-.%]+)/) ?? [])[1];
  test.skip(!tok, 'BLOCKED(environment): reset link is not exposed (email disabled, no dev link) — cannot complete the reset without a mailbox. Verify manually with a real mailbox (gate B6).');
  const fresh = `Reset!${run}Zz9`;
  const r = await request.post(`${env.QA_API_URL}/api/auth/reset-password`, { headers: { 'X-DijiPeople-App': 'web' }, data: { token: decodeURIComponent(tok!), password: fresh } });
  expect(r.status()).toBeLessThan(300);
  expect((await login(request, TENANTS.B.slug, c.email, fresh)).status()).toBeLessThan(300);
  expect((await login(request, TENANTS.B.slug, c.email, c.password)).status()).toBe(401);
});

test('[DPQA-INV-001] invited user: activation link works once, then is refused; login then works', async ({ request }) => {
  const owner = await apiToken(request, 'A', 'OWNER');
  const email = `inv-${run}@qa.dijipeople.test`;
  const rel = (await api(request, owner, 'GET', '/lookups/relation-types')).body;
  const relId = (Array.isArray(rel) ? rel : rel.items)[0].id;
  const emp = await api(request, owner, 'POST', '/employees', { firstName: 'Inv', lastName: run, workEmail: email, hireDate: '2025-02-03', employmentStatus: 'ACTIVE', phone: '+97455500001', emergencyContactName: 'X Y', emergencyContactRelationTypeId: relId, emergencyContactPhone: '+97455500002' });
  expect(emp.status, JSON.stringify(emp.body).slice(0, 200)).toBeLessThan(300);
  try {
    const inv = await api(request, owner, 'POST', `/employees/${emp.body.id}/resend-invite`);
    const link = JSON.stringify(inv.body).match(/token=([A-Za-z0-9_\-.%]+)/)?.[1];
    test.skip(!link, `BLOCKED(environment): invitation link not exposed by the API (status ${inv.status}); needs a mailbox. ${JSON.stringify(inv.body).slice(0, 160)}`);
    const pw = `Invite!${run}Zz9`;
    const act = await request.post(`${env.QA_API_URL}/api/auth/activate-account`, { headers: { 'X-DijiPeople-App': 'web' }, data: { token: decodeURIComponent(link!), password: pw } });
    expect(act.status()).toBeLessThan(300);
    const again = await request.post(`${env.QA_API_URL}/api/auth/activate-account`, { headers: { 'X-DijiPeople-App': 'web' }, data: { token: decodeURIComponent(link!), password: pw } });
    expect(again.status(), 'activation token must be single-use').toBeGreaterThanOrEqual(400);
    expect((await login(request, TENANTS.A.slug, email, pw)).status()).toBeLessThan(300);
  } finally {
    await api(request, owner, 'DELETE', `/employees/${emp.body.id}`);
  }
});

test('[DPQA-INV-002] activation with a bogus token is refused and reveals nothing', async ({ request }) => {
  const r = await request.post(`${env.QA_API_URL}/api/auth/activate-account`, { headers: { 'X-DijiPeople-App': 'web' }, data: { token: 'bogus-token', password: 'GoodPassw0rd!x' } });
  expect(r.status()).toBeGreaterThanOrEqual(400);
  expect(r.status()).toBeLessThan(500);
});

test('[DPQA-CONC-001] five simultaneous identical employee creates produce exactly one record', async ({ request }) => {
  const owner = await apiToken(request, 'A', 'OWNER');
  const rel = (await api(request, owner, 'GET', '/lookups/relation-types')).body;
  const relId = (Array.isArray(rel) ? rel : rel.items)[0].id;
  const email = `conc-${run}@qa.dijipeople.test`;
  const body = { firstName: 'Conc', lastName: run, workEmail: email, hireDate: '2025-02-03', employmentStatus: 'ACTIVE', phone: '+97455500001', emergencyContactName: 'X Y', emergencyContactRelationTypeId: relId, emergencyContactPhone: '+97455500002' };
  const rs = await Promise.all(Array.from({ length: 5 }, () => api(request, owner, 'POST', '/employees', body)));
  const ok = rs.filter((r) => r.status < 300);
  const list = (await api(request, owner, 'GET', `/employees?search=conc&pageSize=100`)).body.items.filter((e: { workEmail: string }) => e.workEmail === email);
  for (const e of list) await api(request, owner, 'DELETE', `/employees/${e.id}`);
  expect(rs.every((r) => r.status < 500), 'no 5xx under concurrency').toBe(true);
  expect(list.length, `duplicates created: ${ok.length} accepted`).toBe(1);
});

test('[DPQA-CONC-002] two concurrent edits of different fields leave a consistent record and no 5xx', async ({ request }) => {
  const owner = await apiToken(request, 'A', 'OWNER');
  const rel = (await api(request, owner, 'GET', '/lookups/relation-types')).body;
  const relId = (Array.isArray(rel) ? rel : rel.items)[0].id;
  const e = await api(request, owner, 'POST', '/employees', { firstName: 'Race', lastName: run, hireDate: '2025-02-03', employmentStatus: 'ACTIVE', phone: '+97455500001', emergencyContactName: 'X Y', emergencyContactRelationTypeId: relId, emergencyContactPhone: '+97455500002' });
  const id = e.body.id;
  try {
    const [a, b] = await Promise.all([
      api(request, owner, 'PATCH', `/employees/${id}`, { preferredName: 'RaceA' }),
      api(request, owner, 'PATCH', `/employees/${id}`, { middleName: 'RaceB' }),
    ]);
    expect(a.status).toBeLessThan(500);
    expect(b.status).toBeLessThan(500);
    const f = (await api(request, owner, 'GET', `/employees/${id}`)).body;
    expect(f.preferredName === 'RaceA' || f.middleName === 'RaceB', 'at least one write persisted').toBe(true);
    test.info().annotations.push({ type: 'lost-update', description: `preferredName=${f.preferredName} middleName=${f.middleName} (both set = no lost update)` });
  } finally {
    await api(request, owner, 'DELETE', `/employees/${id}`);
  }
});

test('[DPQA-CONC-003] parallel overlapping leave requests: at most one is accepted', async ({ request }) => {
  const emp = await apiToken(request, 'A', 'EMPLOYEE');
  const owner = await apiToken(request, 'A', 'OWNER');
  const types = (await api(request, owner, 'GET', '/leave-types')).body;
  const t = (Array.isArray(types) ? types : types.items).find((x: { code?: string }) => x.code === 'QAL');
  test.skip(!t, 'leave type fixture missing (run LV suite first)');
  const d = new Date(Date.UTC(2028, 0, 2 + (Date.now() % 300))).toISOString().slice(0, 10);
  const rs = await Promise.all(Array.from({ length: 3 }, () => api(request, emp, 'POST', '/leave-requests', { leaveTypeId: t.id, startDate: d, endDate: d })));
  for (const r of rs.filter((x) => x.status === 201)) await api(request, owner, 'POST', `/leave-requests/${r.body.id}/cancel`, { reason: 'QA cleanup' });
  expect(rs.filter((r) => r.status === 201).length, 'overlap guard under concurrency').toBeLessThanOrEqual(1);
});
