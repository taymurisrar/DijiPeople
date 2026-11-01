// Creates a Custom plan through the SUPPORTED platform API (POST /super-admin/plans + POST plans/:id/prices) so a tenant can be provisioned on it. Usage (from e2e/):
//   node golive/tools/create-custom-plan.mjs <planKey> <featureKey,featureKey,...> [monthlyPrice=25]
// Targets the isolated QA API only (guarded). Prints status codes, the plan id and key; never secrets. Idempotent: an existing plan with that key is reused and reported.
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../../../.env.qa.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
if (!/^http:\/\/localhost:\d+$/.test(env.QA_API_URL)) throw new Error('refusing: QA_API_URL not localhost');
const [key, features, monthly = '25'] = process.argv.slice(2);
if (!key || !features) throw new Error('usage: create-custom-plan.mjs <planKey> <featureKey,...> [monthlyPrice]');
const api = env.QA_API_URL + '/api';
const H = { 'content-type': 'application/json', 'X-DijiPeople-App': 'admin' };
async function call(method, path, body, token) {
  const r = await fetch(api + path, { method, headers: { ...H, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} -> ${r.status}`);
  return { status: r.status, json };
}
const login = await call('POST', '/admin/auth/login', { email: env.QA_PLATFORM_EMAIL, password: env.QA_PLATFORM_PASSWORD });
const token = login.json.accessToken ?? login.json.tokens?.accessToken;
if (!token) { console.error('no platform token'); process.exit(1); }
const list = (await call('GET', '/super-admin/plans', null, token)).json;
const existing = (Array.isArray(list) ? list : list.items).find((p) => p.key === key);
if (existing) { console.log(`reused existing plan ${key} id=${existing.id}`); process.exit(0); }
const m = Number(monthly);
const created = await call('POST', '/super-admin/plans', { key, name: `QA Custom ${key}`, description: 'QA custom plan (throwaway)', isActive: true, monthlyBasePrice: m, annualBasePrice: m * 10, currency: 'USD', featureKeys: features.split(',') }, token);
if (created.status >= 300) { console.error(JSON.stringify(created.json).slice(0, 500)); process.exit(1); }
const id = created.json.id ?? created.json.plan?.id;
const price = await call('POST', `/super-admin/plans/${id}/prices`, { billingCycle: 'MONTHLY', currency: 'USD', unitAmount: m, syncToStripe: false, isActive: true }, token);
if (price.status >= 300) { console.error(JSON.stringify(price.json).slice(0, 500)); process.exit(1); }
console.log(`created custom plan ${key} id=${id}`);
