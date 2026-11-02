// RUN-008 deployment-safeguard probe (DP-QA-005). LOCAL ONLY: it reads /api/health of the isolated QA API and runs the candidate's own
// `smoke:deployment` against it, then writes a plain-text evidence file. Usage (from the repo root of the QA suite):
//   node e2e/golive/tools/gate-phase.mjs unenforced|enforced
// "unenforced" = the API was started WITHOUT the ENTITLEMENT_ENFORCEMENT_MODE floor on a database with no module-settings row (restart-api.ps1 -NoEnforce).
// "enforced"   = the API was started with ENTITLEMENT_ENFORCEMENT_MODE=ENFORCE (the default restart-api.ps1).
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const phase = process.argv[2];
if (!['unenforced', 'enforced'].includes(phase)) throw new Error('usage: gate-phase.mjs unenforced|enforced');
const env = Object.fromEntries(
  readFileSync(new URL('../../../.env.qa.local', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);
if (!/^http:\/\/localhost:\d+$/.test(env.QA_API_URL)) throw new Error('refusing: QA_API_URL not localhost');
const worktree = env.QA_API_WORKTREE;
const out = [`# RUN-008 deployment gate evidence - phase: ${phase}`, '', `API: ${env.QA_API_URL} (isolated QA stack). Application worktree: ${worktree}`, ''];

const health = await (await fetch(`${env.QA_API_URL}/api/health`)).json();
out.push('## /api/health', '```json', JSON.stringify({ environment: health.environment, entitlementEnforcement: health.entitlementEnforcement }, null, 2), '```', '');

function smoke(label, extra) {
  const r = spawnSync(process.execPath, ['scripts/smoke-deployment.mjs'], {
    cwd: worktree,
    env: { ...process.env, SMOKE_API_BASE_URL: `${env.QA_API_URL}/api`, SMOKE_ORIGIN: env.QA_WEB_URL, SMOKE_LOGIN_EMAIL: env.QA_ADMIN_EMAIL, SMOKE_LOGIN_PASSWORD: env.QA_PASSWORD, ...extra },
    encoding: 'utf8',
    timeout: 120000,
  });
  const text = `${r.stdout}\n${r.stderr}`.replace(/\r/g, '').trim();
  const gateLine = text.split('\n').filter((l) => /entitlement|enforc|Starter/i.test(l));
  out.push(`## smoke:deployment - ${label}`, `exit code: ${r.status}`, '```', ...text.split('\n').map((l) => l.slice(0, 400)), '```', '');
  return { status: r.status, text, gateLine };
}

const plain = smoke('no exception', {});
const allowed = smoke('SMOKE_ALLOW_UNENFORCED=1', { SMOKE_ALLOW_UNENFORCED: '1' });
let starter = null;
if (phase === 'enforced') starter = smoke('with a Starter tenant user (behavioural probe)', { SMOKE_STARTER_LOGIN_EMAIL: env.QA_ADMIN_EMAIL, SMOKE_STARTER_LOGIN_PASSWORD: env.QA_PASSWORD });

const enforcementOk = /^ok - plan entitlements are enforced/m.test(plain.text);
const enforcementNotOk = /^not ok - plan entitlements are enforced/m.test(plain.text);
const summary = [
  `health.enforced = ${health.entitlementEnforcement?.enforced} (mode ${health.entitlementEnforcement?.mode})`,
  `smoke without exception: exit ${plain.status}; enforcement check ${enforcementOk ? 'PASSED' : enforcementNotOk ? 'FAILED' : 'absent'}`,
  `smoke with SMOKE_ALLOW_UNENFORCED=1: exit ${allowed.status}; ${/allowed by SMOKE_ALLOW_UNENFORCED/.test(allowed.text) ? 'printed the explicit warning' : 'no warning printed'}; enforcement check ${/^ok - plan entitlements are enforced/m.test(allowed.text) ? 'PASSED' : 'FAILED'}`,
];
if (starter) summary.push(`smoke Starter behavioural probe: ${/^ok - a Starter tenant is refused/m.test(starter.text) ? 'PASSED' : /^not ok - a Starter tenant/m.test(starter.text) ? 'FAILED' : 'not reported'}`);
out.push('## Summary', ...summary.map((s) => `- ${s}`), '');
const file = new URL(`../../../docs/qa/go-live/evidence/RUN008-gate-${phase}.md`, import.meta.url);
writeFileSync(file, out.join('\n'));
console.log(summary.join('\n'));
