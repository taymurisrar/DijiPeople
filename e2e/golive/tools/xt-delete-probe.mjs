// Probe: tenant A owner DELETEs (a) a tenant-B employee id, (b) a random uuid. Compare responses and B's state.
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../../../.env.qa.local', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const api = env.QA_API_URL + '/api';
const login = async (email, slug) => { const r = await (await fetch(api + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'X-DijiPeople-App': 'web' }, body: JSON.stringify({ email, password: env.QA_PASSWORD, tenantSlug: slug }) })).json(); return r.accessToken ?? r.tokens?.accessToken; };
const A = await login(env.QA_TENANT_A_OWNER, env.QA_TENANT_A_SLUG);
const B = await login(env.QA_TENANT_B_OWNER, env.QA_TENANT_B_SLUG);
const h = (t) => ({ authorization: `Bearer ${t}`, 'X-DijiPeople-App': 'web' });
const bList = await (await fetch(api + '/employees?pageSize=100', { headers: h(B) })).json();
const target = bList.items[0].id;
for (const [label, id] of [['B employee', target], ['random uuid', '11111111-2222-4333-8444-555555555555']]) {
  const r = await fetch(`${api}/employees/${id}`, { method: 'DELETE', headers: h(A) });
  console.log(label, r.status, (await r.text()).slice(0, 200));
}
const after = await (await fetch(`${api}/employees/${target}`, { headers: h(B) })).json();
console.log('B record after:', after.id === target ? 'STILL EXISTS' : JSON.stringify(after).slice(0, 120));
