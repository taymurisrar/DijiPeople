// DP-QA-007 measurement: wall-clock of POST /auth/logout on a DISPOSABLE user (logout revokes all of a user's sessions, so shared role users are never used).
// Usage: node logout-latency-probe.mjs   (reads .env.qa.local; local only - the DB guard in fixtures refuses non-test databases)
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../../../.env.qa.local', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]));
if (!/localhost|127\.0\.0\.1/.test(env.QA_API_URL)) throw new Error('refusing: not a local API');
const H = { 'X-DijiPeople-App': 'web', 'content-type': 'application/json' };
const call = async (m, p, b, t) => { const r = await fetch(`${env.QA_API_URL}/api${p}`, { method: m, headers: { ...H, ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json(); } catch {} return { s: r.status, j }; };
const login = (email, password, slug) => call('POST', '/auth/login', { email, password, tenantSlug: slug });
const slug = env.QA_TENANT_A_SLUG; const run = Date.now().toString(36);
const o = await login(env.QA_TENANT_A_OWNER, env.QA_PASSWORD, slug); const ot = o.j.accessToken ?? o.j.tokens?.accessToken;
const rel = (await call('GET', '/lookups/relation-types', null, ot)).j; const relId = (Array.isArray(rel) ? rel : rel.items)[0].id;
const email = `lat-${run}@qa.dijipeople.test`; const password = `Lat!${run}Zz9a`;
const e = await call('POST', '/employees', { firstName: 'Lat', lastName: run, workEmail: email, hireDate: '2025-02-03', employmentStatus: 'ACTIVE', phone: '+97455500001', emergencyContactName: 'X Y', emergencyContactRelationTypeId: relId, emergencyContactPhone: '+97455500002' }, ot);
const u = await call('POST', '/users', { firstName: 'Lat', lastName: run, email, password, status: 'ACTIVE', employeeId: e.j.id }, ot);
if (u.s >= 300) throw new Error('user create ' + u.s);
const times = [];
for (let i = 0; i < 6; i++) {
  const l = await login(email, password, slug); const t = l.j.accessToken ?? l.j.tokens?.accessToken; const rt = l.j.refreshToken ?? l.j.tokens?.refreshToken;
  const t0 = performance.now(); const r = await fetch(`${env.QA_API_URL}/api/auth/logout`, { method: 'POST', headers: { ...H, authorization: `Bearer ${t}` }, body: JSON.stringify(rt ? { refreshToken: rt } : {}) }); await r.text();
  times.push({ status: r.status, ms: Math.round(performance.now() - t0) });
}
console.log(JSON.stringify(times));
await call('DELETE', `/employees/${e.j.id}`, null, ot);

