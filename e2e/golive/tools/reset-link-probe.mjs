// Prints a LIVE password-reset link for a disposable local user (for exploring the reset page in the MCP browser). Local only.
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../../../.env.qa.local', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]));
if (!/localhost|127\.0\.0\.1/.test(env.QA_API_URL)) throw new Error('refusing: not a local API');
const H = { 'X-DijiPeople-App': 'web', 'content-type': 'application/json' };
const call = async (m, p, b, t) => { const r = await fetch(`${env.QA_API_URL}/api${p}`, { method: m, headers: { ...H, ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: b ? JSON.stringify(b) : undefined }); let j = null; try { j = await r.json(); } catch {} return { s: r.status, j }; };
const slug = env.QA_TENANT_A_SLUG; const run = Date.now().toString(36);
const o = await call('POST', '/auth/login', { email: env.QA_TENANT_A_OWNER, password: env.QA_PASSWORD, tenantSlug: slug }); const ot = o.j.accessToken ?? o.j.tokens?.accessToken;
const rel = (await call('GET', '/lookups/relation-types', null, ot)).j; const relId = (Array.isArray(rel) ? rel : rel.items)[0].id;
const email = `rl-${run}@qa.dijipeople.test`; const password = `Rl!${run}Zz9a`;
const e = await call('POST', '/employees', { firstName: 'Rl', lastName: run, workEmail: email, hireDate: '2025-02-03', employmentStatus: 'ACTIVE', phone: '+97455500001', emergencyContactName: 'X Y', emergencyContactRelationTypeId: relId, emergencyContactPhone: '+97455500002' }, ot);
await call('POST', '/users', { firstName: 'Rl', lastName: run, email, password, status: 'ACTIVE', employeeId: e.j.id }, ot);
await fetch(`http://127.0.0.1:8125/messages`, { method: 'DELETE' });
await call('POST', '/auth/forgot-password', { email, tenantSlug: slug });
let m = []; for (let i = 0; i < 30 && !m.length; i++) { await new Promise((r) => setTimeout(r, 1000)); m = await (await fetch(`http://127.0.0.1:8125/messages?to=${email}`)).json(); }
console.log(JSON.stringify({ email, employeeId: e.j.id, links: m[0]?.links }));
