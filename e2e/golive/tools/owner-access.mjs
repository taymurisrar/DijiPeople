// Gets a provisioned tenant's owner activated with the QA password, through the real activation API.
// Usage: node owner-access.mjs <slug>
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { Client } = createRequire(import.meta.url)('pg');
const env = Object.fromEntries(readFileSync(new URL('../../../.env.qa.local', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
if (!/@localhost[:/]/.test(env.QA_DATABASE_URL) || !/_(test|ci|scratch|tmp|ephemeral)/.test(env.QA_DATABASE_URL)) throw new Error('refusing: not a local throwaway test database');
const slug = process.argv[2];
const api = env.QA_API_URL + '/api';
const H = { 'content-type': 'application/json', 'X-DijiPeople-App': 'admin' };
const pg = new Client({ connectionString: env.QA_DATABASE_URL }); await pg.connect();
const { rows } = await pg.query('select id from "Tenant" where slug=$1', [slug]);
const tenantId = rows[0].id;
const login = await (await fetch(api + '/admin/auth/login', { method: 'POST', headers: H, body: JSON.stringify({ email: env.QA_PLATFORM_EMAIL, password: env.QA_PLATFORM_PASSWORD }) })).json();
const adminAuth = { ...H, authorization: `Bearer ${login.accessToken ?? login.tokens?.accessToken}` };
for (const status of ['PENDING_SETUP', 'ACTIVE']) {
  const s = await fetch(`${api}/platform/tenants/${tenantId}/status`, { method: 'POST', headers: adminAuth, body: JSON.stringify({ status, reason: 'QA fixture: activate isolated test tenant' }) });
  console.log('tenant status ->', status, s.status, s.ok ? '' : JSON.parse(await s.text()).message);
}
const r = await fetch(`${api}/super-admin/tenants/${tenantId}/owner/resend-activation`, { method: 'POST', headers: { ...H, authorization: `Bearer ${login.accessToken ?? login.tokens?.accessToken}` } });
const body = await r.json();
console.log('resend-activation', r.status, 'keys:', Object.keys(body).join(','), JSON.stringify(body).replace(/(token=)[^"&]+/g, '$1<redacted>').slice(0, 400));

const token = new URL(body.activationLink).searchParams.get('token');
const a = await fetch(api + '/auth/activate-account', { method: 'POST', headers: { 'content-type': 'application/json', 'X-DijiPeople-App': 'web' }, body: JSON.stringify({ token, password: env.QA_PASSWORD }) });
console.log('activate-account', a.status, (await a.text()).slice(0, 200));
process.exit(0);
