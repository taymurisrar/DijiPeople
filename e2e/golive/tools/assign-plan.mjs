// Assigns an existing plan to a tenant through the SUPPORTED platform API (PATCH /super-admin/tenants/:id/subscription).
// Usage (from e2e/): node golive/tools/assign-plan.mjs <tenantSlug> <planKey>
// Used by RUN-007 to put tenant C on its Custom plan: the candidate has no supported way to PUBLISH a plan price (ITEM-0018), and onboarding refuses an unpublished price,
// so the tenant is provisioned on Starter through onboarding and then moved to the Custom plan with its explicit price. Local isolated API only (guarded).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { Client } = createRequire(import.meta.url)('pg');
const env = Object.fromEntries(readFileSync(new URL('../../../.env.qa.local', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
if (!/^http:\/\/localhost:\d+$/.test(env.QA_API_URL)) throw new Error('refusing: QA_API_URL not localhost');
if (!/@localhost[:/]/.test(env.QA_DATABASE_URL) || !/_(test|ci|scratch|tmp|ephemeral)/.test(env.QA_DATABASE_URL)) throw new Error('refusing: not a local throwaway test database');
const [slug, planKey] = process.argv.slice(2);
if (!slug || !planKey) throw new Error('usage: assign-plan.mjs <tenantSlug> <planKey>');
const api = env.QA_API_URL + '/api';
const H = { 'content-type': 'application/json', 'X-DijiPeople-App': 'admin' };
const pg = new Client({ connectionString: env.QA_DATABASE_URL }); await pg.connect();
const tenant = (await pg.query('select id from "Tenant" where slug = $1', [slug])).rows[0];
const plan = (await pg.query('select id from "Plan" where key = $1', [planKey])).rows[0];
const price = (await pg.query(`select id from "PlanPrice" where "planId" = $1 and "billingCycle" = 'MONTHLY' and "isActive" order by "createdAt" desc limit 1`, [plan?.id])).rows[0];
await pg.end();
if (!tenant || !plan || !price) throw new Error(`not found: tenant=${!!tenant} plan=${!!plan} price=${!!price}`);
const login = await (await fetch(api + '/admin/auth/login', { method: 'POST', headers: H, body: JSON.stringify({ email: env.QA_PLATFORM_EMAIL, password: env.QA_PLATFORM_PASSWORD }) })).json();
const token = login.accessToken ?? login.tokens?.accessToken;
const r = await fetch(`${api}/super-admin/tenants/${tenant.id}/subscription`, { method: 'PATCH', headers: { ...H, authorization: `Bearer ${token}` }, body: JSON.stringify({ planId: plan.id, planPriceId: price.id, purchasedSeats: 1 }) });
console.log(`PATCH tenants/:id/subscription -> ${r.status}`, (await r.text()).slice(0, 300));
