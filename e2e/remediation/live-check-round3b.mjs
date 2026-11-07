// Existing device credentials after a downgrade (no implicit perpetual access).
// Enterprise: an agent logs in and its refresh token works. The tenant is then
// moved to Growth: the SAME refresh token must be refused, and so must the
// already-issued access token. Local API + local throwaway database only.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const API = process.env.LIVE_API ?? 'http://localhost:4101';
const SLUG = process.env.LIVE_SLUG ?? 'qa-starter';
const PASSWORD = process.env.LIVE_PASSWORD;
const DATABASE_URL = process.env.DATABASE_URL;
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(API)) throw new Error('Refusing: LIVE_API must be localhost.');
if (!PASSWORD) throw new Error('Set LIVE_PASSWORD.');
if (!DATABASE_URL || !/localhost/.test(DATABASE_URL) || !/_(test|ci|scratch|tmp)\b/.test(DATABASE_URL)) throw new Error('Refusing: local _test database only.');

const { Client } = require('pg');
const db = new Client({ connectionString: DATABASE_URL });
await db.connect();
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  R3b  ${name}${ok ? '' : `  -> ${detail}`}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function call(token, method, path, body, app = 'web') {
  const headers = { 'X-DijiPeople-App': app, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) };
  const res = await fetch(`${API}/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch { /* */ }
  return { status: res.status, json, text };
}
const tenant = (await db.query('select id from "Tenant" where slug=$1', [SLUG])).rows[0];
const original = (await db.query('select "planId" from "Subscription" where "tenantId"=$1', [tenant.id])).rows[0].planId;
const planId = async (k) => (await db.query('select id from "Plan" where key=$1', [k])).rows[0].id;
const fp = `fp-r3b-${Date.now().toString(36)}`;
const device = { deviceFingerprint: fp, deviceName: 'live-check', os: 'Windows', platform: 'win32', agentVersion: '1.0.0' };

try {
  await db.query('update "Subscription" set "planId"=$1 where "tenantId"=$2', [await planId('enterprise'), tenant.id]);
  console.log('--- enterprise (waiting for the entitlement cache)'); await sleep(62000);
  const login = await call(null, 'POST', '/agent/auth/login', { email: 'employee@dijipeople.local', password: PASSWORD, ...device }, 'agent-desktop');
  const tokens = login.json?.tokens ?? login.json?.data?.tokens;
  check('enterprise: agent login issues credentials', (login.status === 200 || login.status === 201) && Boolean(tokens?.refreshToken), `${login.status} ${login.text.slice(0, 120)}`);
  const me = await call(tokens?.accessToken, 'GET', '/agent/me', undefined, 'agent-desktop');
  check('enterprise: access token works', me.status === 200, `${me.status} ${me.text.slice(0, 100)}`);
  const refreshed = await call(null, 'POST', '/agent/auth/refresh', { refreshToken: tokens?.refreshToken, deviceFingerprint: fp, agentVersion: '1.0.0' }, 'agent-desktop');
  check('enterprise: refresh works', refreshed.status === 200 || refreshed.status === 201, `${refreshed.status} ${refreshed.text.slice(0, 120)}`);
  const live = refreshed.json?.tokens ?? refreshed.json?.data?.tokens ?? tokens;

  await db.query('update "Subscription" set "planId"=$1 where "tenantId"=$2', [await planId('growth'), tenant.id]);
  console.log('--- downgraded to growth (waiting for the entitlement cache)'); await sleep(62000);
  const meAfter = await call(live?.accessToken, 'GET', '/agent/me', undefined, 'agent-desktop');
  check('after downgrade: the already-issued access token is refused (403 not entitled)', meAfter.status === 403 && /ENTITLED/.test(meAfter.text), `${meAfter.status} ${meAfter.text.slice(0, 100)}`);
  const refreshAfter = await call(null, 'POST', '/agent/auth/refresh', { refreshToken: live?.refreshToken, deviceFingerprint: fp, agentVersion: '1.0.0' }, 'agent-desktop');
  check('after downgrade: the existing refresh token cannot renew (403 not entitled)', refreshAfter.status === 403 && /ENTITLED/.test(refreshAfter.text), `${refreshAfter.status} ${refreshAfter.text.slice(0, 120)}`);
  const loginAfter = await call(null, 'POST', '/agent/auth/login', { email: 'employee@dijipeople.local', password: PASSWORD, ...device }, 'agent-desktop');
  check('after downgrade: a fresh login is refused (403 not entitled)', loginAfter.status === 403 && /ENTITLED/.test(loginAfter.text), `${loginAfter.status} ${loginAfter.text.slice(0, 120)}`);
} finally {
  await db.query('update "Subscription" set "planId"=$1 where "tenantId"=$2', [original, tenant.id]);
  await db.end();
}
const failed = results.filter((ok) => !ok).length;
console.log(`\n${results.length - failed}/${results.length} round-3b checks passed${failed ? `, ${failed} FAILED` : ''}`);
process.exit(failed);
