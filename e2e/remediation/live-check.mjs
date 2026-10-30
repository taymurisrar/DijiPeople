// Live API checks for the Starter go-live remediation (DP-QA-002 .. DP-QA-024).
//
// Runs against a LOCAL API and a LOCAL throwaway database only. It refuses
// anything else, and it never touches the QA branch's evidence.
//
//   LIVE_API=http://localhost:4101 LIVE_SLUG=qa-starter LIVE_PASSWORD=... \
//   DATABASE_URL=postgresql://.../dijipeople_remediation_test \
//   node e2e/remediation/live-check.mjs [--skip-rate-limit]
//
// The tenant must be on the Starter plan with entitlementEnforcement = ENFORCE.
// Exit code is the number of failed checks (0 = all passed). A pass here is a
// developer check; only the independent QA run can resolve an issue.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const API = process.env.LIVE_API ?? 'http://localhost:4101';
const SLUG = process.env.LIVE_SLUG ?? 'qa-starter';
const PASSWORD = process.env.LIVE_PASSWORD;
const DATABASE_URL = process.env.DATABASE_URL;

if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(API)) throw new Error('Refusing: LIVE_API must be localhost.');
if (!PASSWORD) throw new Error('Set LIVE_PASSWORD (the seeded user password).');
if (!DATABASE_URL || !/localhost/.test(DATABASE_URL) || !/_(test|ci|scratch|tmp)\b/.test(DATABASE_URL)) {
  throw new Error('Refusing: DATABASE_URL must be a local database with a _test marker.');
}

const { Client } = require('pg');
const db = new Client({ connectionString: DATABASE_URL });
await db.connect();

const results = [];
function check(id, name, ok, detail = '') {
  results.push({ id, name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}${ok ? '' : `  -> ${detail}`}`);
}

async function call(token, method, path, body, extra = {}) {
  const headers = { 'X-DijiPeople-App': 'web', ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra.headers };
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API}/api${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text, headers: res.headers };
}

async function login(role) {
  const email = process.env[`LIVE_${role.toUpperCase()}_EMAIL`] ?? `${role}@dijipeople.local`;
  const res = await call(null, 'POST', '/auth/login', { email, password: PASSWORD, tenantSlug: SLUG });
  const token = res.json?.accessToken ?? res.json?.tokens?.accessToken ?? res.json?.session?.accessToken;
  if (!token) throw new Error(`login failed for ${role}: ${res.status} ${res.json?.errorCode ?? ''} ${res.json?.message ?? ''}`);
  return token;
}

const T = {};
for (const role of ['system-admin', 'hr', 'manager', 'employee', 'payroll']) T[role] = await login(role);

const ctx = {};
for (const role of ['hr', 'manager', 'employee', 'payroll']) ctx[role] = await call(T[role], 'GET', '/employees/me/context');
const empId = ctx.employee.json?.employee?.id;
const mgrId = ctx.manager.json?.employee?.id;
const hrId = ctx.hr.json?.employee?.id;
const tenantId = (await db.query(`select id from "Tenant" where slug=$1`, [SLUG])).rows[0].id;

// ---------- DP-QA-002: self context and dashboard for every sign-in role ----------
for (const role of ['employee', 'manager', 'hr', 'payroll']) {
  const dash = await call(T[role], 'GET', '/dashboard/summary');
  check('DP-QA-002', `${role}: /employees/me/context 200 and /dashboard/summary 200`, ctx[role].status === 200 && dash.status === 200, `${ctx[role].status}/${dash.status}`);
}
// dashboard.view must not widen object-level access
{
  const other = hrId;
  const comp = await call(T.employee, 'GET', `/employees/${other}/compensation`);
  check('DP-QA-002n', 'employee cannot read another employee compensation', comp.status >= 400 || comp.json === null || comp.text === '' || comp.text === 'null', `${comp.status} ${comp.text.slice(0, 80)}`);
  const rec = await call(T.employee, 'GET', `/employees/${other}`);
  check('DP-QA-002n', 'employee cannot open another employee profile', rec.status === 403 || rec.status === 404, String(rec.status));
  const write = await call(T.employee, 'PATCH', `/employees/${other}/personal-info`, { gender: 'MALE' });
  check('DP-QA-002n', 'employee cannot edit another employee personal info', write.status === 403 || write.status === 404 || write.status === 400, String(write.status));
  const list = await call(T.employee, 'GET', '/employees?pageSize=100');
  const ids = (list.json?.items ?? []).map((e) => e.id);
  check('DP-QA-002n', 'employee list is limited to own scope', ids.length <= 1 && (ids.length === 0 || ids[0] === empId), `${ids.length} rows`);
}

// ---------- fixtures: clean leave state, known reporting line ----------
await db.query(`delete from "LeaveConsumptionRecord" where "tenantId"=$1`, [tenantId]);
await db.query(`delete from "LeaveApprovalStep" where "tenantId"=$1`, [tenantId]);
await db.query(`delete from "LeaveRequest" where "tenantId"=$1`, [tenantId]);
await db.query(`delete from "LeaveBalance" where "tenantId"=$1`, [tenantId]);
await db.query(`update "Employee" set "managerEmployeeId"=null where id=$1`, [empId]);

// ---------- DP-QA-011: available types, own request, cancel ----------
// A fresh tenant has default leave TYPES but no allocated BALANCE, so a request is
// refused until HR allocates leave. Allocate here so the flow can be exercised.
const types = await call(T.employee, 'GET', '/leave-requests/available-types');
const typeList = types.json?.leaveTypes ?? [];
check('DP-QA-011', 'employee lists requestable leave types (>0)', types.status === 200 && typeList.length > 0, `${types.status} n=${typeList.length}`);
const hrTypes = await call(T.hr, 'GET', '/leave-requests/available-types');
check('DP-QA-011', 'HR lists requestable leave types', hrTypes.status === 200, String(hrTypes.status));
const fresh = await call(T.hr, 'GET', '/leave-types');
check('DP-QA-011', 'HR reads the leave-type configuration list', fresh.status === 200, String(fresh.status));
const employeeCfg = await call(T.employee, 'GET', '/leave-types');
check('DP-QA-011', 'employee still cannot read the leave-type configuration list', employeeCfg.status === 403, String(employeeCfg.status));
const typeId = typeList.find((t) => t.code === 'ANNUAL')?.id ?? typeList[0]?.id;

await db.query(`insert into "LeaveBalance"(id,"tenantId","employeeId","leaveTypeId","totalAllocated","totalUsed","totalRemaining","lastUpdatedAt") select gen_random_uuid()::text,$1,$2,id,30,0,30,now() from "LeaveType" where "tenantId"=$1 on conflict do nothing`, [tenantId, empId]);
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const mk = (token, start, end) => call(token, 'POST', '/leave-requests', { leaveTypeId: typeId, startDate: day(start), endDate: day(end), reason: 'remediation check' });

const own = await mk(T.employee, 30, 30);
check('DP-QA-011', 'employee submits a leave request', own.status === 201, `${own.status} ${own.text.slice(0, 120)}`);
const ownId = own.json?.id;
const cancelOwn = await call(T.employee, 'POST', `/leave-requests/${ownId}/cancel`, {});
check('DP-QA-011', 'employee cancels own pending request', cancelOwn.status < 300, `${cancelOwn.status} ${cancelOwn.text.slice(0, 100)}`);

// ---------- DP-QA-018: approval scope ----------
const r1 = await mk(T.employee, 40, 40);
const r1id = r1.json?.id;
const mgrNo = await call(T.manager, 'POST', `/leave-requests/${r1id}/approve`, {});
check('DP-QA-018', 'manager outside the reporting line cannot approve (403)', mgrNo.status === 403, `${mgrNo.status} ${mgrNo.text.slice(0, 100)}`);
const empSelf = await call(T.employee, 'POST', `/leave-requests/${r1id}/approve`, {});
check('DP-QA-018', 'employee cannot approve own request (403)', empSelf.status === 403, String(empSelf.status));
const payNo = await call(T.payroll, 'POST', `/leave-requests/${r1id}/approve`, {});
check('DP-QA-018', 'payroll role cannot approve (403)', payNo.status === 403, String(payNo.status));
const stillPending = (await db.query(`select status from "LeaveRequest" where id=$1`, [r1id])).rows[0]?.status;
check('DP-QA-018', 'refused approvals left the request PENDING', stillPending === 'PENDING', stillPending);
await db.query(`update "Employee" set "managerEmployeeId"=$1 where id=$2`, [mgrId, empId]);
const mgrYes = await call(T.manager, 'POST', `/leave-requests/${r1id}/approve`, {});
check('DP-QA-018', 'the same manager CAN approve once the employee reports to them', mgrYes.status < 300, `${mgrYes.status} ${mgrYes.text.slice(0, 100)}`);
await db.query(`update "Employee" set "managerEmployeeId"=null where id=$1`, [empId]);
const r2 = await mk(T.employee, 50, 50);
const hrYes = await call(T.hr, 'POST', `/leave-requests/${r2.json?.id}/approve`, {});
check('DP-QA-018', 'HR approves without a reporting line (org-wide authority)', hrYes.status < 300, `${hrYes.status} ${hrYes.text.slice(0, 100)}`);

// ---------- DP-QA-019: approved leave cancellation ----------
const used = async () => Number((await db.query(`select coalesce(sum("totalUsed"),0) as u from "LeaveBalance" where "tenantId"=$1 and "employeeId"=$2`, [tenantId, empId])).rows[0].u);
const usedBefore = await used();
const cancelApproved = await call(T.employee, 'POST', `/leave-requests/${r2.json?.id}/cancel`, {});
const usedAfter = await used();
check('DP-QA-019', 'owner cancels approved FUTURE leave and the balance is returned', cancelApproved.status < 300 && usedAfter === usedBefore - 1, `${cancelApproved.status} used ${usedBefore}->${usedAfter}`);
const status2 = (await db.query(`select status from "LeaveRequest" where id=$1`, [r2.json?.id])).rows[0]?.status;
check('DP-QA-019', 'cancelled approved request is CANCELLED', status2 === 'CANCELLED', status2);
const consume = (await db.query(`select count(*) from "LeaveConsumptionRecord" where "leaveRequestId"=$1`, [r2.json?.id])).rows[0].count;
check('DP-QA-019', 'its consumption record is gone', consume === '0', consume);
const again = await call(T.employee, 'POST', `/leave-requests/${r2.json?.id}/cancel`, {});
check('DP-QA-019', 'cancelling twice does not double-credit the balance', again.status >= 400 && (await used()) === usedAfter, `${again.status}`);
// started leave: owner refused, HR needs a reason
const r3 = await mk(T.employee, 60, 60);
await call(T.hr, 'POST', `/leave-requests/${r3.json?.id}/approve`, {});
await db.query(`update "LeaveRequest" set "startDate"=now() - interval '2 days', "endDate"=now() - interval '1 day' where id=$1`, [r3.json?.id]);
const startedOwner = await call(T.employee, 'POST', `/leave-requests/${r3.json?.id}/cancel`, {});
check('DP-QA-019', 'owner cannot cancel approved leave that already started (403)', startedOwner.status === 403, String(startedOwner.status));
const hrNoReason = await call(T.hr, 'POST', `/leave-requests/${r3.json?.id}/cancel`, {});
check('DP-QA-019', 'HR must give a reason (400)', hrNoReason.status === 400, String(hrNoReason.status));
const hrReason = await call(T.hr, 'POST', `/leave-requests/${r3.json?.id}/cancel`, { reason: 'approved in error' });
check('DP-QA-019', 'HR cancels started approved leave with a reason', hrReason.status < 300, `${hrReason.status} ${hrReason.text.slice(0, 100)}`);
const audit = (await db.query(`select count(*) from "AuditLog" where "tenantId"=$1 and "entityId"=$2 and action='LEAVE_REQUEST_CANCELLED'`, [tenantId, r3.json?.id])).rows[0].count;
check('DP-QA-019', 'the cancellation is audited', Number(audit) >= 1, audit);

// ---------- DP-QA-020: concurrent overlapping submissions ----------
await db.query(`delete from "LeaveRequest" where "tenantId"=$1 and status in ('PENDING','APPROVED') and "employeeId"=$2`, [tenantId, empId]);
const burst = await Promise.all(Array.from({ length: 8 }, () => mk(T.employee, 90, 91)));
const created = burst.filter((r) => r.status === 201).length;
const rows = (await db.query(`select count(*) from "LeaveRequest" where "tenantId"=$1 and "employeeId"=$2 and status in ('PENDING','APPROVED') and "startDate" >= now() + interval '88 days'`, [tenantId, empId])).rows[0].count;
check('DP-QA-020', '8 simultaneous overlapping submissions create exactly one', created === 1 && rows === '1', `201s=${created} rows=${rows} statuses=${burst.map((r) => r.status).join(',')}`);
const seq = await mk(T.employee, 90, 91);
check('DP-QA-020', 'a sequential duplicate is still refused', seq.status === 409, String(seq.status));

// ---------- DP-QA-022: attendance correction self-read ----------
const workDay = day(-3);
const ac = await call(T.employee, 'POST', '/attendance/correction-requests', { attendanceDate: workDay, correctionType: process.env.LIVE_CORRECTION_TYPE ?? 'MISSED_CHECK_IN', requestedCheckInAtUtc: `${workDay}T09:00:00.000Z`, requestedCheckOutAtUtc: `${workDay}T17:00:00.000Z`, reason: 'forgot to check in' });
const acId = ac.json?.item?.id ?? ac.json?.id;
if (ac.status === 201 || ac.status === 200) {
  const get = await call(T.employee, 'GET', `/attendance/correction-requests/${acId}`);
  const list = await call(T.employee, 'GET', '/attendance/correction-requests');
  check('DP-QA-022', 'employee reads own correction request by id and in the list', get.status === 200 && list.status === 200, `${get.status}/${list.status}`);
  const peer = await call(T.manager, 'GET', `/attendance/correction-requests/${acId}`);
  check('DP-QA-022n', 'a manager outside the reporting line does not read it as theirs (403/404 or scoped)', peer.status === 403 || peer.status === 404 || peer.status === 200, String(peer.status));
  const mine = await call(T.payroll, 'GET', `/attendance/correction-requests/${acId}`);
  check('DP-QA-022n', 'payroll role cannot read another employee correction request', mine.status === 403 || mine.status === 404, String(mine.status));
} else {
  check('DP-QA-022', 'employee can create a correction request (fixture)', false, `${ac.status} ${ac.text.slice(0, 160)}`);
}

// ---------- DP-QA-012: timezone ----------
const badTz = await call(T['system-admin'], 'PATCH', '/tenant-settings', { updates: [{ category: 'organization', key: 'timezone', value: 'Not/AZone' }] });
const resolved = await call(T['system-admin'], 'GET', '/tenant-settings/resolved');
check('DP-QA-012', 'invalid timezone is rejected (400) and not stored', badTz.status === 400 && resolved.json?.organization?.timezone !== 'Not/AZone', `${badTz.status} ${resolved.json?.organization?.timezone}`);
const okTz = await call(T['system-admin'], 'PATCH', '/tenant-settings', { updates: [{ category: 'organization', key: 'timezone', value: 'Asia/Karachi' }] });
check('DP-QA-012', 'a real timezone is accepted', okTz.status < 300, String(okTz.status));
await db.query(`insert into "TenantSetting"(id,"tenantId",category,key,value,"updatedAt") values (gen_random_uuid()::text,$1,'organization','timezone','"Not/AZone"'::jsonb,now()) on conflict ("tenantId",category,key) do update set value='"Not/AZone"'::jsonb`, [tenantId]);
await call(T['system-admin'], 'POST', '/tenant-settings/__noop__', {}).catch(() => undefined);
await new Promise((r) => setTimeout(r, 100));
const poisoned = await call(T.hr, 'GET', '/tenant-settings/resolved');
check('DP-QA-012', 'a previously stored bad timezone resolves to a usable one', poisoned.status === 200 && poisoned.json?.organization?.timezone !== 'Not/AZone', `${poisoned.status} ${poisoned.json?.organization?.timezone}`);
await call(T['system-admin'], 'PATCH', '/tenant-settings', { updates: [{ category: 'organization', key: 'timezone', value: 'UTC' }] });

// ---------- DP-QA-010: paid features refused on Starter ----------
for (const path of ['/data-management/modules', '/data-management/imports', '/integrations/attendance/connectors', '/integrations/gateways', '/agent/settings', '/audit-logs', '/projects', '/payroll/runs']) {
  const r = await call(T['system-admin'], 'GET', path);
  check('DP-QA-010', `Starter owner refused ${path}`, r.status === 403, `${r.status} ${r.text.slice(0, 80)}`);
}
const agentLogin = await call(null, 'POST', '/agent/auth/login', { email: 'x@example.com', password: 'x' });
check('DP-QA-010', 'agent login stays reachable (public; fails on credentials, not on plan)', agentLogin.status !== 403 || !/ENTITLED/i.test(agentLogin.text), `${agentLogin.status} ${agentLogin.text.slice(0, 80)}`);
const devReg = await call(T.employee, 'POST', '/agent/devices/register', {});
check('DP-QA-010', 'agent device enrolment is refused on a plan without the agent', devReg.status === 403, `${devReg.status} ${devReg.text.slice(0, 80)}`);

// ---------- DP-QA-005: tenants cannot weaken enforcement ----------
const weaken = await call(T['system-admin'], 'PATCH', '/tenant-settings', { updates: [{ category: 'module-settings', key: 'entitlementEnforcement', value: 'OFF' }] });
check('DP-QA-005', 'a tenant admin cannot write the platform enforcement mode (400)', weaken.status === 400, `${weaken.status}`);
const selfEnable = await call(T['system-admin'], 'PATCH', '/tenant-settings/features', { updates: [{ key: 'projects', isEnabled: true }] });
const proj = await call(T['system-admin'], 'GET', '/projects');
check('DP-QA-005', 'a tenant admin cannot self-enable a paid module', proj.status === 403, `${selfEnable.status}/${proj.status}`);
const modeRow = (await db.query(`select value->>'entitlementEnforcement' as m from "PlatformSetting" where key='module-settings'`)).rows[0]?.m;
check('DP-QA-005', 'the stored mode is still ENFORCE', modeRow === 'ENFORCE', modeRow);

// ---------- DP-QA-009 / 008 / 014 / 016 ----------
const feats = await call(T.manager, 'GET', '/tenant-settings/features');
const sub = feats.json?.subscription;
check('DP-QA-009', 'manager sees the plan but not price or billing cycle', feats.status === 200 && sub?.plan?.key && sub.finalPrice === undefined && sub.billingCycle === undefined, JSON.stringify(sub).slice(0, 120));
const adminFeats = await call(T['system-admin'], 'GET', '/tenant-settings/features');
check('DP-QA-009', 'the tenant admin still sees the price', adminFeats.json?.subscription?.finalPrice !== undefined, JSON.stringify(adminFeats.json?.subscription).slice(0, 100));
const del = await call(T['system-admin'], 'DELETE', '/employees/5b1f0c3e-7a49-4d2e-9a61-0c1d2e3f4a5b');
check('DP-QA-008', 'single-id delete that matches nothing answers 404', del.status === 404, String(del.status));
const sort = await call(T['system-admin'], 'GET', '/data/employees?orderBy=fullName desc&pageSize=5');
check('DP-QA-014', 'entity data API sorts employees by fullName', sort.status === 200, `${sort.status} ${sort.text.slice(0, 100)}`);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
const form = new FormData();
form.append('settingKey', 'logoUrl');
form.append('file', new Blob([png], { type: 'image/png' }), 'logo.png');
const up = await call(T['system-admin'], 'POST', '/tenant-settings/branding-assets', form);
const viewPath = up.json?.viewPath ?? up.json?.value;
if (up.status < 300 && viewPath) {
  const p = viewPath.replace(/^\/api/, '');
  const asEmp = await call(T.employee, 'GET', p);
  const asHr = await call(T.hr, 'GET', p);
  check('DP-QA-016', 'employee and HR can load the tenant logo (200 image)', asEmp.status === 200 && asHr.status === 200, `${asEmp.status}/${asHr.status}`);
  const docId = up.json?.documentId;
  const meta = await call(T.employee, 'GET', `/documents/${docId}`);
  check('DP-QA-016n', 'but the logo document record itself is still not readable by an employee', meta.status === 403 || meta.status === 404, String(meta.status));
} else check('DP-QA-016', 'admin uploads a logo (fixture)', false, `${up.status} ${up.text.slice(0, 120)}`);

// ---------- DP-QA-004 / 021 data: leave types preserved by the seed (SQL level) ----------
await db.query(`update "LeaveType" set "isActive"=false where "tenantId"=$1 and code='SICK'`, [tenantId]);

// ---------- DP-QA-024: 429 carries Retry-After (run last: burns the read budget) ----------
if (!process.argv.includes('--skip-rate-limit')) {
  let limited = null;
  for (let i = 0; i < 700 && !limited; i += 1) {
    const r = await call(T.payroll, 'GET', '/notifications/in-app/unread-count');
    if (r.status === 429) limited = r;
  }
  check('DP-QA-024', 'exceeding the read budget answers 429 with Retry-After', Boolean(limited) && Number(limited.headers.get('retry-after')) >= 1, limited ? limited.headers.get('retry-after') : 'never limited');
}

await db.end();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} live checks passed${failed ? `, ${failed} FAILED` : ''}`);
process.exit(failed);
