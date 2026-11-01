// Prepares and captures LEGACY `enterprise-plus` data for the migration regression (MIG-*). Usage (from e2e/):
//   node golive/tools/legacy-enterprise-plus.mjs prepare <legacyDatabaseUrl> <slugWithAgentGrant> <slugWithoutGrant>
//   node golive/tools/legacy-enterprise-plus.mjs capture <legacyDatabaseUrl>        -> golive-results/run007/legacy-baseline.json
// Run BEFORE the candidate's `migrate deploy` / seed, on a COPY of the RUN-006 database (never on a shared database; the URL must be a local `_test` / `_legacy_test` database).
// `prepare` puts two tenants on the legacy `enterprise-plus` plan exactly as the old platform did: one with an explicit CUSTOM desktop-agent grant (a contractual entitlement), one without.
// `capture` records, per tenant on enterprise-plus: plan key, price, dates, status and the EFFECTIVE feature set (plan features, overridden by tenant features). No secrets are read.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { Client } = createRequire(import.meta.url)('pg');

const [mode, url, withGrant, withoutGrant] = process.argv.slice(2);
if (!url || !/@(localhost|127\.0\.0\.1)[:/]/.test(url) || !/_(test|legacy_test)\b/.test(url)) throw new Error('refusing: not a local throwaway test database');
const pg = new Client({ connectionString: url }); await pg.connect();

async function planId(key) { return (await pg.query('select id from "Plan" where key = $1', [key])).rows[0]?.id; }

if (mode === 'prepare') {
  const ep = await planId('enterprise-plus');
  if (!ep) throw new Error('legacy plan enterprise-plus is not in this database: it is not a pre-migration copy');
  for (const slug of [withGrant, withoutGrant]) {
    const t = (await pg.query('select id from "Tenant" where slug = $1', [slug])).rows[0];
    if (!t) throw new Error(`tenant ${slug} not found`);
    await pg.query('update "Subscription" set "planId" = $2, "planPriceId" = null where "tenantId" = $1', [t.id, ep]);
    await pg.query(`delete from "TenantFeature" where "tenantId" = $1 and key = any($2)`, [t.id, ['desktop-agent', 'email-white-label']]);
  }
  const g = (await pg.query('select id from "Tenant" where slug = $1', [withGrant])).rows[0].id;
  await pg.query(`insert into "TenantFeature" (id, "tenantId", key, "isEnabled", source, "createdAt", "updatedAt") values (gen_random_uuid()::text, $1, 'desktop-agent', true, 'CUSTOM'::"TenantFeatureSource", now(), now())`, [g]);
  console.log(`prepared: ${withGrant} (explicit agent grant) and ${withoutGrant} (no grant) are on enterprise-plus`);
} else if (mode === 'capture') {
  const rows = (await pg.query(`select t.slug, p.key as "planKey", s.status::text as status, s."billingCycle"::text as cycle, s."basePrice"::text as "basePrice", s."finalPrice"::text as "finalPrice", s.currency, s."startDate"::text as "startDate", s."endDate"::text as "endDate", s."tenantId", s."planId"
      from "Subscription" s join "Tenant" t on t.id = s."tenantId" join "Plan" p on p.id = s."planId" where p.key = 'enterprise-plus' order by t.slug`)).rows;
  const out = [];
  for (const r of rows) {
    const plan = (await pg.query('select "featureKey" from "PlanFeature" where "planId" = $1 and "isEnabled"', [r.planId])).rows.map((x) => x.featureKey);
    const tf = (await pg.query('select key, "isEnabled", source::text as source from "TenantFeature" where "tenantId" = $1', [r.tenantId])).rows;
    const effective = new Set(plan);
    for (const f of tf) f.isEnabled ? effective.add(f.key) : effective.delete(f.key);
    const explicit = tf.filter((f) => f.source === 'CUSTOM' && f.isEnabled).map((f) => f.key).sort();
    const { tenantId, planId: _p, ...rest } = r;
    out.push({ ...rest, effective: [...effective].sort(), explicitGrants: explicit });
  }
  mkdirSync('golive-results/run007', { recursive: true });
  writeFileSync('golive-results/run007/legacy-baseline.json', JSON.stringify(out, null, 2));
  console.log(`captured ${out.length} tenant(s) on enterprise-plus -> golive-results/run007/legacy-baseline.json`);
} else throw new Error('mode must be prepare|capture');
await pg.end();
