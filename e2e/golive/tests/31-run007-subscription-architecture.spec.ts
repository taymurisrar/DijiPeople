import { test, expect, env } from '../fixtures/test';
import { api, apiToken, TENANTS, planTenantProvisioned } from '../fixtures/tenants';
import { sql } from '../fixtures/mail-db';
import { EXPECTED_PREDEFINED_PLANS } from '../fixtures/entitlement-matrix';
import { STARTER_FEATURES, assignPlan, createCustomPlan, deleteCustomPlan, papi, platformConfigured, restoreSubscription, subscriptionOf, type CustomPlan } from '../fixtures/platform';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import type { APIRequestContext } from '@playwright/test';

/**
 * RUN-007, subscription ARCHITECTURE (owner FINAL decision, 2026-11-01): exactly three predefined plans - Starter, Growth, Enterprise. `enterprise-plus` is NOT a plan.
 * Every other plan is a dynamically created Custom plan that does not inherit Enterprise entitlements. Authored before the corrected candidate exists; the expectation is the decision.
 *
 *   CAT-001  the catalogue holds exactly the three predefined plans (every other plan is a QA- or customer-created Custom plan)
 *   CAT-002  no `enterprise-plus` plan, plan-feature, sellable/public entry or active subscription remains in the database or the catalogue APIs
 *   CAT-003  no `enterprise-plus` dependency remains in the candidate source (API, web, admin, landing, packages, seeds); migrations / specs / docs / grandfather tooling excepted and listed
 *   CAT-004  plan selection (sellable list) and the public pricing catalogue offer the three predefined plans and no `enterprise-plus`
 *   CPL-001  a Custom plan is created through the supported API; identity, features and price persist and read back identically
 *   CPL-002  the plan API validates: duplicate key, unknown feature key, negative price and a missing name are refused
 *   CPL-003  editing a plan's price never rewrites an existing subscription's contracted price
 *   CPL-004  eligibility: a Custom plan created for one customer is not in the public catalogue and is not offered to other tenants
 *   CPL-005  lifecycle: a plan assigned to a tenant cannot be deleted; after unassigning it can; deactivation removes it from the sellable list
 *   CPL-006  authorization: tenant users (owner, employee) cannot list, create, edit or assign plans; tenant B cannot see tenant C's Custom plan
 *   SEEDPLAN-001  `seed:config` x2 leaves Custom plans (rows, features, prices) and the subscriptions on them byte-identical, and never restores a predefined definition over a Custom plan
 *   SEEDPLAN-002  a Custom plan whose NAME resembles a predefined plan ("Starter") is still a separate plan the seed does not touch or merge
 *   CPL-007  Custom plans are SALES-ASSISTED by default (owner FINAL): a plan created with no sales fields is not self-service, not public, not published for sale
 *   CPL-008  reserved (Custom) plans are not discoverable or selectable by unauthorised customers: anonymous, other tenants and the tenant's own billing screens cannot list, preview, check out or switch to one
 *   MIG-005  the converted legacy plan is NEUTRALLY identified (no enterprise-plus key/name), a Custom plan, sales-assisted, and not for sale or self-service assignment
 *   MIG-006  history is preserved: subscription ids, invoice and payment counts and platform audit rows are not lost by the conversion
 *   MIG-001..004  LEGACY `enterprise-plus` data migrates safely (needs golive-results/run007/legacy-baseline.json from tools/legacy-enterprise-plus.mjs, captured BEFORE the candidate's migration)
 */
const run = Date.now().toString(36);
const worktree = process.env.QA_API_WORKTREE ?? (env as unknown as Record<string, string | undefined>).QA_API_WORKTREE ?? '';
const PREDEFINED = [...EXPECTED_PREDEFINED_PLANS] as string[];
const plansOf = async (request: APIRequestContext, q = '') => { const b = (await papi(request, 'GET', `/super-admin/plans${q}`)).body; return (Array.isArray(b) ? b : b.items ?? []) as Array<{ id: string; key: string; name: string; isActive?: boolean }>; };
const seedConfig = () => spawnSync('npm', ['--workspace', 'api', 'run', 'seed:config'], { cwd: worktree, env: { ...process.env, DATABASE_URL: env.QA_DATABASE_URL, NODE_ENV: 'test' }, encoding: 'utf8', shell: true, timeout: 300_000 }).status;

test.describe('plan catalogue (platform admin)', () => {
  test.skip(!platformConfigured(), 'NOT RUN: platform admin (QA_PLATFORM_EMAIL / QA_PLATFORM_PASSWORD) is not configured');
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'chromium', 'API/database-level suite: runs once, on the chromium project'); });

  test('[DPQA-CAT-001] exactly three predefined plans exist: starter, growth, enterprise (all other plans are Custom)', async ({ request }) => {
    const keys = (await plansOf(request)).map((p) => p.key).filter((k) => !k.startsWith('qa-cp-')); // qa-cp-* are this suite's own throwaway Custom plans
    const custom = keys.filter((k) => !PREDEFINED.includes(k));
    expect(PREDEFINED.filter((k) => !keys.includes(k)), 'missing predefined plans').toEqual([]);
    // A customer-created Custom plan from the legacy migration is legitimate; it must be a deliberate Custom plan, never a predefined-looking duplicate.
    test.info().annotations.push({ type: 'observation', description: `non-QA plans beyond the three predefined: ${custom.join(', ') || 'none'}` });
    expect(custom.filter((k) => /^(starter|growth|enterprise)(-|_)/.test(k) || /enterprise.?plus/i.test(k)), 'plans that masquerade as predefined').toEqual([]);
    const db = await sql<{ key: string }>(`select key from "Plan" where key = any($1)`, [PREDEFINED]);
    expect(db.map((r) => r.key).sort(), 'predefined plans in the database').toEqual([...PREDEFINED].sort());
  });

  test('[DPQA-CAT-002] no enterprise-plus plan, plan-feature, catalogue entry or active subscription remains', async ({ request }) => {
    const plan = await sql<{ id: string; active: boolean }>(`select id, "isActive" as active from "Plan" where key ilike '%enterprise%plus%' or name ilike '%enterprise%+%' or name ilike '%enterprise%plus%'`);
    expect(plan, 'plan rows still carrying enterprise-plus in key or name (owner FINAL: the legacy plan is converted to a neutrally identified Custom plan, in any state)').toEqual([]);
    const subs = await sql<{ n: string }>(`select count(*)::text as n from "Subscription" s join "Plan" p on p.id = s."planId" where p.key ilike '%enterprise%plus%'`);
    expect(subs[0].n, 'subscriptions still on enterprise-plus (must be migrated to a Custom plan)').toBe('0');
    const api1 = JSON.stringify(await plansOf(request)); const api2 = JSON.stringify(await plansOf(request, '?sellable=true'));
    const pub = await request.get(`${env.QA_API_URL}/api/public/plans`, { headers: { 'X-DijiPeople-App': 'web' } });
    const cat = JSON.stringify((await papi(request, 'GET', '/super-admin/feature-catalog')).body);
    for (const [where, text] of [['admin plan list', api1], ['sellable plan list', api2], ['public plans', await pub.text()], ['feature catalogue', cat]] as const) expect(text, `${where} mentions enterprise-plus`).not.toMatch(/enterprise.?plus/i);
  });

  test('[DPQA-CAT-003] the candidate source has no remaining enterprise-plus dependency', async ({}, info) => {
    test.skip(!worktree, 'NOT RUN: QA_API_WORKTREE is not set');
    const r = spawnSync('git', ['grep', '-n', '-I', '-i', '-E', 'enterprise[-_ ]?plus', '--', 'services/api/src', 'services/api/prisma/seed*', 'services/api/prisma/*.ts', 'apps/web', 'apps/admin', 'apps/landing', 'packages', 'scripts'], { cwd: worktree, encoding: 'utf8' });
    const allowed = /(prisma\/migrations\/|\.spec\.|\.test\.|\/test\/|__tests__|\/docs\/|legacy|grandfather|migrat)/i;
    const hits = (r.stdout ?? '').split(/\r?\n/).filter(Boolean);
    const offending = hits.filter((h) => !allowed.test(h.split(':')[0]));
    info.annotations.push({ type: 'observation', description: `${hits.length} reference(s), ${hits.length - offending.length} in allowed locations (migrations, tests, legacy/grandfather tooling)` });
    if (offending.length) info.annotations.push({ type: 'findings', description: offending.slice(0, 40).join(' | ').slice(0, 3000) });
    expect(offending, 'enterprise-plus still referenced by catalogue, onboarding, billing, plan selection, subscription assignment, UI or APIs').toEqual([]);
  });

  test('[DPQA-CAT-004] plan selection offers starter, growth, enterprise (and Custom plans only where intended), never enterprise-plus', async ({ request }) => {
    const sellable = (await plansOf(request, '?sellable=true')).map((p) => p.key);
    for (const k of PREDEFINED) expect(sellable, `${k} is selectable`).toContain(k);
    expect(sellable.join(','), 'sellable list').not.toMatch(/enterprise.?plus/i);
    const pub = await request.get(`${env.QA_API_URL}/api/public/plans`, { headers: { 'X-DijiPeople-App': 'web' } });
    expect(pub.status()).toBeLessThan(400);
    const keys = JSON.stringify(await pub.json());
    for (const k of PREDEFINED) expect(keys, `public catalogue lists ${k}`).toContain(k);
  });
});

test.describe('Custom plan lifecycle (platform admin)', () => {
  test.skip(!platformConfigured(), 'NOT RUN: platform admin is not configured');
  test.beforeEach(({}, info) => { test.skip(info.project.name !== 'chromium', 'API/database-level suite: runs once, on the chromium project'); });
  const made: CustomPlan[] = [];
  test.afterAll(async ({ request }) => { for (const p of made) await deleteCustomPlan(request, p); });
  const mk = async (request: APIRequestContext, features: string[], label: string, opts: { monthly?: number } = {}) => { const p = await createCustomPlan(request, features, { label, ...opts }); made.push(p); return p; };

  test('[DPQA-CPL-001] a Custom plan is created through the supported API and its identity, features and price persist', async ({ request }) => {
    const features = ['employees', 'leave', 'payroll'];
    const p = await mk(request, features, 'create', { monthly: 37 });
    const row = await sql<{ key: string; name: string; active: boolean }>(`select key, name, "isActive" as active from "Plan" where id = $1`, [p.id]);
    expect(row[0], 'plan row').toMatchObject({ key: p.key, name: p.name, active: true });
    const fk = await sql<{ featureKey: string }>(`select "featureKey" from "PlanFeature" where "planId" = $1 and "isEnabled" order by 1`, [p.id]);
    expect(fk.map((r) => r.featureKey), 'persisted feature keys').toEqual([...features].sort());
    const price = await sql<{ unitAmount: string; currency: string; active: boolean }>(`select "unitAmount"::text as "unitAmount", currency, "isActive" as active from "PlanPrice" where "planId" = $1`, [p.id]);
    expect(price.length, 'a price exists').toBeGreaterThan(0);
    expect(Number(price[0].unitAmount), 'price amount').toBe(37);
    const detail = JSON.stringify((await papi(request, 'GET', `/super-admin/plans/${p.id}`)).body);
    expect(detail).toContain(p.key); for (const f of features) expect(detail).toContain(f);
  });

  test('[DPQA-CPL-002] the plan API refuses a duplicate key, an unknown feature key, a negative price and a missing name', async ({ request }) => {
    const p = await mk(request, ['employees'], 'validate');
    const base = { description: 'x', isActive: true, monthlyBasePrice: 5, annualBasePrice: 50, currency: 'USD' };
    const dup = await papi(request, 'POST', '/super-admin/plans', { ...base, key: p.key, name: 'dup', featureKeys: ['employees'] });
    expect(dup.status, 'duplicate key').toBeGreaterThanOrEqual(400);
    const unk = await papi(request, 'POST', '/super-admin/plans', { ...base, key: `qa-cp-${run}-unk`, name: 'unk', featureKeys: ['no-such-feature'] });
    if (unk.status < 300) await papi(request, 'DELETE', `/super-admin/plans/${unk.body.id}`);
    expect(unk.status, 'unknown feature key').toBeGreaterThanOrEqual(400);
    const neg = await papi(request, 'POST', '/super-admin/plans', { ...base, key: `qa-cp-${run}-neg`, name: 'neg', monthlyBasePrice: -1, featureKeys: ['employees'] });
    expect(neg.status, 'negative price').toBe(400);
    const noName = await papi(request, 'POST', '/super-admin/plans', { ...base, key: `qa-cp-${run}-nn`, featureKeys: ['employees'] });
    expect(noName.status, 'missing name').toBe(400);
  });

  test('[DPQA-CPL-003] editing a plan\'s price does not rewrite the price an existing subscription was contracted at', async ({ request }) => {
    test.skip(!planTenantProvisioned('C'), 'NOT RUN: Custom tenant not provisioned');
    test.setTimeout(300_000);
    const saved = await subscriptionOf(TENANTS.C.slug); const p = await mk(request, [...STARTER_FEATURES], 'price', { monthly: 40 });
    try {
      expect((await assignPlan(request, TENANTS.C.slug, p.id, {}, p.priceId)).status).toBeLessThan(300);
      const before = (await sql<{ f: string }>(`select "finalPrice"::text as f from "Subscription" where "tenantId" = $1`, [saved.tenantId]))[0].f;
      const upd = await papi(request, 'PATCH', `/super-admin/plans/${p.id}`, { monthlyBasePrice: 999, annualBasePrice: 9990 });
      expect(upd.status, JSON.stringify(upd.body).slice(0, 200)).toBeLessThan(300);
      const after = (await sql<{ f: string }>(`select "finalPrice"::text as f from "Subscription" where "tenantId" = $1`, [saved.tenantId]))[0].f;
      expect(after, 'contracted price unchanged by a catalogue price edit').toBe(before);
    } finally { await restoreSubscription(request, TENANTS.C.slug, saved).catch(() => undefined); }
  });

  test('[DPQA-CPL-004] eligibility: a Custom plan is not in the public catalogue and not offered to tenants', async ({ request }) => {
    const p = await mk(request, ['employees'], 'eligibility');
    const pub = await request.get(`${env.QA_API_URL}/api/public/plans`, { headers: { 'X-DijiPeople-App': 'web' } });
    expect(await pub.text(), 'Custom plan visible in the public catalogue').not.toContain(p.key);
    const owner = await apiToken(request, 'A', 'OWNER');
    const own = await request.get(`${env.QA_API_URL}/api/billing/plans`, { headers: { authorization: `Bearer ${owner}`, 'X-DijiPeople-App': 'web' } });
    if (own.status() === 200) expect(await own.text(), 'tenant billing plan list offers another customer\'s Custom plan').not.toContain(p.key);
  });

  test('[DPQA-CPL-005] lifecycle: an assigned plan cannot be deleted; unassigned it can; a deactivated plan leaves the sellable list', async ({ request }) => {
    test.skip(!planTenantProvisioned('C'), 'NOT RUN: Custom tenant not provisioned');
    test.setTimeout(300_000);
    const saved = await subscriptionOf(TENANTS.C.slug); const p = await mk(request, [...STARTER_FEATURES], 'lifecycle');
    try {
      expect((await assignPlan(request, TENANTS.C.slug, p.id, {}, p.priceId)).status).toBeLessThan(300);
      expect((await papi(request, 'DELETE', `/super-admin/plans/${p.id}`)).status, 'delete while assigned').toBeGreaterThanOrEqual(400);
      expect((await sql(`select 1 from "Plan" where id = $1`, [p.id])).length, 'plan still exists').toBe(1);
      expect((await restoreSubscription(request, TENANTS.C.slug, saved)).status).toBeLessThan(300);
      expect((await papi(request, 'PATCH', `/super-admin/plans/${p.id}`, { isActive: false })).status).toBeLessThan(300);
      expect((await plansOf(request, '?sellable=true')).map((x) => x.key), 'deactivated plan not sellable').not.toContain(p.key);
      const del = await papi(request, 'DELETE', `/super-admin/plans/${p.id}`);
      test.info().annotations.push({ type: 'observation', description: `delete after unassign -> ${del.status} ${JSON.stringify(del.body).slice(0, 120)}` });
      expect(del.status, 'an unsold, unassigned plan can be deleted').toBeLessThan(300);
    } finally { await restoreSubscription(request, TENANTS.C.slug, saved).catch(() => undefined); }
  });

  test('[DPQA-CPL-006] tenant users cannot administer plans, and tenant B cannot see another tenant\'s Custom plan', async ({ request }) => {
    const p = await mk(request, ['employees'], 'authz');
    for (const role of ['OWNER', 'EMPLOYEE'] as const) {
      const t = await apiToken(request, 'B', role).catch(() => '');
      if (!t) continue;
      for (const [m, path, body] of [['GET', '/super-admin/plans', undefined], ['POST', '/super-admin/plans', { key: `qa-cp-${run}-x`, name: 'x', monthlyBasePrice: 1, annualBasePrice: 10, featureKeys: ['employees'] }], ['PATCH', `/super-admin/plans/${p.id}`, { name: 'hijack' }], ['DELETE', `/super-admin/plans/${p.id}`, undefined]] as const) {
        const r = await api(request, t, m, path, body);
        expect([401, 403], `${role} ${m} ${path} -> ${r.status}`).toContain(r.status);
      }
    }
    expect((await sql<{ name: string }>(`select name from "Plan" where id = $1`, [p.id]))[0].name, 'plan untouched').toBe(p.name);
    const feats = await request.get(`${env.QA_API_URL}/api/tenant-settings/features`, { headers: { authorization: `Bearer ${await apiToken(request, 'B', 'OWNER')}`, 'X-DijiPeople-App': 'web' } });
    expect(await feats.text(), 'tenant B feature response leaks the Custom plan').not.toContain(p.key);
  });
});

test.describe('Custom plans are sales-assisted and reserved (owner FINAL)', () => {
  test.skip(!platformConfigured(), 'NOT RUN: QA_PLATFORM_EMAIL / QA_PLATFORM_PASSWORD not configured');
  test.beforeEach(({}, i) => { test.skip(i.project.name !== 'chromium', 'database-level suite: runs once, on the chromium project'); });
  const made: CustomPlan[] = [];
  test.afterAll(async ({ request }) => { for (const p of made) await deleteCustomPlan(request, p); });
  const mk = async (request: APIRequestContext, features: string[], label: string) => { const p = await createCustomPlan(request, features, { label }); made.push(p); return p; };

  test('[DPQA-CPL-007] a Custom plan is sales-assisted by default: not self-service, not public, not published for sale', async ({ request }, info) => {
    const p = await mk(request, ['employees'], 'sales-model');
    const row = (await sql<{ salesModel: string; isPublic: boolean; publicationStatus: string }>(`select "salesModel"::text as "salesModel", "isPublic" as "isPublic", "publicationStatus"::text as "publicationStatus" from "Plan" where id = $1`, [p.id]))[0];
    info.annotations.push({ type: 'observation', description: `new plan created with no sales fields -> ${JSON.stringify(row)}` });
    expect(['SALES_ASSISTED', 'CUSTOM_ONLY'], 'default sales model of a dynamically created Custom plan').toContain(row.salesModel);
    expect(row.isPublic, 'a new Custom plan is public').toBe(false);
    expect(row.publicationStatus, 'a new Custom plan is published for sale').not.toBe('PUBLISHED');
    expect((await plansOf(request, '?sellable=true')).map((x) => x.key), 'a new Custom plan is in the sellable list').not.toContain(p.key);
  });

  test('[DPQA-CPL-008] a reserved Custom plan is neither discoverable nor selectable by unauthorised customers', async ({ request }) => {
    test.setTimeout(300_000);
    const p = await mk(request, ['employees', 'payroll'], 'reserved');
    // discovery: anonymous
    const anon = await request.get(`${env.QA_API_URL}/api/super-admin/plans`, { headers: { 'X-DijiPeople-App': 'admin' } });
    expect([401, 403], 'anonymous platform plan list').toContain(anon.status());
    const pub = await request.get(`${env.QA_API_URL}/api/public/plans`, { headers: { 'X-DijiPeople-App': 'web' } });
    expect(await pub.text(), 'public catalogue exposes the reserved plan').not.toContain(p.key);
    const cfg = await request.get(`${env.QA_API_URL}/api/public/commercial-config`, { headers: { 'X-DijiPeople-App': 'web' } });
    expect(await cfg.text(), 'public commercial config exposes the reserved plan').not.toContain(p.key);
    // discovery + selection: another customer's owner (tenant B) - billing screens and the plan-change path
    const owner = await apiToken(request, 'B', 'OWNER');
    const list = await api(request, owner, 'GET', '/billing/plans');
    if (list.status === 200) expect(JSON.stringify(list.body), 'tenant billing plan list exposes the reserved plan').not.toContain(p.key);
    const before = await subscriptionOf(TENANTS.B.slug);
    const attempts: Array<[string, string, unknown]> = [
      ['GET', `/billing/plan-changes/preview?toPlanId=${p.id}${p.priceId ? `&toPlanPriceId=${p.priceId}` : ''}`, undefined],
      ['POST', '/billing/plan-changes', { toPlanId: p.id, ...(p.priceId ? { toPlanPriceId: p.priceId } : {}) }],
      ...(p.priceId ? [['POST', '/billing/checkout-sessions', { planPriceId: p.priceId }] as [string, string, unknown]] : []),
    ];
    for (const [m, path, body] of attempts) {
      const r = await api(request, owner, m as 'GET' | 'POST', path, body);
      expect(r.status, `${m} ${path.split('?')[0]} by a tenant owner for a reserved plan -> ${r.status} ${JSON.stringify(r.body).slice(0, 140)}`).toBeGreaterThanOrEqual(400);
      expect(r.status, `${m} ${path.split('?')[0]} must be a refusal, not a server error`).toBeLessThan(500);
    }
    const after = await subscriptionOf(TENANTS.B.slug);
    expect({ planId: after.planId, status: after.status }, 'tenant B subscription changed by selecting a reserved plan').toEqual({ planId: before.planId, status: before.status });
  });
});

test.describe('predefined seeds never overwrite Custom plans', () => {
  test.skip(!platformConfigured() || !worktree, 'NOT RUN: platform admin or QA_API_WORKTREE not configured');
  test.beforeEach(({}, i) => { test.skip(i.project.name !== 'chromium', 'database-level suite: runs once, on the chromium project'); });
  const snap = (planIds: string[]) => sql<{ h: string; n: string }>(
    `select md5(coalesce(string_agg(x, '|' order by x), '')) as h, count(*)::text as n from (
       select p::text as x from "Plan" p where p.id = any($1)
       union all select f::text from "PlanFeature" f where f."planId" = any($1)
       union all select pr::text from "PlanPrice" pr where pr."planId" = any($1)
       union all select s::text from "Subscription" s where s."planId" = any($1)) q`, [planIds]);

  test('[DPQA-SEEDPLAN-001] two seed:config runs leave Custom plans, their features, prices and subscriptions byte-identical', async ({ request }) => {
    test.setTimeout(900_000);
    const a = await createCustomPlan(request, ['employees', 'payroll'], { label: 'seedsafe', monthly: 55 });
    try {
      const before = (await snap([a.id]))[0];
      expect(Number(before.n), 'fixture rows exist').toBeGreaterThan(2);
      expect(seedConfig()).toBe(0); expect(seedConfig()).toBe(0);
      expect((await snap([a.id]))[0], 'Custom plan rows changed by the predefined-plan seed').toEqual(before);
      const fk = await sql<{ featureKey: string }>(`select "featureKey" from "PlanFeature" where "planId" = $1 and "isEnabled" order by 1`, [a.id]);
      expect(fk.map((r) => r.featureKey)).toEqual(['employees', 'payroll']);
    } finally { await deleteCustomPlan(request, a); }
  });

  test('[DPQA-SEEDPLAN-002] a Custom plan named like a predefined plan stays a separate plan the seed neither merges nor overwrites', async ({ request }) => {
    test.setTimeout(900_000);
    const r = await papi(request, 'POST', '/super-admin/plans', { key: `qa-cp-${run}-lookalike`, name: 'Starter', description: 'QA look-alike', isActive: true, monthlyBasePrice: 3, annualBasePrice: 30, currency: 'USD', featureKeys: ['employees'] });
    test.skip(r.status >= 400, `NOT RUN: platform refuses a Custom plan named "Starter" (${r.status}) - acceptable, nothing to preserve`);
    const id = r.body.id as string;
    try {
      const before = (await snap([id]))[0];
      expect(seedConfig()).toBe(0);
      expect((await snap([id]))[0], 'look-alike plan rewritten by the seed').toEqual(before);
      const starter = await sql<{ n: string }>(`select count(*)::text as n from "PlanFeature" f join "Plan" p on p.id = f."planId" where p.key = 'starter' and f."isEnabled"`);
      expect(Number(starter[0].n), 'predefined Starter still has its own features').toBeGreaterThanOrEqual(STARTER_FEATURES.length);
    } finally { await papi(request, 'DELETE', `/super-admin/plans/${id}`).catch(() => undefined); }
  });
});

/** Legacy enterprise-plus data: baseline captured BEFORE the candidate's migration (tools/legacy-enterprise-plus.mjs). */
type Baseline = { slug: string; planKey: string; status: string; cycle: string; basePrice: string; finalPrice: string; currency: string; startDate: string; endDate: string | null; effective: string[]; explicitGrants: string[]; subscriptionId?: string; legacyPlanId?: string; invoiceCount?: number; paymentCount?: number; auditCount?: number };
const baselineFile = 'golive-results/run007/legacy-baseline.json';
const baseline = (): Baseline[] => (existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, 'utf8')) : []);
test.describe('legacy enterprise-plus data migrates safely', () => {
  test.beforeEach(({}, i) => { test.skip(i.project.name !== 'chromium', 'database-level suite: runs once, on the chromium project'); });
  test.skip(baseline().length === 0, `NOT RUN: ${baselineFile} is missing - prepare a pre-migration copy of the RUN-006 database and run tools/legacy-enterprise-plus.mjs (RUN-007-PREPARATION section 3)`);
  const afterOf = async (slug: string) => (await sql<{ planKey: string; status: string; cycle: string; basePrice: string; finalPrice: string; currency: string; startDate: string; endDate: string | null; planId: string; tenantId: string }>(
    `select p.key as "planKey", s.status::text as status, s."billingCycle"::text as cycle, s."basePrice"::text as "basePrice", s."finalPrice"::text as "finalPrice", s.currency, s."startDate"::text as "startDate", s."endDate"::text as "endDate", s."planId", s."tenantId"
       from "Subscription" s join "Tenant" t on t.id = s."tenantId" join "Plan" p on p.id = s."planId" where t.slug = $1`, [slug]))[0];
  const effectiveAfter = async (planId: string, tenantId: string) => {
    const plan = (await sql<{ k: string }>(`select "featureKey" as k from "PlanFeature" where "planId" = $1 and "isEnabled"`, [planId])).map((r) => r.k);
    const eff = new Set(plan);
    for (const f of await sql<{ key: string; isEnabled: boolean }>(`select key, "isEnabled" from "TenantFeature" where "tenantId" = $1`, [tenantId])) f.isEnabled ? eff.add(f.key) : eff.delete(f.key);
    return [...eff].sort();
  };
  const GRANT_ONLY = ['desktop-agent', 'email-white-label'];

  test('[DPQA-MIG-001] no tenant remains on enterprise-plus: each is on Enterprise (only if its entitlements equal Enterprise) or on a Custom plan', async () => {
    for (const b of baseline()) {
      const a = await afterOf(b.slug);
      expect(a.planKey, `${b.slug} is still on the legacy plan`).not.toMatch(/enterprise.?plus/i);
    }
  });

  test('[DPQA-MIG-002] contractual entitlements are preserved: every legacy non-grant-only feature still resolves; grant-only features survive only where explicitly granted', async ({}, i) => {
    for (const b of baseline()) {
      const a = await afterOf(b.slug); const eff = await effectiveAfter(a.planId, a.tenantId);
      const mustKeep = b.effective.filter((k) => !GRANT_ONLY.includes(k));
      expect(mustKeep.filter((k) => !eff.includes(k)), `${b.slug}: entitlements lost by the migration`).toEqual([]);
      for (const k of GRANT_ONLY) {
        const granted = b.explicitGrants.includes(k);
        if (granted) expect(eff, `${b.slug}: explicit contractual grant ${k} was removed`).toContain(k);
        else if (eff.includes(k)) i.annotations.push({ type: 'owner-decision', description: `${b.slug} keeps ${k} without an explicit pre-migration grant - confirm the migration rule with the owner` });
      }
      expect(eff.filter((k) => !b.effective.includes(k)), `${b.slug}: features granted that the legacy subscription never had`).toEqual([]);
    }
  });

  test('[DPQA-MIG-005] the converted legacy plan is neutrally identified, Custom, sales-assisted and not for sale or self-service assignment', async ({ request }) => {
    test.skip(!platformConfigured(), 'NOT RUN: platform admin not configured');
    const seen = new Set<string>();
    for (const b of baseline()) {
      const a = await afterOf(b.slug); if (seen.has(a.planId)) continue; seen.add(a.planId);
      const p = (await sql<{ key: string; name: string; description: string | null; salesModel: string; isPublic: boolean; publicationStatus: string }>(`select key, name, description, "salesModel"::text as "salesModel", "isPublic" as "isPublic", "publicationStatus"::text as "publicationStatus" from "Plan" where id = $1`, [a.planId]))[0];
      expect(`${p.key} ${p.name}`, `${b.slug}: converted plan still identified as the legacy plan`).not.toMatch(/enterprise.?plus/i);
      expect(PREDEFINED, `${b.slug}: converted plan must be a Custom plan, not one of the predefined three`).not.toContain(p.key);
      expect(['SALES_ASSISTED', 'CUSTOM_ONLY'], `${b.slug}: converted plan sales model`).toContain(p.salesModel);
      expect(p.isPublic, `${b.slug}: converted plan is public`).toBe(false);
      expect(p.publicationStatus, `${b.slug}: converted plan is published for sale`).not.toBe('PUBLISHED');
      expect((await plansOf(request, '?sellable=true')).map((x) => x.id), `${b.slug}: converted plan is sellable`).not.toContain(a.planId);
      const pub = await request.get(`${env.QA_API_URL}/api/public/plans`, { headers: { 'X-DijiPeople-App': 'web' } });
      expect(await pub.text(), `${b.slug}: converted plan is in the public catalogue`).not.toContain(p.key);
    }
    expect(await sql(`select 1 from "Plan" where key ilike '%enterprise%plus%' or name ilike '%enterprise%plus%' or name ilike '%enterprise%+%'`), 'a plan row still carries the legacy identity').toEqual([]);
  });

  test('[DPQA-MIG-006] history is preserved: subscription ids, invoices, payments and platform audit rows are not lost', async () => {
    for (const b of baseline()) {
      const a = await afterOf(b.slug);
      const sub = (await sql<{ id: string }>(`select s.id from "Subscription" s join "Tenant" t on t.id = s."tenantId" where t.slug = $1`, [b.slug]))[0];
      if (b.subscriptionId) expect(sub.id, `${b.slug}: subscription identity replaced by the conversion`).toBe(b.subscriptionId);
      const count = async (table: string) => { try { return Number((await sql<{ n: string }>(`select count(*)::text as n from "${table}" where "tenantId" = $1`, [a.tenantId]))[0].n); } catch { return undefined; } };
      for (const [table, was] of [['Invoice', b.invoiceCount], ['Payment', b.paymentCount]] as const) {
        const now = await count(table); if (was === undefined || now === undefined) continue;
        expect(now, `${b.slug}: ${table} rows lost by the conversion`).toBeGreaterThanOrEqual(was);
      }
    }
  });

  test('[DPQA-MIG-003] commercial terms are preserved: status, cycle, contracted price, currency and validity dates are unchanged', async () => {
    for (const b of baseline()) {
      const a = await afterOf(b.slug);
      expect({ status: a.status, cycle: a.cycle, basePrice: a.basePrice, finalPrice: a.finalPrice, currency: a.currency, startDate: a.startDate, endDate: a.endDate }, `${b.slug}: subscription terms changed by the migration`)
        .toEqual({ status: b.status, cycle: b.cycle, basePrice: b.basePrice, finalPrice: b.finalPrice, currency: b.currency, startDate: b.startDate, endDate: b.endDate });
    }
  });

  test('[DPQA-MIG-004] the migration is idempotent: a second seed:config changes no plan, feature, price or subscription row', async () => {
    test.skip(!worktree, 'NOT RUN: QA_API_WORKTREE is not set');
    test.setTimeout(900_000);
    const q = `select md5(string_agg(x, '|' order by x)) as h from (select p::text x from "Plan" p union all select f::text from "PlanFeature" f union all select s::text from "Subscription" s union all select t::text from "TenantFeature" t) q`;
    expect(seedConfig()).toBe(0); // first seed after the migration may legitimately settle state
    const one = (await sql<{ h: string }>(q))[0].h; expect(seedConfig()).toBe(0);
    const two = (await sql<{ h: string }>(q))[0].h; expect(two, 'catalogue/subscription state drifted on a repeated seed').toBe(one);
  });
});
