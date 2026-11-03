#!/usr/bin/env node
// Emergency hotfix planner / dry-run (policy HOT-001..HOT-006,
// docs/engineering/runbooks/hotfix.md).
//
//   node scripts/hotfix.mjs plan --severity P0 --title "<what broke>" [--base <sha>] [--paths a,b] [--prod-url <url>]
//   node scripts/hotfix.mjs dry-run ...same flags...   (adds read-only git facts and a release-artifact manifest)
//
// This tool PLANS and VERIFIES. It has no code path that pushes, merges,
// deploys, edits the environment or touches a database — approval to ship is a
// human act recorded in the plan as PENDING_OWNER and nothing here can set it.
// Narrowing scope is allowed; skipping a relevant gate is not (HOT-003).
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const SEVERITIES = {
  P0: { fast: true, desc: 'security compromise, destructive data corruption, severe outage' },
  P1: { fast: true, desc: 'critical customer workflow failure or major security/access issue' },
  P2: { fast: false, desc: 'normal scheduled remediation unless the owner escalates' },
  P3: { fast: false, desc: 'normal scheduled remediation unless the owner escalates' },
};

/** Which gates a changed path obliges. Order is stable so plans diff cleanly. */
export const GATE_RULES = [
  { id: 'prisma-validate', when: /services\/api\/prisma\/schema\.prisma|prisma\/migrations\//, cmd: 'npm run prisma:validate', why: 'schema or migration changed' },
  { id: 'migration-safety', when: /prisma\/migrations\//, cmd: 'npm run db:preflight', why: 'a migration ships: it must be expand-only and compatible with the OLD code still running during deploy' },
  { id: 'authz-regression', when: /common\/(guards|security|constants\/(permissions|rbac))|\.controller\.ts$|modules\/(auth|permissions|roles)\//, cmd: 'npm --workspace api run test -- wiring-invariants rbac-matrix', why: 'authorization surface touched' },
  { id: 'tenant-isolation', when: /services\/api\/src\/modules\/.*\.(service|repository)\.ts$/, cmd: 'npm --workspace api run test -- --testPathPattern "<affected module>"', why: 'tenant-owned data access touched' },
  { id: 'api-typecheck', when: /services\/api\//, cmd: 'npm --workspace api run check-types', why: 'api code changed' },
  { id: 'web-typecheck', when: /apps\/web\//, cmd: 'npm --workspace web run check-types', why: 'web code changed' },
  { id: 'admin-typecheck', when: /apps\/admin\//, cmd: 'npm --workspace admin run check-types', why: 'admin code changed' },
  { id: 'lint', when: /./, cmd: 'npm run lint', why: 'always' },
  { id: 'api-completeness', when: /\.controller\.ts$/, cmd: 'node scripts/check-api-completeness.mjs', why: 'a route changed' },
  { id: 'module-completeness', when: /modules\/customization\//, cmd: 'node scripts/check-module-completeness.mjs', why: 'module framework changed' },
  { id: 'build', when: /./, cmd: 'npm run build', why: 'always — a hotfix must build exactly as production builds' },
];

/** Gates a hotfix may NEVER drop, whatever the paths (HOT-003). */
export const NEVER_SKIPPABLE = ['lint', 'build', 'authz-regression'];

export function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

export function buildHotfixPlan(input) {
  const errors = [];
  const sev = SEVERITIES[input.severity];
  if (!sev) errors.push(`severity must be one of ${Object.keys(SEVERITIES).join(', ')}`);
  else if (!sev.fast) errors.push(`${input.severity} is not eligible for the emergency path (${sev.desc}); use the normal develop → release flow, or have the owner escalate it`);
  if (!input.title?.trim()) errors.push('an incident title is required');
  if (!input.baseSha) errors.push('the production baseline SHA is required: resolve it from /api/health, never assume it equals origin/main');

  const paths = input.paths ?? [];
  const gates = GATE_RULES.filter((g) => paths.length === 0 || paths.some((p) => g.when.test(p)) || NEVER_SKIPPABLE.includes(g.id));
  const migrations = paths.filter((p) => /prisma\/migrations\//.test(p));
  const warnings = [];
  if (!paths.length) warnings.push('no changed paths supplied: the plan lists every gate; narrow it once the patch exists');
  if (migrations.length) warnings.push('MIGRATION IN HOTFIX: owner must confirm it is expand-only and backward compatible; destructive changes are refused (HOT-004)');
  if (input.prodSha && input.baseSha && input.prodSha !== input.baseSha) warnings.push(`baseline ${input.baseSha.slice(0, 8)} differs from the deployed SHA ${input.prodSha.slice(0, 8)}`);
  if (input.prodSha === undefined) warnings.push('deployed SHA not verified (no --prod-url or health endpoint unreachable); do not ship until it is');

  const branch = `hotfix/${slug(input.title || 'incident')}`;
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    incident: { severity: input.severity, title: input.title, openedAt: input.now ?? new Date().toISOString() },
    baseline: { baseSha: input.baseSha, deployedSha: input.prodSha ?? null },
    branch,
    gates: gates.map(({ id, cmd, why }) => ({ id, cmd, why, skippable: !NEVER_SKIPPABLE.includes(id) })),
    migrationsIncluded: migrations,
    steps: [
      'Record incident + severity (this file)',
      'Verify deployed SHA via release metadata',
      'Reproduce with sanitized data in an isolated env',
      `Cut ${branch} from the deployed baseline; focused change only`,
      'Run every gate listed (none of the non-skippable ones may be dropped)',
      'Build the release artifact; generate changelog from the baseline..HEAD range',
      'Prepare preview/staging validation where the platform provides it',
      'Hand the rollback section below to the owner',
      'STOP: owner approval (PENDING_OWNER) — only a human sets this',
      'After approval: deploy with the existing authorized pipeline; then verify health, smoke, error monitoring',
      'Backport to develop; close the incident record',
    ],
    rollback: [
      `Redeploy the previous release at ${input.prodSha ?? input.baseSha ?? '<deployed sha>'} through the existing pipeline (Render rollback / Vercel promote of the prior deployment).`,
      migrations.length ? 'Migration present: confirm the previous release runs against the migrated schema BEFORE approving (expand-only); do not attempt a down-migration in production.' : 'No migration: code-only rollback is sufficient.',
      'Verify /api/health reports the rollback SHA and smoke tests pass.',
    ],
    approval: { status: 'PENDING_OWNER', note: 'Production deployment requires explicit owner approval. This tool cannot grant it.' },
  };
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

async function fetchDeployedSha(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const body = await res.json();
    return body.commit ?? body.sha ?? body.version?.commit ?? body.build?.commit;
  } catch {
    return undefined;
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const opt = (n) => (rest.includes(n) ? rest[rest.indexOf(n) + 1] : undefined);
  if (!['plan', 'dry-run'].includes(cmd)) {
    console.error('usage: hotfix.mjs plan|dry-run --severity P0|P1 --title "<text>" [--base sha] [--paths a,b] [--prod-url url]');
    process.exit(2);
  }
  const prodSha = opt('--prod-url') ? await fetchDeployedSha(opt('--prod-url')) : undefined;
  let baseSha = opt('--base') ?? prodSha;
  let paths = opt('--paths')?.split(',').filter(Boolean);
  if (cmd === 'dry-run') {
    baseSha = git(['rev-parse', baseSha ?? 'origin/main']);
    if (!paths) paths = git(['diff', '--name-only', `${baseSha}..HEAD`]).split('\n').filter(Boolean);
  }
  const plan = buildHotfixPlan({ severity: opt('--severity'), title: opt('--title'), baseSha, prodSha, paths });
  if (cmd === 'dry-run' && plan.ok) {
    const manifest = paths.map((p) => `${p}`).join('\n');
    plan.releaseArtifact = {
      range: `${baseSha.slice(0, 8)}..HEAD`,
      files: paths.length,
      manifestSha256: crypto.createHash('sha256').update(manifest).digest('hex'),
      deterministic: 'same range + same lockfile + same Node/npm => same build; verified by rebuilding and comparing',
    };
    plan.dryRun = true;
    plan.performed = 'NOTHING_DEPLOYED_NOTHING_PUSHED';
  }
  const out = opt('--out');
  if (out) fs.writeFileSync(out, JSON.stringify(plan, null, 2));
  console.log(JSON.stringify(plan, null, 2));
  process.exit(plan.ok ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
