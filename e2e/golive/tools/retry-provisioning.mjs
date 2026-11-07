// Operator recovery for a tenant left PROVISIONING_FAILED (DP-QA-050): POST /platform/tenants/:id/operations/retry-provisioning.
// Usage (from e2e/): node golive/tools/retry-provisioning.mjs <slug>   Local isolated API only (guarded).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { Client } = createRequire(import.meta.url)('pg');
const env = Object.fromEntries(readFileSync(new URL('../../../.env.qa.local', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
if (!/^http:\/\/localhost:\d+$/.test(env.QA_API_URL)) throw new Error('refusing: QA_API_URL not localhost');
if (!/@localhost[:/]/.test(env.QA_DATABASE_URL) || !/_(test|ci|scratch|tmp|ephemeral)/.test(env.QA_DATABASE_URL)) throw new Error('refusing: not a local throwaway test database');
const slug = process.argv[2];
const api = env.QA_API_URL + '/api';
const H = { 'content-type': 'application/json', 'X-DijiPeople-App': 'admin' };
const pg = new Client({ connectionString: env.QA_DATABASE_URL });
await pg.connect();
const t = (await pg.query('select id, status::text as status from "Tenant" where slug = $1', [slug])).rows[0];
await pg.end();
const login = await (await fetch(api + '/admin/auth/login', { method: 'POST', headers: H, body: JSON.stringify({ email: env.QA_PLATFORM_EMAIL, password: env.QA_PLATFORM_PASSWORD }) })).json();
const token = login.accessToken ?? login.tokens?.accessToken;
const r = await fetch(`${api}/platform/tenants/${t.id}/operations/retry-provisioning`, { method: 'POST', headers: { ...H, authorization: `Bearer ${token}` }, body: JSON.stringify({ reason: 'QA fixture: retry after the Custom plan price was published' }) });
console.log(`tenant was ${t.status}; retry-provisioning -> ${r.status}`, (await r.text()).slice(0, 200));
