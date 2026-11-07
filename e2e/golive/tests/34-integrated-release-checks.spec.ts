import { test, expect, env } from '../fixtures/test';
import { api, apiToken, credentials, tenantUrl, TENANTS } from '../fixtures/tenants';
import { sql } from '../fixtures/mail-db';
import { papi, platformConfigured } from '../fixtures/platform';
import { spawnSync } from 'node:child_process';

/**
 * Integrated corrective release (production 2a473785 + RUN-008 remediation + DP-QA-052 + tenant-aware smoke). These are NOT RUN-008 tests: RUN-008 verified 4dd29d3a, and this
 * file independently checks what the integration added or could have broken.
 *
 *   INT-001  DP-QA-052  /api/health reports which input decided the enforcement mode (source / stored / floor) on all three health routes, and never exposes secrets
 *   INT-002  DP-QA-052  a change of module-settings.entitlementEnforcement through the platform settings API writes ONE audit row with actor, previous and new value; an unrelated or repeated write writes none
 *   INT-003  DP-QA-052  the entitlement:set-mode script audits its change with an operator identity, and the release floor keeps enforcement ON throughout (no entitlement is withdrawn by a REPORT_ONLY write)
 *   INT-004  smoke      the tenant-aware smoke journey passes against a Starter tenant, refuses a missing synthetic account when SMOKE_REQUIRE_STARTER_PROBE=1, and fails (not skips) when MFA would be required
 *   INT-005  DP-QA-050  the operator recovery after a refused Custom create-tenant: re-submitting answers alreadyExists and the control-plane retry completes provisioning
 *   INT-006  preservation: the pre-existing production capabilities still answer as before (employees, leave, documents, attendance reads for a Starter tenant owner; modules outside the plan refused)
 */
const worktree = (env as unknown as Record<string, string | undefined>).QA_API_WORKTREE ?? '';
const run = Date.now().toString(36);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

test.describe('integrated release: DP-QA-052 and the tenant-aware smoke', () => {
  test.beforeEach(({}, i) => { test.skip(i.project.name !== 'chromium', 'process- and database-level suite: runs once, on the chromium project'); test.skip(!worktree || !platformConfigured(), 'NOT RUN: QA_API_WORKTREE or the platform admin is not configured'); });
  test.describe.configure({ mode: 'serial' });

  test('[DPQA-INT-001] health reports the mode, its source, the stored setting and the floor, on /api/health, /api and /, with no secrets', async ({ request }) => {
    for (const path of ['/api/health', '/api', '/']) {
      const r = await request.get(`${env.QA_API_URL}${path}`);
      expect(r.status(), path).toBe(200);
      const b = await r.json();
      const e = b.entitlementEnforcement;
      expect(e.mode, `${path} mode`).toBe('ENFORCE');
      expect(e.enforced, `${path} enforced`).toBe(true);
      expect(['ENV', 'PLATFORM_SETTING'], `${path} source`).toContain(e.source);
      expect(e.floor, `${path} floor (the QA API runs with the release floor)`).toBe('ENFORCE');
      expect(['OFF', 'REPORT_ONLY', 'ENFORCE'], `${path} stored`).toContain(e.stored);
      expect(JSON.stringify(b), `${path}: no secrets`).not.toMatch(/secret|password|token|postgres(ql)?:\/\//i);
    }
  });

  test('[DPQA-INT-002] the platform settings write audits an enforcement change (actor, previous, new) and only a change', async ({ request }, info) => {
    test.setTimeout(180_000);
    const rows = () => sql<{ id: string; actor: string | null; before: string; after: string }>(`select id, "platformActorUserId" as actor, "beforeSnapshot"::text as before, "afterSnapshot"::text as after from "PlatformAuditLog" where action = 'ENTITLEMENT_ENFORCEMENT_CHANGED' order by "createdAt"`);
    const before = await rows();
    const current = (await sql<{ v: string | null }>(`select value->>'entitlementEnforcement' as v from "PlatformSetting" where key = 'module-settings'`))[0]?.v ?? null;
    const target = current === 'ENFORCE' ? 'REPORT_ONLY' : 'ENFORCE';
    // an unrelated module setting changes nothing in the audit
    const pageSize = await papi(request, 'PATCH', '/super-admin/platform-settings', { moduleSettings: { defaultPageSize: 25 } });
    expect(pageSize.status, JSON.stringify(pageSize.body).slice(0, 200)).toBeLessThan(300);
    expect((await rows()).length, 'an unrelated write adds no audit row').toBe(before.length);
    // the enforcement field changes: one row
    const w = await papi(request, 'PATCH', '/super-admin/platform-settings', { moduleSettings: { entitlementEnforcement: target } });
    expect(w.status, JSON.stringify(w.body).slice(0, 200)).toBeLessThan(300);
    const after = await rows();
    expect(after.length, 'one audit row for the change').toBe(before.length + 1);
    const last = after[after.length - 1];
    expect(last.actor, 'the acting platform user is recorded').toBeTruthy();
    expect(JSON.parse(last.before).entitlementEnforcement, 'previous value').toBe(current);
    expect(JSON.parse(last.after).entitlementEnforcement, 'new value').toBe(target);
    // the same value again changes nothing
    expect((await papi(request, 'PATCH', '/super-admin/platform-settings', { moduleSettings: { entitlementEnforcement: target } })).status).toBeLessThan(300);
    expect((await rows()).length, 'a repeated write adds no audit row').toBe(after.length);
    // leave the stored setting at ENFORCE, aligned with the floor (the state production should be in)
    if (target !== 'ENFORCE') expect((await papi(request, 'PATCH', '/super-admin/platform-settings', { moduleSettings: { entitlementEnforcement: 'ENFORCE' } })).status).toBeLessThan(300);
    info.annotations.push({ type: 'evidence', description: `audit rows now ${(await rows()).length}; last actor present; stored ${current} -> ${target} -> ENFORCE` });
    // the floor held enforcement ON the whole time: health says so after the cache window
    let state: { mode?: string; source?: string; stored?: string } = {};
    for (let i = 0; i < 20; i++) { state = (await (await request.get(`${env.QA_API_URL}/api/health`)).json()).entitlementEnforcement; if (state.stored === 'ENFORCE') break; await sleep(3_000); }
    expect(state.mode).toBe('ENFORCE'); expect(state.stored, 'stored setting converged to ENFORCE').toBe('ENFORCE'); expect(state.source, 'no longer held up by the floor alone').toBe('PLATFORM_SETTING');
  });

  test('[DPQA-INT-003] entitlement:set-mode audits its change with an operator identity and the floor keeps enforcement ON (no entitlement withdrawn)', async ({ request }, info) => {
    test.setTimeout(300_000);
    const db = env.QA_DATABASE_URL;
    const runMode = (mode: string) => spawnSync(`${npm} run entitlement:set-mode -- ${mode}`, { cwd: `${worktree}/services/api`, shell: true, encoding: 'utf8', timeout: 180_000, env: { ...process.env, DATABASE_URL: db, ENTITLEMENT_ENFORCEMENT_MODE: 'ENFORCE', ENTITLEMENT_CHANGED_BY: `qa-run-${run}@integration`, NODE_OPTIONS: '--max-old-space-size=4096' } as NodeJS.ProcessEnv });
    const owner = await apiToken(request, 'A', 'OWNER');
    const rows = () => sql<{ scope: string; before: string; after: string }>(`select scope::text as scope, "beforeSnapshot"::text as before, "afterSnapshot"::text as after from "PlatformAuditLog" where action = 'ENTITLEMENT_ENFORCEMENT_CHANGED' and "sourceModule" = 'entitlement:set-mode' order by "createdAt"`);
    const n0 = (await rows()).length;
    const down = runMode('REPORT_ONLY'); expect(down.status, `${down.stdout}${down.stderr}`.slice(-400)).toBe(0);
    expect(`${down.stdout}${down.stderr}`, 'the script warns that the floor keeps enforcement').toMatch(/release floor/);
    // a tenant on Starter is STILL refused a paid module while the stored setting says REPORT_ONLY (the floor wins)
    await sleep(35_000);
    const refused = (await api(request, owner, 'GET', '/job-openings')).status;
    expect([402, 403], 'enforcement was not withdrawn by the REPORT_ONLY write').toContain(refused);
    const up = runMode('ENFORCE'); expect(up.status, `${up.stdout}${up.stderr}`.slice(-400)).toBe(0);
    const rs = await rows();
    expect(rs.length, 'two audited changes').toBe(n0 + 2);
    const last2 = rs.slice(-2);
    expect(JSON.parse(last2[0].after).entitlementEnforcement).toBe('REPORT_ONLY');
    expect(JSON.parse(last2[1].before).entitlementEnforcement).toBe('REPORT_ONLY');
    expect(JSON.parse(last2[1].after).entitlementEnforcement).toBe('ENFORCE');
    expect(last2[1].scope, 'operator identity recorded').toContain(`qa-run-${run}@integration`);
    const same = runMode('ENFORCE'); expect(`${same.stdout}${same.stderr}`).toMatch(/already ENFORCE/);
    expect((await rows()).length, 'a no-op run writes no audit row').toBe(n0 + 2);
    info.annotations.push({ type: 'evidence', description: `REPORT_ONLY write -> Starter /job-openings ${refused}; two audit rows; operator scope recorded` });
  });

  test('[DPQA-INT-004] the tenant-aware smoke: passes for a Starter tenant, fails clearly without a synthetic account, and never answers MFA', async () => {
    test.setTimeout(300_000);
    // the synthetic account must be linked to an employee record: attendance and leave self-service answer 400 for a workspace owner with no employee profile
    const owner = credentials('A', 'EMPLOYEE');
    const smoke = (extra: Record<string, string>) => spawnSync(process.execPath, ['scripts/smoke-deployment.mjs'], { cwd: worktree, encoding: 'utf8', timeout: 180_000, env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', SMOKE_API_BASE_URL: `${env.QA_API_URL}/api`, SMOKE_ORIGIN: tenantUrl('A', ''), ...extra } });
    const ok = smoke({ SMOKE_STARTER_LOGIN_EMAIL: owner.email, SMOKE_STARTER_LOGIN_PASSWORD: env.QA_PASSWORD, SMOKE_STARTER_TENANT_SLUG: TENANTS.A.slug, SMOKE_REQUIRE_STARTER_PROBE: '1' });
    const out = `${ok.stdout}\n${ok.stderr}`;
    for (const re of [/^ok - plan entitlements are enforced/m, /^ok - a Starter tenant user signs in with its tenant context/m, /^ok - the Starter session is live and belongs to the expected workspace/m, /^ok - a Starter tenant reaches what its plan includes: employee access/m, /^ok - a Starter tenant reaches what its plan includes: leave/m, /^ok - a Starter tenant reaches what its plan includes: attendance/m, /^ok - a Starter tenant reaches what its plan includes: document access/m, /^ok - a Starter tenant is refused a module its plan does not include: recruitment/m, /^ok - a Starter tenant is refused a module its plan does not include: payroll/m, /^ok - signing out ends the Starter session for real/m]) expect(out, String(re)).toMatch(re);
    expect(out, 'no Starter check failed').not.toMatch(/^not ok - (a Starter|the Starter|signing out)/m);
    expect(out, 'no token or password is printed').not.toContain(env.QA_PASSWORD);
    const none = smoke({ SMOKE_REQUIRE_STARTER_PROBE: '1' });
    expect(`${none.stdout}\n${none.stderr}`, 'a missing synthetic account fails, it does not skip').toMatch(/^not ok - a dedicated synthetic Starter test account is configured/m);
    const noSlug = smoke({ SMOKE_STARTER_LOGIN_EMAIL: owner.email, SMOKE_STARTER_LOGIN_PASSWORD: env.QA_PASSWORD });
    expect(`${noSlug.stdout}\n${noSlug.stderr}`, 'a missing tenant slug is reported by name').toMatch(/Tenant context is required to sign in: set SMOKE_TENANT_SLUG/);
    const wrong = smoke({ SMOKE_STARTER_LOGIN_EMAIL: owner.email, SMOKE_STARTER_LOGIN_PASSWORD: 'definitely-wrong-password', SMOKE_STARTER_TENANT_SLUG: TENANTS.A.slug });
    expect(`${wrong.stdout}\n${wrong.stderr}`, 'a genuine sign-in failure fails the smoke').toMatch(/^not ok - a Starter tenant user signs in with its tenant context/m);
  });

  test('[DPQA-INT-005] DP-QA-050 recovery: re-submitting create-tenant answers alreadyExists and the control-plane retry completes provisioning', async ({ request }, info) => {
    test.setTimeout(300_000);
    const { createCustomPlan, deleteCustomPlan, onboardTenant, publishPrice } = await import('../fixtures/platform');
    const plan = await createCustomPlan(request, ['employees'], { label: 'int-recover', monthly: 21 });
    const slug = `qa-int-${run}`;
    try {
      const refused = await onboardTenant(request, plan, slug, `QA Int ${run}`);
      expect(refused.status, 'refused while the price is a draft').toBeGreaterThanOrEqual(400);
      expect((await publishPrice(request, plan.id, plan.priceId!)).status).toBeLessThan(300);
      const again = await onboardTenant(request, plan, slug, `QA Int ${run}`, { onboardingId: refused.onboardingId });
      info.annotations.push({ type: 'observation', description: `re-submit after publication -> ${again.status} ${JSON.stringify(again.body).slice(0, 160)}` });
      expect(again.status).toBeLessThan(300);
      const t = (await sql<{ id: string; status: string; subs: string }>(`select t.id, t.status::text as status, (select count(*)::text from "Subscription" s where s."tenantId" = t.id) as subs from "Tenant" t where t.slug = $1`, [slug]))[0];
      if (t.subs === '0') {
        const retry = await papi(request, 'POST', `/platform/tenants/${t.id}/operations/retry-provisioning`, { reason: 'QA integration check' });
        expect(retry.status, JSON.stringify(retry.body).slice(0, 240)).toBeLessThan(300);
      }
      const done = (await sql<{ subs: string; plan: string }>(`select (select count(*)::text from "Subscription" s where s."tenantId" = t.id) as subs, (select p.key from "Subscription" s join "Plan" p on p.id = s."planId" where s."tenantId" = t.id) as plan from "Tenant" t where t.slug = $1`, [slug]))[0];
      expect(done.subs, 'one subscription after recovery').toBe('1'); expect(done.plan).toBe(plan.key);
    } finally { await deleteCustomPlan(request, plan); }
  });

  test('[DPQA-INT-006] preservation: a Starter tenant owner still reaches its plan\'s capabilities and is refused the rest', async ({ request }) => {
    const owner = await apiToken(request, 'A', 'EMPLOYEE');
    for (const p of ['/employees?pageSize=1', '/leave-requests/mine', '/documents?pageSize=1', '/attendance/mine/today']) expect((await api(request, owner, 'GET', p)).status, p).toBeLessThan(400);
    for (const p of ['/job-openings', '/payroll/runs', '/timesheets/entries', '/projects', '/onboarding/templates']) expect([402, 403], p).toContain((await api(request, owner, 'GET', p)).status);
    const pub = await (await request.get(`${env.QA_API_URL}/api/public/plans`)).json();
    const keys = (Array.isArray(pub) ? pub : pub.items ?? pub.plans ?? []).map((x: { key: string }) => x.key);
    expect(keys, 'no operational Enterprise Plus: exactly the predefined plans are public').toEqual(expect.arrayContaining(['starter', 'growth', 'enterprise']));
    expect(keys.filter((k: string) => /enterprise-plus/.test(k))).toEqual([]);
  });
});
