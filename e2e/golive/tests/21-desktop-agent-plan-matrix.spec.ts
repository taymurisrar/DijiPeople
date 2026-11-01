import { test, expect, env } from '../fixtures/test';
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

  test('[DPQA-AGT-013] agent sign-in on a non-entitled tenant: either refused, or any token it yields is refused by every authenticated agent route', async ({ request }) => {
    const login = await request.post(`${env.QA_API_URL}/api/agent/auth/login`, {
      headers: { 'X-DijiPeople-App': 'agent-desktop', 'content-type': 'application/json' },
      data: { email: env.QA_TENANT_A_OWNER, password: env.QA_PASSWORD, tenantSlug: env.QA_TENANT_A_SLUG, deviceName: 'qa-device' },
    });
    if (login.status() >= 400) { expect(login.status(), 'refused at sign-in is acceptable').toBeLessThan(500); return; }
    const j = await login.json();
    const token = j.accessToken ?? j.tokens?.accessToken;
    expect(token, 'agent login returned a token').toBeTruthy();
    for (const p of AGENT_READ) {
      const r = await request.get(`${env.QA_API_URL}/api${p}`, { headers: { authorization: `Bearer ${token}`, 'X-DijiPeople-App': 'agent-desktop' } });
      expect([402, 403], `${p} with a Starter-tenant agent token`).toContain(r.status());
    }
  });
});
