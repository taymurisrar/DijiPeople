import { test, expect, env } from '../fixtures/test';
import { sql } from '../fixtures/mail-db';
import type { APIRequestContext } from '@playwright/test';
import { api, apiToken, planTenantProvisioned } from '../fixtures/tenants';

/**
 * DPQA-AGT-*: Desktop Agent is an ENTERPRISE feature, or Custom only when explicitly enabled (owner-approved RUN-006 requirement).
 *   Starter (A) -> refused   Growth (G) -> refused   Enterprise (E) -> allowed   Custom (C, agent explicitly enabled) -> allowed
 * "Refused" means the BACKEND refuses (403 and a plan/entitlement error, not merely a hidden button) - including the mutating routes, with no device or session created.
 * Open questions for the development handoff (RUN-006-PREPARATION): Q2 does Enterprise+ include the agent; Q3 how a Custom tenant is "explicitly enabled" (override mechanism) and a Custom tenant WITHOUT it.
 * Optional tenants skip as Not Run when not provisioned. Authored before the candidate exists.
 */
const AGENT_READ = ['/agent/settings', '/agent/me', '/agent/config', '/agent/location-requests/pending'];
const MATRIX: Array<[key: 'A' | 'G' | 'E' | 'C', label: string, allowed: boolean]> = [
  ['A', 'Starter', false], ['G', 'Growth', false], ['E', 'Enterprise', true], ['C', 'Custom (agent explicitly enabled)', true],
];

for (const [key, label, allowed] of MATRIX) {
  test.describe(`desktop agent - ${label}`, () => {
    test.skip(key !== 'A' && !planTenantProvisioned(key as 'G' | 'E' | 'C'), `NOT RUN: ${label} tenant not provisioned (QA_TENANT_${key}_SLUG / _OWNER unset)`);
    let owner: string;
    test.beforeAll(async ({ request }) => { test.setTimeout(600_000); owner = await apiToken(request, key, 'OWNER'); });

    test(`[DPQA-AGT-001-${key}] ${label}: GET /agent/settings is ${allowed ? 'allowed (200)' : 'refused by the backend (403 + plan error)'}`, async ({ request }) => {
      const r = await api(request, owner, 'GET', '/agent/settings');
      if (allowed) expect(r.status, JSON.stringify(r.body).slice(0, 160)).toBe(200);
      else {
        expect(r.status, JSON.stringify(r.body).slice(0, 160)).toBe(403);
        expect(JSON.stringify(r.body), 'the refusal names the plan/entitlement').toMatch(/entitle|plan|subscription|feature/i);
      }
    });

    test(`[DPQA-AGT-002-${key}] ${label}: every authenticated agent read route is ${allowed ? 'not plan-refused' : 'refused (403)'}`, async ({ request }) => {
      for (const p of AGENT_READ) {
        const r = await api(request, owner, 'GET', p);
        if (allowed) expect(r.status, `${p} -> ${JSON.stringify(r.body).slice(0, 120)}`).not.toBe(402);
        else expect([402, 403], `${p} -> ${r.status}`).toContain(r.status);
        expect(r.status, `${p} must never be a 5xx`).toBeLessThan(500);
      }
    });

    test(`[DPQA-AGT-003-${key}] ${label}: mutating agent routes (settings, device registration, session start) ${allowed ? 'are not plan-refused' : 'are refused and persist nothing'}`, async ({ request }) => {
      const probes: Array<[string, string, unknown]> = [
        ['PATCH', '/agent/settings', {}],
        ['POST', '/agent/devices/register', { deviceId: `qa-${key}-${Date.now().toString(36)}`, platform: 'win32', appVersion: '0.0.0' }],
        ['POST', '/agent/sessions/start', {}],
      ];
      for (const [m, p, body] of probes) {
        const r = await api(request, owner, m as 'POST' | 'PATCH', p, body);
        if (allowed) expect(r.status, `${m} ${p}`).not.toBe(402);
        else expect([402, 403], `${m} ${p} -> ${JSON.stringify(r.body).slice(0, 120)}`).toContain(r.status);
        expect(r.status).toBeLessThan(500);
      }
    });
  });
}

test.describe('desktop agent - unauthorized attempts (any plan)', () => {
  test('[DPQA-AGT-010] no token, a forged token and a web token without the agent client are all refused (401/403), never served', async ({ request }) => {
    for (const p of AGENT_READ) {
      expect((await request.get(`${env.QA_API_URL}/api${p}`)).status(), `${p} anonymous`).toBe(401);
      expect((await request.get(`${env.QA_API_URL}/api${p}`, { headers: { authorization: 'Bearer abc.def.ghi' } })).status(), `${p} forged`).toBe(401);
    }
  });

  test('[DPQA-AGT-011] an employee-level user on the ENTERPRISE tenant is refused agent administration (role security independent of plan)', async ({ request }) => {
    test.skip(!planTenantProvisioned('E'), 'NOT RUN: Enterprise tenant not provisioned');
    // the Enterprise fixture is provisioned with seed-role-users (e-employee@...)
    const emp = await apiToken(request, 'E', 'EMPLOYEE');
    // RUN-006 test-side correction: GET /agent/settings is the agent client's own policy read (permission agent.settings.read, which every employee holds so the desktop agent can fetch its policy) -
    // that is existing, unchanged design. ADMINISTRATION is the write: it must be refused for an employee, on an entitled plan, independent of the plan.
    expect([401, 403], 'PATCH /agent/settings').toContain((await api(request, emp, 'PATCH', '/agent/settings', {})).status);
    const read = await api(request, emp, 'GET', '/agent/settings');
    expect(read.status, 'policy read by the agent client').toBe(200);
    expect(JSON.stringify(read.body).toLowerCase(), 'the policy carries no credentials').not.toMatch(/password|secret|token/);
  });

  test('[DPQA-AGT-012] cross-tenant: a Starter owner token is never accepted by an agent route of the Enterprise tenant, and agent data of E does not appear in A', async ({ request }) => {
    test.skip(!planTenantProvisioned('E'), 'NOT RUN: Enterprise tenant not provisioned');
    const a = await apiToken(request, 'A', 'OWNER');
    const e = await apiToken(request, 'E', 'OWNER');
    const own = JSON.stringify((await api(request, e, 'GET', '/agent/settings')).body);
    const foreign = await api(request, a, 'GET', '/agent/settings');
    expect(foreign.status).toBe(403);
    expect(JSON.stringify(foreign.body)).not.toContain(own.slice(0, 40));
  });

  // RUN-006 test-side correction: the first AGT-013 sent fields the agent login DTO forbids (tenantSlug, and without os/platform), so a 400 VALIDATION_FAILED was counted as "refused" and the
  // entitlement was never exercised. The agent signs in as an ordinary employee with the full device descriptor; the refusal must be the entitlement error, not a validation error.
  const DEVICE = { deviceFingerprint: 'qa-device-fingerprint-0001', deviceName: 'qa-device', os: 'Windows 11', platform: 'win32', agentVersion: '1.0.0' };
  const agentLogin = (request: APIRequestContext, email: string) =>
    request.post(`${env.QA_API_URL}/api/agent/auth/login`, { headers: { 'X-DijiPeople-App': 'agent-desktop', 'content-type': 'application/json' }, data: { email, password: env.QA_PASSWORD, ...DEVICE } });
  const agentRead = (request: APIRequestContext, token: string) =>
    request.get(`${env.QA_API_URL}/api/agent/settings`, { headers: { authorization: `Bearer ${token}`, 'X-DijiPeople-App': 'agent-desktop' } });

  test('[DPQA-AGT-013] agent sign-in on Starter and Growth tenants is refused by the entitlement (403 TENANT_FEATURE_NOT_ENTITLED for desktop-agent)', async ({ request }) => {
    const targets: Array<[string, string]> = [[`a-employee@qa.dijipeople.test`, 'Starter']];
    if (planTenantProvisioned('G')) targets.push([`g-employee@qa.dijipeople.test`, 'Growth']);
    for (const [email, label] of targets) {
      const r = await agentLogin(request, email);
      const b = await r.json();
      expect(r.status(), `${label} agent sign-in: ${JSON.stringify(b).slice(0, 160)}`).toBe(403);
      expect(b.errorCode, `${label}`).toBe('TENANT_FEATURE_NOT_ENTITLED');
      expect(JSON.stringify(b.details ?? {}), `${label}`).toContain('desktop-agent');
    }
  });

  test('[DPQA-AGT-014] agent sign-in on the Enterprise tenant issues tokens and the agent policy is readable', async ({ request }) => {
    test.skip(!planTenantProvisioned('E'), 'NOT RUN: Enterprise tenant not provisioned');
    const r = await agentLogin(request, 'e-employee@qa.dijipeople.test');
    expect(r.status(), await r.text()).toBeLessThan(300);
    const j = await r.json();
    const token = j.accessToken ?? j.tokens?.accessToken;
    expect(token, 'agent access token issued').toBeTruthy();
    expect((await agentRead(request, token)).status(), 'agent policy read').toBe(200);
  });

  // Entitlement withdrawal (a downgrade, or removing the explicit Custom grant). Observed behaviour: the entitlement is cached in the API process for about a minute, so the old access token and a fresh
  // sign-in keep working for up to ~60 s and are then refused. The test allows up to 120 s and records the measured delay; it fails if access is never cut.
  test('[DPQA-AGT-020] withdrawing the Custom agent entitlement cuts an already-issued agent token and any new sign-in (within the cache window)', async ({ request }, info) => {
    test.skip(!planTenantProvisioned('C'), 'NOT RUN: Custom tenant not provisioned');
    test.setTimeout(240_000);
    const set = (v: boolean) => sql(`update "TenantFeature" set "isEnabled" = $1 where key = 'desktop-agent' and "tenantId" = (select id from "Tenant" where slug = $2)`, [v, env.QA_TENANT_C_SLUG]);
    try {
      await set(true);
      let entitled = 0;
      for (let i = 0; i < 12 && entitled !== 201; i++) { if (i) await new Promise((r) => setTimeout(r, 10_000)); entitled = (await agentLogin(request, 'c-employee@qa.dijipeople.test')).status(); }
      expect(entitled, 'entitled Custom employee signs in').toBe(201);
      const j = await (await agentLogin(request, 'c-employee@qa.dijipeople.test')).json();
      const token = j.accessToken ?? j.tokens?.accessToken;
      expect((await agentRead(request, token)).status(), 'token works while entitled').toBe(200);
      const t0 = Date.now();
      await set(false);
      let cut = false;
      while (Date.now() - t0 < 120_000) {
        await new Promise((r) => setTimeout(r, 5_000));
        const read = (await agentRead(request, token)).status();
        const fresh = (await agentLogin(request, 'c-employee@qa.dijipeople.test')).status();
        if (read === 403 && fresh === 403) { cut = true; break; }
      }
      info.annotations.push({ type: 'measurement', description: `entitlement withdrawal enforced after ${Math.round((Date.now() - t0) / 1000)} s (cut=${cut})` });
      expect(cut, 'old access token AND fresh sign-in are refused after the withdrawal').toBe(true);
    } finally { await set(true); }
  });
});
