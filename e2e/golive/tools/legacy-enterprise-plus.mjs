// Prepares and captures LEGACY `enterprise-plus` data for the migration regression (MIG-*). Usage (from e2e/):
//   node golive/tools/legacy-enterprise-plus.mjs prepare <legacyDatabaseUrl> <slugWithAgentGrant> <slugWithoutGrant>
//   node golive/tools/legacy-enterprise-plus.mjs capture <legacyDatabaseUrl>        -> golive-results/${RUN}/legacy-baseline.json
// Run BEFORE the candidate's `migrate deploy` / seed, on a COPY of the RUN-006 database (never on a shared database; the URL must be a local `_test` / `_legacy_test` database).
// `prepare` puts two tenants on the legacy `enterprise-plus` plan exactly as the old platform did: one with an explicit CUSTOM desktop-agent grant (a contractual entitlement), one without.
// `capture` records, per tenant on enterprise-plus: plan key, price, dates, status and the EFFECTIVE feature set (plan features, overridden by tenant features). No secrets are read.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { Client } = createRequire(import.meta.url)('pg');

const RUN = process.env.QA_RUN ?? 'run007'; // RUN-008: QA_RUN=run008 keeps earlier runs' baselines untouched
const [mode, url, withGrant, withoutGrant] = process.argv.slice(2);
if (!url || !/@(localhost|127\.0\.0\.1)[:/]/.test(url) || !/_(test|legacy_test)\b/.test(url)) throw new Error('refusing: not a local throwaway test database');
const pg = new Client({ connectionString: url }); await pg.connect();

async function planId(key) { return (await pg.query('select id from "Plan" where key = $1', [key])).rows[0]?.id; }

if (mode === 'prepare') {
  const ep = await planId('enterprise-plus');
  if (!ep) throw new Error('legacy plan enterprise-plus is not in this database: it is not a pre-migration copy');
  for (const slug of [withGrant, withoutGrant].filter((s) => s && s !== '-')) { // '-' = no second customer (single-customer conversion case)
    const t = (await pg.query('select id from "Tenant" where slug = $1', [slug])).rows[0];
    if (!t) throw new Error(`tenant ${slug} not found`);
    await pg.query('update "Subscription" set "planId" = $2, "planPriceId" = null where "tenantId" = $1', [t.id, ep]);
    await pg.query(`delete from "TenantFeature" where "tenantId" = $1 and key = any($2)`, [t.id, ['desktop-agent', 'email-white-label']]);
  }
  const g = (await pg.query('select id from "Tenant" where slug = $1', [withGrant])).rows[0].id;
  await pg.query(`insert into "TenantFeature" (id, "tenantId", key, "isEnabled", source, "createdAt", "updatedAt") values (gen_random_uuid()::text, $1, 'desktop-agent', true, 'CUSTOM'::"TenantFeatureSource", now(), now())`, [g]);
  // Historical commercial records, as the legacy platform would have left them: a priced legacy plan, subscriptions tied to that price, and one paid invoice + one succeeded payment per legacy tenant.
  // Inserted into the throwaway COPY only. RUN-007 owner: "populated historical fixtures, including plan prices, subscriptions, invoices, payments and entitlement grants".
  let price = (await pg.query('select id from "PlanPrice" where "planId" = $1 order by "createdAt" limit 1', [ep])).rows[0]?.id;
  if (!price) {
    price = (await pg.query(`insert into "PlanPrice" (id, "planId", "billingCycle", currency, "unitAmount", "isActive", "createdAt", "updatedAt") values (gen_random_uuid()::text, $1, 'MONTHLY'::"BillingCycle", 'USD', 49, true, now(), now()) returning id`, [ep])).rows[0].id;
    await pg.query(`insert into "PlanPrice" (id, "planId", "billingCycle", currency, "unitAmount", "isActive", "createdAt", "updatedAt") values (gen_random_uuid()::text, $1, 'ANNUAL'::"BillingCycle", 'USD', 490, true, now(), now())`, [ep]);
  }
  for (const slug of [withGrant, withoutGrant].filter((s) => s && s !== '-')) {
    const t = (await pg.query('select s.id as sid, s."tenantId" as tid from "Subscription" s join "Tenant" t on t.id = s."tenantId" where t.slug = $1', [slug])).rows[0];
    await pg.query(`update "Subscription" set "planPriceId" = $2, "basePrice" = 49, "finalPrice" = 49, currency = 'USD', "billingCycle" = 'MONTHLY'::"BillingCycle" where id = $1`, [t.sid, price]);
    const iv = (await pg.query(`insert into "Invoice" (id, "tenantId", "subscriptionId", "invoiceNumber", amount, currency, "issueDate", "dueDate", status, total, "amountPaid", "amountDue", "paidAt", "createdAt", "updatedAt") values (gen_random_uuid()::text, $1, $2, $3, 49, 'USD', now() - interval '40 days', now() - interval '26 days', 'PAID'::"InvoiceStatus", 49, 49, 0, now() - interval '39 days', now(), now()) on conflict ("tenantId", "invoiceNumber") do update set "updatedAt" = now() returning id`, [t.tid, t.sid, `LEG-${slug}-0001`])).rows[0].id;
    if (!(await pg.query('select 1 from "Payment" where "invoiceId" = $1', [iv])).rowCount)
      await pg.query(`insert into "Payment" (id, "tenantId", "subscriptionId", "invoiceId", amount, currency, "paymentMethod", status, "paidAt", "createdAt", "updatedAt") values (gen_random_uuid()::text, $1, $2, $3, 49, 'USD', 'MANUAL'::"PaymentMethod", 'SUCCEEDED'::"PaymentStatus", now() - interval '39 days', now(), now())`, [t.tid, t.sid, iv]);
  }
  console.log(`prepared: ${withGrant} (explicit agent grant) and ${withoutGrant} (no grant) are on enterprise-plus, with a plan price, an invoice and a payment each`);
} else if (mode === 'capture') {
  const rows = (await pg.query(`select t.slug, p.key as "planKey", s.status::text as status, s."billingCycle"::text as cycle, s."basePrice"::text as "basePrice", s."finalPrice"::text as "finalPrice", s.currency, s."startDate"::text as "startDate", s."endDate"::text as "endDate", s."tenantId", s."planId", s.id as "subscriptionId"
      from "Subscription" s join "Tenant" t on t.id = s."tenantId" join "Plan" p on p.id = s."planId" where p.key = 'enterprise-plus' order by t.slug`)).rows;
  const out = [];
  for (const r of rows) {
    const plan = (await pg.query('select "featureKey" from "PlanFeature" where "planId" = $1 and "isEnabled"', [r.planId])).rows.map((x) => x.featureKey);
    const tf = (await pg.query('select key, "isEnabled", source::text as source from "TenantFeature" where "tenantId" = $1', [r.tenantId])).rows;
    const effective = new Set(plan);
    for (const f of tf) f.isEnabled ? effective.add(f.key) : effective.delete(f.key);
    const explicit = tf.filter((f) => f.source === 'CUSTOM' && f.isEnabled).map((f) => f.key).sort();
    // history counts, so MIG-006 can prove the conversion lost nothing (a table that does not exist is simply not counted)
    const count = async (table) => { try { return Number((await pg.query(`select count(*)::int as n from "${table}" where "tenantId" = $1`, [r.tenantId])).rows[0].n); } catch { return undefined; } };
    const { tenantId, planId: legacyPlanId, ...rest } = r;
    const priceIds = (await pg.query('select id from "PlanPrice" where "planId" = $1 order by id', [r.planId])).rows.map((x) => x.id);
    out.push({ ...rest, legacyPlanId, priceIds, planPriceId: (await pg.query('select "planPriceId" as p from "Subscription" where id = $1', [r.subscriptionId])).rows[0].p, invoiceCount: await count('Invoice'), paymentCount: await count('Payment'), effective: [...effective].sort(), explicitGrants: explicit });
  }
  const file = withGrant || 'legacy-baseline.json'; // optional 3rd argument: output file name (several legacy copies are captured in RUN-007)
  mkdirSync(`golive-results/${RUN}`, { recursive: true });
  writeFileSync(`golive-results/${RUN}/${file}`, JSON.stringify(out, null, 2));
  console.log(`captured ${out.length} tenant(s) on enterprise-plus -> golive-results/${RUN}/${file}`);
} else throw new Error('mode must be prepare|capture');
await pg.end();
