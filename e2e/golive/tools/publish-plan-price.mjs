// Publishes (or withdraws) a Custom plan's MONTHLY price through the SUPPORTED platform API added for DP-QA-044:
//   POST /super-admin/plans/:planId/prices/:priceId/publish | unpublish
// Usage (from e2e/): node golive/tools/publish-plan-price.mjs <planKey> [publish|unpublish]
// RUN-008 replaces the RUN-007 workaround (provision on Starter, then reassign with assign-plan.mjs) with this call. Local isolated API only (guarded).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { Client } = createRequire(import.meta.url)('pg');
const env = Object.fromEntries(readFileSync(new URL('../../../.env.qa.local', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
if (!/^http:\/\/localhost:\d+$/.test(env.QA_API_URL)) throw new Error('refusing: QA_API_URL not localhost');
if (!/@localhost[:/]/.test(env.QA_DATABASE_URL) || !/_(test|ci|scratch|tmp|ephemeral)/.test(env.QA_DATABASE_URL)) throw new Error('refusing: not a local throwaway test database');
const [planKey, action = 'publish'] = process.argv.slice(2);
if (!planKey || !['publish', 'unpublish'].includes(action)) throw new Error('usage: publish-plan-price.mjs <planKey> [publish|unpublish]');
const api = env.QA_API_URL + '/api';
const H = { 'content-type': 'application/json', 'X-DijiPeople-App': 'admin' };
const pg = new Client({ connectionString: env.QA_DATABASE_URL }); await pg.connect();
const plan = (await pg.query('select id from "Plan" where key = $1', [planKey])).rows[0];
const price = (await pg.query(`select id, "publicationStatus" from "PlanPrice" where "planId" = $1 and "billingCycle" = 'MONTHLY' and "isActive" order by "createdAt" desc limit 1`, [plan?.id])).rows[0];
await pg.end();
if (!plan || !price) throw new Error(`not found: plan=${!!plan} price=${!!price}`);
const login = await (await fetch(api + '/admin/auth/login', { method: 'POST', headers: H, body: JSON.stringify({ email: env.QA_PLATFORM_EMAIL, password: env.QA_PLATFORM_PASSWORD }) })).json();
const token = login.accessToken ?? login.tokens?.accessToken;
const r = await fetch(`${api}/super-admin/plans/${plan.id}/prices/${price.id}/${action}`, { method: 'POST', headers: { ...H, authorization: `Bearer ${token}` } });
console.log(`price was ${price.publicationStatus}; POST .../${action} -> ${r.status}`, (await r.text()).slice(0, 200));
