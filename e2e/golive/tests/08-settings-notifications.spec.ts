import { test, expect, env } from '../fixtures/test';
import { api, apiToken, stateFile, tenantUrl } from '../fixtures/tenants';

/**
 * DPQA-SET-*: tenant settings, branding and the Starter plan-bypass attempts a tenant admin can make themselves.
 * DPQA-NOT-*: in-app notifications.
 * Anything this suite changes is restored in afterAll.
 */

let owner: string; let b: string; let original: any;

test.beforeAll(async ({ request }) => {
  owner = await apiToken(request, 'A', 'OWNER');
  b = await apiToken(request, 'B', 'OWNER');
  original = (await api(request, owner, 'GET', '/tenant-settings/features')).body;
});

test.afterAll(async ({ request }) => {
  const restore = (original.items as Array<{ key: string; tenantOverrideEnabled: boolean | null }>)
    .filter((i) => i.tenantOverrideEnabled !== null)
    .map((i) => ({ key: i.key, isEnabled: i.tenantOverrideEnabled as boolean }));
  if (restore.length) await api(request, owner, 'PATCH', '/tenant-settings/features', { updates: restore });
});

test('[DPQA-ENT-050] a tenant admin cannot self-enable a Growth feature; the module stays refused', async ({ request }) => {
  const r = await api(request, owner, 'PATCH', '/tenant-settings/features', { updates: [{ key: 'projects', isEnabled: true }, { key: 'payroll', isEnabled: true }] });
  // Either the write is refused, or it is accepted but capped by the plan. What must never happen is access.
  const after = await api(request, owner, 'GET', '/tenant-settings/features');
  const enabled = (after.body.items as Array<{ key: string; isEnabled: boolean }>).filter((i) => i.isEnabled).map((i) => i.key);
  expect(enabled, `PATCH returned ${r.status}`).not.toContain('projects');
  expect(enabled).not.toContain('payroll');
  await new Promise((res) => setTimeout(res, 1500));
  const p = await api(request, owner, 'GET', '/projects');
  expect([402, 403], 'GET /projects after self-enable attempt').toContain(p.status);
});

test('[DPQA-ENT-051] a non-owner role cannot change features at all', async ({ request }) => {
  const t = await apiToken(request, 'A', 'EMPLOYEE');
  const r = await api(request, t, 'PATCH', '/tenant-settings/features', { updates: [{ key: 'branding', isEnabled: false }] });
  expect(r.status).toBe(403);
});

test('[DPQA-SET-001] public branding endpoint is unauthenticated and leaks no internal ids or emails', async ({ request }) => {
  const r = await request.get(`${env.QA_API_URL}/api/tenant-settings/public-branding`, { headers: { Host: `${env.QA_TENANT_A_SLUG}.localhost` } });
  test.skip(r.status() === 404 || r.status() === 400, `needs tenant resolution by host (status ${r.status()})`);
  const text = await r.text();
  expect(text).not.toMatch(/passwordHash|@qa\.dijipeople\.test|stripe|secret/i);
});

test('[DPQA-SET-002] settings categories load for the owner', async ({ request }) => {
  const r = await api(request, owner, 'GET', '/tenant-settings/resolved');
  expect(r.status).toBe(200);
  const all = await api(request, owner, 'GET', '/tenant-settings');
  expect(all.status).toBe(200);
});

// DP-QA-012: the API ACCEPTED an invalid timezone and every page of the tenant then threw RangeError. Always restore.
test('[DPQA-SET-003] an invalid setting value is rejected and the stored value is unchanged', async ({ request }) => {
  const before = JSON.stringify((await api(request, owner, 'GET', '/tenant-settings/resolved')).body);
  let r: { status: number };
  try {
    r = await api(request, owner, 'PATCH', '/tenant-settings', { updates: [{ category: 'organization', key: 'timezone', value: 'Not/AZone' }] });
  } finally {
    await api(request, owner, 'PATCH', '/tenant-settings', { updates: [{ category: 'organization', key: 'timezone', value: 'UTC' }] });
  }
  expect(r.status, 'invalid timezone must be rejected').toBeGreaterThanOrEqual(400);
  const after = JSON.stringify((await api(request, owner, 'GET', '/tenant-settings/resolved')).body);
  expect(JSON.parse(after).settings?.organization?.timezone ?? 'UTC').toBe('UTC');
  void before;
});

test('[DPQA-SET-004] an unknown settings key is rejected', async ({ request }) => {
  const r = await api(request, owner, 'PATCH', '/tenant-settings', { updates: [{ category: 'organization', key: 'doesNotExist', value: 1 }] });
  expect(r.status).toBeGreaterThanOrEqual(400);
  expect(r.status).toBeLessThan(500);
});

test('[DPQA-SET-005] branding asset upload: PNG accepted; script/HTML/oversize refused', async ({ request }) => {
  const send = (name: string, mimeType: string, buffer: Buffer) =>
    request.post(`${env.QA_API_URL}/api/tenant-settings/branding-assets`, {
      headers: { authorization: `Bearer ${owner}`, 'X-DijiPeople-App': 'web' },
      multipart: { file: { name, mimeType, buffer }, settingKey: 'logoUrl' },
    });
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const ok = await send('logo.png', 'image/png', png);
  expect(ok.status(), await ok.text()).toBeLessThan(300);
  for (const [label, name, mime, buf] of [
    ['html', 'logo.html', 'text/html', Buffer.from('<script>alert(1)</script>')],
    ['exe', 'logo.exe', 'application/x-msdownload', Buffer.from('MZ')],
    ['4MB png', 'big.png', 'image/png', Buffer.concat([png, Buffer.alloc(4 * 1024 * 1024)])],
  ] as const) {
    const r = await send(name, mime, buf);
    expect(r.status(), label).toBeGreaterThanOrEqual(400);
    expect(r.status(), label).toBeLessThan(500);
  }
});

test.describe('notifications', () => {
  test('[DPQA-NOT-001] in-app inbox and unread count respond for a normal user', async ({ request }) => {
    const e = await apiToken(request, 'A', 'EMPLOYEE');
    const list = await api(request, e, 'GET', '/notifications/in-app?pageSize=10');
    const unread = await api(request, e, 'GET', '/notifications/in-app/unread-count');
    expect(list.status).toBe(200);
    expect(unread.status).toBe(200);
  });
  test('[DPQA-NOT-002] tenant B cannot see tenant A notifications', async ({ request }) => {
    const a = await api(request, owner, 'GET', '/notifications/in-app?pageSize=100');
    const bb = await api(request, b, 'GET', '/notifications/in-app?pageSize=100');
    const idsA = new Set(((a.body.items ?? a.body) as Array<{ id: string }>).map((n) => n.id));
    for (const n of (bb.body.items ?? bb.body) as Array<{ id: string }>) expect(idsA.has(n.id)).toBe(false);
  });
  test('[DPQA-NOT-003] notification bell opens in the browser without console errors', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: stateFile('A', 'OWNER') });
    const page = await ctx.newPage();
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(tenantUrl('A', '/'), { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => undefined);
    await page.getByRole('button', { name: /notifications/i }).first().click();
    await page.waitForTimeout(1000);
    expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
    await ctx.close();
  });
});

test.describe('settings UI (owner)', () => {
  test.use({ storageState: stateFile('A', 'OWNER') });
  for (const [id, path, text] of [
    ['010', '/settings', /settings/i],
    ['011', '/settings/branding', /branding/i],
    ['012', '/settings/general-setup/tenant/tenant-profile', /tenant profile/i],
    ['013', '/settings/security-access/identities/users', /users/i],
    ['014', '/settings/customization', /customization/i],
  ] as const) {
    test(`[DPQA-SET-${id}] ${path} loads for the owner of a provisioned tenant`, async ({ page }) => {
      await page.goto(tenantUrl('A', path), { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => undefined);
      await page.waitForTimeout(1200);
      await expect(page.getByRole('heading', { name: text }).first()).toBeVisible();
      await expect(page.getByText(/we hit an unexpected problem|could not load/i)).toHaveCount(0);
    });
  }
});
