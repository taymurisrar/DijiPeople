#!/usr/bin/env node
/*
 * Structural validation of the AI engineering framework.
 *
 * Deliberately lightweight: it checks that the framework is *present and
 * internally consistent*, not that its prose is correct. It needs no
 * dependencies, so it is the fastest signal in CI that something is
 * structurally wrong.
 *
 * It exists because the framework's own failure mode has twice been a file
 * that referenced something which did not exist — a context document naming a
 * missing source file, or an agent role pointing at a context file that was
 * never committed.
 *
 *   node scripts/validate-framework.mjs
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const failures = [];
const warnings = [];
let checks = 0;

function check(description, condition, detail = '') {
  checks += 1;
  if (!condition) failures.push(detail ? `${description} — ${detail}` : description);
}

function warn(description) {
  warnings.push(description);
}

function read(relativePath) {
  return readFileSync(join(ROOT, relativePath), 'utf8');
}

function markdownFilesIn(relativeDir) {
  const dir = join(ROOT, relativeDir);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...markdownFilesIn(join(relativeDir, entry)));
    else if (entry.endsWith('.md')) out.push(join(relativeDir, entry).replace(/\\/g, '/'));
  }
  return out;
}

// ---------------------------------------------------------------- agent roles

const REQUIRED_AGENTS = [
  'architect',
  'backend-api',
  'frontend',
  'ui-ux',
  'database',
  'integration',
  'qa',
  'reviewer',
  'integrator',
  'release-devops',
];

for (const agent of REQUIRED_AGENTS) {
  const path = `.agent/agents/${agent}.md`;
  const exists = existsSync(join(ROOT, path));
  check(`agent role present: ${agent}`, exists, path);

  if (!exists) continue;

  const body = read(path);
  check(`${agent} declares Required Context`, body.includes('## Required Context'));
  check(`${agent} declares a Staleness Rule`, body.includes('Staleness Rule'));
}

// The generic implementer role was superseded by the five specialists. A merge
// resurrected it once already; this stops that recurring silently.
check(
  'superseded implementer.md is absent',
  !existsSync(join(ROOT, '.agent/agents/implementer.md')),
  'delete it — superseded by the specialist roles',
);

// ------------------------------------------------------- context layer wiring

const CONTEXT_DIR = '.agent/context';
check('context layer exists', existsSync(join(ROOT, CONTEXT_DIR)));

for (const file of markdownFilesIn(CONTEXT_DIR)) {
  if (file.endsWith('README.md')) continue;
  const body = read(file);
  check(`${file} records Last verified`, body.includes('**Last verified:**'));
  check(`${file} records Verified against commit`, body.includes('**Verified against commit:**'));
  if (!body.includes('## CURRENT')) warn(`${file} has no explicit CURRENT section`);
}

// Every .agent/context reference inside an agent role must resolve.
for (const file of markdownFilesIn('.agent/agents')) {
  const body = read(file);
  for (const match of body.matchAll(/\.agent\/context\/([a-z0-9-]+\.md)/g)) {
    check(
      `${file} references an existing context file`,
      existsSync(join(ROOT, CONTEXT_DIR, match[1])),
      `missing ${match[1]}`,
    );
  }
}

// -------------------------------------------------------------- QA + knowledge

const REQUIRED_PATHS = [
  'AGENTS.md',
  'PLANS.md',
  'CLAUDE.md',
  '.agent/agents/README.md',
  '.agent/skills/README.md',
  'docs/qa/README.md',
  'docs/qa/runs',
  'docs/qa/regressions/index.md',
  'docs/qa/known-bug-patterns/README.md',
  'docs/qa/test-strategy/qa-run-template.md',
  'docs/knowledge/README.md',
  'docs/deployment/README.md',
  'docs/deployment/readiness-checklist.md',
  'docs/deployment/deployment-runbook.md',
  'docs/deployment/rollback-runbook.md',
  'docs/deployment/smoke-tests.md',
  'docs/development/agent-orchestration.md',
  'docs/development/git-worktrees.md',
  'docs/development/obsidian-workflow.md',
  'scripts/sync-obsidian.mjs',
  'scripts/new-qa-run.mjs',
  '.obsidian-sync.example.json',
];

for (const path of REQUIRED_PATHS) {
  check(`required path present: ${path}`, existsSync(join(ROOT, path)));
}

// At least one bug pattern beyond the index, or the prevention system is empty.
const patterns = markdownFilesIn('docs/qa/known-bug-patterns').filter(
  (f) => !f.endsWith('README.md'),
);
check('known bug patterns exist', patterns.length > 0, `found ${patterns.length}`);

// ------------------------------------------------------------------- secrets

/*
 * The file existing locally is normal and desired — that is how a developer
 * enables Obsidian sync. What must never happen is it being *tracked*, because
 * it holds a personal absolute path. Check tracking, not existence.
 */
function isTrackedByGit(relativePath) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', relativePath], {
      cwd: ROOT,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

check(
  'local Obsidian config is not tracked by git',
  !isTrackedByGit('.obsidian-sync.local.json'),
  'it holds a personal path — keep it gitignored',
);

check(
  '.gitignore covers the local Obsidian config',
  read('.gitignore').includes('.obsidian-sync.local.json'),
);

// The committed example must never carry a real path or credential.
if (existsSync(join(ROOT, '.obsidian-sync.example.json'))) {
  const example = read('.obsidian-sync.example.json');
  check(
    'example Obsidian config uses a placeholder vaultPath',
    example.includes('<') || !/"vaultPath"\s*:\s*"[A-Za-z]:[\\/]/.test(example),
    'looks like a real absolute path',
  );
}

// Cheap scan for obvious committed credentials in framework-owned files. Not a
// secret scanner — just a guard against the most common accident.
const CREDENTIAL_PATTERN =
  /postgres(?:ql)?:\/\/(?!ci:ci@|placeholder|user:password|<)[^\s"']{6,}/i;

for (const file of [
  ...markdownFilesIn('docs/deployment'),
  ...markdownFilesIn('.agent'),
  '.obsidian-sync.example.json',
]) {
  if (!existsSync(join(ROOT, file))) continue;
  if (CREDENTIAL_PATTERN.test(read(file))) {
    failures.push(`possible committed connection string in ${file}`);
    checks += 1;
  }
}

// -------------------------------------------------------------- script syntax

for (const script of ['scripts/sync-obsidian.mjs', 'scripts/new-qa-run.mjs']) {
  if (!existsSync(join(ROOT, script))) continue;
  const body = read(script);
  // Cheap structural sanity: these are ES modules and must not have been
  // truncated. Full parsing happens when CI actually runs them.
  check(`${script} is an ES module`, body.includes('import '));
  check(`${script} is not truncated`, body.trimEnd().length > 200);
}

// ------------------------------------------------------------------- reporting

if (warnings.length) {
  console.log('Warnings (non-blocking):');
  for (const warning of warnings) console.log(`  ! ${warning}`);
  console.log('');
}

if (failures.length) {
  console.error(`Framework validation FAILED — ${failures.length} of ${checks} checks:`);
  for (const failure of failures) console.error(`  x ${failure}`);
  process.exit(1);
}

console.log(`Framework validation passed — ${checks} checks.`);
