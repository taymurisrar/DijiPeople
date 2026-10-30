// Removes leftovers a failed run may have left in the QA tenants: employees named "Qa<run> Lifecycle", pending leave requests of the
// tenant-A employee, open correction requests of the tenant-S employee. Uses cached API tokens (no logins). Usage: node qa-cleanup.mjs
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync(new URL('../../../.env.qa.local', import.meta.url), 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
if (!/^http:\/\/localhost:\d+$/.test(env.QA_API_URL)) throw new Error('refusing: not localhost');
const T = JSON.parse(readFileSync(new URL('../../golive-results/.auth/api-tokens.json', import.meta.url), 'utf8'));
const h = (k) => ({ authorization: `Bearer ${T[k].token}`, 'X-DijiPeople-App': 'web', 'content-type': 'application/json' });
const j = async (k, m, p, b) => { const r = await fetch(env.QA_API_URL + '/api' + p, { method: m, headers: h(k), body: b ? JSON.stringify(b) : undefined }); let x = null; try { x = await r.json(); } catch {} return { s: r.status, x }; };
const emps = (await j('A/OWNER', 'GET', '/employees?pageSize=100')).x.items.filter((e) => /^Qa[a-z0-9]+$/i.test(e.firstName) && e.lastName === 'Lifecycle');
for (const e of emps) console.log('delete employee', e.employeeCode, (await j('A/OWNER', 'DELETE', `/employees/${e.id}`)).s);
const mine = (await j('A/EMPLOYEE', 'GET', '/leave-requests/mine')).x;
for (const r of (Array.isArray(mine) ? mine : mine.items ?? []).filter((r) => !/CANCEL|REJECT/.test(r.status))) { let st = (await j('A/EMPLOYEE', 'POST', `/leave-requests/${r.id}/cancel`, { reason: 'QA cleanup' })).s; if (st >= 300) st = (await j('A/OWNER', 'POST', `/leave-requests/${r.id}/cancel`, { reason: 'QA cleanup (admin)' })).s; console.log('cancel leave', r.id, st); }
const cr = (await j('S/EMPLOYEE', 'GET', '/attendance/correction-requests')).x;
for (const r of (cr?.items ?? []).filter((r) => /PENDING|SUBMITTED/.test(r.status))) console.log('cancel correction', r.requestNumber, (await j('S/EMPLOYEE', 'POST', `/attendance/correction-requests/${r.id}/cancel`, { reason: 'QA cleanup' })).s);
