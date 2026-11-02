// RUN-008: which request shape does /auth/login accept? (diagnoses the smoke:deployment Starter probe). Local only.
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../../../.env.qa.local', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
if (!/^http:\/\/localhost:\d+$/.test(env.QA_API_URL)) throw new Error('refusing');
const email = env.QA_TENANT_A_OWNER;
const variants = {
  'smoke shape (Origin only)': [{ Origin: 'http://qa-prov-a.localhost:3314' }, { email, password: env.QA_PASSWORD, rememberMe: false }],
  'Origin + X-DijiPeople-App web': [{ Origin: 'http://qa-prov-a.localhost:3314', 'X-DijiPeople-App': 'web' }, { email, password: env.QA_PASSWORD, rememberMe: false }],
  'X-DijiPeople-App web + tenantSlug': [{ 'X-DijiPeople-App': 'web' }, { email, password: env.QA_PASSWORD, tenantSlug: 'qa-prov-a' }],
  'Origin + app header + tenantSlug': [{ Origin: 'http://qa-prov-a.localhost:3314', 'X-DijiPeople-App': 'web' }, { email, password: env.QA_PASSWORD, tenantSlug: 'qa-prov-a' }],
};
for (const [k, [h, b]] of Object.entries(variants)) {
  const r = await fetch(env.QA_API_URL + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) });
  const t = await r.text(); console.log(k.padEnd(36), r.status, t.slice(0, 160).replace(/"accessToken":"[^"]+"/, '"accessToken":"<r>"'));
}
