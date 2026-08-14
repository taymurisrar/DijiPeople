#!/usr/bin/env node
/*
 * Scaffold a QA run file with its metadata already filled in.
 *
 * The value here is not saving typing — it is that branch, commit and worktree
 * are captured from git rather than remembered. A QA run without a commit is
 * not reproducible, and therefore is not evidence.
 *
 *   node scripts/new-qa-run.mjs <feature-slug>
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = join(REPO_ROOT, 'docs/qa/test-strategy/qa-run-template.md');

const slug = process.argv[2];

if (!slug) {
  console.error('Usage: node scripts/new-qa-run.mjs <feature-slug>');
  console.error('Example: node scripts/new-qa-run.mjs compensation-authorization');
  process.exit(1);
}

function git(command, fallback) {
  try {
    return execSync(`git ${command}`, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

const branch = git('rev-parse --abbrev-ref HEAD', 'unknown');
const sha = git('rev-parse HEAD', 'unknown');
const shortSha = sha.slice(0, 7);
const now = new Date();
const date = now.toISOString().slice(0, 10);

const target = join(REPO_ROOT, 'docs/qa/runs', `${date}-${slug}-${shortSha}.md`);

if (existsSync(target)) {
  console.error(`Already exists: ${target}`);
  console.error('A run is a historical record — create a new one rather than editing it.');
  process.exit(1);
}

if (!existsSync(TEMPLATE)) {
  console.error(`Template missing: ${TEMPLATE}`);
  process.exit(1);
}

const dirty = git('status --porcelain', '');
const template = readFileSync(TEMPLATE, 'utf8');

const body = template
  .replace('# QA Run — <feature or change>', `# QA Run — ${slug}`)
  .replace(
    /\| Date \/ time \| \|/,
    `| Date / time | ${now.toISOString()} |`,
  )
  .replace(/\| Branch \| \|/, `| Branch | \`${branch}\` |`)
  .replace(/\| Commit SHA \| \|/, `| Commit SHA | \`${sha}\` |`)
  .replace(/\| Worktree \| \|/, `| Worktree | \`${REPO_ROOT}\` |`)
  .replace(
    /\| Environment \| local \/ worktree; DB available\? external services available\? \|/,
    `| Environment | working tree ${dirty ? 'DIRTY — record why' : 'clean'}; DB availability: TODO; external services: TODO |`,
  );

// The template's own usage note is guidance for the author, not part of a run.
const cleaned = body.replace(/^> Copy to[\s\S]*?section is not considered"\.\n\n/m, '');

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, cleaned);

console.log(`Created ${target.replace(REPO_ROOT, '.')}`);
console.log(`  branch ${branch} @ ${shortSha}`);
if (dirty) {
  console.log('  NOTE: working tree is dirty — state in the run what was uncommitted.');
}
