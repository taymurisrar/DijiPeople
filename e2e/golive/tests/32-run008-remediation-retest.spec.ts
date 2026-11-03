import { test, expect, env } from '../fixtures/test';
import { api, apiToken, credentials, planTenantProvisioned, tenantUrl, TENANTS } from '../fixtures/tenants';
import { mail, sql } from '../fixtures/mail-db';
import { FEATURE_PROBES } from '../fixtures/entitlement-matrix';
import { STARTER_FEATURES, assignPlan, createCustomPlan, deleteCustomPlan, onboardTenant, papi, platformConfigured, priceRow, publishPrice, restoreSubscription, subscriptionOf, unpublishPrice, type CustomPlan, type SubscriptionSnapshot } from '../fixtures/platform';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { APIRequestContext } from '@playwright/test';

/**
 * RUN-008: independent retest of the RUN-007 remediation (handoff v7, application 4dd29d3a). Local isolated stack only; nothing here weakens a RUN-007 assertion - RUN-007 specs 27..31 run unchanged beside this file.
 *
 *   PUB-001..008  DP-QA-044  a Custom plan's price is priced -> refused before publish -> published -> onboarding succeeds -> withdrawn; predefined plans excluded; negative inputs; audit; nothing else touched
 *   RSV-001..008  DP-QA-043  a plan reserved for one customer is refused on EVERY assignment path (operator PATCH, tenant plan-change, checkout, new customer, onboarding); existing subscribers are not re-judged
 *   REV-001..006  DP-QA-047  reassignment takes effect on the NEXT check on the same process: issued tokens, refresh tokens, new sign-ins, repeated flips, concurrency, no stale snapshot re-seeded
 *   GATE-001..007 DP-QA-005  release command, health and smoke safeguards (the not-enforced API phase is exercised out of band by tools/gate-phase.mjs: evidence/RUN008-gate-unenforced.md)
 */
const run = Date.now().toString(36);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const worktree = (env as unknown as Record<string, string | undefined>).QA_API_WORKTREE ?? '';
const probe = async (request: APIRequestContext, owner: string, feature: string) => (await api(request, owner, 'GET', FEATURE_PROBES[feature])).status;
const refused = (s: number) => s === 402 || s === 403;

test.describe('DP-QA-044 Custom plan price publication', () => {
  test.skip(!platformConfigured(), 'NOT RUN: platform admin not configured');
  test.beforeEach(({}, i) => { test.skip(i.project.name !== 'chromium', 'database-level suite: runs once, on the chromium project'); });
  test.describe.configure({ mode: 'serial' });
  let plan: CustomPlan; let onboardingId = ''; const slug = `qa-pub-${run}`;
  test.afterAll(async ({ request }) => { await sql(`delete from "Tenant" where slug = $1 and status = 'PROVISIONING_FAILED'`, [slug]).catch(() => undefined); await deleteCustomPlan(request, plan); });

  test('[DPQA-PUB-001] a priced Custom plan is a DRAFT price and onboarding onto it is refused with a clear message, leaving no usable tenant', async ({ request }, info) => {
    test.setTimeout(300_000);
    plan = await createCustomPlan(request, ['employees', 'leave'], { label: 'pub', monthly: 31 });
    expect(plan.priceId, 'the price was created').toBeTruthy();
    const row = await priceRow(plan.priceId!);
    expect(row.publicationStatus, 'a new price is not published').toBe('DRAFT');
    expect(row.publishedAt, 'no publication timestamp yet').toBeNull();
    const r = await onboardTenant(request, plan, slug, `QA Pub ${run}`);
    onboardingId = r.onboardingId;
    info.annotations.push({ type: 'observation', description: `create-tenant before publication -> ${r.status} ${String(r.body?.message).slice(0, 160)}` });
    expect(r.status, 'provisioning is refused').toBeGreaterThanOrEqual(400);
    expect(r.status, 'a refusal, not a server error').toBeLessThan(500);
    expect(String(r.body?.message), 'the message tells the operator what to do').toMatch(/publish/i);
    const left = await sql<{ status: string; subs: string }>(`select t.status::text as status, (select count(*)::text from "Subscription" s where s."tenantId" = t.id) as subs from "Tenant" t where t.slug = $1`, [slug]);
    for (const t of left) { expect(t.status).toBe('PROVISIONING_FAILED'); expect(t.subs).toBe('0'); }
  });

  test('[DPQA-PUB-002] publishing the price: status, timestamp, actor and audit are recorded; no amount, cycle or Stripe state is created or changed', async ({ request }, info) => {
    const before = await priceRow(plan.priceId!);
    const r = await publishPrice(request, plan.id, plan.priceId!);
    expect(r.status, JSON.stringify(r.body).slice(0, 240)).toBeLessThan(300);
    expect(r.body.publicationStatus ?? r.body.price?.publicationStatus, 'response reports PUBLISHED').toBe('PUBLISHED');
    const after = await priceRow(plan.priceId!);
    expect(after.publicationStatus).toBe('PUBLISHED');
    expect(after.publishedAt, 'publishedAt set').not.toBeNull();
    info.annotations.push({ type: 'observation', description: `publishedById=${after.publishedById}` });
    const untouched = (p: typeof before) => ({ unitAmount: p.unitAmount, currency: p.currency, billingCycle: p.billingCycle, stripePriceId: p.stripePriceId, stripeProductId: p.stripeProductId, isActive: p.isActive });
    expect(untouched(after), 'only the publication fields changed').toEqual(untouched(before));
    const audit = await sql<{ action: string; before: string; after: string }>(`select action, "beforeSnapshot"::text as before, "afterSnapshot"::text as after from "PlatformAuditLog" where "entityId" = $1 and action = 'PLAN_PRICE_PUBLISHED'`, [plan.priceId]);
    expect(audit.length, 'one PLAN_PRICE_PUBLISHED audit row with before/after snapshots').toBe(1);
    expect(audit[0].before).toContain('DRAFT'); expect(audit[0].after).toContain('PUBLISHED');
  });

  test('[DPQA-PUB-003] after publication the SAME onboarding succeeds: a tenant exists, ACTIVE-able, on the Custom plan and its published price, with exactly the plan\'s features plus the baseline', async ({ request }) => {
    test.setTimeout(300_000);
    const r = await onboardTenant(request, plan, slug, `QA Pub ${run}`, { onboardingId });
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBeLessThan(300);
    // the PROVISIONING_FAILED row created by the refused attempt, if any, must not block or duplicate the real one
    // RUN-008 calibration: the refused attempt LINKS its PROVISIONING_FAILED tenant to the onboarding, so a re-submitted create-tenant answers success with alreadyExists (idempotent by design) and provisions nothing.
    // The supported recovery is the control-plane retry; the test follows it and records the create-tenant answer as an observation (see DP-QA-048 candidate).
    const first = await sql<{ id: string; status: string; subs: string }>(`select t.id, t.status::text as status, (select count(*)::text from "Subscription" s where s."tenantId" = t.id) as subs from "Tenant" t where t.slug = $1`, [slug]);
    test.info().annotations.push({ type: 'observation', description: `create-tenant re-submit after publication -> ${r.status} ${JSON.stringify(r.body).slice(0, 200)}; tenant right after: ${JSON.stringify(first)}` });
    if (first[0] && first[0].subs === '0') {
      const retry = await papi(request, 'POST', `/platform/tenants/${first[0].id}/operations/retry-provisioning`, { reason: 'RUN-008 retry after the Custom plan price was published' });
      test.info().annotations.push({ type: 'observation', description: `control-plane retry-provisioning -> ${retry.status} ${JSON.stringify(retry.body).slice(0, 240)}` });
      expect(retry.status, `retry-provisioning: ${JSON.stringify(retry.body).slice(0, 300)}`).toBeLessThan(300);
    }
    const rows = await sql<{ id: string; status: string; planId: string; priceId: string | null; subStatus: string }>(`select t.id, t.status::text as status, s."planId", s."planPriceId" as "priceId", s.status::text as "subStatus" from "Tenant" t join "Subscription" s on s."tenantId" = t.id where t.slug = $1`, [slug]);
    const any = await sql(`select status::text, (select count(*)::text from "Subscription" s where s."tenantId" = t.id) as subs from "Tenant" t where t.slug = $1`, [slug]);
    test.info().annotations.push({ type: 'evidence', description: `create-tenant retry body ${JSON.stringify(r.body).slice(0, 300)}; tenant rows ${JSON.stringify(any)}` });
    expect(rows.length, `exactly one tenant with a subscription for the slug (retry body ${JSON.stringify(r.body).slice(0, 300)}; tenant rows ${JSON.stringify(any)})`).toBe(1);
    expect(rows[0].planId).toBe(plan.id); expect(rows[0].priceId, 'subscription points at the published price').toBe(plan.priceId);
    const feats = await sql<{ featureKey: string }>(`select "featureKey" from "PlanFeature" where "planId" = $1 and "isEnabled" order by 1`, [plan.id]);
    expect(feats.map((f) => f.featureKey)).toEqual(['data-import-export', 'employees', 'leave']);
  });

  test('[DPQA-PUB-004] withdrawing the price: DB status returns to DRAFT, the existing subscription is untouched, new onboarding is refused again', async ({ request }) => {
    test.setTimeout(300_000);
    const sub0 = await sql(`select s."planId", s."planPriceId", s.status::text from "Subscription" s join "Tenant" t on t.id = s."tenantId" where t.slug = $1`, [slug]);
    const r = await unpublishPrice(request, plan.id, plan.priceId!);
    expect(r.status, JSON.stringify(r.body).slice(0, 240)).toBeLessThan(300);
    expect((await priceRow(plan.priceId!)).publicationStatus).toBe('DRAFT');
    expect(await sql(`select s."planId", s."planPriceId", s.status::text from "Subscription" s join "Tenant" t on t.id = s."tenantId" where t.slug = $1`, [slug]), 'the existing subscription is untouched').toEqual(sub0);
    const slug2 = `qa-pub2-${run}`;
    const again = await onboardTenant(request, plan, slug2, `QA Pub2 ${run}`);
    try { expect(again.status, 'new onboarding refused again').toBeGreaterThanOrEqual(400); expect(again.status).toBeLessThan(500); } finally { await sql(`delete from "Tenant" where slug = $1 and status = 'PROVISIONING_FAILED'`, [slug2]).catch(() => undefined); }
    const audit = await sql(`select 1 from "PlatformAuditLog" where "entityId" = $1 and action = 'PLAN_PRICE_UNPUBLISHED'`, [plan.priceId]);
    expect(audit.length).toBe(1);
  });

  test('[DPQA-PUB-005] the predefined plans have no publishable price: publish and withdraw are refused and the catalogue rows do not change', async ({ request }) => {
    for (const key of ['starter', 'growth', 'enterprise']) {
      const p = (await sql<{ id: string; pid: string }>(`select p.id, pp.id as pid from "Plan" p join "PlanPrice" pp on pp."planId" = p.id where p.key = $1 and pp."isActive" order by pp."createdAt" limit 1`, [key]))[0];
      const before = await priceRow(p.pid);
      for (const fn of [publishPrice, unpublishPrice]) {
        const r = await fn(request, p.id, p.pid);
        expect(r.status, `${key}: ${fn.name}`).toBeGreaterThanOrEqual(400); expect(r.status).toBeLessThan(500);
      }
      expect(await priceRow(p.pid), `${key} price unchanged`).toEqual(before);
    }
  });

  test('[DPQA-PUB-006] negative inputs: malformed ids, a price of another plan, an unknown price, no credential, a tenant credential and a double publish are all refused cleanly', async ({ request }) => {
    const p2 = await createCustomPlan(request, ['employees'], { label: 'pub-neg' });
    try {
      const bad = await papi(request, 'POST', `/super-admin/plans/not-a-uuid/prices/${p2.priceId}/publish`); expect(bad.status).toBe(400);
      const unknown = await papi(request, 'POST', `/super-admin/plans/${p2.id}/prices/00000000-0000-4000-8000-000000000000/publish`); expect(unknown.status).toBe(404);
      const cross = await papi(request, 'POST', `/super-admin/plans/${p2.id}/prices/${plan.priceId}/publish`); expect(cross.status, 'a price of another plan').toBeGreaterThanOrEqual(400); expect(cross.status).toBeLessThan(500);
      expect((await priceRow(plan.priceId!)).publicationStatus, 'the other plan\'s price is untouched').toBe('DRAFT');
      const anon = await request.post(`${env.QA_API_URL}/api/super-admin/plans/${p2.id}/prices/${p2.priceId}/publish`, { headers: { 'X-DijiPeople-App': 'admin' } }); expect(anon.status()).toBe(401);
      const owner = await apiToken(request, 'B', 'OWNER');
      const tenant = await request.post(`${env.QA_API_URL}/api/super-admin/plans/${p2.id}/prices/${p2.priceId}/publish`, { headers: { authorization: `Bearer ${owner}`, 'X-DijiPeople-App': 'web' } });
      expect([401, 403], 'a tenant administrator cannot publish a price').toContain(tenant.status());
      expect((await priceRow(p2.priceId!)).publicationStatus).toBe('DRAFT');
      expect((await publishPrice(request, p2.id, p2.priceId!)).status).toBeLessThan(300);
      const twice = await publishPrice(request, p2.id, p2.priceId!); expect(twice.status, 'double publish is a clean refusal').toBeGreaterThanOrEqual(400); expect(twice.status).toBeLessThan(500);
      expect((await priceRow(p2.priceId!)).publicationStatus).toBe('PUBLISHED');
      const inactive = await createCustomPlan(request, ['employees'], { label: 'pub-inactive' });
      try {
        expect((await papi(request, 'DELETE', `/super-admin/plans/${inactive.id}/prices/${inactive.priceId}`)).status).toBeLessThan(300);
        expect((await priceRow(inactive.priceId!)).isActive, 'the price is deactivated (soft delete)').toBe(false);
        const r = await publishPrice(request, inactive.id, inactive.priceId!); expect(r.status, 'an inactive price cannot be published').toBeGreaterThanOrEqual(400); expect(r.status).toBeLessThan(500);
      } finally { await deleteCustomPlan(request, inactive); }
    } finally { await deleteCustomPlan(request, p2); }
  });

  test('[DPQA-PUB-007] editing the amount of a published price supersedes it as a new DRAFT that must be republished (handoff-stated consequence), and nothing is silently sold at the old or unpublished price', async ({ request }, info) => {
    const p3 = await createCustomPlan(request, ['employees'], { label: 'pub-edit', monthly: 40 });
    try {
      expect((await publishPrice(request, p3.id, p3.priceId!)).status).toBeLessThan(300);
      const edit = await papi(request, 'PATCH', `/super-admin/plans/${p3.id}/prices/${p3.priceId}`, { unitAmount: 45 });
      info.annotations.push({ type: 'observation', description: `PATCH amount on a published price -> ${edit.status}` });
      // BLOCKED, not passed: the price PATCH runs Stripe price preparation (prepareStripePlanPrice) whatever the body says, and the isolated stack has no STRIPE_SECRET_KEY, so it answers a raw 500 (DP-QA-049 observation).
      test.skip(edit.status === 500, `BLOCKED (infrastructure): price amount edit needs Stripe configuration -> ${edit.status} ${String(edit.body?.errorCode)}; supersede-as-DRAFT behaviour not verified`);
      expect(edit.status).toBeLessThan(300);
      const rows = await sql<{ id: string; st: string; active: boolean; amt: string }>(`select id, "publicationStatus"::text as st, "isActive" as active, "unitAmount"::text as amt from "PlanPrice" where "planId" = $1 order by "createdAt"`, [p3.id]);
      info.annotations.push({ type: 'evidence', description: JSON.stringify(rows) });
      const usable = rows.filter((r) => r.active && r.st === 'PUBLISHED');
      expect(usable.length, 'no active PUBLISHED price at the new amount until it is republished').toBe(0);
      const draft = rows.find((r) => r.active && r.st === 'DRAFT' && Number(r.amt) === 45);
      expect(draft, 'the new amount exists as an active DRAFT').toBeTruthy();
      expect((await publishPrice(request, p3.id, draft!.id)).status).toBeLessThan(300);
      expect((await sql(`select 1 from "PlanPrice" where "planId" = $1 and "isActive" and "publicationStatus" = 'PUBLISHED'`, [p3.id])).length).toBe(1);
    } finally { await deleteCustomPlan(request, p3); }
  });

  test('[DPQA-PUB-008] a Custom plan can be published for Contact Sales with the existing plan action, and the predefined plans stay as seeded', async ({ request }) => {
    const p4 = await createCustomPlan(request, ['employees'], { label: 'pub-plan' });
    try {
      const before = (await sql<{ s: string }>(`select "publicationStatus"::text as s from "Plan" where id = $1`, [p4.id]))[0].s;
      expect(before).toBe('DRAFT');
      // RUN-008 calibration: the plan action refuses until a price is published ("Publish at least one price first"), which is the intended order; assert the refusal, then follow the order.
      const early = await papi(request, 'POST', `/platform-runtime/plans/${p4.id}/actions/publish`);
      expect(early.status, 'plan publish before any published price is refused cleanly').toBeGreaterThanOrEqual(400); expect(early.status).toBeLessThan(500);
      expect((await publishPrice(request, p4.id, p4.priceId!)).status).toBeLessThan(300);
      const r = await papi(request, 'POST', `/platform-runtime/plans/${p4.id}/actions/publish`);
      expect(r.status, JSON.stringify(r.body).slice(0, 240)).toBeLessThan(300);
      expect((await sql<{ s: string }>(`select "publicationStatus"::text as s from "Plan" where id = $1`, [p4.id]))[0].s).toBe('PUBLISHED');
      expect((await sql<{ n: string }>(`select count(*)::text as n from "Plan" where kind = 'CATALOGUE' and "publicationStatus" = 'PUBLISHED'`))[0].n).toBe('3');
    } finally { await deleteCustomPlan(request, p4); }
  });
});

test.describe('DP-QA-043 reserved Custom plans on every assignment path', () => {
  test.skip(!platformConfigured() || !planTenantProvisioned('C'), 'NOT RUN: platform admin or the Custom tenant not configured');
  test.beforeEach(({}, i) => { test.skip(i.project.name !== 'chromium', 'database-level suite: runs once, on the chromium project'); });
  test.describe.configure({ mode: 'serial' });
  let cid = ''; let reserved: CustomPlan; let open: CustomPlan; let savedB: SubscriptionSnapshot; let savedC: SubscriptionSnapshot; let savedA: SubscriptionSnapshot;
  test.beforeAll(async ({ request }) => {
    cid = (await sql<{ cid: string }>(`select "customerAccountId" as cid from "Tenant" where slug = $1`, [TENANTS.C.slug]))[0].cid;
    const made = await papi(request, 'POST', '/super-admin/plans', { key: `qa-rsv-${run}`, name: `QA Reserved ${run}`, description: 'reserved for the Custom tenant customer', isActive: true, monthlyBasePrice: 19, annualBasePrice: 190, currency: 'USD', featureKeys: ['employees', 'leave'], eligibleCustomerAccountId: cid });
    expect(made.status, JSON.stringify(made.body).slice(0, 300)).toBeLessThan(300);
    const id = (made.body.id ?? made.body.plan?.id) as string;
    const pr = await papi(request, 'POST', `/super-admin/plans/${id}/prices`, { billingCycle: 'MONTHLY', billingModel: 'FLAT', currency: 'USD', unitAmount: 19, syncToStripe: false, isActive: true });
    reserved = { id, key: `qa-rsv-${run}`, name: `QA Reserved ${run}`, featureKeys: ['employees', 'leave'], priceId: pr.body.id ?? pr.body.price?.id };
    open = await createCustomPlan(request, ['employees'], { label: 'open' });
    savedA = await subscriptionOf(TENANTS.A.slug); savedB = await subscriptionOf(TENANTS.B.slug); savedC = await subscriptionOf(TENANTS.C.slug);
  });
  test.afterAll(async ({ request }) => {
    for (const [s, snap] of [[TENANTS.A.slug, savedA], [TENANTS.B.slug, savedB], [TENANTS.C.slug, savedC]] as const) if (snap) await restoreSubscription(request, s, snap).catch(() => undefined);
    await deleteCustomPlan(request, reserved); await deleteCustomPlan(request, open);
  });
  const unchanged = async (slug: string, snap: SubscriptionSnapshot) => { const now = await subscriptionOf(slug); expect({ planId: now.planId, planPriceId: now.planPriceId, status: now.status, billingCycle: now.billingCycle }, `${slug} subscription unchanged`).toEqual({ planId: snap.planId, planPriceId: snap.planPriceId, status: snap.status, billingCycle: snap.billingCycle }); };

  test('[DPQA-RSV-001] operator PATCH of ANOTHER customer\'s tenant onto the reserved plan is a 400 and the tenant is unchanged (CPL-009 retest, hard assertions)', async ({ request }) => {
    const r1 = await assignPlan(request, TENANTS.B.slug, reserved.id, { purchasedSeats: 1 }, reserved.priceId);
    expect(r1.status, JSON.stringify(r1.body).slice(0, 200)).toBe(400);
    await unchanged(TENANTS.B.slug, savedB);
    const r2 = await assignPlan(request, TENANTS.A.slug, reserved.id, {}, undefined);
    expect(r2.status, 'also without an explicit price').toBe(400);
    await unchanged(TENANTS.A.slug, savedA);
    const audit = await sql(`select 1 from "PlatformAuditLog" where "entityId" in ($1, $2) and action ilike '%SUBSCRIPTION%' and "afterSnapshot"::text like $3`, [savedA.tenantId, savedB.tenantId, `%${reserved.id}%`]);
    expect(audit.length, 'no audit row claims a successful move onto the reserved plan').toBe(0);
  });

  test('[DPQA-RSV-002] a tenant owner\'s plan-change onto a reserved plan, a non-self-service custom plan and a missing plan gets the SAME opaque 400 ("That plan is not available."), revealing no reservation', async ({ request }, info) => {
    const owner = await apiToken(request, 'B', 'OWNER');
    const attempts = [['reserved', reserved], ['sales-assisted custom', open], ['missing', { id: '00000000-0000-4000-8000-000000000000', priceId: reserved.priceId }]] as const;
    const out: Array<{ k: string; s: number; m: string }> = [];
    for (const [k, p] of attempts) {
      const r = await api(request, owner, 'POST', '/billing/plan-changes', { toPlanId: p.id, toPlanPriceId: p.priceId });
      out.push({ k, s: r.status, m: String(r.body?.message) });
      expect(r.status, `${k}: ${JSON.stringify(r.body).slice(0, 200)}`).toBe(400);
      expect(String(r.body?.message), `${k}: message`).toBe('That plan is not available.');
      expect(JSON.stringify(r.body), `${k}: nothing about reservations or other customers`).not.toMatch(/reserved|another customer|eligible|customerAccount/i);
    }
    info.annotations.push({ type: 'evidence', description: JSON.stringify(out) });
    await unchanged(TENANTS.B.slug, savedB);
    const preview = await api(request, owner, 'GET', `/billing/plan-changes/preview?toPlanId=${reserved.id}&toPlanPriceId=${reserved.priceId}`);
    info.annotations.push({ type: 'observation', description: `plan-change PREVIEW of the reserved plan -> ${preview.status} ${JSON.stringify(preview.body).slice(0, 160)}` });
    expect.soft(JSON.stringify(preview.body), 'the preview must not disclose a reserved plan\'s price or features to another customer').not.toMatch(/"unitAmount":\s*19|QA Reserved/);
  });

  test('[DPQA-RSV-003] checkout and public subscribe paths do not turn a reserved plan into a purchase for another customer', async ({ request }, info) => {
    const owner = await apiToken(request, 'B', 'OWNER');
    // RUN-008 calibration: a DRAFT price is hidden from these paths anyway (404 "Plan price not found"), which proves nothing about the RESERVATION. Publish the reserved plan's price first so only the reservation can refuse.
    expect((await publishPrice(request, reserved.id, reserved.priceId!)).status).toBeLessThan(300);
    const co = await api(request, owner, 'POST', '/billing/checkout-sessions', { planPriceId: reserved.priceId, seatQuantity: 1 }); // RUN-008 calibration: the first attempt omitted seatQuantity, so DTO validation (not the reservation rule) refused it
    info.annotations.push({ type: 'observation', description: `checkout-sessions on a reserved price -> ${co.status} ${String(co.body?.message).slice(0, 160)}` });
    expect(co.status, 'checkout refused').toBeGreaterThanOrEqual(400); expect(co.status).toBeLessThan(500);
    await unchanged(TENANTS.B.slug, savedB);
    const pub = await request.post(`${env.QA_API_URL}/api/public/subscribe`, { headers: { 'content-type': 'application/json' }, data: { planPriceId: reserved.priceId, seatQuantity: 1, companyName: `QA Rsv ${run}`, contactName: 'Qa Probe', email: `rsv-${run}@qa.dijipeople.test`, country: 'QA', ownerFirstName: 'Qa', ownerLastName: 'Probe', requestedSlug: `qa-rsvpub-${run}`, acceptedLegalVersionIds: [] } });
    const pb = await pub.json().catch(() => ({}));
    info.annotations.push({ type: 'observation', description: `public/subscribe on a reserved price -> ${pub.status()} ${String(pb?.message).slice(0, 200)}` });
    expect(pub.status(), 'public subscribe refused').toBeGreaterThanOrEqual(400); expect(pub.status()).toBeLessThan(500);
    expect((await sql(`select 1 from "Tenant" where slug = $1`, [`qa-rsvpub-${run}`])).length, 'no tenant was created').toBe(0);
    expect((await sql(`select 1 from "CustomerAccount" where "primaryContactEmail" = $1`, [`rsv-${run}@qa.dijipeople.test`])).length, 'no customer account was created').toBe(0);
    // honesty note: if the public DTO rejected the body for an unrelated field this proves only that no purchase happened, not that the reservation rule fired - see the observation text
  });

  test('[DPQA-RSV-004] a brand-new customer cannot select the reserved plan, and onboarding another customer onto it is refused', async ({ request }) => {
    const nc = await papi(request, 'POST', '/super-admin/customers', { companyName: `QA Rsv Probe ${run}`, primaryContactFirstName: 'Qa', primaryContactLastName: 'Probe', primaryContactEmail: `rsv-new-${run}@qa.dijipeople.test`, country: 'Qatar', industry: 'Technology', companySize: '11-50', selectedPlanId: reserved.id, preferredBillingCycle: 'MONTHLY' });
    expect(nc.status, JSON.stringify(nc.body).slice(0, 200)).toBeGreaterThanOrEqual(400); expect(nc.status).toBeLessThan(500);
    // a customer created on an OPEN plan whose onboarding then names the reserved plan
    const slug = `qa-rsvon-${run}`;
    const r = await onboardTenant(request, reserved, slug, `QA Rsv Onb ${run}`);
    try { expect(r.status, `stage ${r.stage}: ${JSON.stringify(r.body).slice(0, 200)}`).toBeGreaterThanOrEqual(400); expect(r.status).toBeLessThan(500); } finally { await sql(`delete from "Tenant" where slug = $1 and status = 'PROVISIONING_FAILED'`, [slug]).catch(() => undefined); }
    expect((await sql(`select 1 from "Subscription" s join "Tenant" t on t.id = s."tenantId" where t.slug = $1`, [slug])).length, 'no subscription exists').toBe(0);
  });

  test('[DPQA-RSV-005] the ELIGIBLE customer\'s tenant can still be assigned the reserved plan, and a same-plan edit by the operator keeps working for its existing subscriber', async ({ request }) => {
    const a = await assignPlan(request, TENANTS.C.slug, reserved.id, {}, reserved.priceId);
    expect(a.status, JSON.stringify(a.body).slice(0, 240)).toBeLessThan(300);
    expect((await subscriptionOf(TENANTS.C.slug)).planId).toBe(reserved.id);
    const edit = await assignPlan(request, TENANTS.C.slug, reserved.id, { purchasedSeats: 3, billingCycle: 'MONTHLY' }, reserved.priceId);
    expect(edit.status, 'same-plan edit by an existing subscriber is not re-judged: ' + JSON.stringify(edit.body).slice(0, 200)).toBeLessThan(300);
    // the plan\'s window ends: the subscriber keeps editing (history preserved), new assignments are refused
    const end = await papi(request, 'PATCH', `/super-admin/plans/${reserved.id}`, { effectiveUntil: new Date(Date.now() - 86_400_000).toISOString() });
    expect(end.status, JSON.stringify(end.body).slice(0, 200)).toBeLessThan(300);
    const edit2 = await assignPlan(request, TENANTS.C.slug, reserved.id, { purchasedSeats: 4 }, reserved.priceId);
    expect(edit2.status, 'same-plan edit after the plan window ended').toBeLessThan(300);
    const openExpired = await createCustomPlan(request, ['employees'], { label: 'expired' });
    try {
      expect((await papi(request, 'PATCH', `/super-admin/plans/${openExpired.id}`, { effectiveUntil: new Date(Date.now() - 86_400_000).toISOString() })).status).toBeLessThan(300);
      const move = await assignPlan(request, TENANTS.A.slug, openExpired.id, {}, openExpired.priceId);
      expect(move.status, 'a MOVE onto an expired-window plan is refused').toBe(400);
      await unchanged(TENANTS.A.slug, savedA);
    } finally { await deleteCustomPlan(request, openExpired); }
  });

  test('[DPQA-RSV-006] operators can still assign a non-reserved Custom plan to any tenant (the rule does not over-block)', async ({ request }) => {
    const r = await assignPlan(request, TENANTS.B.slug, open.id, {}, open.priceId);
    expect(r.status, JSON.stringify(r.body).slice(0, 240)).toBeLessThan(300);
    expect((await subscriptionOf(TENANTS.B.slug)).planId).toBe(open.id);
    expect((await restoreSubscription(request, TENANTS.B.slug, savedB)).status).toBeLessThan(300);
    await unchanged(TENANTS.B.slug, savedB);
  });
});

test.describe('DP-QA-047 reassignment invalidates the entitlement snapshot', () => {
  test.skip(!platformConfigured() || !planTenantProvisioned('C'), 'NOT RUN: platform admin or the Custom tenant not configured');
  test.beforeEach(({}, i) => { test.skip(i.project.name !== 'chromium', 'database-level suite: runs once, on the chromium project'); });
  test.describe.configure({ mode: 'serial' });
  let withPayroll: CustomPlan; let without: CustomPlan; let saved: SubscriptionSnapshot; let owner: string;
  const DEVICE = { deviceFingerprint: 'qa-device-fingerprint-0008', deviceName: 'qa-device', os: 'Windows 11', platform: 'win32', agentVersion: '1.0.0' };
  const agentHdr = { 'X-DijiPeople-App': 'agent-desktop', 'content-type': 'application/json' };
  test.beforeAll(async ({ request }) => {
    withPayroll = await createCustomPlan(request, [...STARTER_FEATURES, 'payroll', 'desktop-agent'], { label: 'rev-on' });
    without = await createCustomPlan(request, [...STARTER_FEATURES], { label: 'rev-off' });
    saved = await subscriptionOf(TENANTS.C.slug); owner = await apiToken(request, 'C', 'OWNER');
  });
  test.afterAll(async ({ request }) => { await restoreSubscription(request, TENANTS.C.slug, saved).catch(() => undefined); await deleteCustomPlan(request, withPayroll); await deleteCustomPlan(request, without); });
  const flip = async (request: APIRequestContext, p: CustomPlan) => { const t = Date.now(); const r = await assignPlan(request, TENANTS.C.slug, p.id, {}, p.priceId); expect(r.status, JSON.stringify(r.body).slice(0, 200)).toBeLessThan(300); return Date.now() - t; };

  test('[DPQA-REV-001] four back-and-forth reassignments: a withdrawn module is refused and a granted one served on the FIRST check after the PATCH returns (no 60 s wait, no flip at the TTL)', async ({ request }, info) => {
    test.setTimeout(300_000);
    const log: string[] = [];
    await flip(request, withPayroll); expect(await probe(request, owner, 'payroll')).toBeLessThan(402);
    for (let i = 1; i <= 4; i++) {
      const patchMs = await flip(request, without);
      const t0 = Date.now(); const s1 = await probe(request, owner, 'payroll'); const lag = Date.now() - t0;
      log.push(`#${i} withdraw: PATCH ${patchMs} ms, first check ${s1} after ${lag} ms`);
      expect(refused(s1), `#${i} first check after withdrawal answered ${s1}`).toBe(true);
      await flip(request, withPayroll);
      const g1 = await probe(request, owner, 'payroll');
      log.push(`#${i} grant: first check ${g1}`);
      expect(g1, `#${i} first check after the grant`).toBeLessThan(402);
    }
    info.annotations.push({ type: 'measurement', description: log.join(' | ') });
  });

  test('[DPQA-REV-002] no stale grant re-appears: after a withdrawal every probe for 75 s (past the 30 s TTL and the old 60 s mark) stays refused', async ({ request }, info) => {
    test.setTimeout(240_000);
    await flip(request, withPayroll); expect(await probe(request, owner, 'payroll')).toBeLessThan(402);
    await flip(request, without);
    const seen: number[] = []; const t0 = Date.now();
    while (Date.now() - t0 < 75_000) { seen.push(await probe(request, owner, 'payroll')); await sleep(1_500); }
    info.annotations.push({ type: 'measurement', description: `${seen.length} probes over ${Date.now() - t0} ms, statuses ${[...new Set(seen)].join(',')}` });
    expect(seen.every(refused), `statuses ${seen.join(',')}`).toBe(true);
  });

  test('[DPQA-REV-003] concurrency: 8 workers hammer the module across the reassignment; every request STARTED after the PATCH returned is refused, none is a 5xx, and the grant direction is served from the first check', async ({ request }, info) => {
    test.setTimeout(240_000);
    await flip(request, withPayroll); expect(await probe(request, owner, 'payroll')).toBeLessThan(402);
    type Rec = { start: number; status: number };
    const recs: Rec[] = []; let stop = false;
    const worker = async () => { while (!stop) { const start = Date.now(); const status = await probe(request, owner, 'payroll'); recs.push({ start, status }); } };
    const workers = Array.from({ length: 8 }, worker);
    await sleep(1_500);
    await flip(request, without); const patchDone = Date.now();
    await sleep(6_000); stop = true; await Promise.all(workers);
    const after = recs.filter((r) => r.start >= patchDone);
    info.annotations.push({ type: 'measurement', description: `${recs.length} requests, ${after.length} started after the PATCH returned; statuses after: ${[...new Set(after.map((r) => r.status))].join(',')}; before: ${[...new Set(recs.filter((r) => r.start < patchDone).map((r) => r.status))].join(',')}` });
    expect(recs.filter((r) => r.status >= 500), 'no server error under concurrency').toEqual([]);
    expect(after.length, 'requests were in flight after the PATCH').toBeGreaterThan(8);
    expect(after.filter((r) => !refused(r.status)), 'a request that started after the PATCH was served the old snapshot').toEqual([]);
    // grant direction under concurrency
    const recs2: Rec[] = []; let stop2 = false;
    const worker2 = async () => { while (!stop2) { const start = Date.now(); const status = await probe(request, owner, 'payroll'); recs2.push({ start, status }); } };
    const ws = Array.from({ length: 8 }, worker2);
    await sleep(1_000); await flip(request, withPayroll); const granted = Date.now(); await sleep(5_000); stop2 = true; await Promise.all(ws);
    const after2 = recs2.filter((r) => r.start >= granted);
    expect(after2.filter((r) => r.status >= 500), 'no 5xx on the grant side').toEqual([]);
    expect(after2.filter((r) => refused(r.status)), 'a request started after the grant was still refused').toEqual([]);
  });

  test('[DPQA-REV-004] issued agent access token, refresh token and a NEW sign-in are all cut when the reassignment removes the agent; the ordinary web session keeps working', async ({ request }, info) => {
    test.setTimeout(240_000);
    await flip(request, withPayroll);
    const agentLogin = (email: string) => request.post(`${env.QA_API_URL}/api/agent/auth/login`, { headers: agentHdr, data: { email, password: env.QA_PASSWORD, ...DEVICE } });
    const emp = 'c-employee@qa.dijipeople.test';
    const li = await agentLogin(emp); expect(li.status(), 'agent sign-in while granted').toBeLessThan(300);
    const j = await li.json(); const access = j.accessToken ?? j.tokens?.accessToken; const refreshToken = j.refreshToken ?? j.tokens?.refreshToken;
    const read = (t: string) => request.get(`${env.QA_API_URL}/api/agent/settings`, { headers: { authorization: `Bearer ${t}`, 'X-DijiPeople-App': 'agent-desktop' } });
    expect((await read(access)).status(), 'token works while granted').toBe(200);
    const web = await apiToken(request, 'C', 'EMPLOYEE');
    await flip(request, without);
    const t0 = Date.now(); const cutAccess = (await read(access)).status();
    const cutMs = Date.now() - t0;
    const rf = await request.post(`${env.QA_API_URL}/api/agent/auth/refresh`, { headers: agentHdr, data: { refreshToken, deviceFingerprint: DEVICE.deviceFingerprint, agentVersion: DEVICE.agentVersion } });
    const again = await agentLogin(emp);
    info.annotations.push({ type: 'measurement', description: `first check after the PATCH: issued token ${cutAccess} (${cutMs} ms), refresh ${rf.status()}, new sign-in ${again.status()}` });
    expect([401, 403], 'issued access token').toContain(cutAccess);
    expect([401, 403], 'refresh token').toContain(rf.status());
    expect(again.status(), 'new sign-in').toBe(403);
    expect((await api(request, web, 'GET', '/leave-requests/mine')).status, 'web session still works').toBeLessThan(400);
    await flip(request, withPayroll);
    expect((await agentLogin(emp)).status(), 'the grant is honoured by a new sign-in at the first check').toBeLessThan(300);
  });

  test('[DPQA-REV-005] a brand-new web session after the reassignment sees only the new plan; other tenants are unaffected throughout', async ({ request }) => {
    test.setTimeout(240_000);
    await flip(request, without);
    const fresh = await request.post(`${env.QA_API_URL}/api/auth/login`, { headers: { 'X-DijiPeople-App': 'web' }, data: { email: credentials('C', 'OWNER').email, password: env.QA_PASSWORD, tenantSlug: TENANTS.C.slug } });
    expect(fresh.status()).toBeLessThan(300);
    const tok = (await fresh.json()); const t = tok.accessToken ?? tok.tokens?.accessToken;
    expect(refused(await probe(request, t, 'payroll')), 'new session on the new plan').toBe(true);
    const a = await apiToken(request, 'A', 'OWNER');
    expect(refused(await probe(request, a, 'payroll')), 'tenant A (Starter) never had payroll').toBe(true);
    expect((await probe(request, a, 'leave')), 'tenant A keeps its own entitlements').toBeLessThan(402);
    await flip(request, withPayroll);
    expect(await probe(request, t, 'payroll'), 'same session sees the grant at once').toBeLessThan(402);
    expect(refused(await probe(request, a, 'payroll')), 'tenant A still refused').toBe(true);
  });

  test('[DPQA-REV-006] a plan EDIT (feature removed) still takes effect promptly (RUN-007 baseline ~5 s) and the tenant-initiated immediate plan change path is exercised', async ({ request }, info) => {
    test.setTimeout(240_000);
    await flip(request, withPayroll); expect(await probe(request, owner, 'payroll')).toBeLessThan(402);
    const t0 = Date.now();
    const e = await papi(request, 'PATCH', `/super-admin/plans/${withPayroll.id}`, { featureKeys: [...STARTER_FEATURES, 'desktop-agent'] });
    expect(e.status).toBeLessThan(300);
    let ms = -1; while (Date.now() - t0 < 60_000) { if (refused(await probe(request, owner, 'payroll'))) { ms = Date.now() - t0; break; } await sleep(500); }
    info.annotations.push({ type: 'measurement', description: `plan edit -> refused after ${ms} ms` });
    expect(ms, 'plan edit propagation').toBeGreaterThan(-1); expect(ms).toBeLessThanOrEqual(30_000);
    await papi(request, 'PATCH', `/super-admin/plans/${withPayroll.id}`, { featureKeys: [...STARTER_FEATURES, 'payroll', 'desktop-agent'] });
    // tenant-initiated immediate change (upgrade) on tenant A: Starter -> Growth through /billing/plan-changes
    const aOwner = await apiToken(request, 'A', 'OWNER');
    const growth = (await sql<{ id: string; pid: string }>(`select p.id, pp.id as pid from "Plan" p join "PlanPrice" pp on pp."planId" = p.id where p.key = 'growth' and pp."isActive" and pp."billingCycle" = 'MONTHLY' and pp."marketId" is not distinct from (select cur."marketId" from "PlanPrice" cur join "Subscription" s on s."planPriceId" = cur.id join "Tenant" t on t.id = s."tenantId" where t.slug = '${TENANTS.A.slug}') order by (pp."billingModel" = 'FLAT') desc limit 1`))[0];
    const savedA = await subscriptionOf(TENANTS.A.slug);
    const r = await api(request, aOwner, 'POST', '/billing/plan-changes', { toPlanId: growth.id, toPlanPriceId: growth.pid });
    info.annotations.push({ type: 'observation', description: `tenant-initiated Starter->Growth plan-change -> ${r.status} ${JSON.stringify(r.body).slice(0, 200)}` });
    try {
      if (r.status < 300 && (await subscriptionOf(TENANTS.A.slug)).planId === growth.id) {
        expect(await probe(request, aOwner, 'timesheets'), 'upgrade honoured at the first check').toBeLessThan(402);
      } else {
        test.info().annotations.push({ type: 'not-run', description: `immediate tenant plan-change needs payment/Stripe state not present in the isolated stack (status ${r.status}); the cache flush after a tenant-initiated change is covered only by the candidate's unit tests` });
      }
    } finally { await restoreSubscription(request, TENANTS.A.slug, savedA).catch(() => undefined); }
  });
});

test.describe('DP-QA-005 deployment safeguards', () => {
  test.beforeEach(({}, i) => { test.skip(i.project.name !== 'chromium', 'process-level suite: runs once, on the chromium project'); test.skip(!worktree, 'NOT RUN: QA_API_WORKTREE not configured'); });
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const gate = (extra: Record<string, string>, node = 'production') => spawnSync(process.execPath, ['scripts/verify-entitlement-enforcement.mjs'], { cwd: worktree, env: { PATH: process.env.PATH ?? '', NODE_ENV: node, ...extra }, encoding: 'utf8' });

  test('[DPQA-GATE-001] the candidate\'s own gate test suite passes (npm run test:entitlement-gate)', async () => {
    const r = spawnSync(`${npm} run test:entitlement-gate`, { cwd: worktree, shell: true, encoding: 'utf8', timeout: 120_000 });
    expect(r.status, `${r.stdout}\n${r.stderr}`.slice(-1200)).toBe(0);
    expect(r.stdout).toMatch(/ℹ pass [1-9]\d*/); expect(r.stdout).toMatch(/ℹ fail 0/);
  });

  test('[DPQA-GATE-002] the release gate refuses a production release unless the floor is exactly ENFORCE; every non-ENFORCE value fails; the exception is explicit and loud', async () => {
    const cases: Array<[string, Record<string, string>, number]> = [
      ['unset', {}, 1], ['REPORT_ONLY', { ENTITLEMENT_ENFORCEMENT_MODE: 'REPORT_ONLY' }, 1], ['OFF', { ENTITLEMENT_ENFORCEMENT_MODE: 'OFF' }, 1], ['empty', { ENTITLEMENT_ENFORCEMENT_MODE: '' }, 1],
      ['lower-case enforce', { ENTITLEMENT_ENFORCEMENT_MODE: 'enforce' }, 1], ['ENFORCED (typo)', { ENTITLEMENT_ENFORCEMENT_MODE: 'ENFORCED' }, 1], ['ENFORCE with spaces trimmed', { ENTITLEMENT_ENFORCEMENT_MODE: ' ENFORCE ' }, 0],
      ['ENFORCE', { ENTITLEMENT_ENFORCEMENT_MODE: 'ENFORCE' }, 0],
      ['exception "true"', { ENTITLEMENT_ALLOW_UNENFORCED: 'true' }, 0], ['exception "1"', { ENTITLEMENT_ALLOW_UNENFORCED: '1' }, 1], ['exception "yes"', { ENTITLEMENT_ALLOW_UNENFORCED: 'yes' }, 1], ['exception "TRUE"', { ENTITLEMENT_ALLOW_UNENFORCED: 'TRUE' }, 1],
      ['exception does not bless a wrong mode silently', { ENTITLEMENT_ENFORCEMENT_MODE: 'REPORT_ONLY', ENTITLEMENT_ALLOW_UNENFORCED: 'true' }, 0],
    ];
    const lines: string[] = [];
    for (const [name, e, code] of cases) {
      const r = gate(e); lines.push(`${name}: exit ${r.status}`);
      expect(r.status, `${name}: ${r.stdout}${r.stderr}`).toBe(code);
      if (code === 1) expect(r.stderr, `${name}: names the remedy`).toMatch(/ENTITLEMENT_ENFORCEMENT_MODE=ENFORCE/);
      if (name.startsWith('exception "true"') || name.includes('does not bless')) { expect(r.stderr, `${name}: the exception prints a warning`).toMatch(/ACKNOWLEDGED_UNENFORCED[\s\S]*ENTITLEMENT_ALLOW_UNENFORCED=true/); }
    }
    for (const nodeEnv of ['development', 'test', '']) expect(gate({}, nodeEnv).status, `non-production (${nodeEnv || 'unset'}) is not gated`).toBe(0);
    test.info().annotations.push({ type: 'evidence', description: lines.join('; ') });
  });

  test('[DPQA-GATE-003] `npm --workspace api run release` stops at the gate BEFORE any migration or seed when production is unenforced, and proceeds past the gate only with the explicit exception', async () => {
    const base: Record<string, string> = { ...(process.env as Record<string, string>), NODE_ENV: 'production', DATABASE_URL: 'postgresql://qa:qa@127.0.0.1:1/qa_unreachable_test?connect_timeout=2' };
    delete base.ENTITLEMENT_ENFORCEMENT_MODE; delete base.ENTITLEMENT_ALLOW_UNENFORCED; delete base.DIRECT_DATABASE_URL;
    const blocked = spawnSync(`${npm} --workspace api run release`, { cwd: worktree, shell: true, env: base, encoding: 'utf8', timeout: 120_000 });
    const out = `${blocked.stdout}\n${blocked.stderr}`;
    expect(blocked.status, out.slice(-800)).not.toBe(0);
    expect(out).toMatch(/NOT_ENFORCED/);
    expect(out, 'nothing after the gate ran (no migrate script header, no Prisma output)').not.toMatch(/> api@[\d.]+ (prisma:migrate:deploy|seed:config)|Prisma schema loaded|Applying migration|Datasource|P1001/i);
    // with the exception the chain gets past the gate (and then fails on the unreachable database, which proves it was released to run)
    const excepted = spawnSync(`${npm} --workspace api run release`, { cwd: worktree, shell: true, env: { ...base, ENTITLEMENT_ALLOW_UNENFORCED: 'true' }, encoding: 'utf8', timeout: 180_000 });
    const out2 = `${excepted.stdout}\n${excepted.stderr}`;
    expect(out2, 'warning is printed').toMatch(/ACKNOWLEDGED_UNENFORCED/);
    expect(out2, 'the pipeline moved on to migrations').toMatch(/prisma|migrat|P1001|Can't reach database/i);
    const enforced = spawnSync(`${npm} --workspace api run release`, { cwd: worktree, shell: true, env: { ...base, ENTITLEMENT_ENFORCEMENT_MODE: 'ENFORCE' }, encoding: 'utf8', timeout: 180_000 });
    expect(`${enforced.stdout}${enforced.stderr}`).toMatch(/ENFORCED/);
  });

  test('[DPQA-GATE-004] the production deploy configuration is wired to the gate (static)', async () => {
    const pkg = JSON.parse(readFileSync(join(worktree, 'services/api/package.json'), 'utf8'));
    expect(pkg.scripts.release.startsWith('node ../../scripts/verify-entitlement-enforcement.mjs && '), 'the gate is the FIRST step of release').toBe(true);
    const render = readFileSync(join(worktree, 'render.yaml'), 'utf8');
    expect(render).toMatch(/preDeployCommand:\s*npm --workspace api run release/);
    expect(render).toMatch(/key:\s*ENTITLEMENT_ENFORCEMENT_MODE/);
    expect(readFileSync(join(worktree, 'docs/environment-variables.md'), 'utf8')).toMatch(/ENTITLEMENT_ENFORCEMENT_MODE/);
  });

  test('[DPQA-GATE-005] /api/health on the RUNNING (enforced) API reports the effective mode accurately on all three health routes and leaks nothing else', async ({ request }) => {
    for (const path of ['/api/health', '/api', '/']) {
      const r = await request.get(`${env.QA_API_URL}${path}`);
      expect(r.status(), path).toBe(200);
      const b = await r.json();
      expect(b.entitlementEnforcement, path).toEqual({ mode: 'ENFORCE', enforced: true });
      expect(JSON.stringify(b), `${path}: no secrets in health`).not.toMatch(/secret|password|token|postgres(ql)?:\/\//i);
    }
    // the effective mode is also what the guard does: a Starter tenant is refused a module its plan does not include
    const a = await apiToken(request, 'A', 'OWNER');
    expect(refused(await probe(request, a, 'recruitment')), 'Starter refused recruitment').toBe(true);
  });

  test('[DPQA-GATE-006] smoke:deployment passes its enforcement checks against the ENFORCED API, as reported by the running service', async () => {
    const r = spawnSync(process.execPath, ['scripts/smoke-deployment.mjs'], { cwd: worktree, encoding: 'utf8', timeout: 120_000, env: { PATH: process.env.PATH ?? '', SMOKE_API_BASE_URL: `${env.QA_API_URL}/api`, SMOKE_ORIGIN: tenantUrl('A', ''), SMOKE_STARTER_LOGIN_EMAIL: credentials('A', 'OWNER').email, SMOKE_STARTER_LOGIN_PASSWORD: env.QA_PASSWORD, SMOKE_LOGIN_EMAIL: credentials('A', 'OWNER').email, SMOKE_LOGIN_PASSWORD: env.QA_PASSWORD } });
    const out = `${r.stdout}\n${r.stderr}`;
    test.info().annotations.push({ type: 'evidence', description: out.split('\n').filter((l) => /enforced|Starter/i.test(l)).join(' | ') });
    expect(out).toMatch(/^ok - plan entitlements are enforced/m);
    expect(out).not.toMatch(/^not ok - plan entitlements are enforced/m);
  });

  test('[DPQA-GATE-008] the smoke Starter behavioural probe (SMOKE_STARTER_LOGIN_*) can actually sign in and proves a Starter tenant is refused a paid module', async () => {
    const r = spawnSync(process.execPath, ['scripts/smoke-deployment.mjs'], { cwd: worktree, encoding: 'utf8', timeout: 120_000, env: { PATH: process.env.PATH ?? '', SMOKE_API_BASE_URL: `${env.QA_API_URL}/api`, SMOKE_ORIGIN: tenantUrl('A', ''), SMOKE_STARTER_LOGIN_EMAIL: credentials('A', 'OWNER').email, SMOKE_STARTER_LOGIN_PASSWORD: env.QA_PASSWORD } });
    const out = `${r.stdout}\n${r.stderr}`;
    test.info().annotations.push({ type: 'evidence', description: out.split('\n').filter((l) => /Starter/i.test(l)).join(' | ') });
    expect(out, 'Starter behavioural probe ran and passed (DP-QA-048: the probe posts no tenant context, so /auth/login answers AUTH_UNAUTHORIZED, Company or tenant context is required)').toMatch(/^ok - a Starter tenant is refused a module its plan does not include/m);
  });

  test('[DPQA-GATE-007] the not-enforced phase (out of band, API started without the floor on a database with no setting row) failed the smoke check and printed the warning under the exception', async () => {
    let txt = '';
    try { txt = readFileSync(join(__dirname, '../../../docs/qa/go-live/evidence/RUN008-gate-unenforced.md'), 'utf8'); } catch { test.skip(true, 'NOT RUN: evidence/RUN008-gate-unenforced.md missing (run tools/gate-phase.mjs unenforced against an API started with restart-api.ps1 -NoEnforce)'); }
    expect(txt).toMatch(/"mode": "REPORT_ONLY"[\s\S]*"enforced": false/);
    expect(txt).toMatch(/not ok - plan entitlements are enforced, not merely logged: entitlement enforcement is REPORT_ONLY/);
    expect(txt).toMatch(/allowed by SMOKE_ALLOW_UNENFORCED=1/);
  });
});

test.describe('SEC-020 invitation activation: 8-way concurrency and replay (DP-QA-027 retest at higher concurrency)', () => {
  test.beforeEach(({}, i) => { test.skip(i.project.name !== 'chromium', 'API-level suite: runs once, on the chromium project'); });
  const hdr = { 'X-DijiPeople-App': 'web' };
  test('[DPQA-SEC-020] eight simultaneous activations with ONE invitation token: exactly one wins, no server error, replays with new passwords are refused, only the winner password signs in', async ({ request }, info) => {
    test.setTimeout(300_000);
    const owner = await apiToken(request, 'A', 'OWNER');
    const rel = (await api(request, owner, 'GET', '/lookups/relation-types')).body;
    const email = `sec20-${run}@qa.dijipeople.test`;
    await mail.clear();
    const e = await api(request, owner, 'POST', '/employees', { firstName: 'Sec', lastName: 'Twenty', workEmail: email, hireDate: '2025-02-03', employmentStatus: 'ACTIVE', phone: '+97455500041', emergencyContactName: 'X Y', emergencyContactRelationTypeId: (Array.isArray(rel) ? rel : rel.items)[0].id, emergencyContactPhone: '+97455500042', provisionSystemAccess: true, sendInvitationNow: true });
    expect(e.status, JSON.stringify(e.body).slice(0, 200)).toBeLessThan(300);
    try {
      const token = mail.token(await mail.waitFor(email, /activate|invit|welcome/i, 60_000));
      const pws = Array.from({ length: 8 }, (_, i) => `Act${i}!${run}Zz9t`);
      const t0 = Date.now();
      const rs = await Promise.all(pws.map((password) => request.post(`${env.QA_API_URL}/api/auth/activate-account`, { headers: hdr, data: { token, password } })));
      const elapsed = Date.now() - t0;
      const codes = rs.map((r) => r.status());
      info.annotations.push({ type: 'measurement', description: `8 concurrent activations took ${elapsed} ms; statuses ${codes.join(',')}` });
      const winners = rs.map((r, i) => ({ s: r.status(), pw: pws[i] })).filter((x) => x.s < 300);
      expect(winners.length, 'exactly one activation wins: ' + codes.join(',')).toBe(1);
      expect(codes.filter((c) => c >= 500), 'no server error among the losers').toEqual([]);
      for (const pw of [`Replay1!${run}Zz9t`, `Replay2!${run}Zz9t`, winners[0].pw]) {
        const rp = await request.post(`${env.QA_API_URL}/api/auth/activate-account`, { headers: hdr, data: { token, password: pw } });
        expect(rp.status(), 'replay after activation').toBeGreaterThanOrEqual(400);
      }
      const ok = await request.post(`${env.QA_API_URL}/api/auth/login`, { headers: hdr, data: { email, password: winners[0].pw, tenantSlug: TENANTS.A.slug } });
      expect(ok.status(), 'the winner signs in').toBeLessThan(300);
      const loser = pws.find((p) => p !== winners[0].pw)!;
      const bad = await request.post(`${env.QA_API_URL}/api/auth/login`, { headers: hdr, data: { email, password: loser, tenantSlug: TENANTS.A.slug } });
      expect(bad.status(), 'a losing password does not sign in').toBe(401);
    } finally { await api(request, owner, 'DELETE', `/employees/${e.body.id}`); }
  });
});
