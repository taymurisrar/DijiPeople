import { test, expect, env } from '../fixtures/test';
import { api, apiToken, credentials, TENANTS } from '../fixtures/tenants';
import { sql } from '../fixtures/mail-db';
import type { APIRequestContext } from '@playwright/test';

/**
 * RUN-004.
 * DPQA-LV-03x  leave entitlement, balance consumption/restoration and policy restriction (tenant A, real policy objects).
 * DPQA-ORG-01x business units, locations, holiday calendars, reporting lines (tenant A, tenant B for isolation).
 * DPQA-SESS-01x session expiry, refresh and revocation, simulated by ageing the session rows in the throwaway DB.
 * Every test creates what it needs and removes it in `finally`.
 */
const run = Date.now().toString(36);
const hdr = { 'X-DijiPeople-App': 'web' };
const day = (n: number) => new Date(Date.UTC(2030, 2, 4 + n)).toISOString().slice(0, 10); // Monday 2030-03-04 + n

async function post(request: APIRequestContext, t: string, p: string, b: unknown) { return api(request, t, 'POST', p, b); }

test.describe('leave entitlement and balances', () => {
  let owner: string; let emp: string;
  let typeId: string; let policyId: string; let assignmentId: string; let ruleId: string;

  test.beforeAll(async ({ request }) => {
    owner = await apiToken(request, 'A', 'OWNER');
    emp = await apiToken(request, 'A', 'EMPLOYEE');
    const t = await post(request, owner, '/leave-types', { name: `QA Balance ${run}`, code: `QB${run.slice(-4).toUpperCase()}`, category: 'ANNUAL', isPaid: true, consumesBalance: true, requiresApproval: true, employeeRequestAllowed: true, isActive: true });
    expect(t.status, JSON.stringify(t.body).slice(0, 200)).toBeLessThan(300);
    typeId = t.body.id;
    const p = await post(request, owner, '/leave-policies', { name: `QA Policy ${run}`, isActive: true });
    expect(p.status, JSON.stringify(p.body).slice(0, 200)).toBeLessThan(300);
    policyId = p.body.id;
    const r = await post(request, owner, `/leave-policies/${policyId}/rules`, { leaveTypeId: typeId, entitlementDays: 2, accrualType: 'NONE', approvalRequired: true, isPaid: true, allowFutureRequests: true, maxFutureDays: 3650 });
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBeLessThan(300);
    ruleId = r.body.id;
    const a = await post(request, owner, '/leave-policies/assignments', { leavePolicyId: policyId, scopeType: 'TENANT', isActive: true, effectiveFrom: '2020-01-01' });
    expect(a.status, JSON.stringify(a.body).slice(0, 300)).toBeLessThan(300);
    assignmentId = a.body.id;
  });

  test.afterAll(async ({ request }) => {
    const reqs = (await api(request, emp, 'GET', '/leave-requests/mine')).body;
    for (const r of (Array.isArray(reqs) ? reqs : []).filter((x: { leaveTypeId: string; status: string }) => x.leaveTypeId === typeId && !/CANCEL|REJECT/.test(x.status))) {
      const c = await api(request, emp, 'POST', `/leave-requests/${r.id}/cancel`, { reason: 'QA cleanup' });
      if (c.status >= 300) await api(request, owner, 'POST', `/leave-requests/${r.id}/cancel`, { reason: 'QA cleanup' });
    }
    if (assignmentId) await api(request, owner, 'DELETE', `/leave-policies/assignments/${assignmentId}`);
    if (ruleId) await api(request, owner, 'DELETE', `/leave-policies/${policyId}/rules/${ruleId}`);
    if (policyId) await api(request, owner, 'DELETE', `/leave-policies/${policyId}`);
    if (typeId) await api(request, owner, 'DELETE', `/leave-types/${typeId}`);
  });

  test('[DPQA-LV-030] a tenant-wide policy writes a balance for the employee and the employee\'s requestable types follow the policy', async ({ request }) => {
    const at = await api(request, emp, 'GET', '/leave-requests/available-types');
    expect(at.status).toBe(200);
    const ids = (at.body.leaveTypes as Array<{ id: string }>).map((t) => t.id);
    expect(ids, 'the policy rule makes the type requestable').toContain(typeId);
    expect(at.body.leavePolicy?.name, 'the applicable policy is reported').toContain(`QA Policy ${run}`);
    const tables = await sql<{ table_name: string }>(`select table_name from information_schema.tables where table_schema='public' and table_name ilike 'leavebalance%'`);
    expect(tables.length, 'a balance table exists').toBeGreaterThan(0);
    const rows = await sql<Record<string, unknown>>(`select * from "${tables[0].table_name}" where "leaveTypeId" = $1`, [typeId]);
    expect(rows.length, 'a balance row was written for the employees covered').toBeGreaterThan(0);
    expect(JSON.stringify(rows[0])).toMatch(/\b2\b|"2\.?0*"/);
  });

  test('[DPQA-LV-031] balance is consumed on APPROVAL, and an approval beyond the entitlement is refused (DP-QA-029: it overdraws today)', async ({ request }) => {
    const base = 40 + (Date.now() % 300);
    const submit = (n: number) => api(request, emp, 'POST', '/leave-requests', { leaveTypeId: typeId, startDate: day(base + n), endDate: day(base + n), reason: 'QA balance' });
    const [r1, r2, r3] = [await submit(0), await submit(1), await submit(2)];
    expect([r1.status, r2.status, r3.status], 'pending requests are accepted (balance is not reserved on submit)').toEqual([201, 201, 201]);
    // RUN-005 fixture fix: the policy is tenant-wide, so one LeaveBalance row exists PER EMPLOYEE - read the row of the employee who submits (`limit 1` picked an arbitrary employee).
    const bal = async () => (await sql<{ totalUsed: string; totalRemaining: string }>(`select lb."totalUsed", lb."totalRemaining" from "LeaveBalance" lb join "Employee" e on e.id = lb."employeeId" join "User" u on u.id = e."userId" where lb."leaveTypeId" = $1 and u.email = $2`, [typeId, credentials('A', 'EMPLOYEE').email]))[0];
    expect(Number((await bal()).totalRemaining)).toBe(2);
    const waitUsed = async (n: number) => { for (let i = 0; i < 20; i++) { if (Number((await bal()).totalUsed) >= n) return; await new Promise((r) => setTimeout(r, 500)); } };
    // the balance row is written shortly AFTER an approval returns (observed lag ~0.7 s), so wait for it before the next decision
    expect((await post(request, owner, `/leave-requests/${r1.body.id}/approve`, {})).status).toBeLessThan(300);
    await waitUsed(1);
    expect(Number((await bal()).totalUsed), 'the balance reflects the FIRST approval within 10 s (DP-QA-029: it only updates with the next decision)').toBeGreaterThanOrEqual(1);
    expect((await post(request, owner, `/leave-requests/${r2.body.id}/approve`, {})).status).toBeLessThan(300);
    await waitUsed(2);
    const mid = await bal();
    expect([Number(mid.totalUsed), Number(mid.totalRemaining)], 'two approvals consume the 2-day entitlement').toEqual([2, 0]);
    const third = await post(request, owner, `/leave-requests/${r3.body.id}/approve`, {});
    const end = await bal();
    expect(third.status, `third approval must be refused; remaining is now ${end.totalRemaining}`).toBeGreaterThanOrEqual(400);
    expect(Number(end.totalRemaining), 'balance never goes negative').toBeGreaterThanOrEqual(0);
    // approved requests cannot be cancelled (DP-QA-019), so "cancel restores the balance" is Blocked by that issue.
    await api(request, owner, 'POST', `/leave-requests/${r3.body.id}/reject`, { comments: 'QA cleanup' });
  });

  test('[DPQA-LV-032] leave types outside the policy are not offered to the employee', async ({ request }) => {
    const other = await post(request, owner, '/leave-types', { name: `QA Outside ${run}`, code: `QO${run.slice(-4).toUpperCase()}`, category: 'ANNUAL', isPaid: true, consumesBalance: false, requiresApproval: true, employeeRequestAllowed: true, isActive: true });
    expect(other.status).toBeLessThan(300);
    try {
      const at = await api(request, emp, 'GET', '/leave-requests/available-types');
      expect((at.body.leaveTypes as Array<{ id: string }>).map((t) => t.id)).not.toContain(other.body.id);
    } finally {
      await api(request, owner, 'DELETE', `/leave-types/${other.body.id}`);
    }
  });
});

test.describe('organization structure', () => {
  test('[DPQA-ORG-010] business unit lifecycle: create under the organization, update, deactivate; tenant B cannot touch it', async ({ request }) => {
    const a = await apiToken(request, 'A', 'OWNER');
    const b = await apiToken(request, 'B', 'OWNER');
    const orgs = (await api(request, a, 'GET', '/organizations')).body;
    const org = (Array.isArray(orgs) ? orgs : orgs.items)[0];
    test.skip(!org, 'tenant has no organization record');
    const c = await post(request, a, '/business-units', { name: `QA BU ${run}`, organizationId: org.id });
    expect(c.status, JSON.stringify(c.body).slice(0, 200)).toBeLessThan(300);
    try {
      expect((await api(request, a, 'PATCH', `/business-units/${c.body.id}`, { name: `QA BU ${run} v2` })).status).toBeLessThan(300);
      expect((await api(request, a, 'GET', `/business-units/${c.body.id}`)).body.name).toBe(`QA BU ${run} v2`);
      expect([403, 404]).toContain((await api(request, b, 'GET', `/business-units/${c.body.id}`)).status);
      expect((await post(request, a, '/business-units', { name: `QA BU ${run} v2`, organizationId: org.id })).status, 'duplicate name').toBeGreaterThanOrEqual(400);
    } finally {
      expect((await api(request, a, 'DELETE', `/business-units/${c.body.id}`)).status).toBeLessThan(300);
    }
  });

  test('[DPQA-ORG-011] work location lifecycle with coordinates; invalid latitude/radius refused', async ({ request }) => {
    const a = await apiToken(request, 'A', 'OWNER');
    const bad = await post(request, a, '/locations', { name: `QA Loc bad ${run}`, city: 'Doha', state: 'Doha', country: 'Qatar', latitude: 123, longitude: 51.5, allowedRadiusMeters: 200 });
    if (bad.status < 300) await api(request, a, 'DELETE', `/locations/${bad.body.id}`);
    expect(bad.status, 'latitude 123 is impossible').toBeGreaterThanOrEqual(400);
    const neg = await post(request, a, '/locations', { name: `QA Loc neg ${run}`, city: 'Doha', state: 'Doha', country: 'Qatar', latitude: 25.2, longitude: 51.5, allowedRadiusMeters: -5 });
    if (neg.status < 300) await api(request, a, 'DELETE', `/locations/${neg.body.id}`);
    expect(neg.status, 'negative radius').toBeGreaterThanOrEqual(400);
    const c = await post(request, a, '/locations', { name: `QA Loc ${run}`, city: 'Doha', state: 'Doha', country: 'Qatar', latitude: 25.2854, longitude: 51.531, allowedRadiusMeters: 200 });
    expect(c.status, JSON.stringify(c.body).slice(0, 200)).toBeLessThan(300);
    try {
      const g = (await api(request, a, 'GET', `/locations/${c.body.id}`)).body;
      expect(Number(g.latitude)).toBeCloseTo(25.2854, 3);
      expect((await api(request, a, 'PATCH', `/locations/${c.body.id}`, { allowedRadiusMeters: 300 })).status).toBeLessThan(300);
      expect(Number((await api(request, a, 'GET', `/locations/${c.body.id}`)).body.allowedRadiusMeters)).toBe(300);
    } finally {
      expect((await api(request, a, 'DELETE', `/locations/${c.body.id}`)).status).toBeLessThan(300);
    }
  });

  test('[DPQA-ORG-012] holiday calendar lifecycle (enterprise configuration API)', async ({ request }) => {
    const a = await apiToken(request, 'A', 'OWNER');
    const base = '/holiday-calendars';
    const c = await post(request, a, base, { name: `QA Holidays ${run}`, code: `QH${run.slice(-4).toUpperCase()}`, isActive: true });
    test.skip(c.status === 404, `holiday calendar route not under ${base} (status 404)`);
    expect(c.status, JSON.stringify(c.body).slice(0, 300)).toBeLessThan(300);
    try {
      const list = (await api(request, a, 'GET', base)).body;
      expect(JSON.stringify(list)).toContain(`QA Holidays ${run}`);
    } finally {
      await api(request, a, 'DELETE', `${base}/${c.body.id}`);
    }
  });

  test('[DPQA-ORG-013] reporting lines: manager link persists, direct reports update, self/cycle/foreign managers are refused', async ({ request }) => {
    const a = await apiToken(request, 'A', 'OWNER');
    const b = await apiToken(request, 'B', 'OWNER');
    const list = (await api(request, a, 'GET', '/employees?pageSize=100')).body.items as Array<{ id: string; workEmail: string }>;
    const emp = list.find((e) => e.workEmail === 'a-employee@qa.dijipeople.test')!;
    const mgr = list.find((e) => e.workEmail === 'a-manager@qa.dijipeople.test')!;
    const bEmp = (await api(request, b, 'GET', '/employees?pageSize=1')).body.items[0];
    const set = (id: string, m: string | null) => api(request, a, 'PATCH', `/employees/${id}/reporting-manager`, { reportingManagerEmployeeId: m });
    try {
      expect((await set(emp.id, mgr.id)).status).toBeLessThan(300);
      expect((await api(request, a, 'GET', `/employees/${emp.id}`)).body.reportingManagerEmployeeId ?? (await api(request, a, 'GET', `/employees/${emp.id}`)).body.reportingManager?.id).toBe(mgr.id);
      const dr = await api(request, a, 'GET', `/employees/${mgr.id}/direct-reports`);
      expect(JSON.stringify(dr.body)).toContain(emp.id);
      expect((await set(emp.id, emp.id)).status, 'own manager').toBeGreaterThanOrEqual(400);
      expect((await set(mgr.id, emp.id)).status, 'reporting cycle').toBeGreaterThanOrEqual(400);
      expect((await set(emp.id, bEmp.id)).status, 'manager from another tenant').toBeGreaterThanOrEqual(400);
    } finally {
      await set(emp.id, null);
    }
  });
});

test.describe('session expiry, refresh and revocation (sessions aged in the QA database)', () => {
  const login = (request: APIRequestContext, email: string, password: string) =>
    request.post(`${env.QA_API_URL}/api/auth/login`, { headers: hdr, data: { email, password, tenantSlug: TENANTS.B.slug } });

  test('[DPQA-SESS-010] a revoked session is rejected immediately, even though the access token has not expired', async ({ request }) => {
    const email = 'b-hr@qa.dijipeople.test';
    const r = await login(request, email, env.QA_PASSWORD);
    const body = await r.json();
    const token = body.accessToken ?? body.tokens?.accessToken;
    expect(token).toBeTruthy();
    expect((await api(request, token, 'GET', '/employees?pageSize=1')).status).toBe(200);
    await sql(`update "RefreshToken" set "revokedAt" = now() where "userId" = (select id from "User" where email = $1)`, [email]);
    const sess = await sql<{ table_name: string }>(`select table_name from information_schema.columns where table_schema='public' and column_name = 'revokedAt' and table_name ilike '%session%'`);
    for (const s of sess) await sql(`update "${s.table_name}" set "revokedAt" = now() where "userId" = (select id from "User" where email = $1)`, [email]).catch(() => undefined);
    const after = await api(request, token, 'GET', '/employees?pageSize=1');
    expect(after.status, 'a revoked session must stop working at once').toBe(401);
  });

  test('[DPQA-SESS-011] token lifetimes: the access token is short-lived and the refresh token is bounded by the configured TTL (DB ageing cannot expire a signed token)', async ({ request }) => {
    const r = await login(request, 'b-manager@qa.dijipeople.test', env.QA_PASSWORD);
    const body = await r.json();
    const claims = (jwt: string) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
    const access = claims(body.accessToken ?? body.tokens?.accessToken);
    // observed 28 800 s on the QA stack (WEB_JWT_ACCESS_TTL from the copied .env): assert the bound the product documents (absolute session 12 h) and record the value
    test.info().annotations.push({ type: 'access-token-ttl-seconds', description: String(access.exp - access.iat) });
    expect(access.exp - access.iat, 'access token lifetime (s)').toBeLessThanOrEqual(43_200);
    const refresh = body.refreshToken ?? body.tokens?.refreshToken;
    if (refresh) expect(claims(refresh).exp - claims(refresh).iat, 'refresh token lifetime (s)').toBeLessThanOrEqual(30 * 24 * 3600);
    test.info().annotations.push({ type: 'not-run', description: 'idle (8 h) and absolute (12 h) session timeouts need real elapsed time or a clock override; BLOCKED(time) — revocation is covered by SESS-010, the token lifetime bounds by this test.' });
  });

  test('[DPQA-SESS-012] refresh endpoint: garbage and missing refresh tokens are refused with no 5xx', async ({ request }) => {
    for (const data of [{}, { refreshToken: 'garbage' }]) {
      const r = await request.post(`${env.QA_API_URL}/api/auth/refresh`, { headers: hdr, data });
      expect(r.status()).toBeGreaterThanOrEqual(400);
      expect(r.status()).toBeLessThan(500);
    }
  });
});
