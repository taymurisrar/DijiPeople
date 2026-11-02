// Re-submits create-tenant for an EXISTING onboarding record (the operator recovery path after a refused create, e.g. once a Custom plan price is published).
// Usage (from e2e/): node golive/tools/create-tenant-retry.mjs <slug> "<Company Name>" <planKey>   Local isolated API only (guarded).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { Client } = createRequire(import.meta.url)('pg');
const env = Object.fromEntries(readFileSync(new URL('../../../.env.qa.local', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
if (!/^http:\/\/localhost:\d+$/.test(env.QA_API_URL)) throw new Error('refusing: QA_API_URL not localhost');
if (!/@localhost[:/]/.test(env.QA_DATABASE_URL) || !/_(test|ci|scratch|tmp|ephemeral)/.test(env.QA_DATABASE_URL)) throw new Error('refusing: not a local throwaway test database');
const [slug, company, planKey] = process.argv.slice(2);
const api = env.QA_API_URL + '/api';
const H = { 'content-type': 'application/json', 'X-DijiPeople-App': 'admin' };
const pg = new Client({ connectionString: env.QA_DATABASE_URL }); await pg.connect();
const onb = (await pg.query(`select id from "CustomerOnboarding" where "plannedTenantSlug" = $1 order by "createdAt" desc limit 1`, [slug])).rows[0];
const plan = (await pg.query('select id from "Plan" where key = $1', [planKey])).rows[0];
await pg.end();
const login = await (await fetch(api + '/admin/auth/login', { method: 'POST', headers: H, body: JSON.stringify({ email: env.QA_PLATFORM_EMAIL, password: env.QA_PLATFORM_PASSWORD }) })).json();
const token = login.accessToken ?? login.tokens?.accessToken;
const r = await fetch(`${api}/super-admin/customer-onboarding/${onb.id}/create-tenant`, { method: 'POST', headers: { ...H, authorization: `Bearer ${token}` }, body: JSON.stringify({ tenantName: company, slug, planId: plan.id, billingCycle: 'MONTHLY' }) });
console.log(`create-tenant (retry) -> ${r.status}`, (await r.text()).slice(0, 240));
