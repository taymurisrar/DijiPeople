// Live API checks for the RUN-004 findings: DP-QA-027, -028, -029, -030, -031.
//
// Same rules as live-check.mjs: local API + local throwaway database only.
//
//   LIVE_API=http://localhost:4101 LIVE_SLUG=qa-starter LIVE_PASSWORD=... \
//   DATABASE_URL=postgresql://.../dijipeople_remediation_test \
//   node e2e/remediation/live-check-round2.mjs
//
// Exit code is the number of failed checks. A pass is a developer check only.
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const API = process.env.LIVE_API ?? 'http://localhost:4101';
const SLUG = process.env.LIVE_SLUG ?? 'qa-starter';
const PASSWORD = process.env.LIVE_PASSWORD;
const DATABASE_URL = process.env.DATABASE_URL;

if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(API)) throw new Error('Refusing: LIVE_API must be localhost.');
if (!PASSWORD) throw new Error('Set LIVE_PASSWORD.');
if (!DATABASE_URL || !/localhost/.test(DATABASE_URL) || !/_(test|ci|scratch|tmp)\b/.test(DATABASE_URL)) {
  throw new Error('Refusing: DATABASE_URL must be a local database with a _test marker.');
}

const { Client } = require('pg');
const jwt = require('jsonwebtoken');
const db = new Client({ connectionString: DATABASE_URL });
await db.connect();

const apiEnv = Object.fromEntries(
  fs.readFileSync(new URL('../../services/api/.env', import.meta.url), 'utf8').replace(/^﻿/, '').split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

const results = [];
function check(id, name, ok, detail = '') {
  results.push({ id, name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${ok ? '' : `  -> ${detail}`}`);
}

async function call(token, method, path, body) {
  const headers = { 'X-DijiPeople-App': 'web', ...(token ? { authorization: `Bearer ${token}` } : {}) };
  let payload;
  if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API}/api${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
}

async function login(role) {
  const email = `${role}@dijipeople.local`;
  const res = await call(null, 'POST', '/auth/login', { email, password: PASSWORD, tenantSlug: SLUG });
  const token = res.json?.accessToken ?? res.json?.tokens?.accessToken;
  if (!token) throw new Error(`login failed for ${role}: ${res.status} ${res.json?.message ?? ''}`);
  return token;
}

const T = {};
for (const role of ['system-admin', 'hr', 'employee']) T[role] = await login(role);
const tenantId = (await db.query('select id from "Tenant" where slug=$1', [SLUG])).rows[0].id;
const empId = (await call(T.employee, 'GET', '/employees/me/context')).json?.employee?.id;
const rel = await call(T['system-admin'], 'GET', '/lookups/relation-types');
const relId = (Array.isArray(rel.json) ? rel.json : rel.json?.items)?.[0]?.id;
const stamp = Date.now().toString(36);

async function newEmployee(label) {
  const email = `r2-${label}-${stamp}@qa.dijipeople.test`;
  const r = await call(T['system-admin'], 'POST', '/employees', {
    firstName: `R2${label}`, lastName: stamp, workEmail: email, hireDate: '2025-02-03', employmentStatus: 'ACTIVE',
    phone: '+97455500001', emergencyContactName: 'X Y', emergencyContactRelationTypeId: relId, emergencyContactPhone: '+97455500002',
  });
  return { id: r.json?.id, email, status: r.status };
}
const tokenOf = (res) => decodeURIComponent((JSON.stringify(res.json).match(/token=([A-Za-z0-9_\-.%]+)/) ?? [])[1] ?? '');
const activate = (token, password) => call(null, 'POST', '/auth/activate-account', { token, password });

// ---------- DP-QA-027 / 028 / 031: invitation and reset tokens ----------
{
  const e = await newEmployee('inv');
  check('DP-QA-027', 'fixture: employee created', e.status === 201, String(e.status));
  const first = await call(T['system-admin'], 'POST', `/employees/${e.id}/resend-invite`);
  const second = await call(T['system-admin'], 'POST', `/employees/${e.id}/resend-invite`);
  const oldToken = tokenOf(first);
  const newToken = tokenOf(second);
  check('DP-QA-027', 'resend issues a different token', Boolean(oldToken) && Boolean(newToken) && oldToken !== newToken, 'no link exposed');
  const mode = (r) => r.json?.invitation?.deliveryMode ?? r.json?.deliveryMode;
  check('DP-QA-028', 'a resend straight after the first invitation is not skipped by the cool-down', mode(second) === mode(first), `first=${mode(first)} second=${mode(second)}`);

  const revoked = await activate(oldToken, 'Revoked!Passw0rd-1');
  check('DP-QA-027', 'the revoked (superseded) token cannot activate (401)', revoked.status === 401, `${revoked.status} ${revoked.text.slice(0, 80)}`);
  const userRow = (await db.query('select status from "User" where "tenantId"=$1 and email=$2', [tenantId, e.email])).rows[0];
  check('DP-QA-027', 'and that attempt did not activate the account', userRow?.status !== 'ACTIVE', String(userRow?.status));

  await db.query(`update "UserInvitation" set "expiresAt"=(now() at time zone 'utc') - interval '1 hour' where "tenantId"=$1 and email=$2 and status='PENDING'`, [tenantId, e.email]);
  const expired = await activate(newToken, 'Expired!Passw0rd-1');
  check('DP-QA-027', 'an expired token cannot activate (401)', expired.status === 401, `${expired.status} ${expired.text.slice(0, 80)}`);

  const third = await call(T['system-admin'], 'POST', `/employees/${e.id}/resend-invite`);
  const liveToken = tokenOf(third);
  const race = await Promise.all([activate(liveToken, 'RaceOne!Passw0rd-1'), activate(liveToken, 'RaceTwo!Passw0rd-2')]);
  check('DP-QA-027', 'two simultaneous activations with one live token: exactly one wins', race.filter((r) => r.status === 201).length === 1 && race.some((r) => r.status === 401), race.map((r) => r.status).join(','));
  const replay = await activate(liveToken, 'Replay!Passw0rd-3');
  check('DP-QA-027', 'the consumed token cannot be replayed', replay.status === 401, String(replay.status));

  // DP-QA-031: reset tokens, issued by the same signing path as the API (pwv pins the credential)
  const u = (await db.query('select id, (extract(epoch from "passwordChangedAt") * 1000)::bigint as ms from "User" where "tenantId"=$1 and email=$2', [tenantId, e.email])).rows[0];
  const secret = (apiEnv.WEB_JWT_ACCESS_SECRET || apiEnv.JWT_ACCESS_SECRET).trim();
  const resetTokenFor = (ms) => jwt.sign({ sub: u.id, tenantId, type: 'password-reset', pwv: ms ? Number(ms) : 0 }, secret, { expiresIn: '1d' });
  const t1 = resetTokenFor(u.ms);
  const r1 = await call(null, 'POST', '/auth/reset-password', { token: t1, password: 'Reset1!Passw0rd-aa' });
  const r2 = await call(null, 'POST', '/auth/reset-password', { token: t1, password: 'Reset2!Passw0rd-bb' });
  check('DP-QA-031', 'a reset token works once and its replay is refused (401)', r1.status < 300 && r2.status === 401, `${r1.status}/${r2.status} ${r2.text.slice(0, 80)}`);
  const afterReset = (await db.query('select (extract(epoch from "passwordChangedAt") * 1000)::bigint as ms from "User" where id=$1', [u.id])).rows[0];
  const t2 = resetTokenFor(afterReset.ms);
  const rr = await Promise.all([
    call(null, 'POST', '/auth/reset-password', { token: t2, password: 'ResetA!Passw0rd-cc' }),
    call(null, 'POST', '/auth/reset-password', { token: t2, password: 'ResetB!Passw0rd-dd' }),
  ]);
  check('DP-QA-031', 'two simultaneous resets with one token: exactly one wins', rr.filter((r) => r.status < 300).length === 1, rr.map((r) => r.status).join(','));
  const stale = await call(null, 'POST', '/auth/reset-password', { token: t1, password: 'ResetC!Passw0rd-ee' });
  check('DP-QA-031', 'an older link cannot be used after a newer reset', stale.status === 401, String(stale.status));
  const forged = await call(null, 'POST', '/auth/reset-password', { token: `${t1.slice(0, -3)}abc`, password: 'Forged!Passw0rd-ff' });
  check('DP-QA-031', 'a forged token is refused', forged.status === 401, String(forged.status));

  await call(T['system-admin'], 'DELETE', `/employees/${e.id}`);
}

// ---------- DP-QA-029: approval deducts atomically and refuses an overdraw ----------
{
  const typeId = ((await call(T.employee, 'GET', '/leave-requests/available-types')).json?.leaveTypes ?? []).find((t) => t.code === 'ANNUAL')?.id;
  const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const mk = (offset) => call(T.employee, 'POST', '/leave-requests', { leaveTypeId: typeId, startDate: day(offset), endDate: day(offset), reason: 'balance check' });
  const balance = async () => (await db.query('select "totalUsed"::float u, "totalRemaining"::float r from "LeaveBalance" where "tenantId"=$1 and "employeeId"=$2 and "leaveTypeId"=$3', [tenantId, empId, typeId])).rows[0];
  const reset = async (allocated) => {
    await db.query('delete from "LeaveConsumptionRecord" where "tenantId"=$1 and "employeeId"=$2', [tenantId, empId]);
    await db.query('delete from "LeaveApprovalStep" where "tenantId"=$1 and "leaveRequestId" in (select id from "LeaveRequest" where "employeeId"=$2)', [tenantId, empId]);
    await db.query('delete from "LeaveRequest" where "tenantId"=$1 and "employeeId"=$2', [tenantId, empId]);
    await db.query('insert into "LeaveBalance"(id,"tenantId","employeeId","leaveTypeId","totalAllocated","totalUsed","totalRemaining","lastUpdatedAt") values (gen_random_uuid()::text,$1,$2,$3,$4,0,$4,now()) on conflict ("tenantId","employeeId","leaveTypeId") do update set "totalAllocated"=$4,"totalUsed"=0,"totalRemaining"=$4', [tenantId, empId, typeId, allocated]);
  };
  await db.query('update "Employee" set "managerEmployeeId"=null where id=$1', [empId]);

  await reset(2);
  const ids = [];
  for (const offset of [110, 112, 114]) ids.push((await mk(offset)).json?.id);
  check('DP-QA-029', 'fixture: three one-day requests against a two-day balance are accepted as pending', ids.every(Boolean), ids.join(','));
  const a1 = await call(T.hr, 'POST', `/leave-requests/${ids[0]}/approve`, {});
  const b1 = await balance();
  check('DP-QA-029', 'the first approval deducts immediately', a1.status < 300 && b1.u === 1 && b1.r === 1, JSON.stringify(b1));
  const a2 = await call(T.hr, 'POST', `/leave-requests/${ids[1]}/approve`, {});
  const a3 = await call(T.hr, 'POST', `/leave-requests/${ids[2]}/approve`, {});
  const b3 = await balance();
  check('DP-QA-029', 'the third approval is refused (409) and nothing is overdrawn', a2.status < 300 && a3.status === 409 && b3.u === 2 && b3.r === 0, `${a2.status}/${a3.status} ${JSON.stringify(b3)}`);
  const status = (await db.query('select status from "LeaveRequest" where id=$1', [ids[2]])).rows[0].status;
  check('DP-QA-029', 'the refused request stays PENDING (the decision rolled back)', status === 'PENDING', status);

  await reset(1);
  const c1 = (await mk(120)).json?.id;
  const c2 = (await mk(122)).json?.id;
  const both = await Promise.all([call(T.hr, 'POST', `/leave-requests/${c1}/approve`, {}), call(T.hr, 'POST', `/leave-requests/${c2}/approve`, {})]);
  const bc = await balance();
  check('DP-QA-029', 'two concurrent approvals for the last day: exactly one succeeds, balance never negative', both.filter((r) => r.status < 300).length === 1 && bc.r === 0 && bc.u === 1, `${both.map((r) => r.status).join(',')} ${JSON.stringify(bc)}`);
}

// ---------- DP-QA-030: soft-deleted employees disappear everywhere ----------
{
  const e = await newEmployee('gone');
  const visible = async (path) => {
    const r = await call(T['system-admin'], 'GET', path);
    return r.text.includes(e.email) || r.text.includes(e.id);
  };
  const paths = [`/data/employees?search=${stamp}&pageSize=50`, `/employees?search=${stamp}&pageSize=50`, `/employees/linking-search?q=${stamp}`];
  const before = await Promise.all(paths.map(visible));
  check('DP-QA-030', 'fixture: a live employee appears in every list', before.every(Boolean), before.join(','));
  const del = await call(T['system-admin'], 'DELETE', `/employees/${e.id}`);
  check('DP-QA-030', 'fixture: delete succeeds', del.status < 300, String(del.status));
  for (const p of paths) check('DP-QA-030', `deleted employee absent from ${p.split('?')[0]}`, !(await visible(p)), p);
  const exp = await call(T['system-admin'], 'GET', '/employees/export');
  check('DP-QA-030', 'deleted employee absent from the employee export', !exp.text.includes(e.email), `export status ${exp.status}`);
  const row = (await db.query('select "isDeleted","deletedAt" from "Employee" where id=$1', [e.id])).rows[0];
  check('DP-QA-030', 'the row is preserved (soft delete) with a deletion timestamp', row?.isDeleted === true && row.deletedAt !== null, JSON.stringify(row));
  const audited = (await db.query('select count(*) from "AuditLog" where "tenantId"=$1 and "entityId"=$2', [tenantId, e.id])).rows[0].count;
  check('DP-QA-030', 'history/audit for the deleted employee is preserved', Number(audited) >= 1, audited);
}

await db.end();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} round-2 checks passed${failed ? `, ${failed} FAILED` : ''}`);
process.exit(failed);
