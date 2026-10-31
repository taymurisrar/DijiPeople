import { test, expect } from '../fixtures/test';
import { api, apiToken, planTenantProvisioned } from '../fixtures/tenants';
import { NEVER_ON_STARTER } from '../fixtures/entitlement-matrix';

/**
 * DPQA-MTX-*: the complete entitlement matrix per plan, from the resolved feature list of each provisioned plan tenant
 * (Starter A always; Growth G, Enterprise E, Custom C when provisioned). Cells come from fixtures/entitlement-matrix.ts (owner-approved requirements only).
 * The full enabled set of every plan is attached to the run for human review - nothing is inferred from it.
 */
const resolve = async (request: Parameters<typeof api>[0], key: 'A' | 'G' | 'E' | 'C') => {
  const t = await apiToken(request, key, 'OWNER');
  const r = await api(request, t, 'GET', '/tenant-settings/features');
  expect(r.status, JSON.stringify(r.body).slice(0, 160)).toBe(200);
  const items = (r.body.items as Array<{ key: string; isEnabled: boolean }>);
  return { plan: String(r.body.subscription?.plan?.key ?? ''), enabled: new Set(items.filter((i) => i.isEnabled).map((i) => i.key)), all: items.map((i) => i.key) };
};

test('[DPQA-MTX-001] Starter: never has a feature sold above Starter (recruitment, onboarding, timesheets, projects, payroll, compliance, attendance integrations, desktop agent)', async ({ request }, info) => {
  const f = await resolve(request, 'A');
  await info.attach('starter-enabled.json', { body: JSON.stringify([...f.enabled].sort()), contentType: 'application/json' });
  expect(f.plan).toBe('starter');
  for (const k of NEVER_ON_STARTER) expect(f.enabled.has(k), `Starter must not have ${k}`).toBe(false);
});

// C = Custom: there is no `custom` plan key; Custom is a CUSTOM-source TenantFeature override on a plan (here Growth + explicit desktop-agent + email-white-label). Test-side correction, RUN-006.
for (const [key, plan, agent] of [['G', 'growth', false], ['E', 'enterprise', true], ['C', 'growth', true]] as const) {
  test.describe(`${plan} tenant`, () => {
    test.skip(!planTenantProvisioned(key), `NOT RUN: ${plan} tenant not provisioned`);
    test(`[DPQA-MTX-010-${key}] ${plan}: resolved plan key, all Starter features enabled, desktop agent ${agent ? 'enabled' : 'disabled'}`, async ({ request }, info) => {
      const f = await resolve(request, key);
      await info.attach(`${plan}-enabled.json`, { body: JSON.stringify([...f.enabled].sort()), contentType: 'application/json' });
      expect(f.plan, 'resolved plan').toBe(plan);
      for (const k of ['attendance', 'branding', 'documents', 'employees', 'leave', 'notifications', 'organization']) expect(f.enabled.has(k), `${plan} must include Starter feature ${k}`).toBe(true);
      expect(f.enabled.has('desktop-agent'), `desktop-agent on ${plan}`).toBe(agent);
    });
  });
}

test('[DPQA-MTX-020] every plan\'s feature catalogue lists the same feature keys (a plan never silently drops or invents a key)', async ({ request }) => {
  const a = await resolve(request, 'A');
  for (const key of ['G', 'E', 'C'] as const) {
    if (!planTenantProvisioned(key)) continue;
    const f = await resolve(request, key);
    expect([...f.all].sort(), `catalogue of ${key}`).toEqual([...a.all].sort());
  }
});
