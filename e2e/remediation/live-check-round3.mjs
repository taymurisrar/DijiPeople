// Live API checks for the final product-alignment decisions (RUN-005 follow-up):
//   - basic import/export on every plan (starter, growth, enterprise)
//   - desktop agent Enterprise/Custom only, enforced on agent login/refresh and settings
//   - essential tenant e-mail branding on every plan, attribution dropped only for white-label
//
// Local API + local throwaway database + local SMTP sink (127.0.0.1:8025) only.
// The tenant is moved between plans by writing its Subscription; the entitlement
// snapshot is cached for 60s per process, so each phase waits that out.
//
//   LIVE_API=http://localhost:4101 LIVE_SLUG=qa-starter LIVE_PASSWORD=... \
//   DATABASE_URL=postgresql://.../dijipeople_remediation_r5_test \
//   node e2e/remediation/live-check-round3.mjs
//
// Exit code is the number of failed checks. A pass is a developer check only.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const API = process.env.LIVE_API ?? 'http://localhost:4101';
const SLUG = process.env.LIVE_SLUG ?? 'qa-starter';
const PASSWORD = process.env.LIVE_PASSWORD;
const DATABASE_URL = process.env.DATABASE_URL;
const SINK = 'http://127.0.0.1:8025';
const CACHE_WAIT_MS = 62_000;

if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(API)) throw new Error('Refusing: LIVE_API must be localhost.');
if (!PASSWORD) throw new Error('Set LIVE_PASSWORD.');
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
  const res = await call(null, 'POST', '/auth/login', { email: `${role}@dijipeople.local`, password: PASSWORD, tenantSlug: SLUG });
  const token = res.json?.accessToken ?? res.json?.tokens?.accessToken;
  if (!token) throw new Error(`login failed for ${role}: ${res.status} ${res.json?.message ?? ''}`);
  return token;
}

const tenant = (await db.query('select id from "Tenant" where slug=$1', [SLUG])).rows[0];
const originalPlan = (await db.query('select "planId" from "Subscription" where "tenantId"=$1', [tenant.id])).rows[0].planId;
const planId = async (key) => (await db.query('select id from "Plan" where key=$1', [key])).rows[0].id;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const stamp = Date.now().toString(36);

async function phase(planKey, expect) {
  await db.query('update "Subscription" set "planId"=$1 where "tenantId"=$2', [await planId(planKey), tenant.id]);
  console.log(`\n--- plan: ${planKey} (waiting for the entitlement cache)`);
  await sleep(CACHE_WAIT_MS);
  const admin = await login('system-admin');
  const employee = await login('employee');
  const id = `R3 ${planKey}`;

  // ---- import / export: every plan
  const modules = await call(admin, 'GET', '/data-management/modules');
  check(id, 'admin reaches Import & Export (modules list)', modules.status === 200, `${modules.status} ${modules.text.slice(0, 90)}`);
  const template = await call(admin, 'GET', '/data-management/modules/employees/template');
  check(id, 'admin downloads the employees template', template.status === 200, `${template.status} ${template.text.slice(0, 90)}`);
  const exp = await call(admin, 'POST', '/data-management/exports', { moduleKey: 'employees' });
  check(id, 'admin can queue an employees export', exp.status >= 200 && exp.status < 300, `${exp.status} ${exp.text.slice(0, 120)}`);
  const empModules = await call(employee, 'GET', '/data-management/modules');
  check(id, 'a plain employee is refused bulk import/export (403, permission not plan)', empModules.status === 403 && !/ENTITLED/.test(empModules.text), `${empModules.status} ${empModules.text.slice(0, 90)}`);
  const empExport = await call(employee, 'POST', '/data-management/exports', { moduleKey: 'employees' });
  check(id, 'a plain employee cannot bulk-export employee data', empExport.status === 403, `${empExport.status}`);

  // ---- advanced data management has no routes: nothing premium leaked open
  const mappings = await call(admin, 'GET', '/data-management/mappings');
  check(id, 'no advanced mapping/schedule route is exposed', mappings.status === 404, `${mappings.status}`);

  // ---- desktop agent
  const agentSettings = await call(admin, 'GET', '/agent/settings');
  const agentLogin = await call(null, 'POST', '/agent/auth/login', {
    email: 'employee@dijipeople.local', password: PASSWORD,
    deviceFingerprint: `fp-${stamp}-${planKey}`, deviceName: 'live-check', os: 'Windows', platform: 'win32', agentVersion: '1.0.0',
  });
  if (expect.agent) {
    check(id, 'agent settings reachable', agentSettings.status === 200, `${agentSettings.status} ${agentSettings.text.slice(0, 90)}`);
    check(id, 'agent login issues credentials', agentLogin.status === 201 || agentLogin.status === 200, `${agentLogin.status} ${agentLogin.text.slice(0, 120)}`);
    const refresh = await call(null, 'POST', '/agent/auth/refresh', {
      refreshToken: agentLogin.json?.tokens?.refreshToken, deviceFingerprint: `fp-${stamp}-${planKey}`, agentVersion: '1.0.0',
    });
    check(id, 'agent refresh works', refresh.status === 200 || refresh.status === 201, `${refresh.status} ${refresh.text.slice(0, 120)}`);
  } else {
    check(id, 'agent settings refused as not entitled', agentSettings.status === 403 && /ENTITLED/.test(agentSettings.text), `${agentSettings.status} ${agentSettings.text.slice(0, 90)}`);
    check(id, 'agent login refused with correct credentials (no credential minted)', agentLogin.status === 403 && /ENTITLED/.test(agentLogin.text), `${agentLogin.status} ${agentLogin.text.slice(0, 120)}`);
    const wrong = await call(null, 'POST', '/agent/auth/login', {
      email: 'employee@dijipeople.local', password: 'Wrong!Passw0rd-9',
      deviceFingerprint: `fp-${stamp}-${planKey}`, deviceName: 'live-check', os: 'Windows', platform: 'win32', agentVersion: '1.0.0',
    });
    check(id, 'a wrong password still answers 401 (no entitlement oracle)', wrong.status === 401, `${wrong.status}`);
    const dlp = await call(employee, 'POST', '/agent/dlp/clipboard-events', { events: [] });
    check(id, 'DLP ingest is refused as not entitled', dlp.status === 403 && /ENTITLED/.test(dlp.text), `${dlp.status} ${dlp.text.slice(0, 90)}`);
  }

  // ---- e-mail branding: every plan
  await fetch(`${SINK}/messages`, { method: 'DELETE' });
  const rel = await call(admin, 'GET', '/lookups/relation-types');
  const relId = (Array.isArray(rel.json) ? rel.json : rel.json?.items)?.[0]?.id;
  const email = `r3-${planKey}-${stamp}@qa.dijipeople.test`;
  const emp = await call(admin, 'POST', '/employees', {
    firstName: 'Brand', lastName: planKey, workEmail: email, hireDate: '2025-02-03', employmentStatus: 'ACTIVE',
    phone: '+97455500001', emergencyContactName: 'X Y', emergencyContactRelationTypeId: relId, emergencyContactPhone: '+97455500002',
  });
  await call(admin, 'POST', `/employees/${emp.json?.id}/resend-invite`);
  await sleep(2500);
  const mail = (await (await fetch(`${SINK}/messages?to=${encodeURIComponent(email)}`)).json()).at(-1);
  check(id, 'invitation e-mail delivered through the sink', Boolean(mail), 'no message');
  if (mail) {
    const tenantName = (await db.query('select name from "Tenant" where id=$1', [tenant.id])).rows[0].name;
    check(id, 'e-mail carries the organisation name', mail.html.includes(tenantName.replace(/&/g, '&amp;')) || mail.html.includes(tenantName), 'name missing');
    check(id, 'e-mail keeps the activation link intact', /\/activate(-account)?\?[^"]*token=/.test(mail.html), 'link missing');
    const attribution = mail.html.includes('Powered by DijiPeople');
    check(id, expect.whiteLabel ? 'white-label drops the DijiPeople attribution' : 'standard DijiPeople attribution present',
      expect.whiteLabel ? !attribution : attribution, `attribution=${attribution}`);
  }

  // ---- e-mail template wording: Growth+
  const list = await call(admin, 'GET', '/notifications/email-templates');
  const clone = await call(admin, 'POST', '/notifications/email-templates/system-AUTH_PASSWORD_RESET/clone', {});
  if (expect.customize) {
    check(id, 'template customization (clone) allowed', clone.status !== 403, `${clone.status} ${clone.text.slice(0, 90)}`);
  } else {
    check(id, 'template customization refused as not entitled', clone.status === 403 && /ENTITLED/.test(clone.text), `${clone.status} ${clone.text.slice(0, 90)} list=${list.status}`);
  }
}

try {
  await phase('starter', { agent: false, customize: false, whiteLabel: false });
  await phase('growth', { agent: false, customize: true, whiteLabel: false });
  await phase('enterprise', { agent: true, customize: true, whiteLabel: true });

  // ---- Custom: an explicit CUSTOM override beats the plan in both directions
  await db.query('update "Subscription" set "planId"=$1 where "tenantId"=$2', [await planId('growth'), tenant.id]);
  await db.query(
    `insert into "TenantFeature"(id,"tenantId",key,"isEnabled",source,"updatedAt") values (gen_random_uuid()::text,$1,'desktop-agent',true,'CUSTOM',now())
     on conflict ("tenantId",key) do update set "isEnabled"=true, source='CUSTOM'`,
    [tenant.id],
  );
  console.log('\n--- custom: growth plan + CUSTOM desktop-agent override (waiting for the entitlement cache)');
  await sleep(CACHE_WAIT_MS);
  const admin = await login('system-admin');
  const granted = await call(admin, 'GET', '/agent/settings');
  check('R3 custom', 'an explicit CUSTOM override grants the desktop agent on a plan without it', granted.status === 200, `${granted.status} ${granted.text.slice(0, 90)}`);
  await db.query(`delete from "TenantFeature" where "tenantId"=$1 and key='desktop-agent'`, [tenant.id]);
  console.log('--- custom: override removed (waiting for the entitlement cache)');
  await sleep(CACHE_WAIT_MS);
  const after = await call(await login('system-admin'), 'GET', '/agent/settings');
  check('R3 custom', 'removing the override leaves no implicit access (downgrade is real)', after.status === 403, `${after.status}`);
} finally {
  await db.query('update "Subscription" set "planId"=$1 where "tenantId"=$2', [originalPlan, tenant.id]);
  await db.end();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} round-3 checks passed${failed ? `, ${failed} FAILED` : ''}`);
process.exit(failed);
