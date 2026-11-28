#!/usr/bin/env node
/**
 * work-gui-stack.mjs - a guarded, repeatable local stack for the browser
 * journeys (e2e Flow R / Flow S), usable with NO Playwright MCP server.
 *
 *   node scripts/work-gui-stack.mjs up [--reseed]
 *   node scripts/work-gui-stack.mjs status
 *   node scripts/work-gui-stack.mjs env [--export]
 *   node scripts/work-gui-stack.mjs down
 *
 * See docs/development/work-gui-stack.md. In short: it makes (or reuses) ONE
 * throwaway PostgreSQL database whose name ends in _gui / _e2e and whose
 * encoding is UTF8, migrates and seeds it, ensures the demo tenant has the
 * workspace host rows the web resolves by subdomain, then starts the API and
 * `next dev` for the tenant product on ports that are not the developer's own
 * (4099 / 3011). Everything is passed to the children through the environment;
 * nothing is written into the repository (no .env files). Logs, the pid file and
 * the state file live in GUI_STACK_DIR (default: <os tmp>/dijipeople-gui-stack).
 *
 * Configuration (all optional except a database server):
 *   GUI_PG_ADMIN_URL   connection URL of a maintenance database (default: DATABASE_URL
 *                      with the database name swapped to "postgres")
 *   GUI_DB_NAME        throwaway database (default dp_master_utf8_gui; must end _gui/_e2e)
 *   GUI_STACK_DIR      logs / pid file / state
 *   GUI_NODE           node binary for children (default $N22, else this node)
 *   GUI_API_PORT       default 4099        GUI_WEB_PORT   default 3011
 *   GUI_TENANT_SLUG    default dijipeople-demo
 *   GUI_DEMO_PASSWORD  default DemoUser@12345 (the seed's own documented default)
 */
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = path.join(ROOT, 'services', 'api');
const WEB_DIR = path.join(ROOT, 'apps', 'web');
const apiRequire = createRequire(path.join(API_DIR, 'package.json'));
const webRequire = createRequire(path.join(WEB_DIR, 'package.json'));

const cfg = {
  dbName: process.env.GUI_DB_NAME?.trim() || 'dp_master_utf8_gui',
  stackDir: path.resolve(process.env.GUI_STACK_DIR?.trim() || path.join(os.tmpdir(), 'dijipeople-gui-stack')),
  node: process.env.GUI_NODE?.trim() || process.env.N22?.trim() || process.execPath,
  apiPort: Number(process.env.GUI_API_PORT || 4099),
  webPort: Number(process.env.GUI_WEB_PORT || 3011),
  slug: (process.env.GUI_TENANT_SLUG || 'dijipeople-demo').trim().toLowerCase(),
  password: process.env.GUI_DEMO_PASSWORD || 'DemoUser@12345',
};
const STATE_FILE = path.join(cfg.stackDir, 'state.json');
const PID_FILE = path.join(cfg.stackDir, 'pids.json');
const ROLE_USERS = {
  employee: 'employee@dijipeople.local',
  manager: 'manager@dijipeople.local',
  hr: 'hr@dijipeople.local',
  ceo: 'ceo@dijipeople.local',
};

const log = (m) => console.log(`[gui-stack] ${m}`);
const die = (m) => {
  console.error(`[gui-stack] REFUSED/FAILED: ${m}`);
  process.exit(1);
};
const mask = (url) => url.replace(/\/\/([^:/@]+):([^@]*)@/, '//$1:***@');

/* ------------------------------------------------------------------ guards */

function assertThrowawayName(name) {
  if (!/^[a-z0-9_]+$/.test(name) || !/(_gui|_e2e)$/.test(name)) {
    die(`database name "${name}" must be lowercase [a-z0-9_] and end in _gui or _e2e.`);
  }
  if (cfg.apiPort === 4000) die('GUI_API_PORT 4000 is the developer API port; use another (default 4099).');
}

function adminUrl() {
  const explicit = process.env.GUI_PG_ADMIN_URL?.trim();
  if (explicit) return explicit;
  const base = process.env.DATABASE_URL?.trim();
  if (!base) die('set GUI_PG_ADMIN_URL, or DATABASE_URL to derive it from.');
  const u = new URL(base);
  u.pathname = '/postgres';
  u.search = '';
  return u.toString();
}

function targetUrl() {
  const u = new URL(adminUrl());
  u.pathname = `/${cfg.dbName}`;
  return u.toString();
}

function pgClient(url) {
  const { Client } = apiRequire('pg');
  return new Client({ connectionString: url });
}

async function withDb(url, fn) {
  const c = pgClient(url);
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end().catch(() => undefined);
  }
}

/** The one place the identity of the database is proven; throws via die(). */
async function verifyIdentity() {
  assertThrowawayName(cfg.dbName);
  return withDb(targetUrl(), async (c) => {
    const r = await c.query('select current_database() as db, current_setting($1) as enc', ['server_encoding']);
    const show = (await c.query('show server_encoding')).rows[0].server_encoding;
    const { db, enc } = r.rows[0];
    if (db !== cfg.dbName) die(`connected database is "${db}", expected "${cfg.dbName}".`);
    if (enc !== 'UTF8' || show !== 'UTF8') die(`database "${db}" encoding is ${enc}/${show}, need UTF8.`);
    return { db, encoding: show };
  });
}

/* ---------------------------------------------------------------- processes */

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** Is `pid` alive AND a node process? (guards against pid reuse before taskkill) */
function isOurNode(pid) {
  if (!pid) return false;
  const r = spawnSync('tasklist', ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
  return /"node\.exe"/i.test(r.stdout || '');
}

function portBusy(port) {
  return new Promise((resolve) => {
    const s = http.request({ host: '127.0.0.1', port, path: '/', method: 'HEAD', timeout: 1500 }, (res) => {
      res.resume();
      resolve(true);
    });
    s.on('timeout', () => { s.destroy(); resolve(true); });
    s.on('error', (e) => resolve(e.code !== 'ECONNREFUSED'));
    s.end();
  });
}

function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.ELECTRON_RUN_AS_NODE; // Electron's flag turns node into a different program
  delete env.DIRECT_DATABASE_URL; // a leftover would send migrations to another database
  const nodeDir = path.dirname(cfg.node);
  env.PATH = [nodeDir, process.env.PATH || process.env.Path || ''].join(path.delimiter);
  return env;
}

function sharedEnv() {
  const web = `http://localhost:${cfg.webPort}`;
  const tenantWeb = `http://${cfg.slug}.localhost:${cfg.webPort}`;
  return {
    NODE_ENV: 'development',
    DATABASE_URL: targetUrl(),
    TENANT_BASE_DOMAIN: 'localhost',
    NEXT_PUBLIC_WEB_ROOT_DOMAIN: 'localhost',
    DEMO_USER_PASSWORD: cfg.password,
    DEMO_TENANT_SLUG: cfg.slug,
    API_BASE_URL: `http://localhost:${cfg.apiPort}/api`,
    API_ORIGIN: `http://localhost:${cfg.apiPort}`,
    NEXT_PUBLIC_API_BASE_URL: `http://localhost:${cfg.apiPort}/api`,
    API_INTERNAL_URL: `http://127.0.0.1:${cfg.apiPort}/api`,
    WEB_APP_URL: web,
    CORS_ALLOWED_ORIGINS: [tenantWeb, web, `http://127.0.0.1:${cfg.webPort}`].join(','),
    NEXT_TELEMETRY_DISABLED: '1',
  };
}

function runStep(name, args, cwd, env) {
  const logFile = path.join(cfg.stackDir, `${name}.log`);
  const fd = openSync(logFile, 'w');
  log(`${name} ...`);
  const r = spawnSync(cfg.node, args, { cwd, env, stdio: ['ignore', fd, fd] });
  if (r.status !== 0) die(`${name} exited ${r.status}; see ${logFile}`);
}

function startDetached(name, args, cwd, env) {
  const out = openSync(path.join(cfg.stackDir, `${name}.log`), 'w');
  const child = spawn(cfg.node, args, { cwd, env, detached: true, windowsHide: true, stdio: ['ignore', out, out] });
  child.unref();
  const pids = readJson(PID_FILE) || {};
  pids[name] = child.pid;
  writeFileSync(PID_FILE, JSON.stringify(pids, null, 2));
  return child.pid;
}

function httpGet(port, pathname, hostHeader) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port, path: pathname, method: 'GET', headers: hostHeader ? { Host: hostHeader } : {}, timeout: 120000 },
      (res) => {
        let body = '';
        res.on('data', (d) => { if (body.length < 20000) body += d; });
        res.on('end', () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '' }); });
    req.on('error', () => resolve({ status: 0, body: '' }));
    req.end();
  });
}

async function waitFor(label, probe, timeoutMs) {
  const t0 = Date.now();
  for (;;) {
    const r = await probe();
    if (r) return r;
    if (Date.now() - t0 > timeoutMs) die(`${label} did not become ready within ${Math.round(timeoutMs / 1000)}s`);
    await new Promise((r2) => setTimeout(r2, 2000));
  }
}

/* ------------------------------------------------------------------- up */

async function ensureDatabase() {
  assertThrowawayName(cfg.dbName);
  const admin = adminUrl();
  log(`admin connection ${mask(admin)}`);
  await withDb(admin, async (c) => {
    const have = await c.query('select 1 from pg_database where datname = $1', [cfg.dbName]);
    if (have.rowCount) log(`database ${cfg.dbName} exists`);
    else {
      await c.query(`CREATE DATABASE "${cfg.dbName}" ENCODING 'UTF8' TEMPLATE template0`);
      log(`created database ${cfg.dbName}`);
    }
  });
  return verifyIdentity();
}

async function ensureWorkspaceHosts() {
  const host = `${cfg.slug}.localhost`;
  return withDb(targetUrl(), async (c) => {
    const t = await c.query('select id from "Tenant" where slug = $1', [cfg.slug]);
    if (!t.rows[0]) die(`tenant ${cfg.slug} is not in ${cfg.dbName} after seed-demo.`);
    const have = await c.query('select id from "TenantDomain" where domain = $1', [host]);
    if (have.rows[0]) return `${host} (already present)`;
    await c.query(
      `insert into "TenantDomain" (id, "tenantId", domain, type, "isPrimary", "verificationStatus", "verifiedAt", "updatedAt")
       values ($1, $2, $3, 'SYSTEM_SUBDOMAIN', true, 'VERIFIED', now(), now())`,
      [randomUUID(), t.rows[0].id, host],
    );
    return `${host} (inserted)`;
  });
}

/**
 * seed-demo leaves the tenant with no Subscription, so every entitlement-gated
 * module (Work Management included) answers "not part of your current
 * subscription". Give it an ACTIVE subscription on GUI_PLAN (default enterprise)
 * unless it already has one. Throwaway database only (guarded by verifyIdentity).
 */
async function ensureSubscription() {
  const plan = process.env.GUI_PLAN?.trim() || 'enterprise';
  return withDb(targetUrl(), async (c) => {
    const t = await c.query('select id from "Tenant" where slug = $1', [cfg.slug]);
    const have = await c.query('select id from "Subscription" where "tenantId" = $1', [t.rows[0].id]);
    if (have.rows[0]) return 'subscription already present';
    const p = await c.query('select id from "Plan" where key = $1', [plan]);
    if (!p.rows[0]) die(`plan ${plan} not found after seed-config`);
    await c.query(
      `insert into "Subscription" (id, "tenantId", "planId", status, "startDate", "updatedAt")
       values ($1, $2, $3, 'ACTIVE', now(), now())`,
      [randomUUID(), t.rows[0].id, p.rows[0].id],
    );
    return `ACTIVE subscription on plan ${plan} inserted`;
  });
}

async function checkRoleUsers() {
  return withDb(targetUrl(), async (c) => {
    const missing = [];
    for (const [role, email] of Object.entries(ROLE_USERS)) {
      const r = await c.query(
        `select u.status, (select count(*) from "UserRole" ur where ur."userId" = u.id) as roles
           from "User" u join "Tenant" t on t.id = u."tenantId" where t.slug = $1 and u.email = $2`,
        [cfg.slug, email],
      );
      if (!r.rows[0] || Number(r.rows[0].roles) === 0) missing.push(`${role} (${email})`);
    }
    return missing;
  });
}

async function up(flags) {
  mkdirSync(cfg.stackDir, { recursive: true });
  const state = readJson(STATE_FILE);
  const pids = readJson(PID_FILE) || {};
  if ((pids.api && isOurNode(pids.api)) || (pids.web && isOurNode(pids.web))) {
    log('a stack is already running (pid file). Run `down` first, or `status`.');
    return status();
  }
  for (const [n, p] of [['api', cfg.apiPort], ['web', cfg.webPort]]) {
    if (await portBusy(p)) die(`port ${p} (${n}) is already in use by something not in the pid file; not touching it.`);
  }

  const identity = await ensureDatabase();
  const env = childEnv(sharedEnv());

  const prismaEntry = apiRequire.resolve('prisma/build/index.js');
  runStep('migrate', [prismaEntry, 'migrate', 'deploy', '--config', 'prisma.config.ts'], API_DIR, env);
  const seedEnv = { ...env, TS_NODE_TRANSPILE_ONLY: 'true' };
  const tsNode = ['-r', 'ts-node/register/transpile-only'];
  runStep('seed-config', [...tsNode, 'prisma/seed-config.ts'], API_DIR, seedEnv);
  const seeded = await withDb(targetUrl(), async (c) => (await c.query('select 1 from "Tenant" where slug = $1', [cfg.slug])).rowCount);
  if (!seeded || flags.has('--reseed')) runStep('seed-demo', [...tsNode, 'prisma/seed-demo.ts'], API_DIR, seedEnv);
  else log(`tenant ${cfg.slug} already seeded (use --reseed to rerun seed-demo)`);

  const hosts = await ensureWorkspaceHosts();
  log(`workspace host: ${hosts}`);
  log(await ensureSubscription());
  const missing = await checkRoleUsers();
  if (missing.length) die(`role users missing or without roles after seed-demo: ${missing.join(', ')}`);

  writeFileSync(PID_FILE, '{}');
  const apiPid = startDetached('api', [...tsNode, '-r', 'tsconfig-paths/register', 'src/main.ts'], API_DIR, { ...env, PORT: String(cfg.apiPort), TS_NODE_TRANSPILE_ONLY: 'true' });
  log(`api pid ${apiPid} (port ${cfg.apiPort})`);
  const nextBin = webRequire.resolve('next/dist/bin/next');
  const webPid = startDetached('web', [nextBin, 'dev', '-p', String(cfg.webPort)], WEB_DIR, { ...env, PORT: String(cfg.webPort) });
  log(`web pid ${webPid} (port ${cfg.webPort})`);

  writeFileSync(STATE_FILE, JSON.stringify({ db: cfg.dbName, encoding: identity.encoding, apiPort: cfg.apiPort, webPort: cfg.webPort, slug: cfg.slug, startedAt: new Date().toISOString() }, null, 2));

  await waitFor('API /api/health', async () => ((await httpGet(cfg.apiPort, '/api/health')).status === 200 ? true : null), 240000);
  log('api healthy');
  const hostHeader = `${cfg.slug}.localhost:${cfg.webPort}`;
  for (const p of ['/login', '/api/auth/me']) {
    await waitFor(`web ${p}`, async () => {
      const r = await httpGet(cfg.webPort, p, hostHeader);
      return r.status > 0 && r.status < 500 ? r : null;
    }, 300000);
  }
  const login = await httpGet(cfg.webPort, '/login', hostHeader);
  if (/could not find this company portal/i.test(login.body)) die('web answers "could not find this company portal": workspace host rows are not resolving.');
  log('web tenant page responds');

  // Re-prove the identity at the very end, from the live database.
  const final = await verifyIdentity();
  log(`DATABASE IDENTITY VERIFIED: ${final.db} encoding=${final.encoding} (throwaway name rule _gui/_e2e satisfied)`);
  log(`stack up. env lines: node scripts/work-gui-stack.mjs env --export   logs: ${cfg.stackDir}`);
  void state;
}

/* ------------------------------------------------------------ down/status/env */

function down() {
  const pids = readJson(PID_FILE);
  if (!pids || !Object.keys(pids).length) return log('no pid file entries; nothing to stop.');
  for (const [name, pid] of Object.entries(pids)) {
    if (!isOurNode(pid)) { log(`${name} pid ${pid} not running (or not node); skipped`); continue; }
    const r = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { encoding: 'utf8' });
    log(`${name} pid ${pid}: ${r.status === 0 ? 'stopped' : `taskkill exit ${r.status} ${r.stderr || ''}`.trim()}`);
  }
  try { rmSync(PID_FILE, { force: true }); } catch { /* ignore */ }
}

async function status() {
  const pids = readJson(PID_FILE) || {};
  const state = readJson(STATE_FILE);
  for (const [name, port] of [['api', cfg.apiPort], ['web', cfg.webPort]]) {
    log(`${name}: pid ${pids[name] ?? '-'} ${pids[name] && isOurNode(pids[name]) ? 'RUNNING' : 'not running'} port ${port} ${(await portBusy(port)) ? 'listening' : 'free'}`);
  }
  try {
    const id = await verifyIdentity();
    log(`db: ${id.db} encoding=${id.encoding} url=${mask(targetUrl())}`);
  } catch (e) {
    log(`db: not reachable (${e.message})`);
  }
  if (state) log(`state: ${JSON.stringify(state)}`);
  log(`stack dir: ${cfg.stackDir}`);
}

function envLines(exportPrefix) {
  const web = `http://${cfg.slug}.localhost:${cfg.webPort}`;
  const lines = {
    E2E_WEB_URL: web,
    E2E_API_URL: `http://127.0.0.1:${cfg.apiPort}`,
    E2E_DATABASE_URL: targetUrl(),
    E2E_TENANT_SLUG: cfg.slug,
    E2E_TENANT_ROOT_DOMAIN: `localhost:${cfg.webPort}`,
    E2E_WEB_PASSWORD: cfg.password,
    E2E_WEB_EMPLOYEE_EMAIL: ROLE_USERS.employee,
    E2E_WEB_MANAGER_EMAIL: ROLE_USERS.manager,
    E2E_WEB_HR_EMAIL: ROLE_USERS.hr,
    E2E_WEB_CEO_EMAIL: ROLE_USERS.ceo,
    E2E_TENANT_USER_EMAIL: ROLE_USERS.employee,
    E2E_TENANT_USER_PASSWORD: cfg.password,
    E2E_ENSURE_WORKSPACE_HOSTS: '1',
  };
  for (const [k, v] of Object.entries(lines)) console.log(`${exportPrefix ? 'export ' : ''}${k}='${v}'`);
}

const [cmd, ...rest] = process.argv.slice(2);
const flags = new Set(rest);
if (cmd === 'up') await up(flags);
else if (cmd === 'down') down();
else if (cmd === 'status') await status();
else if (cmd === 'env') { assertThrowawayName(cfg.dbName); envLines(flags.has('--export')); }
else die('usage: work-gui-stack.mjs up [--reseed] | down | status | env [--export]');
