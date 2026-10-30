// Creates one linked employee + user per base role in a tenant, through the tenant's own admin API (the owner signs in).
// Usage: node seed-role-users.mjs <slug> <ownerEmail> [prefix]
// Emails: <prefix>-<role>@qa.dijipeople.test, password QA_PASSWORD. Idempotent for users that already exist.
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../../../.env.qa.local', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
if (!/^http:\/\/localhost:\d+$/.test(env.QA_API_URL)) throw new Error('refusing: not localhost');
const [slug, ownerEmail, prefix = slug] = process.argv.slice(2);
const api = env.QA_API_URL + '/api';
const H = { 'content-type': 'application/json', 'X-DijiPeople-App': 'web' };
const login = await (await fetch(api + '/auth/login', { method: 'POST', headers: H, body: JSON.stringify({ email: ownerEmail, password: env.QA_PASSWORD, tenantSlug: slug }) })).json();
const token = login.accessToken ?? login.tokens?.accessToken;
if (!token) throw new Error('owner login failed: ' + login.message);
const A = { ...H, authorization: `Bearer ${token}` };
const call = async (m, p, b) => {
  const r = await fetch(api + p, { method: m, headers: A, body: b ? JSON.stringify(b) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  if (!r.ok) { console.error(`${m} ${p} -> ${r.status}`, JSON.stringify(j).slice(0, 500)); process.exit(1); }
  return j;
};
const roles = await call('GET', '/roles');
const roleId = (key) => roles.find((r) => r.key === key)?.id;
const rel = await call('GET', '/lookups/relation-types'); const relId = (Array.isArray(rel) ? rel : rel.items)[0].id;
const people = [
  ['employee', 'Ella', 'Employee'], ['manager', 'Mo', 'Manager'], ['hr', 'Hana', 'HumanResources'], ['payroll-manager', 'Pia', 'Payroll'],
];
for (const [key, first, last] of people) {
  const email = `${prefix}-${key}@qa.dijipeople.test`;
  const emp = await call('POST', '/employees', {
    firstName: first, lastName: last, workEmail: email, hireDate: '2025-01-05', employmentStatus: 'ACTIVE', phone: '+97455500001',
    emergencyContactName: 'Contact Person', emergencyContactRelationTypeId: relId, emergencyContactPhone: '+97455500002',
  });
  const empId = emp.id ?? emp.employee?.id;
  const user = await call('POST', '/users', { firstName: first, lastName: last, email, password: env.QA_PASSWORD, status: 'ACTIVE', employeeId: empId });
  await call('POST', `/users/${user.id ?? user.user?.id}/roles`, { roleId: roleId(key) });
  console.log('created', key, email, 'employee', empId);
}
