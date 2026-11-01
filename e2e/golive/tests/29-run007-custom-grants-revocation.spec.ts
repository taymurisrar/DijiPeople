import { test, expect, env } from '../fixtures/test';
import { api, apiToken, planTenantProvisioned, TENANTS } from '../fixtures/tenants';
import { mail, sql } from '../fixtures/mail-db';
import type { APIRequestContext } from '@playwright/test';

/**
 * RUN-007 (authored before the fix candidate exists). Owner decisions 4 and 6.
 *   CUS-001..004  Custom subscription BASED ON `enterprise-plus`, four grant states (neither / agent only / white-label only / both):
 *                 the Desktop Agent and white-label e-mail follow the EXPLICIT grants, never the base plan (DP-QA-042 retest)
 *   CUS-010       withdrawing a grant cuts an issued agent ACCESS token, the REFRESH token and any new sign-in promptly (decision 6), and the measured delay is recorded
 *   CUS-011       the withdrawal does not damage the ordinary web session of the same user (only the gated feature is refused)
 *   CUS-020       a tenant downgraded from an agent plan to one without it loses agent access with the same promptness; upgrading restores it
 *   SESS-030      an idle-expired web session cannot be revived by its refresh token
 *
 * Mechanism: tenant C (the Custom tenant) has its Subscription plan switched to `enterprise-plus` and TenantFeature rows (source CUSTOM) written for desktop-agent and email-white-label; the original plan and the original
 * rows are restored in `finally`. "Prompt" is a NEWLY decided number: the entitlement cache is ~60 s today, the budget is 120 s and the measurement is recorded. If the owner sets a tighter SLA the budget changes in ONE place (PROMPT_MS).
 * Local `_test` database only (sql() refuses anything else).
 */
const run = Date.now().toString(36);
const PROMPT_MS = 120_000;
const KEYS = ['desktop-agent', 'email-white-label'] as const;
const DEVICE = { deviceFingerprint: 'qa-device-fingerprint-0007', deviceName: 'qa-device', os: 'Windows 11', platform: 'win32', agentVersion: '1.0.0' };
const agentHdr = { 'X-DijiPeople-App': 'agent-desktop', 'content-type': 'application/json' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const login = (request: APIRequestContext, email: string, d: Record<string, unknown> = DEVICE) =>
  request.post(`${env.QA_API_URL}/api/agent/auth/login`, { headers: agentHdr, data: { email, password: env.QA_PASSWORD, ...d } });
const read = (request: APIRequestContext, token: string) =>
  request.get(`${env.QA_API_URL}/api/agent/settings`, { headers: { authorization: `Bearer ${token}`, 'X-DijiPeople-App': 'agent-desktop' } });
const refresh = (request: APIRequestContext, refreshToken: string) =>
  request.post(`${env.QA_API_URL}/api/agent/auth/refresh`, { headers: agentHdr, data: { refreshToken, deviceFingerprint: DEVICE.deviceFingerprint, agentVersion: DEVICE.agentVersion } });

type Snapshot = { planId: string; features: Array<{ key: string; isEnabled: boolean; source: string }> };
const slug = () => TENANTS.C.slug;
async function snapshot(): Promise<Snapshot> {
  const planId = (await sql<{ p: string }>(`select s."planId" as p from "Subscription" s join "Tenant" t on t.id = s."tenantId" where t.slug = $1`, [slug()]))[0].p;
  const features = await sql<{ key: string; isEnabled: boolean; source: string }>(`select key, "isEnabled", source::text from "TenantFeature" where "tenantId" = (select id from "Tenant" where slug = $1) and key = any($2)`, [slug(), [...KEYS]]);
  return { planId, features };
}
async function restore(s: Snapshot) {
  await sql(`update "Subscription" set "planId" = $2 where "tenantId" = (select id from "Tenant" where slug = $1)`, [slug(), s.planId]);
  await sql(`delete from "TenantFeature" where "tenantId" = (select id from "Tenant" where slug = $1) and key = any($2)`, [slug(), [...KEYS]]);
  for (const f of s.features) await sql(`insert into "TenantFeature" (id, "tenantId", key, "isEnabled", source, "createdAt", "updatedAt") values (gen_random_uuid()::text, (select id from "Tenant" where slug = $1), $2, $3, $4::"TenantFeatureSource", now(), now())`, [slug(), f.key, f.isEnabled, f.source]);
}
/** Puts tenant C on a plan and writes explicit CUSTOM rows. `null` = no row (falls back to the plan). */
async function configure(planKey: string, grants: Partial<Record<(typeof KEYS)[number], boolean | null>>) {
  const plan = (await sql<{ id: string }>(`select id from "Plan" where key = $1`, [planKey]))[0]?.id;
  if (!plan) throw new Error(`plan ${planKey} not found`);
  await sql(`update "Subscription" set "planId" = $2 where "tenantId" = (select id from "Tenant" where slug = $1)`, [slug(), plan]);
  await sql(`delete from "TenantFeature" where "tenantId" = (select id from "Tenant" where slug = $1) and key = any($2)`, [slug(), [...KEYS]]);
  for (const k of KEYS) {
    const v = grants[k];
    if (v === null || v === undefined) continue;
    await sql(`insert into "TenantFeature" (id, "tenantId", key, "isEnabled", source, "createdAt", "updatedAt") values (gen_random_uuid()::text, (select id from "Tenant" where slug = $1), $2, $3, 'CUSTOM'::"TenantFeatureSource", now(), now())`, [slug(), k, v]);
  }
}
/** Waits (cache window) until the agent sign-in reaches the expected status. */
async function awaitAgent(request: APIRequestContext, expected: number, email = 'c-employee@qa.dijipeople.test') {
  const t0 = Date.now(); let last = 0;
  while (Date.now() - t0 < PROMPT_MS + 30_000) { last = (await login(request, email)).status(); if (last === expected) return Date.now() - t0; await sleep(5_000); }
  throw new Error(`agent sign-in never reached ${expected}; last ${last}`);
}

/** White-label is observed the only way a customer sees it: the reset e-mail footer. */
async function whiteLabelVisible(request: APIRequestContext, owner: string): Promise<boolean> {
  const footer = `WL ${run} ${Math.random().toString(36).slice(2, 6)}`;
  await api(request, owner, 'PATCH', '/tenant-settings', { updates: [{ category: 'branding', key: 'emailFooterText', value: footer }] });
  const rel = (await api(request, owner, 'GET', '/lookups/relation-types')).body;
  const email = `wl-${run}-${Math.random().toString(36).slice(2, 6)}@qa.dijipeople.test`;
  const e = await api(request, owner, 'POST', '/employees', { firstName: 'Wl', lastName: 'Probe', workEmail: email, hireDate: '2025-02-03', employmentStatus: 'ACTIVE', phone: '+97455500031', emergencyContactName: 'X Y', emergencyContactRelationTypeId: (Array.isArray(rel) ? rel : rel.items)[0].id, emergencyContactPhone: '+97455500032' });
  expect(e.status, JSON.stringify(e.body).slice(0, 200)).toBeLessThan(300);
  try {
    expect((await api(request, owner, 'POST', '/users', { firstName: 'Wl', lastName: 'Probe', email, password: `Wl!${run}Zz9a`, status: 'ACTIVE', employeeId: e.body.id })).status).toBeLessThan(300);
    await request.post(`${env.QA_API_URL}/api/auth/forgot-password`, { headers: { 'X-DijiPeople-App': 'web' }, data: { email, tenantSlug: slug() } });
    const m = await mail.waitFor(email, /reset|password/i, 60_000);
    const body = m.html + m.text;
    return body.includes(footer) && !/Powered by DijiPeople/i.test(body);
  } finally { await api(request, owner, 'DELETE', `/employees/${e.body.id}`); await api(request, owner, 'PATCH', '/tenant-settings', { updates: [{ category: 'branding', key: 'emailFooterText', value: 'Powered by DijiPeople' }] }).catch(() => undefined); }
}

test.describe('Custom subscription based on enterprise-plus (tenant C)', () => {
  test.skip(!planTenantProvisioned('C'), 'NOT RUN: Custom tenant not provisioned');
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'chromium', 'database-level suite: runs once, on the chromium project'); });
  test.describe.configure({ mode: 'serial' });
  let saved: Snapshot;
  test.beforeAll(async () => { saved = await snapshot(); });
  test.afterAll(async () => { if (saved) await restore(saved); });

  const CASES: Array<[string, Partial<Record<(typeof KEYS)[number], boolean | null>>, boolean, boolean]> = [
    ['001', { 'desktop-agent': false, 'email-white-label': false }, false, false],
    ['002', { 'desktop-agent': true, 'email-white-label': false }, true, false],
    ['003', { 'desktop-agent': false, 'email-white-label': true }, false, true],
    ['004', { 'desktop-agent': true, 'email-white-label': true }, true, true],
  ];
  for (const [id, grants, agent, whiteLabel] of CASES) {
    test(`[DPQA-CUS-${id}] enterprise-plus Custom, agent=${grants['desktop-agent']} white-label=${grants['email-white-label']}: agent ${agent ? 'allowed' : 'refused'}, white-label ${whiteLabel ? 'on' : 'off'}`, async ({ request }) => {
      test.setTimeout(420_000);
      await configure('enterprise-plus', grants);
      await awaitAgent(request, agent ? 201 : 403);
      const r = await login(request, 'c-employee@qa.dijipeople.test');
      if (!agent) expect((await r.json()).errorCode, 'refusal is the entitlement error').toBe('TENANT_FEATURE_NOT_ENTITLED');
      const owner = await apiToken(request, 'C', 'OWNER');
      expect(await whiteLabelVisible(request, owner), 'white-label footer behaviour follows the explicit grant, not the base plan').toBe(whiteLabel);
    });
  }

  test('[DPQA-CUS-005] enterprise-plus Custom with NO explicit rows: the grants are not implied by the base plan (owner decision 4)', async ({ request }) => {
    test.setTimeout(420_000);
    await configure('enterprise-plus', { 'desktop-agent': null, 'email-white-label': null });
    await sleep(65_000);
    const r = await login(request, 'c-employee@qa.dijipeople.test');
    expect(r.status(), 'agent without an explicit grant on a Custom subscription (DP-QA-042)').toBe(403);
  });

  test('[DPQA-CUS-010] withdrawing the grant cuts the issued access token, the refresh token and new sign-ins within the prompt budget', async ({ request }, info) => {
    test.setTimeout(480_000);
    await configure('enterprise-plus', { 'desktop-agent': true });
    await awaitAgent(request, 201);
    const j = await (await login(request, 'c-employee@qa.dijipeople.test')).json();
    const access = j.accessToken ?? j.tokens?.accessToken; const refreshToken = j.refreshToken ?? j.tokens?.refreshToken;
    expect(access && refreshToken, 'tokens issued').toBeTruthy();
    expect((await read(request, access)).status(), 'access token works while granted').toBe(200);
    expect((await refresh(request, refreshToken)).status(), 'refresh works while granted').toBeLessThan(300);
    const t0 = Date.now();
    await configure('enterprise-plus', { 'desktop-agent': false });
    const cut = { access: 0, refresh: 0, login: 0 };
    while (Date.now() - t0 < PROMPT_MS + 30_000 && !(cut.access && cut.refresh && cut.login)) {
      await sleep(5_000);
      if (!cut.access && (await read(request, access)).status() === 403) cut.access = Date.now() - t0;
      if (!cut.login && (await login(request, 'c-employee@qa.dijipeople.test')).status() === 403) cut.login = Date.now() - t0;
      if (!cut.refresh && [401, 403].includes((await refresh(request, refreshToken)).status())) cut.refresh = Date.now() - t0;
    }
    info.annotations.push({ type: 'measurement', description: `revocation enforced after access=${cut.access} ms, refresh=${cut.refresh} ms, sign-in=${cut.login} ms (budget ${PROMPT_MS} ms)` });
    expect(cut.access, 'issued access token cut').toBeGreaterThan(0); expect(cut.access).toBeLessThanOrEqual(PROMPT_MS);
    expect(cut.refresh, 'refresh token cut (no new access token minted after revocation)').toBeGreaterThan(0); expect(cut.refresh).toBeLessThanOrEqual(PROMPT_MS);
    expect(cut.login, 'new sign-in refused').toBeGreaterThan(0); expect(cut.login).toBeLessThanOrEqual(PROMPT_MS);
  });

  test('[DPQA-CUS-011] after the agent grant is withdrawn the same user still works on the web (only the gated feature is refused)', async ({ request }) => {
    test.setTimeout(300_000);
    await configure('enterprise-plus', { 'desktop-agent': false });
    await sleep(65_000);
    const web = await apiToken(request, 'C', 'EMPLOYEE');
    expect((await api(request, web, 'GET', '/leave-requests/mine')).status, 'ordinary web route still served').toBeLessThan(400);
    expect((await api(request, web, 'GET', '/agent/settings')).status, 'agent route refused').toBe(403);
  });

  test('[DPQA-CUS-020] downgrade from an agent plan removes agent access promptly, and an upgrade restores it', async ({ request }, info) => {
    test.setTimeout(600_000);
    await configure('enterprise', {});
    const up = await awaitAgent(request, 201);
    const token = (await (await login(request, 'c-employee@qa.dijipeople.test')).json()).accessToken;
    expect((await read(request, token)).status()).toBe(200);
    await configure('growth', {});
    const down = await awaitAgent(request, 403);
    expect((await read(request, token)).status(), 'token issued before the downgrade is refused').toBe(403);
    await configure('enterprise', {});
    const back = await awaitAgent(request, 201);
    info.annotations.push({ type: 'measurement', description: `enterprise active after ${up} ms; downgrade enforced after ${down} ms; upgrade restored after ${back} ms (budget ${PROMPT_MS} ms)` });
    expect(down).toBeLessThanOrEqual(PROMPT_MS);
  });
});

test.describe('idle-expired web session and refresh (tenant B)', () => {
  const hdr = { 'X-DijiPeople-App': 'web' };
  test('[DPQA-SESS-030] a session idle past the window cannot be revived by its refresh cookie', async ({ request }) => {
    test.setTimeout(300_000);
    const owner = await apiToken(request, 'B', 'OWNER');
    const email = `sess30-${run}@qa.dijipeople.test`; const password = `Sess!${run}Zz9a`;
    const rel = (await api(request, owner, 'GET', '/lookups/relation-types')).body;
    const e = await api(request, owner, 'POST', '/employees', { firstName: 'Sess', lastName: run, workEmail: email, hireDate: '2025-02-03', employmentStatus: 'ACTIVE', phone: '+97455500041', emergencyContactName: 'X Y', emergencyContactRelationTypeId: (Array.isArray(rel) ? rel : rel.items)[0].id, emergencyContactPhone: '+97455500042' });
    expect(e.status, JSON.stringify(e.body).slice(0, 200)).toBeLessThan(300);
    try {
      expect((await api(request, owner, 'POST', '/users', { firstName: 'Sess', lastName: run, email, password, status: 'ACTIVE', employeeId: e.body.id })).status).toBeLessThan(300);
      const l = await request.post(`${env.QA_API_URL}/api/auth/login`, { headers: hdr, data: { email, password, tenantSlug: TENANTS.B.slug } });
      expect(l.status()).toBeLessThan(300);
      await sql(`update "RefreshToken" set "lastActivityAt" = (now() at time zone 'utc') - interval '16 minutes' where "userId" = (select id from "User" where lower(email) = lower($1) limit 1) and "revokedAt" is null`, [email]);
      const r = await request.post(`${env.QA_API_URL}/api/auth/refresh`, { headers: hdr, data: {} });
      expect([401, 403], `refresh after idle expiry -> ${r.status()} ${(await r.text()).slice(0, 120)}`).toContain(r.status());
    } finally { await api(request, owner, 'DELETE', `/employees/${e.body.id}`); }
  });
});
