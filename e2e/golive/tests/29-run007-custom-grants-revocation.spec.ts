import { test, expect, env } from '../fixtures/test';
import { api, apiToken, planTenantProvisioned, TENANTS } from '../fixtures/tenants';
import { mail, sql } from '../fixtures/mail-db';
import { FEATURE_PROBES, NEVER_ON_STARTER } from '../fixtures/entitlement-matrix';
import { GRANT_ONLY_FEATURES, STARTER_FEATURES, assignPlan, createCustomPlan, deleteCustomPlan, papi, platformConfigured, resolvedFeatures, restoreSubscription, subscriptionOf, updateCustomPlanFeatures, type CustomPlan, type SubscriptionSnapshot } from '../fixtures/platform';
import type { APIRequestContext } from '@playwright/test';

/**
 * RUN-007, REVISED for the owner FINAL subscription architecture (2026-11-01): exactly THREE predefined plans (starter, growth, enterprise); everything else is a dynamically
 * created CUSTOM plan that grants EXACTLY the features it lists. `enterprise-plus` is not a plan and is never used here; no TenantFeature rows are written by the tests.
 * Custom plans are created and assigned through the supported platform API only (fixtures/platform.ts). Tenant C is the Custom-plan tenant.
 *
 *   CUS-001..004  Custom plans with the agent / white-label combinations (neither, agent only, white-label only, both): both are reachable ONLY when listed
 *   CUS-005       selective Enterprise features: a Custom plan listing most Enterprise modules but NOT the two grant-only features gets neither
 *   CUS-006       FEWER features than Starter (employees only): everything else is refused, the universal import/export baseline still works for what the plan owns
 *   CUS-007       combinations across modules (employees + payroll + recruitment): exactly those modules are served, others refused
 *   CUS-010       removing the agent from the plan cuts the issued access token, the refresh token and new sign-ins within the prompt budget (decision 6)
 *   CUS-011       the same revocation leaves the user's ordinary web session working
 *   CUS-012       reassigning the tenant to another plan (Custom -> predefined -> Custom) re-resolves entitlements, in both directions, within the budget
 *   CUS-020       predefined downgrade / upgrade (enterprise -> growth -> enterprise) cuts and restores the agent
 *   CUS-030       subscription EXPIRY: an ended custom subscription does not keep granting plan-only features (or the platform refuses a past end date)
 *   CUS-031       validity dates and status persist as sent (start/end round-trip) and the lifecycle read-back matches
 *   CUS-040       tenant isolation: a plan assigned to tenant C changes nothing for tenants A and B
 *   SESS-030      an idle-expired web session cannot be revived by its refresh token
 *
 * "Promptly" is the OWNER FINAL number: explicit entitlement revocation is immediate and external propagation (a token, refresh or sign-in elsewhere) is at most 60 s, so PROMPT_MS = 60 s (it was a provisional 120 s). The delays are recorded; a delay above 60 s is a defect, not a fixture issue. Local `_test` database only.
 */
const run = Date.now().toString(36);
const PROMPT_MS = 60_000;
const DEVICE = { deviceFingerprint: 'qa-device-fingerprint-0007', deviceName: 'qa-device', os: 'Windows 11', platform: 'win32', agentVersion: '1.0.0' };
const agentHdr = { 'X-DijiPeople-App': 'agent-desktop', 'content-type': 'application/json' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const EMP = 'c-employee@qa.dijipeople.test';

const login = (request: APIRequestContext, email: string) => request.post(`${env.QA_API_URL}/api/agent/auth/login`, { headers: agentHdr, data: { email, password: env.QA_PASSWORD, ...DEVICE } });
const read = (request: APIRequestContext, token: string) => request.get(`${env.QA_API_URL}/api/agent/settings`, { headers: { authorization: `Bearer ${token}`, 'X-DijiPeople-App': 'agent-desktop' } });
const refresh = (request: APIRequestContext, refreshToken: string) =>
  request.post(`${env.QA_API_URL}/api/agent/auth/refresh`, { headers: agentHdr, data: { refreshToken, deviceFingerprint: DEVICE.deviceFingerprint, agentVersion: DEVICE.agentVersion } });
async function awaitAgent(request: APIRequestContext, expected: number, issuedToken?: string): Promise<number> {
  if (expected === 403 && issuedToken) return awaitAgentCut(request, issuedToken);
  // RUN-007 calibration: agent sign-in is limited to 20 attempts / 10 min per IP, and polling it every 5 s for a 60 s budget used most of that in one phase (429 "never reached"). The wait is therefore
  // measured on the cheap, separately limited resolved-feature read (the same snapshot the route guard uses); the agent sign-in is then CONFIRMED, polling gently, and the elapsed time covers both.
  const t0 = Date.now(); const owner = await apiToken(request, 'C', 'OWNER'); let has = expected === 201 ? false : true;
  while (Date.now() - t0 < PROMPT_MS + 30_000) { has = (await resolvedFeatures(request, owner)).enabled.includes('desktop-agent'); if (has === (expected === 201)) break; await sleep(2_000); }
  if (has !== (expected === 201)) throw new Error(`resolved features never ${expected === 201 ? 'gained' : 'lost'} desktop-agent`);
  let last = 0;
  // the confirmation is bounded by the TOTAL elapsed time (budget + 30 s), polled every 5 s, so a late cut is MEASURED (and then fails the budget assertion) instead of aborting the wait early
  // a GRANT is not a security deadline, so it is polled every 10 s (the same sign-in route allows 20 attempts / 10 min per address and the grant path lags by the snapshot TTL, ~60 s)
  while (Date.now() - t0 < PROMPT_MS + 30_000) { last = (await login(request, EMP)).status(); if (last === expected) return Date.now() - t0; await sleep(expected === 201 ? 10_000 : 5_000); }
  throw new Error(`agent sign-in never reached ${expected} within ${PROMPT_MS + 30_000} ms although the resolved features changed; last ${last}`);
}
/** Measures the cut on the guarded agent route with a token issued BEFORE the withdrawal (reads are limited far above sign-in), then confirms with a few gentle sign-ins. Returns the ms from the call. */
async function awaitAgentCut(request: APIRequestContext, issuedToken: string): Promise<number> {
  const t0 = Date.now(); let st = 0;
  while (Date.now() - t0 < PROMPT_MS + 30_000) { st = (await read(request, issuedToken)).status(); if (st === 401 || st === 403) break; await sleep(2_000); }
  if (st !== 401 && st !== 403) throw new Error(`the agent route still served the issued token (${st}) ${PROMPT_MS + 30_000} ms after the withdrawal`);
  const elapsed = Date.now() - t0;
  // ONE confirming sign-in only: a refused sign-in counts toward the account's failed-attempt lockout (429), so repeated confirmation attempts would lock the next phase out (RUN-007 observation)
  const st2 = (await login(request, EMP)).status();
  if (st2 !== 403) throw new Error(`agent sign-in answered ${st2} after the issued token was refused`);
  return elapsed;
}
/** Waits until the tenant's resolved feature set equals `expected`; returns the settle time. */
async function awaitFeatures(request: APIRequestContext, owner: string, expectedPlan: string[]): Promise<number> {
  // RUN-007 calibration (owner decision 4 / DEC-027): basic import/export is the universal baseline, so the resolved set is the plan's list PLUS data-import-export, never less.
  const expected = [...new Set([...expectedPlan, 'data-import-export'])];
  const t0 = Date.now(); let last: string[] = [];
  while (Date.now() - t0 < PROMPT_MS + 30_000) { last = (await resolvedFeatures(request, owner)).enabled; if (JSON.stringify(last) === JSON.stringify([...expected].sort())) return Date.now() - t0; await sleep(5_000); }
  throw new Error(`resolved features never equalled the plan. expected ${[...expected].sort().join(',')} got ${last.join(',')}`);
}
const probe = async (request: APIRequestContext, owner: string, feature: string) => (await api(request, owner, 'GET', FEATURE_PROBES[feature])).status;
/** Polls until a feature the plan GRANTS is served (< 402). A grant is not a security deadline; the route guard reads the cached entitlement snapshot, which lags the customer-visible feature list by up to the TTL after a subscription reassignment (measured 65-68 s, DP-QA-047). RUN-007 calibration: the first probe right after the feature list changed answered 403 once. */
async function servedWithinBudget(request: APIRequestContext, owner: string, feature: string): Promise<number> {
  const t0 = Date.now(); let last = 0;
  while (Date.now() - t0 <= PROMPT_MS + 30_000) { last = await probe(request, owner, feature); if (last < 402) return Date.now() - t0; await sleep(3_000); }
  throw new Error(`${feature} was still refused (${last}) ${PROMPT_MS + 30_000} ms after the plan started listing it`);
}
/** Polls until the route refuses (402/403) and returns the milliseconds it took; fails past the approved propagation budget (60 s). RUN-007 calibration: the route guard reads the cached entitlement snapshot, so a withheld feature is refused within the budget, not necessarily on the very next call. */
async function refusedWithinBudget(request: APIRequestContext, owner: string, feature: string): Promise<number> {
  const t0 = Date.now(); let last = 0;
  while (Date.now() - t0 <= PROMPT_MS) { last = await probe(request, owner, feature); if (last === 402 || last === 403) return Date.now() - t0; await sleep(3_000); }
  throw new Error(`${feature} was still served (${last}) ${PROMPT_MS} ms after the plan stopped listing it`);
}

/** White-label is observed the way a customer sees it: the reset e-mail footer. */
async function whiteLabelVisible(request: APIRequestContext, owner: string): Promise<boolean> {
  const footer = `WL ${run} ${Math.random().toString(36).slice(2, 6)}`;
  await api(request, owner, 'PATCH', '/tenant-settings', { updates: [{ category: 'branding', key: 'footerText', value: footer }] });
  const rel = (await api(request, owner, 'GET', '/lookups/relation-types')).body;
  const email = `wl-${run}-${Math.random().toString(36).slice(2, 6)}@qa.dijipeople.test`;
  const e = await api(request, owner, 'POST', '/employees', { firstName: 'Wl', lastName: 'Probe', workEmail: email, hireDate: '2025-02-03', employmentStatus: 'ACTIVE', phone: '+97455500031', emergencyContactName: 'X Y', emergencyContactRelationTypeId: (Array.isArray(rel) ? rel : rel.items)[0].id, emergencyContactPhone: '+97455500032' });
  expect(e.status, JSON.stringify(e.body).slice(0, 200)).toBeLessThan(300);
  try {
    expect((await api(request, owner, 'POST', '/users', { firstName: 'Wl', lastName: 'Probe', email, password: `Wl!${run}Zz9a`, status: 'ACTIVE', employeeId: e.body.id })).status).toBeLessThan(300);
    await request.post(`${env.QA_API_URL}/api/auth/forgot-password`, { headers: { 'X-DijiPeople-App': 'web' }, data: { email, tenantSlug: TENANTS.C.slug } });
    const m = await mail.waitFor(email, /reset|password/i, 60_000);
    const body = m.html + m.text;
    return body.includes(footer) && !/Powered by DijiPeople/i.test(body);
  } finally { await api(request, owner, 'DELETE', `/employees/${e.body.id}`); await api(request, owner, 'PATCH', '/tenant-settings', { updates: [{ category: 'branding', key: 'footerText', value: 'Powered by DijiPeople' }] }).catch(() => undefined); }
}

test.describe('Custom plans (tenant C) - explicit features only', () => {
  test.skip(!planTenantProvisioned('C') || !platformConfigured(), 'NOT RUN: Custom tenant (QA_TENANT_C_*) or platform admin (QA_PLATFORM_*) not configured');
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'chromium', 'API/database-level suite: runs once, on the chromium project'); });
  test.describe.configure({ mode: 'serial' });
  let saved: SubscriptionSnapshot; let owner: string; const created: CustomPlan[] = [];
  const plan = async (request: APIRequestContext, features: string[], label: string) => { const p = await createCustomPlan(request, features, { label }); created.push(p); return p; };
  const assign = async (request: APIRequestContext, p: CustomPlan, extra: Record<string, unknown> = {}) => {
    const r = await assignPlan(request, TENANTS.C.slug, p.id, extra, p.priceId);
    expect(r.status, `assign ${p.key}: ${JSON.stringify(r.body).slice(0, 300)}`).toBeLessThan(300);
  };
  test.beforeAll(async ({ request }) => { saved = await subscriptionOf(TENANTS.C.slug); owner = await apiToken(request, 'C', 'OWNER'); });
  test.afterEach(async ({ request }) => { await restoreSubscription(request, TENANTS.C.slug, saved).catch(() => undefined); });
  test.afterAll(async ({ request }) => { await restoreSubscription(request, TENANTS.C.slug, saved).catch(() => undefined); for (const p of created) await deleteCustomPlan(request, p); });

  const COMBOS: Array<[string, boolean, boolean]> = [['001', false, false], ['002', true, false], ['003', false, true], ['004', true, true]];
  for (const [id, agent, wl] of COMBOS) {
    test(`[DPQA-CUS-${id}] Custom plan = Starter features${agent ? ' + desktop-agent' : ''}${wl ? ' + email-white-label' : ''}: agent ${agent ? 'allowed' : 'refused'}, white-label ${wl ? 'on' : 'off'}, nothing else inherited`, async ({ request }) => {
      test.setTimeout(600_000);
      const features = [...STARTER_FEATURES, ...(agent ? ['desktop-agent'] : []), ...(wl ? ['email-white-label'] : [])];
      await assign(request, await plan(request, features, id));
      await awaitFeatures(request, owner, features);
      await awaitAgent(request, agent ? 201 : 403);
      if (!agent) expect((await (await login(request, EMP)).json()).errorCode, 'refusal is the entitlement error').toBe('TENANT_FEATURE_NOT_ENTITLED');
      expect(await whiteLabelVisible(request, owner), 'white-label footer follows the plan\'s explicit feature').toBe(wl);
      for (const f of NEVER_ON_STARTER.filter((k) => !features.includes(k))) expect((await resolvedFeatures(request, owner)).enabled, `Custom plan must not inherit ${f}`).not.toContain(f);
    });
  }

  test('[DPQA-CUS-005] selective Enterprise features without the two grant-only features: payroll + timesheets + projects served, agent and white-label absent', async ({ request }) => {
    test.setTimeout(600_000);
    const features = [...STARTER_FEATURES, 'payroll', 'timesheets', 'projects'];
    await assign(request, await plan(request, features, 'selective'));
    await awaitFeatures(request, owner, features);
    for (const f of ['payroll', 'timesheets', 'projects']) await servedWithinBudget(request, owner, f);
    for (const f of ['recruitment', 'onboarding']) expect(await refusedWithinBudget(request, owner, f), `${f} refused within the budget`).toBeLessThanOrEqual(PROMPT_MS);
    expect((await resolvedFeatures(request, owner)).enabled.filter((k) => (GRANT_ONLY_FEATURES as readonly string[]).includes(k)), 'grant-only features').toEqual([]);
    expect((await api(request, owner, 'GET', '/agent/settings')).status, 'agent route refused').toBe(403);
  });

  test('[DPQA-CUS-006] FEWER features than Starter (employees only): other modules refused; import/export baseline still available for the entitled module', async ({ request }) => {
    test.setTimeout(600_000);
    await assign(request, await plan(request, ['employees'], 'minimal'));
    await awaitFeatures(request, owner, ['employees']);
    expect(await probe(request, owner, 'employees'), 'employees served').toBeLessThan(402);
    // RUN-007 calibration: `documents` (like employees, organization, notifications, branding) is intentionally UNGATED at the route (ENTITLEMENT_UNGATED_FEATURE_KEYS), so a plan that omits it cannot withhold the route.
    // That is recorded as an observation (DP-QA-043); the gated, withholdable modules are asserted instead.
    for (const f of ['leave', 'projects', 'payroll']) expect(await refusedWithinBudget(request, owner, f), `${f} refused within the budget`).toBeLessThanOrEqual(PROMPT_MS);
    test.info().annotations.push({ type: 'observation', description: `documents route status on a plan that omits the documents feature: ${await probe(request, owner, 'documents')} (ungated by design)` });
    const mods = await api(request, owner, 'GET', '/data-management/modules');
    expect(mods.status, 'universal baseline: data-management is reachable without the data-import-export key (decision 8)').toBe(200);
    const tpl = await request.get(`${env.QA_API_URL}/api/data-management/modules/employees/template`, { headers: { authorization: `Bearer ${owner}`, 'X-DijiPeople-App': 'web' } });
    expect(tpl.status(), 'template for the entitled module').toBe(200);
    const exp = await api(request, owner, 'POST', '/data-management/exports', { moduleKey: 'employees', format: 'csv' });
    expect(exp.status, JSON.stringify(exp.body).slice(0, 200)).toBeLessThan(300);
    const leave = await api(request, owner, 'POST', '/data-management/exports', { moduleKey: 'leaves', format: 'csv' });
    expect([402, 403, 404], 'a module the plan does not own is not exportable').toContain(leave.status);
  });

  test('[DPQA-CUS-007] combination across modules (employees + payroll + recruitment): exactly those are served', async ({ request }) => {
    test.setTimeout(600_000);
    const features = ['employees', 'payroll', 'recruitment'];
    await assign(request, await plan(request, features, 'combo'));
    await awaitFeatures(request, owner, features);
    for (const f of features) await servedWithinBudget(request, owner, f);
    for (const f of ['projects', 'timesheets', 'onboarding', 'leave']) expect(await refusedWithinBudget(request, owner, f), `${f} refused within the budget`).toBeLessThanOrEqual(PROMPT_MS);
  });

  test('[DPQA-CUS-010] removing the agent from the plan cuts the issued access token, the refresh token and new sign-ins within the prompt budget', async ({ request }, info) => {
    test.setTimeout(900_000);
    const p = await plan(request, [...STARTER_FEATURES, 'desktop-agent'], 'revoke');
    await assign(request, p);
    await awaitAgent(request, 201);
    const j = await (await login(request, EMP)).json();
    const access = j.accessToken ?? j.tokens?.accessToken; const refreshToken = j.refreshToken ?? j.tokens?.refreshToken;
    expect(access && refreshToken, 'tokens issued').toBeTruthy();
    expect((await read(request, access)).status(), 'access token works while granted').toBe(200);
    expect((await refresh(request, refreshToken)).status(), 'refresh works while granted').toBeLessThan(300);
    const t0 = Date.now();
    expect((await updateCustomPlanFeatures(request, p, [...STARTER_FEATURES])).status, 'plan edit accepted').toBeLessThan(300);
    const cut = { access: 0, refresh: 0, login: 0 };
    while (Date.now() - t0 < PROMPT_MS + 30_000 && !(cut.access && cut.refresh && cut.login)) {
      await sleep(5_000);
      if (!cut.access && (await read(request, access)).status() === 403) cut.access = Date.now() - t0;
      if (!cut.login && (await login(request, EMP)).status() === 403) cut.login = Date.now() - t0;
      if (!cut.refresh && [401, 403].includes((await refresh(request, refreshToken)).status())) cut.refresh = Date.now() - t0;
    }
    info.annotations.push({ type: 'measurement', description: `revocation enforced after access=${cut.access} ms, refresh=${cut.refresh} ms, sign-in=${cut.login} ms (budget ${PROMPT_MS} ms)` });
    for (const [k, v] of Object.entries(cut)) { expect(v, `${k} cut`).toBeGreaterThan(0); expect(v, `${k} within budget`).toBeLessThanOrEqual(PROMPT_MS); }
  });

  test('[DPQA-CUS-011] after the agent is removed the same user still works on the web (only the gated feature is refused)', async ({ request }) => {
    test.setTimeout(400_000);
    await assign(request, await plan(request, [...STARTER_FEATURES], 'noagent'));
    await awaitFeatures(request, owner, [...STARTER_FEATURES]);
    const web = await apiToken(request, 'C', 'EMPLOYEE');
    expect((await api(request, web, 'GET', '/leave-requests/mine')).status, 'ordinary web route still served').toBeLessThan(400);
    expect((await api(request, web, 'GET', '/agent/settings')).status, 'agent route refused').toBe(403);
  });

  test('[DPQA-CUS-012] reassigning the tenant between Custom plans re-resolves entitlements in both directions', async ({ request }, info) => {
    test.setTimeout(900_000);
    const withAgent = await plan(request, [...STARTER_FEATURES, 'desktop-agent'], 'a'); const without = await plan(request, [...STARTER_FEATURES, 'payroll'], 'b');
    await assign(request, withAgent); const up = await awaitAgent(request, 201);
    const ij = await (await login(request, EMP)).json(); const issued = (ij.accessToken ?? ij.tokens?.accessToken) as string; expect(issued, 'an agent access token was issued').toBeTruthy(); // RUN-007 fixture correction: the token is under tokens.accessToken
    await assign(request, without); const down = await awaitAgent(request, 403, issued);
    expect((await resolvedFeatures(request, owner)).enabled, 'payroll arrives with the second plan').toContain('payroll');
    await assign(request, withAgent); const back = await awaitAgent(request, 201);
    info.annotations.push({ type: 'measurement', description: `agent plan active after ${up} ms; reassigned away after ${down} ms; reassigned back after ${back} ms (budget ${PROMPT_MS} ms)` });
    expect(down).toBeLessThanOrEqual(PROMPT_MS);
  });

  test('[DPQA-CUS-020] predefined plans: enterprise has the agent, growth does not, back to enterprise restores it', async ({ request }, info) => {
    test.setTimeout(900_000);
    const plans = (await papi(request, 'GET', '/super-admin/plans')).body; const list = (Array.isArray(plans) ? plans : plans.items) as Array<{ id: string; key: string }>;
    const pid = (k: string) => list.find((x) => x.key === k)?.id as string;
    expect(pid('enterprise') && pid('growth'), 'predefined plans exist').toBeTruthy();
    const mk = (k: string) => ({ id: pid(k), key: k, name: k, featureKeys: [] as string[] });
    await assign(request, mk('enterprise')); const up = await awaitAgent(request, 201);
    const tj = await (await login(request, EMP)).json(); const token = (tj.accessToken ?? tj.tokens?.accessToken) as string; expect(token, 'an agent access token was issued').toBeTruthy(); // RUN-007 fixture correction: the token is under tokens.accessToken, so the earlier `.accessToken` was undefined and this step never measured the issued token
    await assign(request, mk('growth')); const down = await awaitAgent(request, 403, token);
    expect([401, 403], 'token issued before the downgrade is refused (RUN-007 calibration: the candidate revokes the agent session on withdrawal, so the old token is 401 session-invalid rather than 403 not-entitled; both are refusals)').toContain((await read(request, token)).status());
    await assign(request, mk('enterprise')); const back = await awaitAgent(request, 201);
    info.annotations.push({ type: 'measurement', description: `enterprise ${up} ms; downgrade enforced ${down} ms; upgrade restored ${back} ms (budget ${PROMPT_MS} ms)` });
    expect(down).toBeLessThanOrEqual(PROMPT_MS);
  });

  test('[DPQA-CUS-030] an EXPIRED custom subscription does not keep granting plan-only features (or an end date in the past is refused)', async ({ request }, info) => {
    test.setTimeout(600_000);
    const p = await plan(request, [...STARTER_FEATURES, 'desktop-agent'], 'expiry');
    await assign(request, p);
    await awaitAgent(request, 201);
    const yesterday = new Date(Date.now() - 24 * 3600_000).toISOString();
    const r = await assignPlan(request, TENANTS.C.slug, p.id, { endDate: yesterday, status: 'EXPIRED' }, p.priceId);
    info.annotations.push({ type: 'observation', description: `PATCH subscription with a past endDate and status EXPIRED -> ${r.status} ${JSON.stringify(r.body).slice(0, 140)}` });
    if (r.status >= 400) return; // the platform refuses to create an already-ended subscription: acceptable, nothing is granted by it
    const settled = await awaitAgent(request, 403).catch(() => -1);
    info.annotations.push({ type: 'measurement', description: `expired subscription cut the agent after ${settled} ms` });
    expect(settled, 'an expired subscription must stop granting the plan-only desktop-agent').toBeGreaterThan(-1);
  });

  test('[DPQA-CUS-032] plan AVAILABILITY ending (deactivated / off sale) does not terminate an active subscription on it', async ({ request }, info) => {
    test.setTimeout(600_000);
    const p = await plan(request, [...STARTER_FEATURES, 'desktop-agent'], 'availability');
    await assign(request, p);
    await awaitAgent(request, 201);
    const before = await subscriptionOf(TENANTS.C.slug);
    const off = await papi(request, 'PATCH', `/super-admin/plans/${p.id}`, { isActive: false });
    info.annotations.push({ type: 'observation', description: `PATCH plan isActive=false while subscribed -> ${off.status} ${JSON.stringify(off.body).slice(0, 120)}` });
    await sleep(PROMPT_MS + 15_000); // longer than the propagation budget: a wrongly terminating cut would have landed by now
    const after = await subscriptionOf(TENANTS.C.slug);
    expect({ planId: after.planId, status: after.status, endDate: after.endDate }, 'subscription terminated or altered by the plan going off sale').toEqual({ planId: before.planId, status: before.status, endDate: before.endDate });
    expect((await login(request, EMP)).status(), 'agent entitlement still granted after the plan left sale').toBe(201);
    expect((await resolvedFeatures(request, owner)).enabled, 'resolved features unchanged').toContain('desktop-agent');
  });

  test('[DPQA-CUS-031] validity dates, status and plan identity persist as sent and read back unchanged', async ({ request }) => {
    test.setTimeout(300_000);
    const p = await plan(request, [...STARTER_FEATURES], 'dates');
    const start = new Date(Date.UTC(2030, 0, 1)).toISOString(); const end = new Date(Date.UTC(2030, 11, 31)).toISOString();
    await assign(request, p, { startDate: start, endDate: end, status: 'ACTIVE' });
    const s = await subscriptionOf(TENANTS.C.slug);
    expect(s.planId, 'assigned plan').toBe(p.id);
    expect(new Date(s.startDate.includes('Z') ? s.startDate : s.startDate.replace(' ', 'T') + 'Z').toISOString().slice(0, 10), 'start date').toBe(start.slice(0, 10));
    expect(new Date((s.endDate ?? '').includes('Z') ? s.endDate! : (s.endDate ?? '').replace(' ', 'T') + 'Z').toISOString().slice(0, 10), 'end date').toBe(end.slice(0, 10));
    const detail = (await papi(request, 'GET', `/super-admin/plans/${p.id}`)).body;
    expect(JSON.stringify(detail), 'plan detail carries identity and feature keys').toContain(p.key);
    for (const f of STARTER_FEATURES) expect(JSON.stringify(detail), `feature ${f}`).toContain(f);
  });

  test('[DPQA-CUS-040] tenant isolation: tenant C\'s Custom plan changes nothing for tenants A and B', async ({ request }) => {
    test.setTimeout(600_000);
    const a0 = (await resolvedFeatures(request, await apiToken(request, 'A', 'OWNER'))); const b0 = (await resolvedFeatures(request, await apiToken(request, 'B', 'OWNER')));
    await assign(request, await plan(request, [...STARTER_FEATURES, 'desktop-agent', 'email-white-label', 'payroll'], 'iso'));
    await awaitFeatures(request, owner, [...STARTER_FEATURES, 'desktop-agent', 'email-white-label', 'payroll']);
    expect(await resolvedFeatures(request, await apiToken(request, 'A', 'OWNER')), 'tenant A unchanged').toEqual(a0);
    expect(await resolvedFeatures(request, await apiToken(request, 'B', 'OWNER')), 'tenant B unchanged').toEqual(b0);
    expect((await api(request, await apiToken(request, 'A', 'OWNER'), 'GET', '/agent/settings')).status, 'tenant A still has no agent').toBe(403);
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
      // RUN-007 calibration: the idle window is the tenant's own security policy (default 480 minutes), not a fixed 15; the session is aged one minute past THAT window.
      const cur = (await api(request, owner, 'GET', '/tenant-settings/resolved')).body;
      const windowMin = Number(cur.settings?.security?.idleTimeoutMinutes ?? cur.security?.idleTimeoutMinutes ?? 480);
      await sql(`update "RefreshToken" set "lastActivityAt" = (now() at time zone 'utc') - ($2 || ' minutes')::interval where "userId" = (select id from "User" where lower(email) = lower($1) limit 1) and "revokedAt" is null`, [email, String(windowMin + 1)]);
      const r = await request.post(`${env.QA_API_URL}/api/auth/refresh`, { headers: hdr, data: {} });
      expect([401, 403], `refresh after idle expiry -> ${r.status()} ${(await r.text()).slice(0, 120)}`).toContain(r.status());
    } finally { await api(request, owner, 'DELETE', `/employees/${e.body.id}`); }
  });
});
