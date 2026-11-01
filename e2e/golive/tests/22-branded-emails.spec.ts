import { test, expect, env } from '../fixtures/test';
import { api, apiToken, planTenantProvisioned, TENANTS } from '../fixtures/tenants';
import { mail } from '../fixtures/mail-db';
import type { APIRequestContext } from '@playwright/test';

/**
 * DPQA-BEM-*: company-branded transactional e-mails (owner-approved RUN-006 requirement), read from the LOCAL SMTP sink only.
 *   Essential branding (company name, logo, brand colour, safe fallbacks) - Starter and every higher plan.
 *   Advanced e-mail customization (sender name, footer text) - Growth and above.   White-label (no DijiPeople attribution) - Enterprise / Custom.
 * Assumptions to CONFIRM against the development handoff before the first run (RUN-006-PREPARATION Q4-Q6): the exact attribution wording, whether the logo is an
 * <img src=https://tenant-host/...> or an inline cid, and the setting keys (catalog has emailBrandColor, emailFooterText, emailSenderName, showLogoInEmails).
 * A failed assumption is recorded as a contract clarification or a defect in the run report - never by loosening an assertion.
 * Every identity is disposable; the 60 s reset cool-down is per user.
 */
const run = Date.now().toString(36);
const hdr = { 'X-DijiPeople-App': 'web' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const BRAND = { brandName: `Acme Mail ${run}`, emailBrandColor: '#7c3aed', primaryColor: '#7c3aed' };
const ADV = { emailFooterText: `Footer ${run}`, emailSenderName: `Acme HR ${run}` };
type Key = 'A' | 'B' | 'G' | 'E' | 'C';

const patch = (request: APIRequestContext, t: string, kv: Record<string, string>) =>
  api(request, t, 'PATCH', '/tenant-settings', { updates: Object.entries(kv).map(([key, value]) => ({ category: 'branding', key, value })) });
const relationId = async (request: APIRequestContext, t: string) => {
  const rel = (await api(request, t, 'GET', '/lookups/relation-types')).body;
  return (Array.isArray(rel) ? rel : rel.items)[0].id as string;
};
async function disposableUser(request: APIRequestContext, key: Key, owner: string, tag: string, invite = false) {
  const email = `${tag}-${key.toLowerCase()}-${run}@qa.dijipeople.test`;
  const e = await api(request, owner, 'POST', '/employees', {
    firstName: 'Bem', lastName: tag, workEmail: email, hireDate: '2025-02-03', employmentStatus: 'ACTIVE', phone: '+97455500001',
    emergencyContactName: 'X Y', emergencyContactRelationTypeId: await relationId(request, owner), emergencyContactPhone: '+97455500002',
    ...(invite ? { provisionSystemAccess: true, sendInvitationNow: true } : {}),
  });
  expect(e.status, JSON.stringify(e.body).slice(0, 200)).toBeLessThan(300);
  if (!invite) {
    const u = await api(request, owner, 'POST', '/users', { firstName: 'Bem', lastName: tag, email, password: `Bem!${run}Zz9a`, status: 'ACTIVE', employeeId: e.body.id });
    expect(u.status, JSON.stringify(u.body).slice(0, 200)).toBeLessThan(300);
  }
  return { email, employeeId: e.body.id as string };
}
const invitation = async (request: APIRequestContext, key: Key, owner: string, tag: string) => {
  const u = await disposableUser(request, key, owner, tag, true);
  const m = await mail.waitFor(u.email, /activate|invit|welcome/i, 60_000);
  return { ...u, m };
};
const reset = async (request: APIRequestContext, key: Key, owner: string, tag: string) => {
  const u = await disposableUser(request, key, owner, tag, false);
  await request.post(`${env.QA_API_URL}/api/auth/forgot-password`, { headers: hdr, data: { email: u.email, tenantSlug: TENANTS[key].slug } });
  const m = await mail.waitFor(u.email, /reset|password/i, 60_000);
  return { ...u, m };
};
const cleanup = (request: APIRequestContext, owner: string, id: string) => api(request, owner, 'DELETE', `/employees/${id}`);

/** The essential-branding contract, asserted on any transactional message of a branded tenant. */
function expectEssentialBranding(m: { html: string; text: string; from: string; subject: string }, opts: { logo: boolean }) {
  expect(m.html, 'company name in the HTML body').toContain(BRAND.brandName);
  expect(m.text, 'company name in the plain-text alternative').toContain(BRAND.brandName);
  expect(m.html.toLowerCase(), 'brand colour used in the layout').toContain(BRAND.emailBrandColor);
  if (opts.logo) expect(m.html, 'logo image present with a non-empty src').toMatch(/<img[^>]+src="(?!")[^"]+"/i);
  expect(m.html, 'no unresolved template placeholders').not.toMatch(/\{\{|\}\}|undefined|\[object Object\]/);
}

for (const key of ['A', 'G', 'E', 'C'] as const) {
  const plan = { A: 'Starter', G: 'Growth', E: 'Enterprise', C: 'Custom' }[key];
  test.describe(`branded transactional e-mails - ${plan}`, () => {
    test.skip(key !== 'A' && !planTenantProvisioned(key), `NOT RUN: ${plan} tenant not provisioned`);
    let owner: string; let before: Record<string, string> = {};
    test.beforeAll(async ({ request }) => {
      test.setTimeout(600_000);
      owner = await apiToken(request, key, 'OWNER');
      const cur = (await api(request, owner, 'GET', '/tenant-settings/resolved')).body;
      const b = (cur.settings?.branding ?? cur.branding ?? {}) as Record<string, string>;
      before = Object.fromEntries(Object.keys({ ...BRAND, ...ADV }).map((k) => [k, b[k] ?? '']));
      expect((await patch(request, owner, BRAND)).status).toBeLessThan(300);
      const up = await request.post(`${env.QA_API_URL}/api/tenant-settings/branding-assets`, { headers: { authorization: `Bearer ${owner}`, ...hdr }, multipart: { file: { name: 'logo.png', mimeType: 'image/png', buffer: PNG }, settingKey: 'logoUrl' } });
      expect(up.status(), await up.text()).toBeLessThan(300);
      await mail.clear();
    });
    test.afterAll(async ({ request }) => { await patch(request, owner, before).catch(() => undefined); });

    test(`[DPQA-BEM-001-${key}] ${plan}: the invitation e-mail carries company name, logo and brand colour`, async ({ request }) => {
      const i = await invitation(request, key, owner, 'inv');
      try { expectEssentialBranding(i.m, { logo: true }); } finally { await cleanup(request, owner, i.employeeId); }
    });

    test(`[DPQA-BEM-002-${key}] ${plan}: the password-reset e-mail carries company name, logo and brand colour`, async ({ request }) => {
      const r = await reset(request, key, owner, 'rst');
      try { expectEssentialBranding(r.m, { logo: true }); } finally { await cleanup(request, owner, r.employeeId); }
    });

    test(`[DPQA-BEM-004-${key}] ${plan}: attribution - ${key === 'E' || key === 'C' ? 'white-label (no DijiPeople attribution)' : 'DijiPeople attribution is present'}`, async ({ request }) => {
      const r = await reset(request, key, owner, 'attr');
      try {
        const attribution = /powered by\s+dijipeople|dijipeople\s+(hr|people)\s+platform/i;
        if (key === 'E' || key === 'C') expect(r.m.html + r.m.text, 'white-label plans carry no DijiPeople attribution').not.toMatch(attribution);
        else expect(r.m.html + r.m.text, 'non-white-label plans carry the DijiPeople attribution').toMatch(attribution);
      } finally { await cleanup(request, owner, r.employeeId); }
    });

    // RUN-006 test-side correction (contract per handoff v4 + code): "advanced e-mail customization" = template AUTHORING (create/update/clone), Growth+; there is no sender-name feature.
    test(`[DPQA-BEM-005-${key}] ${plan}: template authoring (clone) is ${key === 'A' ? 'refused with TENANT_FEATURE_NOT_ENTITLED' : 'allowed'}`, async ({ request }) => {
      const list = (await api(request, owner, 'GET', '/notifications/email-templates')).body.items as Array<{ id: string; eventCode: string }>;
      const src = list.find((t) => t.eventCode === 'AUTH_PASSWORD_RESET') ?? list[0];
      const c = await api(request, owner, 'POST', `/notifications/email-templates/${src.id}/clone`, { name: `QA clone ${run}` });
      if (key === 'A') {
        expect(c.status).toBe(403);
        expect(JSON.stringify(c.body)).toContain('email-template-customization');
      } else {
        expect(c.status, JSON.stringify(c.body).slice(0, 200)).toBeLessThan(300);
        await api(request, owner, 'POST', `/notifications/email-templates/${c.body.id}/archive`);
      }
    });

    // The tenant's own footer line replaces the DijiPeople attribution only for white-label plans (Enterprise / entitled Custom).
    test(`[DPQA-BEM-006-${key}] ${plan}: custom footer line is ${key === 'E' || key === 'C' ? 'shown (white-label)' : 'not applied; attribution stays'}`, async ({ request }) => {
      expect((await patch(request, owner, { footerText: ADV.emailFooterText })).status).toBeLessThan(300);
      const r = await reset(request, key, owner, 'ftr');
      try {
        if (key === 'E' || key === 'C') expect(r.m.html + r.m.text, 'custom footer in the white-label e-mail').toContain(ADV.emailFooterText);
        else { expect(r.m.html + r.m.text).not.toContain(ADV.emailFooterText); expect(r.m.html + r.m.text).toMatch(/powered by\s+dijipeople/i); }
      } finally { await cleanup(request, owner, r.employeeId); await patch(request, owner, { footerText: 'Powered by DijiPeople' }).catch(() => undefined); }
    });
  });
}

test.describe('fallbacks and safety (Starter tenants)', () => {
  let ownerB: string; let beforeB: Record<string, string> = {};
  test.beforeAll(async ({ request }) => {
    ownerB = await apiToken(request, 'B', 'OWNER');
    const cur = (await api(request, ownerB, 'GET', '/tenant-settings/resolved')).body;
    const b = (cur.settings?.branding ?? cur.branding ?? {}) as Record<string, string>;
    beforeB = { brandName: b.brandName ?? '', emailBrandColor: b.emailBrandColor ?? '', logoUrl: b.logoUrl ?? '', primaryColor: b.primaryColor ?? '#047857' };
    await patch(request, ownerB, { brandName: '', emailBrandColor: '', logoUrl: '' }); // no branding at all
    await mail.clear();
  });
  test.afterAll(async ({ request }) => { await patch(request, ownerB, beforeB).catch(() => undefined); });

  test('[DPQA-BEM-010] missing branding falls back safely: company legal name still shown, platform default colour, no broken <img>, no placeholder leaks', async ({ request }) => {
    const r = await reset(request, 'B', ownerB, 'fb');
    try {
      expect(r.m.html).toMatch(/QA Provisioned B/);
      // RUN-006 test-side correction: the accent is the tenant's own primary colour (catalog default #047857) when it has AA contrast; the product default #0f766e replaces only an invalid/low-contrast colour (BEM-014).
      expect(r.m.html.toLowerCase(), 'tenant primary colour (default) used as accent').toContain('#047857');
      expect(r.m.html, 'no image tag with an empty or missing src').not.toMatch(/<img(?![^>]*\ssrc="[^"]+")[^>]*>/i);
      expect(r.m.html).not.toMatch(/\{\{|\}\}|undefined|\[object Object\]|null/);
    } finally { await cleanup(request, ownerB, r.employeeId); }
  });

  test('[DPQA-BEM-011] tenant A\'s brand never appears in tenant B\'s e-mails and vice versa', async ({ request }) => {
    const ownerA = await apiToken(request, 'A', 'OWNER');
    // RUN-006 hygiene: restore tenant A's brand afterwards (the test used to leave "Acme Mail ..." behind for every later test and screenshot).
    const curA = ((await api(request, ownerA, 'GET', '/tenant-settings/resolved')).body.settings?.branding ?? {}) as Record<string, string>;
    const beforeA = { brandName: curA.brandName ?? '', primaryColor: curA.primaryColor ?? '#047857', emailBrandColor: curA.emailBrandColor ?? '' };
    await patch(request, ownerA, BRAND);
    const r = await reset(request, 'B', ownerB, 'iso');
    try { expect(r.m.html + r.m.text).not.toContain(BRAND.brandName); } finally { await cleanup(request, ownerB, r.employeeId); await patch(request, ownerA, beforeA).catch(() => undefined); }
  });

  test('[DPQA-BEM-012] a hostile brand name is HTML-escaped in the e-mail (no script, no attribute injection)', async ({ request }) => {
    const evil = `Evil <script>alert(1)</script> "onerror="x`;
    expect((await patch(request, ownerB, { brandName: evil })).status).toBeLessThan(500);
    const r = await reset(request, 'B', ownerB, 'xss');
    try {
      expect(r.m.html).not.toMatch(/<script/i);
      expect(r.m.html).not.toMatch(/"onerror="x/);
    } finally { await cleanup(request, ownerB, r.employeeId); await patch(request, ownerB, { brandName: '' }).catch(() => undefined); }
  });

  test('[DPQA-BEM-013] the e-mail link points at the tenant\'s own host and carries a token; the plain-text part carries the same link', async ({ request }) => {
    const r = await reset(request, 'B', ownerB, 'lnk');
    try {
      const link = r.m.links.find((l) => /token=/.test(l));
      expect(link, 'token link present').toBeTruthy();
      expect(link).toContain(TENANTS.B.slug);
      expect(r.m.text).toContain(link!.split('token=')[0]);
    } finally { await cleanup(request, ownerB, r.employeeId); }
  });

  test('[DPQA-BEM-014] an invalid or low-contrast brand colour falls back to the product default accent (#0f766e) and never injects the raw value', async ({ request }) => {
    for (const [n, bad] of ['#ffff00', 'red;background:url(x)', '#12'].entries()) {
      expect((await patch(request, ownerB, { primaryColor: bad })).status).toBeLessThan(600);
      const r = await reset(request, 'B', ownerB, `col${n}`);
      try {
        expect(r.m.html.toLowerCase(), `accent for ${bad}`).toContain('#0f766e');
        expect(r.m.html.toLowerCase()).not.toContain('url(x)');
      } finally { await cleanup(request, ownerB, r.employeeId); }
    }
  });
});
